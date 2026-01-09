/**
 * Resolvedor de Métricas
 * 
 * Ejecuta métricas definidas en YAML aplicando parámetros,
 * conectando a DuckDB y formateando resultados
 */

const CargadorYAML = require('./cargador_yaml');

class ResolvedorMetricas {
  constructor(duckdbConnection = null) {
    this.cargador = new CargadorYAML();
    this.duckdb = duckdbConnection;
  }

  /**
   * Configura la conexión a DuckDB
   * @param {Object} conexion - Objeto de conexión a DuckDB
   */
  configurarDuckDB(conexion) {
    this.duckdb = conexion;
  }

  /**
   * Resuelve y ejecuta una métrica por ID
   * @param {string} metricaId - ID de la métrica
   * @param {Object} parametros - Parámetros de ejecución
   * @param {string} sistema - Sistema opcional (si se conoce)
   * @returns {Object} Resultado de la métrica
   */
  async resolver(metricaId, parametros = {}, sistema = null) {
    // Buscar la métrica
    const metrica = await this.cargador.buscarMetrica(metricaId, sistema);
    
    if (!metrica) {
      throw new Error(`Métrica no encontrada: ${metricaId}`);
    }

    // Validar parámetros
    this.validarParametros(metrica, parametros);

    // Aplicar valores por defecto
    const parametrosCompletos = this.aplicarDefaults(metrica, parametros);

    // Construir query
    const query = this.construirQuery(metrica, parametrosCompletos);

    // Ejecutar query
    const datos = await this.ejecutarQuery(query);

    // Formatear resultado
    const resultado = this.formatearResultado(metrica, datos);

    return {
      metrica_id: metrica.id,
      nombre: metrica.nombre,
      descripcion: metrica.descripcion,
      sistema: metrica.sistema || sistema,
      tipo: metrica.tipo,
      categoria: metrica.categoria,
      ejecutado_en: new Date().toISOString(),
      parametros: parametrosCompletos,
      datos: resultado,
      metadata: {
        filas: Array.isArray(datos) ? datos.length : 1,
        query_ejecutado: query
      }
    };
  }

  /**
   * Valida que los parámetros requeridos estén presentes
   */
  validarParametros(metrica, parametros) {
    if (!metrica.parametros) return;

    const errores = [];

    for (const param of metrica.parametros) {
      if (param.requerido && !(param.nombre in parametros)) {
        errores.push(`Parámetro requerido faltante: ${param.nombre}`);
      }

      // Validar tipo
      if (param.nombre in parametros) {
        const valor = parametros[param.nombre];
        
        if (!this.validarTipoParametro(valor, param.tipo)) {
          errores.push(
            `Parámetro "${param.nombre}" debe ser de tipo ${param.tipo}, recibido: ${typeof valor}`
          );
        }
      }
    }

    if (errores.length > 0) {
      throw new Error(`Errores de validación:\n${errores.join('\n')}`);
    }
  }

  /**
   * Valida el tipo de un parámetro
   */
  validarTipoParametro(valor, tipoEsperado) {
    switch (tipoEsperado) {
      case 'string':
        return typeof valor === 'string';
      case 'integer':
        return Number.isInteger(valor);
      case 'date':
        return valor instanceof Date || typeof valor === 'string';
      case 'boolean':
        return typeof valor === 'boolean';
      default:
        return true;
    }
  }

  /**
   * Aplica valores por defecto a parámetros
   */
  aplicarDefaults(metrica, parametros) {
    const completos = { ...parametros };

    if (metrica.parametros) {
      for (const param of metrica.parametros) {
        if (!(param.nombre in completos) && 'default' in param) {
          // Si el default es una expresión SQL, lo dejamos como string
          completos[param.nombre] = param.default;
        }
      }
    }

    return completos;
  }

  /**
   * Construye la query SQL reemplazando placeholders
   */
  construirQuery(metrica, parametros) {
    let query = metrica.query_duckdb;

    if (!query) {
      throw new Error(`Métrica ${metrica.id} no tiene query_duckdb definido`);
    }

    // Reemplazar placeholders {nombre}
    for (const [nombre, valor] of Object.entries(parametros)) {
      const placeholder = `{${nombre}}`;
      
      // Si el valor parece ser una expresión SQL, no lo escapamos
      if (typeof valor === 'string' && 
          (valor.includes('(') || valor.includes('CURRENT_DATE') || valor.includes('EXTRACT'))) {
        query = query.replace(new RegExp(placeholder, 'g'), valor);
      } else {
        // Escapar valor según tipo
        const valorEscapado = this.escaparValor(valor);
        query = query.replace(new RegExp(placeholder, 'g'), valorEscapado);
      }
    }

    return query;
  }

  /**
   * Escapa un valor para SQL
   */
  escaparValor(valor) {
    if (valor === null || valor === undefined) {
      return 'NULL';
    }

    if (typeof valor === 'string') {
      // Verificar si es una fecha
      if (valor.match(/^\d{4}-\d{2}-\d{2}/)) {
        return `DATE '${valor}'`;
      }
      return `'${valor.replace(/'/g, "''")}'`;
    }

    if (typeof valor === 'number') {
      return valor.toString();
    }

    if (typeof valor === 'boolean') {
      return valor ? 'true' : 'false';
    }

    if (valor instanceof Date) {
      return `DATE '${valor.toISOString().split('T')[0]}'`;
    }

    return `'${String(valor)}'`;
  }

  /**
   * Ejecuta una query en DuckDB
   */
  async ejecutarQuery(query) {
    if (!this.duckdb) {
      // Modo simulación/demo
      console.warn('⚠️  DuckDB no configurado, devolviendo datos de ejemplo');
      return this.generarDatosEjemplo(query);
    }

    try {
      // Ejecutar query real
      const resultado = await this.duckdb.all(query);
      return resultado;
    } catch (error) {
      throw new Error(`Error al ejecutar query: ${error.message}\nQuery: ${query}`);
    }
  }

  /**
   * Genera datos de ejemplo para modo demo
   */
  generarDatosEjemplo(query) {
    // Detectar tipo de query
    if (query.toLowerCase().includes('count(*)')) {
      return [{ valor: 42 }];
    }

    if (query.toLowerCase().includes('sum(')) {
      return [{ valor: 123456.78 }];
    }

    if (query.toLowerCase().includes('group by')) {
      return [
        { categoria: 'A', valor: 1000 },
        { categoria: 'B', valor: 2000 },
        { categoria: 'C', valor: 1500 }
      ];
    }

    return [{ valor: 100 }];
  }

  /**
   * Formatea el resultado según el tipo de métrica
   */
  formatearResultado(metrica, datos) {
    switch (metrica.tipo) {
      case 'escalar':
        return this.formatearEscalar(metrica, datos);
      
      case 'serie':
        return this.formatearSerie(metrica, datos);
      
      case 'tabla':
        return this.formatearTabla(metrica, datos);
      
      default:
        return datos;
    }
  }

  /**
   * Formatea resultado escalar (valor único)
   */
  formatearEscalar(metrica, datos) {
    if (!datos || datos.length === 0) {
      return {
        valor: 0,
        valor_formateado: this.aplicarFormato(0, metrica.formato)
      };
    }

    const valor = datos[0].valor !== undefined ? datos[0].valor : 0;

    return {
      valor,
      valor_formateado: this.aplicarFormato(valor, metrica.formato),
      unidad: metrica.unidad,
      alerta: this.evaluarAlerta(metrica, valor)
    };
  }

  /**
   * Formatea resultado tipo serie (array de valores)
   */
  formatearSerie(metrica, datos) {
    return {
      serie: datos.map(registro => ({
        fecha: registro.fecha || registro.periodo,
        valor: registro.valor,
        valor_formateado: this.aplicarFormato(registro.valor, metrica.formato)
      })),
      visual: metrica.visual || { tipo: 'linea' }
    };
  }

  /**
   * Formatea resultado tipo tabla
   */
  formatearTabla(metrica, datos) {
    const columnasConfig = metrica.formato?.columnas || [];

    return {
      filas: datos.map(fila => {
        const filaFormateada = {};
        
        for (const [columna, valor] of Object.entries(fila)) {
          const config = columnasConfig.find(c => c.nombre === columna);
          
          filaFormateada[columna] = {
            valor,
            valor_formateado: config 
              ? this.aplicarFormatoColumna(valor, config)
              : valor
          };
        }
        
        return filaFormateada;
      }),
      columnas: columnasConfig
    };
  }

  /**
   * Aplica formato a un valor según configuración
   */
  aplicarFormato(valor, formato) {
    if (!formato) return valor;

    let resultado = valor;

    // Aplicar decimales
    if (typeof resultado === 'number' && 'decimales' in formato) {
      resultado = resultado.toFixed(formato.decimales);
    }

    // Aplicar separador de miles
    if (formato.separador_miles && typeof resultado === 'string') {
      const partes = resultado.split('.');
      partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, formato.separador_miles);
      resultado = partes.join('.');
    }

    // Aplicar prefijo y sufijo
    if (formato.prefijo) resultado = formato.prefijo + resultado;
    if (formato.sufijo) resultado = resultado + formato.sufijo;

    return resultado;
  }

  /**
   * Aplica formato específico a una columna de tabla
   */
  aplicarFormatoColumna(valor, config) {
    if (config.tipo === 'moneda') {
      return this.aplicarFormato(valor, {
        decimales: config.decimales || 2,
        prefijo: '$',
        separador_miles: ','
      });
    }

    if (config.tipo === 'porcentaje') {
      return this.aplicarFormato(valor, {
        decimales: config.decimales || 2,
        sufijo: '%'
      });
    }

    if (config.tipo === 'numero' && config.decimales !== undefined) {
      return this.aplicarFormato(valor, {
        decimales: config.decimales
      });
    }

    return valor;
  }

  /**
   * Evalúa alertas según configuración
   */
  evaluarAlerta(metrica, valor) {
    if (!metrica.alerta) return null;

    const alerta = metrica.alerta;

    if (alerta.tipo === 'umbral') {
      const nivel = this.evaluarUmbral(valor, alerta);
      
      if (nivel) {
        return {
          activa: true,
          nivel,
          mensaje: alerta.mensaje || `Valor fuera de rango: ${valor}`
        };
      }
    }

    if (alerta.tipo === 'existencia' && valor > 0) {
      return {
        activa: true,
        nivel: alerta.nivel || 'warning',
        mensaje: alerta.mensaje || 'Se encontraron registros'
      };
    }

    return null;
  }

  /**
   * Evalúa umbrales de alerta
   */
  evaluarUmbral(valor, alerta) {
    if (alerta.nivel_critical !== undefined) {
      if (this.evaluarCondicion(valor, alerta.condicion, alerta.nivel_critical)) {
        return 'critical';
      }
    }

    if (alerta.nivel_warning !== undefined) {
      if (this.evaluarCondicion(valor, alerta.condicion, alerta.nivel_warning)) {
        return 'warning';
      }
    }

    return null;
  }

  /**
   * Evalúa una condición simple
   */
  evaluarCondicion(valor, condicion, umbral) {
    if (!condicion) return false;

    if (condicion.includes('>')) return valor > umbral;
    if (condicion.includes('<')) return valor < umbral;
    if (condicion.includes('==')) return valor === umbral;
    if (condicion.includes('!=')) return valor !== umbral;

    return false;
  }

  /**
   * Resuelve múltiples métricas en paralelo
   */
  async resolverVarias(metricas) {
    const promesas = metricas.map(({ id, parametros, sistema }) =>
      this.resolver(id, parametros, sistema).catch(error => ({
        error: true,
        metrica_id: id,
        mensaje: error.message
      }))
    );

    return await Promise.all(promesas);
  }
}

module.exports = ResolvedorMetricas;

// Ejecutar si se llama directamente (modo demo)
if (require.main === module) {
  const resolvedor = new ResolvedorMetricas();

  (async () => {
    console.log('🧪 Probando Resolvedor de Métricas (modo demo)...\n');

    try {
      // Test 1: Métrica escalar
      console.log('📊 Test 1: Métrica escalar (ventas netas)');
      const resultado1 = await resolvedor.resolver('sae_ventas_netas_mes');
      console.log(JSON.stringify(resultado1, null, 2));

      // Test 2: Métrica con parámetros
      console.log('\n📊 Test 2: Métrica con parámetros (top clientes)');
      const resultado2 = await resolvedor.resolver('sae_top_clientes', {
        fecha_inicio: '2026-01-01',
        fecha_fin: '2026-01-31',
        limite: 10
      });
      console.log(JSON.stringify(resultado2, null, 2));

      // Test 3: Múltiples métricas
      console.log('\n📊 Test 3: Resolver múltiples métricas');
      const resultados = await resolvedor.resolverVarias([
        { id: 'sae_empleados_activos', sistema: 'SAE' },
        { id: 'coi_polizas_mes', sistema: 'COI' },
        { id: 'ban_saldo_total', sistema: 'BANCO' }
      ]);

      resultados.forEach(r => {
        if (r.error) {
          console.log(`   ❌ ${r.metrica_id}: ${r.mensaje}`);
        } else {
          console.log(`   ✅ ${r.nombre}: ${r.datos.valor_formateado || 'OK'}`);
        }
      });

      console.log('\n✅ Pruebas completadas');
    } catch (error) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  })();
}
