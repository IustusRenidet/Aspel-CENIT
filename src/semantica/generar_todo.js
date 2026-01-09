#!/usr/bin/env node
/**
 * Script de Generación Completa de Capa Semántica
 * 
 * Ejecuta el proceso completo:
 * 1. Construye diccionarios técnicos
 * 2. Infiere semántica
 * 3. Valida métricas YAML
 * 4. Prueba carga y resolución
 */

const ConstructorDiccionario = require('./constructor_diccionario');
const MotorInferencias = require('./inferencias');
const ValidadorYAML = require('./validador_yaml');
const CargadorYAML = require('./cargador_yaml');
const ResolvedorMetricas = require('./resolvedor_metricas');
const path = require('path');
const fs = require('fs-extra');

class GeneradorCompleto {
  constructor() {
    this.constructor = new ConstructorDiccionario();
    this.inferencias = new MotorInferencias();
    this.validador = new ValidadorYAML();
    this.cargador = new CargadorYAML();
    this.resolvedor = new ResolvedorMetricas();
    
    this.sistemas = ['BANCO', 'COI', 'NOI', 'SAE'];
    this.directorioSalida = 'diccionario';
  }

  /**
   * Ejecuta el proceso completo
   */
  async ejecutar() {
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(10) + 'GENERADOR COMPLETO DE CAPA SEMÁNTICA' + ' '.repeat(21) + '║');
    console.log('╚' + '═'.repeat(68) + '╝\n');

    const inicio = Date.now();
    const resultados = {
      diccionarios: {},
      semanticas: {},
      metricas_validadas: {},
      errores: []
    };

    try {
      // Paso 1: Generar diccionarios técnicos
      await this.generarDiccionarios(resultados);

      // Paso 2: Generar semánticas
      await this.generarSemanticas(resultados);

      // Paso 3: Validar métricas YAML
      await this.validarMetricas(resultados);

      // Paso 4: Probar cargador
      await this.probarCargador(resultados);

      // Paso 5: Probar resolvedor
      await this.probarResolvedor(resultados);

      // Resumen final
      this.mostrarResumen(resultados, Date.now() - inicio);

      // Guardar reporte
      await this.guardarReporte(resultados);

      return resultados.errores.length === 0;

    } catch (error) {
      console.error('\n❌ Error fatal:', error.message);
      console.error(error.stack);
      return false;
    }
  }

  /**
   * Paso 1: Generar diccionarios técnicos
   */
  async generarDiccionarios(resultados) {
    console.log('\n📚 PASO 1: Generando Diccionarios Técnicos');
    console.log('─'.repeat(70));

    for (const sistema of this.sistemas) {
      try {
        console.log(`   🔨 Procesando ${sistema}...`);
        
        const diccionario = await this.constructor.construirDiccionarioTecnico(sistema);
        await this.constructor.guardarDiccionario(sistema, diccionario, this.directorioSalida);
        
        resultados.diccionarios[sistema] = {
          estado: 'OK',
          tablas: Object.keys(diccionario.tablas).length,
          campos: diccionario.estadisticas.total_campos
        };

        console.log(`      ✅ ${sistema}: ${resultados.diccionarios[sistema].tablas} tablas`);
      } catch (error) {
        console.error(`      ❌ ${sistema}: ${error.message}`);
        resultados.diccionarios[sistema] = { estado: 'ERROR', mensaje: error.message };
        resultados.errores.push({ paso: 'diccionarios', sistema, error: error.message });
      }
    }
  }

  /**
   * Paso 2: Generar semánticas
   */
  async generarSemanticas(resultados) {
    console.log('\n🧠 PASO 2: Infiriendo Semántica');
    console.log('─'.repeat(70));

    for (const sistema of this.sistemas) {
      try {
        // Cargar diccionario técnico
        const archivoDict = path.join(this.directorioSalida, `catalogo_tecnico_${sistema}.json`);
        const diccionario = await fs.readJson(archivoDict);

        console.log(`   🔍 Procesando ${sistema}...`);
        
        const semantica = await this.inferencias.inferirSemantica(diccionario);
        await this.inferencias.guardarSemantica(sistema, semantica, this.directorioSalida);
        
        resultados.semanticas[sistema] = {
          estado: 'OK',
          tablas_analizadas: Object.keys(semantica.tablas).length,
          top_tabla: semantica.ranking[0]?.tabla || 'N/A'
        };

        console.log(`      ✅ ${sistema}: ${resultados.semanticas[sistema].tablas_analizadas} tablas analizadas`);
        console.log(`         Top tabla: ${resultados.semanticas[sistema].top_tabla}`);
      } catch (error) {
        console.error(`      ❌ ${sistema}: ${error.message}`);
        resultados.semanticas[sistema] = { estado: 'ERROR', mensaje: error.message };
        resultados.errores.push({ paso: 'semanticas', sistema, error: error.message });
      }
    }
  }

  /**
   * Paso 3: Validar métricas YAML
   */
  async validarMetricas(resultados) {
    console.log('\n✔️  PASO 3: Validando Métricas YAML');
    console.log('─'.repeat(70));

    const directorioMetricas = path.join(__dirname, 'yaml', 'metricas');
    
    try {
      const validacion = await this.validador.validarDirectorio(directorioMetricas);

      for (const archivo of validacion.archivos) {
        const sistema = archivo.nombre.replace('base_', '').replace('.yaml', '').toUpperCase();
        
        resultados.metricas_validadas[sistema] = {
          archivo: archivo.nombre,
          valido: archivo.valido,
          metricas: archivo.metricas_encontradas,
          errores: archivo.errores.length,
          advertencias: archivo.advertencias.length
        };

        if (archivo.valido) {
          console.log(`   ✅ ${sistema}: ${archivo.metricas_encontradas} métricas válidas`);
        } else {
          console.log(`   ❌ ${sistema}: ${archivo.errores.length} errores`);
          resultados.errores.push({
            paso: 'validacion_metricas',
            sistema,
            errores: archivo.errores
          });
        }

        if (archivo.advertencias.length > 0) {
          console.log(`   ⚠️  ${sistema}: ${archivo.advertencias.length} advertencias`);
        }
      }

      console.log(`\n   📊 Resumen: ${validacion.validos}/${validacion.total} archivos válidos`);
    } catch (error) {
      console.error(`   ❌ Error en validación: ${error.message}`);
      resultados.errores.push({ paso: 'validacion_metricas', error: error.message });
    }
  }

  /**
   * Paso 4: Probar cargador
   */
  async probarCargador(resultados) {
    console.log('\n📂 PASO 4: Probando Cargador de Métricas');
    console.log('─'.repeat(70));

    try {
      const metricas = await this.cargador.cargarTodasMetricas();
      let totalMetricas = 0;

      for (const [sistema, datos] of Object.entries(metricas)) {
        if (datos && datos.metricas) {
          totalMetricas += datos.metricas.length;
          console.log(`   ✅ ${sistema}: ${datos.metricas.length} métricas cargadas`);
        }
      }

      console.log(`\n   📊 Total de métricas disponibles: ${totalMetricas}`);

      // Probar búsqueda
      const metricaPrueba = await this.cargador.buscarMetrica('sae_ventas_netas_mes');
      if (metricaPrueba) {
        console.log(`   🔍 Búsqueda exitosa: "${metricaPrueba.nombre}"`);
      }

    } catch (error) {
      console.error(`   ❌ Error en cargador: ${error.message}`);
      resultados.errores.push({ paso: 'cargador', error: error.message });
    }
  }

  /**
   * Paso 5: Probar resolvedor (modo demo)
   */
  async probarResolvedor(resultados) {
    console.log('\n⚙️  PASO 5: Probando Resolvedor de Métricas (modo demo)');
    console.log('─'.repeat(70));

    try {
      // Probar algunas métricas
      const pruebasMetricas = [
        { id: 'sae_ventas_netas_mes', nombre: 'Ventas SAE' },
        { id: 'coi_polizas_mes', nombre: 'Pólizas COI' },
        { id: 'ban_saldo_total', nombre: 'Saldo BANCO' },
        { id: 'noi_empleados_activos', nombre: 'Empleados NOI' }
      ];

      for (const prueba of pruebasMetricas) {
        try {
          const resultado = await this.resolvedor.resolver(prueba.id);
          console.log(`   ✅ ${prueba.nombre}: ${resultado.datos.valor_formateado || 'OK'}`);
        } catch (error) {
          console.log(`   ⚠️  ${prueba.nombre}: ${error.message.split('\n')[0]}`);
        }
      }

      console.log('\n   💡 Nota: Ejecutado en modo demo sin DuckDB');
    } catch (error) {
      console.error(`   ❌ Error en resolvedor: ${error.message}`);
      resultados.errores.push({ paso: 'resolvedor', error: error.message });
    }
  }

  /**
   * Muestra resumen de ejecución
   */
  mostrarResumen(resultados, duracion) {
    console.log('\n╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(25) + 'RESUMEN FINAL' + ' '.repeat(30) + '║');
    console.log('╚' + '═'.repeat(68) + '╝\n');

    // Diccionarios
    const diccsOK = Object.values(resultados.diccionarios).filter(d => d.estado === 'OK').length;
    console.log(`📚 Diccionarios: ${diccsOK}/${this.sistemas.length} generados`);

    // Semánticas
    const semsOK = Object.values(resultados.semanticas).filter(s => s.estado === 'OK').length;
    console.log(`🧠 Semánticas: ${semsOK}/${this.sistemas.length} generadas`);

    // Métricas
    const metricasValidas = Object.values(resultados.metricas_validadas).filter(m => m.valido).length;
    const totalMetricas = Object.values(resultados.metricas_validadas).reduce((sum, m) => sum + (m.metricas || 0), 0);
    console.log(`✔️  Métricas: ${metricasValidas}/${this.sistemas.length} archivos válidos (${totalMetricas} métricas)`);

    // Errores
    console.log(`\n${resultados.errores.length === 0 ? '✅' : '❌'} Errores: ${resultados.errores.length}`);

    // Duración
    console.log(`⏱️  Duración: ${(duracion / 1000).toFixed(2)}s`);

    console.log('\n' + '═'.repeat(70));
  }

  /**
   * Guarda reporte en archivo
   */
  async guardarReporte(resultados) {
    const archivoReporte = 'reporte_generacion_semantica.json';
    await fs.writeJson(archivoReporte, resultados, { spaces: 2 });
    console.log(`\n📄 Reporte guardado en: ${archivoReporte}`);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const generador = new GeneradorCompleto();

  generador.ejecutar()
    .then(exitoso => {
      if (exitoso) {
        console.log('\n🎉 ¡Proceso completado exitosamente!');
        process.exit(0);
      } else {
        console.log('\n⚠️  Proceso completado con errores');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n💥 Error fatal:', error);
      process.exit(1);
    });
}

module.exports = GeneradorCompleto;
