'use strict';

/**
 * AnalizadorCalidad
 *
 * Ejecuta análisis de calidad de datos directamente en Firebird.
 * Los resultados se cachean 24 horas en memoria (los análisis son costosos).
 *
 * API pública:
 *   analizarCampo(sistema, tabla, campo)  → estadísticas de un campo
 *   analizarTabla(sistema, tabla)         → resumen de los campos clave
 *   detectarAnomalias(sistema, tabla, campo, tipo)  → lista de anomalías
 */

const { ejecutarConsulta, probarConexion } = require('../conectores/firebird/conexion');

/** TTL de caché: 24 horas en milisegundos. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Máximo de registros de ejemplo a mostrar en anomalías. */
const MAX_ANOMALIA_SAMPLE = 5;

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers internos
// ─────────────────────────────────────────────────────────────────────────────

/** Extrae el primer valor de una fila sin importar si las claves son mayúsculas o minúsculas. */
function _col(fila, nombre) {
    if (!fila) return null;
    const upper = nombre.toUpperCase();
    const lower = nombre.toLowerCase();
    if (upper in fila) return fila[upper];
    if (lower in fila) return fila[lower];
    // búsqueda insensible (por si hay trim + case mixin)
    const key = Object.keys(fila).find(
        (k) => k.trim().toUpperCase() === upper
    );
    return key !== undefined ? fila[key] : null;
}

function _num(fila, nombre) {
    return Number(_col(fila, nombre) ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Clasificación de campos por nombre
// ─────────────────────────────────────────────────────────────────────────────

const PATRONES_TIPO = {
    importe: /IMPORTE|MONTO|TOTAL|PRECIO|VALOR|COSTO|DESCUENTO|IMPUESTO|SALDO/i,
    fecha: /FECHA|DATE|FCH/i,
    clave: /^CVE_|^COD_|^ID_|^NUM|^CLAVE$|^FOLIO$/i
};

function _clasificarCampo(nombre) {
    if (PATRONES_TIPO.importe.test(nombre)) return 'importe';
    if (PATRONES_TIPO.fecha.test(nombre)) return 'fecha';
    if (PATRONES_TIPO.clave.test(nombre)) return 'clave';
    return 'otro';
}

// ─────────────────────────────────────────────────────────────────────────────
//  Clase principal
// ─────────────────────────────────────────────────────────────────────────────

class AnalizadorCalidad {
    constructor() {
        /** @type {Map<string, {datos: any, expira: number}>} */
        this._cache = new Map();
    }

    // ── caché ──────────────────────────────────────────────────────────────────

    _cacheKey(...partes) {
        return partes.join(':').toUpperCase();
    }

    _fromCache(key) {
        const entry = this._cache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expira) {
            this._cache.delete(key);
            return null;
        }
        return entry.datos;
    }

    _toCache(key, datos) {
        this._cache.set(key, { datos, expira: Date.now() + CACHE_TTL_MS });
    }

    /** Invalida toda la caché (útil tras cambios en la BD). */
    limpiarCache() {
        this._cache.clear();
    }

    // ── conexión ───────────────────────────────────────────────────────────────

    /**
     * Verifica si Firebird está disponible para un sistema.
     * @returns {Promise<boolean>}
     */
    async firebirdDisponible(sistema) {
        try {
            const r = await probarConexion(sistema);
            return r.exito === true;
        } catch {
            return false;
        }
    }

    // ── analizarCampo ──────────────────────────────────────────────────────────

    /**
     * Analiza la calidad de un campo específico en Firebird.
     *
     * @param {string} sistema  SAE | COI | NOI | BANCO
     * @param {string} tabla    Nombre de la tabla (ej. FACTV01)
     * @param {string} campo    Nombre del campo (ej. IMPORTE)
     * @returns {Promise<{
     *   campo: string,
     *   completitud: number,
     *   cardinalidad: 'alta'|'media'|'baja',
     *   total_registros: number,
     *   valores_unicos: number,
     *   rango: { min: any, max: any },
     *   tipo_inferido: string
     * }>}
     */
    async analizarCampo(sistema, tabla, campo) {
        const key = this._cacheKey(sistema, tabla, campo);
        const cached = this._fromCache(key);
        if (cached) return cached;

        // Firebird no soporta COUNT(DISTINCT ...) en el mismo SELECT que COUNT(*) en todas
        // las versiones — usamos dos queries para seguridad.
        const sqlConteos = [
            `SELECT COUNT(*) AS TOTAL,`,
            `       COUNT(${campo}) AS NO_NULOS,`,
            `       MIN(${campo}) AS MINIMO,`,
            `       MAX(${campo}) AS MAXIMO`,
            `FROM ${tabla}`
        ].join(' ');

        const sqlDistintos = `SELECT COUNT(*) AS DISTINTOS FROM (SELECT DISTINCT ${campo} FROM ${tabla} WHERE ${campo} IS NOT NULL)`;

        const [filaConteos, filaDistintos] = await Promise.all([
            ejecutarConsulta(sistema, sqlConteos).then((r) => r[0] || {}),
            ejecutarConsulta(sistema, sqlDistintos).then((r) => r[0] || {})
        ]);

        const total = _num(filaConteos, 'TOTAL');
        const noNulos = _num(filaConteos, 'NO_NULOS');
        const distintos = _num(filaDistintos, 'DISTINTOS');

        const completitud = total > 0 ? Math.round((noNulos / total) * 100) : 0;

        let cardinalidad = 'desconocida';
        if (total > 0 && noNulos > 0) {
            const ratio = distintos / noNulos;
            cardinalidad = ratio >= 0.9 ? 'alta' : ratio >= 0.1 ? 'media' : 'baja';
        }

        const resultado = {
            campo,
            tipo_inferido: _clasificarCampo(campo),
            total_registros: total,
            completitud,          // % de registros con valor no nulo
            cardinalidad,         // 'alta' | 'media' | 'baja' según ratio distinct/non-null
            valores_unicos: distintos,
            rango: {
                min: _col(filaConteos, 'MINIMO'),
                max: _col(filaConteos, 'MAXIMO')
            }
        };

        this._toCache(key, resultado);
        return resultado;
    }

    // ── analizarTabla ──────────────────────────────────────────────────────────

    /**
     * Analiza los campos clave de una tabla (hasta 5: importes, fechas, claves).
     *
     * @param {string} sistema
     * @param {string} tabla
     * @returns {Promise<{
     *   tabla: string, sistema: string, disponible: boolean,
     *   campos_analizados: number, completitud_promedio: number,
     *   resumen: 'buena'|'regular'|'deficiente',
     *   calidad: Object
     * }>}
     */
    async analizarTabla(sistema, tabla) {
        const key = this._cacheKey(sistema, tabla, '__tabla__');
        const cached = this._fromCache(key);
        if (cached) return cached;

        // ─ 1. Obtener lista de campos desde el catálogo del sistema ─────────────
        const sqlCampos = [
            `SELECT TRIM(RDB$FIELD_NAME) AS CAMPO_NOMBRE`,
            `FROM RDB$RELATION_FIELDS`,
            `WHERE TRIM(RDB$RELATION_NAME) = '${tabla.toUpperCase()}'`,
            `ORDER BY RDB$FIELD_POSITION`
        ].join(' ');

        let todosCampos = [];
        try {
            const rows = await ejecutarConsulta(sistema, sqlCampos);
            todosCampos = rows
                .map((r) => String(_col(r, 'CAMPO_NOMBRE') || '').trim().toUpperCase())
                .filter(Boolean);
        } catch {
            // Si falla la consulta de metadatos, la tabla puede no existir
            const vacio = {
                tabla, sistema, disponible: false,
                campos_analizados: 0,
                completitud_promedio: null,
                resumen: 'sin_datos',
                calidad: {},
                mensaje: `No se pudieron obtener los campos de ${tabla}`
            };
            this._toCache(key, vacio);
            return vacio;
        }

        // ─ 2. Seleccionar los 5 campos clave (importes + fechas + claves) ────────
        const importes = todosCampos.filter((c) => PATRONES_TIPO.importe.test(c)).slice(0, 2);
        const fechas = todosCampos.filter((c) => PATRONES_TIPO.fecha.test(c)).slice(0, 2);
        const claves = todosCampos.filter((c) => PATRONES_TIPO.clave.test(c)).slice(0, 2);
        const camposClave = [...new Set([...importes, ...fechas, ...claves])].slice(0, 5);

        if (camposClave.length === 0) {
            const fallback = {
                tabla, sistema, disponible: true,
                campos_analizados: 0,
                completitud_promedio: null,
                resumen: 'sin_campos_clave',
                calidad: {},
                mensaje: `No se identificaron campos clave (importe/fecha/clave) en ${tabla}`
            };
            this._toCache(key, fallback);
            return fallback;
        }

        // ─ 3. Analizar cada campo en paralelo ──────────────────────────────────
        const calidad = {};
        await Promise.all(
            camposClave.map(async (campo) => {
                try {
                    calidad[campo] = await this.analizarCampo(sistema, tabla, campo);
                } catch (e) {
                    calidad[campo] = { campo, error: e.message, completitud: null };
                }
            })
        );

        // ─ 4. Calcular completitud promedio ────────────────────────────────────
        const completitudes = Object.values(calidad)
            .map((c) => c.completitud)
            .filter((v) => typeof v === 'number');

        const completitudPromedio =
            completitudes.length > 0
                ? Math.round(completitudes.reduce((a, b) => a + b, 0) / completitudes.length)
                : null;

        const resumen =
            completitudPromedio === null ? 'sin_datos'
                : completitudPromedio >= 80 ? 'buena'
                    : completitudPromedio >= 50 ? 'regular'
                        : 'deficiente';

        const resultado = {
            tabla,
            sistema,
            disponible: true,
            campos_analizados: camposClave.length,
            completitud_promedio: completitudPromedio,
            resumen,
            calidad,
            analizado_en: new Date().toISOString()
        };

        this._toCache(key, resultado);
        return resultado;
    }

    // ── detectarAnomalias ──────────────────────────────────────────────────────

    /**
     * Detecta anomalías en un campo según su tipo semántico.
     *
     * @param {string} sistema
     * @param {string} tabla
     * @param {string} campo
     * @param {'importe'|'fecha'|'clave'|'auto'} tipo
     *   Si 'auto', infiere el tipo desde el nombre del campo.
     * @returns {Promise<{
     *   campo: string, tipo: string,
     *   anomalias: Array<{tipo:string, descripcion:string, afectados:number}>,
     *   analizado_en: string
     * }>}
     */
    async detectarAnomalias(sistema, tabla, campo, tipo = 'auto') {
        const tipoFinal = tipo === 'auto' ? _clasificarCampo(campo) : tipo;
        const key = this._cacheKey(sistema, tabla, campo, 'anomalias', tipoFinal);
        const cached = this._fromCache(key);
        if (cached) return cached;

        const anomalias = [];

        try {
            if (tipoFinal === 'importe') {
                // Negativos donde no deberían existir
                const sql = `SELECT COUNT(*) CNT FROM ${tabla} WHERE ${campo} < 0`;
                const [r] = await ejecutarConsulta(sistema, sql);
                const cnt = _num(r, 'CNT');
                if (cnt > 0) {
                    anomalias.push({
                        tipo: 'negativos',
                        descripcion: `${cnt} registro(s) con valor negativo en ${campo}`,
                        afectados: cnt
                    });
                }

                // Nulos en campo de importe
                const sqlNulos = `SELECT COUNT(*) CNT FROM ${tabla} WHERE ${campo} IS NULL`;
                const [rn] = await ejecutarConsulta(sistema, sqlNulos);
                const cntNulos = _num(rn, 'CNT');
                if (cntNulos > 0) {
                    anomalias.push({
                        tipo: 'nulos',
                        descripcion: `${cntNulos} registro(s) con ${campo} nulo`,
                        afectados: cntNulos
                    });
                }
            }

            if (tipoFinal === 'fecha') {
                // Fechas fuera del rango 2000-2030
                const sql = [
                    `SELECT COUNT(*) CNT FROM ${tabla}`,
                    `WHERE ${campo} IS NOT NULL`,
                    `AND (${campo} < '2000-01-01' OR ${campo} > '2030-12-31')`
                ].join(' ');
                const [r] = await ejecutarConsulta(sistema, sql);
                const cnt = _num(r, 'CNT');
                if (cnt > 0) {
                    anomalias.push({
                        tipo: 'fuera_rango',
                        descripcion: `${cnt} registro(s) con ${campo} fuera del rango 2000-2030`,
                        afectados: cnt
                    });
                }
            }

            if (tipoFinal === 'clave') {
                // Duplicados en campo que debería ser único
                const sql = [
                    `SELECT COUNT(*) CNT FROM`,
                    `(SELECT ${campo} FROM ${tabla}`,
                    ` WHERE ${campo} IS NOT NULL`,
                    ` GROUP BY ${campo} HAVING COUNT(*) > 1) DUP`
                ].join(' ');
                const [r] = await ejecutarConsulta(sistema, sql);
                const cnt = _num(r, 'CNT');
                if (cnt > 0) {
                    anomalias.push({
                        tipo: 'duplicados',
                        descripcion: `${cnt} valor(es) duplicado(s) en ${campo}`,
                        afectados: cnt
                    });
                }
            }
        } catch (e) {
            anomalias.push({
                tipo: 'error_analisis',
                descripcion: `No se pudo analizar ${campo}: ${e.message}`,
                afectados: 0
            });
        }

        const resultado = {
            campo,
            tipo: tipoFinal,
            anomalias,
            analizado_en: new Date().toISOString()
        };

        this._toCache(key, resultado);
        return resultado;
    }

    // ── analizarTablaCompleto ──────────────────────────────────────────────────

    /**
     * Análisis completo: calidad + anomalías para todos los campos clave.
     * Devuelve {disponible: false} si Firebird no responde.
     */
    async analizarTablaCompleto(sistema, tabla) {
        const disponible = await this.firebirdDisponible(sistema);
        if (!disponible) {
            return { disponible: false, motivo: 'Conexión Firebird no disponible' };
        }

        const resumenCalidad = await this.analizarTabla(sistema, tabla);

        // Detectar anomalías para cada campo analizado
        const anomaliasPorCampo = {};
        if (resumenCalidad.calidad) {
            await Promise.all(
                Object.keys(resumenCalidad.calidad).map(async (campo) => {
                    try {
                        anomaliasPorCampo[campo] = await this.detectarAnomalias(
                            sistema, tabla, campo, 'auto'
                        );
                    } catch {
                        anomaliasPorCampo[campo] = { campo, anomalias: [], error: true };
                    }
                })
            );
        }

        return {
            ...resumenCalidad,
            anomalias: anomaliasPorCampo
        };
    }
}

// Singleton compartido — la caché vive con el proceso
const instancia = new AnalizadorCalidad();

module.exports = instancia;
module.exports.AnalizadorCalidad = AnalizadorCalidad;
