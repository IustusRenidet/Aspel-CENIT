'use strict';

/**
 * src/configuracion/parametros.js
 *
 * Parámetros de configuración global de Aspel-CENIT.
 * Los valores se resuelven en el orden: variable de entorno → default.
 *
 * Estructura:
 *  - cache        — TTL, límites y comportamiento de caché de métricas
 *  - etl          — Schedules de cron, umbrales y configuración ETL
 *  - servidor     — Puerto, host, timeouts
 *  - firebird     — Parámetros de conexión Firebird
 *  - busqueda     — Configuración de motor de búsqueda semántica
 */

function env(nombre, defecto) {
    const v = process.env[nombre];
    return v !== undefined && v !== '' ? v : defecto;
}

function envNum(nombre, defecto) {
    const v = Number(env(nombre, defecto));
    return isNaN(v) ? defecto : v;
}

function envBool(nombre, defecto = false) {
    const v = env(nombre, null);
    if (v === null) return defecto;
    return v === '1' || v === 'true' || v === 'yes';
}

// ─── Caché de métricas ────────────────────────────────────────────────────────

const cache = {
    /** TTL por defecto en segundos (1 hora) */
    ttl_s: envNum('CACHE_TTL_S', 3600),

    /** TTL para resultados simulados / demo (5 minutos) */
    ttl_simulado_s: envNum('CACHE_TTL_SIMULADO_S', 300),

    /** Máximo de entradas en L1 (memoria) */
    max_entradas: envNum('CACHE_MAX_ENTRIES', 1000),

    /** ¿Cachear resultados simulados/demo? */
    cachear_simulados: envBool('CACHE_CACHEAR_SIMULADOS', false),

    /** ¿Activar caché de métricas globalmente? */
    habilitado: envBool('CACHE_HABILITADO', true),

    /** Intervalo de limpieza de expirados, en minutos */
    limpieza_intervalo_min: envNum('CACHE_LIMPIEZA_MIN', 5)
};

// ─── ETL / Scheduler ─────────────────────────────────────────────────────────

const etl = {
    /**
     * ¿Habilitar el scheduler ETL?
     * Poner ETL_HABILITADO=0 en producción para desactivar.
     */
    habilitado: envBool('ETL_HABILITADO', true),

    /**
     * Zona horaria para node-cron.
     * Ver: https://momentjs.com/timezone/
     */
    timezone: env('ETL_TIMEZONE', 'America/Mexico_City'),

    schedules: {
        /**
         * Pre-computa las métricas más populares → cada hora en punto.
         * Expresión cron: "0 * * * *"
         */
        precalentar_populares: {
            cron: env('ETL_CRON_PRECALENTAR', '0 * * * *'),
            habilitado: envBool('ETL_PRECALENTAR_HABILITADO', true),
            top_n: envNum('ETL_PRECALENTAR_TOP', 10),
            descripcion: 'Pre-computa las N métricas más populares y las guarda en caché'
        },

        /**
         * Valida conexiones Firebird → cada 5 minutos.
         * Expresión cron: cada-5-minutos (estrella/5 * * * *)
         */
        validar_conexiones: {
            cron: env('ETL_CRON_CONEXIONES', '*/5 * * * *'),
            habilitado: envBool('ETL_CONEXIONES_HABILITADO', true),
            timeout_ms: envNum('ETL_CONEXIONES_TIMEOUT_MS', 8000),
            descripcion: 'Valida conexiones Firebird y registra su estado'
        }
    },

    /** Máximo de trabajos simultáneos en la cola ETL */
    max_concurrent: envNum('ETL_MAX_CONCURRENT', 2),

    /** Historial de ejecuciones almacenado en memoria */
    max_history: envNum('ETL_MAX_HISTORY', 200)
};

// ─── Servidor ─────────────────────────────────────────────────────────────────

const servidor = {
    puerto: envNum('PORT', 3000),
    host: env('HOST', '0.0.0.0'),
    query_timeout_ms: envNum('QUERY_TIMEOUT_MS', 15000)
};

// ─── Firebird ─────────────────────────────────────────────────────────────────

const firebird = {
    sistemas_soportados: ['SAE', 'COI', 'NOI', 'BANCO']
};

// ─── Búsqueda semántica ────────────────────────────────────────────────────────

const busqueda = {
    fuzzy_threshold: envNum('BUSQUEDA_FUZZY_THRESHOLD', 2),
    max_resultados: envNum('BUSQUEDA_MAX_RESULTADOS', 50),
    popularidad_max_pts: envNum('BUSQUEDA_POP_MAX_PTS', 20)
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = { cache, etl, servidor, firebird, busqueda };
