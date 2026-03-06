/**
 * @swagger
 * /api/health:
 *   get:
 *     tags: [General]
 *     summary: Estado de salud de la API
 *     description: Devuelve sistemas Aspel disponibles con conteo de métricas y tablas.
 *     responses:
 *       200:
 *         description: API operativa
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - sistema: SAE
 *                   metricas: 12
 *                   tablas: 45
 *
 * /api/sistemas:
 *   get:
 *     tags: [General]
 *     summary: Lista todos los sistemas Aspel con sus catálogos
 *     responses:
 *       200:
 *         description: Sistemas disponibles
 *
 * /api/admin/recargar-contexto:
 *   post:
 *     tags: [General]
 *     summary: Recarga caché de métricas YAML y esquemas semánticos
 *     responses:
 *       200:
 *         description: Caché recargado
 *
 * /api/metricas:
 *   get:
 *     tags: [Métricas]
 *     summary: Lista métricas del catálogo YAML
 *     parameters:
 *       - name: sistema
 *         in: query
 *         schema:
 *           type: string
 *           enum: [SAE, COI, NOI, BANCO]
 *       - name: categoria
 *         in: query
 *         schema: { type: string }
 *       - name: tipo
 *         in: query
 *         schema:
 *           type: string
 *           enum: [escalar, serie, tabla]
 *       - name: q
 *         in: query
 *         description: Texto libre con fuzzy matching y expansión de sinónimos
 *         schema: { type: string }
 *       - name: modulo
 *         in: query
 *         description: Módulo Aspel (facturas, cobranza, inventarios…)
 *         schema: { type: string }
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - name: limit
 *         in: query
 *         description: Filas por página (máx 100)
 *         schema: { type: integer, default: 20, maximum: 100 }
 *     responses:
 *       200:
 *         description: Lista paginada de métricas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:         { type: boolean }
 *                 data:       { type: array, items: { $ref: '#/components/schemas/Metrica' } }
 *                 total:      { type: integer }
 *                 page:       { type: integer }
 *                 limit:      { type: integer }
 *                 totalPages: { type: integer }
 *
 * /api/metricas/{metricaId}:
 *   get:
 *     tags: [Métricas]
 *     summary: Detalle de una métrica por ID
 *     parameters:
 *       - name: metricaId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: ventas_mes_actual
 *     responses:
 *       200:
 *         description: Métrica encontrada
 *       404:
 *         description: Métrica no encontrada
 *
 * /api/metricas/{metricaId}/ejecutar:
 *   post:
 *     tags: [Métricas]
 *     summary: Ejecuta una métrica contra Firebird
 *     description: |
 *       Traduce SQL DuckDB → Firebird, ejecuta y formatea el resultado
 *       (escalar / serie / tabla).
 *     parameters:
 *       - name: metricaId
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sistema:
 *                 type: string
 *                 enum: [SAE, COI, NOI, BANCO]
 *               params:
 *                 type: object
 *           example:
 *             sistema: SAE
 *             params: { mes: 3, ejercicio: 2025 }
 *     responses:
 *       200:
 *         description: Resultado de ejecución
 *       500:
 *         description: Error en Firebird
 *
 * /api/metricas/ejecutar-lote:
 *   post:
 *     tags: [Métricas]
 *     summary: Ejecuta múltiples métricas en paralelo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             metricas:
 *               - id: ventas_mes_actual
 *                 sistema: SAE
 *               - id: saldo_bancos
 *                 sistema: BANCO
 *     responses:
 *       200:
 *         description: Resultados por métrica
 *
 * /api/inteligencia/buscar:
 *   post:
 *     tags: [Inteligencia]
 *     summary: Búsqueda semántica de métricas por lenguaje natural
 *     description: |
 *       Tokeniza el objetivo, detecta sistema, intenciones, periodos y montos.
 *       Devuelve métricas con score 0–100 y grupos de desambiguación.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [objetivo]
 *             properties:
 *               objetivo: { type: string }
 *               sistemas:
 *                 type: array
 *                 items: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *               limite: { type: integer, default: 12 }
 *           example:
 *             objetivo: ventas por vendedor Q1 2025 mayor a 500 mil
 *             limite: 8
 *     responses:
 *       200:
 *         description: Métricas con scores de relevancia
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               resultados:
 *                 - id: ventas_mes_actual
 *                   nombre: Ventas del Mes Actual
 *                   sistema: SAE
 *                   score_relevancia: 100
 *
 * /api/dashboard/sugerir:
 *   post:
 *     tags: [Inteligencia]
 *     summary: Genera un layout adaptativo de dashboard con IA
 *     description: |
 *       Prioriza KPI de ventas (SAE), KPI de saldo (BANCO), gráfica de tendencia
 *       y máximo 1 tabla. Incluye `logica_seleccion` y `parametros_pre_llenados`.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               objetivo:            { type: string }
 *               descripcion_negocio: { type: string }
 *               periodo:             { type: string, example: '2025-01' }
 *               sistemas_activos:
 *                 type: array
 *                 items: { type: string }
 *               maxWidgets:   { type: integer, default: 8 }
 *               num_columnas: { type: integer, enum: [2,3], default: 3 }
 *     responses:
 *       200:
 *         description: Dashboard sugerido con widgets y layout
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DashboardSugerido'
 *
 * /api/dashboard/ejecutar:
 *   post:
 *     tags: [Inteligencia]
 *     summary: Ejecuta todas las métricas de un dashboard
 *     responses:
 *       200:
 *         description: Resultados de todos los widgets
 *
 * /api/tablas:
 *   get:
 *     tags: [Tablas]
 *     summary: Lista tablas del esquema con información semántica
 *     parameters:
 *       - name: sistema
 *         in: query
 *         required: true
 *         schema: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *       - name: texto
 *         in: query
 *         schema: { type: string }
 *       - name: modulo
 *         in: query
 *         schema: { type: string }
 *       - name: limite
 *         in: query
 *         schema: { type: integer, default: 100 }
 *     responses:
 *       200:
 *         description: Tablas del sistema
 *
 * /api/tablas/{sistema}/{tabla}:
 *   get:
 *     tags: [Tablas]
 *     summary: Describe campos, índices, relaciones y joins sugeridos de una tabla
 *     parameters:
 *       - name: sistema
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *       - name: tabla
 *         in: path
 *         required: true
 *         schema: { type: string }
 *         example: CFDOC
 *     responses:
 *       200:
 *         description: Descripción completa de la tabla
 *       404:
 *         description: Tabla no encontrada
 *
 * /api/tablas/{sistema}/{tabla}/calidad:
 *   get:
 *     tags: [Tablas]
 *     summary: Reporte de calidad de datos (TTL 24h, cacheable)
 *     description: Analiza nulos, duplicados y rangos. Se cachea 24 h para no saturar Firebird.
 *     parameters:
 *       - name: sistema
 *         in: path
 *         required: true
 *         schema: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *       - name: tabla
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Reporte de calidad
 */

const express = require('express');
const controlador = require('../controladores/datos_analiticos.ctrl');
const { validar, esquemas } = require('../middleware/validar_joi');
const { limitadorPesado } = require('../middleware/seguridad_helmet');

const router = express.Router();

router.get('/health', controlador.health);
router.get('/sistemas', controlador.listarSistemas);
router.get('/metricas', controlador.listarMetricas);
router.get('/metricas/:metricaId', controlador.obtenerMetrica);

// Endpoints con rate-limit pesado + validación de body
router.post('/metricas/ejecutar-lote',
    limitadorPesado,
    validar(esquemas.ejecutarLote),
    controlador.ejecutarMetricasLote
);

router.post('/metricas/:metricaId/ejecutar',
    limitadorPesado,
    validar(esquemas.ejecutarMetrica),
    controlador.ejecutarMetrica
);

router.post('/inteligencia/buscar',
    validar(esquemas.buscarInteligente),
    controlador.buscarMetricasInteligente
);

/**
 * @swagger
 * /api/inteligencia/generar-query:
 *   post:
 *     tags: [Inteligencia]
 *     summary: Genera SQL dinámicamente desde lenguaje natural
 *     description: |
 *       Analiza la descripción en texto libre, detecta tabla, campos y filtros
 *       relevantes, y devuelve un SELECT listo para revisar o ejecutar.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [descripcion, sistema]
 *             properties:
 *               descripcion: { type: string, example: "ventas por cliente Q1 2025" }
 *               sistema: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *     responses:
 *       200:
 *         description: SQL generado con metadatos de confianza
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               sql: "SELECT FIRST 100\n  CFECHA,\n  CNOM_CLI,\n  CIMPORTE\nFROM CFDOC\nWHERE CFECHA BETWEEN :fecha_ini AND :fecha_fin\nORDER BY CFECHA DESC"
 *               tabla: CFDOC
 *               campos: [CFECHA, CNOM_CLI, CIMPORTE]
 *               parametros: { fecha_ini: "2025-01-01", fecha_fin: "2025-03-30" }
 *               confianza: 78
 *               modulo: Ventas
 *       400:
 *         description: Parámetros inválidos
 */
router.post('/inteligencia/generar-query',
    validar(esquemas.generarQuery),
    controlador.generarQueryNL
);

router.post('/dashboard/sugerir',
    validar(esquemas.sugerirDashboard),
    controlador.sugerirDashboard
);

router.post('/dashboard/ejecutar',
    limitadorPesado,
    validar(esquemas.ejecutarDashboard),
    controlador.ejecutarDashboard
);

router.get('/tablas', controlador.listarTablas);
router.get('/tablas/:sistema/:tabla/calidad', controlador.calidadTabla);
router.get('/tablas/:sistema/:tabla', controlador.describirTabla);

router.post('/admin/recargar-contexto', controlador.recargarContexto);

module.exports = router;
