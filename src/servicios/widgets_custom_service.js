'use strict';
/**
 * WidgetsCustomService — persiste widgets del usuario en config/widgets_custom.json.
 * Incluye validación SQL, parámetros dinámicos tipados y auto-detección de columnas.
 */

const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('crypto');
const { ejecutarConsulta } = require('../conectores/firebird/conexion');
const { recomendarVisualizacion } = require('./recomendador_viz');

const ARCHIVO = path.join(process.cwd(), 'config', 'widgets_custom.json');

// ─────────────────────────────────────────────────────────────────────────────
//  VALIDACIÓN SQL
// ─────────────────────────────────────────────────────────────────────────────

const PATRONES_PROHIBIDOS = [
    // DML / DDL
    {
        re: /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b/i,
        label: (m) => m.trim().split(/(\s|\b)/)[0].toUpperCase()
    },
    { re: /\bEXECUTE\b/i, label: () => 'EXECUTE' },
    { re: /\bxp_cmdshell\b/i, label: () => 'xp_cmdshell' },
    { re: /\bsp_[a-zA-Z]/i, label: () => 'procedimiento sp_*' },
    { re: /--/, label: () => 'comentario SQL (--)' },
    { re: /\/\*/, label: () => 'comentario SQL (/* */)' },
    { re: /;/, label: () => 'múltiples statements (;)' },
];

/**
 * Valida que un SQL sea seguro (solo SELECT, sin operaciones peligrosas).
 * @param {string} sql
 * @returns {{valido: boolean, razon?: string}}
 */
function validarSQL(sql) {
    const limpio = String(sql || '').trim();
    if (!limpio) return { valido: false, razon: 'El SQL no puede estar vacío' };

    if (!/^SELECT\b/i.test(limpio)) {
        return { valido: false, razon: 'El SQL debe comenzar con SELECT' };
    }

    for (const { re, label } of PATRONES_PROHIBIDOS) {
        const m = limpio.match(re);
        if (m) {
            return {
                valido: false,
                razon: `El SQL contiene operaciones no permitidas: ${label(m[0])}`
            };
        }
    }

    return { valido: true };
}

// ─────────────────────────────────────────────────────────────────────────────
//  RESOLUCIÓN DE PARÁMETROS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte :nombre_param → ? y construye el array de valores para node-firebird.
 * Los comentarios SQL se preservan sin tocar.
 * El mismo :nombre puede aparecer múltiples veces; cada ocurrencia genera un ?.
 *
 * @param {string} sql
 * @param {Object} paramsObj  { clave: valor }
 * @returns {{ sql: string, values: any[] }}
 */
function resolverParamsSQL(sql, paramsObj = {}) {
    const values = [];
    const sqlResolved = sql.replace(
        /(\/\*[\s\S]*?\*\/|--[^\r\n]*)|:([a-zA-Z_][a-zA-Z0-9_]*)/g,
        (match, comment, name) => {
            if (comment) return comment;          // preservar comentario
            const key = name.toLowerCase();
            let val = paramsObj[key];
            if (val === undefined || val === '') val = null;
            if (val !== null && !isNaN(val)) val = Number(val);
            values.push(val);
            return '?';
        }
    );
    return { sql: sqlResolved, values };
}

// ─────────────────────────────────────────────────────────────────────────────
//  TIPOS DE COLUMNA
// ─────────────────────────────────────────────────────────────────────────────

function _detectarTipoValor(valor) {
    if (valor instanceof Date) return 'fecha';
    if (typeof valor === 'number') return 'numero';
    if (typeof valor === 'boolean') return 'booleano';
    if (typeof valor === 'string') {
        if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return 'fecha';
        if (/^-?\d+(\.\d+)?$/.test(valor)) return 'numero';
    }
    return 'texto';
}

/**
 * Infiere columnas ({nombre, tipo}) desde la primera fila de resultados.
 * @param {Array<Object>} filas
 * @returns {Array<{nombre: string, tipo: string}>}
 */
function detectarColumnas(filas) {
    if (!Array.isArray(filas) || filas.length === 0) return [];
    return Object.entries(filas[0]).map(([nombre, valor]) => ({
        nombre,
        tipo: _detectarTipoValor(valor)
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONVERSIÓN DE TIPOS DE PARÁMETROS
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_VALIDOS = ['string', 'date', 'number', 'decimal', 'float', 'integer', 'int', 'boolean', 'bool'];

function _convertirParam(valor, tipo) {
    if (valor === null || valor === undefined) return null;
    switch (String(tipo || 'string').toLowerCase()) {
        case 'date':
            if (valor instanceof Date) return valor.toISOString().slice(0, 10);
            return String(valor).slice(0, 10);
        case 'number':
        case 'decimal':
        case 'float':
            return Number(valor);
        case 'integer':
        case 'int':
            return Math.trunc(Number(valor));
        case 'boolean':
        case 'bool':
            return (valor === true || valor === 1 || String(valor).toLowerCase() === 'true') ? 1 : 0;
        default: // 'string'
            return String(valor);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  NORMALIZACIÓN DE FILAS
// ─────────────────────────────────────────────────────────────────────────────

function _normalizarFilas(filas) {
    return (filas || []).map((fila) => {
        const norm = {};
        for (const [k, v] of Object.entries(fila)) norm[k.toLowerCase()] = v;
        return norm;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLASE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

class WidgetsCustomService {
    // ── Persistencia ────────────────────────────────────────────────────────────────

    _leer() {
        if (!fs.pathExistsSync(ARCHIVO)) return [];
        const data = fs.readJsonSync(ARCHIVO, { throws: false });
        return Array.isArray(data) ? data : [];
    }

    _escribir(widgets) {
        fs.ensureDirSync(path.dirname(ARCHIVO));
        fs.writeJsonSync(ARCHIVO, widgets, { spaces: 2 });
    }

    listar() { return this._leer().slice(); }

    obtener(id) { return this._leer().find(w => w.id === id) || null; }

    // ── Validación ───────────────────────────────────────────────────────────────

    /**
     * Valida un widget antes de guardarlo.
     * @param {{sql?: string, params_dinamicos?: Array}} widget
     * @returns {{valido: boolean, razon?: string}}
     */
    validarWidget(widget) {
        if (widget.sql) {
            const r = validarSQL(widget.sql);
            if (!r.valido) return r;
        }

        if (Array.isArray(widget.params_dinamicos)) {
            for (const p of widget.params_dinamicos) {
                if (!p.nombre) {
                    return { valido: false, razon: 'Cada parámetro dinámico debe tener un campo "nombre"' };
                }
                if (p.tipo && !TIPOS_VALIDOS.includes(String(p.tipo).toLowerCase())) {
                    return {
                        valido: false,
                        razon: `Tipo de parámetro no válido: "${p.tipo}". Permitidos: ${TIPOS_VALIDOS.join(', ')}`
                    };
                }
            }
        }

        return { valido: true };
    }

    // ── Preview ──────────────────────────────────────────────────────────────────

    /**
     * Ejecuta la query con máximo 5 filas.
     * Valida el SQL antes de cualquier ejecución.
     *
     * @param {string} sql
     * @param {string} sistema   SAE | COI | NOI | BANCO
     * @param {Object} parametros  { :nombre_param: valor }
     * @returns {Promise<{columnas: Array, filas: Array, total_filas: number, sql_ejecutado: string}>}
     */
    async previewWidget(sql, sistema, parametros = {}) {
        const validacion = validarSQL(sql);
        if (!validacion.valido) throw new Error(validacion.razon);

        // Inyectar FIRST 5 en Firebird, reemplazando cualquier FIRST N existente
        const sqlPreview = sql.trim()
            .replace(/^(SELECT)\s+(FIRST\s+\d+\s+)?/i, '$1 FIRST 5 ');

        const { sql: sqlFinal, values } = resolverParamsSQL(sqlPreview, parametros);

        const filas = await ejecutarConsulta(
            String(sistema || '').toUpperCase(),
            sqlFinal,
            values
        );

        const filasNorm = _normalizarFilas(filas);

        const columnas = detectarColumnas(filasNorm);
        const viz_recomendada = recomendarVisualizacion(columnas, filasNorm, null);

        return {
            sistema: String(sistema || '').toUpperCase(),
            columnas,
            filas: filasNorm,
            total_filas: filasNorm.length,
            sql_ejecutado: sqlFinal,
            viz_recomendada
        };
    }

    // ── Guardar (async — detecta columnas en preview) ────────────────────────────

    /**
     * Guarda o actualiza un widget personalizado.
     * Valida el SQL y auto-detecta columnas (best-effort, no bloquea el guardado).
     *
     * @param {Object} datos
     * @returns {Promise<Object>} Widget guardado
     */
    async guardar(datos) {
        const validacion = this.validarWidget(datos);
        if (!validacion.valido) throw new Error(validacion.razon);

        const widgets = this._leer();
        const ahora = new Date().toISOString();

        const widget = {
            id: datos.id || randomUUID(),
            nombre: String(datos.nombre || 'Widget sin nombre').slice(0, 120),
            descripcion: String(datos.descripcion || '').slice(0, 400),
            sistema: datos.sistema || null,
            sql: datos.sql || null,
            params_sql: datos.params_sql && typeof datos.params_sql === 'object' ? datos.params_sql : {},
            params_dinamicos: Array.isArray(datos.params_dinamicos) ? datos.params_dinamicos : [],
            tipo_viz: datos.tipo_viz || 'tabla',
            color_primario: datos.color_primario || '#6366f1',
            columnas_visibles: Array.isArray(datos.columnas_visibles) ? datos.columnas_visibles : [],
            columnas_resultado: Array.isArray(datos.columnas_resultado) ? datos.columnas_resultado : [],
            // preservar columnas_detectadas si ya existen, o calcular
            columnas_detectadas: Array.isArray(datos.columnas_detectadas) ? datos.columnas_detectadas : [],
            tipo_origen: datos.tipo_origen || 'sql_libre',
            interpretacion_tipo: datos.interpretacion_tipo || null,
            params_override: datos.params_override || null,
            creado_en: datos.creado_en || ahora,
            actualizado_en: ahora,
        };

        // Auto-detectar columnas si hay SQL y Firebird puede estar disponible
        if (widget.sql && widget.sistema && widget.columnas_detectadas.length === 0) {
            try {
                const preview = await this.previewWidget(
                    widget.sql,
                    widget.sistema,
                    widget.params_sql
                );
                widget.columnas_detectadas = preview.columnas;
            } catch {
                // Silenciar — Firebird puede no estar disponible en el momento del guardado
                widget.columnas_detectadas = [];
            }
        }

        const idx = widgets.findIndex(w => w.id === widget.id);
        if (idx >= 0) {
            widget.creado_en = widgets[idx].creado_en; // preservar fecha original
            widgets[idx] = widget;
        } else {
            widgets.unshift(widget);
        }

        this._escribir(widgets);
        return widget;
    }

    // ── Ejecutar ──────────────────────────────────────────────────────────────────

    /**
     * Ejecuta un widget guardado por ID con parámetros dinámicos del usuario.
     *
     * Flujo:
     *   1. Carga el widget y revalida su SQL.
     *   2. Valida parámetros requeridos y convierte tipos según params_dinamicos.
     *   3. Resuelve :nombre → ? y ejecuta en Firebird.
     *
     * @param {string} widgetId
     * @param {Object} parametrosUsuario  { nombre_param: valor }
     * @returns {Promise<{filas, total_filas, columnas_resultado, widget}>}
     */
    async ejecutarWidget(widgetId, parametrosUsuario = {}) {
        const widget = this.obtener(widgetId);
        if (!widget) throw new Error(`Widget no encontrado: ${widgetId}`);
        if (!widget.sql) throw new Error('Este widget no tiene SQL asociado');

        // Revalidar SQL (por si fue editado manualmente en el JSON)
        const valSQL = validarSQL(widget.sql);
        if (!valSQL.valido) throw new Error(valSQL.razon);

        // ─ Validar y convertir params_dinamicos ─
        const paramsDef = Array.isArray(widget.params_dinamicos) ? widget.params_dinamicos : [];
        const errores = [];
        const paramsConvertidos = {};

        for (const def of paramsDef) {
            const clave = String(def.nombre).toLowerCase();
            // Aceptar tanto clave exacta como nombre original
            const valor = parametrosUsuario[clave] ?? parametrosUsuario[def.nombre] ?? null;

            if (def.requerido && (valor === undefined || valor === null || valor === '')) {
                errores.push(`Parámetro requerido faltante: ${def.nombre}`);
                continue;
            }

            if (valor !== undefined && valor !== null && valor !== '') {
                paramsConvertidos[clave] = _convertirParam(valor, def.tipo || 'string');
            }
        }

        if (errores.length > 0) {
            throw new Error(`Parámetros inválidos:\n${errores.join('\n')}`);
        }

        // Los params guardados en el widget + los del usuario (usuario sobrescribe)
        const paramsFinal = { ...widget.params_sql, ...paramsConvertidos };
        const { sql: sqlResuelto, values } = resolverParamsSQL(widget.sql, paramsFinal);

        const filas = await ejecutarConsulta(widget.sistema, sqlResuelto, values);
        const filasNorm = _normalizarFilas(filas);

        return {
            filas: filasNorm,
            total_filas: filasNorm.length,
            columnas_resultado: Object.keys(filasNorm[0] || {}),
            widget
        };
    }

    // ── Eliminar ──────────────────────────────────────────────────────────────────

    eliminar(id) {
        const widgets = this._leer();
        const resto = widgets.filter(w => w.id !== id);
        if (resto.length === widgets.length) return false;
        this._escribir(resto);
        return true;
    }
}

// Singleton compartido
const instancia = new WidgetsCustomService();
module.exports = instancia;
module.exports.WidgetsCustomService = WidgetsCustomService;
module.exports.validarSQL = validarSQL;
module.exports.resolverParamsSQL = resolverParamsSQL;
module.exports.detectarColumnas = detectarColumnas;
