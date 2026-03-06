/**
 * Constructor de Diccionarios Técnicos
 * 
 * Lee metadata de Firebird desde archivos CSV y construye catálogos consolidados
 * con tablas, campos, índices, constraints y foreign keys.
 */

const fs = require('fs-extra');
const path = require('path');
const lectorEsquema = require('../conectores/firebird/lector_esquema');

class ConstructorDiccionario {
  constructor() {
    this.rutaEsquemas = path.join(process.cwd(), 'Esquemas', 'cenit');
  }

  /**
   * Construye el diccionario técnico de un sistema.
   * Intenta leer directamente desde Firebird (origen_datos: 'live').
   * Si la conexión falla hace fallback al CSV en caché (origen_datos: 'cache').
   */
  async construirDiccionarioTecnico(sistema) {
    console.log(`📚 Construyendo diccionario técnico para ${sistema}...`);

    // ── Intento 1: datos en vivo desde Firebird ──────────────────────────
    try {
      const diccionario = await this._buildDesdeFirebird(sistema);
      console.log(`✅ [${sistema}] Diccionario desde Firebird: ${Object.keys(diccionario.tablas).length} tablas`);
      return diccionario;
    } catch (errFB) {
      console.warn(`⚠️  [${sistema}] Firebird no disponible (${errFB.message}), usando caché CSV...`);
    }

    // ── Fallback: CSV en disco ───────────────────────────────────────────
    return this._buildDesdeCSV(sistema);
  }

  /**
   * Construye el diccionario leyendo directamente las tablas RDB$ de Firebird.
   * @private
   */
  async _buildDesdeFirebird(sistema) {
    const [tablas, campos, fks, indices] = await Promise.all([
      lectorEsquema.leerTablas(sistema),
      lectorEsquema.leerCampos(sistema),
      lectorEsquema.leerFKs(sistema),
      lectorEsquema.leerIndices(sistema),
    ]);

    // Indexar por tabla para O(1) lookup
    const camposPorTabla = {};
    const fksPorTabla = {};
    const indicesPorTabla = {};

    for (const c of campos) {
      (camposPorTabla[c.tabla] || (camposPorTabla[c.tabla] = [])).push(c);
    }

    for (const f of fks) {
      (fksPorTabla[f.tabla_origen] || (fksPorTabla[f.tabla_origen] = [])).push(f);
    }

    // Agrupar segmentos de índice por (tabla → nombre_indice)
    for (const i of indices) {
      if (!indicesPorTabla[i.tabla]) indicesPorTabla[i.tabla] = {};
      const m = indicesPorTabla[i.tabla];
      if (!m[i.indice]) {
        m[i.indice] = {
          nombre: i.indice,
          es_unique: i.es_unico === 1,
          es_primary: i.indice.includes('RDB$PRIMARY') || i.indice.startsWith('PK_'),
          tipo: i.es_descendente ? 'DESCENDING' : 'ASCENDING',
          campos: [],
        };
      }
      m[i.indice].campos.push({ nombre: i.campo, posicion: i.posicion });
    }

    let totalIndices = 0;
    const tablasDic = {};

    for (const t of tablas) {
      const nombre = t.tabla;

      // Campos
      const campoDefs = (camposPorTabla[nombre] || [])
        .sort((a, b) => a.posicion - b.posicion)
        .map((c) => ({
          nombre: c.campo,
          tipo_base: c.tipo,          // e.g. 'VARCHAR'
          tipo_detalle: null,
          longitud: c.longitud,
          precision: c.precision,
          scale: c.escala,
          permite_null: !c.no_nulo,
          posicion: c.posicion,
        }));

      // Índices — ordenar campos internos por posición
      const idxMap = indicesPorTabla[nombre] || {};
      const indicesDefs = Object.values(idxMap).map((idx) => {
        idx.campos.sort((a, b) => a.posicion - b.posicion);
        return idx;
      });
      totalIndices += indicesDefs.length;

      // FKs — agrupar por campo_fk (cada campo sólo puede FK a un destino en Firebird)
      const fkMap = {};
      for (const f of (fksPorTabla[nombre] || [])) {
        const key = f.campo_fk;
        if (!fkMap[key]) {
          fkMap[key] = {
            nombre: `FK_${nombre}_${f.tabla_destino}`,
            tabla_destino: f.tabla_destino,
            campos_origen: [],
            campos_destino: [],
          };
        }
        fkMap[key].campos_origen.push(f.campo_fk);
        fkMap[key].campos_destino.push(f.campo_pk);
      }
      const fksDefs = Object.values(fkMap);

      tablasDic[nombre] = {
        nombre,
        es_vista: t.es_vista,
        descripcion: null,
        campos: campoDefs,
        indices: indicesDefs,
        constraints: [],   // derivables de índices + FKs; no se duplican aquí
        fks: fksDefs,
      };
    }

    return {
      sistema,
      version: '1.0.0',
      fecha_creacion: new Date().toISOString(),
      origen_datos: 'live',
      estadisticas: {
        total_tablas: tablas.length,
        total_campos: campos.length,
        total_indices: totalIndices,
        total_constraints: 0,
        total_fks: fks.length,
      },
      tablas: tablasDic,
    };
  }

  /**
   * Construye el diccionario leyendo CSVs en disco (camino original).
   * @private
   */
  async _buildDesdeCSV(sistema) {
    const csvPath = path.join(this.rutaEsquemas, sistema, 'csv');

    if (!await fs.pathExists(csvPath)) {
      throw new Error(
        `Firebird no disponible y no existe caché CSV para ${sistema}: ${csvPath}`
      );
    }

    const tablas = await this.leerCSV(csvPath, 'tablas', sistema);
    const campos = await this.leerCSV(csvPath, 'campos', sistema);
    const indices = await this.leerCSV(csvPath, 'indices', sistema);
    const constraints = await this.leerCSV(csvPath, 'constraints', sistema);
    const fks = await this.leerCSV(csvPath, 'fks', sistema);

    const diccionario = {
      sistema,
      version: '1.0.0',
      fecha_creacion: new Date().toISOString(),
      origen_datos: 'cache',
      estadisticas: {
        total_tablas: tablas.length,
        total_campos: campos.length,
        total_indices: indices.length,
        total_constraints: constraints.length,
        total_fks: fks.length,
      },
      tablas: {},
    };

    for (const tabla of tablas) {
      const nombreTabla = tabla.tabla;
      diccionario.tablas[nombreTabla] = {
        nombre: nombreTabla,
        es_vista: tabla.es_vista === '1',
        descripcion: tabla.descripcion || null,
        campos: this.obtenerCamposTabla(nombreTabla, campos),
        indices: this.obtenerIndicesTabla(nombreTabla, indices),
        constraints: this.obtenerConstraintsTabla(nombreTabla, constraints),
        fks: this.obtenerFKsTabla(nombreTabla, fks),
      };
    }

    console.log(`✅ [${sistema}] Diccionario desde CSV: ${Object.keys(diccionario.tablas).length} tablas`);
    return diccionario;
  }

  /**
   * Intenta construir el diccionario desde Firebird y lo persiste en disco.
   * Si Firebird no está disponible devuelve el JSON en caché sin error.
   *
   * @param {string} sistema
   * @returns {Promise<{ok:boolean, origen_datos:string, tablas:number, campos:number}>}
   */
  async refrescarSiConectado(sistema) {
    const archivoCache = path.join(
      process.cwd(), 'diccionario', `catalogo_tecnico_${sistema}.json`
    );

    try {
      const diccionario = await this._buildDesdeFirebird(sistema);
      await this.guardarDiccionario(sistema, diccionario);

      return {
        ok: true,
        origen_datos: 'live',
        tablas: Object.keys(diccionario.tablas).length,
        campos: diccionario.estadisticas.total_campos,
      };
    } catch (errFB) {
      console.warn(`[Diccionario] ${sistema}: sin conexión Firebird, manteniendo caché (${errFB.message})`);

      // Leer caché si existe
      if (await fs.pathExists(archivoCache)) {
        try {
          const cached = await fs.readJson(archivoCache);
          return {
            ok: false,
            origen_datos: 'cache',
            tablas: Object.keys(cached.tablas || {}).length,
            campos: cached.estadisticas?.total_campos ?? 0,
          };
        } catch (_) { /* caché corrupta — continúa */ }
      }

      return { ok: false, origen_datos: 'none', tablas: 0, campos: 0 };
    }
  }

  /**
   * Lee metadata desde archivo CSV
   */
  async leerCSV(csvPath, tipo, sistema) {
    const archivoCSV = path.join(csvPath, `metadata_${tipo}_${sistema}.csv`);

    if (!await fs.pathExists(archivoCSV)) {
      console.warn(`⚠️  Archivo no encontrado: ${archivoCSV}`);
      return [];
    }

    try {
      const contenido = await fs.readFile(archivoCSV, 'utf8');
      const lineas = contenido.trim().split('\n');

      if (lineas.length < 2) {
        return [];
      }

      // Primera línea tiene los headers
      const headers = this.parsearLineaCSV(lineas[0]);
      const datos = [];

      // Resto de líneas son los datos
      for (let i = 1; i < lineas.length; i++) {
        if (!lineas[i].trim()) continue;

        const valores = this.parsearLineaCSV(lineas[i]);
        const registro = {};

        headers.forEach((header, idx) => {
          registro[header] = valores[idx] && valores[idx] !== '' ? valores[idx] : null;
        });

        datos.push(registro);
      }

      return datos;
    } catch (error) {
      console.error(`❌ Error leyendo ${archivoCSV}:`, error.message);
      return [];
    }
  }

  /**
   * Parsea una línea de CSV respetando comillas
   */
  parsearLineaCSV(linea) {
    const valores = [];
    let valorActual = '';
    let dentroComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const char = linea[i];

      if (char === '"') {
        dentroComillas = !dentroComillas;
      } else if (char === ',' && !dentroComillas) {
        valores.push(valorActual.trim());
        valorActual = '';
      } else {
        valorActual += char;
      }
    }

    // Agregar último valor
    valores.push(valorActual.trim());

    return valores;
  }

  /**
   * Obtiene todos los campos de una tabla
   */
  obtenerCamposTabla(nombreTabla, campos) {
    return campos
      .filter(c => c.tabla === nombreTabla)
      .map(c => ({
        nombre: c.campo,
        tipo_base: c.tipo_base,
        tipo_detalle: c.tipo_detalle,
        longitud: parseInt(c.longitud) || null,
        precision: parseInt(c.precision) || null,
        scale: parseInt(c.scale) || null,
        permite_null: c.permite_null === '1',
        posicion: parseInt(c.posicion) || 0
      }))
      .sort((a, b) => a.posicion - b.posicion);
  }

  /**
   * Obtiene todos los índices de una tabla agrupados
   */
  obtenerIndicesTabla(nombreTabla, indices) {
    const indicesPorNombre = {};

    indices
      .filter(i => i.tabla === nombreTabla && i.indice)
      .forEach(i => {
        if (!indicesPorNombre[i.indice]) {
          indicesPorNombre[i.indice] = {
            nombre: i.indice,
            es_unique: i.unique_flag === '1',
            es_primary: (i.indice && (i.indice.includes('RDB$PRIMARY') || i.indice.includes('PK_'))) || false,
            tipo: i.index_type || null,
            campos: []
          };
        }

        if (i.campo_indexado) {
          indicesPorNombre[i.indice].campos.push({
            nombre: i.campo_indexado,
            posicion: parseInt(i.posicion_en_indice) || 0
          });
        }
      });

    // Ordenar campos de cada índice por posición
    Object.values(indicesPorNombre).forEach(idx => {
      idx.campos.sort((a, b) => a.posicion - b.posicion);
    });

    return Object.values(indicesPorNombre);
  }

  /**
   * Obtiene todos los constraints de una tabla
   */
  obtenerConstraintsTabla(nombreTabla, constraints) {
    return constraints
      .filter(c => c.tabla === nombreTabla && c.constraint)
      .map(c => ({
        nombre: c.constraint,
        tipo: c.tipo_constraint,
        campo: c.campo || null
      }));
  }

  /**
   * Obtiene todas las foreign keys de una tabla
   */
  obtenerFKsTabla(nombreTabla, fks) {
    const fksPorNombre = {};

    fks
      .filter(f => f.tabla_origen === nombreTabla && f.constraint_fk)
      .forEach(f => {
        if (!fksPorNombre[f.constraint_fk]) {
          fksPorNombre[f.constraint_fk] = {
            nombre: f.constraint_fk,
            tabla_destino: f.tabla_destino,
            campos_origen: [],
            campos_destino: []
          };
        }

        if (f.campo_origen) {
          fksPorNombre[f.constraint_fk].campos_origen.push(f.campo_origen);
        }
        if (f.campo_destino) {
          fksPorNombre[f.constraint_fk].campos_destino.push(f.campo_destino);
        }
      });

    return Object.values(fksPorNombre);
  }

  /**
   * Guarda el diccionario en JSON
   */
  async guardarDiccionario(sistema, diccionario, carpetaSalida = 'diccionario') {
    const rutaSalida = path.join(process.cwd(), carpetaSalida);
    await fs.ensureDir(rutaSalida);

    const archivo = path.join(rutaSalida, `catalogo_tecnico_${sistema}.json`);
    await fs.writeJson(archivo, diccionario, { spaces: 2 });

    console.log(`💾 Diccionario guardado en: ${carpetaSalida}\\catalogo_tecnico_${sistema}.json`);
  }

  /**
   * Construye diccionarios para todos los sistemas
   */
  async construirTodos(carpetaSalida = 'diccionario') {
    const sistemas = ['SAE', 'COI', 'BANCO', 'NOI'];
    const resultados = [];

    for (const sistema of sistemas) {
      try {
        const diccionario = await this.construirDiccionarioTecnico(sistema);
        await this.guardarDiccionario(sistema, diccionario, carpetaSalida);
        resultados.push({
          sistema,
          exito: true,
          tablas: Object.keys(diccionario.tablas).length
        });
      } catch (error) {
        console.error(`❌ Error con ${sistema}:`, error.message);
        resultados.push({
          sistema,
          exito: false,
          error: error.message
        });
      }
    }

    return resultados;
  }
}

module.exports = ConstructorDiccionario;
