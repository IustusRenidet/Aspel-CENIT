'use strict';

const PanelesService = require('../servicios/paneles_service');

const servicio = new PanelesService();

function manejarError(res, error, status = 500) {
    return res.status(status).json({ ok: false, error: error.message || 'Error interno' });
}

function parsePaginacion(query) {
    const limit = Math.max(1, Math.min(Number(query.limit) || 20, 100));
    const page = Math.max(1, Number(query.page) || 1);
    return { page, limit, offset: (page - 1) * limit };
}

async function listar(req, res) {
    try {
        const { page, limit, offset } = parsePaginacion(req.query);
        const q = req.query.q ? String(req.query.q).toLowerCase() : null;

        let data = servicio.listar();

        // Filtro por texto (nombre u objetivo)
        if (q) {
            data = data.filter((p) =>
                (p.nombre || '').toLowerCase().includes(q) ||
                (p.objetivo || '').toLowerCase().includes(q)
            );
        }

        const total = data.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const paginados = data.slice(offset, offset + limit);

        return res.json({ ok: true, data: paginados, total, page, limit, totalPages });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function obtener(req, res) {
    try {
        const panel = servicio.obtener(req.params.id);
        if (!panel) return res.status(404).json({ ok: false, error: 'Dashboard no encontrado' });
        return res.json({ ok: true, data: panel });
    } catch (error) {
        return manejarError(res, error);
    }
}

async function guardar(req, res) {
    try {
        const panel = servicio.guardar(req.body);
        return res.json({ ok: true, data: panel });
    } catch (error) {
        return manejarError(res, error, 400);
    }
}

async function eliminar(req, res) {
    try {
        const eliminado = servicio.eliminar(req.params.id);
        if (!eliminado) return res.status(404).json({ ok: false, error: 'Dashboard no encontrado' });
        return res.json({ ok: true, mensaje: 'Dashboard eliminado' });
    } catch (error) {
        return manejarError(res, error);
    }
}

module.exports = { listar, obtener, guardar, eliminar };
