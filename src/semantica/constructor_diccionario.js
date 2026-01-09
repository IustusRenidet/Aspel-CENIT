/**
 * Constructor de Diccionarios Técnicos
 * 
 * Lee metadata de Firebird desde archivos CSV y construye catálogos consolidados
 * con tablas, campos, índices, constraints y foreign keys.
 */

const fs = require('fs-extra');
const path = require('path');

class ConstructorDiccionario {
  constructor() {
    this.rutaEsquemas = path.join(process.cwd(), 'Esquemas', 'cenit');
  }

  /**
   * Construye el diccionario técnico de un sistema
   */
  async construirDiccionarioTecnico(sistema) {
    console.log(`📚 Construyendo diccionario técnico para ${sistema}...`);
    
    const csvPath = path.join(this.rutaEsquemas, sistema, 'csv');
    
    // Verificar que existe la carpeta CSV
    if (!await fs.pathExists(csvPath)) {
      throw new Error(`No se encuentra la carpeta CSV para ${sistema}: ${csvPath}`);
    }

    // Leer metadata desde CSV
    const tablas = await this.leerCSV(csvPath, 'tablas', sistema);
    const campos = await this.leerCSV(csvPath, 'campos', sistema);
    const indices = await this.leerCSV(csvPath, 'indices', sistema);
    const constraints = await this.leerCSV(csvPath, 'constraints', sistema);
    const fks = await this.leerCSV(csvPath, 'fks', sistema);

    // Construir diccionario
    const diccionario = {
      sistema,
      version: '1.0.0',
      fecha_creacion: new Date().toISOString(),
      estadisticas: {
        total_tablas: tablas.length,
        total_campos: campos.length,
        total_indices: indices.length,
        total_constraints: constraints.length,
        total_fks: fks.length
      },
      tablas: {}
    };

    // Procesar cada tabla
    for (const tabla of tablas) {
      const nombreTabla = tabla.tabla;
      
      diccionario.tablas[nombreTabla] = {
        nombre: nombreTabla,
        es_vista: tabla.es_vista === '1',
        descripcion: tabla.descripcion || null,
        campos: this.obtenerCamposTabla(nombreTabla, campos),
        indices: this.obtenerIndicesTabla(nombreTabla, indices),
        constraints: this.obtenerConstraintsTabla(nombreTabla, constraints),
        fks: this.obtenerFKsTabla(nombreTabla, fks)
      };
    }

    console.log(`✅ Diccionario técnico de ${sistema} construido: ${Object.keys(diccionario.tablas).length} tablas`);
    
    return diccionario;
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
