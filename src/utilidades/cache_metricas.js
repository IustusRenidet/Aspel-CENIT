'use strict';

/**
 * src/utilidades/cache_metricas.js
 *
 * Caché de resultados de métricas de dos niveles:
 *   L1 — Map en memoria, rápido, volátil (se pierde al reiniciar).
 *   L2 — DuckDB persistente (src/almacenamiento/duckdb/indice.js).
 *
 * Flujo de lectura:  L1 → L2 → miss
 * Flujo de escritura: L1 + L2 (en paralelo)
 *
 * API pública:
 *   cache.get(key)          → { resultado, desde, hits } | null
 *   cache.set(key, payload) → void
 *   cache.del(key)          → void
 *   cache.flush()           → void (vacía L1 y L2)
 *   cache.stats()           → objeto con telemetría
 *   cache.buildKey(mId, p)  → string determinista
 *   cache.startCleanup()    → arranca limpieza periódica
 *   cache.stopCleanup()     → detiene limpieza periódica
 */

const duckindice = require('../almacenamiento/duckdb/indice');

// ─── Configuración ────────────────────────────────────────────────────────────

const TTL_DEFAULT_S = Number(process.env.CACHE_TTL_S) || 3600;  // 1 h
const MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES) || 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // limpiar expirados c/ 5 min

// ─── Estado L1 ────────────────────────────────────────────────────────────────

/** @type {Map<string, {resultado:object, expira:number, creadoEn:number, hits:number, metrica_id:string, sistema:string|null}>} */
const l1 = new Map();

let l1Hits = 0;
let l1Misses = 0;
let l2Hits = 0;
let l2Misses = 0;
let setsTotal = 0;
let evictions = 0;

/** @type {NodeJS.Timeout|null} */
let cleanupTimer = null;

// ─── Construcción de cache key ────────────────────────────────────────────────

/**
 * Genera una clave determinista para la caché.
 * Incluye: metrica_id · fecha UTC (YYYYMMDD) · parámetros ordenados.
 *
 * @param {string} metricaId
 * @param {object} parametros  — objeto de filtros/parámetros de la consulta
 * @param {string} [fecha]     — override de fecha (YYYYMMDD). Default: hoy UTC
 * @returns {string}
 */
function buildKey(metricaId, parametros = {}, fecha = null) {
    const fechaStr = fecha || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const paramsStr = sortedJson(parametros);
    return `${metricaId}:${fechaStr}:${paramsStr}`;
}

function sortedJson(obj) {
    if (!obj || typeof obj !== 'object') return '{}';
    const sorted = {};
    for (const k of Object.keys(obj).sort()) {
        sorted[k] = obj[k];
    }
    return JSON.stringify(sorted);
}

// ─── Helpers L1 ──────────────────────────────────────────────────────────────

function l1Get(key) {
    const entry = l1.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expira) {
        l1.delete(key);
        return null;
    }
    entry.hits++;
    return entry;
}

function l1Set(key, payload) {
    // Evicción LRU-simple: si supera MAX_ENTRIES, eliminar entrada más antigua
    if (l1.size >= MAX_ENTRIES) {
        const oldest = l1.keys().next().value;
        if (oldest !== undefined) {
            l1.delete(oldest);
            evictions++;
        }
    }

    const { resultado, ttl = TTL_DEFAULT_S, metrica_id = '', sistema = null } = payload;
    l1.set(key, {
        resultado,
        expira: Date.now() + ttl * 1000,
        creadoEn: Date.now(),
        hits: 0,
        metrica_id,
        sistema
    });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Obtiene un resultado del caché (L1 → L2).
 * @param {string} key
 * @returns {Promise<{resultado:object, desde:'l1'|'l2', hits:number}|null>}
 */
async function get(key) {
    // L1
    const l1entry = l1Get(key);
    if (l1entry) {
        l1Hits++;
        return { resultado: l1entry.resultado, desde: 'l1', hits: l1entry.hits };
    }
    l1Misses++;

    // L2 — DuckDB
    try {
        const l2entry = await duckindice.buscar(key);
        if (l2entry) {
            l2Hits++;
            // Calentar L1 desde L2
            l1Set(key, {
                resultado: l2entry.resultado,
                ttl: TTL_DEFAULT_S,
                metrica_id: l2entry.resultado?.metrica_id || '',
                sistema: l2entry.resultado?.sistema || null
            });
            return { resultado: l2entry.resultado, desde: 'l2', hits: l2entry.hits };
        }
    } catch (_) { /* degradación silenciosa */ }

    l2Misses++;
    return null;
}

/**
 * Guarda un resultado en L1 y L2.
 * @param {string} key
 * @param {object} payload  { resultado, ttl?, metrica_id?, sistema?, parametros?, origen? }
 */
async function set(key, payload = {}) {
    setsTotal++;
    const { resultado, ttl = TTL_DEFAULT_S, metrica_id = '', sistema = null, parametros = {}, origen = 'firebird' } = payload;

    l1Set(key, { resultado, ttl, metrica_id, sistema });

    // L2 de forma no bloqueante
    duckindice.guardar(key, { metrica_id, sistema, parametros, resultado, ttl, origen }).catch(() => { });
}

/**
 * Elimina una entrada específica de L1 (la L2 expirará sola o se limpiará manualmente).
 * @param {string} key
 */
function del(key) {
    l1.delete(key);
}

/**
 * Vacía completamente L1 y L2.
 */
async function flush() {
    l1.clear();
    l1Hits = l1Misses = l2Hits = l2Misses = setsTotal = evictions = 0;
    try {
        await duckindice.limpiarTodo();
    } catch (_) { /* silencioso */ }
}

/**
 * Retorna estadísticas del sistema de caché.
 * @returns {Promise<object>}
 */
async function stats() {
    const ahora = Date.now();
    let vigentesL1 = 0;
    let expiradosL1 = 0;

    for (const [, e] of l1) {
        if (ahora <= e.expira) vigentesL1++;
        else expiradosL1++;
    }

    const hitRateL1 = (l1Hits + l1Misses) > 0
        ? ((l1Hits / (l1Hits + l1Misses)) * 100).toFixed(1) + '%'
        : 'N/A';

    const statsL2 = await duckindice.obtenerStats().catch(() => ({ disponible: false }));
    const topL2 = await duckindice.topHits(5).catch(() => []);

    return {
        l1: {
            total: l1.size,
            vigentes: vigentesL1,
            expirados: expiradosL1,
            hits: l1Hits,
            misses: l1Misses,
            hit_rate: hitRateL1,
            evictions,
            max_entries: MAX_ENTRIES
        },
        l2: statsL2,
        global: {
            sets_total: setsTotal,
            l2_hits: l2Hits,
            l2_misses: l2Misses,
            ttl_default_s: TTL_DEFAULT_S,
            top_5_hits_l2: topL2.map(r => ({
                metrica_id: r.metrica_id,
                sistema: r.sistema,
                hits: r.hits
            }))
        }
    };
}

// ─── Limpieza periódica ───────────────────────────────────────────────────────

function limpiarL1Expirados() {
    const ahora = Date.now();
    for (const [key, entry] of l1) {
        if (ahora > entry.expira) l1.delete(key);
    }
    // Lanzar limpieza en L2 de forma no-bloqueante
    duckindice.limpiarExpirados().catch(() => { });
}

function startCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(limpiarL1Expirados, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref(); // no impedir cierre del proceso
}

function stopCleanup() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
}

// Arrancar limpieza automáticamente al cargar el módulo
startCleanup();

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    get,
    set,
    del,
    flush,
    stats,
    buildKey,
    startCleanup,
    stopCleanup,
    /** Acceso directo a L1 (solo lectura, para testing) */
    get _l1() { return l1; },
    TTL_DEFAULT_S
};
