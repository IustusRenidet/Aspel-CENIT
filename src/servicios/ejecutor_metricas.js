const CargadorYAML = require('../semantica/cargador_yaml');
const ResolvedorMetricas = require('../semantica/resolvedor_metricas');
const { ejecutarConsulta } = require('../conectores/firebird/conexion');

function normalizarSistema(sistema) {
  if (!sistema) return null;
  const valor = String(sistema).toUpperCase();
  return ['SAE', 'COI', 'NOI', 'BANCO'].includes(valor) ? valor : null;
}

function convertirSQLDuckDBaFirebird(query = '') {
  let sql = String(query);

  const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
  if (limitMatch) {
    sql = sql.replace(/\bSELECT\b/i, `SELECT FIRST ${limitMatch[1]}`);
    sql = sql.replace(/\bLIMIT\s+\d+/i, '');
  }

  sql = sql.replace(/\bYEAR\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(YEAR FROM $1)');
  sql = sql.replace(/\bMONTH\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(MONTH FROM $1)');
  sql = sql.replace(/\bDATE\s*'(\d{4}-\d{2}-\d{2})'/gi, "'$1'");
  sql = sql.replace(/\bILIKE\b/gi, 'LIKE');
  sql = sql.replace(/\s+/g, ' ').trim();

  return sql;
}

function normalizarFilas(resultado = []) {
  if (!Array.isArray(resultado)) return [];

  return resultado.map((fila) => {
    const normalizada = {};

    for (const [llave, valor] of Object.entries(fila || {})) {
      normalizada[llave] = valor;
      normalizada[String(llave).toLowerCase()] = valor;
    }

    return normalizada;
  });
}

class EjecutorMetricas {
  constructor(opciones = {}) {
    this.modoDefecto = opciones.modoDefecto || 'auto';
    this.cargador = new CargadorYAML();
    this.resolvedor = new ResolvedorMetricas();
  }

  async obtenerMetrica(metricaId, sistema = null) {
    const sistemaNormalizado = normalizarSistema(sistema);
    const metrica = await this.cargador.buscarMetrica(metricaId, sistemaNormalizado || undefined);

    if (!metrica) return null;

    return {
      ...metrica,
      sistema: normalizarSistema(metrica.sistema || sistemaNormalizado) || sistemaNormalizado
    };
  }

  async ejecutarMetrica(opciones = {}) {
    const metricaId = opciones.metricaId;
    if (!metricaId) {
      throw new Error('metricaId es obligatorio');
    }

    const metrica = await this.obtenerMetrica(metricaId, opciones.sistema);
    if (!metrica) {
      throw new Error(`Metrica no encontrada: ${metricaId}`);
    }

    const sistema = normalizarSistema(opciones.sistema || metrica.sistema);
    const modo = String(opciones.modo || this.modoDefecto).toLowerCase();
    const parametros = opciones.parametros || {};
    const advertencias = [];

    if ((modo === 'real' || modo === 'auto') && sistema) {
      try {
        return await this.ejecutarEnFirebird(metrica, sistema, parametros);
      } catch (error) {
        if (modo === 'real') {
          throw error;
        }
        advertencias.push(`No se pudo ejecutar con Firebird: ${error.message}`);
      }
    }

    const resultadoDemo = await this.resolvedor.resolver(metricaId, parametros, sistema || undefined);

    return {
      ...resultadoDemo,
      sistema: resultadoDemo.sistema || sistema || metrica.sistema,
      origen_datos: 'simulado',
      simulado: true,
      advertencias
    };
  }

  async ejecutarEnFirebird(metrica, sistema, parametros) {
    const metricaConSistema = { ...metrica, sistema };
    this.resolvedor.validarParametros(metricaConSistema, parametros);
    const parametrosCompletos = this.resolvedor.aplicarDefaults(metricaConSistema, parametros);

    const queryDuckDB = this.resolvedor.construirQuery(metricaConSistema, parametrosCompletos);
    const queryFirebird = convertirSQLDuckDBaFirebird(queryDuckDB);

    const filas = await ejecutarConsulta(sistema, queryFirebird);
    const filasNormalizadas = normalizarFilas(filas);
    const datosFormateados = this.resolvedor.formatearResultado(metricaConSistema, filasNormalizadas);

    return {
      metrica_id: metrica.id,
      nombre: metrica.nombre,
      descripcion: metrica.descripcion,
      sistema,
      tipo: metrica.tipo,
      categoria: metrica.categoria,
      ejecutado_en: new Date().toISOString(),
      parametros: parametrosCompletos,
      datos: datosFormateados,
      origen_datos: 'firebird',
      simulado: false,
      metadata: {
        filas: Array.isArray(filas) ? filas.length : 1,
        query_ejecutado: queryFirebird
      }
    };
  }

  async ejecutarLote(metricas = [], opciones = {}) {
    if (!Array.isArray(metricas)) {
      throw new Error('metricas debe ser un arreglo');
    }

    const modoGlobal = opciones.modo || this.modoDefecto;

    const tareas = metricas.map(async (item) => {
      try {
        const resultado = await this.ejecutarMetrica({
          metricaId: item.metricaId || item.id || item.metrica_id,
          sistema: item.sistema,
          parametros: item.parametros || {},
          modo: item.modo || modoGlobal
        });

        return {
          ok: true,
          metrica_id: resultado.metrica_id,
          resultado
        };
      } catch (error) {
        return {
          ok: false,
          metrica_id: item.metricaId || item.id || item.metrica_id,
          error: error.message
        };
      }
    });

    return Promise.all(tareas);
  }
}

module.exports = EjecutorMetricas;
