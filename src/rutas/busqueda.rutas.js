'use strict';
/**
 * @swagger
 * /api/busqueda/sugerencias:
 *   get:
 *     tags: [Inteligencia]
 *     summary: Autocompletado de búsquedas basado en historial
 *     description: |
 *       Devuelve hasta `limit` sugerencias de consultas anteriores que empiezan
 *       con el prefijo `q`. Sin `q`, retorna las más frecuentes.
 *       Requiere que `better-sqlite3` esté instalado (graceful degradation si no).
 *     parameters:
 *       - name: q
 *         in: query
 *         required: false
 *         schema: { type: string }
 *         description: Prefijo de la búsqueda para autocompletar
 *         example: ventas
 *       - name: limit
 *         in: query
 *         required: false
 *         schema: { type: integer, default: 10, maximum: 50 }
 *         description: Máximo de sugerencias a devolver
 *     responses:
 *       200:
 *         description: Lista de sugerencias de autocompletado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 sugerencias:
 *                   type: array
 *                   items: { type: string }
 *                 total: { type: integer }
 *             example:
 *               ok: true
 *               sugerencias:
 *                 - ventas por vendedor Q1 2025
 *                 - ventas mensuales SAE
 *                 - ventas vs año anterior
 *               total: 3
 *
 * /api/busqueda/populares:
 *   get:
 *     tags: [Inteligencia]
 *     summary: Métricas más consultadas (ranking de popularidad)
 *     parameters:
 *       - name: limit
 *         in: query
 *         schema: { type: integer, default: 10 }
 *       - name: sistema
 *         in: query
 *         schema: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *     responses:
 *       200:
 *         description: Ranking de métricas por accesos
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - metrica_id: ventas_mes_actual
 *                   sistema: SAE
 *                   contador: 42
 *                   ultima_vez: '2025-02-20T10:00:00.000Z'
 */

const express = require('express');
const indice = require('../almacenamiento/sqlite/indice');

const router = express.Router();

// ── GET /api/busqueda/sugerencias?q=X&limit=10 ──────────────────────────────
router.get('/sugerencias', (req, res) => {
    try {
        const q = String(req.query.q || '').trim();
        const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 50));

        const sugerencias = indice.obtenerSugerencias(q, limit);
        return res.json({ ok: true, sugerencias, total: sugerencias.length });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

// ── GET /api/busqueda/populares?limit=10&sistema=SAE ─────────────────────────
router.get('/populares', (req, res) => {
    try {
        const Database = (() => { try { return require('better-sqlite3'); } catch { return null; } })();
        if (!Database || !indice.estaDisponible()) {
            return res.json({ ok: true, data: [], nota: 'Índice SQLite no disponible' });
        }

        const path = require('path');
        const DB_PATH = path.join(process.cwd(), 'config', 'cenit_indice.db');
        const db = new Database(DB_PATH, { readonly: true });

        const limit = Math.max(1, Math.min(Number(req.query.limit) || 10, 100));
        const sistema = req.query.sistema ? String(req.query.sistema).toUpperCase() : null;

        const rows = sistema
            ? db.prepare(
                `SELECT metrica_id, sistema, contador, ultima_vez
           FROM popularidad_metricas
           WHERE sistema = ?
           ORDER BY contador DESC LIMIT ?`
            ).all(sistema, limit)
            : db.prepare(
                `SELECT metrica_id, sistema, contador, ultima_vez
           FROM popularidad_metricas
           ORDER BY contador DESC LIMIT ?`
            ).all(limit);

        db.close();
        return res.json({ ok: true, data: rows });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
