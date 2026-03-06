'use strict';
/**
 * @swagger
 * /api/paneles:
 *   get:
 *     tags: [Paneles]
 *     summary: Lista todos los dashboards guardados con paginación
 *     parameters:
 *       - name: page
 *         in: query
 *         schema: { type: integer, default: 1 }
 *       - name: limit
 *         in: query
 *         description: Registros por página (máx 100)
 *         schema: { type: integer, default: 20, maximum: 100 }
 *       - name: q
 *         in: query
 *         description: Filtro de texto por nombre u objetivo
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista paginada de paneles
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - id: panel_1700000000000
 *                   nombre: Dashboard Q1 2025
 *                   sistemas: [SAE, BANCO]
 *               total: 1
 *               page: 1
 *               limit: 20
 *               totalPages: 1
 *   post:
 *     tags: [Paneles]
 *     summary: Guarda o actualiza un dashboard
 *     description: Si el body incluye `id`, actualiza el panel existente; si no, crea uno nuevo.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Panel'
 *           example:
 *             nombre: Dashboard Ejecutivo Q1
 *             objetivo: Ventas y cobranza primer trimestre
 *             sistemas: [SAE, BANCO]
 *             widgets:
 *               - id: widget_1
 *                 metrica_id: ventas_mes_actual
 *                 sistema: SAE
 *     responses:
 *       201:
 *         description: Panel creado/actualizado
 *       400:
 *         description: Nombre requerido
 *
 * /api/paneles/{id}:
 *   get:
 *     tags: [Paneles]
 *     summary: Obtiene un panel por ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Panel encontrado
 *       404:
 *         description: Panel no encontrado
 *   put:
 *     tags: [Paneles]
 *     summary: Actualiza un panel existente
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Panel'
 *     responses:
 *       200:
 *         description: Panel actualizado
 *   delete:
 *     tags: [Paneles]
 *     summary: Elimina un panel
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Panel eliminado
 *       404:
 *         description: No encontrado
 */

const express = require('express');
const ctrl = require('../controladores/paneles.ctrl');
const { validar, esquemas } = require('../middleware/validar_joi');

const router = express.Router();

router.get('/', ctrl.listar);
router.post('/', validar(esquemas.guardarPanel), ctrl.guardar);
router.get('/:id', ctrl.obtener);
router.put('/:id', validar(esquemas.guardarPanel), ctrl.guardar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
