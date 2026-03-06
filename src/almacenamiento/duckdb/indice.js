'use strict';

/**
 * src/almacenamiento/duckdb/indice.js
 *
 * Caché analítica persistente usando DuckDB como almacenamiento L2.
 * Actúa como respaldo de la caché en memoria (cache_metricas.js).
 * Los resultados de métricas se serializan como JSON y se almacenan
 * en una tabla DuckDB para recuperación después de reinicios del servidor.
 */

const path = require('path');
const fs = require('fs-extra');

// ─── Intentar cargar DuckDB (graceful degradation) ───────────────────────────
let duckdb;
try {
    duckdb = require('duckdb');
} catch (_) {
    duckdb = null;
}

const DB_DIR = path.resolve(process.cwd(), 'config');
const DB_PATH = path.join(DB_DIR, 'cenit_cache.duckdb');

/** @type {import('duckdb').Database|null} */
let db = null;
/** @type {import('duckdb').Connection|null} */
let conn = null;
let inicializado = false;

// ─── Helpers promisificados ───────────────────────────────────────────────────

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        conn.run(sql, ...params, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        conn.all(sql, ...params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// ─── Inicialización ───────────────────────────────────────────────────────────

async function init() {
    if (inicializado) return;
    if (!duckdb) {
        console.warn('[duckdb/indice] DuckDB no disponible — caché L2 desactivada.');
        inicializado = true;
        return;
    }

    try {
        await fs.ensureDir(DB_DIR);
        db = new duckdb.Database(DB_PATH);
        conn = db.connect();

        await run(`
      CREATE TABLE IF NOT EXISTS cache_metricas (
        cache_key      VARCHAR PRIMARY KEY,
        metrica_id     VARCHAR NOT NULL,
        sistema        VARCHAR,
        parametros     VARCHAR,
        resultado      VARCHAR NOT NULL,
        creado_en      TIMESTAMP DEFAULT current_timestamp,
        expira_en      TIMESTAMP,
        ttl_segundos   INTEGER DEFAULT 3600,
        hits           INTEGER DEFAULT 0,
        origen         VARCHAR DEFAULT 'firebird'
      )
    `);

        await run(`CREATE INDEX IF NOT EXISTS idx_cm_metrica ON cache_metricas (metrica_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_cm_expira  ON cache_metricas (expira_en)`);

        inicializado = true;
        console.log('[duckdb/indice] Caché analítica inicializada →', DB_PATH);
    } catch (err) {
        console.error('[duckdb/indice] Error al inicializar:', err.message);
        db = null;
        conn = null;
        inicializado = true; // no reintentar
    }
}

// Inicializar en carga del módulo (non-blocking)
init().catch(() => { });

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Guarda un resultado de métrica en la caché DuckDB.
 * @param {string} cacheKey
 * @param {object} entrada  { metrica_id, sistema, parametros, resultado, ttl, origen }
 */
async function guardar(cacheKey, entrada = {}) {
    try {
        await init();
        if (!conn) return;

        const { metrica_id, sistema, parametros, resultado, ttl = 3600, origen = 'firebird' } = entrada;
        const ahora = new Date();
        const expiraEn = new Date(ahora.getTime() + ttl * 1000);

        const parametrosStr = parametros != null ? JSON.stringify(parametros) : null;
        const resultadoStr = JSON.stringify(resultado);

        await run(`
      INSERT OR REPLACE INTO cache_metricas
        (cache_key, metrica_id, sistema, parametros, resultado, creado_en, expira_en, ttl_segundos, hits, origen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `, [
            cacheKey,
            metrica_id,
            sistema || null,
            parametrosStr,
            resultadoStr,
            ahora.toISOString(),
            expiraEn.toISOString(),
            ttl,
            origen
        ]);
    } catch (err) {
        console.error('[duckdb/indice] Error al guardar:', err.message);
    }
}

/**
 * Busca un resultado en la caché DuckDB.
 * Retorna `null` si no existe o está expirado.
 * @param {string} cacheKey
 * @returns {Promise<object|null>}
 */
async function buscar(cacheKey) {
    try {
        await init();
        if (!conn) return null;

        const ahora = new Date().toISOString();
        const rows = await all(`
      SELECT resultado, hits, origen, creado_en, expira_en
      FROM   cache_metricas
      WHERE  cache_key = ?
        AND  (expira_en IS NULL OR expira_en > ?)
    `, [cacheKey, ahora]);

        if (!rows.length) return null;

        // Incrementar hits de forma no bloqueante
        run(`UPDATE cache_metricas SET hits = hits + 1 WHERE cache_key = ?`, [cacheKey]).catch(() => { });

        const row = rows[0];
        return {
            resultado: JSON.parse(row.resultado),
            hits: (row.hits || 0) + 1,
            origen: row.origen,
            creadoEn: row.creado_en,
            expiraEn: row.expira_en
        };
    } catch (err) {
        console.error('[duckdb/indice] Error al buscar:', err.message);
        return null;
    }
}

/**
 * Elimina entradas expiradas de la tabla.
 */
async function limpiarExpirados() {
    try {
        await init();
        if (!conn) return 0;

        const ahora = new Date().toISOString();
        await run(`DELETE FROM cache_metricas WHERE expira_en IS NOT NULL AND expira_en <= ?`, [ahora]);

        const rows = await all(`SELECT count(*) AS eliminados FROM cache_metricas WHERE expira_en <= ?`, [ahora]);
        return rows[0]?.eliminados || 0;
    } catch (err) {
        console.error('[duckdb/indice] Error al limpiar expirados:', err.message);
        return 0;
    }
}

/**
 * Vacía completamente la tabla de caché.
 */
async function limpiarTodo() {
    try {
        await init();
        if (!conn) return;
        await run(`DELETE FROM cache_metricas`);
    } catch (err) {
        console.error('[duckdb/indice] Error al limpiar todo:', err.message);
    }
}

/**
 * Retorna estadísticas de la caché DuckDB.
 * @returns {Promise<object>}
 */
async function obtenerStats() {
    try {
        await init();
        if (!conn) return { disponible: false };

        const ahora = new Date().toISOString();
        const [totales] = await all(`
      SELECT
        count(*)                                          AS total,
        count(*) FILTER (WHERE expira_en > ?)            AS vigentes,
        count(*) FILTER (WHERE expira_en <= ?)           AS expirados,
        sum(hits)                                        AS total_hits,
        avg(ttl_segundos)                                AS ttl_promedio_s,
        min(creado_en)                                   AS entrada_mas_antigua,
        max(creado_en)                                   AS entrada_mas_reciente
      FROM cache_metricas
    `, [ahora, ahora]);

        const porSistema = await all(`
      SELECT sistema, count(*) AS entradas, sum(hits) AS hits
      FROM   cache_metricas
      GROUP  BY sistema
      ORDER  BY hits DESC
    `);

        return {
            disponible: true,
            db_path: DB_PATH,
            total: Number(totales?.total || 0),
            vigentes: Number(totales?.vigentes || 0),
            expirados: Number(totales?.expirados || 0),
            total_hits: Number(totales?.total_hits || 0),
            ttl_promedio_s: Math.round(totales?.ttl_promedio_s || 0),
            entrada_mas_antigua: totales?.entrada_mas_antigua || null,
            entrada_mas_reciente: totales?.entrada_mas_reciente || null,
            por_sistema: porSistema
        };
    } catch (err) {
        console.error('[duckdb/indice] Error en stats:', err.message);
        return { disponible: false, error: err.message };
    }
}

/**
 * Retorna las N entradas más consultadas (top hits).
 * @param {number} limite
 */
async function topHits(limite = 20) {
    try {
        await init();
        if (!conn) return [];

        return await all(`
      SELECT cache_key, metrica_id, sistema, hits, creado_en, expira_en, origen
      FROM   cache_metricas
      ORDER  BY hits DESC
      LIMIT  ?
    `, [limite]);
    } catch (err) {
        console.error('[duckdb/indice] Error en topHits:', err.message);
        return [];
    }
}

/** ¿DuckDB disponible y conectado? */
function estaDisponible() {
    return !!conn && inicializado;
}

module.exports = {
    guardar,
    buscar,
    limpiarExpirados,
    limpiarTodo,
    obtenerStats,
    topHits,
    estaDisponible
};
