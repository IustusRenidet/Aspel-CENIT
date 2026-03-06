const fs = require('fs-extra');
const path = require('path');
const CargadorYAML = require('../semantica/cargador_yaml');
const MotorInferencias = require('../semantica/inferencias');
const indice = require('../almacenamiento/sqlite/indice');

const SISTEMAS_VALIDOS = ['SAE', 'COI', 'NOI', 'BANCO'];
const CACHE_TTL_MS = Number(process.env.CENIT_CACHE_TTL || 5 * 60 * 1000);

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'para', 'por', 'con', 'sin',
  'del', 'al', 'un', 'una', 'unos', 'unas', 'que', 'como', 'mas', 'menos',
  'vs', 'contra', 'entre', 'todo', 'toda', 'todos', 'todas', 'mi', 'su', 'sus',
  'se', 'es', 'son', 'a', 'u'
]);

// ── Mapa de sinónimos en español ────────────────────────────────────────────
// Cada entrada expande el token hacia sus equivalentes conceptuales.
const SINONIMOS = new Map([
  ['ventas', ['ingresos', 'facturacion', 'factura', 'venta', 'ingreso', 'cobro', 'cobros']],
  ['ingresos', ['ventas', 'facturacion', 'factura', 'venta', 'ingreso']],
  ['facturacion', ['ventas', 'ingresos', 'factura', 'venta', 'ticket']],
  ['compras', ['adquisiciones', 'compra', 'adquisicion', 'proveedor']],
  ['adquisiciones', ['compras', 'compra', 'adquisicion']],
  ['empleados', ['personal', 'trabajadores', 'empleado', 'rrhh']],
  ['personal', ['empleados', 'trabajadores', 'rrhh', 'nomina']],
  ['cobranza', ['cxc', 'cartera', 'cobros', 'cobro', 'cuentas']],
  ['cartera', ['cobranza', 'cxc', 'cobros', 'saldo']],
  ['gastos', ['egresos', 'costos', 'costo', 'gasto', 'egreso']],
  ['costos', ['gastos', 'costo', 'egresos', 'gasto']],
  ['utilidad', ['ganancia', 'resultado', 'beneficio', 'margen']],
  ['ganancia', ['utilidad', 'resultado', 'beneficio']],
  ['existencias', ['inventario', 'stock', 'almacen', 'existencia']],
  ['inventario', ['existencias', 'stock', 'almacen']],
  ['saldo', ['balance', 'disponible', 'efectivo', 'caja']],
  ['balance', ['saldo', 'disponible', 'efectivo']],
  ['articulos', ['productos', 'articulo', 'producto', 'mercancias']],
  ['productos', ['articulos', 'articulo', 'producto']],
]);

// ── Levenshtein con early-exit (threshold de tolerancia) ────────────────────
/**
 * Calcula la distancia de edición entre dos strings.
 * Retorna `maxDist + 1` si la distancia supera `maxDist` (early-exit).
 * @param {string} a
 * @param {string} b
 * @param {number} [maxDist=3]
 * @returns {number}
 */
function levenshtein(a, b, maxDist = 3) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > maxDist) return maxDist + 1; // early-exit de longitud
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: n + 1 }, (_, i) => i);

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
      rowMin = Math.min(rowMin, dp[j]);
    }
    if (rowMin > maxDist) return maxDist + 1; // poda por fila
  }

  return dp[n];
}

/**
 * Devuelve true si alguna palabra de `texto` tiene distancia Levenshtein ≤ 2 con `token`.
 * Solo se activa para tokens de ≥ 4 caracteres para evitar falsos positivos.
 * @param {string} token
 * @param {string} texto   Texto ya normalizado.
 * @returns {boolean}
 */
function fuzzyContiene(token, texto) {
  if (!token || token.length < 4) return false;
  const palabras = texto.split(/[^a-z0-9]+/).filter((p) => p.length >= Math.max(3, token.length - 2));
  for (const palabra of palabras) {
    if (levenshtein(token, palabra, 2) <= 2) return true;
  }
  return false;
}

/**
 * Expande una lista de tokens con sus sinónimos para ampliar el recall.
 * @param {string[]} tokens
 * @returns {string[]} Lista única con los tokens originales + sinónimos.
 */
function expandirConSinonimos(tokens) {
  const resultado = new Set(tokens);
  for (const token of tokens) {
    const sinonimosToken = SINONIMOS.get(token);
    if (sinonimosToken) {
      for (const sin of sinonimosToken) resultado.add(sin);
    }
  }
  return Array.from(resultado);
}

const INTENCIONES = {
  ventas: ['venta', 'ventas', 'factura', 'facturas', 'ticket', 'ingreso', 'cliente', 'vendedor', 'descuento', 'margen'],
  inventarios: ['inventario', 'inventarios', 'stock', 'existencia', 'existencias', 'rotacion', 'articulo', 'articulos', 'producto', 'productos', 'merma'],
  compras: ['compra', 'compras', 'proveedor', 'proveedores', 'orden', 'recepcion', 'costos', 'costo'],
  cxc: ['cxc', 'cartera', 'cobranza', 'cobro', 'cobros', 'vencida', 'vencidas', 'saldo'],
  contabilidad: ['contabilidad', 'poliza', 'polizas', 'balanza', 'cuenta', 'cuentas', 'activo', 'pasivo', 'capital', 'utilidad'],
  tesoreria: ['tesoreria', 'banco', 'bancos', 'flujo', 'cheque', 'cheques', 'conciliacion', 'egreso', 'egresos'],
  nomina: ['nomina', 'empleado', 'empleados', 'sueldo', 'sueldos', 'rrhh', 'percepcion', 'deduccion', 'imss', 'isr', 'ausentismo']
};

const MAPEO_SISTEMAS = {
  SAE: ['sae', 'ventas', 'comercial'],
  COI: ['coi', 'contabilidad', 'contable'],
  NOI: ['noi', 'nomina', 'rrhh', 'rh', 'personal'],
  BANCO: ['banco', 'bancos', 'tesoreria', 'ban']
};

function normalizarTexto(valor = '') {
  return String(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizar(valor = '') {
  return normalizarTexto(valor)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function unico(arreglo) {
  return Array.from(new Set(arreglo));
}

function limitarNumero(valor, min, max, fallback) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return fallback;
  return Math.max(min, Math.min(max, numero));
}

function extraerTablasDesdeSQL(query = '') {
  const tablas = new Set();
  const regex = /(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;
  let match;

  while ((match = regex.exec(query)) !== null) {
    tablas.add(match[1].toUpperCase());
  }

  return Array.from(tablas);
}

// ────────────────────────────────────────────────────────────────
// EXTRACCIÓN DE ENTIDADES
// Detecta montos, periodos, comparativos y agrupaciones en texto libre.
// ────────────────────────────────────────────────────────────────

const _MULT = { mil: 1e3, miles: 1e3, millon: 1e6, millones: 1e6, mdp: 1e6, mdd: 1e6 };

const _MESES_NUM = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};

const _TRIM_ORD = {
  primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4
};

const _OPERADORES_NL = [
  [/mayor\s*(?:a|que)?\s*|mas\s+de\s*|superior\s+a\s*|minimo\s*|al\s+menos\s*/g, '>='],
  [/menor\s*(?:a|que)?\s*|menos\s+de\s*|inferior\s+a\s*|maximo\s*|hasta\s*/g, '<='],
  [/mayores?\s+a\s*/g, '>'],
  [/menores?\s+a\s*/g, '<']
];

function extraerEntidades(texto = '') {
  const norm = normalizarTexto(texto);
  const entidades = { montos: [], periodos: [], comparativos: [], agrupaciones: [] };

  // ── 1. Montos / umbrales numéricos ─────────────────────────────
  // Símbolos: ">=500000", "> 100 mil", "<= 2 millones"
  const opSymRe = /([><=!]{1,2})\s*([\d,.]+)\s*(mil(?:es)?|millon(?:es)?|mdp|mdd)?/g;
  let m;
  while ((m = opSymRe.exec(norm)) !== null) {
    let val = parseFloat(m[2].replace(/,/g, ''));
    if (m[3] && _MULT[m[3]]) val *= _MULT[m[3]];
    if (Number.isFinite(val)) entidades.montos.push({ operador: m[1], umbral: val });
  }

  // Lenguaje natural: "más de 100 mil", "mayor a 2 millones"
  const nlNumRe = /(mayor(?:\s*(?:a|que))?|mas\s+de|superior\s+a|al\s+menos|minimo|menor(?:\s*(?:a|que))?|menos\s+de|inferior\s+a|maximo|hasta)\s+([\d,.]+)\s*(mil(?:es)?|millon(?:es)?|mdp|mdd)?/g;
  while ((m = nlNumRe.exec(norm)) !== null) {
    let val = parseFloat(m[2].replace(/,/g, ''));
    if (m[3] && _MULT[m[3]]) val *= _MULT[m[3]];
    if (!Number.isFinite(val)) continue;
    const yaCapturado = entidades.montos.some((e) => Math.abs(e.umbral - val) < 1);
    if (!yaCapturado) {
      const frase = m[1];
      const op = /mayor|mas\s+de|superior|minimo|al\s+menos/.test(frase) ? '>=' : '<=';
      entidades.montos.push({ operador: op, umbral: val });
    }
  }

  // ── 2. Periodos ────────────────────────────────────────────────
  // "Q1", "Q3 2024"
  const qRe = /\bq([1-4])(?:\s+(\d{4}))?\b/g;
  while ((m = qRe.exec(norm)) !== null) {
    const q = Number(m[1]);
    const mesInicio = (q - 1) * 3 + 1;
    entidades.periodos.push({
      tipo: 'trimestre', trimestre: q,
      mes_inicio: mesInicio, mes_fin: mesInicio + 2,
      año: m[2] ? Number(m[2]) : null
    });
  }

  // "primer trimestre", "tercer trimestre 2024"
  const ordTrim = Object.keys(_TRIM_ORD).join('|');
  const trimRe = new RegExp(`(${ordTrim})\\s+trimestre(?:\\s+(\\d{4}))?`, 'g');
  while ((m = trimRe.exec(norm)) !== null) {
    const q = _TRIM_ORD[m[1]];
    if (!q) continue;
    const mesInicio = (q - 1) * 3 + 1;
    const año = m[2] ? Number(m[2]) : null;
    if (!entidades.periodos.some((p) => p.trimestre === q && p.año === año)) {
      entidades.periodos.push({ tipo: 'trimestre', trimestre: q, mes_inicio: mesInicio, mes_fin: mesInicio + 2, año });
    }
  }

  // "enero a marzo", "julio-septiembre 2024", "de enero a marzo"
  const mesKeys = Object.keys(_MESES_NUM).join('|');
  const rangoRe = new RegExp(`(${mesKeys})\\s*(?:a(?:l)?|-|hasta|y)\\s*(${mesKeys})(?:\\s+(\\d{4}))?`, 'g');
  while ((m = rangoRe.exec(norm)) !== null) {
    entidades.periodos.push({
      tipo: 'rango_mes',
      mes_inicio: _MESES_NUM[m[1]],
      mes_fin: _MESES_NUM[m[2]],
      año: m[3] ? Number(m[3]) : null
    });
  }

  // Año suelto: "2024", "2025"
  const añoRe = /(?:^|\s)(20\d{2})(?:\s|$)/g;
  while ((m = añoRe.exec(norm)) !== null) {
    const año = Number(m[1]);
    if (!entidades.periodos.some((p) => p.año === año && p.tipo === 'año')) {
      entidades.periodos.push({ tipo: 'año', año });
    }
  }

  // ── 3. Comparativos ───────────────────────────────────────────
  const COMPS = [
    [/vs\.?\s+a[nñ]o\s+anterior|a[nñ]o\s+anterior|ejercicio\s+anterior/, 'vs_año_anterior'],
    [/vs\.?\s+presupuesto|contra\s+presupuesto|comparado\s+con\s+presupuesto/, 'vs_presupuesto'],
    [/vs\.?\s+mes\s+anterior|mes\s+pasado/, 'vs_mes_anterior'],
    [/vs\.?\s+periodo\s+anterior|periodo\s+anterior/, 'vs_periodo_anterior'],
    [/variacion|desviacion|diferencia/, 'variacion'],
    [/comparativo|comparacion|comparar/, 'comparativo_general']
  ];
  for (const [re, etiqueta] of COMPS) {
    if (re.test(norm)) entidades.comparativos.push(etiqueta);
  }

  // ── 4. Agrupaciones ───────────────────────────────────────────
  const AGRS = [
    [/por\s+clientes?|clientes?\s+por/, 'por_cliente'],
    [/por\s+vendedor(?:es)?/, 'por_vendedor'],
    [/por\s+almac[eé]n(?:es)?/, 'por_almacen'],
    [/por\s+sucursal(?:es)?/, 'por_sucursal'],
    [/por\s+(?:producto|articulo)s?/, 'por_producto'],
    [/por\s+proveedor(?:es)?/, 'por_proveedor'],
    [/por\s+empleados?/, 'por_empleado'],
    [/por\s+dep(?:artamento|to)s?/, 'por_departamento'],
    [/por\s+cuentas?/, 'por_cuenta'],
    [/por\s+(?:mes(?:es)?|periodo[s]?)/, 'por_periodo'],
    [/por\s+(?:categorias?|familias?)/, 'por_categoria'],
    [/por\s+zonas?|por\s+region(?:es)?/, 'por_zona']
  ];
  for (const [re, etiqueta] of AGRS) {
    if (re.test(norm)) entidades.agrupaciones.push(etiqueta);
  }

  return entidades;
}

class InteligenciaAspel {
  constructor(opciones = {}) {
    this.cargador = opciones.cargador || new CargadorYAML();
    this.directorioRaiz = opciones.directorioRaiz || process.cwd();
    this.cache = null;
    this.cacheTimestamp = 0;
  }

  async asegurarCache(force = false) {
    const expirado = Date.now() - this.cacheTimestamp >= CACHE_TTL_MS;
    if (!this.cache || expirado || force) {
      await this.recargar();
    }
  }

  async recargar() {
    const metricasPorSistema = await this.cargador.cargarTodasMetricas();
    const semanticaPorSistema = {};
    const catalogoPorSistema = {};

    for (const sistema of SISTEMAS_VALIDOS) {
      semanticaPorSistema[sistema] = await this.cargarJSONSeguro(
        path.join(this.directorioRaiz, 'diccionario', `semantica_${sistema}.json`)
      );

      catalogoPorSistema[sistema] = await this.cargarJSONSeguro(
        path.join(this.directorioRaiz, 'diccionario', `catalogo_tecnico_${sistema}.json`)
      );
    }

    const { indexadas, indexPorSistema, indexPorCategoria, tokenIDF } =
      this.construirIndex(metricasPorSistema, semanticaPorSistema, catalogoPorSistema);

    this.cache = {
      metricasPorSistema,
      semanticaPorSistema,
      catalogoPorSistema,
      metricasIndexadas: indexadas,
      indexPorSistema,
      indexPorCategoria,
      tokenIDF
    };
    this.cacheTimestamp = Date.now();

    return this.cache;
  }

  async cargarJSONSeguro(ruta) {
    if (!(await fs.pathExists(ruta))) {
      return null;
    }

    try {
      return await fs.readJson(ruta);
    } catch (error) {
      return null;
    }
  }

  construirIndex(metricasPorSistema) {
    const indexadas = [];

    for (const [sistema, contenido] of Object.entries(metricasPorSistema || {})) {
      if (!contenido || !Array.isArray(contenido.metricas)) continue;

      for (const metrica of contenido.metricas) {
        const sistemaFinal = String(
          metrica.sistema || contenido?.metadata?.sistema || sistema
        ).toUpperCase();

        const tablasReferenciadas = extraerTablasDesdeSQL(
          metrica.query_duckdb || metrica.consulta || ''
        );

        const tags = unico([
          normalizarTexto(metrica.categoria),
          normalizarTexto(metrica.tipo),
          ...tablasReferenciadas.map((tabla) => normalizarTexto(tabla)),
          ...this.inferirTagsMetrica(metrica)
        ].filter(Boolean));

        const textoBusqueda = normalizarTexto([
          metrica.id,
          metrica.nombre,
          metrica.descripcion,
          metrica.categoria,
          sistemaFinal,
          tablasReferenciadas.join(' ')
        ].join(' '));

        indexadas.push({
          ...metrica,
          sistema: sistemaFinal,
          tablas_referenciadas: tablasReferenciadas,
          tags_inteligencia: tags,
          texto_busqueda: textoBusqueda
        });
      }
    }

    // ── Índices O(1) para filtrado rápido ──────────────────────────
    const indexPorSistema = new Map(); // Map<sistema, number[]>
    const indexPorCategoria = new Map(); // Map<categoria, number[]>

    for (let i = 0; i < indexadas.length; i++) {
      const m = indexadas[i];
      const sis = m.sistema;
      const cat = normalizarTexto(m.categoria || '');

      if (!indexPorSistema.has(sis)) indexPorSistema.set(sis, []);
      if (!indexPorCategoria.has(cat)) indexPorCategoria.set(cat, []);

      indexPorSistema.get(sis).push(i);
      indexPorCategoria.get(cat).push(i);
    }

    // ── Precomputar IDF para TF-IDF ────────────────────────────────
    const N = indexadas.length || 1;
    const dfMap = new Map(); // token → document frequency
    const tokenIDF = new Map(); // token → IDF weight

    for (const m of indexadas) {
      const uniqueToks = new Set(tokenizar(m.texto_busqueda || ''));
      for (const tok of uniqueToks) dfMap.set(tok, (dfMap.get(tok) || 0) + 1);
    }
    for (const [tok, df] of dfMap.entries()) {
      tokenIDF.set(tok, Math.log(1 + N / df));
    }

    return { indexadas, indexPorSistema, indexPorCategoria, tokenIDF };
  }

  inferirTagsMetrica(metrica = {}) {
    const tags = [];
    const texto = normalizarTexto(`${metrica.id || ''} ${metrica.nombre || ''} ${metrica.descripcion || ''}`);

    for (const [intencion, palabras] of Object.entries(INTENCIONES)) {
      if (palabras.some((palabra) => texto.includes(normalizarTexto(palabra)))) {
        tags.push(intencion);
      }
    }

    return tags;
  }

  normalizarSistemaEntrada(sistema) {
    if (!sistema) return null;
    const texto = normalizarTexto(sistema);

    for (const sistemaCanonico of SISTEMAS_VALIDOS) {
      const alias = MAPEO_SISTEMAS[sistemaCanonico];
      if (alias.some((valor) => texto === normalizarTexto(valor))) {
        return sistemaCanonico;
      }
    }

    const directo = texto.toUpperCase();
    if (SISTEMAS_VALIDOS.includes(directo)) return directo;
    return null;
  }

  resolverSistemas(sistemasEntrada = null, textoObjetivo = '') {
    if (Array.isArray(sistemasEntrada) && sistemasEntrada.length > 0) {
      return unico(
        sistemasEntrada
          .map((sistema) => this.normalizarSistemaEntrada(sistema))
          .filter(Boolean)
      );
    }

    const tokens = tokenizar(textoObjetivo);
    const encontrados = [];

    for (const sistema of SISTEMAS_VALIDOS) {
      const alias = MAPEO_SISTEMAS[sistema];
      if (alias.some((valor) => tokens.includes(normalizarTexto(valor)))) {
        encontrados.push(sistema);
      }
    }

    return encontrados.length > 0 ? encontrados : SISTEMAS_VALIDOS;
  }

  detectarIntenciones(tokens = []) {
    const encontradas = new Set();

    for (const [intencion, palabras] of Object.entries(INTENCIONES)) {
      if (tokens.some((token) => palabras.includes(token))) {
        encontradas.add(intencion);
      }
    }

    return Array.from(encontradas);
  }

  /**
   * Puntúa una métrica frente a la consulta del usuario.
   *
   * Mejoras sobre la versión original:
   *   • Pesos escalados por IDF  → tokens infrecuentes valen más.
   *   • Fuzzy matching (Levenshtein ≤ 2) → tolera errores tipográficos.
   *   • Expansión de sinónimos  → ya aplicada en los tokens de entrada.
   *   • Popularidad             → métricas consultadas suben en ranking.
   *
   * @param {Object}  metrica
   * @param {string[]} tokens          Tokens expandidos con sinónimos.
   * @param {string[]} intenciones
   * @param {string[]} sistemasObjetivo
   * @param {Object}  [opciones={}]
   * @param {Map<string,number>} [opciones.tokenIDF]     IDF precomputado.
   * @param {Map<string,number>} [opciones.popularidades] Contadores de acceso.
   * @returns {number}
   */
  puntuarMetrica(metrica, tokens, intenciones, sistemasObjetivo, opciones = {}) {
    const { tokenIDF = null, popularidades = null } = opciones;
    let score = 0;
    const categoriaNormalizada = normalizarTexto(metrica.categoria);

    // Bonus por sistema activo
    if (!sistemasObjetivo || sistemasObjetivo.length === 0 || sistemasObjetivo.includes(metrica.sistema)) {
      score += 8;
    }

    const idNorm = normalizarTexto(metrica.id);
    const nombreNorm = normalizarTexto(metrica.nombre);
    const descNorm = normalizarTexto(metrica.descripcion);
    const tbNorm = metrica.texto_busqueda || '';

    for (const token of tokens) {
      // IDF: penaliza tokens muy comunes (alta frecuencia → IDF bajo)
      const idf = tokenIDF?.get(token) ?? 1.0;
      let tokenHit = false;

      // Coincidencias exactas (escala cada peso por IDF)
      if (idNorm.includes(token)) { score += 14 * idf; tokenHit = true; }
      if (nombreNorm.includes(token)) { score += 11 * idf; tokenHit = true; }
      if (descNorm.includes(token)) { score += 8 * idf; tokenHit = true; }
      if (categoriaNormalizada.includes(token)) { score += 9 * idf; tokenHit = true; }
      if (!tokenHit && tbNorm.includes(token)) { score += 4 * idf; tokenHit = true; }

      // Coincidencia fuzzy (Levenshtein ≤ 2) solo si no hubo exacta
      if (!tokenHit && token.length >= 4) {
        if (fuzzyContiene(token, idNorm)) score += 7 * idf;
        else if (fuzzyContiene(token, nombreNorm)) score += 5 * idf;
        else if (fuzzyContiene(token, tbNorm)) score += 2 * idf;
      }
    }

    for (const intencion of intenciones) {
      if (categoriaNormalizada.includes(intencion)) score += 22;
      if ((metrica.tags_inteligencia || []).includes(intencion)) score += 10;
    }

    if (metrica.tipo === 'escalar' && tokens.some((t) => ['kpi', 'resumen', 'ejecutivo'].includes(t))) score += 10;
    if (metrica.tipo === 'serie' && tokens.some((t) => ['tendencia', 'historico', 'mes', 'dia'].includes(t))) score += 10;
    if (metrica.tipo === 'tabla' && tokens.some((t) => ['top', 'ranking', 'detalle', 'comparativo'].includes(t))) score += 8;
    if (metrica.alerta) score += 3;

    // Popularidad: métricas más accedidas suben (máx +20 pts)
    if (popularidades?.has(metrica.id)) {
      score += Math.min(popularidades.get(metrica.id) * 2, 20);
    }

    return score;
  }

  definirTipoWidget(metrica) {
    if (metrica.alerta) return 'alerta';
    if (metrica.tipo === 'escalar') return 'kpi';
    if (metrica.tipo === 'serie') return 'linea';

    const categoria = normalizarTexto(metrica.categoria || '');
    if (metrica.tipo === 'tabla' && (categoria.includes('breakdown') || categoria.includes('top') || categoria.includes('performance'))) {
      return 'barras';
    }

    return 'tabla';
  }

  crearLayoutWidgets(metricas) {
    const configuracion = {
      kpi: { w: 4, h: 2 },
      alerta: { w: 4, h: 2 },
      linea: { w: 6, h: 4 },
      barras: { w: 6, h: 4 },
      tabla: { w: 12, h: 5 }
    };

    const widgets = [];
    let x = 0;
    let y = 0;
    let alturaFila = 0;

    metricas.forEach((metrica, indice) => {
      const tipoWidget = this.definirTipoWidget(metrica);
      const layout = configuracion[tipoWidget] || configuracion.tabla;

      if (x + layout.w > 12) {
        x = 0;
        y += alturaFila;
        alturaFila = 0;
      }

      widgets.push({
        id: `widget_${indice + 1}`,
        metrica_id: metrica.id,
        sistema: metrica.sistema,
        titulo: metrica.nombre,
        descripcion: metrica.descripcion,
        categoria: metrica.categoria,
        tipo_metrica: metrica.tipo,
        tipo_widget: tipoWidget,
        prioridad: indice + 1,
        parametros_recomendados: (metrica.parametros || []).map((parametro) => ({
          nombre: parametro.nombre,
          tipo: parametro.tipo,
          requerido: Boolean(parametro.requerido),
          default: parametro.default
        })),
        layout: {
          x,
          y,
          w: layout.w,
          h: layout.h
        }
      });

      x += layout.w;
      alturaFila = Math.max(alturaFila, layout.h);
    });

    return widgets;
  }

  seleccionarMetricasDiversas(candidatas, maxWidgets) {
    const seleccionadas = [];
    const usoCategoria = new Map();
    const restantes = [];

    for (const metrica of candidatas) {
      if (seleccionadas.length >= maxWidgets) break;
      const categoria = metrica.categoria || 'general';
      const usoActual = usoCategoria.get(categoria) || 0;

      if (usoActual < 2 || maxWidgets <= 4) {
        seleccionadas.push(metrica);
        usoCategoria.set(categoria, usoActual + 1);
      } else {
        restantes.push(metrica);
      }
    }

    for (const metrica of restantes) {
      if (seleccionadas.length >= maxWidgets) break;
      seleccionadas.push(metrica);
    }

    return seleccionadas;
  }

  async obtenerSistemas() {
    await this.asegurarCache();

    return SISTEMAS_VALIDOS.map((sistema) => {
      const metricas = (this.cache.metricasIndexadas || []).filter((metrica) => metrica.sistema === sistema);
      const categorias = unico(metricas.map((metrica) => metrica.categoria).filter(Boolean)).sort();

      const catalogo = this.cache.catalogoPorSistema[sistema];
      const totalTablas = catalogo?.tablas ? Object.keys(catalogo.tablas).length : 0;

      return {
        codigo: sistema,
        metricas: metricas.length,
        categorias,
        tablas: totalTablas
      };
    });
  }

  /**
   * Lista métricas con paginación, filtros O(1) y búsqueda fuzzy/sinónimos.
   *
   * @param {Object} filtros
   * @param {string}  [filtros.sistema]
   * @param {string}  [filtros.categoria]
   * @param {string}  [filtros.tipo]
   * @param {string}  [filtros.texto | filtros.q]  Texto libre (fuzzy + sinónimos).
   * @param {string}  [filtros.modulo]             Filtra por módulo Aspel.
   * @param {number}  [filtros.page=1]             Página (1-based).
   * @param {number}  [filtros.limit=20]           Filas por página (máx 100).
   * @param {boolean} [filtros.incluir_query]
   * @returns {{ data: Object[], total: number, page: number, limit: number, totalPages: number }}
   */
  async listarMetricas(filtros = {}) {
    await this.asegurarCache();

    const sistema = this.normalizarSistemaEntrada(filtros.sistema);
    const categoria = filtros.categoria ? normalizarTexto(filtros.categoria) : null;
    const tipo = filtros.tipo ? normalizarTexto(filtros.tipo) : null;
    const modulo = filtros.modulo ? normalizarTexto(filtros.modulo) : null;
    const textoRaw = filtros.texto || filtros.q || null;
    const incluirQuery = Boolean(filtros.incluir_query);

    // Paginación (limit ≤ 100, page ≥ 1)
    const limit = limitarNumero(filtros.limit || filtros.limite, 1, 100, 20);
    const page = limitarNumero(filtros.page, 1, 99999, 1);
    const offset = (page - 1) * limit;

    // ── Pre-filtro O(1) por sistema usando índice invertido ────────────────
    let candidatos;
    if (sistema && this.cache.indexPorSistema?.has(sistema)) {
      const idxs = this.cache.indexPorSistema.get(sistema);
      candidatos = idxs.map((i) => this.cache.metricasIndexadas[i]);
    } else {
      candidatos = this.cache.metricasIndexadas || [];
    }

    // Filtros adicionales simples
    if (categoria) candidatos = candidatos.filter((m) => normalizarTexto(m.categoria) === categoria);
    if (tipo) candidatos = candidatos.filter((m) => normalizarTexto(m.tipo) === tipo);
    if (modulo) candidatos = candidatos.filter((m) =>
      normalizarTexto(m.modulo || m.categoria || '').includes(modulo)
    );

    // Búsqueda de texto con fuzzy + sinónimos
    if (textoRaw) {
      const tokens = tokenizar(textoRaw);
      const expanded = expandirConSinonimos(tokens);
      candidatos = candidatos.filter((m) => {
        const tb = m.texto_busqueda || '';
        return expanded.some((tok) => tb.includes(tok) || fuzzyContiene(tok, tb));
      });
    }

    const total = candidatos.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const data = candidatos.slice(offset, offset + limit).map((metrica) => {
      const base = {
        id: metrica.id,
        nombre: metrica.nombre,
        descripcion: metrica.descripcion,
        sistema: metrica.sistema,
        categoria: metrica.categoria,
        tipo: metrica.tipo,
        tablas_referenciadas: metrica.tablas_referenciadas,
        tags_inteligencia: metrica.tags_inteligencia
      };
      if (incluirQuery) base.query_duckdb = metrica.query_duckdb || metrica.consulta || null;
      return base;
    });

    return { data, total, page, limit, totalPages };
  }

  async obtenerMetrica(metricaId, sistema = null) {
    await this.asegurarCache();

    const sistemaNormalizado = this.normalizarSistemaEntrada(sistema);
    const idBuscado = normalizarTexto(metricaId);

    return (this.cache.metricasIndexadas || []).find((metrica) => (
      normalizarTexto(metrica.id) === idBuscado &&
      (sistemaNormalizado ? metrica.sistema === sistemaNormalizado : true)
    )) || null;
  }

  async buscarMetricasInteligentes(opciones = {}) {
    await this.asegurarCache();

    const objetivo = opciones.objetivo || opciones.texto || '';
    const tokens = tokenizar(objetivo);
    const tokensExpandidos = expandirConSinonimos(tokens); // sinónimos añadidos
    const intenciones = this.detectarIntenciones(tokens);
    const sistemasObjetivo = this.resolverSistemas(opciones.sistemas, objetivo);
    const limite = limitarNumero(opciones.limite, 1, 100, 12);

    // ── Paso 1: extracción de entidades ─────────────────────────
    const contexto_detectado = extraerEntidades(objetivo);

    const categoriaFiltro = opciones.categoria ? normalizarTexto(opciones.categoria) : null;
    const tipoFiltro = opciones.tipo ? normalizarTexto(opciones.tipo) : null;

    // ── Paso 2: filtrado O(1) por sistema + score TF-IDF/fuzzy ──
    const popularidades = indice.obtenerPopularidades();
    const opcionesScore = { tokenIDF: this.cache.tokenIDF, popularidades };

    let candidatasIA;
    if (this.cache.indexPorSistema) {
      candidatasIA = [];
      for (const sis of sistemasObjetivo) {
        const idxs = this.cache.indexPorSistema.get(sis) || [];
        for (const i of idxs) candidatasIA.push(this.cache.metricasIndexadas[i]);
      }
    } else {
      candidatasIA = (this.cache.metricasIndexadas || []).filter((m) => sistemasObjetivo.includes(m.sistema));
    }

    if (categoriaFiltro) candidatasIA = candidatasIA.filter((m) => normalizarTexto(m.categoria) === categoriaFiltro);
    if (tipoFiltro) candidatasIA = candidatasIA.filter((m) => normalizarTexto(m.tipo) === tipoFiltro);

    const puntuadas = candidatasIA
      .map((m) => ({ ...m, _score_raw: this.puntuarMetrica(m, tokensExpandidos, intenciones, sistemasObjetivo, opcionesScore) }))
      .filter((m) => m._score_raw > 0);

    // ── Paso 3: normalización min-max → 0-100 ───────────────────
    const rawScores = puntuadas.map((m) => m._score_raw);
    const scoreMin = rawScores.length ? Math.min(...rawScores) : 0;
    const scoreMax = rawScores.length ? Math.max(...rawScores) : 1;
    const scoreRango = (scoreMax - scoreMin) || 1; // evitar división por cero

    const normalizadas = puntuadas
      .map((m) => ({
        ...m,
        score_relevancia: Number(((m._score_raw - scoreMin) / scoreRango * 100).toFixed(1))
      }))
      .sort((a, b) => b.score_relevancia - a.score_relevancia)
      .slice(0, limite);

    // ── Paso 4: desambiguación ───────────────────────────────────
    // Para cada token significativo, agrupar métricas que comparten una
    // raíz de ID (e.g. utilidad_bruta / utilidad_neta / utilidad_operativa
    // → raíz "utilidad") y marcarlas si hay ≥ 2 en el resultado.
    const gruposAmbiguos = new Map(); // raiz → [id, id, ...]

    for (const token of tokens) {
      if (token.length < 4) continue; // ignorar tokens muy cortos
      const coincidentes = normalizadas.filter(
        (m) => normalizarTexto(m.nombre).includes(token) || normalizarTexto(m.id).includes(token)
      );
      if (coincidentes.length < 2) continue;

      // Agrupar por prefijo de ID (partes antes del último segmento)
      const familia = {};
      for (const m of coincidentes) {
        const partes = normalizarTexto(m.id).split('_');
        const raiz = partes.length > 1 ? partes.slice(0, -1).join('_') : partes[0];
        (familia[raiz] = familia[raiz] || []).push(m.id);
      }
      for (const [raiz, ids] of Object.entries(familia)) {
        if (ids.length >= 2 && !gruposAmbiguos.has(raiz)) {
          gruposAmbiguos.set(raiz, ids);
        }
      }
    }

    const idsAmbiguos = new Set(Array.from(gruposAmbiguos.values()).flat());

    // ── Paso 5: construir resultado final ────────────────────────
    const resultados = normalizadas.map((m) => {
      const resultado = {
        id: m.id,
        nombre: m.nombre,
        descripcion: m.descripcion,
        sistema: m.sistema,
        categoria: m.categoria,
        tipo: m.tipo,
        score_relevancia: m.score_relevancia,
        tipo_widget_sugerido: this.definirTipoWidget(m),
        tablas_referenciadas: m.tablas_referenciadas
      };
      if (idsAmbiguos.has(m.id)) resultado.requiere_desambiguacion = true;
      return resultado;
    });

    // Grupos de desambiguación para el consumidor del endpoint
    const grupos_ambiguos = gruposAmbiguos.size > 0
      ? Array.from(gruposAmbiguos.entries()).map(([raiz, ids]) => ({
        raiz,
        metricas: ids,
        mensaje: `Se encontraron ${ids.length} métricas relacionadas con "${raiz}". ¿Cuál deseas usar?`
      }))
      : undefined;

    // Guardar en historial de búsquedas (non-blocking, no bloquea si SQLite falla)
    indice.registrarBusqueda(objetivo, sistemasObjetivo.join(','), resultados.length);

    return {
      objetivo,
      sistemas: sistemasObjetivo,
      intenciones_detectadas: intenciones,
      contexto_detectado,
      ...(grupos_ambiguos ? { grupos_ambiguos } : {}),
      resultados
    };
  }

  async sugerirDashboard(opciones = {}) {
    await this.asegurarCache();

    const objetivo = opciones.objetivo || 'panel ejecutivo integral';
    const descripcionNegocio = opciones.descripcion_negocio || '';
    const periodoExplicito = opciones.periodo || null;
    const numColumnas = [2, 3].includes(Number(opciones.num_columnas))
      ? Number(opciones.num_columnas)
      : 3;
    const maxWidgets = limitarNumero(opciones.maxWidgets, 3, 20, 8);

    // ── Sistemas activos: explícito > detección automática desde texto ──
    const sistemasActivos = Array.isArray(opciones.sistemas_activos) && opciones.sistemas_activos.length
      ? unico(opciones.sistemas_activos
        .map((s) => this.normalizarSistemaEntrada(s))
        .filter(Boolean))
      : this.resolverSistemas(
        opciones.sistemas,
        [objetivo, descripcionNegocio].filter(Boolean).join(' ')
      );

    // ── Búsqueda amplia de candidatas ───────────────────────────────────
    const textoCompleto = [objetivo, descripcionNegocio].filter(Boolean).join(' ');
    const busqueda = await this.buscarMetricasInteligentes({
      objetivo: textoCompleto,
      sistemas: sistemasActivos,
      limite: maxWidgets * 5
    });

    // ── Enriquecer contexto con periodo explícito si no se detectó nada ──
    const contexto = busqueda.contexto_detectado;
    if (periodoExplicito && !contexto.periodos.length) {
      const matchAño = String(periodoExplicito).match(/(20\d{2})/);
      const matchMes = String(periodoExplicito).match(/-(0?[1-9]|1[0-2])/);
      if (matchAño) {
        contexto.periodos.push({
          tipo: matchMes ? 'mes' : 'año',
          año: Number(matchAño[1]),
          mes_inicio: matchMes ? Number(matchMes[1]) : undefined,
          mes_fin: matchMes ? Number(matchMes[1]) : undefined
        });
      }
    }

    // ── Selección inteligente con reglas de prioridad ──────────────────
    const widgets = this._seleccionarWidgetsInteligentes(
      busqueda.resultados,
      sistemasActivos,
      maxWidgets,
      numColumnas,
      contexto,
      objetivo
    );

    return {
      generado_en: new Date().toISOString(),
      objetivo,
      ...(descripcionNegocio ? { descripcion_negocio: descripcionNegocio } : {}),
      sistemas: sistemasActivos,
      num_columnas: numColumnas,
      contexto_detectado: contexto,
      resumen: {
        widgets: widgets.length,
        candidatas_evaluadas: busqueda.resultados.length,
        intenciones_detectadas: busqueda.intenciones_detectadas,
        sistemas_activos: sistemasActivos
      },
      recomendaciones: [
        'Prioriza los KPIs en la primera fila para lectura ejecutiva.',
        'Usa filtros globales de fecha para mantener comparabilidad entre sistemas.',
        'Programa actualizacion incremental cada 10-30 minutos segun volumen.'
      ],
      widgets
    };
  }

  // ── Selección inteligente con 4 reglas de prioridad ─────────────────
  _seleccionarWidgetsInteligentes(candidatas, sistemasActivos, maxWidgets, numColumnas, contexto, objetivo) {
    const seleccionadas = [];
    const metricasUsadas = new Set();
    const logicaMap = new Map();

    const pick = (metrica, razon) => {
      if (metricasUsadas.has(metrica.id)) return false;
      if (seleccionadas.length >= maxWidgets) return false;
      seleccionadas.push(metrica);
      metricasUsadas.add(metrica.id);
      logicaMap.set(metrica.id, razon);
      return true;
    };

    // ── Regla 1: KPI de ventas obligatorio si SAE activo ────────────────
    if (sistemasActivos.includes('SAE')) {
      const kpiVentas = candidatas.find((m) =>
        m.sistema === 'SAE' &&
        (m.tipo === 'escalar' || m.tipo_widget_sugerido === 'kpi') &&
        /venta|factura|ingreso|vend/.test(normalizarTexto(m.nombre + ' ' + (m.categoria || '')))
      );
      if (kpiVentas) {
        pick(
          kpiVentas,
          `Seleccioné "${kpiVentas.nombre}" como KPI de ventas obligatorio para SAE: ` +
          `es la métrica con mayor confianza (${kpiVentas.score_relevancia} puntos) ` +
          `en la categoría "${kpiVentas.categoria || 'ventas'}"`
        );
      }
    }

    // ── Regla 2: KPI de saldo obligatorio si BANCO activo ───────────────
    if (sistemasActivos.includes('BANCO')) {
      const kpiSaldo = candidatas.find((m) =>
        m.sistema === 'BANCO' &&
        (m.tipo === 'escalar' || m.tipo_widget_sugerido === 'kpi') &&
        /saldo|balance|disponible|efectivo|caja/.test(normalizarTexto(m.nombre + ' ' + (m.categoria || '')))
      );
      if (kpiSaldo) {
        pick(
          kpiSaldo,
          `Seleccioné "${kpiSaldo.nombre}" como KPI de saldo bancario obligatorio para BANCO ` +
          `(score: ${kpiSaldo.score_relevancia} puntos)`
        );
      }
    }

    // ── Regla 3: Al menos una gráfica de tendencia temporal (tipo serie) ─
    const serieWidget = candidatas.find((m) =>
      !metricasUsadas.has(m.id) &&
      (m.tipo === 'serie' || m.tipo_widget_sugerido === 'linea')
    );
    if (serieWidget) {
      pick(
        serieWidget,
        `Seleccioné "${serieWidget.nombre}" como gráfica de tendencia temporal ` +
        `(tipo: ${serieWidget.tipo}, score: ${serieWidget.score_relevancia} puntos, ` +
        `sistema: ${serieWidget.sistema})`
      );
    }

    // ── Regla 4: Completa slots con candidatas diversas; máximo 1 tabla ──
    let tablaIncluida = false;
    for (const m of candidatas) {
      if (seleccionadas.length >= maxWidgets) break;
      if (metricasUsadas.has(m.id)) continue;

      const esTabla = m.tipo === 'tabla' || m.tipo_widget_sugerido === 'tabla';
      if (esTabla) {
        if (tablaIncluida) continue;   // solo 1 tabla por dashboard
        tablaIncluida = true;
        pick(
          m,
          `Seleccioné "${m.nombre}" como tabla de detalle ` +
          `(solo se permite 1 tabla por dashboard; score: ${m.score_relevancia} puntos)`
        );
      } else {
        const razonSecundaria = m.score_relevancia >= 60
          ? `alta relevancia (${m.score_relevancia} puntos)`
          : `relevancia complementaria (${m.score_relevancia} puntos)`;
        pick(
          m,
          `Seleccioné "${m.nombre}" porque la búsqueda menciona "${objetivo.slice(0, 40)}" ` +
          `y tiene ${razonSecundaria} en el sistema ${m.sistema}`
        );
      }
    }

    return this._crearLayoutAdaptativo(seleccionadas, numColumnas, contexto, logicaMap);
  }

  // ── Genera layout con tamaños inteligentes y pre-llena parámetros ────
  _crearLayoutAdaptativo(metricas, numColumnas, contexto, logicaMap) {
    const TAMANIOS = {
      kpi: { w: 4, h: 2 },
      alerta: { w: 4, h: 2 },
      linea: { w: 6, h: 4 },
      barras: { w: 6, h: 4 },
      tabla: { w: 12, h: 5 }
    };

    const widgets = [];
    let x = 0;
    let y = 0;
    let alturaFila = 0;

    metricas.forEach((metrica, indice) => {
      const tipoWidget = this.definirTipoWidget(metrica);
      const tam = TAMANIOS[tipoWidget] || TAMANIOS.tabla;

      if (x + tam.w > 12) {
        x = 0;
        y += alturaFila;
        alturaFila = 0;
      }

      const parametrosPreLlenados = this._inferirParametrosPreLlenados(metrica, contexto);

      widgets.push({
        id: `widget_${indice + 1}`,
        metrica_id: metrica.id,
        sistema: metrica.sistema,
        titulo: metrica.nombre,
        descripcion: metrica.descripcion,
        categoria: metrica.categoria,
        tipo_metrica: metrica.tipo,
        tipo_widget: tipoWidget,
        prioridad: indice + 1,
        parametros_recomendados: (metrica.parametros || []).map((p) => ({
          nombre: p.nombre,
          tipo: p.tipo,
          requerido: Boolean(p.requerido),
          default: p.default
        })),
        ...(parametrosPreLlenados ? { parametros_pre_llenados: parametrosPreLlenados } : {}),
        layout: { x, y, w: tam.w, h: tam.h },
        logica_seleccion: logicaMap.get(metrica.id) ||
          `Seleccioné "${metrica.nombre}" por score de relevancia ${metrica.score_relevancia} ` +
          `en sistema ${metrica.sistema}`
      });

      x += tam.w;
      alturaFila = Math.max(alturaFila, tam.h);
    });

    return widgets;
  }

  // ── Infiere parámetros desde contexto extraído del texto de búsqueda ─
  _inferirParametrosPreLlenados(metrica, contexto) {
    const parametrosMetrica = metrica.parametros || [];
    if (!parametrosMetrica.length) return null;

    const params = {};

    for (const p of parametrosMetrica) {
      const n = normalizarTexto(p.nombre);

      // Sistema
      if (/^sistema$|sistema_origen/.test(n)) {
        params[p.nombre] = metrica.sistema;
        continue;
      }

      // Año / ejercicio
      if (/a[nñ]o|year|ejercicio/.test(n)) {
        const con = contexto.periodos.find((pe) => pe.año);
        if (con) { params[p.nombre] = con.año; continue; }
      }

      // Mes de inicio
      if (/mes_inicio|mes_desde|month_start/.test(n)) {
        const con = contexto.periodos.find((pe) => pe.mes_inicio);
        if (con) { params[p.nombre] = con.mes_inicio; continue; }
      }

      // Mes de fin
      if (/mes_fin|mes_hasta|month_end/.test(n)) {
        const con = contexto.periodos.find((pe) => pe.mes_fin);
        if (con) { params[p.nombre] = con.mes_fin; continue; }
      }

      // Mes genérico
      if (/^mes$|^month$/.test(n)) {
        const con = contexto.periodos.find((pe) => pe.mes_inicio || pe.mes_fin);
        if (con) { params[p.nombre] = con.mes_inicio || con.mes_fin; continue; }
      }

      // Trimestre
      if (/trimestre|quarter/.test(n)) {
        const con = contexto.periodos.find((pe) => pe.tipo === 'trimestre');
        if (con) { params[p.nombre] = con.trimestre; continue; }
      }

      // Umbral / monto mínimo
      if (/monto|umbral|minimo|limite/.test(n)) {
        const mon = contexto.montos.find((mo) => />=|>/.test(mo.operador));
        if (mon) { params[p.nombre] = mon.umbral; continue; }
      }

      // Umbral máximo
      if (/maximo|tope/.test(n)) {
        const mon = contexto.montos.find((mo) => /<=|</.test(mo.operador));
        if (mon) { params[p.nombre] = mon.umbral; continue; }
      }
    }

    return Object.keys(params).length ? params : null;
  }

  async listarTablas(filtros = {}) {
    await this.asegurarCache();

    const sistema = this.normalizarSistemaEntrada(filtros.sistema);
    if (!sistema) {
      throw new Error('Debes indicar un sistema valido: SAE, COI, NOI o BANCO');
    }

    const semantica = this.cache.semanticaPorSistema[sistema];
    const catalogo = this.cache.catalogoPorSistema[sistema];
    const texto = filtros.texto ? normalizarTexto(filtros.texto) : null;
    const modulo = filtros.modulo ? normalizarTexto(filtros.modulo) : null;
    const limite = limitarNumero(filtros.limite, 1, 2000, 100);

    const nombres = new Set([
      ...Object.keys(semantica?.tablas || {}),
      ...Object.keys(catalogo?.tablas || {})
    ]);

    const tablas = Array.from(nombres).map((nombreTabla) => {
      const infoSemantica = semantica?.tablas?.[nombreTabla] || null;
      const infoCatalogo = catalogo?.tablas?.[nombreTabla] || null;

      let totalCampos = 0;
      if (Array.isArray(infoCatalogo?.campos)) totalCampos = infoCatalogo.campos.length;
      if (infoSemantica?.campos && typeof infoSemantica.campos === 'object') {
        totalCampos = Math.max(totalCampos, Object.keys(infoSemantica.campos).length);
      }

      return {
        tabla: nombreTabla,
        modulo: infoSemantica?.modulo || 'General',
        tipo: infoSemantica?.tipo || infoSemantica?.tipo_inferido || 'Desconocido',
        descripcion: infoSemantica?.descripcion || infoCatalogo?.descripcion || null,
        campos: totalCampos
      };
    });

    return tablas
      .filter((item) => (modulo ? normalizarTexto(item.modulo).includes(modulo) : true))
      .filter((item) => {
        if (!texto) return true;
        const bolsa = normalizarTexto(`${item.tabla} ${item.modulo} ${item.tipo} ${item.descripcion || ''}`);
        return bolsa.includes(texto);
      })
      .sort((a, b) => a.tabla.localeCompare(b.tabla))
      .slice(0, limite);
  }

  async describirTabla(sistema, tabla) {
    await this.asegurarCache();

    const sistemaNormalizado = this.normalizarSistemaEntrada(sistema);
    if (!sistemaNormalizado) {
      throw new Error('Sistema invalido');
    }

    const tablaBuscada = String(tabla || '').toUpperCase();
    const semantica = this.cache.semanticaPorSistema[sistemaNormalizado];
    const catalogo = this.cache.catalogoPorSistema[sistemaNormalizado];

    const infoSemantica = semantica?.tablas?.[tablaBuscada] || null;
    const infoCatalogo = catalogo?.tablas?.[tablaBuscada] || null;

    if (!infoSemantica && !infoCatalogo) {
      return null;
    }

    const camposCatalogo = Array.isArray(infoCatalogo?.campos) ? infoCatalogo.campos : [];
    const camposSemantica = infoSemantica?.campos || {};

    const relacionesInferidas = Array.isArray(semantica?.relaciones_inferidas)
      ? semantica.relaciones_inferidas.filter((relacion) => (
        String(relacion.tabla_origen || '').toUpperCase() === tablaBuscada ||
        String(relacion.tabla_destino || '').toUpperCase() === tablaBuscada
      ))
      : [];

    // ── Joins sugeridos y radios de relación (enriquecimiento en memoria) ──
    const motor = new MotorInferencias();
    const todas_relaciones = Array.isArray(semantica?.relaciones_inferidas)
      ? semantica.relaciones_inferidas
      : [];
    const catalogoTablas = catalogo?.tablas || {};

    const joins_sugeridos = motor
      .obtenerJoinsSugeridos(tablaBuscada, catalogoTablas, todas_relaciones)
      .map((j) => ({
        tabla: j.tabla,
        join_sql: j.join_sql,
        tipo: j.tipo,
        via: j.via || null,
        descripcion: j.descripcion || null
      }));

    const radios = motor.calcularRadios(tablaBuscada, todas_relaciones);

    return {
      sistema: sistemaNormalizado,
      tabla: tablaBuscada,
      descripcion: infoSemantica?.descripcion || infoCatalogo?.descripcion || null,
      modulo: infoSemantica?.modulo || 'General',
      tipo: infoSemantica?.tipo || infoSemantica?.tipo_inferido || 'Desconocido',
      tags: infoSemantica?.tags || [],
      campos: camposCatalogo.map((campo) => {
        const sem = camposSemantica[campo.nombre] || {};
        return {
          nombre: campo.nombre,
          tipo_tecnico: campo.tipo_base || campo.tipo_detalle || campo.tipo || null,
          tipo_semantico: sem.tipo_semantico || null,
          descripcion: sem.descripcion || null,
          permite_null: campo.permite_null,
          posicion: campo.posicion
        };
      }),
      indices: infoCatalogo?.indices || [],
      constraints: infoCatalogo?.constraints || [],
      fks: infoCatalogo?.fks || [],
      relaciones_inferidas: relacionesInferidas,
      joins_sugeridos,
      tablas_relacionadas_directas: radios.directas,
      tablas_relacionadas_indirectas: radios.indirectas
    };
  }
}

module.exports = InteligenciaAspel;
