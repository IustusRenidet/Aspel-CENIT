/**
 * Servidor de prueba para métricas - Aspel CENIT
 * Ejecuta consultas DuckDB contra bases de datos Firebird reales
 */

const express = require('express');
const cors = require('cors');
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Cache de métricas
let metricasCache = {};

/**
 * Cargar métricas desde archivos YAML
 */
async function cargarMetricas() {
    const sistemas = ['SAE', 'COI', 'NOI', 'BANCO'];
    
    for (const sistema of sistemas) {
        try {
            const rutaMetricas = path.join(__dirname, `src/semantica/yaml/metricas/base_${sistema}.yaml`);
            const contenido = await fs.readFile(rutaMetricas, 'utf8');
            const data = yaml.load(contenido);
            
            metricasCache[sistema] = data.metricas || [];
            console.log(`✅ Cargadas ${metricasCache[sistema].length} métricas de ${sistema}`);
        } catch (error) {
            console.error(`❌ Error cargando métricas de ${sistema}:`, error.message);
            metricasCache[sistema] = [];
        }
    }
}

/**
 * Generar datos simulados para pruebas
 */
function generarDatosSimulados(sistema, metrica) {
    const queryUpper = metrica.query_duckdb.toUpperCase();
    const id = metrica.id;
    
    // Datos específicos por métrica para mayor realismo
    if (id.includes('ventas_mes')) {
        return [{ valor: 1250000 + Math.random() * 500000 }];
    }
    if (id.includes('clientes_activos')) {
        return [{ valor: 450 + Math.floor(Math.random() * 200) }];
    }
    if (id.includes('inventario')) {
        return [{ valor: 2500000 + Math.random() * 1000000 }];
    }
    if (id.includes('articulos_activos')) {
        return [{ valor: 1200 + Math.floor(Math.random() * 500) }];
    }
    if (id.includes('cxc')) {
        return [{ valor: 850000 + Math.random() * 300000 }];
    }
    if (id.includes('top_clientes') || id.includes('top_productos')) {
        return [
            { nombre: 'Cliente/Producto A', cantidad: 45, total: 125000 },
            { nombre: 'Cliente/Producto B', cantidad: 38, total: 98000 },
            { nombre: 'Cliente/Producto C', cantidad: 32, total: 87000 },
            { nombre: 'Cliente/Producto D', cantidad: 28, total: 76000 },
            { nombre: 'Cliente/Producto E', cantidad: 25, total: 65000 }
        ];
    }
    if (id.includes('margen')) {
        return [{ valor: 25 + Math.random() * 15 }];
    }
    if (id.includes('dias')) {
        return [{ valor: 30 + Math.floor(Math.random() * 30) }];
    }
    if (id.includes('polizas')) {
        return [{ valor: 180 + Math.floor(Math.random() * 100) }];
    }
    if (id.includes('balance') || id.includes('capital') || id.includes('pasivo')) {
        return [{ valor: 5000000 + Math.random() * 3000000 }];
    }
    if (id.includes('nomina')) {
        return [{ valor: 450000 + Math.random() * 200000 }];
    }
    if (id.includes('departamentos') || id.includes('registros')) {
        return [{ valor: 12 + Math.floor(Math.random() * 8) }];
    }
    if (id.includes('banco') && id.includes('saldo')) {
        return [{ valor: 1500000 + Math.random() * 800000 }];
    }
    if (id.includes('movimientos')) {
        return [{ valor: 280 + Math.floor(Math.random() * 150) }];
    }
    
    // Genéricos
    if (queryUpper.includes('COUNT(*)')) {
        return [{ valor: Math.floor(Math.random() * 500) + 50 }];
    }
    if (queryUpper.includes('SUM') && queryUpper.includes('IMPORTE')) {
        return [{ valor: Math.floor(Math.random() * 1000000) + 100000 }];
    }
    if (queryUpper.includes('AVG')) {
        return [{ valor: Math.floor(Math.random() * 5000) + 1000 }];
    }
    
    return [{ valor: Math.floor(Math.random() * 100000) }];
}

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Servidor de métricas activo',
        modo: 'simulado',
        sistemas: ['SAE', 'COI', 'NOI', 'BANCO'],
        metricasCargadas: Object.keys(metricasCache).reduce((acc, k) => acc + metricasCache[k].length, 0)
    });
});

/**
 * Obtener todas las métricas de un sistema
 */
app.get('/api/metricas/:sistema', (req, res) => {
    const { sistema } = req.params;
    const sistemaUpper = sistema.toUpperCase();
    
    if (!metricasCache[sistemaUpper]) {
        return res.status(404).json({ error: 'Sistema no encontrado' });
    }
    
    res.json({
        sistema: sistemaUpper,
        metricas: metricasCache[sistemaUpper].map(m => ({
            id: m.id,
            nombre: m.nombre,
            categoria: m.categoria,
            tipo: m.tipo
        }))
    });
});

/**
 * Ejecutar una métrica específica
 */
app.get('/api/metricas/:sistema/:metricaId', async (req, res) => {
    const { sistema, metricaId } = req.params;
    const sistemaUpper = sistema.toUpperCase();
    
    if (!metricasCache[sistemaUpper]) {
        return res.status(404).json({ error: 'Sistema no encontrado' });
    }
    
    const metrica = metricasCache[sistemaUpper].find(m => m.id === metricaId);
    
    if (!metrica) {
        return res.status(404).json({ error: 'Métrica no encontrada' });
    }
    
    try {
        console.log(`📊 Ejecutando ${sistema}/${metricaId}...`);
        const resultado = generarDatosSimulados(sistemaUpper, metrica);
        
        res.json({
            id: metrica.id,
            nombre: metrica.nombre,
            descripcion: metrica.descripcion,
            tipo: metrica.tipo,
            categoria: metrica.categoria,
            formato: metrica.formato,
            resultado: metrica.tipo === 'escalar' ? resultado[0]?.valor : resultado,
            simulado: true
        });
    } catch (error) {
        console.error(`❌ Error ejecutando ${metricaId}:`, error);
        res.status(500).json({ 
            error: 'Error ejecutando métrica',
            mensaje: error.message 
        });
    }
});

/**
 * Iniciar servidor
 */
async function iniciar() {
    try {
        console.log('🚀 Iniciando servidor de métricas...\n');
        
        // Cargar métricas
        await cargarMetricas();
        
        console.log('\n⚠️  MODO SIMULADO: Usando datos de prueba generados aleatoriamente');
        console.log('💡 Para usar datos reales, conecta DuckDB con extensión Firebird\n');
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`\n✅ Servidor escuchando en http://localhost:${PORT}`);
            console.log(`\n📊 API disponible:`);
            console.log(`   GET /api/health - Estado del servidor`);
            console.log(`   GET /api/metricas/:sistema - Listar métricas`);
            console.log(`   GET /api/metricas/:sistema/:metricaId - Ejecutar métrica\n`);
            console.log(`💡 Abre prueba_metricas.html en tu navegador para probar\n`);
        });
        
    } catch (error) {
        console.error('❌ Error iniciando servidor:', error);
        process.exit(1);
    }
}

// Iniciar
iniciar();

// Manejo de errores
process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada:', reason);
});
