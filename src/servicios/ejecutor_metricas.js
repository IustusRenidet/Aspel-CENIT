const CargadorYAML = require('../semantica/cargador_yaml');
const ResolvedorMetricas = require('../semantica/resolvedor_metricas');
const { ejecutarConsulta } = require('../conectores/firebird/conexion');
const cacheMetricas = require('../utilidades/cache_metricas');
const params = require('../configuracion/parametros');

/** Tiempo máximo de espera para una query Firebird, en milisegundos. */
const QUERY_TIMEOUT_MS = Number(process.env.QUERY_TIMEOUT_MS) || 15000;

/** Modo debug: expone query_ejecutada en metadata. */
const DEBUG_QUERIES =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_QUERIES === '1';

/** Palabras clave de DuckDB que no tienen equivalente directo en Firebird. */
const FUNCIONES_DUCKDB_NO_SOPORTADAS = ['QUALIFY', 'PIVOT', 'UNPIVOT', 'ASOF'];

/** Formato válido de metricaId: sólo letras, dígitos, guiones y guiones bajos */
const METRICA_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function normalizarSistema(sistema) {
  if (!sistema) return null;
  const valor = String(sistema).toUpperCase().trim();
  return ['SAE', 'COI', 'NOI', 'BANCO'].includes(valor) ? valor : null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SANITIZACIÓN DE INPUTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida que el metricaId tenga un formato seguro.
 * Previene path traversal y inyecciones en búsquedas de archivos YAML.
 * @throws {Error} si el id no es válido
 */
function sanitizarMetricaId(metricaId) {
  if (!metricaId || typeof metricaId !== 'string') {
    throw new Error('metricaId debe ser una cadena no vacía');
  }
  const limpio = metricaId.trim();
  if (!METRICA_ID_RE.test(limpio)) {
    throw new Error(
      `metricaId inválido: solo letras, dígitos, guiones y guiones_bajos (máx 100). Se recibió: "${limpio.slice(0, 30)}"`
    );
  }
  return limpio;
}

/**
 * Sanitiza el objeto de parámetros de una métrica:
 *  - Elimina claves con nombres peligrosos (__proto__, constructor, prototype)
 *  - Coerce valores a tipos primitivos (string, number, boolean) o los elimina
 *  - Limita profundidad a 1 nivel y cantidad a 50 claves
 *  - Escapa caracteres peligrosos en valores string para evitar inyección SQL
 *
 * @param {object} rawParams
 * @returns {object} parámetros saneados
 */
function sanitizarParametros(rawParams) {
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    return {};
  }

  const CLAVES_PELIGROSAS = new Set(['__proto__', 'constructor', 'prototype', 'eval', 'toString']);
  const sanitizados = {};
  let cuenta = 0;

  for (const [clave, valor] of Object.entries(rawParams)) {
    if (cuenta >= 50) break;

    const claveStr = String(clave).trim();

    // Rechazar claves peligrosas o demasiado largas
    if (CLAVES_PELIGROSAS.has(claveStr.toLowerCase()) || claveStr.length > 64) continue;
    // Solo claves alfanuméricas con guiones y guiones bajos
    if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(claveStr)) continue;

    // Sanitizar valor según tipo
    if (valor === null || valor === undefined) {
      sanitizados[claveStr] = null;
    } else if (typeof valor === 'boolean') {
      sanitizados[claveStr] = valor;
    } else if (typeof valor === 'number' && isFinite(valor)) {
      sanitizados[claveStr] = valor;
    } else if (typeof valor === 'string') {
      // Limitar longitud y escapar comillas simples (riesgo de inyección SQL)
      const v = valor.slice(0, 256).replace(/'/g, "''");
      sanitizados[claveStr] = v;
    }
    // Ignorar objetos anidados, funciones, arrays y símbolos

    cuenta++;
  }

  return sanitizados;
}

// ─────────────────────────────────────────────────────────────────────────────
//  MOTOR ADAPTATIVO DE CONVERSIÓN SQL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta el dialecto SQL de la query.
 * @returns {'duckdb'|'firebird'|'unknown'}
 */
function detectarDialecto(sql) {
  if (/\bLIMIT\s+\d+/i.test(sql)) return 'duckdb';
  if (/\bSELECT\s+(FIRST|SKIP)\s+\d+/i.test(sql)) return 'firebird';
  if (/\bSTRFTIME\s*\(/i.test(sql)) return 'duckdb';
  return 'unknown';
}

/**
 * Definición de transformaciones en orden de aplicación.
 * Cada entrada: { nombre, patron, aplicar(sql) → {sql, cambio:bool} }
 */
const TRANSFORMACIONES = [
  {
    // LIMIT N  →  SELECT FIRST N ... (quitar LIMIT al final)
    nombre: 'LIMIT → FIRST',
    patron: /\bLIMIT\s+\d+/i,
    aplicar(sql) {
      const m = sql.match(/\bLIMIT\s+(\d+)/i);
      if (!m) return { sql, cambio: false };
      let resultado = sql.replace(/\bSELECT\b/i, `SELECT FIRST ${m[1]}`);
      resultado = resultado.replace(/\bLIMIT\s+\d+/i, '');
      return { sql: resultado, cambio: true };
    }
  },
  {
    // STRFTIME('%Y', campo)  →  EXTRACT(YEAR FROM campo)
    nombre: 'STRFTIME %Y → EXTRACT YEAR',
    patron: /\bSTRFTIME\s*\(\s*'%Y'\s*,\s*([^)]+)\)/i,
    aplicar(sql) {
      const salida = sql.replace(
        /\bSTRFTIME\s*\(\s*'%Y'\s*,\s*([^)]+?)\s*\)/gi,
        (_, campo) => `EXTRACT(YEAR FROM ${campo.trim()})`
      );
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // STRFTIME('%m', campo)  →  EXTRACT(MONTH FROM campo)
    nombre: 'STRFTIME %m → EXTRACT MONTH',
    patron: /\bSTRFTIME\s*\(\s*'%m'\s*,\s*([^)]+)\)/i,
    aplicar(sql) {
      const salida = sql.replace(
        /\bSTRFTIME\s*\(\s*'%m'\s*,\s*([^)]+?)\s*\)/gi,
        (_, campo) => `EXTRACT(MONTH FROM ${campo.trim()})`
      );
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // STRFTIME('%d', campo)  →  EXTRACT(DAY FROM campo)
    nombre: 'STRFTIME %d → EXTRACT DAY',
    patron: /\bSTRFTIME\s*\(\s*'%d'\s*,\s*([^)]+)\)/i,
    aplicar(sql) {
      const salida = sql.replace(
        /\bSTRFTIME\s*\(\s*'%d'\s*,\s*([^)]+?)\s*\)/gi,
        (_, campo) => `EXTRACT(DAY FROM ${campo.trim()})`
      );
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // YEAR(campo)  →  EXTRACT(YEAR FROM campo)
    nombre: 'YEAR() → EXTRACT YEAR',
    patron: /\bYEAR\s*\(/i,
    aplicar(sql) {
      const salida = sql.replace(
        /\bYEAR\s*\(\s*([^)]+?)\s*\)/gi,
        (_, campo) => `EXTRACT(YEAR FROM ${campo.trim()})`
      );
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // MONTH(campo)  →  EXTRACT(MONTH FROM campo)
    nombre: 'MONTH() → EXTRACT MONTH',
    patron: /\bMONTH\s*\(/i,
    aplicar(sql) {
      const salida = sql.replace(
        /\bMONTH\s*\(\s*([^)]+?)\s*\)/gi,
        (_, campo) => `EXTRACT(MONTH FROM ${campo.trim()})`
      );
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // ILIKE 'valor'  →  LIKE 'VALOR'  (Firebird no tiene ILIKE ni case-insensitive LIKE)
    nombre: 'ILIKE → LIKE (UPPER)',
    patron: /\bILIKE\b/i,
    aplicar(sql) {
      const salida = sql.replace(
        /\bILIKE\s+('(?:[^'\\]|\\.)*')/gi,
        (_, literal) => `LIKE ${literal.toUpperCase()}`
      );
      // También convertir el campo a UPPER si no está ya envuelto
      const salida2 = salida.replace(
        /(\b[\w.]+\b)\s+LIKE\s+('(?:[^'\\]|\\.)*')/gi,
        (match, campo, val) => {
          if (/^UPPER\s*\(/i.test(campo)) return match;
          return `UPPER(${campo}) LIKE ${val}`;
        }
      );
      return { sql: salida2, cambio: salida2 !== sql };
    }
  },
  {
    // DATE 'YYYY-MM-DD'  →  'YYYY-MM-DD'  (quitar la palabra DATE)
    nombre: "DATE 'literal' → 'literal'",
    patron: /\bDATE\s*'(\d{4}-\d{2}-\d{2})'/i,
    aplicar(sql) {
      const salida = sql.replace(/\bDATE\s*'(\d{4}-\d{2}-\d{2})'/gi, "'$1'");
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // true → 1,  false → 0  (Firebird no tiene booleanos nativos en SQL-88/92)
    nombre: 'true/false → 1/0',
    patron: /\b(true|false)\b/i,
    aplicar(sql) {
      const salida = sql
        .replace(/\btrue\b/gi, '1')
        .replace(/\bfalse\b/gi, '0');
      return { sql: salida, cambio: salida !== sql };
    }
  },
  {
    // Normalizar espacios múltiples
    nombre: 'normalizar espacios',
    patron: /\s{2,}/,
    aplicar(sql) {
      const salida = sql.replace(/\s+/g, ' ').trim();
      return { sql: salida, cambio: salida !== sql };
    }
  }
];

/**
 * Valida que la query resultante no contenga funciones DuckDB sin soporte
 * en Firebird, y que tenga al menos una cláusula SELECT.
 * @throws {Error} con mensaje descriptivo si la query es inválida.
 */
function validarQueryFirebird(sql) {
  if (!/\bSELECT\b/i.test(sql)) {
    throw new Error(
      'La query convertida no contiene una cláusula SELECT válida. ' +
      'Verifica la query original.'
    );
  }

  for (const kw of FUNCIONES_DUCKDB_NO_SOPORTADAS) {
    const patron = new RegExp(`\\b${kw}\\b`, 'i');
    if (patron.test(sql)) {
      const sugerencia =
        kw === 'QUALIFY'
          ? 'Reescribe usando subquery con WHERE sobre ROW_NUMBER().'
          : kw === 'PIVOT' || kw === 'UNPIVOT'
            ? 'Reescribe usando CASE WHEN para pivotar manualmente.'
            : 'Reescribe usando sintaxis compatible con Firebird 2.5+.';
      throw new Error(
        `Query contiene función DuckDB no soportada: ${kw}. ${sugerencia}`
      );
    }
  }
}

/**
 * Motor adaptativo de conversión SQL.
 * Sustituye la antigua función `convertirSQLDuckDBaFirebird`.
 *
 * @param {string} query   Query original (generalmente en dialecto DuckDB/ANSI)
 * @param {boolean} debug  Si true, imprime cada transformación aplicada
 * @returns {{ sql: string, dialecto_original: string, transformaciones: string[] }}
 */
function adaptarQueryParaFirebird(query = '', debug = false) {
  let sql = String(query);

  // ── Etapa 1: Detectar dialecto ──────────────────────────────────────────
  const dialecto = detectarDialecto(sql);
  if (debug) {
    console.debug(`[AdaptadorSQL] dialecto detectado: ${dialecto}`);
    console.debug(`[AdaptadorSQL] query original:\n  ${sql}`);
  }

  // Si ya es Firebird, saltar transformaciones (solo validar)
  if (dialecto === 'firebird') {
    validarQueryFirebird(sql);
    return { sql, dialecto_original: 'firebird', transformaciones: [] };
  }

  // ── Etapa 2: Aplicar transformaciones ───────────────────────────────────
  const transformacionesAplicadas = [];

  for (const t of TRANSFORMACIONES) {
    if (!t.patron.test(sql)) continue;         // guarda de rendimiento rápida
    const { sql: nuevo, cambio } = t.aplicar(sql);
    if (cambio) {
      transformacionesAplicadas.push(t.nombre);
      if (debug) {
        console.debug(`[AdaptadorSQL] ✓ ${t.nombre}`);
        console.debug(`  antes : ${sql.slice(0, 120)}`);
        console.debug(`  después: ${nuevo.slice(0, 120)}`);
      }
      sql = nuevo;
    }
  }

  // ── Etapa 3: Validar resultado ───────────────────────────────────────────
  validarQueryFirebird(sql);

  if (debug) {
    console.debug(`[AdaptadorSQL] query final:\n  ${sql}`);
    console.debug(`[AdaptadorSQL] transformaciones: [${transformacionesAplicadas.join(', ')}]`);
  }

  return {
    sql,
    dialecto_original: dialecto,
    transformaciones: transformacionesAplicadas
  };
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
    const metricaId = sanitizarMetricaId(opciones.metricaId);

    const metrica = await this.obtenerMetrica(metricaId, opciones.sistema);
    if (!metrica) {
      throw new Error(`Metrica no encontrada: ${metricaId}`);
    }

    const sistema = normalizarSistema(opciones.sistema || metrica.sistema);
    const modo = String(opciones.modo || this.modoDefecto).toLowerCase();
    const parametros = sanitizarParametros(opciones.parametros || {});
    const advertencias = [];

    // ── Consultar caché (L1 → L2) ────────────────────────────────────────────
    const omitirCache = opciones.omitir_cache === true;
    if (params.cache.habilitado && !omitirCache) {
      const cacheKey = cacheMetricas.buildKey(metricaId, parametros);
      const hit = await cacheMetricas.get(cacheKey).catch(() => null);
      if (hit) {
        return {
          ...hit.resultado,
          cache_hit: true,
          desde_cache: hit.desde,
          cache_hits: hit.hits
        };
      }
    }

    // ── Ejecutar en Firebird ─────────────────────────────────────────────────
    if ((modo === 'real' || modo === 'auto') && sistema) {
      try {
        const resultado = await this.ejecutarEnFirebird(metrica, sistema, parametros);

        // Guardar en caché (no bloquear el retorno)
        if (params.cache.habilitado && !omitirCache) {
          const cacheKey = cacheMetricas.buildKey(metricaId, parametros);
          cacheMetricas.set(cacheKey, {
            resultado,
            ttl: params.cache.ttl_s,
            metrica_id: metricaId,
            sistema: sistema || resultado.sistema,
            parametros,
            origen: 'firebird'
          }).catch(() => { });
        }

        return { ...resultado, cache_hit: false };
      } catch (error) {
        if (modo === 'real') {
          throw error;
        }
        advertencias.push(`No se pudo ejecutar con Firebird: ${error.message}`);
      }
    }

    // ── Fallback a simulado ──────────────────────────────────────────────────
    const resultadoDemo = await this.resolvedor.resolver(metricaId, parametros, sistema || undefined);

    const resultadoFinal = {
      ...resultadoDemo,
      sistema: resultadoDemo.sistema || sistema || metrica.sistema,
      origen_datos: 'simulado',
      simulado: true,
      advertencias,
      cache_hit: false
    };

    // Cachear simulados solo si está configurado
    if (params.cache.habilitado && params.cache.cachear_simulados && !omitirCache) {
      const cacheKey = cacheMetricas.buildKey(metricaId, parametros);
      cacheMetricas.set(cacheKey, {
        resultado: resultadoFinal,
        ttl: params.cache.ttl_simulado_s,
        metrica_id: metricaId,
        sistema: sistema || resultadoFinal.sistema,
        parametros,
        origen: 'simulado'
      }).catch(() => { });
    }

    return resultadoFinal;
  }

  async ejecutarEnFirebird(metrica, sistema, parametros) {
    const metricaConSistema = { ...metrica, sistema };
    this.resolvedor.validarParametros(metricaConSistema, parametros);
    const parametrosCompletos = this.resolvedor.aplicarDefaults(metricaConSistema, parametros);

    const queryDuckDB = this.resolvedor.construirQuery(metricaConSistema, parametrosCompletos);

    // ── Adaptación al dialecto Firebird ──────────────────────────────────
    const { sql: queryFirebird, transformaciones } = adaptarQueryParaFirebird(
      queryDuckDB,
      DEBUG_QUERIES
    );

    // ── Ejecución con timeout ─────────────────────────────────────────────
    const inicio = Date.now();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => {
        const elapsed = Date.now() - inicio;
        reject(
          new Error(
            `Query cancelada: superó el límite de ${QUERY_TIMEOUT_MS} ms ` +
            `(transcurridos ${elapsed} ms). Optimiza la query o aumenta QUERY_TIMEOUT_MS.`
          )
        );
      }, QUERY_TIMEOUT_MS)
    );

    let filas;
    try {
      filas = await Promise.race([
        ejecutarConsulta(sistema, queryFirebird),
        timeoutPromise
      ]);
    } catch (err) {
      throw err;
    }

    const filasNormalizadas = normalizarFilas(filas);
    const datosFormateados = this.resolvedor.formatearResultado(metricaConSistema, filasNormalizadas);

    const metadata = {
      filas: Array.isArray(filas) ? filas.length : 1,
      tiempo_ms: Date.now() - inicio,
      transformaciones_sql: transformaciones
    };

    // Solo exponer el SQL ejecutado en modo debug/dev
    if (DEBUG_QUERIES) {
      metadata.query_ejecutada = queryFirebird;
    }

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
      metadata
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
