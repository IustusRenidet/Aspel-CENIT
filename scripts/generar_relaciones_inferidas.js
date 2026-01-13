const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');

const DIR_SEMANTICA = path.join(__dirname, '../diccionario');
const DIR_OVERRIDES = path.join(__dirname, '../overrides');
const SISTEMAS = ['SAE', 'COI', 'NOI', 'BANCO'];

/**
 * Lee JSON con manejo de NaN
 */
function readJsonWithNaN(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const fixedContent = content.replace(/:\s*NaN/g, ': null');
    return JSON.parse(fixedContent);
}

/**
 * Patrones de campos que suelen ser FK
 */
const PATRONES_FK = {
    // Claves generales
    'CVE_CLIEN': { destino: 'CLIE', campo: 'CLAVE', descripcion: 'Cliente' },
    'CVE_CLPV': { destino: 'CLIE', campo: 'CLAVE', descripcion: 'Cliente/Proveedor' },
    'CVE_PROV': { destino: 'PROV', campo: 'CVE_PROV', descripcion: 'Proveedor' },
    'CVE_ART': { destino: 'INVE', campo: 'CVE_ART', descripcion: 'Artículo' },
    'CVE_VEND': { destino: 'VEND', campo: 'CVE_VEND', descripcion: 'Vendedor' },
    'CVE_ALMA': { destino: 'ALMA', campo: 'CVE_ALMA', descripcion: 'Almacén' },
    'CVE_OBS': { destino: 'OBSERV', campo: 'CVE_OBS', descripcion: 'Observación' },
    'CVE_COND': { destino: 'COND', campo: 'CVE_COND', descripcion: 'Condición de pago' },
    
    // Documentos
    'TIPO_DOC': { destino: 'TIPO_DOC', campo: 'TIPO', descripcion: 'Tipo de documento' },
    'NUM_FACTURA': { destino: 'FACTF', campo: 'NUM_FACTURA', descripcion: 'Factura' },
    'NUM_REMISION': { destino: 'REMISF', campo: 'NUM_REMISION', descripcion: 'Remisión' },
    'NUM_PEDIDO': { destino: 'PEDIF', campo: 'NUM_PEDIDO', descripcion: 'Pedido' },
    
    // Contabilidad
    'CUENTA': { destino: 'CTACON', campo: 'CUENTA', descripcion: 'Cuenta contable' },
    'NUM_POLIZA': { destino: 'POLI', campo: 'POLIZA', descripcion: 'Póliza' },
    'TIPO_POLIZA': { destino: 'TIPO_POLI', campo: 'TIPO', descripcion: 'Tipo de póliza' },
    
    // Nómina
    'NUM_EMPLEADO': { destino: 'TRAB', campo: 'NUM_TRAB', descripcion: 'Empleado' },
    'CVE_TRAB': { destino: 'TRAB', campo: 'CVE_TRAB', descripcion: 'Trabajador' },
    'NUM_DEPTO': { destino: 'DEPTO', campo: 'NUM_DEPTO', descripcion: 'Departamento' },
    'CVE_PUESTO': { destino: 'PUESTO', campo: 'CVE_PUESTO', descripcion: 'Puesto' },
    'NUM_NOMINA': { destino: 'NWNOM', campo: 'NUM_NOMINA', descripcion: 'Nómina' },
    'TIPO_NOMINA': { destino: 'TIPO_NOM', campo: 'TIPO', descripcion: 'Tipo de nómina' },
    'CVE_PERC': { destino: 'PERCEPCIONES', campo: 'CVE_PERC', descripcion: 'Percepción' },
    'CVE_DEDUC': { destino: 'DEDUCCIONES', campo: 'CVE_DEDUC', descripcion: 'Deducción' },
    
    // Bancos
    'NUM_CTA': { destino: 'CTAS', campo: 'NUM_CTA', descripcion: 'Cuenta bancaria' },
    'NUM_BANCO': { destino: 'BANCOS', campo: 'NUM_BANCO', descripcion: 'Banco' },
    'NUM_BENEF': { destino: 'BENEF', campo: 'NUM_REG', descripcion: 'Beneficiario' },
    'CVE_BANCO': { destino: 'BANCOS', campo: 'CVE_BANCO', descripcion: 'Banco' },
    
    // Referencias cruzadas
    'ID_REFERENCIA': { destino: null, campo: null, descripcion: 'Referencia genérica' },
    'FOLIO': { destino: null, campo: null, descripcion: 'Folio de documento' },
    'UUID': { destino: null, campo: null, descripcion: 'UUID de timbrado' }
};

/**
 * Detecta FK por sufijos mensuales (01-12)
 */
function esTablaMensual(nombreTabla) {
    return /\d{2}$/.test(nombreTabla);
}

/**
 * Obtiene la tabla base sin sufijo
 */
function obtenerTablaBase(nombreTabla) {
    return nombreTabla.replace(/\d{2}$/, '');
}

/**
 * Infiere relaciones por análisis de nombres de campos
 */
function inferirRelacionesPorCampos(diccionario, sistema) {
    const relaciones = [];
    const tablasDisponibles = new Set(Object.keys(diccionario.tablas || {}));
    
    // Mapa para seguimiento de relaciones únicas
    const relacionesUnicas = new Map();
    
    for (const [nombreTabla, infoTabla] of Object.entries(diccionario.tablas || {})) {
        const campos = infoTabla.campos || {};
        const tablaBase = obtenerTablaBase(nombreTabla);
        
        for (const [nombreCampo, infoCampo] of Object.entries(campos)) {
            // Buscar patrón exacto
            if (PATRONES_FK[nombreCampo]) {
                const patron = PATRONES_FK[nombreCampo];
                
                // Buscar tabla destino (con o sin sufijo)
                let tablaDestino = null;
                const destinoBase = patron.destino;
                
                if (destinoBase) {
                    // Buscar tabla exacta o con sufijos
                    if (tablasDisponibles.has(destinoBase)) {
                        tablaDestino = destinoBase;
                    } else {
                        // Buscar con sufijos 01-12
                        for (let mes = 1; mes <= 12; mes++) {
                            const sufijo = mes.toString().padStart(2, '0');
                            const candidato = `${destinoBase}${sufijo}`;
                            if (tablasDisponibles.has(candidato)) {
                                tablaDestino = candidato;
                                break;
                            }
                        }
                        
                        // Buscar variantes
                        if (!tablaDestino) {
                            for (const tabla of tablasDisponibles) {
                                if (tabla.startsWith(destinoBase)) {
                                    tablaDestino = tabla;
                                    break;
                                }
                            }
                        }
                    }
                }
                
                if (tablaDestino) {
                    const clave = `${tablaBase}.${nombreCampo}->${tablaDestino}.${patron.campo}`;
                    if (!relacionesUnicas.has(clave)) {
                        relacionesUnicas.set(clave, {
                            tabla_origen: tablaBase,
                            campo_origen: nombreCampo,
                            tabla_destino: obtenerTablaBase(tablaDestino),
                            campo_destino: patron.campo,
                            descripcion: patron.descripcion,
                            confianza: 'alta'
                        });
                    }
                }
            }
            
            // Buscar patrones por prefijos (CVE_, NUM_, ID_)
            if (nombreCampo.startsWith('CVE_') || nombreCampo.startsWith('NUM_') || nombreCampo.startsWith('ID_')) {
                const sufijo = nombreCampo.replace(/^(CVE_|NUM_|ID_)/, '');
                
                // Buscar tablas que coincidan con el sufijo
                for (const tabla of tablasDisponibles) {
                    const tablaLimpia = obtenerTablaBase(tabla);
                    if (tablaLimpia.includes(sufijo) || sufijo.includes(tablaLimpia)) {
                        const clave = `${tablaBase}.${nombreCampo}->${tablaLimpia}.${nombreCampo}`;
                        if (!relacionesUnicas.has(clave) && tablaBase !== tablaLimpia) {
                            relacionesUnicas.set(clave, {
                                tabla_origen: tablaBase,
                                campo_origen: nombreCampo,
                                tabla_destino: tablaLimpia,
                                campo_destino: nombreCampo,
                                descripcion: `Relación inferida por patrón ${nombreCampo}`,
                                confianza: 'media'
                            });
                        }
                    }
                }
            }
            
            // Detectar campos que terminan con nombre de tabla
            for (const tabla of tablasDisponibles) {
                const tablaLimpia = obtenerTablaBase(tabla);
                if (nombreCampo.endsWith(tablaLimpia) && nombreCampo !== tablaLimpia) {
                    // Ejemplo: CAMPO_CLIENTE -> CLIENTE
                    const clave = `${tablaBase}.${nombreCampo}->${tablaLimpia}.${tablaLimpia}`;
                    if (!relacionesUnicas.has(clave) && tablaBase !== tablaLimpia) {
                        relacionesUnicas.set(clave, {
                            tabla_origen: tablaBase,
                            campo_origen: nombreCampo,
                            tabla_destino: tablaLimpia,
                            campo_destino: 'CLAVE', // Asumimos campo CLAVE
                            descripcion: `FK inferida por nombre ${nombreCampo}`,
                            confianza: 'baja'
                        });
                    }
                }
            }
        }
    }
    
    return Array.from(relacionesUnicas.values());
}

/**
 * Genera relaciones para un sistema
 */
async function generarRelacionesSistema(sistema) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`GENERANDO RELACIONES INFERIDAS: ${sistema}`);
    console.log('='.repeat(70));
    
    // Cargar diccionario semántico
    const pathSemantica = path.join(DIR_SEMANTICA, `semantica_${sistema}.json`);
    const diccionario = readJsonWithNaN(pathSemantica);
    
    const totalTablas = Object.keys(diccionario.tablas || {}).length;
    console.log(`📊 Tablas en diccionario: ${totalTablas}`);
    
    // Inferir relaciones
    const relaciones = inferirRelacionesPorCampos(diccionario, sistema);
    
    console.log(`\n🔗 Relaciones inferidas: ${relaciones.length}`);
    
    // Agrupar por confianza
    const porConfianza = {
        alta: relaciones.filter(r => r.confianza === 'alta'),
        media: relaciones.filter(r => r.confianza === 'media'),
        baja: relaciones.filter(r => r.confianza === 'baja')
    };
    
    console.log(`   Alta confianza: ${porConfianza.alta.length}`);
    console.log(`   Media confianza: ${porConfianza.media.length}`);
    console.log(`   Baja confianza: ${porConfianza.baja.length}`);
    
    // Mostrar muestras
    if (porConfianza.alta.length > 0) {
        console.log(`\n📋 Ejemplos de alta confianza:`);
        porConfianza.alta.slice(0, 5).forEach(rel => {
            console.log(`   ${rel.tabla_origen}.${rel.campo_origen} → ${rel.tabla_destino}.${rel.campo_destino}`);
            console.log(`      ${rel.descripcion}`);
        });
    }
    
    return relaciones;
}

/**
 * Actualiza el archivo override con las relaciones inferidas
 */
async function actualizarOverrides(sistema, relaciones) {
    const pathOverride = path.join(DIR_OVERRIDES, `${sistema}.yaml`);
    const yamlContent = await fs.readFile(pathOverride, 'utf8');
    const overrides = yaml.load(yamlContent);
    
    // Añadir sección de relaciones inferidas
    if (!overrides.relaciones_inferidas) {
        overrides.relaciones_inferidas = [];
    }
    
    // Filtrar solo las de alta y media confianza para el override
    const relacionesConfiables = relaciones.filter(r => r.confianza === 'alta' || r.confianza === 'media');
    
    // Evitar duplicados
    const existentes = new Set(
        overrides.relaciones_inferidas.map(r => 
            `${r.tabla_origen}.${r.campo_origen}->${r.tabla_destino}.${r.campo_destino}`
        )
    );
    
    let agregadas = 0;
    for (const relacion of relacionesConfiables) {
        const clave = `${relacion.tabla_origen}.${relacion.campo_origen}->${relacion.tabla_destino}.${relacion.campo_destino}`;
        if (!existentes.has(clave)) {
            overrides.relaciones_inferidas.push({
                tabla_origen: relacion.tabla_origen,
                campo_origen: relacion.campo_origen,
                tabla_destino: relacion.tabla_destino,
                campo_destino: relacion.campo_destino,
                descripcion: relacion.descripcion,
                confianza: relacion.confianza
            });
            existentes.add(clave);
            agregadas++;
        }
    }
    
    // Guardar
    const yamlOutput = yaml.dump(overrides, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
    });
    
    await fs.writeFile(pathOverride, yamlOutput, 'utf8');
    console.log(`\n✅ Actualizado ${pathOverride}`);
    console.log(`   Relaciones agregadas: ${agregadas}`);
    console.log(`   Total relaciones: ${overrides.relaciones_inferidas.length}`);
    
    return agregadas;
}

/**
 * Genera reporte de relaciones
 */
async function generarReporteRelaciones(resultados) {
    const fecha = new Date().toISOString().split('T')[0];
    
    let md = `# Reporte de Relaciones Inferidas\n\n`;
    md += `**Generado:** ${new Date().toLocaleString('es-MX')}\n\n`;
    md += `---\n\n`;
    
    // Resumen
    const totalRelaciones = resultados.reduce((sum, r) => sum + r.relaciones.length, 0);
    const totalAgregadas = resultados.reduce((sum, r) => sum + r.agregadas, 0);
    
    md += `## 📊 Resumen Global\n\n`;
    md += `- **Total relaciones inferidas:** ${totalRelaciones}\n`;
    md += `- **Relaciones agregadas a overrides:** ${totalAgregadas}\n\n`;
    
    // Por sistema
    for (const resultado of resultados) {
        const { sistema, relaciones, agregadas } = resultado;
        
        md += `## Sistema ${sistema}\n\n`;
        md += `- **Relaciones inferidas:** ${relaciones.length}\n`;
        md += `- **Agregadas:** ${agregadas}\n\n`;
        
        // Agrupar por confianza
        const porConfianza = {
            alta: relaciones.filter(r => r.confianza === 'alta'),
            media: relaciones.filter(r => r.confianza === 'media'),
            baja: relaciones.filter(r => r.confianza === 'baja')
        };
        
        md += `### Distribución por Confianza\n\n`;
        md += `| Confianza | Cantidad |\n`;
        md += `|-----------|----------|\n`;
        md += `| Alta | ${porConfianza.alta.length} |\n`;
        md += `| Media | ${porConfianza.media.length} |\n`;
        md += `| Baja | ${porConfianza.baja.length} |\n\n`;
        
        // Listar alta confianza
        if (porConfianza.alta.length > 0) {
            md += `### 🔗 Relaciones de Alta Confianza\n\n`;
            for (const rel of porConfianza.alta) {
                md += `- **${rel.tabla_origen}.${rel.campo_origen}** → **${rel.tabla_destino}.${rel.campo_destino}**\n`;
                md += `  - ${rel.descripcion}\n\n`;
            }
        }
        
        md += `---\n\n`;
    }
    
    const outputPath = path.join(__dirname, '../reporte_relaciones_inferidas.md');
    await fs.writeFile(outputPath, md, 'utf8');
    console.log(`\n📄 Reporte Markdown generado: ${outputPath}`);
}

/**
 * Main
 */
async function main() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║     GENERACIÓN DE RELACIONES INFERIDAS - Aspel CENIT              ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    const resultados = [];
    
    for (const sistema of SISTEMAS) {
        const relaciones = await generarRelacionesSistema(sistema);
        const agregadas = await actualizarOverrides(sistema, relaciones);
        
        resultados.push({
            sistema,
            relaciones,
            agregadas
        });
    }
    
    // Generar reporte
    await generarReporteRelaciones(resultados);
    
    // Resumen final
    console.log(`\n${'='.repeat(70)}`);
    console.log('RESUMEN GLOBAL');
    console.log('='.repeat(70));
    
    const totalRelaciones = resultados.reduce((sum, r) => sum + r.relaciones.length, 0);
    const totalAgregadas = resultados.reduce((sum, r) => sum + r.agregadas, 0);
    
    console.log(`\n🔗 Total relaciones inferidas: ${totalRelaciones}`);
    console.log(`✅ Total agregadas a overrides: ${totalAgregadas}`);
    
    console.log('\n💡 Siguiente paso:');
    console.log('   Ejecutar: node scripts/generar_diccionario_mejorado.js');
    console.log('   Para regenerar diccionarios con las nuevas relaciones\n');
    
    console.log('✨ Generación completada\n');
}

main().catch(err => {
    console.error('❌ Error durante la generación:', err);
    process.exit(1);
});
