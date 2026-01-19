/**
 * Script para probar conexiones a las bases de datos Firebird de Aspel
 */

const { probarConexion } = require('./src/conectores/firebird/pool');
const { RUTAS_DB } = require('./src/conectores/firebird/configuracion');

async function probarConexiones() {
    console.log('🔍 Probando conexiones a bases de datos Aspel Firebird...\n');
    
    const sistemas = Object.keys(RUTAS_DB);
    const resultados = [];
    
    for (const sistema of sistemas) {
        console.log(`📊 Probando ${sistema}...`);
        console.log(`   Ruta: ${RUTAS_DB[sistema]}`);
        
        try {
            const resultado = await probarConexion(sistema);
            console.log(`   ✅ ${sistema}: Conexión exitosa`);
            console.log(`   Resultado test: ${JSON.stringify(resultado.resultado)}\n`);
            resultados.push({ sistema, exito: true });
        } catch (error) {
            console.error(`   ❌ ${sistema}: Error de conexión`);
            console.error(`   Error: ${error.message}\n`);
            resultados.push({ sistema, exito: false, error: error.message });
        }
    }
    
    // Resumen
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN DE CONEXIONES');
    console.log('='.repeat(60));
    
    const exitosas = resultados.filter(r => r.exito).length;
    const fallidas = resultados.filter(r => !r.exito).length;
    
    console.log(`✅ Exitosas: ${exitosas}/${sistemas.length}`);
    console.log(`❌ Fallidas: ${fallidas}/${sistemas.length}\n`);
    
    if (fallidas > 0) {
        console.log('❌ Sistemas con error:');
        resultados.filter(r => !r.exito).forEach(r => {
            console.log(`   - ${r.sistema}: ${r.error}`);
        });
        console.log('\n💡 Verifica:');
        console.log('   1. Que las rutas de las bases de datos sean correctas');
        console.log('   2. Que Firebird esté instalado y el servidor corriendo');
        console.log('   3. Que el usuario SYSDBA y password masterkey sean correctos');
        console.log('   4. Que los archivos .FDB existan y sean accesibles');
    } else {
        console.log('🎉 ¡Todas las conexiones funcionan correctamente!');
        console.log('✅ Puedes usar los datos reales en las métricas');
    }
    
    process.exit(fallidas > 0 ? 1 : 0);
}

// Ejecutar
probarConexiones().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
});
