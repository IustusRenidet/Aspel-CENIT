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
