'use strict';

/**
 * src/etl/programador.js
 *
 * Scheduler ETL basado en node-cron.
 * Define y gestiona los dos jobs recurrentes:
 *
 *  1. precalentar_populares  — Cada hora: ejecuta las 10 métricas más
 *     populares en modo 'auto' y guarda los resultados en caché.
 *
 *  2. validar_conexiones     — Cada 5 minutos: intenta una query de ping
 *     a cada sistema Firebird configurado y registra su estado.
 *
 * API:
 *  programador.iniciar()    — registra y arranca todos los jobs habilitados
 *  programador.detener()    — destruye todos los jobs activos
 *  programador.estadoJobs() — retorna arreglo con estado actual de cada job
 */

const cron = require('node-cron');
const params = require('../configuracion/parametros');
const cola = require('./cola_trabajos');
const cache = require('../utilidades/cache_metricas');

// ─── Registro de jobs ─────────────────────────────────────────────────────────

/** @type {Array<{nombre:string, schedule:string, task:cron.ScheduledTask, estado:object}>} */
const jobs = [];

/** Historial de ejecuciones de cada job (últimas N) */
const historialJobs = {};
const MAX_HIST = 20;

function registrarEjecucion(nombre, resumen) {
    if (!historialJobs[nombre]) historialJobs[nombre] = [];
    historialJobs[nombre].unshift({ ...resumen, ts: new Date().toISOString() });
    if (historialJobs[nombre].length > MAX_HIST) historialJobs[nombre].pop();
}

// ─── Job 1: Pre-calentar métricas populares ───────────────────────────────────

async function tareasPreCalentarPopulares() {
    const inicio = Date.now();
    const topN = params.etl.schedules.precalentar_populares.top_n;

    let precalentadas = 0;
    let errores = 0;

    try {
        // Importación diferida para evitar dependencia circular en el arranque
        const indice = require('../almacenamiento/sqlite/indice');
        const EjecutorMetricas = require('../servicios/ejecutor_metricas');
        const IA = require('../servicios/inteligencia_aspel');

        if (!indice.estaDisponible()) {
            return { precalentadas: 0, errores: 0, nota: 'SQLite no disponible' };
        }

        // Obtener las métricas más populares del índice SQLite
        const popularidades = indice.obtenerPopularidades();
        if (!popularidades || popularidades.size === 0) {
            return { precalentadas: 0, errores: 0, nota: 'Sin datos de popularidad aún' };
        }

        // Ordenar por contador descendente y tomar top N
        const top = [...popularidades.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN);

        const ejecutor = new EjecutorMetricas({ modoDefecto: 'auto' });
        const ia = new IA();

        // Intentar cargar metricas para derivar sistema
        const allMetricas = ia.listarMetricas({ limit: 200 });
        const metricaMap = new Map((allMetricas.data || []).map(m => [m.id, m]));

        for (const [metricaId] of top) {
            try {
                const meta = metricaMap.get(metricaId);
                const sistema = meta?.sistema || null;
                const cacheKey = cache.buildKey(metricaId, {});

                // Si ya está en caché L1, saltar
                const existente = await cache.get(cacheKey);
                if (existente?.desde === 'l1') {
                    precalentadas++;
                    continue;
                }

                const resultado = await ejecutor.ejecutarMetrica({
                    metricaId,
                    sistema,
                    parametros: {},
                    modo: 'auto'
                });

                await cache.set(cacheKey, {
                    resultado,
                    ttl: params.cache.ttl_s,
                    metrica_id: metricaId,
                    sistema: sistema || resultado.sistema,
                    parametros: {},
                    origen: resultado.origen_datos || 'auto'
                });

                precalentadas++;
            } catch (_) {
                errores++;
            }
        }

        return { precalentadas, errores, duracion_ms: Date.now() - inicio };
    } catch (err) {
        return { precalentadas, errores: errores + 1, mensaje_error: err.message, duracion_ms: Date.now() - inicio };
    }
}

// ─── Job 2: Validar conexiones Firebird ───────────────────────────────────────

async function tareaValidarConexiones() {
    const inicio = Date.now();
    const sistemas = params.firebird.sistemas_soportados;
    const timeout = params.etl.schedules.validar_conexiones.timeout_ms;
    const resultados = {};

    for (const sistema of sistemas) {
        try {
            const { ejecutarConsulta } = require('../conectores/firebird/conexion');

            const pingPromise = ejecutarConsulta(sistema, 'SELECT 1 AS ping FROM RDB$DATABASE');
            const timerPromise = new Promise((_, rej) =>
                setTimeout(() => rej(new Error(`Timeout ${timeout}ms`)), timeout)
            );

            await Promise.race([pingPromise, timerPromise]);
            resultados[sistema] = { ok: true, latencia_ms: Date.now() - inicio };
        } catch (err) {
            resultados[sistema] = { ok: false, error: err.message };
        }
    }

    const total_ok = Object.values(resultados).filter(r => r.ok).length;
    const total_fail = sistemas.length - total_ok;

    if (total_fail > 0) {
        console.warn(`[ETL/conexiones] ${total_fail} sistema(s) sin conexion:`,
            Object.entries(resultados).filter(([, v]) => !v.ok).map(([k]) => k).join(', '));
    }

    return {
        resultados,
        total_ok,
        total_fail,
        duracion_ms: Date.now() - inicio
    };
}

// ─── Registro de jobs ─────────────────────────────────────────────────────────

function crearJobHandle(nombre, schedule, tareaFn) {
    const meta = {
        nombre,
        schedule,
        habilitado: true,
        ultima_ejecucion: null,
        proxima_ejecucion: null,
        ultima_duracion_ms: null,
        total_ejecuciones: 0,
        total_errores: 0,
        ultimo_resultado: null,
        task: null
    };

    const task = cron.schedule(schedule, async () => {
        meta.total_ejecuciones++;
        meta.ultima_ejecucion = new Date().toISOString();
        console.log(`[ETL] Iniciando job: ${nombre}`);

        // Encolar en la cola de trabajos para control de concurrencia
        const id = cola.encolar({
            nombre,
            tarea: tareaFn,
            opciones: { prioridad: 0 }
        });

        // Esperar a que el trabajo termine (máx. 10 min)
        const MAX_WAIT = 600_000;
        const inicio = Date.now();
        await new Promise(resolve => {
            const check = setInterval(() => {
                const estado = cola.obtenerEstado(id);
                if (!estado || estado.estado === 'completado' || estado.estado === 'fallido' || (Date.now() - inicio > MAX_WAIT)) {
                    clearInterval(check);
                    if (estado) {
                        meta.ultima_duracion_ms = estado.duracion_ms;
                        meta.ultimo_resultado = estado.resultado || estado.error;
                        if (estado.estado === 'fallido') meta.total_errores++;
                        registrarEjecucion(nombre, {
                            estado: estado.estado,
                            duracion_ms: estado.duracion_ms,
                            resultado: estado.resultado,
                            error: estado.error
                        });
                    }
                    resolve();
                }
            }, 500);
        });

        console.log(`[ETL] Job terminado: ${nombre} (${meta.ultima_duracion_ms}ms)`);
    }, { timezone: params.etl.timezone });

    meta.task = task;
    return meta;
}

// ─── API pública ──────────────────────────────────────────────────────────────

let iniciado = false;

/**
 * Registra y arranca todos los cron jobs habilitados.
 * Idempotente: si ya fue llamado, no hace nada.
 */
function iniciar() {
    if (iniciado) return;
    if (!params.etl.habilitado) {
        console.log('[ETL] Scheduler desactivado (ETL_HABILITADO=0)');
        return;
    }

    const cfgPop = params.etl.schedules.precalentar_populares;
    const cfgConn = params.etl.schedules.validar_conexiones;

    if (cfgPop.habilitado) {
        if (!cron.validate(cfgPop.cron)) {
            console.error(`[ETL] Expresión cron inválida para precalentar_populares: "${cfgPop.cron}"`);
        } else {
            const jh = crearJobHandle('precalentar_populares', cfgPop.cron, tareasPreCalentarPopulares);
            jobs.push(jh);
            console.log(`[ETL] Job registrado: precalentar_populares (${cfgPop.cron})`);
        }
    }

    if (cfgConn.habilitado) {
        if (!cron.validate(cfgConn.cron)) {
            console.error(`[ETL] Expresión cron inválida para validar_conexiones: "${cfgConn.cron}"`);
        } else {
            const jh = crearJobHandle('validar_conexiones', cfgConn.cron, tareaValidarConexiones);
            jobs.push(jh);
            console.log(`[ETL] Job registrado: validar_conexiones (${cfgConn.cron})`);
        }
    }

    iniciado = true;
}

/**
 * Detiene y destruye todos los jobs activos.
 */
function detener() {
    for (const jh of jobs) {
        try { jh.task.stop(); } catch (_) { }
    }
    jobs.length = 0;
    iniciado = false;
    console.log('[ETL] Todos los jobs detenidos.');
}

/**
 * Retorna el estado actual de todos los jobs registrados.
 * @returns {object[]}
 */
function estadoJobs() {
    return jobs.map(jh => ({
        nombre: jh.nombre,
        schedule: jh.schedule,
        habilitado: jh.habilitado,
        ultima_ejecucion: jh.ultima_ejecucion,
        ultima_duracion_ms: jh.ultima_duracion_ms,
        total_ejecuciones: jh.total_ejecuciones,
        total_errores: jh.total_errores,
        ultimo_resultado: jh.ultimo_resultado,
        historial: historialJobs[jh.nombre] || []
    }));
}

/**
 * Ejecuta un job manualmente (útil para pruebas o endpoints admin).
 * @param {string} nombre
 * @returns {Promise<object>}
 */
async function ejecutarManualmente(nombre) {
    const jh = jobs.find(j => j.nombre === nombre);
    if (!jh) throw new Error(`Job no encontrado: ${nombre}`);

    let tareaFn;
    if (nombre === 'precalentar_populares') tareaFn = tareasPreCalentarPopulares;
    else if (nombre === 'validar_conexiones') tareaFn = tareaValidarConexiones;
    else throw new Error(`Tarea no implementada: ${nombre}`);

    return tareaFn();
}

module.exports = { iniciar, detener, estadoJobs, ejecutarManualmente };
