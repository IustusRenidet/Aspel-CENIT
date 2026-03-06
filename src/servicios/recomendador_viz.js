'use strict';
/**
 * RecomendadorViz — recomienda automáticamente el tipo de visualización
 * más adecuado para un conjunto de columnas y datos de muestra.
 *
 * Tipos soportados (en orden de prioridad):
 *   kpi              → un único valor numérico (número grande centrado)
 *   linea            → serie temporal (fecha + número, > 5 filas)
 *   pastel           → distribución de pocas categorías (texto + número, 2–8 filas)
 *   barra_horizontal → muchas categorías (texto + número, > 8 filas)
 *   barra            → dimensión + métrica genérica
 *   dispersion       → correlación entre dos variables numéricas
 *   tabla            → muchas columnas o caso general
 */

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES INTERNAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Capitaliza la primera letra de una cadena.
 * @param {string} s
 * @returns {string}
 */
function _cap(s) {
    return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1).toLowerCase();
}

/**
 * Genera un título legible para la visualización.
 * @param {string|null} metricaTipo  nombre del tipo de métrica (ej: 'ventas')
 * @param {string}      dimNombre    columna de dimensión (eje X)
 * @param {string}      metNombre    columna de métrica (eje Y)
 * @returns {string}
 */
function _generarTitulo(metricaTipo, dimNombre, metNombre) {
    const dim = String(dimNombre || '').replace(/_/g, ' ').toLowerCase();
    const met = String(metNombre || '').replace(/_/g, ' ').toLowerCase();
    if (metricaTipo && String(metricaTipo).trim()) {
        return `${_cap(metricaTipo)} por ${dim}`;
    }
    return `${_cap(met)} por ${dim}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Recomienda el tipo de visualización más adecuado.
 *
 * @param {Array<{nombre: string, tipo: 'numero'|'fecha'|'texto'|'booleano'}>} columnas
 *   Lista de columnas con su tipo inferido.
 *
 * @param {Array<Object>} datos_muestra
 *   Muestra de filas (máx. 5-10 filas son suficientes para decidir).
 *
 * @param {string|null} metrica_tipo
 *   Tipo de métrica opcional (ej: 'ventas', 'utilidad') para mejorar el título.
 *
 * @returns {{
 *   recomendado: string,
 *   razon: string,
 *   alternativas: string[],
 *   config_sugerida: {eje_x?: string, eje_y?: string, titulo?: string}
 * }}
 */
function recomendarVisualizacion(columnas, datos_muestra, metrica_tipo = null) {
    if (!Array.isArray(columnas) || columnas.length === 0) {
        return {
            recomendado: 'tabla',
            razon: 'No hay columnas para analizar',
            alternativas: [],
            config_sugerida: {}
        };
    }

    const totalFilas = Array.isArray(datos_muestra) ? datos_muestra.length : 0;

    // Clasificar columnas por tipo
    const numericas = columnas.filter(c => c.tipo === 'numero' || c.tipo === 'booleano');
    const fechas = columnas.filter(c => c.tipo === 'fecha');
    const textos = columnas.filter(c => c.tipo === 'texto');
    const total = columnas.length;

    // ────────────────────────────────────────────────────────
    // REGLA 1: única columna numérica → KPI
    // ────────────────────────────────────────────────────────
    if (total === 1 && numericas.length === 1) {
        return {
            recomendado: 'kpi',
            razon: 'Un único valor numérico se visualiza mejor como indicador KPI',
            alternativas: ['tabla'],
            config_sugerida: {
                titulo: _generarTitulo(metrica_tipo, '', numericas[0].nombre)
            }
        };
    }

    // ────────────────────────────────────────────────────────
    // REGLA 2: 1 fecha + 1 numérico, > 5 filas → línea
    // ────────────────────────────────────────────────────────
    if (total === 2 && fechas.length === 1 && numericas.length === 1 && totalFilas > 5) {
        return {
            recomendado: 'linea',
            razon: `Serie temporal con ${totalFilas} puntos de datos`,
            alternativas: ['barra', 'tabla'],
            config_sugerida: {
                eje_x: fechas[0].nombre.toUpperCase(),
                eje_y: numericas[0].nombre.toUpperCase(),
                titulo: _generarTitulo(metrica_tipo, fechas[0].nombre, numericas[0].nombre)
            }
        };
    }

    // ────────────────────────────────────────────────────────
    // REGLA 3: 1 texto + 1 numérico, 2–8 filas → pastel
    // ────────────────────────────────────────────────────────
    if (total === 2 && textos.length === 1 && numericas.length === 1 &&
        totalFilas >= 2 && totalFilas <= 8) {
        return {
            recomendado: 'pastel',
            razon: `${totalFilas} categorías discretas — ideal para distribución porcentual`,
            alternativas: ['barra', 'tabla'],
            config_sugerida: {
                eje_x: textos[0].nombre.toUpperCase(),
                eje_y: numericas[0].nombre.toUpperCase(),
                titulo: _generarTitulo(metrica_tipo, textos[0].nombre, numericas[0].nombre)
            }
        };
    }

    // ────────────────────────────────────────────────────────
    // REGLA 4: 1 texto + 1 numérico, > 8 filas → barra horizontal
    // ────────────────────────────────────────────────────────
    if (total === 2 && textos.length === 1 && numericas.length === 1 && totalFilas > 8) {
        return {
            recomendado: 'barra_horizontal',
            razon: `${totalFilas} categorías — mejor legibilidad con barras horizontales`,
            alternativas: ['barra', 'tabla'],
            config_sugerida: {
                eje_x: textos[0].nombre.toUpperCase(),
                eje_y: numericas[0].nombre.toUpperCase(),
                titulo: _generarTitulo(metrica_tipo, textos[0].nombre, numericas[0].nombre)
            }
        };
    }

    // ────────────────────────────────────────────────────────
    // REGLA 5: 1 fecha ó texto + 1 numérico (cualquier nº filas) → barra
    // ────────────────────────────────────────────────────────
    if (total === 2 && numericas.length === 1 && (fechas.length === 1 || textos.length === 1)) {
        const dimCol = fechas.length === 1 ? fechas[0] : textos[0];
        return {
            recomendado: 'barra',
            razon: 'Una dimensión y una métrica numérica se visualizan bien en barras',
            alternativas: ['linea', 'tabla'],
            config_sugerida: {
                eje_x: dimCol.nombre.toUpperCase(),
                eje_y: numericas[0].nombre.toUpperCase(),
                titulo: _generarTitulo(metrica_tipo, dimCol.nombre, numericas[0].nombre)
            }
        };
    }

    // ────────────────────────────────────────────────────────
    // REGLA 6: 2 campos numéricos → dispersión
    // ────────────────────────────────────────────────────────
    if (total === 2 && numericas.length === 2) {
        return {
            recomendado: 'dispersion',
            razon: 'Dos variables numéricas permiten analizar correlación',
            alternativas: ['tabla'],
            config_sugerida: {
                eje_x: numericas[0].nombre.toUpperCase(),
                eje_y: numericas[1].nombre.toUpperCase(),
                titulo: _generarTitulo(metrica_tipo, numericas[0].nombre, numericas[1].nombre)
            }
        };
    }

    // ────────────────────────────────────────────────────────
    // REGLA 7: > 3 columnas → tabla
    // ────────────────────────────────────────────────────────
    if (total > 3) {
        return {
            recomendado: 'tabla',
            razon: `${total} columnas requieren vista tabular para facilitar la lectura`,
            alternativas: ['barra'],
            config_sugerida: {}
        };
    }

    // ────────────────────────────────────────────────────────
    // DEFAULT
    // ────────────────────────────────────────────────────────
    return {
        recomendado: 'tabla',
        razon: 'Vista tabular como representación general',
        alternativas: [],
        config_sugerida: {}
    };
}

module.exports = { recomendarVisualizacion };
