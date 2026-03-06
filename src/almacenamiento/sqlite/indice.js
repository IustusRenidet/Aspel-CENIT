'use strict';
/**
 * indice.js — Historial de búsquedas y popularidad de métricas con better-sqlite3.
 *
 * Tabla historial_busquedas — registra cada consulta y sus resultados.
 * Tabla popularidad_metricas — lleva contador de ejecuciones / accesos por métrica.
 */

const path = require('path');
const fs = require('fs-extra');

// ── Carga opcional: si better-sqlite3 no está instalado el módulo degrada gentilmente ──
let Database;
try {
    Database = require('better-sqlite3');
} catch {
    Database = null;
}

const DB_PATH = path.join(process.cwd(), 'config', 'cenit_indice.db');

let _db = null;  // singleton
let _ok = false; // ready flag

// ── DDL ───────────────────────────────────────────────────────────────────────
const DDL = `
  CREATE TABLE IF NOT EXISTS historial_busquedas (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    query           TEXT    NOT NULL,
    sistema         TEXT,
    resultados_count INTEGER DEFAULT 0,
    fecha           TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_hb_query ON historial_busquedas (LOWER(query));
  CREATE INDEX IF NOT EXISTS idx_hb_fecha ON historial_busquedas (fecha);

  CREATE TABLE IF NOT EXISTS popularidad_metricas (
    metrica_id  TEXT PRIMARY KEY,
    sistema     TEXT,
    contador    INTEGER DEFAULT 1,
    ultima_vez  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_pop_contador ON popularidad_metricas (contador DESC);
`;

// ── Conexión singleton ────────────────────────────────────────────────────────
function getDB() {
    if (!Database) return null;   // fallback silencioso
    if (_db) return _db;

    try {
        fs.ensureDirSync(path.dirname(DB_PATH));
        _db = new Database(DB_PATH);
        _db.pragma('journal_mode = WAL');
        _db.pragma('synchronous   = NORMAL');
        _db.exec(DDL);
        _ok = true;
    } catch (err) {
        console.warn('[indice] SQLite no disponible:', err.message);
        _db = null;
    }

    return _db;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Registra una búsqueda en el historial.
 * @param {string} query            Texto de búsqueda libre.
 * @param {string|null} sistema     Sistema Aspel filtrado (o null).
 * @param {number} resultadosCount  Cuántas métricas devolvió la búsqueda.
 */
function registrarBusqueda(query, sistema, resultadosCount) {
    const db = getDB();
    if (!db) return;
    try {
        db.prepare(
            `INSERT INTO historial_busquedas (query, sistema, resultados_count, fecha)
       VALUES (?, ?, ?, ?)`
        ).run(
            String(query).slice(0, 200),
            sistema || null,
            Number(resultadosCount) || 0,
            new Date().toISOString()
        );
    } catch { /* nunca romper la operación principal */ }
}

/**
 * Devuelve sugerencias de autocompletado basadas en el historial.
 * @param {string} q      Prefijo o fragmento a buscar.
 * @param {number} limite Máximo de resultados (default 10).
 * @returns {string[]}
 */
function obtenerSugerencias(q, limite = 10) {
    const db = getDB();
    if (!db) return [];
    try {
        const term = String(q || '').toLowerCase().trim();
        const lim = Math.max(1, Math.min(Number(limite) || 10, 50));

        if (!term) {
            // Sin prefijo → devolver las más frecuentes
            return db.prepare(
                `SELECT query, COUNT(*) AS freq
         FROM historial_busquedas
         GROUP BY LOWER(query)
         ORDER BY freq DESC, MAX(fecha) DESC
         LIMIT ?`
            ).all(lim).map((r) => r.query);
        }

        return db.prepare(
            `SELECT query, COUNT(*) AS freq
       FROM historial_busquedas
       WHERE LOWER(query) LIKE ?
       GROUP BY LOWER(query)
       ORDER BY freq DESC, MAX(fecha) DESC
       LIMIT ?`
        ).all(`${term}%`, lim).map((r) => r.query);
    } catch { return []; }
}

/**
 * Incrementa el contador de popularidad de una métrica.
 * Usa INSERT OR REPLACE para un upsert portable.
 * @param {string} metricaId
 * @param {string|null} sistema
 */
function incrementarPopularidad(metricaId, sistema) {
    const db = getDB();
    if (!db || !metricaId) return;
    try {
        db.prepare(
            `INSERT INTO popularidad_metricas (metrica_id, sistema, contador, ultima_vez)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(metrica_id)
       DO UPDATE SET contador   = contador + 1,
                     ultima_vez = excluded.ultima_vez`
        ).run(
            String(metricaId),
            sistema || null,
            new Date().toISOString()
        );
    } catch { /* silencioso */ }
}

/**
 * Devuelve un Map<metricaId, contador> con todas las popularidades.
 * @returns {Map<string, number>}
 */
function obtenerPopularidades() {
    const db = getDB();
    if (!db) return new Map();
    try {
        const rows = db.prepare(
            `SELECT metrica_id, contador FROM popularidad_metricas`
        ).all();
        const map = new Map();
        for (const r of rows) map.set(r.metrica_id, r.contador);
        return map;
    } catch { return new Map(); }
}

/**
 * Indica si el backend SQLite está disponible y listo.
 * @returns {boolean}
 */
function estaDisponible() {
    getDB(); // intento de inicialización
    return _ok;
}

module.exports = {
    registrarBusqueda,
    obtenerSugerencias,
    incrementarPopularidad,
    obtenerPopularidades,
    estaDisponible
};
