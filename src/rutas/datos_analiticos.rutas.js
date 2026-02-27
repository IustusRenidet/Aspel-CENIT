const express = require('express');
const controlador = require('../controladores/datos_analiticos.ctrl');

const router = express.Router();

router.get('/health', controlador.health);
router.get('/sistemas', controlador.listarSistemas);
router.get('/metricas', controlador.listarMetricas);
router.get('/metricas/:metricaId', controlador.obtenerMetrica);
router.post('/metricas/ejecutar-lote', controlador.ejecutarMetricasLote);
router.post('/metricas/:metricaId/ejecutar', controlador.ejecutarMetrica);

router.post('/inteligencia/buscar', controlador.buscarMetricasInteligente);
router.post('/dashboard/sugerir', controlador.sugerirDashboard);
router.post('/dashboard/ejecutar', controlador.ejecutarDashboard);

router.get('/tablas', controlador.listarTablas);
router.get('/tablas/:sistema/:tabla', controlador.describirTabla);

router.post('/admin/recargar-contexto', controlador.recargarContexto);

module.exports = router;
