# Métricas Estilo Looker Studio - Aspel CENIT

## 🎯 Resumen de Cambios

Se han agregado **9 nuevas métricas tipo Looker Studio** al sistema SAE, diseñadas para proporcionar insights de alto nivel con comparativos y visualizaciones avanzadas.

### Total de Métricas por Sistema:
- **SAE**: 48 métricas (incluye 9 nuevas tipo Looker)
- **COI**: 23 métricas
- **NOI**: 22 métricas  
- **BANCO**: 19 métricas
- **TOTAL**: 112 métricas

## 🆕 Nuevas Métricas Tipo Looker Studio

### 1. **Venta Neta con Comparativo**
- **ID**: `sae_venta_neta_comparativo`
- **Categoría**: KPI
- **Descripción**: Venta neta del periodo actual vs mismo periodo año anterior
- **Visualización**: KPI Card con porcentaje y flecha (↑↓)
- **Ejemplo**: 
  - Venta actual: $24,881,511
  - VS año pasado: ↑ 165.6%

### 2. **Ticket Promedio con Tendencia**
- **ID**: `sae_ticket_promedio_tendencia`
- **Categoría**: KPI
- **Descripción**: Ticket promedio actual con comparativo vs periodo anterior
- **Visualización**: KPI Card con indicador de tendencia
- **Ejemplo**:
  - Ticket actual: $67,246
  - VS año pasado: ↑ 27.1%

### 3. **Top Clientes - Performance Completo**
- **ID**: `sae_top_clientes_completo`
- **Categoría**: Performance
- **Descripción**: Top 20 clientes con métricas completas de performance
- **Columnas**:
  - Cliente
  - Venta
  - Descuentos
  - Costo
  - Utilidad
  - Núm. Operaciones
  - Ticket Promedio
- **Visualización**: Tabla performance con formato de moneda

### 4. **Top Vendedores - Performance**
- **ID**: `sae_top_vendedores_performance`
- **Categoría**: Performance
- **Descripción**: Top 15 vendedores con métricas de productividad
- **Columnas**:
  - Vendedor
  - Venta
  - Descuentos
  - Costo
  - Utilidad
  - Núm. Operaciones
  - Productividad (venta/operación)
- **Visualización**: Tabla performance

### 5. **Ventas por Grupo de Producto**
- **ID**: `sae_ventas_por_grupo_producto`
- **Categoría**: Breakdown
- **Descripción**: Distribución de ventas por grupos con porcentajes
- **Visualización**: Tabla con barras de porcentaje y gráfica de pie
- **Ejemplo**:
  - BMW: 53.1% ($13,219,162)
  - LEXUS: 20.0% ($4,976,227)
  - ISUZU: 15.0% ($3,732,170)

### 6. **Ventas por Condición de Pago**
- **ID**: `sae_ventas_por_condicion_pago`
- **Categoría**: Breakdown
- **Descripción**: Distribución por tipo de pago con porcentajes
- **Visualización**: Tabla con barras de porcentaje
- **Ejemplo**:
  - CREDITO 30 DIAS: 42.9%
  - CREDITO 15 DIAS: 30.0%
  - CONTADO: 20.0%

### 7. **Ventas Diarias con Día de Semana**
- **ID**: `sae_ventas_diarias_con_dia`
- **Categoría**: Temporal
- **Descripción**: Ventas de los últimos 30 días incluyendo nombre del día
- **Columnas**:
  - Fecha
  - Día Semana (Lunes, Martes, etc.)
  - Venta
  - Núm. Facturas
  - Ticket Promedio
- **Visualización**: Tabla temporal con día de semana

### 8. **Margen por Grupo de Producto**
- **ID**: `sae_margen_por_grupo`
- **Categoría**: Rentabilidad
- **Descripción**: Análisis de margen por grupo de productos
- **Columnas**:
  - Grupo
  - Venta
  - Costo
  - Utilidad
  - Margen %
- **Visualización**: Tabla con porcentaje de margen

### 9. **Productividad de Vendedores**
- **ID**: `sae_productividad_vendedores`
- **Categoría**: KPI
- **Descripción**: Métricas de productividad por vendedor
- **Columnas**:
  - Vendedor
  - Núm. Clientes
  - Núm. Operaciones
  - Venta Total
  - Productividad (venta/operación)
- **Visualización**: Tabla KPI

## 🎨 Mejoras Visuales Implementadas

### 1. **Tarjetas KPI con Comparativos**
```css
.kpi-card {
    background: white;
    border-radius: 16px;
    padding: 25px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.12);
}

.kpi-value {
    font-size: 3em;
    font-weight: 700;
    color: #1a1a1a;
}

.kpi-comparison {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 1.1em;
    font-weight: 600;
}

.kpi-comparison.positive { color: #10b981; } /* Verde */
.kpi-comparison.negative { color: #ef4444; } /* Rojo */
```

### 2. **Tablas Breakdown con Barras Visuales**
- Barras de progreso mostrando porcentajes
- Colores gradientes (púrpura #667eea → #764ba2)
- Porcentajes destacados en color

### 3. **Flechas de Tendencia**
- ↑ Flecha verde para tendencias positivas
- ↓ Flecha roja para tendencias negativas
- Tamaño destacado (1.5em)

## 🔧 Correcciones Técnicas

### Problema de Visualización de Tablas - RESUELTO ✅

**Síntoma**: El contenido de las celdas de tabla no era visible

**Causas identificadas**:
1. Conflicto con gradiente de fondo del body
2. Color de texto no forzado explícitamente
3. Falta de especificidad en estilos CSS

**Solución aplicada**:
```css
.table-result td {
    background: white !important;
    color: #000 !important;
    font-size: 0.95em;
    font-weight: 400;
}

.table-result tbody {
    background: white;
}

.table-result tr:hover td {
    background: #f0f0f0 !important;
    color: #000 !important;
}
```

**Estilos inline en JavaScript**:
```javascript
td.style.backgroundColor = 'white';
td.style.color = '#000';
td.style.padding = '12px';
```

## 📊 Datos Simulados

Cada métrica incluye datos simulados realistas basados en el dashboard de Looker Studio de referencia:

### Ejemplo - Venta Neta:
```javascript
{
    venta_neta_actual: 24881511,
    venta_neta_anterior: 9363442,
    porcentaje_cambio: 165.6
}
```

### Ejemplo - Top Clientes:
```javascript
[
    { 
        Cliente: 'Rogahn, Sporer and Fay', 
        Venta: 5973413, 
        Descuentos: 0, 
        Costo: 5344844, 
        Utilidad: 628569, 
        Num_Operaciones: 3, 
        Ticket_Promedio: 1991138 
    },
    // ... más clientes
]
```

### Ejemplo - Breakdown por Grupo:
```javascript
[
    { Grupo: 'BMW', Venta: 13219162, Porcentaje: 53.1, Num_Documentos: 145 },
    { Grupo: 'LEXUS', Venta: 4976227, Porcentaje: 20.0, Num_Documentos: 78 },
    { Grupo: 'ISUZU', Venta: 3732170, Porcentaje: 15.0, Num_Documentos: 65 }
]
```

## 🚀 Cómo Usar

### 1. Iniciar el Servidor
```bash
cd "c:\Users\Frida Sophia\Desktop\Aspel-CENIT"
node servidor_prueba.js
```

### 2. Abrir el Dashboard
Abre en tu navegador:
```
c:\Users\Frida Sophia\Desktop\Aspel-CENIT\prueba_metricas.html
```

### 3. Navegar por las Métricas
1. Selecciona el sistema **SAE** en las pestañas
2. Haz clic en **"Cargar Todas las Métricas"**
3. Las nuevas métricas Looker Style aparecerán con:
   - KPI Cards grandes con comparativos
   - Tablas breakdown con barras visuales
   - Flechas de tendencia (↑↓)
   - Porcentajes destacados

## 📁 Archivos Modificados

### 1. `src/semantica/yaml/metricas/base_SAE.yaml`
- Agregadas 9 nuevas métricas tipo Looker Studio
- Total: 48 métricas en SAE

### 2. `servidor_prueba.js`
- Función `generarDatosSimulados()` actualizada
- 9 generadores de datos para nuevas métricas
- Datos realistas basados en referencia Looker Studio

### 3. `prueba_metricas.html`
- Nuevos estilos CSS para KPI cards
- Estilos para tablas breakdown con barras
- Lógica de renderizado para comparativos
- Corrección de visibilidad de tablas (!important)

## 🎯 Características Looker Studio Implementadas

✅ **KPI Cards** con valores grandes y comparativos
✅ **Flechas de tendencia** (↑ positivo, ↓ negativo)
✅ **Porcentajes VS año pasado**
✅ **Tablas Breakdown** con barras visuales
✅ **Porcentajes destacados** en color púrpura
✅ **Tablas Performance** con múltiples columnas
✅ **Día de semana** en ventas temporales
✅ **Margen porcentual** con cálculos de rentabilidad
✅ **Productividad** por vendedor (venta/operación)
✅ **Color coding** (verde para positivo, rojo para negativo)

## 🔄 Próximos Pasos Sugeridos

1. **Conectar con Datos Reales**: Implementar conexión DuckDB + Firebird
2. **Drill-Down**: Agregar capacidad de click para ver detalles
3. **Filtros Temporales**: Selector de periodo (mes, trimestre, año)
4. **Exportar**: Botón para exportar a Excel/PDF
5. **Alertas**: Notificaciones cuando métricas caen bajo umbral
6. **Comparativos Múltiples**: Mes vs mes, trimestre vs trimestre
7. **Gráficas Avanzadas**: Sparklines en tablas, heat maps
8. **Segmentación**: Filtros por zona, vendedor, grupo de producto

## 📞 Soporte

Para más información sobre las métricas o personalización del dashboard, consulta:
- `docs/diccionario.md`
- `Documentacion/layout_json.md`
- `Documentacion/widgets.md`

---

**Versión**: 2.0.0  
**Última actualización**: 2026-01-13  
**Total de métricas**: 112 (48 SAE + 23 COI + 22 NOI + 19 BANCO)
