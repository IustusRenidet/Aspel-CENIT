const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');

const DIR_SEMANTICA = path.join(__dirname, '../diccionario');
const DIR_METRICAS = path.join(__dirname, '../src/semantica/yaml/metricas');
const DIR_OVERRIDES = path.join(__dirname, '../overrides');
const SISTEMAS = ['SAE', 'COI', 'NOI', 'BANCO'];

/**
 * Carga el diccionario semántico de un sistema
 */
async function cargarDiccionario(sistema) {
    const pathSemantica = path.join(DIR_SEMANTICA, `semantica_${sistema}.json`);
    const content = await fs.readFile(pathSemantica, 'utf8');
    return JSON.parse(content);
}

/**
 * Carga las métricas de un sistema
 */
async function cargarMetricas(sistema) {
    const pathMetricas = path.join(DIR_METRICAS, `base_${sistema}.yaml`);
    const content = await fs.readFile(pathMetricas, 'utf8');
    return yaml.load(content);
}

/**
 * Extrae referencias a tablas y campos de una query DuckDB
 */
function extraerReferencias(query) {
    if (!query) return { tablas: new Set(), campos: new Set(), aliases: new Map() };
    
    const referencias = { tablas: new Set(), campos: new Set(), aliases: new Map() };
    
    // Patrones para extraer tablas con sus aliases
    // FROM tabla alias, FROM tabla AS alias, JOIN tabla alias
    const regexFromWithAlias = /(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)\s+(?:AS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi;
    const regexFromSimple = /(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|\s*$|,|\s+INNER|\s+LEFT|\s+RIGHT|\s+ON)/gi;
    
    let match;
    
    // Extraer tablas con alias
    while ((match = regexFromWithAlias.exec(query)) !== null) {
        const tabla = match[1].toUpperCase();
        const alias = match[2].toUpperCase();
        
        // Solo si alias es diferente de palabras clave SQL
        if (!['WHERE', 'GROUP', 'ORDER', 'LIMIT', 'INNER', 'LEFT', 'RIGHT', 'ON', 'AND', 'OR'].includes(alias)) {
            referencias.tablas.add(tabla);
            referencias.aliases.set(alias, tabla);
        }
    }
    
    // Extraer tablas sin alias
    const queryCopia = query.replace(regexFromWithAlias, ''); // Remover las que ya tienen alias
    const regexSinAlias = /(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|\s*$|,|\)|;)/gi;
    while ((match = regexSinAlias.exec(queryCopia)) !== null) {
        referencias.tablas.add(match[1].toUpperCase());
    }
    
    // Campos: resolver aliases a tablas reales
    const regexCampoTabla = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)/g;
    while ((match = regexCampoTabla.exec(query)) !== null) {
        const referencia = match[1].toUpperCase();
        const campo = match[2].toUpperCase();
        
        // Si es un alias, usar la tabla real
        const tablaReal = referencias.aliases.get(referencia) || referencia;
        referencias.tablas.add(tablaReal);
        referencias.campos.add(`${tablaReal}.${campo}`);
    }
    
    return referencias;
}

/**
 * Valida una métrica contra el diccionario
 */
function validarMetrica(metrica, diccionario, sistema) {
    const errores = [];
    const warnings = [];
    
    const query = metrica.query_duckdb;
    if (!query) {
        warnings.push('No tiene query_duckdb definido');
        return { errores, warnings, valida: true };
    }
    
    const referencias = extraerReferencias(query);
    
    // Validar tablas
    for (const tabla of referencias.tablas) {
        // Buscar en el diccionario (puede estar con sufijos 01-12)
        const tablaBase = tabla.replace(/\d{2}$/, '');
        let encontrada = false;
        
        for (const nombreTabla of Object.keys(diccionario.tablas || {})) {
            const nombreBase = nombreTabla.replace(/\d{2}$/, '');
            if (nombreBase === tablaBase || nombreTabla === tabla) {
                encontrada = true;
                break;
            }
        }
        
        if (!encontrada) {
            errores.push(`Tabla no encontrada: ${tabla}`);
        }
    }
    
    // Validar campos (solo si especificaron tabla.campo)
    for (const campoCompleto of referencias.campos) {
        const [tabla, campo] = campoCompleto.split('.');
        const tablaBase = tabla.replace(/\d{2}$/, '');
        
        let encontrado = false;
        for (const [nombreTabla, infoTabla] of Object.entries(diccionario.tablas || {})) {
            const nombreBase = nombreTabla.replace(/\d{2}$/, '');
            if (nombreBase === tablaBase || nombreTabla === tabla) {
                const campos = infoTabla.campos || {};
                if (campos[campo]) {
                    encontrado = true;
                    break;
                }
            }
        }
        
        if (!encontrado) {
            warnings.push(`Campo no encontrado: ${campoCompleto}`);
        }
    }
    
    return {
        errores,
        warnings,
        valida: errores.length === 0
    };
}

/**
 * Valida todas las métricas de un sistema
 */
async function validarSistema(sistema) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`VALIDANDO SISTEMA: ${sistema}`);
    console.log('='.repeat(70));
    
    const diccionario = await cargarDiccionario(sistema);
    const metricas = await cargarMetricas(sistema);
    
    const totalTablas = Object.keys(diccionario.tablas || {}).length;
    const totalMetricas = metricas.metricas?.length || 0;
    
    console.log(`📊 Tablas en diccionario: ${totalTablas}`);
    console.log(`📈 Métricas definidas: ${totalMetricas}`);
    
    const resultados = {
        sistema,
        totalMetricas,
        totalTablas,
        metricasValidas: 0,
        metricasConErrores: 0,
        metricasConWarnings: 0,
        detalles: []
    };
    
    if (!metricas.metricas || metricas.metricas.length === 0) {
        console.log('⚠️  No hay métricas definidas');
        return resultados;
    }
    
    for (const metrica of metricas.metricas) {
        const validacion = validarMetrica(metrica, diccionario, sistema);
        
        if (validacion.valida) {
            resultados.metricasValidas++;
        } else {
            resultados.metricasConErrores++;
        }
        
        if (validacion.warnings.length > 0) {
            resultados.metricasConWarnings++;
        }
        
        if (validacion.errores.length > 0 || validacion.warnings.length > 0) {
            resultados.detalles.push({
                id: metrica.id,
                nombre: metrica.nombre,
                errores: validacion.errores,
                warnings: validacion.warnings
            });
        }
    }
    
    // Mostrar resumen
    console.log(`\n✅ Métricas válidas: ${resultados.metricasValidas} / ${totalMetricas}`);
    console.log(`❌ Métricas con errores: ${resultados.metricasConErrores}`);
    console.log(`⚠️  Métricas con warnings: ${resultados.metricasConWarnings}`);
    
    // Mostrar detalles de errores
    if (resultados.detalles.length > 0) {
        console.log(`\n📋 DETALLES DE PROBLEMAS:\n`);
        for (const detalle of resultados.detalles) {
            console.log(`  🔹 ${detalle.id} - ${detalle.nombre}`);
            
            if (detalle.errores.length > 0) {
                console.log(`     ❌ Errores:`);
                detalle.errores.forEach(err => console.log(`        - ${err}`));
            }
            
            if (detalle.warnings.length > 0) {
                console.log(`     ⚠️  Warnings:`);
                detalle.warnings.forEach(warn => console.log(`        - ${warn}`));
            }
            console.log();
        }
    }
    
    return resultados;
}

/**
 * Valida la cobertura de descripciones
 */
async function validarCobertura(sistema) {
    const pathOverride = path.join(DIR_OVERRIDES, `${sistema}.yaml`);
    const yamlContent = await fs.readFile(pathOverride, 'utf8');
    const overrides = yaml.load(yamlContent);
    
    const tablas = overrides.tablas || {};
    const totalTablas = Object.keys(tablas).length;
    
    let sinDescripcion = 0;
    let descripciones = 0;
    let conModulo = 0;
    let conTags = 0;
    
    for (const [nombre, info] of Object.entries(tablas)) {
        if (!info.descripcion || info.descripcion.trim() === '') {
            sinDescripcion++;
        } else {
            descripciones++;
        }
        
        if (info.modulo && info.modulo !== 'General') {
            conModulo++;
        }
        
        if (info.tags && info.tags.length > 0) {
            conTags++;
        }
    }
    
    return {
        totalTablas,
        descripciones,
        sinDescripcion,
        conModulo,
        conTags,
        porcentajeDescripciones: ((descripciones / totalTablas) * 100).toFixed(1),
        porcentajeModulos: ((conModulo / totalTablas) * 100).toFixed(1),
        porcentajeTags: ((conTags / totalTablas) * 100).toFixed(1)
    };
}

/**
 * Genera reporte HTML
 */
async function generarReporteHTML(resultados, reporteCobertura) {
    const fecha = new Date().toISOString().split('T')[0];
    
    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reporte de Validación del Diccionario - ${fecha}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 { font-size: 32px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .content { padding: 30px; }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .summary-card {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        .summary-card.success { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); }
        .summary-card.warning { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); }
        .summary-card.error { background: linear-gradient(135deg, #ff0844 0%, #ffb199 100%); }
        .summary-card h3 { font-size: 14px; opacity: 0.9; margin-bottom: 10px; }
        .summary-card .number { font-size: 36px; font-weight: bold; }
        .sistema-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .sistema-section h2 {
            color: #667eea;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }
        .stat-item {
            background: white;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        .stat-item .label { font-size: 12px; color: #666; margin-bottom: 5px; }
        .stat-item .value { font-size: 24px; font-weight: bold; color: #333; }
        .problems {
            background: white;
            border-radius: 6px;
            padding: 15px;
            margin-top: 15px;
        }
        .problem-item {
            padding: 10px;
            margin-bottom: 10px;
            border-left: 4px solid #ff6b6b;
            background: #fff5f5;
            border-radius: 4px;
        }
        .problem-item.warning { border-left-color: #ffa500; background: #fff9f0; }
        .problem-item h4 { color: #333; margin-bottom: 8px; }
        .problem-item ul { margin-left: 20px; margin-top: 5px; }
        .problem-item li { margin: 3px 0; color: #666; }
        .cobertura-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .cobertura-table th, .cobertura-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e0e0e0;
        }
        .cobertura-table th {
            background: #667eea;
            color: white;
            font-weight: 600;
        }
        .cobertura-table tr:hover { background: #f8f9fa; }
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
        }
        .badge.success { background: #d4edda; color: #155724; }
        .badge.warning { background: #fff3cd; color: #856404; }
        .badge.error { background: #f8d7da; color: #721c24; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Reporte de Validación del Diccionario</h1>
            <p>Generado el ${new Date().toLocaleString('es-MX')}</p>
        </div>
        
        <div class="content">`;
    
    // Resumen global
    const totalMetricas = resultados.reduce((sum, r) => sum + r.totalMetricas, 0);
    const totalValidas = resultados.reduce((sum, r) => sum + r.metricasValidas, 0);
    const totalErrores = resultados.reduce((sum, r) => sum + r.metricasConErrores, 0);
    const totalWarnings = resultados.reduce((sum, r) => sum + r.metricasConWarnings, 0);
    
    html += `
            <div class="summary">
                <div class="summary-card">
                    <h3>Total Métricas</h3>
                    <div class="number">${totalMetricas}</div>
                </div>
                <div class="summary-card success">
                    <h3>Métricas Válidas</h3>
                    <div class="number">${totalValidas}</div>
                </div>
                <div class="summary-card error">
                    <h3>Con Errores</h3>
                    <div class="number">${totalErrores}</div>
                </div>
                <div class="summary-card warning">
                    <h3>Con Warnings</h3>
                    <div class="number">${totalWarnings}</div>
                </div>
            </div>`;
    
    // Detalles por sistema
    for (const resultado of resultados) {
        const porcentajeValidas = ((resultado.metricasValidas / resultado.totalMetricas) * 100).toFixed(1);
        
        html += `
            <div class="sistema-section">
                <h2>Sistema ${resultado.sistema}</h2>
                
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="label">Tablas</div>
                        <div class="value">${resultado.totalTablas}</div>
                    </div>
                    <div class="stat-item">
                        <div class="label">Métricas</div>
                        <div class="value">${resultado.totalMetricas}</div>
                    </div>
                    <div class="stat-item">
                        <div class="label">Válidas</div>
                        <div class="value" style="color: #00b894;">${resultado.metricasValidas}</div>
                    </div>
                    <div class="stat-item">
                        <div class="label">Tasa Éxito</div>
                        <div class="value" style="color: ${porcentajeValidas >= 90 ? '#00b894' : '#ff6b6b'};">${porcentajeValidas}%</div>
                    </div>
                </div>`;
        
        // Problemas
        if (resultado.detalles.length > 0) {
            html += `<div class="problems"><h3>⚠️ Problemas Detectados</h3>`;
            
            for (const detalle of resultado.detalles) {
                const clase = detalle.errores.length > 0 ? 'problem-item' : 'problem-item warning';
                html += `
                    <div class="${clase}">
                        <h4>${detalle.id} - ${detalle.nombre}</h4>`;
                
                if (detalle.errores.length > 0) {
                    html += `<strong>❌ Errores:</strong><ul>`;
                    detalle.errores.forEach(err => {
                        html += `<li>${err}</li>`;
                    });
                    html += `</ul>`;
                }
                
                if (detalle.warnings.length > 0) {
                    html += `<strong>⚠️ Warnings:</strong><ul>`;
                    detalle.warnings.forEach(warn => {
                        html += `<li>${warn}</li>`;
                    });
                    html += `</ul>`;
                }
                
                html += `</div>`;
            }
            
            html += `</div>`;
        } else {
            html += `<div class="problems"><p style="color: #00b894; font-weight: 600;">✅ Todas las métricas son válidas</p></div>`;
        }
        
        html += `</div>`;
    }
    
    // Tabla de cobertura
    html += `
            <div class="sistema-section">
                <h2>📈 Cobertura del Diccionario</h2>
                <table class="cobertura-table">
                    <thead>
                        <tr>
                            <th>Sistema</th>
                            <th>Total Tablas</th>
                            <th>Con Descripción</th>
                            <th>Con Módulo</th>
                            <th>Con Tags</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    for (const [sistema, cobertura] of Object.entries(reporteCobertura)) {
        html += `
                        <tr>
                            <td><strong>${sistema}</strong></td>
                            <td>${cobertura.totalTablas}</td>
                            <td><span class="badge success">${cobertura.porcentajeDescripciones}%</span> (${cobertura.descripciones})</td>
                            <td><span class="badge ${cobertura.porcentajeModulos >= 80 ? 'success' : 'warning'}">${cobertura.porcentajeModulos}%</span> (${cobertura.conModulo})</td>
                            <td><span class="badge ${cobertura.porcentajeTags >= 70 ? 'success' : 'warning'}">${cobertura.porcentajeTags}%</span> (${cobertura.conTags})</td>
                        </tr>`;
    }
    
    html += `
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="footer">
            <p>Generado por scripts/validar_diccionario.js - Aspel-CENIT</p>
        </div>
    </div>
</body>
</html>`;
    
    const outputPath = path.join(__dirname, '../reporte_validacion_diccionario.html');
    await fs.writeFile(outputPath, html, 'utf8');
    console.log(`\n📄 Reporte HTML generado: ${outputPath}`);
    
    return outputPath;
}

/**
 * Main
 */
async function main() {
    console.log('\n');
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║     VALIDACIÓN DEL DICCIONARIO DE DATOS - Aspel CENIT             ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    
    const resultados = [];
    const reporteCobertura = {};
    
    for (const sistema of SISTEMAS) {
        const resultado = await validarSistema(sistema);
        resultados.push(resultado);
        
        const cobertura = await validarCobertura(sistema);
        reporteCobertura[sistema] = cobertura;
    }
    
    // Resumen final
    console.log(`\n${'='.repeat(70)}`);
    console.log('RESUMEN GLOBAL');
    console.log('='.repeat(70));
    
    const totalMetricas = resultados.reduce((sum, r) => sum + r.totalMetricas, 0);
    const totalValidas = resultados.reduce((sum, r) => sum + r.metricasValidas, 0);
    const totalErrores = resultados.reduce((sum, r) => sum + r.metricasConErrores, 0);
    const totalWarnings = resultados.reduce((sum, r) => sum + r.metricasConWarnings, 0);
    
    console.log(`\n📊 Total métricas definidas: ${totalMetricas}`);
    console.log(`✅ Métricas válidas: ${totalValidas} (${((totalValidas/totalMetricas)*100).toFixed(1)}%)`);
    console.log(`❌ Métricas con errores: ${totalErrores}`);
    console.log(`⚠️  Métricas con warnings: ${totalWarnings}`);
    
    // Generar reporte HTML
    await generarReporteHTML(resultados, reporteCobertura);
    
    console.log('\n✨ Validación completada\n');
    
    // Retornar código de salida
    process.exit(totalErrores > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Error durante la validación:', err);
    process.exit(1);
});
