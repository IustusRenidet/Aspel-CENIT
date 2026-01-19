/**
 * Script para probar conexiones a bases de datos Firebird de Aspel
 */

const { probarConexion, cerrarConexiones, ejecutarConsulta } = require('../src/conectores/firebird/conexion');

async function probarConexiones() {
    console.log('🔍 Probando conexiones a bases de datos Aspel...\n');
    
    const sistemas = ['SAE', 'COI', 'NOI', 'BANCO'];
    
    for (const sistema of sistemas) {
        console.log(`📊 Probando ${sistema}...`);
        const resultado = await probarConexion(sistema);
        
        if (resultado.exito) {
            console.log(`✅ ${resultado.mensaje}\n`);
        } else {
            console.log(`❌ Error: ${resultado.mensaje}\n`);
        }
    }
    
    // Probar consulta simple en SAE
    console.log('📊 Probando consulta en SAE (conteo de clientes)...');
    try {
        const clientes = await ejecutarConsulta('SAE', 'SELECT COUNT(*) as total FROM CLIE01');
        console.log(`✅ Total de clientes: ${clientes[0].TOTAL}\n`);
    } catch (error) {
        console.log(`❌ Error: ${error.message}\n`);
    }
    
    // Cerrar conexiones
    await cerrarConexiones();
    console.log('✅ Prueba completada');
}

probarConexiones().catch(console.error);
