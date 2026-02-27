'use strict';

const express = require('express');
const ctrl = require('../controladores/paneles.ctrl');

const router = express.Router();

router.get('/', ctrl.listar);
router.post('/', ctrl.guardar);
router.get('/:id', ctrl.obtener);
router.put('/:id', ctrl.guardar);
router.delete('/:id', ctrl.eliminar);

module.exports = router;
