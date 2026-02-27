'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controladores/widget_studio.ctrl');

/** Templates disponibles */
router.get('/templates', ctrl.getTemplates);

/** Construir + ejecutar un widget personalizado */
router.post('/construir', ctrl.construir);

/** Intérprete de lenguaje natural → widget completo */
router.post('/interpretar', ctrl.interpretar);

/** SQL libre (solo SELECT) */
router.post('/sql-libre', ctrl.ejecutarSQLLibre);

/** Mis Widgets — gestor de widgets personalizados persistidos */
router.get('/mis-widgets', ctrl.listarMisWidgets);
router.post('/mis-widgets', ctrl.guardarMiWidget);
router.delete('/mis-widgets/:id', ctrl.eliminarMiWidget);
router.post('/mis-widgets/:id/ejecutar', ctrl.ejecutarMiWidget);

module.exports = router;
