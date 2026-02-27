'use strict';

const PanelesService = require('../servicios/paneles_service');

const servicio = new PanelesService();

function manejarError(res, error, status = 500) {
    return res.status(status).json({ ok: false, error: error.message || 'Error interno' });
}

async function listar(_req, res) {
    try {
        return res.json({ ok: true, data: servicio.listar() });
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
