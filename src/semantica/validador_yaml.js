/**
 * Validador de archivos YAML de métricas
 * 
 * Valida la estructura y sintaxis de archivos YAML de métricas
 * usando JSON Schema con AJV
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');

class ValidadorYAML {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);

    // Schema para validación de métricas
    this.schemaMetricas = {
      type: 'object',
      required: ['metadata', 'metricas'],
      properties: {
        metadata: {
          type: 'object',
          required: ['sistema', 'version', 'descripcion'],
          properties: {
            sistema: {
              type: 'string',
              enum: ['SAE', 'COI', 'BANCO', 'NOI']
            },
            version: {
              type: 'string',
              pattern: '^\\d+\\.\\d+\\.\\d+$'
            },
            generado_en: {
              type: 'string',
              format: 'date'
            },
            descripcion: {
              type: 'string',
              minLength: 10
            },
            tablas_principales: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        metricas: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'nombre', 'descripcion', 'categoria', 'tipo'],
            properties: {
              id: {
                type: 'string',
                pattern: '^[a-z_]+$',
                minLength: 3
              },
              nombre: {
                type: 'string',
                minLength: 3
              },
              descripcion: {
                type: 'string',
                minLength: 10
              },
              categoria: {
                type: 'string',
                enum: [
                  'ventas', 'inventarios', 'cxc', 'cxp', 'compras',
                  'polizas', 'reportes', 'estados_financieros', 'bancos', 'analisis', 'ratios', 'auditoria',
                  'saldos', 'movimientos', 'cheques', 'conciliacion', 'cfdi',
                  'plantilla', 'nomina', 'incidencias', 'prestaciones', 'impuestos', 'cumplimiento',
                  'operacion', 'general'
                ]
              },
              tipo: {
                type: 'string',
                enum: ['escalar', 'serie', 'tabla']
              },
              unidad: {
                type: 'string',
                enum: ['moneda', 'cantidad', 'porcentaje', 'ratio', 'horas']
              },
              query_duckdb: {
                type: 'string',
                minLength: 10
              },
              parametros: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['nombre', 'tipo'],
                  properties: {
                    nombre: {
                      type: 'string'
                    },
                    tipo: {
                      type: 'string',
                      enum: ['string', 'integer', 'date', 'boolean']
                    },
                    requerido: {
                      type: 'boolean'
                    },
                    default: {
                      type: ['string', 'number', 'boolean', 'null']
                    },
                    descripcion: {
                      type: 'string'
                    }
                  }
                }
              },
              formato: {
                type: 'object',
                properties: {
                  decimales: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 4
                  },
                  prefijo: {
                    type: 'string'
                  },
                  sufijo: {
                    type: 'string'
                  },
                  separador_miles: {
                    type: 'string'
                  },
                  columnas: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['nombre', 'tipo'],
                      properties: {
                        nombre: { type: 'string' },
                        tipo: { 
                          type: 'string',
                          enum: ['texto', 'numero', 'moneda', 'fecha', 'porcentaje']
                        },
                        decimales: { type: 'integer' }
                      }
                    }
                  }
                }
              },
              comparativo: {
                type: 'object',
                properties: {
                  periodo_anterior: {
                    type: 'boolean'
                  },
                  tipo: {
                    type: 'string',
                    enum: ['porcentaje', 'diferencia', 'valor']
                  }
                }
              },
              alerta: {
                type: 'object',
                properties: {
                  tipo: {
                    type: 'string',
                    enum: ['umbral', 'existencia']
                  },
                  condicion: {
                    type: 'string'
                  },
                  nivel_warning: {
                    type: 'number'
                  },
                  nivel_critical: {
                    type: 'number'
                  },
                  nivel: {
                    type: 'string',
                    enum: ['warning', 'critical']
                  },
                  mensaje: {
                    type: 'string'
                  }
                }
              },
              visual: {
                type: 'object',
                properties: {
                  tipo: {
                    type: 'string',
                    enum: ['linea', 'barras', 'area', 'pie']
                  },
                  color: {
                    type: 'string',
                    pattern: '^#[0-9A-Fa-f]{6}$'
                  }
                }
              }
            }
          }
        }
      }
    };

    this.validarMetricas = this.ajv.compile(this.schemaMetricas);
  }

  /**
   * Valida un archivo YAML de métricas
   * @param {string} archivoPath - Ruta al archivo YAML
   * @returns {Object} Resultado de la validación
   */
  async validarArchivo(archivoPath) {
    const resultado = {
      valido: false,
      archivo: archivoPath,
      errores: [],
      advertencias: [],
      metricas_encontradas: 0
    };

    try {
      // Verificar que el archivo existe
      if (!await fs.pathExists(archivoPath)) {
        resultado.errores.push({
          tipo: 'archivo',
          mensaje: 'El archivo no existe',
          path: archivoPath
        });
        return resultado;
      }

      // Leer y parsear YAML
      const contenido = await fs.readFile(archivoPath, 'utf8');
      let datos;

      try {
        datos = yaml.load(contenido);
      } catch (error) {
        resultado.errores.push({
          tipo: 'sintaxis',
          mensaje: `Error de sintaxis YAML: ${error.message}`,
          linea: error.mark?.line
        });
        return resultado;
      }

      // Validar contra schema
      const valido = this.validarMetricas(datos);

      if (!valido) {
        resultado.errores.push(...this.formatearErroresAJV(this.validarMetricas.errors));
        return resultado;
      }

      // Validaciones adicionales
      const validacionesAdicionales = this.validacionesCustom(datos);
      resultado.errores.push(...validacionesAdicionales.errores);
      resultado.advertencias.push(...validacionesAdicionales.advertencias);

      resultado.valido = resultado.errores.length === 0;
      resultado.metricas_encontradas = datos.metricas ? datos.metricas.length : 0;
      resultado.datos = datos;

    } catch (error) {
      resultado.errores.push({
        tipo: 'fatal',
        mensaje: error.message,
        stack: error.stack
      });
    }

    return resultado;
  }

  /**
   * Validaciones personalizadas adicionales
   */
  validacionesCustom(datos) {
    const errores = [];
    const advertencias = [];

    if (!datos.metricas) {
      return { errores, advertencias };
    }

    // Verificar IDs únicos
    const ids = new Set();
    datos.metricas.forEach((metrica, idx) => {
      if (ids.has(metrica.id)) {
        errores.push({
          tipo: 'duplicado',
          mensaje: `ID duplicado: ${metrica.id}`,
          metrica_index: idx
        });
      }
      ids.add(metrica.id);
    });

    // Verificar que métricas con query_duckdb tengan sentido
    datos.metricas.forEach((metrica, idx) => {
      if (metrica.query_duckdb) {
        // Verificar que SELECT esté presente
        if (!metrica.query_duckdb.toLowerCase().includes('select')) {
          errores.push({
            tipo: 'query',
            mensaje: `Query sin SELECT en métrica: ${metrica.id}`,
            metrica_index: idx
          });
        }

        // Verificar placeholders de parámetros
        const placeholders = metrica.query_duckdb.match(/\{(\w+)\}/g) || [];
        const parametrosDeclarados = metrica.parametros || [];
        
        placeholders.forEach(ph => {
          const nombreParam = ph.replace(/[{}]/g, '');
          const existe = parametrosDeclarados.some(p => p.nombre === nombreParam);
          
          if (!existe) {
            advertencias.push({
              tipo: 'parametro',
              mensaje: `Placeholder ${ph} no declarado en parámetros de: ${metrica.id}`,
              metrica_index: idx
            });
          }
        });
      }

      // Verificar coherencia de tipo con formato
      if (metrica.tipo === 'tabla' && !metrica.formato?.columnas) {
        advertencias.push({
          tipo: 'formato',
          mensaje: `Métrica tipo tabla sin definición de columnas: ${metrica.id}`,
          metrica_index: idx
        });
      }

      // Verificar unidad coherente con formato
      if (metrica.unidad === 'moneda' && !metrica.formato?.prefijo && !metrica.formato?.sufijo) {
        advertencias.push({
          tipo: 'formato',
          mensaje: `Métrica de moneda sin prefijo/sufijo: ${metrica.id}`,
          metrica_index: idx
        });
      }

      // Verificar alertas
      if (metrica.alerta) {
        if (metrica.alerta.tipo === 'umbral' && !metrica.alerta.condicion) {
          errores.push({
            tipo: 'alerta',
            mensaje: `Alerta de tipo umbral sin condición: ${metrica.id}`,
            metrica_index: idx
          });
        }
      }
    });

    return { errores, advertencias };
  }

  /**
   * Formatea errores de AJV para mejor legibilidad
   */
  formatearErroresAJV(ajvErrors) {
    if (!ajvErrors) return [];

    return ajvErrors.map(error => ({
      tipo: 'schema',
      mensaje: `${error.instancePath || 'root'}: ${error.message}`,
      detalle: error.params,
      dataPath: error.instancePath
    }));
  }

  /**
   * Valida todos los archivos YAML en un directorio
   */
  async validarDirectorio(directorio, patron = '*.yaml') {
    const resultados = {
      total: 0,
      validos: 0,
      invalidos: 0,
      archivos: []
    };

    try {
      const archivos = await fs.readdir(directorio);
      const yamlFiles = archivos.filter(f => 
        f.endsWith('.yaml') || f.endsWith('.yml')
      );

      for (const archivo of yamlFiles) {
        const archivoPath = path.join(directorio, archivo);
        const resultado = await this.validarArchivo(archivoPath);
        
        resultados.total++;
        if (resultado.valido) {
          resultados.validos++;
        } else {
          resultados.invalidos++;
        }
        
        resultados.archivos.push({
          nombre: archivo,
          ...resultado
        });
      }

    } catch (error) {
      throw new Error(`Error al validar directorio: ${error.message}`);
    }

    return resultados;
  }

  /**
   * Genera reporte de validación en formato legible
   */
  generarReporte(resultados) {
    let reporte = '\n';
    reporte += '═'.repeat(70) + '\n';
    reporte += '  REPORTE DE VALIDACIÓN DE MÉTRICAS YAML\n';
    reporte += '═'.repeat(70) + '\n\n';

    if (Array.isArray(resultados.archivos)) {
      // Reporte de directorio
      reporte += `📊 Resumen:\n`;
      reporte += `   Total archivos: ${resultados.total}\n`;
      reporte += `   ✅ Válidos: ${resultados.validos}\n`;
      reporte += `   ❌ Inválidos: ${resultados.invalidos}\n\n`;

      resultados.archivos.forEach(resultado => {
        reporte += `${'─'.repeat(70)}\n`;
        reporte += `📄 ${resultado.nombre}\n`;
        reporte += this.generarReporteArchivo(resultado);
      });
    } else {
      // Reporte de archivo único
      reporte += this.generarReporteArchivo(resultados);
    }

    reporte += '═'.repeat(70) + '\n';
    return reporte;
  }

  /**
   * Genera reporte de un solo archivo
   */
  generarReporteArchivo(resultado) {
    let reporte = '';

    if (resultado.valido) {
      reporte += `   ✅ VÁLIDO\n`;
      reporte += `   Métricas encontradas: ${resultado.metricas_encontradas}\n`;
    } else {
      reporte += `   ❌ INVÁLIDO\n`;
    }

    if (resultado.errores.length > 0) {
      reporte += `\n   🚨 Errores (${resultado.errores.length}):\n`;
      resultado.errores.forEach((error, idx) => {
        reporte += `      ${idx + 1}. [${error.tipo}] ${error.mensaje}\n`;
        if (error.detalle) {
          reporte += `         Detalle: ${JSON.stringify(error.detalle)}\n`;
        }
      });
    }

    if (resultado.advertencias.length > 0) {
      reporte += `\n   ⚠️  Advertencias (${resultado.advertencias.length}):\n`;
      resultado.advertencias.forEach((adv, idx) => {
        reporte += `      ${idx + 1}. [${adv.tipo}] ${adv.mensaje}\n`;
      });
    }

    reporte += '\n';
    return reporte;
  }
}

module.exports = ValidadorYAML;

// Ejecutar si se llama directamente
if (require.main === module) {
  const validador = new ValidadorYAML();
  const directorioMetricas = path.join(__dirname, 'yaml', 'metricas');

  (async () => {
    console.log(`🔍 Validando métricas en: ${directorioMetricas}\n`);

    try {
      const resultados = await validador.validarDirectorio(directorioMetricas);
      const reporte = validador.generarReporte(resultados);
      
      console.log(reporte);

      // Guardar reporte en archivo
      const archivoReporte = path.join(__dirname, '..', '..', 'validacion_metricas.txt');
      await fs.writeFile(archivoReporte, reporte, 'utf8');
      console.log(`📝 Reporte guardado en: ${archivoReporte}`);

      process.exit(resultados.invalidos > 0 ? 1 : 0);
    } catch (error) {
      console.error('❌ Error fatal:', error.message);
      process.exit(1);
    }
  })();
}
