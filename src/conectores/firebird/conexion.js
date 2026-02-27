'use strict';

/**
 * Conector Firebird para bases de datos Aspel
 * Lee la configuración desde config/conexiones_aspel.json (editable por el usuario)
 */

const Firebird = require('node-firebird');
const path = require('path');

// Lazy-load para evitar dependencia circular
let _configService = null;
function getConfigService() {
    if (!_configService) {
        const ConexionesAspel = require('../../servicios/conexiones_aspel');
        _configService = new ConexionesAspel();
    }
    return _configService;
}

// Pool de conexiones por sistema
const pools = {};

/** Lee config del sistema desde el archivo de usuario */
function obtenerConfig(sistema) {
    try {
        const cfg = getConfigService().obtenerSistema(sistema);
        return {
            host: cfg.host || '127.0.0.1',
            port: Number(cfg.port) || 3050,
            database: cfg.database,
            user: cfg.user || 'SYSDBA',
            password: cfg.password || 'masterkey',
            lowercase_keys: false,
            role: cfg.role || null,
            pageSize: Number(cfg.pageSize) || 4096
        };
    } catch (_) {
        const FALLBACK = {
            SAE: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\SAE9.00\\Empresa01\\Datos\\SAE90EMPRE01.FDB',
            COI: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\COI10.00\\Datos\\Empresa1\\COI10EMPRE1.FDB',
            NOI: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\NOI11.00\\Datos\\Empresa01\\NOI11EMPRE01.FDB',
            BANCO: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\BAN6.00\\Datos\\Empresa01\\BAN60EMPRE01.FDB'
        };
        return { host: '127.0.0.1', port: 3050, database: FALLBACK[sistema] || '', user: 'SYSDBA', password: 'masterkey', lowercase_keys: false, role: null, pageSize: 4096 };
    }
}

/** Obtener o crear pool de conexiones */
function obtenerPool(sistema) {
    const s = String(sistema).toUpperCase();
    if (!pools[s]) {
        const config = obtenerConfig(s);
        pools[s] = Firebird.pool(5, config);
        console.log(`[Firebird] Pool creado → ${s} (${path.basename(config.database)})`);
    }
    return pools[s];
}

/** Destruir pool de un sistema (se recrea con nueva config) */
function limpiarPool(sistema) {
    const s = String(sistema).toUpperCase();
    if (pools[s]) {
        try { pools[s].destroy(); } catch (_) { }
        delete pools[s];
        console.log(`[Firebird] Pool destruido → ${s}`);
    }
}

/** Ejecutar consulta SQL en un sistema Aspel */
function ejecutarConsulta(sistema, sql, params = []) {
    return new Promise((resolve, reject) => {
        const pool = obtenerPool(sistema);
        pool.get((err, db) => {
            if (err) return reject(new Error(`[${sistema}] Conexión fallida: ${err.message}`));
            db.query(sql, params, (err2, result) => {
                db.detach();
                if (err2) return reject(new Error(`[${sistema}] SQL error: ${err2.message}`));
                resolve(result || []);
            });
        });
    });
}

/** Cerrar todos los pools */
function cerrarConexiones() {
    return new Promise((resolve) => {
        const activos = Object.keys(pools);
        if (activos.length === 0) return resolve();
        let cerrados = 0;
        activos.forEach((s) => {
            try {
                pools[s].destroy(() => { delete pools[s]; cerrados++; if (cerrados === activos.length) resolve(); });
            } catch (_) { delete pools[s]; cerrados++; if (cerrados === activos.length) resolve(); }
        });
    });
}

/** Probar conexión a un sistema */
function probarConexion(sistema) {
    return new Promise((resolve) => {
        let config;
        try { config = obtenerConfig(sistema.toUpperCase()); } catch (e) { return resolve({ exito: false, mensaje: e.message }); }
        Firebird.attach(config, (err, db) => {
            if (err) return resolve({ exito: false, mensaje: err.message });
            db.query('SELECT FIRST 1 RDB$RELATION_NAME FROM RDB$RELATIONS', [], (err2) => {
                db.detach();
                if (err2) return resolve({ exito: false, mensaje: err2.message });
                resolve({ exito: true, mensaje: `Conexión exitosa a ${sistema.toUpperCase()}` });
            });
        });
    });
}

module.exports = { ejecutarConsulta, cerrarConexiones, probarConexion, limpiarPool };
