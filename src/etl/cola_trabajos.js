'use strict';

/**
 * src/etl/cola_trabajos.js
 *
 * Cola de trabajos simple en memoria (sin Redis).
 * Permite encolar tareas, ejecutarlas con concurrencia limitada
 * y consultar el historial de ejecuciones.
 *
 * Diseño:
 *  - FIFO con prioridad opcional (0 = normal, 1 = alta).
 *  - Historial de las últimas MAX_HISTORY ejecuciones (éxito + fallo).
 *  - Concurrencia: C trabajos simultáneos (por defecto 2).
 *  - Cada trabajo es un objeto: { id, nombre, tarea:Function, opciones }.
 *
 * API:
 *  cola.encolar({ nombre, tarea, opciones? })  → id
 *  cola.obtenerEstado(id)                      → objeto estado
 *  cola.listar({ estado? })                    → arreglo
 *  cola.stats()                                → resumen
 *  cola.vaciar()                               → limpia pendientes
 */

const { randomUUID } = require('crypto');

const MAX_HISTORY = Number(process.env.JOB_MAX_HISTORY) || 200;
const MAX_CONCURRENT = Number(process.env.JOB_MAX_CONCURRENT) || 2;

// ─── Estado interno ───────────────────────────────────────────────────────────

/** @type {Map<string, object>} id → trabajo (pendiente | en_proceso) */
const pendientes = new Map();

/** @type {Array<object>} historial circular de ejecuciones */
const historial = [];

let corriendo = 0;
let totalEncolados = 0;
let totalCompletados = 0;
let totalFallidos = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function agregarAHistorial(trabajo) {
    historial.unshift(trabajo);
    if (historial.length > MAX_HISTORY) historial.pop();
}

// ─── Motor de ejecución ───────────────────────────────────────────────────────

async function procesar() {
    if (corriendo >= MAX_CONCURRENT) return;
    if (pendientes.size === 0) return;

    // Tomar el trabajo más prioritario (mayor valor de prioridad primero, luego FIFO)
    let seleccionado = null;
    for (const [, t] of pendientes) {
        if (!seleccionado || (t.opciones.prioridad || 0) > (seleccionado.opciones.prioridad || 0)) {
            seleccionado = t;
        }
    }
    if (!seleccionado) return;

    pendientes.delete(seleccionado.id);
    corriendo++;

    seleccionado.estado = 'en_proceso';
    seleccionado.inicio = new Date().toISOString();

    try {
        const resultado = await Promise.resolve(seleccionado.tarea(seleccionado.opciones));
        seleccionado.estado = 'completado';
        seleccionado.fin = new Date().toISOString();
        seleccionado.resultado = resultado ?? null;
        seleccionado.duracion_ms = Date.now() - new Date(seleccionado.inicio).getTime();
        totalCompletados++;
    } catch (err) {
        seleccionado.estado = 'fallido';
        seleccionado.fin = new Date().toISOString();
        seleccionado.error = err.message;
        seleccionado.duracion_ms = Date.now() - new Date(seleccionado.inicio).getTime();
        totalFallidos++;
    } finally {
        corriendo--;
        agregarAHistorial(seleccionado);
        // Procesar siguiente trabajo si hay pendientes
        setImmediate(procesar);
    }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Encola un trabajo para ejecución asíncrona.
 *
 * @param {object} def
 * @param {string}   def.nombre   — Nombre descriptivo del trabajo
 * @param {Function} def.tarea    — Función async/sync a ejecutar
 * @param {object}   [def.opciones={}]  — Opciones pasadas a la tarea
 * @param {number}   [def.opciones.prioridad=0]  — 0 normal, 1 alta
 * @returns {string} id del trabajo
 */
function encolar(def = {}) {
    const { nombre, tarea, opciones = {} } = def;
    if (typeof tarea !== 'function') throw new TypeError('tarea debe ser una función');

    const id = randomUUID();
    const trabajo = {
        id,
        nombre: nombre || 'sin-nombre',
        tarea,
        opciones,
        estado: 'pendiente',
        encolado: new Date().toISOString(),
        inicio: null,
        fin: null,
        resultado: null,
        error: null,
        duracion_ms: null
    };

    pendientes.set(id, trabajo);
    totalEncolados++;

    // Lanzar procesador de forma no bloqueante
    setImmediate(procesar);

    return id;
}

/**
 * Obtiene el estado de un trabajo por id.
 * Busca primero en pendientes, luego en historial.
 * @param {string} id
 * @returns {object|null}
 */
function obtenerEstado(id) {
    if (pendientes.has(id)) return { ...pendientes.get(id), tarea: undefined };
    const encontrado = historial.find(t => t.id === id);
    return encontrado ? { ...encontrado, tarea: undefined } : null;
}

/**
 * Lista trabajos filtrando por estado.
 * @param {object} [filtros]
 * @param {'pendiente'|'en_proceso'|'completado'|'fallido'|null} [filtros.estado]
 * @param {number} [filtros.limit=50]
 * @returns {object[]}
 */
function listar({ estado = null, limit = 50 } = {}) {
    const todos = [
        ...[...pendientes.values()].map(t => ({ ...t, tarea: undefined })),
        ...historial.map(t => ({ ...t, tarea: undefined }))
    ];
    const filtrados = estado ? todos.filter(t => t.estado === estado) : todos;
    return filtrados.slice(0, limit);
}

/**
 * Resumen global de la cola.
 */
function stats() {
    return {
        pendientes: pendientes.size,
        en_proceso: corriendo,
        total_encolados: totalEncolados,
        total_completados: totalCompletados,
        total_fallidos: totalFallidos,
        historial_size: historial.length,
        max_concurrent: MAX_CONCURRENT,
        max_history: MAX_HISTORY
    };
}

/**
 * Elimina todos los trabajos pendientes (no cancela los que ya están en proceso).
 */
function vaciar() {
    pendientes.clear();
}

module.exports = { encolar, obtenerEstado, listar, stats, vaciar };
