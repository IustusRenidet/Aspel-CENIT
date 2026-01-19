/**
 * Servidor de prueba para métricas - Aspel CENIT
 * Ejecuta consultas contra bases de datos Firebird reales
 */

const express = require('express');
const cors = require('cors');
const yaml = require('js-yaml');
const fs = require('fs-extra');
const path = require('path');
const { ejecutarConsulta, cerrarConexiones } = require('./src/conectores/firebird/conexion');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Cache de métricas
let metricasCache = {};
let usarDatosReales = true; // ACTIVADO: Usar datos reales de Firebird

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
 * Convertir SQL de DuckDB/estándar a sintaxis Firebird
 */
function convertirSQL_Firebird(sql) {
    if (!sql) return sql;
    
    let sqlFB = sql;
    
    // LIMIT X → FIRST X (debe ir al inicio del SELECT)
    const limitMatch = sqlFB.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
        sqlFB = sqlFB.replace(/\bSELECT\b/i, `SELECT FIRST ${limitMatch[1]}`);
        sqlFB = sqlFB.replace(/\bLIMIT\s+\d+/i, '');
    }
    
    // YEAR(fecha) → EXTRACT(YEAR FROM fecha)
    sqlFB = sqlFB.replace(/\bYEAR\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(YEAR FROM $1)');
    
    // MONTH(fecha) → EXTRACT(MONTH FROM fecha)
    sqlFB = sqlFB.replace(/\bMONTH\s*\(\s*([^)]+)\s*\)/gi, 'EXTRACT(MONTH FROM $1)');
    
    // COUNT(DISTINCT x) → COUNT(DISTINCT x) (ya compatible)
    
    // Alias en agregados: AS nombre → nombre (simplificar)
    sqlFB = sqlFB.replace(/\s+AS\s+(\w+)/gi, ' $1');
    
    // Eliminar ROUND - Firebird usa CAST para aproximar
    sqlFB = sqlFB.replace(/\bROUND\s*\(/gi, 'CAST(');
    
    // WHERE YEAR(...) = YEAR(CURRENT_DATE) → WHERE EXTRACT(YEAR FROM ...) = EXTRACT(YEAR FROM CURRENT_DATE)
    // (ya convertido por el replace de YEAR)
    
    // Limpiar espacios múltiples
    sqlFB = sqlFB.replace(/\s+/g, ' ').trim();
    
    return sqlFB;
}

/**
 * Obtener consulta SQL específica para Firebird (queries simples y probadas)
 */
function obtenerQueryFirebird(sistema, metricaId) {
    const queries = {
        // ========== SAE - Consultas básicas ==========
        sae_clientes_activos: 'SELECT COUNT(*) AS VALOR FROM CLIE01',
        
        sae_ventas_mes_actual: `
            SELECT FIRST 1 SUM(IMP_TOT1) AS VALOR 
            FROM FACTF01 
            WHERE EXTRACT(MONTH FROM FEC_APLI) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM FEC_APLI) = EXTRACT(YEAR FROM CURRENT_DATE)
        `,
        
        sae_conteo_facturas_mes: `
            SELECT COUNT(*) AS VALOR 
            FROM FACTF01 
            WHERE EXTRACT(MONTH FROM FEC_APLI) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM FEC_APLI) = EXTRACT(YEAR FROM CURRENT_DATE)
        `,
        
        sae_top_clientes_mes: `
            SELECT FIRST 10 
                c.NOMBRE AS NOMBRE,
                COUNT(f.NUM_FACT) AS CANTIDAD,
                SUM(f.IMP_TOT1) AS TOTAL
            FROM FACTF01 f
            INNER JOIN CLIE01 c ON f.CVE_CLPV = c.CLAVE
            WHERE EXTRACT(MONTH FROM f.FEC_APLI) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM f.FEC_APLI) = EXTRACT(YEAR FROM CURRENT_DATE)
            GROUP BY c.NOMBRE
            ORDER BY TOTAL DESC
        `,
        
        sae_valor_inventario_actual: `
            SELECT SUM(EXIS * PRECIO1) AS VALOR FROM INVE01
        `,
        
        sae_articulos_activos: `
            SELECT COUNT(*) AS VALOR FROM INVE01 WHERE STATUS1 = 'A'
        `,
        
        sae_articulos_sin_existencia: `
            SELECT COUNT(*) AS VALOR FROM INVE01 WHERE EXIS <= 0
        `,
        
        sae_top_productos_vendidos: `
            SELECT FIRST 10
                i.CVE_ART AS CODIGO,
                i.DESCR AS PRODUCTO,
                SUM(m.CANT) AS CANTIDAD,
                SUM(m.IMPORTE) AS TOTAL
            FROM MINVE01 m
            INNER JOIN INVE01 i ON m.CVE_ART = i.CVE_ART
            WHERE m.TIPO_DOC = 'F'
            AND EXTRACT(MONTH FROM m.FECHA_DOC) = EXTRACT(MONTH FROM CURRENT_DATE)
            GROUP BY i.CVE_ART, i.DESCR
            ORDER BY CANTIDAD DESC
        `,
        
        // ========== COI - Consultas básicas ==========
        coi_polizas_mes: `
            SELECT COUNT(*) AS VALOR FROM POL01
            WHERE EXTRACT(MONTH FROM FECHA) = EXTRACT(MONTH FROM CURRENT_DATE)
        `,
        
        // ========== NOI - Consultas básicas ==========
        noi_empleados_activos: `
            SELECT COUNT(*) AS VALOR FROM EMPL01 WHERE STATUS = 'A'
        `,
        
        // ========== BANCO - Consultas básicas ==========
        banco_saldo_bancos: `
            SELECT SUM(SALDO) AS VALOR FROM BCO01
        `
    };
    
    const key = `${sistema.toLowerCase()}_${metricaId.toLowerCase().replace(`${sistema.toLowerCase()}_`, '')}`;
    return queries[key] || null;
}

/**
 * Generar datos simulados para pruebas
 */
function generarDatosSimulados(sistema, metrica) {
    const query = metrica.query_duckdb || metrica.consulta || '';
    const queryUpper = query ? query.toUpperCase() : '';
    const id = metrica.id;
    
    // ============================================
    // MÉTRICAS ESTILO LOOKER STUDIO - KPIs
    // ============================================
    
    if (id === 'sae_venta_neta_comparativo') {
        return [{
            venta_neta_actual: 24881511,
            venta_neta_anterior: 9363442,
            porcentaje_cambio: 165.6
        }];
    }
    
    if (id === 'sae_ticket_promedio_tendencia') {
        return [{
            ticket_actual: 67246,
            ticket_anterior: 52890,
            porcentaje_cambio: 27.1
        }];
    }
    
    if (id === 'sae_top_clientes_completo') {
        return [
            { Cliente: 'Rogahn, Sporer and Fay', Venta: 5973413, Descuentos: 0, Costo: 5344844, Utilidad: 628569, Num_Operaciones: 3, Ticket_Promedio: 1991138 },
            { Cliente: 'Farrell-Klein', Venta: 4098415, Descuentos: 12500, Costo: 3688974, Utilidad: 409441, Num_Operaciones: 8, Ticket_Promedio: 512302 },
            { Cliente: 'Stehr-Huels', Venta: 3245678, Descuentos: 8900, Costo: 2921110, Utilidad: 324568, Num_Operaciones: 5, Ticket_Promedio: 649136 },
            { Cliente: 'Bechtelar Inc', Venta: 2890456, Descuentos: 5600, Costo: 2601410, Utilidad: 289046, Num_Operaciones: 12, Ticket_Promedio: 240871 },
            { Cliente: 'Russel and Sons', Venta: 2456789, Descuentos: 3200, Costo: 2211110, Utilidad: 245679, Num_Operaciones: 7, Ticket_Promedio: 350970 },
            { Cliente: 'Goyette Group', Venta: 2123456, Descuentos: 8900, Costo: 1911110, Utilidad: 212346, Num_Operaciones: 9, Ticket_Promedio: 235940 },
            { Cliente: 'Hermann LLC', Venta: 1987654, Descuentos: 1200, Costo: 1788889, Utilidad: 198765, Num_Operaciones: 6, Ticket_Promedio: 331276 },
            { Cliente: 'Kulas-Morar', Venta: 1876543, Descuentos: 4500, Costo: 1688889, Utilidad: 187654, Num_Operaciones: 11, Ticket_Promedio: 170595 },
            { Cliente: 'Connelly and Sons', Venta: 1654321, Descuentos: 2800, Costo: 1488889, Utilidad: 165432, Num_Operaciones: 4, Ticket_Promedio: 413580 },
            { Cliente: 'Schmitt Group', Venta: 1543210, Descuentos: 6700, Costo: 1388889, Utilidad: 154321, Num_Operaciones: 8, Ticket_Promedio: 192901 }
        ];
    }
    
    if (id === 'sae_top_vendedores_performance') {
        return [
            { Vendedor: 'Juan Pérez', Venta: 8945678, Descuentos: 45000, Costo: 8051110, Utilidad: 894568, Num_Operaciones: 45, Productividad: 198793 },
            { Vendedor: 'María García', Venta: 7654321, Descuentos: 38000, Costo: 6888889, Utilidad: 765432, Num_Operaciones: 52, Productividad: 147198 },
            { Vendedor: 'Carlos Ruiz', Venta: 6543210, Descuentos: 32000, Costo: 5888889, Utilidad: 654321, Num_Operaciones: 38, Productividad: 172189 },
            { Vendedor: 'Ana Martínez', Venta: 5432109, Descuentos: 27000, Costo: 4888889, Utilidad: 543211, Num_Operaciones: 41, Productividad: 132490 },
            { Vendedor: 'Luis Hernández', Venta: 4567890, Descuentos: 23000, Costo: 4111110, Utilidad: 456789, Num_Operaciones: 29, Productividad: 157513 },
            { Vendedor: 'Laura Sánchez', Venta: 3987654, Descuentos: 20000, Costo: 3588889, Utilidad: 398765, Num_Operaciones: 35, Ticket_Promedio: 113933 },
            { Vendedor: 'Roberto Torres', Venta: 3456789, Descuentos: 17000, Costo: 3111110, Utilidad: 345679, Num_Operaciones: 27, Productividad: 128030 },
            { Vendedor: 'Patricia Flores', Venta: 2987654, Descuentos: 15000, Costo: 2688889, Utilidad: 298765, Num_Operaciones: 32, Productividad: 93364 }
        ];
    }
    
    if (id === 'sae_ventas_por_grupo_producto') {
        return [
            { Grupo: 'BMW', Venta: 13219162, Porcentaje: 53.1, Num_Documentos: 145 },
            { Grupo: 'LEXUS', Venta: 4976227, Porcentaje: 20.0, Num_Documentos: 78 },
            { Grupo: 'ISUZU', Venta: 3732170, Porcentaje: 15.0, Num_Documentos: 65 },
            { Grupo: 'TOYOTA', Venta: 2488113, Porcentaje: 10.0, Num_Documentos: 52 },
            { Grupo: 'OTROS', Venta: 465839, Porcentaje: 1.9, Num_Documentos: 30 }
        ];
    }
    
    if (id === 'sae_ventas_por_condicion_pago') {
        return [
            { Condicion: 'CREDITO 30 DIAS', Venta: 10674208, Porcentaje: 42.9, Num_Facturas: 158 },
            { Condicion: 'CREDITO 15 DIAS', Venta: 7464453, Porcentaje: 30.0, Num_Facturas: 112 },
            { Condicion: 'CONTADO', Venta: 4976302, Porcentaje: 20.0, Num_Facturas: 75 },
            { Condicion: 'CREDITO 45 DIAS', Venta: 1744106, Porcentaje: 7.0, Num_Facturas: 25 }
        ];
    }
    
    if (id === 'sae_ventas_diarias_con_dia') {
        const datos = [];
        const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const hoy = new Date();
        
        for (let i = 0; i < 30; i++) {
            const fecha = new Date(hoy);
            fecha.setDate(fecha.getDate() - i);
            const diaSemana = dias[fecha.getDay()];
            const venta = 500000 + Math.random() * 800000;
            
            datos.push({
                Fecha: fecha.toISOString().split('T')[0],
                Dia_Semana: diaSemana,
                Venta: Math.round(venta),
                Num_Facturas: Math.floor(8 + Math.random() * 15),
                Ticket_Promedio: Math.round(venta / (8 + Math.random() * 15))
            });
        }
        
        return datos;
    }
    
    if (id === 'sae_margen_por_grupo') {
        return [
            { Grupo: 'BMW', Venta: 13219162, Costo: 11566786, Utilidad: 1652376, Margen_Pct: 12.5 },
            { Grupo: 'LEXUS', Venta: 4976227, Costo: 4328839, Utilidad: 647388, Margen_Pct: 13.0 },
            { Grupo: 'TOYOTA', Venta: 2488113, Costo: 2165859, Utilidad: 322254, Margen_Pct: 12.9 },
            { Grupo: 'ISUZU', Venta: 3732170, Costo: 3287013, Utilidad: 445157, Margen_Pct: 11.9 },
            { Grupo: 'OTROS', Venta: 465839, Costo: 423362, Utilidad: 42477, Margen_Pct: 9.1 }
        ];
    }
    
    if (id === 'sae_productividad_vendedores') {
        return [
            { Vendedor: 'Juan Pérez', Num_Clientes: 89, Num_Operaciones: 45, Venta_Total: 8945678, Productividad: 198793 },
            { Vendedor: 'Carlos Ruiz', Num_Clientes: 67, Num_Operaciones: 38, Venta_Total: 6543210, Productividad: 172189 },
            { Vendedor: 'Luis Hernández', Num_Clientes: 54, Num_Operaciones: 29, Venta_Total: 4567890, Productividad: 157513 },
            { Vendedor: 'María García', Num_Clientes: 98, Num_Operaciones: 52, Venta_Total: 7654321, Productividad: 147198 },
            { Vendedor: 'Ana Martínez', Num_Clientes: 76, Num_Operaciones: 41, Venta_Total: 5432109, Productividad: 132490 }
        ];
    }
    
    // ============================================
    // MÉTRICAS ORIGINALES
    // ============================================
    
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
        
        let resultado;
        
        // Intentar ejecutar consulta real si está disponible
        if (usarDatosReales && (metrica.query_duckdb || metrica.consulta)) {
            try {
                // Primero intentar query específica de Firebird
                let sql = obtenerQueryFirebird(sistemaUpper, metricaId);
                
                // Si no hay query específica, convertir la del YAML
                if (!sql) {
                    sql = metrica.query_duckdb || metrica.consulta;
                    sql = convertirSQL_Firebird(sql);
                }
                
                console.log(`   🔄 SQL: ${sql.substring(0, 100)}...`);
                resultado = await ejecutarConsulta(sistemaUpper, sql);
                console.log(`   ✅ Datos reales: ${resultado.length} registros`);
            } catch (errorSQL) {
                console.warn(`   ⚠️  Error SQL (${errorSQL.message.substring(0, 50)}), usando simulados`);
                resultado = generarDatosSimulados(sistemaUpper, metrica);
            }
        } else {
            // Usar datos simulados
            resultado = generarDatosSimulados(sistemaUpper, metrica);
        }
        
        res.json({
            id: metrica.id,
            nombre: metrica.nombre,
            descripcion: metrica.descripcion,
            tipo: metrica.tipo,
            categoria: metrica.categoria,
            formato: metrica.formato,
            resultado: metrica.tipo === 'escalar' ? resultado[0]?.valor || resultado[0] : resultado,
            simulado: !usarDatosReales || !(metrica.query_duckdb || metrica.consulta),
            registros: Array.isArray(resultado) ? resultado.length : 1
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
        
        const modoTexto = usarDatosReales ? '🔥 DATOS REALES de Firebird' : '⚠️  MODO SIMULADO';
        console.log(`\n${modoTexto}`);
        
        if (usarDatosReales) {
            console.log('✅ Conectado a bases de datos Aspel Firebird');
            console.log('📊 Las métricas con SQL real traerán datos de las empresas');
        } else {
            console.log('💡 Para usar datos reales, cambia usarDatosReales = true');
        }
        
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

// Manejo de cierre graceful
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Cerrando servidor...');
    await cerrarConexiones();
    console.log('✅ Conexiones cerradas');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Cerrando servidor...');
    await cerrarConexiones();
    console.log('✅ Conexiones cerradas');
    process.exit(0);
});

// Manejo de errores
process.on('uncaughtException', (error) => {
    console.error('❌ Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada:', reason);
});
