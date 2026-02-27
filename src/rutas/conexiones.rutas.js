'use strict';

const express = require('express');
const ctrl = require('../controladores/conexiones.ctrl');

const router = express.Router();

router.get('/', ctrl.obtenerTodas);
router.get('/:sistema', ctrl.obtenerUna);
router.put('/:sistema', ctrl.actualizar);
router.post('/probar-todas', ctrl.probarTodas);
router.post('/:sistema/probar', ctrl.probarUna);

module.exports = router;
