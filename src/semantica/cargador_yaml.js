/**
 * Cargador de archivos YAML
 * 
 * Carga y cachea archivos YAML de métricas, catálogos y paneles
 */

const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');

class CargadorYAML {
  constructor(directorioBase = path.join(__dirname, 'yaml')) {
    this.directorioBase = directorioBase;
    this.cache = new Map();
    this.cacheExpiracion = 5 * 60 * 1000; // 5 minutos
  }

  /**
   * Carga un archivo YAML
   * @param {string} rutaRelativa - Ruta relativa desde directorioBase
   * @param {boolean} usarCache - Si debe usar caché
   * @returns {Object} Contenido del archivo parseado
   */
  async cargar(rutaRelativa, usarCache = true) {
    const rutaCompleta = path.join(this.directorioBase, rutaRelativa);
    const cacheKey = rutaCompleta;

    // Verificar caché
    if (usarCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      
      // Verificar expiración
      if (Date.now() - cached.timestamp < this.cacheExpiracion) {
        return cached.datos;
      }
      
      // Caché expirado
      this.cache.delete(cacheKey);
    }

    // Verificar que el archivo existe
    if (!await fs.pathExists(rutaCompleta)) {
      throw new Error(`Archivo YAML no encontrado: ${rutaCompleta}`);
    }

    try {
      // Leer y parsear
      const contenido = await fs.readFile(rutaCompleta, 'utf8');
      const datos = yaml.load(contenido);

      // Guardar en caché
      if (usarCache) {
        this.cache.set(cacheKey, {
          datos,
          timestamp: Date.now()
        });
      }

      return datos;
    } catch (error) {
      throw new Error(`Error al cargar YAML ${rutaRelativa}: ${error.message}`);
    }
  }

  /**
   * Carga todas las métricas de un sistema
   * @param {string} sistema - SAE, COI, BANCO, NOI
   * @returns {Object} Métricas del sistema
   */
  async cargarMetricas(sistema) {
    const archivo = `metricas/base_${sistema}.yaml`;
    return await this.cargar(archivo);
  }

  /**
   * Carga métricas de todos los sistemas
   * @returns {Object} Objeto con métricas por sistema
   */
  async cargarTodasMetricas() {
    const sistemas = ['SAE', 'COI', 'BANCO', 'NOI'];
    const metricas = {};

    for (const sistema of sistemas) {
      try {
        metricas[sistema] = await this.cargarMetricas(sistema);
      } catch (error) {
        console.warn(`⚠️  No se pudieron cargar métricas de ${sistema}: ${error.message}`);
        metricas[sistema] = null;
      }
    }

    return metricas;
  }

  /**
   * Busca una métrica específica por ID
   * @param {string} metricaId - ID de la métrica
   * @param {string} sistema - Sistema opcional (si se conoce)
   * @returns {Object|null} Métrica encontrada o null
   */
  async buscarMetrica(metricaId, sistema = null) {
    if (sistema) {
      // Buscar en un sistema específico
      const metricas = await this.cargarMetricas(sistema);
      return metricas.metricas.find(m => m.id === metricaId) || null;
    }

    // Buscar en todos los sistemas
    const todasMetricas = await this.cargarTodasMetricas();
    
    for (const [nombreSistema, datos] of Object.entries(todasMetricas)) {
      if (!datos || !datos.metricas) continue;
      
      const metrica = datos.metricas.find(m => m.id === metricaId);
      if (metrica) {
        return {
          ...metrica,
          sistema: nombreSistema
        };
      }
    }

    return null;
  }

  /**
   * Lista todas las métricas disponibles
   * @param {Object} filtros - Filtros opcionales (categoria, tipo, sistema)
   * @returns {Array} Lista de métricas
   */
  async listarMetricas(filtros = {}) {
    const todasMetricas = await this.cargarTodasMetricas();
    const lista = [];

    for (const [sistema, datos] of Object.entries(todasMetricas)) {
      if (!datos || !datos.metricas) continue;

      // Aplicar filtro de sistema
      if (filtros.sistema && filtros.sistema !== sistema) {
        continue;
      }

      for (const metrica of datos.metricas) {
        // Aplicar filtros
        if (filtros.categoria && metrica.categoria !== filtros.categoria) {
          continue;
        }

        if (filtros.tipo && metrica.tipo !== filtros.tipo) {
          continue;
        }

        lista.push({
          ...metrica,
          sistema
        });
      }
    }

    return lista;
  }

  /**
   * Obtiene categorías disponibles
   * @param {string} sistema - Sistema opcional
   * @returns {Array} Lista de categorías únicas
   */
  async obtenerCategorias(sistema = null) {
    const metricas = await this.listarMetricas({ sistema });
    const categorias = new Set(metricas.map(m => m.categoria));
    return Array.from(categorias).sort();
  }

  /**
   * Carga catálogo semántico de un sistema
   * @param {string} sistema - SAE, COI, BANCO, NOI
   * @returns {Object} Catálogo del sistema
   */
  async cargarCatalogo(sistema) {
    const archivo = `catalogo/${sistema}.yaml`;
    return await this.cargar(archivo);
  }

  /**
   * Carga configuración de paneles/plantillas
   * @param {string} nombrePanel - Nombre del archivo de panel
   * @returns {Object} Configuración del panel
   */
  async cargarPanel(nombrePanel) {
    const archivo = `paneles_plantilla/${nombrePanel}.yaml`;
    return await this.cargar(archivo);
  }

  /**
   * Lista archivos disponibles en un subdirectorio
   * @param {string} subdirectorio - metricas, catalogo, paneles_plantilla
   * @returns {Array} Lista de archivos
   */
  async listarArchivos(subdirectorio) {
    const dirPath = path.join(this.directorioBase, subdirectorio);
    
    if (!await fs.pathExists(dirPath)) {
      return [];
    }

    const archivos = await fs.readdir(dirPath);
    return archivos.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  }

  /**
   * Limpia el caché
   * @param {string} clave - Clave específica o null para limpiar todo
   */
  limpiarCache(clave = null) {
    if (clave) {
      this.cache.delete(clave);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Recarga un archivo forzando bypass del caché
   * @param {string} rutaRelativa - Ruta del archivo
   * @returns {Object} Datos recargados
   */
  async recargar(rutaRelativa) {
    return await this.cargar(rutaRelativa, false);
  }

  /**
   * Obtiene estadísticas del caché
   * @returns {Object} Estadísticas
   */
  obtenerEstadisticasCache() {
    return {
      entradas: this.cache.size,
      expiracion_ms: this.cacheExpiracion,
      claves: Array.from(this.cache.keys()).map(k => {
        const cached = this.cache.get(k);
        return {
          ruta: k.replace(this.directorioBase, ''),
          edad_ms: Date.now() - cached.timestamp,
          expirado: Date.now() - cached.timestamp >= this.cacheExpiracion
        };
      })
    };
  }

  /**
   * Exporta métricas a JSON (útil para API)
   * @param {string} sistema - Sistema opcional
   * @returns {string} JSON con métricas
   */
  async exportarJSON(sistema = null) {
    let datos;
    
    if (sistema) {
      datos = await this.cargarMetricas(sistema);
    } else {
      datos = await this.cargarTodasMetricas();
    }

    return JSON.stringify(datos, null, 2);
  }
}

module.exports = CargadorYAML;

// Ejecutar si se llama directamente (modo testing/demo)
if (require.main === module) {
  const cargador = new CargadorYAML();

  (async () => {
    console.log('🔄 Probando Cargador YAML...\n');

    try {
      // Listar archivos disponibles
      console.log('📁 Archivos de métricas disponibles:');
      const archivos = await cargador.listarArchivos('metricas');
      archivos.forEach(a => console.log(`   - ${a}`));

      console.log('\n📊 Cargando todas las métricas...');
      const metricas = await cargador.cargarTodasMetricas();
      
      for (const [sistema, datos] of Object.entries(metricas)) {
        if (datos) {
          console.log(`   ✅ ${sistema}: ${datos.metricas.length} métricas`);
        } else {
          console.log(`   ⚠️  ${sistema}: No disponible`);
        }
      }

      console.log('\n🏷️  Categorías disponibles:');
      const categorias = await cargador.obtenerCategorias();
      categorias.forEach(c => console.log(`   - ${c}`));

      console.log('\n🔍 Buscando métrica "sae_ventas_netas_mes"...');
      const metrica = await cargador.buscarMetrica('sae_ventas_netas_mes');
      if (metrica) {
        console.log(`   ✅ Encontrada: ${metrica.nombre}`);
        console.log(`      Sistema: ${metrica.sistema}`);
        console.log(`      Categoría: ${metrica.categoria}`);
        console.log(`      Tipo: ${metrica.tipo}`);
      }

      console.log('\n💾 Estadísticas de caché:');
      const stats = cargador.obtenerEstadisticasCache();
      console.log(`   Entradas: ${stats.entradas}`);
      console.log(`   Expiración: ${stats.expiracion_ms / 1000}s`);

      console.log('\n✅ Pruebas completadas exitosamente');
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}
