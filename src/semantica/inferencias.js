/**
 * Motor de Inferencias Semánticas
 * 
 * Agrega inteligencia sobre el diccionario técnico:
 * - Clasifica tipos de tabla (catálogo, movimiento, detalle, configuración)
 * - Identifica campos clave (fechas, importes, status, claves)
 * - Infiere primary keys
 * - Construye grafo de relaciones
 * - Asigna tags de negocio
 */

const fs = require('fs-extra');
const path = require('path');

class MotorInferencias {
  constructor() {
    this.patrones = {
      // Campos de fecha
      fechas: /^(FECHA|FEC|DATE|TIMESTAMP|TIME|DIA|MES|ANO|YEAR|VIGENCIA|VENCIMIENTO)/i,

      // Campos de importe/montos
      importes: /^(IMP|IMPORTE|TOTAL|MONTO|SALDO|PRECIO|COSTO|VALOR|SUBTOTAL|DESCUENTO|CANTIDAD|PAGO|CARGO|ABONO)/i,

      // Campos de status/estado
      estatus: /^(STATUS|ESTATUS|ESTADO|ACTIVO|CANCELADO|VIGENTE|BLOQUEADO|CERRADO)/i,

      // Campos clave/identificadores
      claves: /^(CVE|CLAVE|ID|UUID|FOLIO|NUMERO|NUM|CONSECUTIVO|CODIGO)/i,

      // Campos de descripción
      descripciones: /^(DESCRIP|DESC|NOMBRE|NOM|RAZON|CONCEPTO)/i,

      // Campos computados o calculados
      calculados: /^(CALC|COMPUTED|TOTAL|SALDO|NETO|BRUTO)/i
    };

    // Prefijos de tabla que indican tipo
    this.tiposTabla = {
      catalogo: /^(PARAM|CONFIG|CLIE|PROV|PROD|INVE|VEND|EMPL|CTABAN|CTACON|ZONA|CATEGORIA|UNIDAD|ALMC|BANC|AGNT)/i,
      movimiento: /^(FACT|COMP|PAGA|CUEN|CODI|POLI|MOVI|TRAS|PEDI|REMI|DEVO|CARGO|ABONO|CHEQ)/i,
      detalle: /^(PAR_|DET|PARTIDA)/i,
      configuracion: /^(PARAM|CONFIG|SISTEM)/i,
      bitacora: /^(LOG|HIST|AUDIT|BITA|HISTO)/i,
      temporal: /^(TMP|TEMP|AUX)/i
    };

    // Tags por módulo funcional (SAE)
    this.tagsModulosSAE = {
      ventas: ['FACT', 'CLIE', 'CFDI', 'PED', 'REMI', 'CODI', 'FOLIO'],
      inventarios: ['INVE', 'PROD', 'MULT', 'KITS', 'ALMC', 'EXIS', 'NUMSER'],
      compras: ['COMP', 'PROV', 'ORDEN'],
      cxc: ['CUEN_M', 'CUEN_DET', 'CLICAM', 'CONTAC'],
      cxp: ['PAGA', 'PAGOCODI', 'CONTAP'],
      contabilidad: ['INTCOI', 'CTAESQ'],
      general: ['PARAM', 'CONFIG']
    };

    // Tags para COI
    this.tagsModulosCOI = {
      contabilidad: ['POLI', 'AUXILIAR', 'CTACON', 'SALDOS'],
      bancos: ['CTABAN', 'CHEQ', 'CONCILIA'],
      reportes: ['BALANZA', 'DESIET', 'ESTADO', 'FLUJO']
    };

    // Tags para BANCO
    this.tagsModulosBAN = {
      bancos: ['CTABAN', 'MOVI', 'CHEQ', 'DEPOSI'],
      conciliacion: ['CONCILIA', 'CTECONC'],
      cfdi: ['UUIDTIMBRES'],
      configuracion: ['PARAM', 'PARMOVS']
    };
  }

  /**
   * Infiere semántica completa de un diccionario técnico
   */
  async inferirSemantica(diccionarioTecnico) {
    console.log(`🧠 Infiriendo semántica para ${diccionarioTecnico.sistema}...`);

    const semantica = {
      sistema: diccionarioTecnico.sistema,
      generado_en: new Date().toISOString(),
      version: '1.0.0',
      estadisticas: diccionarioTecnico.estadisticas,
      tablas: {}
    };

    // Procesar cada tabla
    for (const [nombreTabla, tabla] of Object.entries(diccionarioTecnico.tablas)) {
      semantica.tablas[nombreTabla] = await this.inferirTabla(nombreTabla, tabla, diccionarioTecnico);
    }

    // Construir grafo de relaciones
    semantica.grafo_relaciones = this.construirGrafoRelaciones(semantica.tablas);

    // Calcular ranking de importancia
    semantica.ranking = this.calcularRanking(semantica.tablas);

    console.log(`✅ Semántica inferida: ${Object.keys(semantica.tablas).length} tablas procesadas`);

    return semantica;
  }

  /**
   * Infiere información semántica de una tabla
   */
  async inferirTabla(nombreTabla, tabla, diccionarioCompleto) {
    return {
      nombre: nombreTabla,
      tipo_inferido: this.inferirTipoTabla(nombreTabla, tabla),
      campos_clave: this.identificarCamposClave(tabla.campos),
      pk_probable: this.inferirPrimaryKey(tabla),
      relaciones: {
        fks_salientes: tabla.fks.length,
        fks_entrantes: this.contarFKsEntrantes(nombreTabla, diccionarioCompleto),
        tablas_relacionadas: this.obtenerTablasRelacionadas(nombreTabla, diccionarioCompleto)
      },
      tags: this.asignarTags(nombreTabla, diccionarioCompleto.sistema),
      complejidad: this.calcularComplejidad(tabla),
      campos_importantes: this.identificarCamposImportantes(tabla.campos)
    };
  }

  /**
   * Infiere el tipo de tabla basándose en nombre y estructura
   */
  inferirTipoTabla(nombreTabla, tabla) {
    // Verificar por nombre primero
    for (const [tipo, patron] of Object.entries(this.tiposTabla)) {
      if (patron.test(nombreTabla)) {
        return tipo;
      }
    }

    // Inferir por estructura
    const tieneFechas = tabla.campos.some(c => this.patrones.fechas.test(c.nombre));
    const tieneImportes = tabla.campos.some(c => this.patrones.importes.test(c.nombre));
    const tieneMuchosCampos = tabla.campos.length > 20;
    const tieneFKs = tabla.fks.length > 0;

    if (tieneFechas && tieneImportes && tieneFKs) {
      return 'movimiento';
    } else if (nombreTabla.startsWith('PAR_') || nombreTabla.endsWith('_DET')) {
      return 'detalle';
    } else if (!tieneFechas && !tieneImportes && tabla.campos.length < 10) {
      return 'catalogo';
    } else if (tieneMuchosCampos && !tieneFechas) {
      return 'configuracion';
    }

    return 'desconocido';
  }

  /**
   * Identifica campos clave de la tabla
   */
  identificarCamposClave(campos) {
    const clave = {
      fechas: [],
      importes: [],
      estatus: [],
      claves: [],
      descripciones: []
    };

    for (const campo of campos) {
      if (this.patrones.fechas.test(campo.nombre)) {
        clave.fechas.push(campo.nombre);
      }
      if (this.patrones.importes.test(campo.nombre)) {
        clave.importes.push(campo.nombre);
      }
      if (this.patrones.estatus.test(campo.nombre)) {
        clave.estatus.push(campo.nombre);
      }
      if (this.patrones.claves.test(campo.nombre)) {
        clave.claves.push(campo.nombre);
      }
      if (this.patrones.descripciones.test(campo.nombre)) {
        clave.descripciones.push(campo.nombre);
      }
    }

    return clave;
  }

  /**
   * Infiere la primary key de la tabla
   */
  inferirPrimaryKey(tabla) {
    // Buscar índice marcado como PRIMARY
    const pkIndex = tabla.indices.find(idx => idx.es_primary);
    if (pkIndex) {
      return {
        campos: pkIndex.campos.map(c => c.nombre),
        origen: 'indice_pk'
      };
    }

    // Buscar índice UNIQUE en primer campo
    const uniqueIndex = tabla.indices.find(idx => idx.es_unique);
    if (uniqueIndex) {
      return {
        campos: uniqueIndex.campos.map(c => c.nombre),
        origen: 'indice_unique'
      };
    }

    // Inferir por nombre de campo
    const campoId = tabla.campos.find(c =>
      c.nombre.toUpperCase() === 'ID' ||
      c.nombre.toUpperCase().endsWith('_ID') ||
      c.nombre.toUpperCase().startsWith('ID_')
    );

    if (campoId) {
      return {
        campos: [campoId.nombre],
        origen: 'inferido_nombre'
      };
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════
  //  CARDINALIDAD Y JOIN INFERENCE
  // ═══════════════════════════════════════════════════════════

  /**
   * Normaliza nombre de tabla para comparación: strip dígitos finales + uppercase.
   * Ejemplo: 'ACTCAM01' → 'ACTCAM', 'Camp01' → 'CAMP'
   * @private
   */
  _normTabla(nombre) {
    return String(nombre || '').toUpperCase().replace(/\d+$/, '');
  }

  /**
   * Dado un nombre tal como aparece en relaciones_inferidas (sin sufijo, ej. 'CAMP'),
   * devuelve el nombre real en catalogoTablas (ej. 'CAMP01').
   * Si no hay coincidencia, retorna el nombre original.
   * @private
   */
  _resolveNombreTabla(nombreRelacion, catalogoTablas) {
    if (!nombreRelacion) return nombreRelacion;
    if (catalogoTablas[nombreRelacion.toUpperCase()]) return nombreRelacion.toUpperCase();
    const normBusqueda = this._normTabla(nombreRelacion);
    for (const clave of Object.keys(catalogoTablas)) {
      if (this._normTabla(clave) === normBusqueda) return clave.toUpperCase();
    }
    return nombreRelacion.toUpperCase();
  }

  /**
   * Devuelve true si la tabla parece ser una tabla puente M:N
   * (su nombre contiene los prefijos de al menos dos otras tablas).
   * @private
   */
  _esTablaPuente(nombreTabla, catalogoTablas) {
    const norm = nombreTabla.toUpperCase();
    const MIN_PREFIX = 3;
    let coincidencias = 0;
    for (const otro of Object.keys(catalogoTablas)) {
      if (otro.toUpperCase() === norm) continue;
      const prefijo = otro.slice(0, Math.max(MIN_PREFIX, Math.floor(otro.length * 0.6))).toUpperCase();
      if (prefijo.length >= MIN_PREFIX && norm.includes(prefijo)) {
        coincidencias++;
        if (coincidencias >= 2) return true;
      }
    }
    return false;
  }

  /**
   * Infiere la cardinalidad de una relación dado el campo origen.
   *  1:1  — campo_origen está cubierto por índice PRIMARY o UNIQUE en tabla origen
   *  N:1  — FK normal (múltiples filas origen apuntan a una de destino)
   *  M:N  — la tabla origen es una tabla puente
   * @param {string} tablaOrigen
   * @param {string} campoOrigen
   * @param {Object} catalogoTablas  — valor de diccionario.tablas
   * @returns {'1:1'|'N:1'|'M:N'}
   */
  inferirCardinalidad(tablaOrigen, campoOrigen, catalogoTablas) {
    const tablaObj = catalogoTablas[tablaOrigen] || catalogoTablas[tablaOrigen.toUpperCase()];
    if (!tablaObj) return 'N:1';

    if (this._esTablaPuente(tablaOrigen, catalogoTablas)) return 'M:N';

    const indices = tablaObj.indices || [];
    const cubiertoPorUnico = indices.some(
      (idx) => (idx.es_primary || idx.es_unique) &&
        idx.campos.some((c) => c.nombre.toUpperCase() === campoOrigen.toUpperCase())
    );

    return cubiertoPorUnico ? '1:1' : 'N:1';
  }

  /**
   * Busca una relación directa origen → destino en la lista de relaciones inferidas.
   * Soporta tanto relaciones explícitas (tabla_origen/tabla_destino)
   * como basadas en patrón (origen_patron/destino_tabla).
   * La comparación normaliza los nombres (ignora sufijos numéricos como 01/02).
   * @private
   * @returns {{campo_origen, campo_destino, descripcion}|null}
   */
  _buscarRelacionDirecta(tablaOrigen, tablaDestino, relacionesInferidas) {
    const NO = this._normTabla(tablaOrigen);
    const ND = this._normTabla(tablaDestino);

    for (const rel of (relacionesInferidas || [])) {
      // Forma explícita: tabla_origen + tabla_destino
      if (rel.tabla_origen && rel.tabla_destino) {
        if (
          this._normTabla(rel.tabla_origen) === NO &&
          this._normTabla(rel.tabla_destino) === ND
        ) {
          return {
            campo_origen: rel.campo_origen,
            campo_destino: rel.campo_destino,
            descripcion: rel.descripcion || null
          };
        }
      }
      // Forma patrón: origen_patron + destino_tabla (no tiene tabla_origen específica)
      if (!rel.tabla_origen && rel.destino_tabla && rel.origen_patron) {
        if (this._normTabla(rel.destino_tabla) === ND) {
          return {
            campo_origen: rel.origen_patron,
            campo_destino: rel.destino_campo,
            descripcion: rel.descripcion || null
          };
        }
      }
    }
    return null;
  }

  /**
   * Busca una ruta de dos saltos origen → intermedia → destino.
   * La comparación normaliza los nombres (ignora sufijos numéricos).
   * @private
   * @returns {{tablaMedio, rel1, rel2}|null}
   */
  _buscarRuta2Saltos(tablaOrigen, tablaDestino, relacionesInferidas) {
    const NO = this._normTabla(tablaOrigen);
    const ND = this._normTabla(tablaDestino);

    // Tablas alcanzables desde origen en 1 salto
    const primer_salto = [];
    for (const rel of (relacionesInferidas || [])) {
      let viaNorm = null;
      let viaRaw = null;
      let rel1 = null;

      if (
        rel.tabla_origen && this._normTabla(rel.tabla_origen) === NO &&
        rel.tabla_destino && this._normTabla(rel.tabla_destino) !== ND
      ) {
        viaNorm = this._normTabla(rel.tabla_destino);
        viaRaw = rel.tabla_destino;
        rel1 = { campo_origen: rel.campo_origen, campo_destino: rel.campo_destino };
      } else if (
        !rel.tabla_origen && rel.origen_patron && rel.destino_tabla &&
        this._normTabla(rel.destino_tabla) !== ND
      ) {
        viaNorm = this._normTabla(rel.destino_tabla);
        viaRaw = rel.destino_tabla;
        rel1 = { campo_origen: rel.origen_patron, campo_destino: rel.destino_campo };
      }

      if (viaNorm && viaNorm !== NO) {
        primer_salto.push({ tablaMedio: viaRaw, tablaMedioNorm: viaNorm, rel1 });
      }
    }

    // Desde cada intermedia, intento llegar al destino
    for (const { tablaMedio, rel1 } of primer_salto) {
      const rel2 = this._buscarRelacionDirecta(tablaMedio, tablaDestino, relacionesInferidas);
      if (rel2) {
        return { tablaMedio, rel1, rel2 };
      }
    }
    return null;
  }

  /**
   * Genera el SQL de JOIN entre tablaOrigen y tablaDestino.
   * Primero busca relación directa; si no existe, busca ruta de 2 saltos.
   *
   * @param {string} tablaOrigen
   * @param {string} tablaDestino
   * @param {Object} catalogoTablas
   * @param {Array}  relacionesInferidas
   * @returns {{
   *   join_sql: string,
   *   tipo: string,
   *   via: string|null,
   *   campo_origen: string,
   *   campo_destino: string
   * }|null}
   */
  generarJoinSugerido(tablaOrigen, tablaDestino, catalogoTablas, relacionesInferidas = []) {
    // ── Relación directa ──
    const directa = this._buscarRelacionDirecta(tablaOrigen, tablaDestino, relacionesInferidas);
    if (directa) {
      const tipo = this.inferirCardinalidad(tablaOrigen, directa.campo_origen, catalogoTablas);
      const kw = tipo === '1:1' ? 'LEFT JOIN' : 'INNER JOIN';
      return {
        join_sql: `${kw} ${tablaDestino} ON ${tablaOrigen}.${directa.campo_origen} = ${tablaDestino}.${directa.campo_destino}`,
        tipo,
        via: null,
        campo_origen: directa.campo_origen,
        campo_destino: directa.campo_destino,
        descripcion: directa.descripcion
      };
    }

    // ── Ruta de 2 saltos ──
    const dos = this._buscarRuta2Saltos(tablaOrigen, tablaDestino, relacionesInferidas);
    if (dos) {
      const { tablaMedio, rel1, rel2 } = dos;
      return {
        join_sql:
          `INNER JOIN ${tablaMedio} ON ${tablaOrigen}.${rel1.campo_origen} = ${tablaMedio}.${rel1.campo_destino}\n` +
          `       INNER JOIN ${tablaDestino} ON ${tablaMedio}.${rel2.campo_origen} = ${tablaDestino}.${rel2.campo_destino}`,
        tipo: 'N:M',
        via: tablaMedio,
        campo_origen: rel1.campo_origen,
        campo_destino: rel2.campo_destino,
        descripcion: `Vía ${tablaMedio}`
      };
    }

    return null;
  }

  /**
   * Genera todos los JOINs sugeridos para una tabla dada.
   * Itera las relaciones inferidas y construye un join sugerido
   * por cada tabla directamente relacionada.
   *
   * Los nombres en relaciones_inferidas pueden no incluir el sufijo numérico (01/02)
   * del catálogo real. Se utiliza `_resolveNombreTabla` para obtener el nombre canónico.
   *
   * @param {string} nombreTabla
   * @param {Object} catalogoTablas
   * @param {Array}  relacionesInferidas
   * @returns {Array<{tabla, join_sql, tipo, via, descripcion}>}
   */
  obtenerJoinsSugeridos(nombreTabla, catalogoTablas, relacionesInferidas = []) {
    const NT = this._normTabla(nombreTabla);     // nombre normalizado para comparación
    const T = this._resolveNombreTabla(nombreTabla, catalogoTablas); // nombre real en catálogo
    const joins = [];
    const yaAgregadas = new Set();

    for (const rel of relacionesInferidas) {
      // Relaciones salientes desde esta tabla (explícitas)
      if (rel.tabla_origen && this._normTabla(rel.tabla_origen) === NT && rel.tabla_destino) {
        const destReal = this._resolveNombreTabla(rel.tabla_destino, catalogoTablas);
        if (yaAgregadas.has(destReal)) continue;
        yaAgregadas.add(destReal);

        const tipo = this.inferirCardinalidad(T, rel.campo_origen, catalogoTablas);
        const kw = tipo === '1:1' ? 'LEFT JOIN' : 'INNER JOIN';
        joins.push({
          tabla: destReal,
          join_sql: `${kw} ${destReal} ON ${T}.${rel.campo_origen} = ${destReal}.${rel.campo_destino}`,
          tipo,
          via: null,
          descripcion: rel.descripcion || `Relación ${T} → ${destReal}`
        });
      }

      // Relaciones entrantes a esta tabla (explícitas) — la otra tabla tiene FK aquí
      if (rel.tabla_destino && this._normTabla(rel.tabla_destino) === NT && rel.tabla_origen) {
        const origReal = this._resolveNombreTabla(rel.tabla_origen, catalogoTablas);
        if (yaAgregadas.has(origReal)) continue;
        yaAgregadas.add(origReal);

        const tipo = this.inferirCardinalidad(origReal, rel.campo_origen, catalogoTablas);
        const kw = tipo === '1:1' ? 'LEFT JOIN' : 'INNER JOIN';
        joins.push({
          tabla: origReal,
          join_sql: `${kw} ${origReal} ON ${origReal}.${rel.campo_origen} = ${T}.${rel.campo_destino}`,
          tipo: tipo === '1:1' ? '1:1' : '1:N',   // invertido: desde punto de vista del destino
          via: null,
          descripcion: rel.descripcion || `Referenciada por ${origReal}`
        });
      }

      // Relaciones basadas en patrón — destino_tabla normalizada = esta tabla
      if (!rel.tabla_origen && rel.destino_tabla && this._normTabla(rel.destino_tabla) === NT && rel.origen_patron) {
        const clave = `PATRON:${rel.origen_patron}`;
        if (yaAgregadas.has(clave)) continue;
        yaAgregadas.add(clave);
        joins.push({
          tabla: `(tablas con ${rel.origen_patron})`,
          join_sql: `INNER JOIN ${T} ON <origen>.${rel.origen_patron} = ${T}.${rel.destino_campo}`,
          tipo: 'N:1',
          via: null,
          descripcion: rel.descripcion || `Patrón: ${rel.origen_patron} → ${T}.${rel.destino_campo}`
        });
      }
    }

    return joins;
  }

  /**
   * Calcula cuántas tablas están a 1 y a 2 saltos de distancia.
   * Usa nombres normalizados (sin sufijo numérico) para evitar falsos negativos.
   * @param {string} nombreTabla
   * @param {Array}  relacionesInferidas
   * @returns {{directas: number, indirectas: number}}
   */
  calcularRadios(nombreTabla, relacionesInferidas = []) {
    const NT = this._normTabla(nombreTabla);
    const directas = new Set();
    const indirectas = new Set();

    for (const rel of relacionesInferidas) {
      const nOrig = rel.tabla_origen ? this._normTabla(rel.tabla_origen) : null;
      const nDest = rel.tabla_destino ? this._normTabla(rel.tabla_destino) : null;

      if (nOrig === NT && nDest) directas.add(nDest);
      if (nDest === NT && nOrig) directas.add(nOrig);
    }

    // Segundo salto: desde cada directa, ir un nivel más
    for (const vecino of directas) {
      for (const rel of relacionesInferidas) {
        const nOrig = rel.tabla_origen ? this._normTabla(rel.tabla_origen) : null;
        const nDest = rel.tabla_destino ? this._normTabla(rel.tabla_destino) : null;

        if (nOrig === vecino && nDest && nDest !== NT && !directas.has(nDest)) indirectas.add(nDest);
        if (nDest === vecino && nOrig && nOrig !== NT && !directas.has(nOrig)) indirectas.add(nOrig);
      }
    }

    return { directas: directas.size, indirectas: indirectas.size };
  }

  /**
   * Cuenta cuántas FKs apuntan a esta tabla
   */
  contarFKsEntrantes(nombreTabla, diccionarioCompleto) {
    let count = 0;
    for (const tabla of Object.values(diccionarioCompleto.tablas)) {
      count += tabla.fks.filter(fk => fk.tabla_destino === nombreTabla).length;
    }
    return count;
  }

  /**
   * Obtiene lista de tablas relacionadas (via FKs)
   */
  obtenerTablasRelacionadas(nombreTabla, diccionarioCompleto) {
    const relacionadas = new Set();

    // FKs salientes
    const tabla = diccionarioCompleto.tablas[nombreTabla];
    if (tabla) {
      tabla.fks.forEach(fk => relacionadas.add(fk.tabla_destino));
    }

    // FKs entrantes
    for (const [nombre, otraTabla] of Object.entries(diccionarioCompleto.tablas)) {
      if (otraTabla.fks.some(fk => fk.tabla_destino === nombreTabla)) {
        relacionadas.add(nombre);
      }
    }

    return Array.from(relacionadas);
  }

  /**
   * Asigna tags de módulo funcional
   */
  asignarTags(nombreTabla, sistema) {
    const tags = [];
    let mapaModulos = {};

    // Seleccionar mapa según sistema
    switch (sistema) {
      case 'SAE':
        mapaModulos = this.tagsModulosSAE;
        break;
      case 'COI':
        mapaModulos = this.tagsModulosCOI;
        break;
      case 'BANCO':
        mapaModulos = this.tagsModulosBAN;
        break;
      default:
        return tags;
    }

    // Buscar coincidencias
    for (const [tag, prefijos] of Object.entries(mapaModulos)) {
      for (const prefijo of prefijos) {
        if (nombreTabla.toUpperCase().includes(prefijo)) {
          tags.push(tag);
          break;
        }
      }
    }

    return tags.length > 0 ? tags : ['general'];
  }

  /**
   * Calcula complejidad de la tabla
   */
  calcularComplejidad(tabla) {
    return {
      total_campos: tabla.campos.length,
      campos_computed: tabla.campos.filter(c => c.es_computed).length,
      total_indices: tabla.indices.length,
      total_constraints: tabla.constraints.length,
      total_fks: tabla.fks.length,
      score: tabla.campos.length +
        tabla.indices.length * 2 +
        tabla.constraints.length +
        tabla.fks.length * 3
    };
  }

  /**
   * Identifica los campos más importantes
   */
  identificarCamposImportantes(campos) {
    return campos
      .filter(c => {
        // Campos clave, no nulos, o con índices
        return this.patrones.claves.test(c.nombre) ||
          this.patrones.importes.test(c.nombre) ||
          this.patrones.fechas.test(c.nombre) ||
          !c.es_nulo;
      })
      .map(c => c.nombre);
  }

  /**
   * Construye grafo de relaciones entre tablas
   */
  construirGrafoRelaciones(tablas) {
    const grafo = {};

    for (const [nombre, tabla] of Object.entries(tablas)) {
      grafo[nombre] = {
        relacionadas: tabla.relaciones.tablas_relacionadas,
        fks_salientes: tabla.relaciones.fks_salientes,
        fks_entrantes: tabla.relaciones.fks_entrantes,
        grado: tabla.relaciones.tablas_relacionadas.length
      };
    }

    return grafo;
  }

  /**
   * Calcula ranking de importancia de tablas
   */
  calcularRanking(tablas) {
    const ranking = Object.entries(tablas)
      .map(([nombre, tabla]) => ({
        tabla: nombre,
        score: tabla.complejidad.score +
          tabla.relaciones.fks_entrantes * 5 +
          tabla.relaciones.fks_salientes * 2,
        tipo: tabla.tipo_inferido,
        tags: tabla.tags
      }))
      .sort((a, b) => b.score - a.score);

    return ranking.slice(0, 100); // Top 100
  }

  /**
   * Guarda la semántica en archivo JSON
   */
  async guardarSemantica(sistema, semantica, directorioSalida = 'diccionario') {
    await fs.ensureDir(directorioSalida);

    const archivo = path.join(directorioSalida, `semantica_${sistema}.json`);
    await fs.writeJson(archivo, semantica, { spaces: 2 });

    console.log(`💾 Semántica guardada en: ${archivo}`);
    return archivo;
  }
}

module.exports = MotorInferencias;

// Ejecutar si se llama directamente
if (require.main === module) {
  const ConstructorDiccionario = require('./constructor_diccionario');
  const motorInferencias = new MotorInferencias();
  const constructor = new ConstructorDiccionario();

  (async () => {
    const sistemas = ['BANCO', 'COI', 'NOI', 'SAE'];

    for (const sistema of sistemas) {
      try {
        console.log(`\n${'='.repeat(50)}`);
        // Construir diccionario técnico
        const diccionario = await constructor.construirDiccionarioTecnico(sistema);

        // Inferir semántica
        const semantica = await motorInferencias.inferirSemantica(diccionario);

        // Guardar ambos
        await constructor.guardarDiccionario(sistema, diccionario);
        await motorInferencias.guardarSemantica(sistema, semantica);

        console.log(`✅ ${sistema} completado`);
      } catch (error) {
        console.error(`❌ Error en ${sistema}:`, error.message);
      }
    }

    console.log('\n🎉 Proceso completo');
  })();
}
