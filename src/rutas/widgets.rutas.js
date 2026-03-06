'use strict';
/**
 * @swagger
 * /api/widgets/preview:
 *   post:
 *     tags: [Widgets]
 *     summary: Vista previa de SQL — valida, ejecuta 5 filas y recomienda visualización
 *     description: |
 *       Valida que el SQL sea un SELECT permitido, inyecta `FIRST 5`,
 *       detecta tipos de columna y llama al recomendador de visualización.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sql, sistema]
 *             properties:
 *               sql:        { type: string, example: 'SELECT NOMCLI, SUM(IMPORTE) AS TOTAL FROM CFDOC GROUP BY NOMCLI' }
 *               sistema:    { type: string, enum: [SAE, COI, NOI, BANCO] }
 *               parametros: { type: object }
 *     responses:
 *       200:
 *         description: Vista previa con columnas, filas y recomendación de viz
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 columnas:
 *                   - nombre: NOMCLI
 *                     tipo: texto
 *                   - nombre: TOTAL
 *                     tipo: numero
 *                 filas: [{ NOMCLI: Cliente A, TOTAL: 125000 }]
 *                 viz_recomendada:
 *                   recomendado: barra
 *                   razon: 1 columna texto + 1 numérica, 5 filas
 *       400:
 *         description: SQL inválido o no permitido
 *
 * /api/widgets/recomendar-viz:
 *   post:
 *     tags: [Widgets]
 *     summary: Recomienda tipo de visualización para un conjunto de columnas
 *     description: |
 *       Motor de 7 reglas de prioridad: KPI, Línea, Pastel, Barra horizontal,
 *       Barra, Dispersión o Tabla según tipos y cardinalidad de columnas.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [columnas]
 *             properties:
 *               columnas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nombre: { type: string }
 *                     tipo:   { type: string, enum: [numero, fecha, texto] }
 *               muestra:
 *                 type: array
 *                 items: { type: object }
 *               metrica_tipo:
 *                 type: string
 *           example:
 *             columnas:
 *               - nombre: PERIODO
 *                 tipo: fecha
 *               - nombre: VENTAS
 *                 tipo: numero
 *             muestra:
 *               - PERIODO: '2025-01'
 *                 VENTAS: 150000
 *     responses:
 *       200:
 *         description: Recomendación de visualización
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 recomendado: linea
 *                 razon: 1 columna fecha + 1 numérica con más de 5 puntos
 *                 alternativas: [barra, tabla]
 *                 config_sugerida:
 *                   eje_x: PERIODO
 *                   eje_y: VENTAS
 *
 * /api/widgets:
 *   get:
 *     tags: [Widgets]
 *     summary: Lista todos los widgets personalizados guardados
 *     responses:
 *       200:
 *         description: Lista de widgets
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               widgets: []
 *   post:
 *     tags: [Widgets]
 *     summary: Crea y guarda un nuevo widget personalizado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Widget'
 *           example:
 *             nombre: Top 10 clientes por venta
 *             sistema: SAE
 *             sql: SELECT NOMCLI, SUM(IMPORTE) AS TOTAL FROM CFDOC GROUP BY NOMCLI ORDER BY TOTAL DESC ROWS 10
 *             tipo_viz: barra
 *             color_primario: '#22c55e'
 *     responses:
 *       201:
 *         description: Widget creado
 *       400:
 *         description: SQL inválido o nombre requerido
 *
 * /api/widgets/{id}:
 *   get:
 *     tags: [Widgets]
 *     summary: Obtiene un widget por ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Widget encontrado
 *       404:
 *         description: No encontrado
 *   delete:
 *     tags: [Widgets]
 *     summary: Elimina un widget
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Widget eliminado
 *
 * /api/widgets/{id}/ejecutar:
 *   post:
 *     tags: [Widgets]
 *     summary: Ejecuta un widget guardado con parámetros de usuario
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
 *               parametros: { type: object, description: 'Valores para :params dinámicos' }
 *           example:
 *             parametros: { mes: 3, ejercicio: 2025 }
 *     responses:
 *       200:
 *         description: Resultado del widget
 *       404:
 *         description: Widget no encontrado
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/widgets.ctrl');
const { validar, esquemas } = require('../middleware/validar_joi');
const { limitadorPesado } = require('../middleware/seguridad_helmet');

// Endpoints estáticos primero (antes de las rutas con :id)
router.post('/preview',
    limitadorPesado,
    validar(esquemas.previewWidget),
    ctrl.previewSQL
);

router.post('/recomendar-viz',
    validar(esquemas.recomendarViz),
    ctrl.recomendarViz
);

// CRUD — guardar y ejecutar llevan rate-limit pesado por SQL Firebird
router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/',
    limitadorPesado,
    validar(esquemas.guardarWidget),
    ctrl.guardar
);
router.delete('/:id', ctrl.eliminar);
router.post('/:id/ejecutar',
    limitadorPesado,
    validar(esquemas.ejecutarWidget),
    ctrl.ejecutar
);

module.exports = router;
