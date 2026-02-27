const InteligenciaAspel = require('../servicios/inteligencia_aspel');
const EjecutorMetricas = require('../servicios/ejecutor_metricas');

const inteligencia = new InteligenciaAspel();
const ejecutor = new EjecutorMetricas();

function parseLista(valor) {
  if (!valor) return null;
  if (Array.isArray(valor)) return valor;
  return String(valor)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseNumero(valor, fallback, min, max) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.max(min, Math.min(max, numero));
}

function manejarError(res, error, status = 500) {
  return res.status(status).json({
    ok: false,
    error: error.message || 'Error interno'
  });
}

async function health(_req, res) {
  try {
    const sistemas = await inteligencia.obtenerSistemas();
    const totalMetricas = sistemas.reduce((acum, sistema) => acum + sistema.metricas, 0);

    return res.json({
      ok: true,
      nombre: 'Aspel CENIT Inteligente',
      status: 'ok',
      fecha: new Date().toISOString(),
      metricas_totales: totalMetricas,
      sistemas
    });
  } catch (error) {
    return manejarError(res, error);
  }
}

async function listarSistemas(_req, res) {
  try {
    const sistemas = await inteligencia.obtenerSistemas();
    return res.json({ ok: true, data: sistemas });
  } catch (error) {
    return manejarError(res, error);
  }
}

async function listarMetricas(req, res) {
  try {
    const metricas = await inteligencia.listarMetricas({
      sistema: req.query.sistema,
      categoria: req.query.categoria,
      tipo: req.query.tipo,
      texto: req.query.texto || req.query.q,
      limite: req.query.limite,
      incluir_query: req.query.incluir_query === 'true'
    });

    return res.json({
      ok: true,
      total: metricas.length,
      data: metricas
    });
  } catch (error) {
    return manejarError(res, error);
  }
}

async function obtenerMetrica(req, res) {
  try {
    const metrica = await inteligencia.obtenerMetrica(
      req.params.metricaId,
      req.query.sistema
    );

    if (!metrica) {
      return manejarError(res, new Error('Metrica no encontrada'), 404);
    }

    return res.json({ ok: true, data: metrica });
  } catch (error) {
    return manejarError(res, error);
  }
}

async function ejecutarMetrica(req, res) {
  try {
    const resultado = await ejecutor.ejecutarMetrica({
      metricaId: req.params.metricaId,
      sistema: req.body.sistema,
      parametros: req.body.parametros || {},
      modo: req.body.modo || 'auto'
    });

    return res.json({ ok: true, data: resultado });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function ejecutarMetricasLote(req, res) {
  try {
    const metricas = req.body.metricas;
    if (!Array.isArray(metricas) || metricas.length === 0) {
      return manejarError(res, new Error('Debes enviar un arreglo "metricas" con al menos un elemento'), 400);
    }

    const resultados = await ejecutor.ejecutarLote(metricas, {
      modo: req.body.modo || 'auto'
    });

    return res.json({
      ok: true,
      total: resultados.length,
      exitosas: resultados.filter((item) => item.ok).length,
      fallidas: resultados.filter((item) => !item.ok).length,
      data: resultados
    });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function buscarMetricasInteligente(req, res) {
  try {
    const objetivo = req.body.objetivo || req.body.texto || req.query.q || '';
    if (!objetivo) {
      return manejarError(res, new Error('Debes indicar "objetivo" o "q"'), 400);
    }

    const resultado = await inteligencia.buscarMetricasInteligentes({
      objetivo,
      sistemas: parseLista(req.body.sistemas || req.query.sistemas),
      categoria: req.body.categoria || req.query.categoria,
      tipo: req.body.tipo || req.query.tipo,
      limite: req.body.limite || req.query.limite
    });

    return res.json({ ok: true, data: resultado });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function sugerirDashboard(req, res) {
  try {
    const objetivo = req.body.objetivo || 'panel ejecutivo integral';
    const maxWidgets = parseNumero(req.body.maxWidgets, 8, 3, 20);
    const sistemas = parseLista(req.body.sistemas);

    const sugerencia = await inteligencia.sugerirDashboard({
      objetivo,
      maxWidgets,
      sistemas
    });

    return res.json({ ok: true, data: sugerencia });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function ejecutarDashboard(req, res) {
  try {
    const dashboard = req.body.dashboard || {};
    const widgets = dashboard.widgets || req.body.widgets || [];

    if (!Array.isArray(widgets) || widgets.length === 0) {
      return manejarError(res, new Error('No se recibieron widgets para ejecutar'), 400);
    }

    const parametrosGlobales = req.body.parametros_globales || {};
    const metricas = widgets.map((widget) => ({
      metricaId: widget.metrica_id || widget.metricaId || widget.id,
      sistema: widget.sistema,
      parametros: {
        ...parametrosGlobales,
        ...(widget.parametros || {})
      },
      modo: widget.modo || req.body.modo || 'auto'
    }));

    const resultados = await ejecutor.ejecutarLote(metricas, {
      modo: req.body.modo || 'auto'
    });

    return res.json({
      ok: true,
      dashboard: {
        objetivo: dashboard.objetivo || null,
        widgets
      },
      data: resultados
    });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function listarTablas(req, res) {
  try {
    if (!req.query.sistema) {
      return manejarError(res, new Error('Debes indicar query param "sistema"'), 400);
    }

    const tablas = await inteligencia.listarTablas({
      sistema: req.query.sistema,
      texto: req.query.texto || req.query.q,
      modulo: req.query.modulo,
      limite: req.query.limite
    });

    return res.json({ ok: true, total: tablas.length, data: tablas });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function describirTabla(req, res) {
  try {
    const info = await inteligencia.describirTabla(req.params.sistema, req.params.tabla);
    if (!info) {
      return manejarError(res, new Error('Tabla no encontrada'), 404);
    }
    return res.json({ ok: true, data: info });
  } catch (error) {
    return manejarError(res, error, 400);
  }
}

async function recargarContexto(_req, res) {
  try {
    await inteligencia.recargar();
    return res.json({ ok: true, mensaje: 'Contexto recargado correctamente' });
  } catch (error) {
    return manejarError(res, error);
  }
}

module.exports = {
  health,
  listarSistemas,
  listarMetricas,
  obtenerMetrica,
  ejecutarMetrica,
  ejecutarMetricasLote,
  buscarMetricasInteligente,
  sugerirDashboard,
  ejecutarDashboard,
  listarTablas,
  describirTabla,
  recargarContexto
};
