/**
 * Generador de Descripciones
 * 
 * Genera descripciones legibles en español para tablas y campos de los sistemas Aspel,
 * usando inferencia semántica basada en nombres, tipos de datos y patrones.
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');

class GeneradorDescripciones {
  constructor() {
    this.rutaEsquemas = path.join(process.cwd(), 'Esquemas', 'cenit');
    this.rutaSalida = path.join(this.rutaEsquemas, 'descripciones');
    
    // Diccionarios para inferencia semántica
    this.patronesCampos = this.construirPatrones();
    this.sufijos = this.construirSufijos();
    this.prefijos = this.construirPrefijos();
  }

  /**
   * Construye patrones de reconocimiento para campos comunes
   */
  construirPatrones() {
    return {
      // Fechas
      'FECHA': { tipo: 'fecha', desc: 'Fecha' },
      'FECHA_DOC': { tipo: 'fecha', desc: 'Fecha del documento' },
      'FECHA_ALTA': { tipo: 'fecha', desc: 'Fecha de alta o registro' },
      'FECHA_VENC': { tipo: 'fecha', desc: 'Fecha de vencimiento' },
      'FECHA_EMISION': { tipo: 'fecha', desc: 'Fecha de emisión' },
      'FECHA_INI': { tipo: 'fecha', desc: 'Fecha de inicio' },
      'FECHA_FIN': { tipo: 'fecha', desc: 'Fecha de finalización' },
      'FECHA_MOV': { tipo: 'fecha', desc: 'Fecha del movimiento' },
      'FECHA_CAPTURA': { tipo: 'fecha', desc: 'Fecha de captura en el sistema' },
      'FECHA_REG': { tipo: 'fecha', desc: 'Fecha de registro' },
      'FECHA_ENTREGA': { tipo: 'fecha', desc: 'Fecha de entrega' },
      'FECHA_PAGO': { tipo: 'fecha', desc: 'Fecha de pago' },
      'FECHA_APLICACION': { tipo: 'fecha', desc: 'Fecha de aplicación contable' },
      
      // Importes y montos
      'IMPORTE': { tipo: 'importe', desc: 'Importe o monto total' },
      'IMP_NETO': { tipo: 'importe', desc: 'Importe neto después de descuentos' },
      'DESCUENTO': { tipo: 'importe', desc: 'Monto de descuento aplicado' },
      'SUBTOTAL': { tipo: 'importe', desc: 'Subtotal antes de impuestos' },
      'IVA': { tipo: 'importe', desc: 'Impuesto al Valor Agregado' },
      'TOTAL': { tipo: 'importe', desc: 'Total del documento' },
      'SALDO': { tipo: 'importe', desc: 'Saldo pendiente' },
      'ABONO': { tipo: 'importe', desc: 'Abono o pago parcial' },
      'CARGO': { tipo: 'importe', desc: 'Cargo aplicado' },
      'COSTO': { tipo: 'importe', desc: 'Costo del artículo o servicio' },
      'PRECIO': { tipo: 'importe', desc: 'Precio de venta' },
      'MONTO': { tipo: 'importe', desc: 'Monto' },
      
      // Cantidades
      'CANTIDAD': { tipo: 'cantidad', desc: 'Cantidad' },
      'UNIDADES': { tipo: 'cantidad', desc: 'Número de unidades' },
      'EXISTENCIA': { tipo: 'cantidad', desc: 'Existencia o inventario disponible' },
      'STOCK': { tipo: 'cantidad', desc: 'Stock o inventario' },
      'MIN': { tipo: 'cantidad', desc: 'Cantidad mínima' },
      'MAX': { tipo: 'cantidad', desc: 'Cantidad máxima' },
      
      // Claves y códigos
      'CLAVE': { tipo: 'clave', desc: 'Clave o código único' },
      'CVE': { tipo: 'clave', desc: 'Clave' },
      'CODIGO': { tipo: 'clave', desc: 'Código' },
      'FOLIO': { tipo: 'folio', desc: 'Número de folio consecutivo' },
      'NUMERO': { tipo: 'folio', desc: 'Número' },
      'NO_DOCTO': { tipo: 'folio', desc: 'Número de documento' },
      'UUID': { tipo: 'clave', desc: 'Identificador único universal (UUID)' },
      
      // Estatus
      'STATUS': { tipo: 'estatus', desc: 'Estatus o estado del registro' },
      'ESTATUS': { tipo: 'estatus', desc: 'Estatus' },
      'ACTIVO': { tipo: 'boolean', desc: 'Indica si está activo' },
      'CANCELADO': { tipo: 'boolean', desc: 'Indica si está cancelado' },
      'APLICADO': { tipo: 'boolean', desc: 'Indica si fue aplicado' },
      'CERRADO': { tipo: 'boolean', desc: 'Indica si está cerrado' },
      
      // Descripciones y nombres
      'NOMBRE': { tipo: 'texto', desc: 'Nombre' },
      'DESCRIPCION': { tipo: 'texto', desc: 'Descripción' },
      'RAZON_SOCIAL': { tipo: 'texto', desc: 'Razón social' },
      'DIRECCION': { tipo: 'texto', desc: 'Dirección' },
      'COLONIA': { tipo: 'texto', desc: 'Colonia' },
      'CIUDAD': { tipo: 'texto', desc: 'Ciudad' },
      'ESTADO': { tipo: 'texto', desc: 'Estado' },
      'CP': { tipo: 'texto', desc: 'Código postal' },
      'TELEFONO': { tipo: 'texto', desc: 'Número de teléfono' },
      'EMAIL': { tipo: 'texto', desc: 'Correo electrónico' },
      'RFC': { tipo: 'texto', desc: 'Registro Federal de Contribuyentes' },
      'CURP': { tipo: 'texto', desc: 'Clave Única de Registro de Población' },
      
      // Referencias
      'REFERENCIA': { tipo: 'texto', desc: 'Referencia adicional' },
      'OBSERVACIONES': { tipo: 'texto', desc: 'Observaciones o comentarios' },
      'NOTAS': { tipo: 'texto', desc: 'Notas adicionales' },
      
      // Usuario y sistema
      'USUARIO': { tipo: 'usuario', desc: 'Usuario que capturó o modificó' },
      'USU_ALTA': { tipo: 'usuario', desc: 'Usuario que dio de alta' },
      'USU_MOD': { tipo: 'usuario', desc: 'Usuario que modificó' },
      'TIMESTAMP': { tipo: 'fecha', desc: 'Marca de tiempo de última modificación' },
      
      // Específicos de negocio
      'POLIZA': { tipo: 'folio', desc: 'Número de póliza contable' },
      'CUENTA': { tipo: 'clave', desc: 'Cuenta contable' },
      'CONCEPTO': { tipo: 'clave', desc: 'Concepto' },
      'TIPO_DOC': { tipo: 'clave', desc: 'Tipo de documento' },
      'TIPO_CAMBIO': { tipo: 'importe', desc: 'Tipo de cambio' },
      'MONEDA': { tipo: 'clave', desc: 'Clave de moneda' },
      'ALMACEN': { tipo: 'clave', desc: 'Clave de almacén' },
      'AGENTE': { tipo: 'clave', desc: 'Clave de agente o vendedor' },
      'SUCURSAL': { tipo: 'clave', desc: 'Clave de sucursal' },
      'EMPRESA': { tipo: 'clave', desc: 'Clave de empresa' }
    };
  }

  /**
   * Construye sufijos comunes
   */
  construirSufijos() {
    return {
      '_01': 'principal o primario',
      '_02': 'secundario o alternativo',
      '_A': 'adicional o auxiliar',
      '_B': 'backup o respaldo',
      '_TEMP': 'temporal',
      '_BAK': 'respaldo',
      '_OLD': 'antiguo o histórico',
      '_NEW': 'nuevo',
      '_ORIG': 'original',
      '_DESC': 'descripción',
      '_NOM': 'nombre',
      '_CLIE': 'de cliente',
      '_PROV': 'de proveedor',
      '_ART': 'de artículo',
      '_INV': 'de inventario',
      '_CTA': 'de cuenta',
      '_DOC': 'de documento',
      '_MOV': 'de movimiento',
      '_DET': 'detalle',
      '_ENC': 'encabezado',
      '_F': 'final',
      '_I': 'inicial'
    };
  }

  /**
   * Construye prefijos comunes
   */
  construirPrefijos() {
    return {
      'CVE_': 'Clave de',
      'NO_': 'Número de',
      'ID_': 'Identificador de',
      'COD_': 'Código de',
      'DES_': 'Descripción de',
      'NOM_': 'Nombre de',
      'IMP_': 'Importe de',
      'FECHA_': 'Fecha de',
      'TIPO_': 'Tipo de',
      'NUM_': 'Número de',
      'TOT_': 'Total de',
      'SUB_': 'Sub',
      'POR_': 'Porcentaje de',
      'REF_': 'Referencia de',
      'USU_': 'Usuario',
      'FLG_': 'Bandera o indicador de',
      'IND_': 'Indicador de',
      'VAL_': 'Valor de'
    };
  }

  /**
   * Infiere descripción de un nombre de tabla basado en patrones
   */
  inferirDescripcionTabla(nombreTabla, sistema) {
    // Mapeos específicos por sistema
    const tablasConocidas = {
      // SAE - Sistema Administrativo Empresarial
      'FACTF': 'Facturas',
      'CLIE': 'Clientes',
      'PROV': 'Proveedores',
      'INVE': 'Inventarios',
      'ART': 'Artículos',
      'VTAS': 'Ventas',
      'COMP': 'Compras',
      'PEDID': 'Pedidos',
      'REMIS': 'Remisiones',
      'COTIZ': 'Cotizaciones',
      'DEV': 'Devoluciones',
      'CARGO': 'Cargos',
      'ABONO': 'Abonos',
      'PAGO': 'Pagos',
      'ENTR': 'Entradas',
      'SALI': 'Salidas',
      'TRAS': 'Traspasos',
      'AJUS': 'Ajustes',
      'CONCE': 'Conceptos',
      'ALMAC': 'Almacenes',
      'LINEA': 'Líneas de producto',
      'MARCA': 'Marcas',
      'AGENT': 'Agentes o vendedores',
      'COBR': 'Cobradores',
      'ZONA': 'Zonas',
      'LISTA': 'Listas de precios',
      'DESC': 'Descuentos',
      'IMPUE': 'Impuestos',
      'CFDI': 'Comprobantes Fiscales Digitales',
      'UUID': 'Folios fiscales',
      
      // COI - Sistema de Contabilidad Integral
      'POLIZ': 'Pólizas contables',
      'CUEN': 'Cuentas contables',
      'CATAL': 'Catálogos',
      'BALAN': 'Balanza',
      'MAYOR': 'Mayor',
      'AUXIL': 'Auxiliares',
      'DIAR': 'Diario',
      'PERIO': 'Periodos contables',
      'EJERC': 'Ejercicios fiscales',
      'CONCEP': 'Conceptos contables',
      'TIPO': 'Tipos',
      'MONEDA': 'Monedas',
      'BANCO': 'Bancos',
      'CHEQUE': 'Cheques',
      'DEPOSI': 'Depósitos',
      'CONCIL': 'Conciliación bancaria',
      'ACTIV': 'Activos fijos',
      'DEPREC': 'Depreciaciones',
      'COSTO': 'Centro de costos',
      'PROY': 'Proyectos',
      'SEGME': 'Segmentos de negocio',
      'COMPR': 'Comprobantes',
      'ANEXO': 'Anexos fiscales',
      'REPOR': 'Reportes',
      
      // BANCO - Sistema de Bancos
      'CUENT': 'Cuentas bancarias',
      'MOVBA': 'Movimientos bancarios',
      'CHEQU': 'Cheques',
      'RETIR': 'Retiros',
      'DEPOS': 'Depósitos',
      'TRANS': 'Transferencias',
      'CONCI': 'Conciliación',
      'SALDO': 'Saldos',
      'BENEF': 'Beneficiarios',
      'TIMBR': 'Timbres fiscales',
      'LAYOUT': 'Layouts bancarios',
      'FIRMA': 'Firmas autorizadas',
      'LIMIT': 'Límites de operación',
      
      // NOI - Sistema de Nómina Integral
      'EMPLEA': 'Empleados',
      'NOMINA': 'Nóminas',
      'PERCEP': 'Percepciones',
      'DEDUCC': 'Deducciones',
      'INCIDE': 'Incidencias',
      'FALTAS': 'Faltas',
      'RETARD': 'Retardos',
      'INCAPA': 'Incapacidades',
      'VACAC': 'Vacaciones',
      'AUSENC': 'Ausencias',
      'AGUINA': 'Aguinaldos',
      'PRIMA': 'Primas',
      'BONO': 'Bonos',
      'HORAS': 'Horas extras',
      'TURNO': 'Turnos',
      'HORARI': 'Horarios',
      'DEPART': 'Departamentos',
      'PUESTO': 'Puestos',
      'PLANT': 'Plantilla',
      'CONTRA': 'Contratos',
      'IMSS': 'IMSS',
      'ISR': 'ISR',
      'INFONAV': 'Infonavit',
      'FONACO': 'Fonacot',
      'PRESTAM': 'Préstamos',
      'AHORRO': 'Ahorros',
      'MOVNOM': 'Movimientos de nómina',
      'RECIBO': 'Recibos de nómina',
      'TIMBRE': 'Timbrado de recibos'
    };

    // Buscar coincidencia exacta primero
    for (const [patron, descripcion] of Object.entries(tablasConocidas)) {
      if (nombreTabla.toUpperCase().includes(patron)) {
        // Añadir contexto del sistema
        let contexto = '';
        switch(sistema) {
          case 'SAE': contexto = 'del sistema de ventas'; break;
          case 'COI': contexto = 'del sistema contable'; break;
          case 'BANCO': contexto = 'del sistema bancario'; break;
          case 'NOI': contexto = 'del sistema de nómina'; break;
        }
        
        // Inferir si es catálogo o movimiento por sufijo
        const sufijo = nombreTabla.slice(-2);
        let tipoTabla = '';
        
        if (sufijo === '01' || sufijo === 'C1' || nombreTabla.includes('CAT')) {
          tipoTabla = '(catálogo)';
        } else if (nombreTabla.includes('F') || nombreTabla.includes('M') || nombreTabla.includes('D')) {
          tipoTabla = '(movimientos)';
        }
        
        return `${descripcion} ${tipoTabla} ${contexto}`.trim();
      }
    }

    // Si no se encuentra, descripción genérica
    return `Tabla ${nombreTabla} del sistema ${sistema}`;
  }

  /**
   * Infiere descripción de un campo basado en su nombre y tipo
   */
  inferirDescripcionCampo(nombreCampo, tipoDato, nombreTabla) {
    const nombreUpper = nombreCampo.toUpperCase();

    // 1. Buscar coincidencia exacta
    if (this.patronesCampos[nombreUpper]) {
      return this.patronesCampos[nombreUpper].desc;
    }

    // 2. Buscar por prefijo
    for (const [prefijo, significado] of Object.entries(this.prefijos)) {
      if (nombreUpper.startsWith(prefijo)) {
        const resto = nombreUpper.slice(prefijo.length);
        const descripcionResto = this.obtenerDescripcionParte(resto);
        return `${significado} ${descripcionResto}`.toLowerCase()
          .replace(/^\w/, c => c.toUpperCase());
      }
    }

    // 3. Buscar por sufijo
    for (const [sufijo, significado] of Object.entries(this.sufijos)) {
      if (nombreUpper.endsWith(sufijo)) {
        const resto = nombreUpper.slice(0, -sufijo.length);
        const descripcionResto = this.obtenerDescripcionParte(resto);
        return `${descripcionResto} (${significado})`;
      }
    }

    // 4. Buscar palabras clave en medio del nombre
    for (const [patron, info] of Object.entries(this.patronesCampos)) {
      if (nombreUpper.includes(patron)) {
        return info.desc + ` relacionado con ${nombreTabla}`;
      }
    }

    // 5. Inferir por tipo de dato
    const descripcionPorTipo = this.inferirPorTipoDato(tipoDato, nombreCampo);
    if (descripcionPorTipo) {
      return descripcionPorTipo;
    }

    // 6. Descripción genérica
    return `Campo ${nombreCampo} de la tabla ${nombreTabla}`;
  }

  /**
   * Obtiene descripción de una parte del nombre
   */
  obtenerDescripcionParte(parte) {
    const mapeo = {
      'CLIE': 'cliente',
      'PROV': 'proveedor',
      'ART': 'artículo',
      'DOC': 'documento',
      'MOV': 'movimiento',
      'FACT': 'factura',
      'PED': 'pedido',
      'COT': 'cotización',
      'REM': 'remisión',
      'DEV': 'devolución',
      'INV': 'inventario',
      'ALM': 'almacén',
      'AG': 'agente',
      'VEND': 'vendedor',
      'COBR': 'cobrador',
      'ENC': 'encabezado',
      'DET': 'detalle',
      'LIN': 'línea',
      'PROD': 'producto',
      'SERV': 'servicio',
      'CTA': 'cuenta',
      'POL': 'póliza',
      'BANCO': 'banco',
      'CHQ': 'cheque',
      'DEP': 'depósito',
      'RET': 'retiro',
      'TRANS': 'transferencia',
      'CONC': 'concepto',
      'EMP': 'empleado',
      'NOM': 'nómina',
      'PERC': 'percepción',
      'DED': 'deducción',
      'INC': 'incidencia',
      'DEP': 'departamento',
      'PUEST': 'puesto'
    };

    return mapeo[parte] || parte.toLowerCase();
  }

  /**
   * Infiere descripción basada en tipo de dato
   */
  inferirPorTipoDato(tipoDato, nombreCampo) {
    const tipoUpper = tipoDato.toUpperCase();
    
    if (tipoUpper.includes('DATE') || tipoUpper.includes('TIMESTAMP')) {
      return `Fecha - ${nombreCampo}`;
    }
    
    if (tipoUpper.includes('DECIMAL') || tipoUpper.includes('NUMERIC') || tipoUpper.includes('FLOAT')) {
      if (nombreCampo.toUpperCase().includes('PRECIO') || 
          nombreCampo.toUpperCase().includes('COSTO') ||
          nombreCampo.toUpperCase().includes('IMPORTE')) {
        return `Monto en pesos - ${nombreCampo}`;
      }
      return `Valor numérico decimal - ${nombreCampo}`;
    }
    
    if (tipoUpper.includes('INT') || tipoUpper.includes('SMALLINT') || tipoUpper.includes('BIGINT')) {
      if (nombreCampo.toUpperCase().includes('CANTIDAD') || 
          nombreCampo.toUpperCase().includes('EXISTENCIA')) {
        return `Cantidad - ${nombreCampo}`;
      }
      return `Valor numérico entero - ${nombreCampo}`;
    }
    
    if (tipoUpper.includes('CHAR') || tipoUpper.includes('VARCHAR')) {
      const longitud = tipoDato.match(/\((\d+)\)/);
      if (longitud && parseInt(longitud[1]) <= 10) {
        return `Código o clave - ${nombreCampo}`;
      }
      return `Texto - ${nombreCampo}`;
    }
    
    if (tipoUpper.includes('BLOB') || tipoUpper.includes('BINARY')) {
      return `Datos binarios - ${nombreCampo}`;
    }
    
    return null;
  }

  /**
   * Genera el archivo de descripciones para un sistema
   */
  async generarDescripciones(sistema) {
    console.log(`\n🔍 Generando descripciones para ${sistema}...`);
    
    try {
      // Cargar diccionario técnico (si existe)
      const rutaDiccionario = path.join(process.cwd(), 'diccionario', `catalogo_tecnico_${sistema}.json`);
      let diccionario = null;
      
      if (await fs.pathExists(rutaDiccionario)) {
        diccionario = await fs.readJson(rutaDiccionario);
        console.log(`  ✓ Diccionario técnico cargado (${Object.keys(diccionario.tablas).length} tablas)`);
      } else {
        // Leer directamente desde esquemas
        console.log(`  ⚠ Diccionario no encontrado, leyendo esquemas directamente...`);
        diccionario = await this.leerEsquemasDirecto(sistema);
      }

      // Generar descripciones
      const descripciones = {
        sistema,
        fecha_generacion: new Date().toISOString(),
        total_tablas: Object.keys(diccionario.tablas).length,
        tablas: {}
      };

      for (const [nombreTabla, infoTabla] of Object.entries(diccionario.tablas)) {
        // Descripción de la tabla
        const descripcionTabla = this.inferirDescripcionTabla(nombreTabla, sistema);
        
        // Descripciones de campos
        const campos = {};
        for (const campo of infoTabla.campos || []) {
          campos[campo.nombre] = this.inferirDescripcionCampo(
            campo.nombre,
            campo.tipo || 'VARCHAR',
            nombreTabla
          );
        }

        descripciones.tablas[nombreTabla] = {
          descripcion: descripcionTabla,
          campos
        };
      }

      // Guardar archivo JSON
      const rutaSalida = path.join(this.rutaSalida, `descripciones_${sistema}.json`);
      await fs.ensureDir(this.rutaSalida);
      await fs.writeJson(rutaSalida, descripciones, { spaces: 2 });
      
      console.log(`  ✓ Archivo generado: descripciones_${sistema}.json`);
      console.log(`  ✓ ${descripciones.total_tablas} tablas procesadas`);
      
      return descripciones;
      
    } catch (error) {
      console.error(`  ✗ Error generando descripciones para ${sistema}:`, error.message);
      throw error;
    }
  }

  /**
   * Lee esquemas directamente si no existe diccionario
   */
  async leerEsquemasDirecto(sistema) {
    const rutaSistema = path.join(this.rutaEsquemas, sistema, 'schema');
    const tablas = {};
    
    // Leer resumen YAML
    const rutaResumen = path.join(rutaSistema, `resumen_${sistema}.yaml`);
    if (await fs.pathExists(rutaResumen)) {
      const resumen = yaml.load(await fs.readFile(rutaResumen, 'utf8'));
      
      for (const tabla of resumen.tablas || []) {
        tablas[tabla.nombre] = {
          nombre: tabla.nombre,
          campos: []
        };
        
        // Leer campos desde TXT
        const rutaCampos = path.join(rutaSistema, `${tabla.nombre}.txt`);
        if (await fs.pathExists(rutaCampos)) {
          const contenido = await fs.readFile(rutaCampos, 'utf8');
          const lineas = contenido.split('\n').filter(l => l.trim());
          
          for (const linea of lineas.slice(1)) { // Saltar header
            const partes = linea.split('\t');
            if (partes.length >= 2) {
              tablas[tabla.nombre].campos.push({
                nombre: partes[0],
                tipo: partes[1]
              });
            }
          }
        }
      }
    }
    
    return { sistema, tablas };
  }

  /**
   * Genera descripciones para todos los sistemas
   */
  async generarTodas() {
    console.log('='.repeat(60));
    console.log('GENERADOR DE DESCRIPCIONES - ASPEL CENIT');
    console.log('='.repeat(60));
    
    const sistemas = ['SAE', 'COI', 'BANCO', 'NOI'];
    const resultados = {
      exitosos: [],
      fallidos: [],
      estadisticas: {}
    };

    for (const sistema of sistemas) {
      try {
        const descripciones = await this.generarDescripciones(sistema);
        resultados.exitosos.push(sistema);
        resultados.estadisticas[sistema] = {
          tablas: descripciones.total_tablas,
          campos_total: Object.values(descripciones.tablas)
            .reduce((sum, t) => sum + Object.keys(t.campos).length, 0)
        };
      } catch (error) {
        resultados.fallidos.push({ sistema, error: error.message });
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('RESUMEN DE GENERACIÓN');
    console.log('='.repeat(60));
    console.log(`✓ Sistemas exitosos: ${resultados.exitosos.length}`);
    console.log(`✗ Sistemas fallidos: ${resultados.fallidos.length}`);
    
    if (resultados.exitosos.length > 0) {
      console.log('\nEstadísticas:');
      for (const sistema of resultados.exitosos) {
        const stats = resultados.estadisticas[sistema];
        console.log(`  ${sistema}: ${stats.tablas} tablas, ${stats.campos_total} campos`);
      }
    }

    if (resultados.fallidos.length > 0) {
      console.log('\nErrores:');
      for (const fallo of resultados.fallidos) {
        console.log(`  ${fallo.sistema}: ${fallo.error}`);
      }
    }

    // Guardar reporte
    const rutaReporte = path.join(this.rutaSalida, 'reporte_descripciones.json');
    await fs.writeJson(rutaReporte, {
      fecha: new Date().toISOString(),
      ...resultados
    }, { spaces: 2 });
    
    console.log(`\n📄 Reporte guardado en: ${rutaReporte}`);
    console.log('='.repeat(60));

    return resultados;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const generador = new GeneradorDescripciones();
  generador.generarTodas()
    .then(() => {
      console.log('\n✓ Generación completada');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n✗ Error fatal:', error);
      process.exit(1);
    });
}

module.exports = GeneradorDescripciones;
