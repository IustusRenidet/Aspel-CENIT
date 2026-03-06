'use strict';

/**
 * generador_queries.js
 * Genera SQL dinámicamente para responder preguntas en lenguaje natural,
 * usando el esquema real del sistema Aspel leído desde Firebird (o caché JSON).
 */

const fs = require('fs-extra');
const path = require('path');

// ─── Constantes de NLP (paralelas a inteligencia_aspel, sin dep circular) ────

const STOP_WORDS = new Set([
    'de', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'para', 'por', 'con', 'sin',
    'del', 'al', 'un', 'una', 'unos', 'unas', 'que', 'como', 'mas', 'menos',
    'vs', 'entre', 'todo', 'toda', 'todos', 'todas', 'mi', 'su', 'sus',
    'se', 'es', 'son', 'a', 'u', 'me', 'te', 'le', 'nos', 'les'
]);

/** Mapa intención → keywords disparadores */
const INTENCIONES = {
    ventas: ['venta', 'ventas', 'factura', 'facturas', 'ticket', 'ingreso', 'cliente', 'vendedor', 'descuento', 'margen'],
    inventarios: ['inventario', 'inventarios', 'stock', 'existencia', 'existencias', 'rotacion', 'articulo', 'articulos', 'producto', 'productos', 'merma'],
    compras: ['compra', 'compras', 'proveedor', 'proveedores', 'orden', 'recepcion', 'costos', 'costo'],
    cxc: ['cxc', 'cartera', 'cobranza', 'cobro', 'cobros', 'vencida', 'vencidas', 'saldo'],
    contabilidad: ['contabilidad', 'poliza', 'polizas', 'balanza', 'cuenta', 'cuentas', 'activo', 'pasivo', 'capital', 'utilidad'],
    tesoreria: ['tesoreria', 'banco', 'bancos', 'flujo', 'cheque', 'cheques', 'conciliacion', 'egreso', 'egresos'],
    nomina: ['nomina', 'empleado', 'empleados', 'sueldo', 'sueldos', 'rrhh', 'percepcion', 'deduccion', 'imss', 'isr'],
};

/** Intención → módulos del diccionario semántico */
const INTENCION_MODULOS = {
    ventas: ['ventas', 'facturas', 'clientes', 'ventas y cxc'],
    inventarios: ['inventarios', 'almacen', 'articulos'],
    compras: ['compras', 'proveedores', 'ordenes'],
    cxc: ['cartera', 'cobranza', 'cxc', 'cobros'],
    contabilidad: ['contabilidad', 'polizas', 'balanza'],
    tesoreria: ['tesoreria', 'bancos', 'caja'],
    nomina: ['nomina', 'personal', 'empleados', 'rrhh'],
};

const SINONIMOS = new Map([
    ['ventas', ['facturacion', 'factura', 'ingreso', 'cobro']],
    ['ingresos', ['ventas', 'facturacion', 'factura']],
    ['facturacion', ['ventas', 'ingresos', 'factura', 'ticket']],
    ['compras', ['adquisiciones', 'compra', 'adquisicion', 'proveedor']],
    ['empleados', ['personal', 'trabajadores', 'nomina']],
    ['cobranza', ['cxc', 'cartera', 'cobros', 'cobro', 'saldo']],
    ['gastos', ['egresos', 'costos', 'costo', 'gasto']],
    ['existencias', ['inventario', 'stock', 'almacen', 'existencia']],
    ['inventario', ['existencias', 'stock', 'almacen']],
    ['articulos', ['productos', 'articulo', 'producto']],
    ['productos', ['articulos', 'articulo', 'producto']],
]);

/** Verbos/intención que determinan el tipo de SELECT a construir */
const INTENCIONES_CONSULTA = {
    contar: ['cuantos', 'cuantas', 'cuanto', 'cuenta', 'count', 'numero de', 'cantidad de', 'total de registros'],
    sumar: ['total', 'suma', 'sumar', 'importe total', 'monto total', 'monto', 'acumulado'],
    promediar: ['promedio', 'media', 'average', 'avg'],
    listar: ['lista', 'listado', 'ver', 'mostrar', 'detalle', 'todos', 'todas'],
};

// ─── Helpers de normalización ─────────────────────────────────────────────────

function normalizarTexto(v = '') {
    return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokenizar(v = '') {
    return normalizarTexto(v)
        .split(/[^a-z0-9]+/g)
        .filter(Boolean)
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function expandirConSinonimos(tokens) {
    const res = new Set(tokens);
    for (const t of tokens) {
        const sins = SINONIMOS.get(t);
        if (sins) sins.forEach((s) => res.add(s));
    }
    return Array.from(res);
}

/** Detecta qué intenciones INTENCIONES[] están activadas por los tokens */
function detectarIntenciones(tokens) {
    const activas = new Set();
    for (const [intencion, keywords] of Object.entries(INTENCIONES)) {
        if (tokens.some((t) => keywords.includes(t))) activas.add(intencion);
    }
    return Array.from(activas);
}

/** Detecta el verbo de consulta (contar/sumar/promediar/listar/default) */
function detectarVerboConsulta(descripcion) {
    const norm = normalizarTexto(descripcion);
    for (const [verbo, frases] of Object.entries(INTENCIONES_CONSULTA)) {
        if (frases.some((f) => norm.includes(f))) return verbo;
    }
    return 'default';
}

/** Detecta si la descripción menciona un periodo de fechas */
function detectarFiltroFecha(descripcion) {
    const norm = normalizarTexto(descripcion);

    // meses en español (nombre o número)
    const MESES_NOMBRE = {
        enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
        julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
        ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
        jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
    };

    // año de 4 dígitos
    const anioMatch = norm.match(/\b(20\d{2})\b/);
    const anio = anioMatch ? parseInt(anioMatch[1]) : null;

    // mes como número explícito
    const mesNumMatch = norm.match(/\bmes\s+(\d{1,2})\b/);
    let mesNum = mesNumMatch ? parseInt(mesNumMatch[1]) : null;

    // mes como nombre
    if (!mesNum) {
        for (const [nombre, num] of Object.entries(MESES_NOMBRE)) {
            if (norm.includes(nombre)) { mesNum = num; break; }
        }
    }

    // trimestre Q1–Q4
    const qMatch = norm.match(/\bq([1-4])\b/);
    const trimestre = qMatch ? parseInt(qMatch[1]) : null;

    if (!anio && !mesNum && !trimestre) return null;

    const anioBase = anio || new Date().getFullYear();

    if (trimestre) {
        const mesInicio = (trimestre - 1) * 3 + 1;
        const mesFin = mesInicio + 2;
        return {
            fecha_ini: `${anioBase}-${String(mesInicio).padStart(2, '0')}-01`,
            fecha_fin: `${anioBase}-${String(mesFin).padStart(2, '0')}-${mesFin === 2 ? '28' : '30'}`,
            descripcion: `Q${trimestre} ${anioBase}`,
        };
    }

    if (mesNum) {
        const mesStr = String(mesNum).padStart(2, '0');
        return {
            fecha_ini: `${anioBase}-${mesStr}-01`,
            fecha_fin: `${anioBase}-${mesStr}-30`,
            descripcion: `mes ${mesNum} / ${anioBase}`,
        };
    }

    // Sólo año
    return {
        fecha_ini: `${anioBase}-01-01`,
        fecha_fin: `${anioBase}-12-31`,
        descripcion: `año ${anioBase}`,
    };
}

// ─── Clase principal ───────────────────────────────────────────────────────────

class GeneradorQueries {
    constructor() {
        this._dirRaiz = process.cwd();
        this._cacheSemantica = new Map(); // sistema → { data, ts }
        this._cacheCatalogo = new Map(); // sistema → { data, ts }
        this._CACHE_TTL = Number(process.env.CENIT_CACHE_TTL || 5 * 60 * 1000);
    }

    // ── Carga de datos de esquema ───────────────────────────────────────────────

    async _cargarSemantica(sistema) {
        const cached = this._cacheSemantica.get(sistema);
        if (cached && (Date.now() - cached.ts) < this._CACHE_TTL) return cached.data;

        const archivo = path.join(this._dirRaiz, 'diccionario', `semantica_${sistema}.json`);
        if (!await fs.pathExists(archivo)) return null;

        const data = await fs.readJson(archivo);
        this._cacheSemantica.set(sistema, { data, ts: Date.now() });
        return data;
    }

    async _cargarCatalogo(sistema) {
        const cached = this._cacheCatalogo.get(sistema);
        if (cached && (Date.now() - cached.ts) < this._CACHE_TTL) return cached.data;

        const archivo = path.join(this._dirRaiz, 'diccionario', `catalogo_tecnico_${sistema}.json`);
        if (!await fs.pathExists(archivo)) return null;

        const data = await fs.readJson(archivo);
        this._cacheCatalogo.set(sistema, { data, ts: Date.now() });
        return data;
    }

    // ── detectarTablaObjetivo ──────────────────────────────────────────────────

    /**
     * Retorna { tabla, score } donde score es 0–1.
     *
     * Estrategia de puntuación:
     *   A) Tags de la tabla que aparecen en los tokens expandidos  (peso 0.50)
     *   B) Módulo de la tabla que coincide con intenciones activas  (peso 0.30)
     *   C) Nombre de tabla que contiene algún token                (peso 0.20)
     *
     * @param {string}   sistema
     * @param {string[]} tokensExpandidos  tokenizar() + expandirConSinonimos()
     * @param {string[]} tokensRaw         tokenizar() sin expandir
     * @param {Object}   tablasSemantica   semanticaJson.tablas
     */
    detectarTablaObjetivo(sistema, tokensExpandidos, tokensRaw, tablasSemantica) {
        const intenciones = detectarIntenciones(tokensRaw);

        // Módulos habilitados por las intenciones detectadas
        const modulosActivos = new Set(
            intenciones.flatMap((i) => (INTENCION_MODULOS[i] || []).map(normalizarTexto))
        );

        let mejorTabla = null;
        let mejorScore = -1;

        for (const [nombre, info] of Object.entries(tablasSemantica)) {
            const tags = (info.tags || []).map(normalizarTexto);
            const modulo = normalizarTexto(info.modulo || '');
            const nombreNorm = normalizarTexto(nombre);

            // A) solapamiento de tags
            const tagsMatch = tags.filter((t) => tokensExpandidos.includes(t)).length;
            const scoreA = tags.length > 0 ? tagsMatch / tags.length : 0;

            // B) módulo
            const scoreB = modulosActivos.size > 0 && modulosActivos.has(modulo) ? 1 : 0;

            // C) nombre de tabla
            const scoreC = tokensRaw.some((t) => nombreNorm.includes(t) || t.includes(nombreNorm.slice(0, 4)))
                ? 1 : 0;

            const score = scoreA * 0.50 + scoreB * 0.30 + scoreC * 0.20;

            if (score > mejorScore) {
                mejorScore = score;
                mejorTabla = nombre;
            }
        }

        return { tabla: mejorTabla, score: Math.max(0, mejorScore) };
    }

    // ── construirSELECT ────────────────────────────────────────────────────────

    /**
     * Construye un SELECT Firebird a partir de los metadatos semánticos de la tabla.
     *
     * @param {string} tabla             Nombre de tabla en MAYÚSCULAS
     * @param {Object} camposSemantica   semantica.tablas[tabla].campos  (objeto campo→info)
     * @param {Object} camposCatalogo    catalogo.tablas[tabla].campos[] convertido a objeto
     * @param {Object|null} filtroFecha  Resultado de detectarFiltroFecha()
     * @param {string[]} tokensRaw
     * @returns {{ sql:string, parametros:Object, campos_seleccionados:string[] }}
     */
    construirSELECT(tabla, camposSemantica, camposCatalogo, filtroFecha, tokensRaw) {
        const verbo = detectarVerboConsulta(tokensRaw.join(' '));

        // Clasificar campos por tipo semántico
        const porTipo = {
            importe: [],
            cantidad: [],
            fecha: [],
            clave: [],
            descripcion: [],
            texto: [],
        };

        // Priorizar semantica; fallback a inferir del nombre/tipo del catálogo
        const todosLosCampos = new Set([
            ...Object.keys(camposSemantica),
            ...Object.keys(camposCatalogo),
        ]);

        for (const campo of todosLosCampos) {
            const sem = camposSemantica[campo];
            const cat = camposCatalogo[campo];
            const tipoSem = sem?.tipo_semantico || _inferirTipoSemantico(campo, cat);

            if (porTipo[tipoSem]) {
                porTipo[tipoSem].push(campo);
            } else {
                porTipo.texto.push(campo);
            }
        }

        const campoFecha = porTipo.fecha[0] || null;
        const camposImporte = porTipo.importe.slice(0, 3);
        const camposCant = porTipo.cantidad.slice(0, 2);
        const camposTexto = [...porTipo.descripcion.slice(0, 2), ...porTipo.texto.slice(0, 2)].slice(0, 2);
        const camposClave = porTipo.clave.slice(0, 1);

        // ── Construir columnas SELECT ──────────────────────────────────────────
        let columnasSQL = [];
        let campos_seleccionados = [];

        if (verbo === 'contar') {
            columnasSQL = ['COUNT(*) AS TOTAL_REGISTROS'];
            campos_seleccionados = ['TOTAL_REGISTROS'];

            if (camposTexto.length) {
                columnasSQL = [
                    ...camposTexto.map((c) => `  ${c}`),
                    '  COUNT(*) AS TOTAL_REGISTROS',
                ];
                campos_seleccionados = [...camposTexto, 'TOTAL_REGISTROS'];
            }

        } else if (verbo === 'sumar') {
            if (camposImporte.length) {
                columnasSQL = camposImporte.map((c) => `  SUM(${c}) AS TOTAL_${c}`);
                campos_seleccionados = camposImporte.map((c) => `TOTAL_${c}`);
                if (camposTexto.length) {
                    columnasSQL = [
                        ...camposTexto.map((c) => `  ${c}`),
                        ...columnasSQL,
                    ];
                    campos_seleccionados = [...camposTexto, ...campos_seleccionados];
                }
            } else {
                // No hay importes — caer en default
                columnasSQL = _columnasDefault(campoFecha, camposTexto, camposClave, camposImporte);
                campos_seleccionados = columnasSQL.map((c) => c.trim().split(/\s+/)[0]);
            }

        } else if (verbo === 'promediar') {
            if (camposImporte.length || camposCant.length) {
                const fuente = camposImporte.length ? camposImporte : camposCant;
                columnasSQL = fuente.map((c) => `  AVG(${c}) AS PROMEDIO_${c}`);
                campos_seleccionados = fuente.map((c) => `PROMEDIO_${c}`);
                if (camposTexto.length) {
                    columnasSQL = [...camposTexto.map((c) => `  ${c}`), ...columnasSQL];
                    campos_seleccionados = [...camposTexto, ...campos_seleccionados];
                }
            } else {
                columnasSQL = _columnasDefault(campoFecha, camposTexto, camposClave, camposImporte);
                campos_seleccionados = columnasSQL.map((c) => c.trim().split(/\s+/)[0]);
            }

        } else {
            // 'listar' y 'default'
            columnasSQL = _columnasDefault(campoFecha, camposTexto, camposClave, camposImporte);
            campos_seleccionados = columnasSQL.map((c) => c.trim().split(/\s+/)[0]);
        }

        // ── WHERE fecha ────────────────────────────────────────────────────────
        const parametros = {};
        let clausulaWhere = '';

        if (filtroFecha && campoFecha) {
            parametros.fecha_ini = filtroFecha.fecha_ini;
            parametros.fecha_fin = filtroFecha.fecha_fin;
            clausulaWhere = `\nWHERE ${campoFecha} BETWEEN :fecha_ini AND :fecha_fin`;
        }

        // ── ORDER BY ───────────────────────────────────────────────────────────
        let clausulaOrder = '';
        if (campoFecha) {
            clausulaOrder = `\nORDER BY ${campoFecha} DESC`;
        } else if (camposClave.length) {
            clausulaOrder = `\nORDER BY ${camposClave[0]}`;
        }

        // ── GROUP BY (sólo para agregaciones con texto) ────────────────────────
        let clausulaGroup = '';
        const tieneAgregados = columnasSQL.some((c) => /SUM\s*\(|COUNT\s*\(|AVG\s*\(/.test(c));
        if (['contar', 'sumar', 'promediar'].includes(verbo) && camposTexto.length && tieneAgregados) {
            clausulaGroup = `\nGROUP BY ${camposTexto.join(', ')}`;
            const ultimaAgregacion = columnasSQL[columnasSQL.length - 1].trim().split(/\s+/).pop();
            clausulaOrder = `\nORDER BY ${ultimaAgregacion} DESC`;
        }

        // ── Ensamblar SQL ──────────────────────────────────────────────────────
        const estaAgregando = ['contar', 'sumar', 'promediar'].includes(verbo);
        const limiteStr = estaAgregando ? '' : 'FIRST 100 ';

        const sql = [
            `SELECT ${limiteStr}`,
            columnasSQL.join(',\n'),
            `FROM ${tabla}`,
            clausulaWhere,
            clausulaGroup,
            clausulaOrder,
        ].filter(Boolean).join('').trim();

        return { sql, parametros, campos_seleccionados };
    }

    // ── generarQuery ───────────────────────────────────────────────────────────

    /**
     * Punto de entrada principal.
     * @param {string} sistema      'SAE' | 'COI' | 'NOI' | 'BANCO'
     * @param {string} descripcion  Pregunta en lenguaje natural
     * @returns {Promise<{sql:string|null, tabla:string|null, campos:string[],
     *                    parametros:Object, confianza:number, origen_esquema:string}>}
     */
    async generarQuery(sistema, descripcion) {
        const sistemaUpper = String(sistema).toUpperCase();

        // 1. Cargar esquema semántico (cache JSON o live)
        const semantica = await this._cargarSemantica(sistemaUpper);
        if (!semantica || !semantica.tablas) {
            return {
                sql: null, tabla: null, campos: [], parametros: {},
                confianza: 0,
                origen_esquema: 'none',
                advertencia: `No hay esquema semántico disponible para ${sistemaUpper}`,
            };
        }

        // 2. Tokenizar y expandir
        const tokensRaw = tokenizar(descripcion);
        const tokensExpandidos = expandirConSinonimos(tokensRaw);
        const tablasSemantica = semantica.tablas;

        // 3. Detectar tabla objetivo
        const { tabla, score } = this.detectarTablaObjetivo(
            sistemaUpper, tokensExpandidos, tokensRaw, tablasSemantica
        );

        if (!tabla) {
            return {
                sql: null, tabla: null, campos: [], parametros: {},
                confianza: 0, origen_esquema: 'semantica',
                advertencia: 'No se encontró tabla relevante para la descripción dada',
            };
        }

        // 4. Obtener metadatos de la tabla
        const infoTablaSemantica = tablasSemantica[tabla] || {};
        const camposSemantica = infoTablaSemantica.campos || {};  // objeto campo→info

        const catalogo = await this._cargarCatalogo(sistemaUpper);
        // catalogo.tablas[tabla].campos es array → convertir a objeto
        const camposCatalogo = {};
        for (const c of (catalogo?.tablas?.[tabla]?.campos || [])) {
            camposCatalogo[c.nombre] = c;
        }

        // 5. Construir SELECT
        const filtroFecha = detectarFiltroFecha(descripcion);
        const { sql, parametros, campos_seleccionados } = this.construirSELECT(
            tabla, camposSemantica, camposCatalogo, filtroFecha, tokensRaw
        );

        // 6. Calcular confianza (0–100)
        const tokensCubiertos = tokensRaw.filter((t) =>
            (infoTablaSemantica.tags || []).map(normalizarTexto).includes(t) ||
            normalizarTexto(infoTablaSemantica.modulo || '').includes(t)
        ).length;
        const coberturaTokens = tokensRaw.length > 0 ? tokensCubiertos / tokensRaw.length : 0;
        const confianza = Math.round(score * 0.60 * 100 + coberturaTokens * 0.40 * 100);

        return {
            sql,
            tabla,
            campos: campos_seleccionados,
            parametros,
            confianza: Math.min(100, confianza),
            origen_esquema: semantica.generado_en ? 'semantica' : 'live',
            modulo: infoTablaSemantica.modulo || null,
            descripcion_tabla: infoTablaSemantica.descripcion || null,
            filtro_fecha_detectado: filtroFecha ? filtroFecha.descripcion : null,
        };
    }
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

/** Infiere tipo semántico cuando el diccionario semántico no tiene el campo */
function _inferirTipoSemantico(nombreCampo, infoCatalogo) {
    const n = nombreCampo.toUpperCase();
    const td = (infoCatalogo?.tipo_detalle || '').toUpperCase();

    if (/^(FEC|FECHA|DATE|DT|FE[CX])/.test(n) || ['DATE', 'TIMESTAMP'].includes(td)) return 'fecha';
    if (/^(IMP|MONTO|TOT|NETO|IMPT|IMPO|SUBTOT|TOTAL)/.test(n)) return 'importe';
    if (/^(CANT|QTY|CANTIDAD|NUM_|NUMERO)/.test(n)) return 'cantidad';
    if (/^(CVE|CLA|COD|ID|CLAVE|FOLIO)/.test(n)) return 'clave';
    if (/^(DESC|NOM|NOMBRE|DESCRIP|OBS|NOTA)/.test(n)) return 'descripcion';
    if (['VARCHAR', 'CHAR', 'CSTRING'].includes(td)) return 'texto';
    if (['DOUBLE', 'FLOAT', 'INTEGER', 'BIGINT', 'SMALLINT'].includes(td)) return 'importe';
    return 'texto';
}

/** Construye la lista de columnas para SELECT por defecto / listado */
function _columnasDefault(campoFecha, camposTexto, camposClave, camposImporte) {
    const cols = [];
    if (campoFecha) cols.push(`  ${campoFecha}`);
    if (camposClave.length) cols.push(`  ${camposClave[0]}`);
    camposTexto.forEach((c) => cols.push(`  ${c}`));
    camposImporte.slice(0, 2).forEach((c) => cols.push(`  ${c}`));
    // Si no encontramos nada, al menos pedimos todo
    return cols.length ? cols : ['  *'];
}

// ─── Singleton + constructor exportado ────────────────────────────────────────

const instancia = new GeneradorQueries();
module.exports = instancia;
module.exports.GeneradorQueries = GeneradorQueries;
