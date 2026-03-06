'use strict';
/**
 * @swagger
 * /api/widget-studio/templates:
 *   get:
 *     tags: [Widget Studio]
 *     summary: Lista plantillas de análisis predefinidas
 *     description: Plantillas para ventas, cuentas, pólizas, nómina, bancos, etc.
 *     responses:
 *       200:
 *         description: Lista de plantillas
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - id: sae_ventas_clientes
 *                   nombre: Ventas por cliente
 *                   sistema: SAE
 *                   icono: 📊
 *
 * /api/widget-studio/construir:
 *   post:
 *     tags: [Widget Studio]
 *     summary: Construye y ejecuta un widget a partir de una plantilla
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tipo, sistema]
 *             properties:
 *               tipo:     { type: string, example: sae_ventas_clientes }
 *               sistema:  { type: string, enum: [SAE, COI, NOI, BANCO] }
 *               params:   { type: object, example: { mes: 3, ejercicio: 2025 } }
 *               columnas: { type: array, items: { type: string } }
 *               solo_sql: { type: boolean, description: Si true solo devuelve el SQL generado }
 *     responses:
 *       200:
 *         description: Resultado del widget o SQL generado
 *       400:
 *         description: Plantilla no encontrada o SQL inválido
 *
 * /api/widget-studio/interpretar:
 *   post:
 *     tags: [Widget Studio]
 *     summary: Interpreta texto natural y ejecuta la consulta correspondiente
 *     description: |
 *       Motor NLP que detecta tipo de consulta, sistema Aspel, parámetros
 *       (mes, ejercicio, cuenta, etc.) y ejecuta contra Firebird.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties:
 *               texto:
 *                 type: string
 *                 example: Ventas SAE del mes de marzo 2025 por cliente con utilidad
 *               params_override:
 *                 type: object
 *                 description: Forzar parámetros específicos sin re-interpretar
 *     responses:
 *       200:
 *         description: Resultado con interpretación y datos
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 tipo: sae_ventas_clientes
 *                 sistema: SAE
 *                 confianza: 85
 *                 filas: []
 *                 sql: SELECT ...
 *
 * /api/widget-studio/sql-libre:
 *   post:
 *     tags: [Widget Studio]
 *     summary: Ejecuta SQL libre (solo SELECT) contra Firebird
 *     description: Valida que sea SELECT puro, admite parámetros :nombre y devuelve filas.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sql, sistema]
 *             properties:
 *               sql:       { type: string }
 *               sistema:   { type: string, enum: [SAE, COI, NOI, BANCO] }
 *               params_sql: { type: object, description: 'Valores para :params en el SQL' }
 *           example:
 *             sql: SELECT NOMCLI, IMPORTE FROM CFDOC WHERE MES = :mes
 *             sistema: SAE
 *             params_sql: { mes: 3 }
 *     responses:
 *       200:
 *         description: Filas resultado
 *       400:
 *         description: SQL no permitido (DML/DDL)
 *
 * /api/widget-studio/mis-widgets:
 *   get:
 *     tags: [Widget Studio]
 *     summary: Lista widgets guardados en el Widget Studio
 *     responses:
 *       200:
 *         description: Lista de widgets personalizados
 *   post:
 *     tags: [Widget Studio]
 *     summary: Guarda un widget personalizado desde el Studio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Widget'
 *     responses:
 *       201:
 *         description: Widget guardado
 *
 * /api/widget-studio/mis-widgets/{id}:
 *   delete:
 *     tags: [Widget Studio]
 *     summary: Elimina un widget personalizado
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Widget eliminado
 *
 * /api/widget-studio/mis-widgets/{id}/ejecutar:
 *   post:
 *     tags: [Widget Studio]
 *     summary: Ejecuta un widget personalizado guardado
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               parametros: { type: object }
 *     responses:
 *       200:
 *         description: Resultado del widget
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/widget_studio.ctrl');
const { validar, esquemas } = require('../middleware/validar_joi');
const { limitadorPesado } = require('../middleware/seguridad_helmet');

/** Templates disponibles */
router.get('/templates', ctrl.getTemplates);

/**
 * @swagger
 * /api/widget-studio/tablas/{sistema}:
 *   get:
 *     tags: [Widget Studio]
 *     summary: Lista las tablas del sistema con sus campos (autocompletado)
 *     description: |
 *       Intenta leer el esquema en vivo desde Firebird (RDB$).
 *       Si la DB no está disponible, devuelve el catálogo en caché.
 *       Enriquece con descripciones semánticas cuando están disponibles.
 *     parameters:
 *       - $ref: '#/components/parameters/SistemaParam'
 *     responses:
 *       200:
 *         description: Lista de tablas con sus campos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:      { type: boolean }
 *                 origen:  { type: string, enum: [live, cache] }
 *                 total:   { type: integer }
 *                 tablas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       nombre:      { type: string }
 *                       descripcion: { type: string }
 *                       modulo:      { type: string }
 *                       campos:      { type: array }
 */
router.get('/tablas/:sistema', ctrl.getTablasSistema);

/**
 * @swagger
 * /api/widget-studio/tabla/{sistema}/{nombre}/campos:
 *   get:
 *     tags: [Widget Studio]
 *     summary: Campos detallados de una tabla específica
 *     parameters:
 *       - $ref: '#/components/parameters/SistemaParam'
 *       - name: nombre
 *         in: path
 *         required: true
 *         schema: { type: string, example: FACTV01 }
 *     responses:
 *       200:
 *         description: Lista de campos con tipo técnico, semántico y descripción
 *       404:
 *         description: Tabla no encontrada — incluye sugerencias de tablas similares
 */
router.get('/tabla/:sistema/:nombre/campos', ctrl.getCamposTablaSistema);

/**
 * @swagger
 * /api/widget-studio/preview-sql:
 *   post:
 *     tags: [Widget Studio]
 *     summary: Ejecuta un SQL y devuelve las primeras 5 filas (vista previa real)
 *     description: |
 *       Limita automáticamente al FIRST 5. Si la tabla no existe en Firebird,
 *       devuelve un error descriptivo con tablas similares del catálogo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sql, sistema]
 *             properties:
 *               sql:     { type: string, example: "SELECT * FROM FACTV01" }
 *               sistema: { type: string, enum: [SAE, COI, NOI, BANCO] }
 *     responses:
 *       200:
 *         description: Columnas detectadas + filas de muestra
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 columnas_detectadas: { type: array }
 *                 filas_muestra:       { type: array }
 *                 tiempo_ms:           { type: integer }
 *                 origen:              { type: string }
 *       400:
 *         description: Error SQL — incluye tablas_similares si aplica
 */
router.post('/preview-sql',
    limitadorPesado,
    validar(esquemas.previewWidget),
    ctrl.previewSQLEstudio
);

/** Construir + ejecutar un widget personalizado */
router.post('/construir',
    limitadorPesado,
    validar(esquemas.construirWidget),
    ctrl.construir
);

/** Intérprete de lenguaje natural → widget completo */
router.post('/interpretar',
    validar(esquemas.interpretarWidget),
    ctrl.interpretar
);

/** SQL libre (solo SELECT) */
router.post('/sql-libre',
    limitadorPesado,
    validar(esquemas.previewWidget),  // mismos campos: sql + sistema
    ctrl.ejecutarSQLLibre
);

/** Mis Widgets — gestor de widgets personalizados persistidos */
router.get('/mis-widgets', ctrl.listarMisWidgets);
router.post('/mis-widgets',
    limitadorPesado,
    validar(esquemas.guardarWidget),
    ctrl.guardarMiWidget
);
router.delete('/mis-widgets/:id', ctrl.eliminarMiWidget);
router.post('/mis-widgets/:id/ejecutar',
    limitadorPesado,
    validar(esquemas.ejecutarWidget),
    ctrl.ejecutarMiWidget
);

module.exports = router;
