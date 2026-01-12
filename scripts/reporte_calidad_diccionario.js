const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');

const DIR_OVERRIDES = path.join(__dirname, '../overrides');
const SISTEMAS = ['SAE', 'COI', 'NOI', 'BANCO'];

async function generarReporte() {
    console.log('='.repeat(70));
    console.log('REPORTE DE CALIDAD DEL DICCIONARIO');
    console.log('='.repeat(70));
    
    for (const sistema of SISTEMAS) {
        const pathOverride = path.join(DIR_OVERRIDES, `${sistema}.yaml`);
        const yamlContent = await fs.readFile(pathOverride, 'utf8');
        const overrides = yaml.load(yamlContent);
        
        const tablas = overrides.tablas || {};
        const totalTablas = Object.keys(tablas).length;
        
        let contadores = {
            conDescripcionReal: 0,
            generica: 0,
            conModuloAsignado: 0,
            conTags: 0,
            tipoDesconocido: 0
        };
        
        for (const [nombre, info] of Object.entries(tablas)) {
            // Descripción
            const desc = info.descripcion || '';
            if (desc && !desc.includes('Tabla de sistema') && !desc.includes('Tabla de operaciones')) {
                contadores.conDescripcionReal++;
            } else {
                contadores.generica++;
            }
            
            // Módulo
            if (info.modulo && info.modulo !== 'General') {
                contadores.conModuloAsignado++;
            }
            
            // Tags
            if (info.tags && info.tags.length > 0) {
                contadores.conTags++;
            }
            
            // Tipo
            if (info.tipo_negocio === 'Desconocido') {
                contadores.tipoDesconocido++;
            }
        }
        
        console.log(`\n### ${sistema} ###`);
        console.log(`Total de tablas: ${totalTablas}`);
        console.log(`Descripciones reales: ${contadores.conDescripcionReal} (${Math.round(contadores.conDescripcionReal/totalTablas*100)}%)`);
        console.log(`Descripciones genéricas: ${contadores.generica} (${Math.round(contadores.generica/totalTablas*100)}%)`);
        console.log(`Con módulo específico: ${contadores.conModuloAsignado} (${Math.round(contadores.conModuloAsignado/totalTablas*100)}%)`);
        console.log(`Con tags: ${contadores.conTags} (${Math.round(contadores.conTags/totalTablas*100)}%)`);
        console.log(`Tipo desconocido: ${contadores.tipoDesconocido} (${Math.round(contadores.tipoDesconocido/totalTablas*100)}%)`);
    }
    
    console.log('\n' + '='.repeat(70));
}

generarReporte().catch(console.error);
