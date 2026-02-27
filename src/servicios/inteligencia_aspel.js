const fs = require('fs-extra');
const path = require('path');
const CargadorYAML = require('../semantica/cargador_yaml');

const SISTEMAS_VALIDOS = ['SAE', 'COI', 'NOI', 'BANCO'];
const CACHE_TTL_MS = Number(process.env.CENIT_CACHE_TTL || 5 * 60 * 1000);

const STOP_WORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'y', 'o', 'en', 'para', 'por', 'con', 'sin',
  'del', 'al', 'un', 'una', 'unos', 'unas', 'que', 'como', 'mas', 'menos',
  'vs', 'contra', 'entre', 'todo', 'toda', 'todos', 'todas', 'mi', 'su', 'sus',
  'se', 'es', 'son', 'a', 'u'
]);

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

    const index = this.construirIndex(metricasPorSistema, semanticaPorSistema, catalogoPorSistema);

    this.cache = {
      metricasPorSistema,
      semanticaPorSistema,
      catalogoPorSistema,
      metricasIndexadas: index
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

    return indexadas;
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

  puntuarMetrica(metrica, tokens, intenciones, sistemasObjetivo) {
    let score = 0;
    const categoriaNormalizada = normalizarTexto(metrica.categoria);

    if (!sistemasObjetivo || sistemasObjetivo.length === 0 || sistemasObjetivo.includes(metrica.sistema)) {
      score += 8;
    }

    for (const token of tokens) {
      if (normalizarTexto(metrica.id).includes(token)) score += 14;
      if (normalizarTexto(metrica.nombre).includes(token)) score += 11;
      if (normalizarTexto(metrica.descripcion).includes(token)) score += 8;
      if (categoriaNormalizada.includes(token)) score += 9;
      if ((metrica.texto_busqueda || '').includes(token)) score += 4;
    }

    for (const intencion of intenciones) {
      if (categoriaNormalizada.includes(intencion)) score += 22;
      if ((metrica.tags_inteligencia || []).includes(intencion)) score += 10;
    }

    if (metrica.tipo === 'escalar' && tokens.some((token) => ['kpi', 'resumen', 'ejecutivo'].includes(token))) {
      score += 10;
    }
    if (metrica.tipo === 'serie' && tokens.some((token) => ['tendencia', 'historico', 'mes', 'dia'].includes(token))) {
      score += 10;
    }
    if (metrica.tipo === 'tabla' && tokens.some((token) => ['top', 'ranking', 'detalle', 'comparativo'].includes(token))) {
      score += 8;
    }
    if (metrica.alerta) score += 3;

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
      kpi: { w: 3, h: 2 },
      alerta: { w: 3, h: 2 },
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

  async listarMetricas(filtros = {}) {
    await this.asegurarCache();

    const sistema = this.normalizarSistemaEntrada(filtros.sistema);
    const categoria = filtros.categoria ? normalizarTexto(filtros.categoria) : null;
    const tipo = filtros.tipo ? normalizarTexto(filtros.tipo) : null;
    const texto = filtros.texto ? normalizarTexto(filtros.texto) : null;
    const limite = limitarNumero(filtros.limite, 1, 1000, 200);
    const incluirQuery = Boolean(filtros.incluir_query);

    const filtradas = (this.cache.metricasIndexadas || [])
      .filter((metrica) => (sistema ? metrica.sistema === sistema : true))
      .filter((metrica) => (categoria ? normalizarTexto(metrica.categoria) === categoria : true))
      .filter((metrica) => (tipo ? normalizarTexto(metrica.tipo) === tipo : true))
      .filter((metrica) => (texto ? metrica.texto_busqueda.includes(texto) : true))
      .slice(0, limite)
      .map((metrica) => {
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

        if (incluirQuery) {
          base.query_duckdb = metrica.query_duckdb || metrica.consulta || null;
        }

        return base;
      });

    return filtradas;
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
    const intenciones = this.detectarIntenciones(tokens);
    const sistemasObjetivo = this.resolverSistemas(opciones.sistemas, objetivo);
    const limite = limitarNumero(opciones.limite, 1, 100, 12);

    const categoriaFiltro = opciones.categoria ? normalizarTexto(opciones.categoria) : null;
    const tipoFiltro = opciones.tipo ? normalizarTexto(opciones.tipo) : null;

    const candidatas = (this.cache.metricasIndexadas || [])
      .filter((metrica) => sistemasObjetivo.includes(metrica.sistema))
      .filter((metrica) => (categoriaFiltro ? normalizarTexto(metrica.categoria) === categoriaFiltro : true))
      .filter((metrica) => (tipoFiltro ? normalizarTexto(metrica.tipo) === tipoFiltro : true))
      .map((metrica) => ({
        ...metrica,
        score_relevancia: this.puntuarMetrica(metrica, tokens, intenciones, sistemasObjetivo)
      }))
      .sort((a, b) => b.score_relevancia - a.score_relevancia)
      .slice(0, limite)
      .map((metrica) => ({
        id: metrica.id,
        nombre: metrica.nombre,
        descripcion: metrica.descripcion,
        sistema: metrica.sistema,
        categoria: metrica.categoria,
        tipo: metrica.tipo,
        score_relevancia: Number(metrica.score_relevancia.toFixed(2)),
        tipo_widget_sugerido: this.definirTipoWidget(metrica),
        tablas_referenciadas: metrica.tablas_referenciadas
      }));

    return {
      objetivo,
      sistemas: sistemasObjetivo,
      intenciones_detectadas: intenciones,
      resultados: candidatas
    };
  }

  async sugerirDashboard(opciones = {}) {
    await this.asegurarCache();

    const objetivo = opciones.objetivo || 'panel ejecutivo integral';
    const maxWidgets = limitarNumero(opciones.maxWidgets, 3, 20, 8);

    const busqueda = await this.buscarMetricasInteligentes({
      objetivo,
      sistemas: opciones.sistemas,
      limite: maxWidgets * 4
    });

    const metricasSeleccionadas = this.seleccionarMetricasDiversas(
      busqueda.resultados,
      maxWidgets
    );

    const widgets = this.crearLayoutWidgets(metricasSeleccionadas);

    return {
      generado_en: new Date().toISOString(),
      objetivo,
      sistemas: busqueda.sistemas,
      resumen: {
        widgets: widgets.length,
        candidatas_evaluadas: busqueda.resultados.length,
        intenciones_detectadas: busqueda.intenciones_detectadas
      },
      recomendaciones: [
        'Prioriza los KPIs en la primera fila para lectura ejecutiva.',
        'Usa filtros globales de fecha para mantener comparabilidad entre sistemas.',
        'Programa actualizacion incremental cada 10-30 minutos segun volumen.'
      ],
      widgets
    };
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
      relaciones_inferidas: relacionesInferidas
    };
  }
}

module.exports = InteligenciaAspel;
