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
    if (id.includes('clientes_sin_compras') || id.includes('inactivos')) {
        return [{ valor: 85 + Math.floor(Math.random() * 50) }];
    }
    if (id.includes('productos_mas_rentables')) {
        return [
            { codigo: 'ART001', producto: 'Producto Premium A', precio: 5600, costo: 3200, margen: 2400, margen_porcentaje: 42.86 },
            { codigo: 'ART002', producto: 'Producto Premium B', precio: 4800, costo: 2900, margen: 1900, margen_porcentaje: 39.58 },
            { codigo: 'ART003', producto: 'Producto Premium C', precio: 3900, costo: 2400, margen: 1500, margen_porcentaje: 38.46 },
            { codigo: 'ART004', producto: 'Producto Premium D', precio: 6200, costo: 4100, margen: 2100, margen_porcentaje: 33.87 },
            { codigo: 'ART005', producto: 'Producto Premium E', precio: 2800, costo: 1900, margen: 900, margen_porcentaje: 32.14 }
        ];
    }
    if (id.includes('ventas_por_familia') || id.includes('familia')) {
        return [
            { familia: 'Electrónica', productos: 145, existencia_total: 2340, valor_inventario: 3450000 },
            { familia: 'Ferretería', productos: 320, existencia_total: 5680, valor_inventario: 2890000 },
            { familia: 'Papelería', productos: 210, existencia_total: 8920, valor_inventario: 1560000 },
            { familia: 'Hogar', productos: 180, existencia_total: 1240, valor_inventario: 1340000 },
            { familia: 'Deportes', productos: 95, existencia_total: 890, valor_inventario: 980000 }
        ];
    }
    if (id.includes('comparativo') || id.includes('crecimiento_anual')) {
        return [{ valor: 12.5 + Math.random() * 15 }];
    }
    if (id.includes('devolucion') || id.includes('tasa')) {
        return [{ valor: 2.5 + Math.random() * 3 }];
    }
    if (id.includes('pedidos_pendientes')) {
        return [{ valor: 15 + Math.floor(Math.random() * 25) }];
    }
    if (id.includes('ticket_promedio')) {
        return [{ valor: 3500 + Math.random() * 2000 }];
    }
    if (id.includes('clientes_top_crecimiento')) {
        return [
            { nombre: 'Comercializadora ABC', compras_recientes: 245000, compras_anteriores: 180000, crecimiento: 65000 },
            { nombre: 'Distribuidora XYZ', compras_recientes: 198000, compras_anteriores: 145000, crecimiento: 53000 },
            { nombre: 'Mayorista DEF', compras_recientes: 167000, compras_anteriores: 125000, crecimiento: 42000 },
            { nombre: 'Tiendas GHI', compras_recientes: 134000, compras_anteriores: 98000, crecimiento: 36000 },
            { nombre: 'Supermercados JKL', compras_recientes: 156000, compras_anteriores: 125000, crecimiento: 31000 }
        ];
    }
    if (id.includes('descuento')) {
        return [{ valor: 45000 + Math.random() * 30000 }];
    }
    if (id.includes('porcentaje_descuento')) {
        return [{ valor: 3.5 + Math.random() * 4 }];
    }
    if (id.includes('baja_rotacion')) {
        return [
            { codigo: 'ART150', producto: 'Artículo Obsoleto A', existencia: 145, valor_inmovilizado: 43500 },
            { codigo: 'ART289', producto: 'Artículo Obsoleto B', existencia: 98, valor_inmovilizado: 38220 },
            { codigo: 'ART412', producto: 'Artículo Obsoleto C', existencia: 72, valor_inmovilizado: 28800 },
            { codigo: 'ART567', producto: 'Artículo Obsoleto D', existencia: 54, valor_inmovilizado: 21600 },
            { codigo: 'ART634', producto: 'Artículo Obsoleto E', existencia: 38, valor_inmovilizado: 15200 }
        ];
    }
    if (id.includes('ventas_por_vendedor') && !id.includes('eficiencia')) {
        return [
            { codigo: 'V001', vendedor: 'Juan Pérez', facturas: 145, total: 456000, ticket_promedio: 3145 },
            { codigo: 'V002', vendedor: 'María García', facturas: 132, total: 398000, ticket_promedio: 3015 },
            { codigo: 'V003', vendedor: 'Carlos López', facturas: 118, total: 345000, ticket_promedio: 2924 },
            { codigo: 'V004', vendedor: 'Ana Martínez', facturas: 95, total: 287000, ticket_promedio: 3021 },
            { codigo: 'V005', vendedor: 'Luis Rodríguez', facturas: 87, total: 245000, ticket_promedio: 2816 }
        ];
    }
    if (id.includes('eficiencia_vendedores')) {
        return [
            { codigo: 'V001', vendedor: 'Juan Pérez', ventas_reales: 456000, objetivo: 400000, porcentaje_objetivo: 114.0 },
            { codigo: 'V002', vendedor: 'María García', ventas_reales: 398000, objetivo: 380000, porcentaje_objetivo: 104.7 },
            { codigo: 'V003', vendedor: 'Carlos López', ventas_reales: 345000, objetivo: 350000, porcentaje_objetivo: 98.6 },
            { codigo: 'V005', vendedor: 'Luis Rodríguez', ventas_reales: 245000, objetivo: 300000, porcentaje_objetivo: 81.7 },
            { codigo: 'V004', vendedor: 'Ana Martínez', ventas_reales: 287000, objetivo: 400000, porcentaje_objetivo: 71.8 }
        ];
    }
    if (id.includes('tiempo_promedio_cobro') || id.includes('tiempo') && id.includes('cobro')) {
        return [{ valor: 35 + Math.floor(Math.random() * 20) }];
    }
    if (id.includes('precio_desactualizado')) {
        return [{ valor: 78 + Math.floor(Math.random() * 40) }];
    }
    if (id.includes('mermas')) {
        return [{ valor: 8500 + Math.random() * 15000 }];
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
    
    // BANCO - Métricas de tesorería
    if (id.includes('cuentas_activas')) {
        return [{ valor: 5 + Math.floor(Math.random() * 4) }];
    }
    if (id.includes('movimientos_por_tipo')) {
        return [
            { tipo: 'Ingresos', cantidad: 125, total: 2450000 },
            { tipo: 'Egresos', cantidad: 158, total: 2180000 }
        ];
    }
    if (id.includes('flujo_semanal')) {
        const semanas = [];
        for (let i = 4; i > 0; i--) {
            semanas.push({
                semana: 52 - i,
                movimientos: 65 + Math.floor(Math.random() * 30),
                ingresos: 580000 + Math.random() * 220000,
                egresos: 520000 + Math.random() * 180000,
                neto: 60000 + Math.random() * 40000
            });
        }
        return semanas;
    }
    if (id.includes('cheques_emitidos')) {
        return [{ valor: 45 + Math.floor(Math.random() * 25) }];
    }
    if (id.includes('transferencias_mes')) {
        return [{ valor: 85 + Math.floor(Math.random() * 40) }];
    }
    if (id.includes('saldo_minimo')) {
        return [
            { cuenta: '0125-4589', nombre: 'BBVA Operativa', saldo: 125000 },
            { cuenta: '0456-7821', nombre: 'Santander Nómina', saldo: 185000 },
            { cuenta: '0789-1234', nombre: 'Banorte Pagos', saldo: 220000 },
            { cuenta: '0321-6547', nombre: 'HSBC Servicios', saldo: 285000 },
            { cuenta: '0654-9873', nombre: 'Scotiabank USD', saldo: 340000 }
        ];
    }
    if (id.includes('dias_efectivo')) {
        return [{ valor: 35 + Math.floor(Math.random() * 30) }];
    }
    if (id.includes('conciliaciones_pendientes')) {
        return [
            { cuenta: '0125-4589', nombre: 'BBVA Operativa', pendientes: 12, importe_total: 245000 },
            { cuenta: '0456-7821', nombre: 'Santander Nómina', pendientes: 8, importe_total: 180000 },
            { cuenta: '0789-1234', nombre: 'Banorte Pagos', pendientes: 5, importe_total: 95000 }
        ];
    }
    if (id.includes('ingresos_vs_egresos')) {
        const meses = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mes = fecha.toISOString().substring(0, 7);
            const ingresos = 2200000 + Math.random() * 600000;
            const egresos = 1900000 + Math.random() * 500000;
            meses.push({
                mes,
                ingresos,
                egresos,
                diferencia: ingresos - egresos
            });
        }
        return meses;
    }
    if (id.includes('comisiones')) {
        return [{ valor: 3500 + Math.random() * 4500 }];
    }
    
    // COI - Métricas de contabilidad
    if (id.includes('utilidad_neta')) {
        return [{ valor: 125000 + Math.random() * 150000 }];
    }
    if (id.includes('ingresos_totales')) {
        return [{ valor: 850000 + Math.random() * 350000 }];
    }
    if (id.includes('gastos_operativos')) {
        return [{ valor: 380000 + Math.random() * 180000 }];
    }
    if (id.includes('costo_ventas')) {
        return [{ valor: 290000 + Math.random() * 150000 }];
    }
    if (id.includes('margen_operativo')) {
        return [{ valor: 15 + Math.random() * 20 }];
    }
    if (id.includes('apalancamiento')) {
        return [{ valor: 0.35 + Math.random() * 0.4 }];
    }
    if (id.includes('bancos_disponible')) {
        return [{ valor: 450000 + Math.random() * 550000 }];
    }
    if (id.includes('cuentas_por_cobrar') && !id.includes('rotacion')) {
        return [{ valor: 680000 + Math.random() * 420000 }];
    }
    if (id.includes('cuentas_por_pagar')) {
        return [{ valor: 520000 + Math.random() * 380000 }];
    }
    if (id.includes('rotacion_cuentas_cobrar')) {
        return [{ valor: 35 + Math.floor(Math.random() * 25) }];
    }
    if (id.includes('movimientos_mes_actual')) {
        return [{ valor: 420 + Math.floor(Math.random() * 280) }];
    }
    if (id.includes('polizas_sin_cuadrar')) {
        return [{ valor: Math.floor(Math.random() * 3) }];
    }
    if (id.includes('cuentas_nivel_mayor')) {
        return [
            { cuenta: '1', nombre: 'ACTIVO', saldo: 2450000 },
            { cuenta: '2', nombre: 'PASIVO', saldo: 980000 },
            { cuenta: '3', nombre: 'CAPITAL', saldo: 1470000 },
            { cuenta: '4', nombre: 'INGRESOS', saldo: 1250000 },
            { cuenta: '5', nombre: 'GASTOS OPERACION', saldo: 450000 },
            { cuenta: '6', nombre: 'COSTO DE VENTAS', saldo: 380000 }
        ];
    }
    if (id.includes('distribucion_gastos')) {
        return [
            { categoria: '501', cuentas: 12, total: 185000 },
            { categoria: '502', cuentas: 8, total: 145000 },
            { categoria: '601', cuentas: 15, total: 220000 },
            { categoria: '602', cuentas: 10, total: 160000 },
            { categoria: '503', cuentas: 6, total: 95000 }
        ];
    }
    if (id.includes('antigüedad_polizas') || id.includes('polizas_por_mes')) {
        const meses = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mes = fecha.toISOString().substring(0, 7);
            meses.push({
                mes,
                polizas: 45 + Math.floor(Math.random() * 30),
                ingresos: 15 + Math.floor(Math.random() * 10),
                egresos: 18 + Math.floor(Math.random() * 12),
                diario: 12 + Math.floor(Math.random() * 8)
            });
        }
        return meses;
    }
    
    // NOI - Métricas de nómina
    if (id.includes('empleados_activos')) {
        return [{ valor: 180 + Math.floor(Math.random() * 120) }];
    }
    if (id.includes('promedio_percepciones')) {
        return [{ valor: 12000 + Math.random() * 8000 }];
    }
    if (id.includes('promedio_deducciones')) {
        return [{ valor: 2500 + Math.random() * 1500 }];
    }
    if (id.includes('ratio_percepcion_deduccion')) {
        return [{ valor: 4.5 + Math.random() * 1.5 }];
    }
    if (id.includes('costo_mensual_promedio')) {
        return [{ valor: 2450000 + Math.random() * 850000 }];
    }
    if (id.includes('top_departamentos_costo')) {
        return [
            { departamento: 'Producción', empleados: 45, total_nomina: 680000, promedio: 15111 },
            { departamento: 'Administración', empleados: 28, total_nomina: 520000, promedio: 18571 },
            { departamento: 'Ventas', empleados: 35, total_nomina: 485000, promedio: 13857 },
            { departamento: 'Almacén', empleados: 22, total_nomina: 310000, promedio: 14091 },
            { departamento: 'Sistemas', empleados: 12, total_nomina: 285000, promedio: 23750 }
        ];
    }
    if (id.includes('distribucion_salarios')) {
        return [
            { rango_salarial: 'Menos de $5,000', empleados: 18, total: 72000 },
            { rango_salarial: '$5,000 - $10,000', empleados: 65, total: 487500 },
            { rango_salarial: '$10,000 - $15,000', empleados: 82, total: 1025000 },
            { rango_salarial: '$15,000 - $20,000', empleados: 45, total: 787500 },
            { rango_salarial: 'Más de $20,000', empleados: 28, total: 672000 }
        ];
    }
    if (id.includes('empleados_por_departamento')) {
        return [
            { departamento: 'Producción', empleados: 85 },
            { departamento: 'Ventas', empleados: 52 },
            { departamento: 'Administración', empleados: 38 },
            { departamento: 'Almacén', empleados: 32 },
            { departamento: 'Sistemas', empleados: 18 },
            { departamento: 'Mantenimiento', empleados: 15 }
        ];
    }
    if (id.includes('nominas_por_mes')) {
        const meses = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const fecha = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const mes = fecha.toISOString().substring(0, 7);
            meses.push({
                mes,
                registros: 220 + Math.floor(Math.random() * 60),
                percepciones: 2800000 + Math.random() * 500000,
                deducciones: 580000 + Math.random() * 120000,
                neto: 2220000 + Math.random() * 400000
            });
        }
        return meses;
    }
    if (id.includes('horas_extra_totales')) {
        return [{ valor: 850 + Math.floor(Math.random() * 350) }];
    }
    if (id.includes('costo_horas_extra')) {
        return [{ valor: 125000 + Math.random() * 75000 }];
    }
    if (id.includes('salarios_minimos')) {
        return [{ valor: 12 + Math.floor(Math.random() * 25) }];
    }
    if (id.includes('ausentismo')) {
        return [{ valor: 25 + Math.floor(Math.random() * 45) }];
    }
    if (id.includes('aguinaldo_estimado')) {
        return [{ valor: 3500000 + Math.random() * 1500000 }];
    }
    if (id.includes('indemnizaciones')) {
        return [{ valor: Math.random() * 250000 }];
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
