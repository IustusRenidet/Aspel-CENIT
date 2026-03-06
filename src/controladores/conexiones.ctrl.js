'use strict';

const ConexionesAspel = require('../servicios/conexiones_aspel');
const { probarConexion, limpiarPool } = require('../conectores/firebird/conexion');
const ConstructorDiccionario = require('../semantica/constructor_diccionario');
const InteligenciaAspel = require('../servicios/inteligencia_aspel');

const servicio = new ConexionesAspel();
const inteligencia = new InteligenciaAspel();

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

        // Intentar refrescar el diccionario técnico con la nueva conexión
        let esquema_info = { esquema_actualizado: false };
        try {
            const constructor = new ConstructorDiccionario();
            const dic = await constructor.refrescarSiConectado(sistema);
            if (dic.origen_datos === 'live') {
                await inteligencia.recargar();
                esquema_info = { esquema_actualizado: true, tablas: dic.tablas, campos: dic.campos };
            } else {
                esquema_info = { esquema_actualizado: false, motivo: 'Firebird no disponible aún' };
            }
        } catch (e) {
            esquema_info = { esquema_actualizado: false, motivo: e.message };
        }

        return res.json({
            ok: true,
            mensaje: `Conexión ${sistema} actualizada`,
            data: servicio.ocultarSecreto(actualizado),
            ...esquema_info
        });
    } catch (error) {
        return manejarError(res, error, 400);
    }
}

/** POST /api/conexiones/:sistema/sincronizar-esquema → forzar sincronización del diccionario técnico */
async function sincronizarEsquema(req, res) {
    try {
        const sistema = req.params.sistema.toUpperCase();

        // Leer baseline actual para calcular diffs
        const fs = require('fs');
        const path = require('path');
        const catalogoPath = path.join(__dirname, '../../diccionario', `catalogo_tecnico_${sistema}.json`);
        let tablas_antes = 0, campos_antes = 0;
        try {
            const catalogo = JSON.parse(fs.readFileSync(catalogoPath, 'utf8'));
            const tabls = catalogo.tablas || catalogo;
            tablas_antes = Array.isArray(tabls) ? tabls.length : Object.keys(tabls).length;
            campos_antes = Array.isArray(tabls)
                ? tabls.reduce((s, t) => s + (t.campos?.length || 0), 0)
                : Object.values(tabls).reduce((s, t) => s + (t.campos?.length || 0), 0);
        } catch (_) { /* sin baseline previo */ }

        const constructor = new ConstructorDiccionario();
        const dic = await constructor.refrescarSiConectado(sistema);

        if (!dic.ok || dic.origen_datos !== 'live') {
            return res.status(502).json({
                ok: false,
                sistema,
                origen_datos: dic.origen_datos,
                motivo: 'No se pudo conectar a Firebird para leer el esquema en vivo'
            });
        }

        await inteligencia.recargar();

        return res.json({
            ok: true,
            sistema,
            origen_datos: dic.origen_datos,
            tablas: dic.tablas,
            campos: dic.campos,
            tablas_nuevas: dic.tablas - tablas_antes,
            campos_nuevos: dic.campos - campos_antes,
            tablas_eliminadas: Math.max(0, tablas_antes - dic.tablas)
        });
    } catch (error) {
        return manejarError(res, error, 500);
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

module.exports = { obtenerTodas, obtenerUna, actualizar, probarUna, probarTodas, sincronizarEsquema };
