'use strict';
/**
 * Controlador para /api/widgets
 * Exposición REST de WidgetsCustomService (CRUD + preview SQL seguro + recomendador de viz).
 */

const widgetsService = require('../servicios/widgets_custom_service');
const { recomendarVisualizacion } = require('../servicios/recomendador_viz');

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────

function esErrorValidacion(msg) {
    return /no puede estar vacío|debe comenzar con SELECT|no permitidas|parámetro|requerido/i.test(msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// PREVIEW
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/widgets/preview
 * Body: { sql: string, sistema: string, parametros?: Object }
 *
 * Ejecuta la query con máximo 5 filas y devuelve columnas + muestra.
 * Valida el SQL antes de enviarlo a Firebird.
 */
exports.previewSQL = async (req, res) => {
    const { sql, sistema, parametros = {} } = req.body || {};

    if (!sql || !String(sql).trim()) {
        return res.status(400).json({ ok: false, error: 'El campo sql es obligatorio' });
    }
    if (!sistema || !String(sistema).trim()) {
        return res.status(400).json({
            ok: false, error: 'El campo sistema es obligatorio (SAE, COI, NOI, BANCO)'
        });
    }

    try {
        const resultado = await widgetsService.previewWidget(
            sql,
            sistema,
            parametros && typeof parametros === 'object' ? parametros : {}
        );
        return res.json({ ok: true, data: resultado });
    } catch (err) {
        const status = esErrorValidacion(err.message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// RECOMENDADOR DE VISUALIZACIÓN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/widgets/recomendar-viz
 * Body: { columnas: [{nombre, tipo}], muestra?: Object[], metrica_tipo?: string }
 *
 * Devuelve el tipo de visualización recomendado + alternativas + config sugerida.
 * Pure (no Firebird, siempre responde aunque las bases estén caídas).
 */
exports.recomendarViz = (req, res) => {
    const { columnas, muestra = [], metrica_tipo = null } = req.body || {};

    if (!Array.isArray(columnas)) {
        return res.status(400).json({
            ok: false,
            error: 'El campo columnas debe ser un array de {nombre, tipo}'
        });
    }

    const resultado = recomendarVisualizacion(columnas, muestra, metrica_tipo);
    return res.json({ ok: true, data: resultado });
};

// ─────────────────────────────────────────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/widgets — con paginación y búsqueda */
exports.listar = (req, res) => {
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 100));
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const q = req.query.q ? String(req.query.q).toLowerCase() : null;
    const sis = req.query.sistema ? String(req.query.sistema).toUpperCase() : null;

    let data = widgetsService.listar();

    if (sis) data = data.filter((w) => (w.sistema || '').toUpperCase() === sis);
    if (q) data = data.filter((w) =>
        (w.nombre || '').toLowerCase().includes(q) ||
        (w.sistema || '').toLowerCase().includes(q)
    );

    const total = data.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginados = data.slice(offset, offset + limit);

    res.json({ ok: true, data: paginados, total, page, limit, totalPages });
};

/** GET /api/widgets/:id */
exports.obtener = (req, res) => {
    const widget = widgetsService.obtener(req.params.id);
    if (!widget) return res.status(404).json({ ok: false, error: 'Widget no encontrado' });
    res.json({ ok: true, widget });
};

/** POST /api/widgets */
exports.guardar = async (req, res) => {
    const datos = req.body;
    if (!datos || !String(datos.nombre || '').trim()) {
        return res.status(400).json({ ok: false, error: 'El campo nombre es obligatorio' });
    }
    try {
        const widget = await widgetsService.guardar(datos);
        return res.json({ ok: true, widget });
    } catch (err) {
        const status = esErrorValidacion(err.message) ? 400 : 500;
        return res.status(status).json({ ok: false, error: err.message });
    }
};

/** DELETE /api/widgets/:id */
exports.eliminar = (req, res) => {
    const ok = widgetsService.eliminar(req.params.id);
    if (!ok) return res.status(404).json({ ok: false, error: 'Widget no encontrado' });
    res.json({ ok: true });
};

/** POST /api/widgets/:id/ejecutar */
exports.ejecutar = async (req, res) => {
    const parametros = {
        ...(req.body?.params_sql || {}),
        ...(req.body?.params || {})
    };
    try {
        const resultado = await widgetsService.ejecutarWidget(req.params.id, parametros);
        return res.json({ ok: true, data: resultado });
    } catch (err) {
        const status = /no encontrado/i.test(err.message) ? 404 : (esErrorValidacion(err.message) ? 400 : 500);
        return res.status(status).json({ ok: false, error: err.message });
    }
};
