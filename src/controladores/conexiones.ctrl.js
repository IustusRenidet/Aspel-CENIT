'use strict';

const ConexionesAspel = require('../servicios/conexiones_aspel');
const { probarConexion, limpiarPool } = require('../conectores/firebird/conexion');

const servicio = new ConexionesAspel();

function manejarError(res, error, status = 500) {
    return res.status(status).json({ ok: false, error: error.message || 'Error interno' });
}

/** GET /api/conexiones → configuración pública de los 4 sistemas */
async function obtenerTodas(_req, res) {
    try {
        const todas = servicio.obtenerTodasPublicas();
        return res.json({ ok: true, data: todas });
    } catch (error) {
        return manejarError(res, error);
    }
}

/** GET /api/conexiones/:sistema → configuración pública de un sistema */
async function obtenerUna(req, res) {
    try {
        const config = servicio.obtenerSistema(req.params.sistema);
        return res.json({ ok: true, data: servicio.ocultarSecreto(config) });
    } catch (error) {
        return manejarError(res, error, 400);
    }
}

/** PUT /api/conexiones/:sistema → actualizar configuración */
async function actualizar(req, res) {
    try {
        const sistema = req.params.sistema;
        const actualizado = servicio.actualizarSistema(sistema, req.body);

        // Resetear pool para que tome la nueva config
        try { limpiarPool(sistema); } catch (_) { }

        return res.json({ ok: true, mensaje: `Conexión ${sistema} actualizada`, data: servicio.ocultarSecreto(actualizado) });
    } catch (error) {
        return manejarError(res, error, 400);
    }
}

/** POST /api/conexiones/:sistema/probar → probar conectividad */
async function probarUna(req, res) {
    try {
        const sistema = req.params.sistema.toUpperCase();
        const resultado = await probarConexion(sistema);
        return res.json({ ok: resultado.exito, sistema, ...resultado });
    } catch (error) {
        return manejarError(res, error, 400);
    }
}

/** POST /api/conexiones/probar-todas → probar los 4 sistemas */
async function probarTodas(_req, res) {
    try {
        const sistemas = ['SAE', 'COI', 'NOI', 'BANCO'];
        const resultados = await Promise.all(
            sistemas.map(async (s) => {
                try {
                    const r = await probarConexion(s);
                    return { sistema: s, ...r };
                } catch (e) {
                    return { sistema: s, exito: false, mensaje: e.message };
                }
            })
        );
        const todosBien = resultados.every((r) => r.exito);
        return res.json({ ok: true, alMenosUno: resultados.some((r) => r.exito), todosBien, data: resultados });
    } catch (error) {
        return manejarError(res, error);
    }
}

module.exports = { obtenerTodas, obtenerUna, actualizar, probarUna, probarTodas };
