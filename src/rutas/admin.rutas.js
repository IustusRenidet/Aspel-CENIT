'use strict';

/**
 * src/rutas/admin.rutas.js
 *
 * Endpoints de administración del sistema.
 *
 * GET    /api/admin/cache/stats   — Estadísticas de la caché (L1 + L2 DuckDB)
 * DELETE /api/admin/cache         — Limpiar toda la caché (L1 + L2)
 * GET    /api/admin/jobs          — Estado de los cron jobs ETL
 * POST   /api/admin/jobs/:nombre/run — Ejecutar un job manualmente
 * GET    /api/admin/cola          — Estado de la cola de trabajos ETL
 */

const router = require('express').Router();
const cache = require('../utilidades/cache_metricas');
const cola = require('../etl/cola_trabajos');
const programador = require('../etl/programador');

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Endpoints de administración — caché, jobs ETL y cola de trabajos
 */

/**
 * @swagger
 * /api/admin/cache/stats:
 *   get:
 *     summary: Estadísticas de la caché de métricas
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Estadísticas de L1 (memoria) y L2 (DuckDB)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:    { type: boolean }
 *                 l1:    { type: object, description: 'Caché en memoria' }
 *                 l2:    { type: object, description: 'Caché DuckDB persistente' }
 *                 global: { type: object, description: 'Métricas globales y top 5 hits' }
 */
router.get('/cache/stats', async (_req, res) => {
    try {
        const datos = await cache.stats();
        return res.json({ ok: true, ...datos });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * @swagger
 * /api/admin/cache:
 *   delete:
 *     summary: Limpiar toda la caché (L1 + L2)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Caché vaciada con éxito
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:      { type: boolean }
 *                 mensaje: { type: string }
 */
router.delete('/cache', async (_req, res) => {
    try {
        await cache.flush();
        return res.json({ ok: true, mensaje: 'Caché L1 y L2 vaciadas correctamente.' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * @swagger
 * /api/admin/jobs:
 *   get:
 *     summary: Estado actual de todos los cron jobs ETL
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Lista de jobs con historial de ejecuciones
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:   { type: boolean }
 *                 jobs: { type: array }
 *                 cola: { type: object, description: 'Estadísticas de la cola de trabajos' }
 */
router.get('/jobs', (_req, res) => {
    try {
        const jobs = programador.estadoJobs();
        const estadoCola = cola.stats();
        return res.json({ ok: true, jobs, cola: estadoCola });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * @swagger
 * /api/admin/jobs/{nombre}/run:
 *   post:
 *     summary: Ejecutar un job ETL manualmente
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: nombre
 *         required: true
 *         schema:
 *           type: string
 *           enum: [precalentar_populares, validar_conexiones]
 *         description: Nombre del job a ejecutar
 *     responses:
 *       200:
 *         description: Resultado de la ejecución manual
 *       404:
 *         description: Job no encontrado
 */
router.post('/jobs/:nombre/run', async (req, res) => {
    const { nombre } = req.params;
    try {
        const resultado = await programador.ejecutarManualmente(nombre);
        return res.json({ ok: true, nombre, resultado });
    } catch (err) {
        if (err.message.includes('no encontrado')) {
            return res.status(404).json({ ok: false, error: err.message });
        }
        return res.status(500).json({ ok: false, error: err.message });
    }
});

/**
 * @swagger
 * /api/admin/cola:
 *   get:
 *     summary: Estado de la cola de trabajos ETL
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *           enum: [pendiente, en_proceso, completado, fallido]
 *         description: Filtrar por estado
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: Lista de trabajos en la cola con estadísticas
 */
router.get('/cola', (req, res) => {
    try {
        const estado = req.query.estado || null;
        const limit = Math.min(Number(req.query.limit) || 50, 200);
        const trabajos = cola.listar({ estado, limit });
        const estadisticas = cola.stats();
        return res.json({ ok: true, trabajos, estadisticas });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
});

module.exports = router;
