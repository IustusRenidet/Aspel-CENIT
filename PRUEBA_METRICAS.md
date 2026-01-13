# 🚀 Prueba de Métricas - Aspel CENIT

## ✅ Completado

### 1. **48 Métricas Creadas** (100% validadas)

#### SAE (24 métricas)
- **Ventas**: mes actual, anual consolidado, ticket promedio, conteo facturas, ventas por mes
- **Clientes**: activos, nuevos, top 10, inactivos 90+ días
- **Inventarios**: valor total, artículos activos/sin existencia/bajo mínimo, movimientos, top productos, rotación
- **Vendedores**: top 10 del mes
- **Compras**: total mes, top proveedores
- **CxC**: saldo total, vencidas, clientes con saldo, días promedio
- **Rentabilidad**: margen utilidad bruta

#### COI (8 métricas)
- **Contabilidad**: pólizas del año, movimientos, cuentas en catálogo
- **Reportes**: balance activos, capital contable, pasivos totales
- **Indicadores**: razón de liquidez, pólizas por tipo

#### NOI (7 métricas)
- **Nómina**: registros, total acumulado, promedio neto, percepciones, deducciones
- **Organización**: departamentos activos, costo por departamento

#### BANCO (9 métricas)
- **Tesorería**: saldo total, movimientos mes, ingresos, egresos, flujo neto
- **Análisis**: saldo por cuenta, cheques pendientes, cuenta mayor saldo, promedio transacciones

### 2. **Servidor de Prueba** (`servidor_prueba.js`)
- ✅ Express API en puerto 3000
- ✅ CORS habilitado
- ✅ Carga automática de métricas desde YAML
- ✅ Modo simulado con datos realistas
- ✅ Endpoints REST:
  - `GET /api/health` - Estado del servidor
  - `GET /api/metricas/:sistema` - Listar métricas
  - `GET /api/metricas/:sistema/:metricaId` - Ejecutar métrica

### 3. **Página de Prueba** (`prueba_metricas.html`)
- ✅ Dashboard interactivo con gradientes modernos
- ✅ 4 tarjetas para SAE, COI, NOI, BANCO
- ✅ Carga automática de métricas principales
- ✅ Renderizado de valores escalares y tablas
- ✅ Formato de moneda, porcentajes y cantidades
- ✅ Estados de carga, éxito y error

---

## 🎯 Cómo Usar

### Iniciar Servidor
```bash
cd "c:\Users\Frida Sophia\Desktop\Aspel-CENIT"
node servidor_prueba.js
```

### Abrir Página de Prueba
```bash
Start-Process "c:\Users\Frida Sophia\Desktop\Aspel-CENIT\prueba_metricas.html"
```

O directamente en el navegador:
```
file:///c:/Users/Frida%20Sophia/Desktop/Aspel-CENIT/prueba_metricas.html
```

### Probar API Manualmente
```bash
# Health check
curl http://localhost:3000/api/health

# Listar métricas de SAE
curl http://localhost:3000/api/metricas/SAE

# Ejecutar métrica específica
curl http://localhost:3000/api/metricas/SAE/sae_ventas_mes_actual
```

---

## 📊 Ejemplos de Respuesta

### Métrica Escalar (Ventas)
```json
{
  "id": "sae_ventas_mes_actual",
  "nombre": "Ventas del Mes Actual",
  "descripcion": "Total de facturas del mes en curso",
  "tipo": "escalar",
  "categoria": "ventas",
  "formato": {
    "decimales": 2,
    "prefijo": "$"
  },
  "resultado": 1560600.45,
  "simulado": true
}
```

### Métrica Tabla (Top Clientes)
```json
{
  "id": "sae_top_clientes_mes",
  "nombre": "Top 10 Clientes del Mes",
  "tipo": "tabla",
  "resultado": [
    {"nombre": "Cliente A", "cantidad": 45, "total": 125000},
    {"nombre": "Cliente B", "cantidad": 38, "total": 98000}
  ],
  "simulado": true
}
```

---

## 🔧 Validación

Todas las métricas fueron validadas con el script:

```bash
node scripts/validar_diccionario.js
```

**Resultado:**
- ✅ 48 métricas definidas
- ✅ 48 métricas válidas (100.0%)
- ❌ 0 métricas con errores
- ⚠️ 6 warnings (campos opcionales)

---

## 📝 Próximos Pasos

### Para Usar Datos Reales:
1. Instalar extensión Firebird en DuckDB
2. Verificar rutas de bases de datos Aspel:
   - `C:\ASPEL\SAE\EMPRESA1\DATOS01.FDB`
   - `C:\ASPEL\COI\EMPRESA1\DATOS24.FDB`
   - `C:\ASPEL\NOI\EMPRESA1\DATOS01.FDB`
   - `C:\ASPEL\BANCO\EMPRESA1\DATOS01.FDB`
3. Activar conexión Firebird en `servidor_prueba.js`

### Mejoras Futuras:
- ✨ Agregar gráficas (Chart.js)
- 📅 Selector de rango de fechas
- 💾 Cache de resultados
- 🔐 Autenticación
- 📱 Responsive design mejorado
- ⚡ WebSockets para actualización en tiempo real

---

## 📸 Pantalla de Prueba

La página `prueba_metricas.html` muestra:
- **Header**: Título con gradiente morado
- **Controles**: Botones de Cargar y Limpiar + Estado
- **4 Tarjetas**:
  - 📊 SAE (Ventas) - 5 métricas principales
  - 💰 COI (Contabilidad) - 4 métricas principales
  - 👥 NOI (Nómina) - 4 métricas principales
  - 🏦 BANCO (Tesorería) - 4 métricas principales

Cada métrica muestra:
- Nombre descriptivo
- Valor con formato ($ para moneda, % para porcentajes)
- Tablas con scroll horizontal para datos tabulares

---

## 🎨 Stack Tecnológico

- **Backend**: Node.js + Express
- **Frontend**: HTML5 + CSS3 + Vanilla JavaScript
- **Datos**: YAML (métricas) + JSON (diccionario)
- **Validación**: Script custom de parsing SQL
- **API**: REST con CORS

---

¡Todo listo para probar! 🎉
