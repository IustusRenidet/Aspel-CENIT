'use strict';

/**
 * src/middleware/validar_joi.js
 *
 * Librería de validación de inputs con Joi.
 *
 * Exporta:
 *  1. `validar(schema, target)`   — factory middleware genérico
 *  2. `esquemas`                  — objeto con todos los esquemas Joi del proyecto
 *  3. `SISTEMAS_VALIDOS`          — constante exportada para reuso
 *
 * Uso:
 *   const { validar, esquemas } = require('../middleware/validar_joi');
 *   router.post('/endpoint', validar(esquemas.ejecutarMetrica), ctrl.fn);
 */

const Joi = require('joi');

// ─── Constantes reutilizadas ──────────────────────────────────────────────────

const SISTEMAS_VALIDOS = ['SAE', 'COI', 'NOI', 'BANCO'];
const TIPOS_VIZ = ['barra', 'linea', 'pastel', 'kpi', 'tabla', 'dispersion', 'area', 'horizontal'];
const TIPOS_METRICA = ['escalar', 'serie', 'tabla'];

// ─── SQLGuard: rechaza SQL que no sea SELECT ──────────────────────────────────

/** Palabras clave de DML/DDL prohibidas en SQL de widgets */
const PALABRAS_PROHIBIDAS_SQL = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TRUNCATE', 'EXECUTE', 'EXEC', 'GRANT', 'REVOKE', 'MERGE'
];

const PATRON_NO_SELECT = /^\s*SELECT\b/i;
const PATRON_MULTI_STMT = /;\s*\S/;   // multiple statements   e.g. "SELECT 1; DROP TABLE"
const PATRON_COMENTARIOS = /--.*$|\/\*[\s\S]*?\*\//gm;

/**
 * Valida que un string SQL sea exactamente un SELECT.
 * - Elimina comentarios antes de analizar
 * - Rechaza múltiples statements
 * - Rechaza cualquier palabra DML/DDL
 * @param {string} sql
 * @returns {string|null} mensaje de error, o null si es válido
 */
function validarSqlSelect(sql) {
    if (!sql || typeof sql !== 'string') return 'SQL requerido';

    const limpio = sql.replace(PATRON_COMENTARIOS, ' ').trim();

    if (!PATRON_NO_SELECT.test(limpio)) {
        return 'Solo se permiten consultas SELECT';
    }

    if (PATRON_MULTI_STMT.test(limpio)) {
        return 'No se permiten múltiples sentencias SQL';
    }

    for (const kw of PALABRAS_PROHIBIDAS_SQL) {
        const re = new RegExp(`\\b${kw}\\b`, 'i');
        if (re.test(limpio)) {
            return `Palabra clave no permitida en SQL: ${kw}`;
        }
    }

    return null; // válido
}

/**
 * Validador personalizado Joi para SQL SELECT.
 */
const sqlSelectValidator = Joi.string()
    .trim()
    .min(10)
    .max(10000)
    .custom((value, helpers) => {
        const error = validarSqlSelect(value);
        if (error) return helpers.error('sql.noSelect', { message: error });
        return value;
    })
    .messages({
        'sql.noSelect': '{{#message}}'
    });

// ─── Esquemas Joi por endpoint ────────────────────────────────────────────────

const sistema = Joi.string()
    .uppercase()
    .valid(...SISTEMAS_VALIDOS)
    .messages({ 'any.only': `sistema debe ser uno de: ${SISTEMAS_VALIDOS.join(', ')}` });

const sistemasArray = Joi.array()
    .items(sistema)
    .max(4);

const paginacion = {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
};

// ── Métricas ──────────────────────────────────────────────────────────────────

const esquemas = {};

/** POST /api/metricas/:metricaId/ejecutar */
esquemas.ejecutarMetrica = Joi.object({
    sistema: sistema.optional(),
    params: Joi.object().max(50).optional(),
    parametros: Joi.object().max(50).optional(),   // alias, acepta ambos
    modo: Joi.string().valid('auto', 'real', 'simulado').default('auto'),
    omitir_cache: Joi.boolean().default(false)
});

/** POST /api/metricas/ejecutar-lote */
esquemas.ejecutarLote = Joi.object({
    metricas: Joi.array()
        .items(
            Joi.object({
                metricaId: Joi.string().trim().alphanum().max(100).optional(),
                id: Joi.string().trim().alphanum().max(100).optional(),
                metrica_id: Joi.string().trim().alphanum().max(100).optional(),
                sistema: sistema.optional(),
                parametros: Joi.object().max(50).optional(),
                params: Joi.object().max(50).optional(),
                modo: Joi.string().valid('auto', 'real', 'simulado').optional()
            }).or('metricaId', 'id', 'metrica_id')
        )
        .min(1)
        .max(20)
        .required()
});

// ── Inteligencia / Dashboard ──────────────────────────────────────────────────

/** POST /api/inteligencia/buscar */
esquemas.buscarInteligente = Joi.object({
    objetivo: Joi.string().trim().min(2).max(500).required(),
    sistemas: sistemasArray.optional(),
    limite: Joi.number().integer().min(1).max(50).default(12)
});

/** POST /api/dashboard/sugerir */
esquemas.sugerirDashboard = Joi.object({
    objetivo: Joi.string().trim().min(2).max(500).optional(),
    descripcion_negocio: Joi.string().trim().max(1000).optional(),
    periodo: Joi.string().trim().max(20).pattern(/^\d{4}(-\d{2})?$/).optional()
        .messages({ 'string.pattern.base': 'periodo debe tener formato YYYY o YYYY-MM' }),
    sistemas_activos: sistemasArray.optional(),
    maxWidgets: Joi.number().integer().min(1).max(20).default(8),
    num_columnas: Joi.number().integer().valid(2, 3).default(3)
});

/** POST /api/dashboard/ejecutar */
esquemas.ejecutarDashboard = Joi.object({
    widgets: Joi.array()
        .items(
            Joi.object({
                metrica_id: Joi.string().trim().alphanum().max(100).required(),
                sistema: sistema.optional(),
                parametros: Joi.object().max(50).optional()
            })
        )
        .min(1)
        .max(20)
        .required(),
    modo: Joi.string().valid('auto', 'real', 'simulado').default('auto')
});

// ── Paneles / Dashboards ──────────────────────────────────────────────────────

const widgetDePanelSchema = Joi.object({
    id: Joi.string().trim().max(100).optional(),
    metrica_id: Joi.string().trim().alphanum().max(100).optional(),
    sistema: sistema.optional(),
    tipo_viz: Joi.string().valid(...TIPOS_VIZ).optional(),
    titulo: Joi.string().trim().max(200).optional(),
    posicion: Joi.object({
        x: Joi.number().integer().min(0),
        y: Joi.number().integer().min(0),
        w: Joi.number().integer().min(1).max(12),
        h: Joi.number().integer().min(1).max(20)
    }).optional(),
    parametros: Joi.object().max(50).optional()
}).unknown(true);  // widgets pueden tener propiedades adicionales de GridStack

/** POST /api/paneles  |  PUT /api/paneles/:id */
esquemas.guardarPanel = Joi.object({
    id: Joi.string().trim().max(100).optional(),
    nombre: Joi.string().trim().min(1).max(200).required(),
    objetivo: Joi.string().trim().max(500).optional(),
    sistemas: sistemasArray.optional(),
    widgets: Joi.array().items(widgetDePanelSchema).max(30).optional(),
    layout: Joi.object().optional(),
    creado_en: Joi.string().isoDate().optional(),
    actualizado_en: Joi.string().isoDate().optional()
}).unknown(false);

// ── Conexiones Firebird ───────────────────────────────────────────────────────

/** PUT /api/conexiones/:sistema */
esquemas.actualizarConexion = Joi.object({
    host: Joi.string().trim().hostname().max(253).optional(),
    port: Joi.number().integer().min(1).max(65535).optional(),
    database: Joi.string().trim().max(512).optional(),
    user: Joi.string().trim().max(64).optional(),
    password: Joi.string().max(128).optional(),
    role: Joi.string().trim().max(32).allow(null, '').optional(),
    enabled: Joi.boolean().optional(),
    pageSize: Joi.number().integer().valid(1024, 2048, 4096, 8192, 16384).optional()
}).min(1);  // al menos un campo

// ── Widgets personalizados ────────────────────────────────────────────────────

/** POST /api/widgets  (crear widget custom) */
esquemas.guardarWidget = Joi.object({
    nombre: Joi.string().trim().min(1).max(200).required(),
    sistema: sistema.required(),
    sql: sqlSelectValidator.required(),
    tipo_viz: Joi.string().valid(...TIPOS_VIZ).default('tabla'),
    descripcion: Joi.string().trim().max(500).optional(),
    color_primario: Joi.string().trim().pattern(/^#[0-9a-fA-F]{3,8}$/).optional()
        .messages({ 'string.pattern.base': 'color_primario debe ser un color HEX válido (#RGB o #RRGGBB)' }),
    etiquetas: Joi.array().items(Joi.string().trim().max(50)).max(10).optional()
});

/** POST /api/widgets/preview */
esquemas.previewWidget = Joi.object({
    sql: sqlSelectValidator.required(),
    sistema: sistema.required(),
    parametros: Joi.object().max(50).optional()
});

/** POST /api/widgets/recomendar-viz */
esquemas.recomendarViz = Joi.object({
    columnas: Joi.array()
        .items(
            Joi.object({
                nombre: Joi.string().trim().max(64).required(),
                tipo: Joi.string().valid('numero', 'fecha', 'texto').required()
            })
        )
        .min(1)
        .max(20)
        .required(),
    muestra: Joi.array().items(Joi.object().unknown(true)).max(100).optional(),
    metrica_tipo: Joi.string().valid(...TIPOS_METRICA).optional()
});

/** POST /api/widgets/:id/ejecutar */
esquemas.ejecutarWidget = Joi.object({
    parametros: Joi.object().max(50).optional()
});

// ── Widget Studio ─────────────────────────────────────────────────────────────

/** POST /api/widget-studio/construir */
esquemas.construirWidget = Joi.object({
    tipo: Joi.string().trim().max(100).required(),
    sistema: sistema.required(),
    params: Joi.object().max(50).optional(),
    columnas: Joi.array().items(Joi.string().trim().max(64)).max(20).optional(),
    solo_sql: Joi.boolean().default(false)
});

/** POST /api/widget-studio/interpretar */
esquemas.interpretarWidget = Joi.object({
    texto: Joi.string().trim().min(3).max(500).required(),
    sistema: sistema.optional()
});

// ── Búsqueda ──────────────────────────────────────────────────────────────────

/** POST /api/inteligencia/generar-query */
esquemas.generarQuery = Joi.object({
    descripcion: Joi.string().trim().min(3).max(500).required(),
    sistema: sistema.required()
});

/** GET query params /api/busqueda/sugerencias */
esquemas.sugerenciasBusqueda = Joi.object({
    q: Joi.string().trim().min(1).max(100).required(),
    limit: Joi.number().integer().min(1).max(20).default(10),
    sistema: sistema.optional()
});

// ─── Factory: middleware genérico ─────────────────────────────────────────────

/**
 * Crea un middleware Express que valida `req[target]` contra `schema`.
 * En caso de error retorna 400 con todos los detalles de validación.
 *
 * @param {Joi.Schema} schema    — Esquema Joi a aplicar
 * @param {'body'|'query'|'params'} [target='body']  — Objeto a validar
 * @param {Joi.ValidationOptions} [joiOpts]          — Opciones Joi adicionales
 * @returns {import('express').RequestHandler}
 */
function validar(schema, target = 'body', joiOpts = {}) {
    const options = {
        abortEarly: false,   // mostrar todos los errores, no solo el primero
        stripUnknown: target === 'body',  // quitar campos desconocidos del body
        convert: true,
        allowUnknown: target !== 'body', // query/params pueden tener otros campos
        ...joiOpts
    };

    return function middlewareValidacion(req, res, next) {
        const dato = req[target];
        const { error, value } = schema.validate(dato, options);

        if (error) {
            const detalles = error.details.map(d => ({
                campo: d.path.join('.') || target,
                mensaje: d.message.replace(/['"]/g, '')
            }));

            return res.status(400).json({
                ok: false,
                error: 'Parámetros de entrada inválidos',
                detalles
            });
        }

        // Reemplazar con valor sanitizado/convertido por Joi
        req[target] = value;
        next();
    };
}

/**
 * Middleware especializado que valida SQL y rechaza cualquier cosa que no sea SELECT.
 * Puede usarse directamente en rutas o junto con un esquema Joi completo.
 *
 * @example
 *   router.post('/preview', validarSqlMiddleware, ctrl.previewSQL);
 */
function validarSqlMiddleware(req, res, next) {
    const sql = req.body?.sql;
    const error = validarSqlSelect(sql);
    if (error) {
        return res.status(400).json({ ok: false, error, campo: 'sql' });
    }
    next();
}

module.exports = {
    validar,
    validarSqlMiddleware,
    validarSqlSelect,
    esquemas,
    SISTEMAS_VALIDOS
};
