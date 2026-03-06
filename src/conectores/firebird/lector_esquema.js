'use strict';

/**
 * lector_esquema.js
 * Lee el esquema de una base de datos Aspel/Firebird directamente desde las
 * tablas de sistema RDB$ — sin CSV ni JSON intermedios.
 *
 * Todos los métodos devuelven arrays de objetos con claves en minúsculas
 * (node-firebird retorna MAYÚSCULAS cuando lowercase_keys:false, se normaliza
 * aquí para que el resto del código sea independiente del driver).
 */

const { ejecutarConsulta } = require('./conexion');

// ─── Mapa numérico de tipo_id Firebird → nombre legible ──────────────────────
const TIPOS_FB = {
    7: 'SMALLINT',
    8: 'INTEGER',
    10: 'FLOAT',
    12: 'DATE',
    13: 'TIME',
    14: 'CHAR',
    16: 'BIGINT',
    27: 'DOUBLE',
    35: 'TIMESTAMP',
    37: 'VARCHAR',
    40: 'CSTRING',
    261: 'BLOB',
};

/**
 * Resuelve el tipo_id numérico al nombre SQL del tipo.
 * @param {number|null} tipoId
 * @returns {string}
 */
function resolverTipo(tipoId) {
    return TIPOS_FB[tipoId] ?? `TIPO_${tipoId ?? '?'}`;
}

// ─── Helper: normaliza claves a minúsculas ────────────────────────────────────
function normalizar(filas) {
    return filas.map((fila) => {
        const salida = {};
        for (const [k, v] of Object.entries(fila)) {
            // Recorta strings con padding Firebird (CHAR fijo) en valores también
            salida[k.toLowerCase()] = (typeof v === 'string') ? v.trimEnd() : v;
        }
        return salida;
    });
}

// ─── 1. leerTablas ────────────────────────────────────────────────────────────
/**
 * Lista todas las tablas de usuario (no de sistema, no vistas) en la base de
 * datos Firebird del sistema Aspel indicado.
 *
 * @param {string} sistema  'SAE' | 'COI' | 'NOI' | 'BANCO'
 * @returns {Promise<Array<{tabla:string, es_sistema:number, es_vista:boolean}>>}
 */
async function leerTablas(sistema) {
    const sql = `
    SELECT
      TRIM(r.RDB$RELATION_NAME)  AS TABLA,
      r.RDB$SYSTEM_FLAG          AS ES_SISTEMA,
      r.RDB$VIEW_SOURCE          AS ES_VISTA
    FROM RDB$RELATIONS r
    WHERE r.RDB$SYSTEM_FLAG = 0
      AND r.RDB$VIEW_SOURCE IS NULL
    ORDER BY r.RDB$RELATION_NAME
  `;

    const filas = await ejecutarConsulta(sistema, sql);
    return normalizar(filas).map((f) => ({
        tabla: f.tabla,
        es_sistema: f.es_sistema ?? 0,
        es_vista: f.es_vista !== null && f.es_vista !== undefined,
    }));
}

// ─── 2. leerCampos ────────────────────────────────────────────────────────────
/**
 * Lee la definición de campos de una o todas las tablas de usuario.
 * Cuando `tabla` es null devuelve campos de todas las tablas.
 * Usa query parametrizada (?) para evitar inyección SQL.
 *
 * @param {string}      sistema
 * @param {string|null} [tabla=null]  Nombre de tabla en cualquier case (se normaliza a MAYÚSCULAS)
 * @returns {Promise<Array<{
 *   tabla:string, campo:string, tipo_id:number, tipo:string,
 *   longitud:number|null, precision:number|null, escala:number|null,
 *   no_nulo:number|null, posicion:number
 * }>>}
 */
async function leerCampos(sistema, tabla = null) {
    const filtroTabla = tabla
        ? 'AND TRIM(rf.RDB$RELATION_NAME) = ?'
        : '';

    const sql = `
    SELECT
      TRIM(rf.RDB$RELATION_NAME)  AS TABLA,
      TRIM(rf.RDB$FIELD_NAME)     AS CAMPO,
      f.RDB$FIELD_TYPE            AS TIPO_ID,
      f.RDB$FIELD_LENGTH          AS LONGITUD,
      f.RDB$FIELD_PRECISION       AS PRECISION_NUM,
      f.RDB$FIELD_SCALE           AS ESCALA,
      rf.RDB$NULL_FLAG            AS NO_NULO,
      rf.RDB$FIELD_POSITION       AS POSICION
    FROM RDB$RELATION_FIELDS rf
    JOIN RDB$FIELDS f
      ON rf.RDB$FIELD_SOURCE = f.RDB$FIELD_NAME
    WHERE rf.RDB$RELATION_NAME NOT STARTING WITH 'RDB$'
      ${filtroTabla}
    ORDER BY rf.RDB$RELATION_NAME, rf.RDB$FIELD_POSITION
  `;

    const params = tabla ? [tabla.toUpperCase()] : [];
    const filas = await ejecutarConsulta(sistema, sql, params);

    return normalizar(filas).map((f) => ({
        tabla: f.tabla,
        campo: f.campo,
        tipo_id: f.tipo_id,
        tipo: resolverTipo(f.tipo_id),
        longitud: f.longitud ?? null,
        precision: f.precision_num ?? null,
        escala: f.escala ?? null,
        no_nulo: f.no_nulo ?? null,
        posicion: f.posicion ?? 0,
    }));
}

// ─── 3. leerFKs ───────────────────────────────────────────────────────────────
/**
 * Lee todas las foreign keys definidas en la base de datos.
 * Retorna pares (tabla_origen.campo_fk → tabla_destino.campo_pk).
 *
 * @param {string} sistema
 * @returns {Promise<Array<{
 *   tabla_origen:string, campo_fk:string,
 *   tabla_destino:string, campo_pk:string
 * }>>}
 */
async function leerFKs(sistema) {
    const sql = `
    SELECT
      TRIM(rc.RDB$RELATION_NAME)   AS TABLA_ORIGEN,
      TRIM(ccs.RDB$FIELD_NAME)     AS CAMPO_FK,
      TRIM(rc2.RDB$RELATION_NAME)  AS TABLA_DESTINO,
      TRIM(ccs2.RDB$FIELD_NAME)    AS CAMPO_PK
    FROM RDB$REF_CONSTRAINTS refc
    JOIN RDB$RELATION_CONSTRAINTS rc
      ON refc.RDB$CONSTRAINT_NAME  = rc.RDB$CONSTRAINT_NAME
    JOIN RDB$RELATION_CONSTRAINTS rc2
      ON refc.RDB$CONST_NAME_UQ    = rc2.RDB$CONSTRAINT_NAME
    JOIN RDB$INDEX_SEGMENTS ccs
      ON rc.RDB$INDEX_NAME         = ccs.RDB$INDEX_NAME
    JOIN RDB$INDEX_SEGMENTS ccs2
      ON rc2.RDB$INDEX_NAME        = ccs2.RDB$INDEX_NAME
    ORDER BY rc.RDB$RELATION_NAME, ccs.RDB$FIELD_NAME
  `;

    const filas = await ejecutarConsulta(sistema, sql);
    return normalizar(filas).map((f) => ({
        tabla_origen: f.tabla_origen,
        campo_fk: f.campo_fk,
        tabla_destino: f.tabla_destino,
        campo_pk: f.campo_pk,
    }));
}

// ─── 4. leerIndices ───────────────────────────────────────────────────────────
/**
 * Lee todos los índices de usuario (no de sistema) junto con los campos que
 * los componen.  Un índice multi-columna aparece como N filas (una por campo),
 * ordenadas por RDB$FIELD_POSITION.
 *
 * @param {string}      sistema
 * @param {string|null} [tabla=null]  Filtra por tabla si se indica
 * @returns {Promise<Array<{
 *   tabla:string, indice:string, es_unico:number|null,
 *   es_descendente:number|null, campo:string, posicion:number
 * }>>}
 */
async function leerIndices(sistema, tabla = null) {
    const filtroTabla = tabla
        ? 'AND TRIM(i.RDB$RELATION_NAME) = ?'
        : '';

    const sql = `
    SELECT
      TRIM(i.RDB$RELATION_NAME)   AS TABLA,
      TRIM(i.RDB$INDEX_NAME)      AS INDICE,
      i.RDB$UNIQUE_FLAG           AS ES_UNICO,
      i.RDB$INDEX_TYPE            AS ES_DESCENDENTE,
      TRIM(s.RDB$FIELD_NAME)      AS CAMPO,
      s.RDB$FIELD_POSITION        AS POSICION
    FROM RDB$INDICES i
    JOIN RDB$INDEX_SEGMENTS s
      ON i.RDB$INDEX_NAME = s.RDB$INDEX_NAME
    WHERE i.RDB$SYSTEM_FLAG = 0
      ${filtroTabla}
    ORDER BY i.RDB$RELATION_NAME, i.RDB$INDEX_NAME, s.RDB$FIELD_POSITION
  `;

    const params = tabla ? [tabla.toUpperCase()] : [];
    const filas = await ejecutarConsulta(sistema, sql, params);

    return normalizar(filas).map((f) => ({
        tabla: f.tabla,
        indice: f.indice,
        es_unico: f.es_unico ?? null,
        es_descendente: f.es_descendente ?? null,
        campo: f.campo,
        posicion: f.posicion ?? 0,
    }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
    leerTablas,
    leerCampos,
    leerFKs,
    leerIndices,
    // Utilidades re-exportadas para consumidores que quieran el mapa de tipos
    TIPOS_FB,
    resolverTipo,
};
