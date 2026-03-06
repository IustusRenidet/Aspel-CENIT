'use strict';
/**
 * @swagger
 * /api/conexiones:
 *   get:
 *     tags: [Conexiones]
 *     summary: Obtiene la configuración de todas las conexiones Firebird
 *     description: Devuelve host, puerto, ruta de base de datos y estado de habilitación. La contraseña nunca se expone.
 *     responses:
 *       200:
 *         description: Configuraciones de conexión
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 SAE:
 *                   host: 127.0.0.1
 *                   port: 3050
 *                   database: 'C:\Aspel\SAE90EMPRE01.FDB'
 *                   user: SYSDBA
 *                   enabled: true
 *
 * /api/conexiones/{sistema}:
 *   get:
 *     tags: [Conexiones]
 *     summary: Configuración de un sistema específico
 *     parameters:
 *       - $ref: '#/components/parameters/SistemaParam'
 *     responses:
 *       200:
 *         description: Configuración del sistema
 *       404:
 *         description: Sistema no encontrado
 *   put:
 *     tags: [Conexiones]
 *     summary: Actualiza la configuración de conexión de un sistema
 *     parameters:
 *       - $ref: '#/components/parameters/SistemaParam'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Conexion'
 *           example:
 *             host: 192.168.1.100
 *             port: 3050
 *             database: 'C:\Aspel\SAE90EMPRE01.FDB'
 *             user: SYSDBA
 *             password: masterkey
 *             enabled: true
 *     responses:
 *       200:
 *         description: Configuración actualizada
 *
 * /api/conexiones/probar-todas:
 *   post:
 *     tags: [Conexiones]
 *     summary: Prueba la conectividad de todos los sistemas habilitados
 *     responses:
 *       200:
 *         description: Resultado de prueba por sistema
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 - sistema: SAE
 *                   exito: true
 *                   mensaje: Conexión exitosa (45 tablas)
 *                 - sistema: COI
 *                   exito: false
 *                   mensaje: ECONNREFUSED 127.0.0.1:3050
 *
 * /api/conexiones/{sistema}/probar:
 *   post:
 *     tags: [Conexiones]
 *     summary: Prueba la conexión Firebird de un sistema
 *     parameters:
 *       - $ref: '#/components/parameters/SistemaParam'
 *     responses:
 *       200:
 *         description: Conexión exitosa
 *       500:
 *         description: Error de conexión
 */

const express = require('express');
const ctrl = require('../controladores/conexiones.ctrl');
const { validar, esquemas } = require('../middleware/validar_joi');

const router = express.Router();

router.get('/', ctrl.obtenerTodas);
router.get('/:sistema', ctrl.obtenerUna);
router.put('/:sistema', validar(esquemas.actualizarConexion), ctrl.actualizar);
router.post('/probar-todas', ctrl.probarTodas);
router.post('/:sistema/probar', ctrl.probarUna);

/**
 * @swagger
 * /api/conexiones/{sistema}/sincronizar-esquema:
 *   post:
 *     tags: [Conexiones]
 *     summary: Fuerza la sincronización del diccionario técnico desde Firebird
 *     description: Lee el esquema en vivo desde las tablas RDB$ de Firebird, persiste el catálogo JSON y recarga la inteligencia semántica. Devuelve conteos con diffs respecto al catálogo anterior.
 *     parameters:
 *       - $ref: '#/components/parameters/SistemaParam'
 *     responses:
 *       200:
 *         description: Esquema sincronizado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:                { type: boolean }
 *                 sistema:           { type: string }
 *                 origen_datos:      { type: string, enum: [live] }
 *                 tablas:            { type: integer }
 *                 campos:            { type: integer }
 *                 tablas_nuevas:     { type: integer }
 *                 campos_nuevos:     { type: integer }
 *                 tablas_eliminadas: { type: integer }
 *       502:
 *         description: Firebird no disponible
 */
router.post('/:sistema/sincronizar-esquema', ctrl.sincronizarEsquema);

module.exports = router;
