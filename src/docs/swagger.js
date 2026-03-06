'use strict';
/**
 * Configuración OpenAPI 3.0 para Aspel-CENIT
 * Expone documentación interactiva en /api/docs (solo entorno desarrollo)
 */

const swaggerJsdoc = require('swagger-jsdoc');

const definition = {
    openapi: '3.0.3',
    info: {
        title: 'Aspel-CENIT API',
        version: '1.0.0',
        description: `Dashboard ejecutivo inteligente para sistemas Aspel (SAE · COI · NOI · BANCO).
      
Consolida y reporta datos de bases Firebird mediante métricas definidas en YAML, 
con motor de inferencia semántica, Widget Studio y asistente NLP integrado.`,
        contact: {
            name: 'RintelGatachi',
            email: 'iustusrenidet@gmail.com',
            url: 'https://github.com/IustusRenidet/Aspel-CENIT'
        },
        license: { name: 'ISC' }
    },
    servers: [
        { url: 'http://localhost:3000', description: 'Desarrollo local' }
    ],
    tags: [
        { name: 'General', description: 'Health check y recarga de contexto' },
        { name: 'Métricas', description: 'Catálogo y ejecución de métricas YAML' },
        { name: 'Inteligencia', description: 'Búsqueda semántica y sugerencia de dashboards' },
        { name: 'Tablas', description: 'Explorador de esquema y calidad de datos' },
        { name: 'Paneles', description: 'Dashboards guardados (CRUD)' },
        { name: 'Conexiones', description: 'Configuración de conexiones Firebird' },
        { name: 'Widget Studio', description: 'Constructor interactivo de widgets personalizados' },
        { name: 'Widgets', description: 'Motor de widgets con SQL seguro y parámetros dinámicos' }
    ],
    components: {
        schemas: {
            // ── Respuesta genérica ─────────────────────────────────────
            RespuestaOK: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean', example: true },
                    data: { description: 'Datos de la respuesta', nullable: true }
                }
            },
            RespuestaError: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Mensaje de error descriptivo' }
                }
            },

            // ── Sistemas Aspel ────────────────────────────────────────
            Sistema: {
                type: 'string',
                enum: ['SAE', 'COI', 'NOI', 'BANCO'],
                description: 'Sistema Aspel origen de los datos'
            },

            // ── Métrica YAML ──────────────────────────────────────────
            Metrica: {
                type: 'object',
                required: ['id', 'nombre', 'sistema', 'tipo'],
                properties: {
                    id: { type: 'string', example: 'ventas_mes_actual' },
                    nombre: { type: 'string', example: 'Ventas del Mes Actual' },
                    descripcion: { type: 'string', example: 'Total de ventas facturadas en el mes en curso' },
                    sistema: { $ref: '#/components/schemas/Sistema' },
                    categoria: { type: 'string', example: 'ventas' },
                    tipo: {
                        type: 'string',
                        enum: ['escalar', 'serie', 'tabla'],
                        example: 'escalar'
                    },
                    tablas_referenciadas: { type: 'array', items: { type: 'string' }, example: ['CFDOC', 'CFDOC_D'] },
                    tags_inteligencia: { type: 'array', items: { type: 'string' }, example: ['ventas', 'facturacion'] }
                }
            },

            // ── Resultado de ejecución ─────────────────────────────────
            ResultadoMetrica: {
                type: 'object',
                properties: {
                    metrica_id: { type: 'string' },
                    sistema: { $ref: '#/components/schemas/Sistema' },
                    tipo: { type: 'string' },
                    valor: { description: 'Valor escalar (para tipo=escalar)', nullable: true },
                    filas: { type: 'array', items: { type: 'object' }, description: 'Filas (para tipo=tabla o serie)' },
                    total_filas: { type: 'integer' },
                    ejecutado_en: { type: 'string', format: 'date-time' }
                }
            },

            // ── Panel (Dashboard guardado) ────────────────────────────
            Panel: {
                type: 'object',
                required: ['nombre'],
                properties: {
                    id: { type: 'string', example: 'panel_1700000000000' },
                    nombre: { type: 'string', example: 'Dashboard Ejecutivo Q1' },
                    objetivo: { type: 'string', example: 'Ventas y cobranza primer trimestre' },
                    sistemas: { type: 'array', items: { $ref: '#/components/schemas/Sistema' } },
                    widgets: { type: 'array', items: { type: 'object' } },
                    vizTypes: { type: 'object', additionalProperties: { type: 'string' } },
                    creado_en: { type: 'string', format: 'date-time' },
                    actualizado_en: { type: 'string', format: 'date-time' }
                }
            },

            // ── Conexión Firebird ─────────────────────────────────────
            Conexion: {
                type: 'object',
                required: ['host', 'database'],
                properties: {
                    host: { type: 'string', example: '127.0.0.1' },
                    port: { type: 'integer', example: 3050 },
                    database: { type: 'string', example: 'C:\\Aspel\\SAE90EMPRE01.FDB' },
                    user: { type: 'string', example: 'SYSDBA' },
                    password: { type: 'string', format: 'password', writeOnly: true },
                    enabled: { type: 'boolean', example: true }
                }
            },

            // ── Widget personalizado ──────────────────────────────────
            Widget: {
                type: 'object',
                required: ['nombre', 'sql', 'sistema'],
                properties: {
                    id: { type: 'string' },
                    nombre: { type: 'string', example: 'Top 10 clientes por venta' },
                    descripcion: { type: 'string', example: 'Ranking de clientes del mes' },
                    sistema: { $ref: '#/components/schemas/Sistema' },
                    sql: { type: 'string', example: 'SELECT NOMCLI, SUM(IMPORTE) AS TOTAL FROM CFDOC GROUP BY NOMCLI ORDER BY TOTAL DESC ROWS 10' },
                    tipo_viz: { type: 'string', enum: ['tabla', 'barra', 'linea', 'pastel', 'kpi', 'area'], example: 'barra' },
                    color_primario: { type: 'string', example: '#6366f1' },
                    params_dinamicos: { type: 'array', items: { type: 'string' }, example: ['mes', 'ejercicio'] },
                    columnas_detectadas: { type: 'array', items: { type: 'object' } },
                    creado_en: { type: 'string', format: 'date-time' }
                }
            },

            // ── Calidad de datos ──────────────────────────────────────
            ReporteCalidad: {
                type: 'object',
                properties: {
                    tabla: { type: 'string' },
                    sistema: { $ref: '#/components/schemas/Sistema' },
                    total_filas: { type: 'integer' },
                    columnas: { type: 'array', items: { type: 'object' } },
                    score_global: { type: 'number', minimum: 0, maximum: 100 },
                    generado_en: { type: 'string', format: 'date-time' }
                }
            },

            // ── Dashboard sugerido ────────────────────────────────────
            DashboardSugerido: {
                type: 'object',
                properties: {
                    generado_en: { type: 'string', format: 'date-time' },
                    objetivo: { type: 'string' },
                    sistemas: { type: 'array', items: { $ref: '#/components/schemas/Sistema' } },
                    widgets: { type: 'array', items: { type: 'object' } },
                    recomendaciones: { type: 'array', items: { type: 'string' } },
                    resumen: { type: 'object' }
                }
            }
        },

        parameters: {
            SistemaParam: {
                name: 'sistema',
                in: 'path',
                required: true,
                schema: { $ref: '#/components/schemas/Sistema' },
                description: 'Código del sistema Aspel'
            },
            TablaParam: {
                name: 'tabla',
                in: 'path',
                required: true,
                schema: { type: 'string' },
                example: 'CFDOC'
            }
        }
    }
};

const options = {
    definition,
    apis: [
        './src/rutas/*.rutas.js',
        './src/docs/schemas.yaml'   // YAML adicional si existe
    ]
};

module.exports = swaggerJsdoc(options);
