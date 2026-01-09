# Capa Semántica y Diccionario - CENIT ASP

## 📋 Descripción

Este módulo implementa la **capa semántica completa** para CENIT ASP, incluyendo:

- **Diccionarios técnicos**: Catálogos consolidados de tablas, campos, índices y relaciones
- **Inferencias semánticas**: Clasificación automática de tablas, identificación de campos clave y tags de negocio
- **Métricas base**: Definición declarativa de métricas en YAML para cada sistema Aspel
- **Validador YAML**: Validación de estructura y sintaxis de archivos de métricas
- **Cargador**: Sistema de carga con caché de archivos YAML
- **Resolvedor**: Motor de ejecución de métricas con soporte para DuckDB

## 🗂️ Estructura de Archivos

```
src/semantica/
├── constructor_diccionario.js  # Construye diccionarios técnicos desde metadata
├── inferencias.js             # Motor de inferencias semánticas
├── validador_yaml.js          # Validador con JSON Schema (AJV)
├── cargador_yaml.js           # Cargador con sistema de caché
├── resolvedor_metricas.js     # Resolvedor y ejecutor de métricas
├── generar_todo.js           # Script maestro de generación
└── yaml/
    ├── metricas/
    │   ├── base_SAE.yaml     # 20+ métricas de ventas, inventarios, CxC, CxP
    │   ├── base_COI.yaml     # 20+ métricas contables y financieras
    │   ├── base_BANCO.yaml   # 15+ métricas bancarias y conciliación
    │   └── base_NOI.yaml     # 20+ métricas de nómina y RRHH
    ├── catalogo/             # (Futuro) Catálogos semánticos
    └── paneles_plantilla/    # (Futuro) Plantillas de dashboards
```

## 🚀 Uso Rápido

### 1. Generar Todo (Proceso Completo)

```bash
node src/semantica/generar_todo.js
```

Este comando ejecuta:
1. ✅ Construcción de diccionarios técnicos (4 sistemas)
2. ✅ Inferencia de semántica
3. ✅ Validación de métricas YAML
4. ✅ Pruebas de cargador y resolvedor
5. ✅ Generación de reporte

**Salida:**
- `diccionario/catalogo_tecnico_<SISTEMA>.json`
- `diccionario/semantica_<SISTEMA>.json`
- `reporte_generacion_semantica.json`

---

### 2. Uso Individual de Módulos

#### Constructor de Diccionario

```javascript
const ConstructorDiccionario = require('./src/semantica/constructor_diccionario');

const constructor = new ConstructorDiccionario();

// Construir diccionario de SAE
const diccionario = await constructor.construirDiccionarioTecnico('SAE');

// Guardar
await constructor.guardarDiccionario('SAE', diccionario, 'diccionario');

// O todos los sistemas
await constructor.construirTodos('diccionario');
```

**Salida ejemplo:**
```json
{
  "sistema": "SAE",
  "version": "1.0.0",
  "estadisticas": {
    "total_tablas": 203,
    "total_campos": 3990,
    "total_indices": 479,
    "total_constraints": 544,
    "total_fks": 0
  },
  "tablas": {
    "FACTF01": {
      "nombre": "FACTF01",
      "es_vista": false,
      "campos": [...],
      "indices": [...],
      "constraints": [...],
      "fks": [...]
    }
  }
}
```

---

#### Motor de Inferencias

```javascript
const MotorInferencias = require('./src/semantica/inferencias');
const inferencias = new MotorInferencias();

// Inferir semántica desde diccionario técnico
const semantica = await inferencias.inferirSemantica(diccionario);

// Guardar
await inferencias.guardarSemantica('SAE', semantica, 'diccionario');
```

**Salida ejemplo:**
```json
{
  "sistema": "SAE",
  "tablas": {
    "FACTF01": {
      "tipo_inferido": "movimiento",
      "campos_clave": {
        "fechas": ["FECHA_DOC", "FECHA_VENC"],
        "importes": ["IMPORTE", "IMP_NETO", "DESCUENTO"],
        "estatus": ["STATUS"],
        "claves": ["CVE_CLIE", "CVE_FACT", "FOLIO"]
      },
      "pk_probable": { "campos": ["FACTURA"], "origen": "indice_pk" },
      "tags": ["ventas"],
      "complejidad": { "score": 38 }
    }
  },
  "ranking": [
    { "tabla": "FACTF01", "score": 38, "tipo": "movimiento", "tags": ["ventas"] }
  ]
}
```

---

#### Validador YAML

```javascript
const ValidadorYAML = require('./src/semantica/validador_yaml');
const validador = new ValidadorYAML();

// Validar un archivo
const resultado = await validador.validarArchivo('src/semantica/yaml/metricas/base_SAE.yaml');

console.log(resultado);
// {
//   valido: true,
//   errores: [],
//   advertencias: [],
//   metricas_encontradas: 20
// }

// Validar directorio completo
const resultados = await validador.validarDirectorio('src/semantica/yaml/metricas');
const reporte = validador.generarReporte(resultados);
console.log(reporte);
```

**Ejecutar desde terminal:**
```bash
node src/semantica/validador_yaml.js
```

---

#### Cargador YAML

```javascript
const CargadorYAML = require('./src/semantica/cargador_yaml');
const cargador = new CargadorYAML();

// Cargar métricas de SAE
const metricasSAE = await cargador.cargarMetricas('SAE');

// Cargar todas las métricas
const todasMetricas = await cargador.cargarTodasMetricas();

// Buscar métrica específica
const metrica = await cargador.buscarMetrica('sae_ventas_netas_mes');
console.log(metrica.nombre); // "Ventas Netas del Mes"

// Listar métricas por filtros
const metricasVentas = await cargador.listarMetricas({ 
  sistema: 'SAE', 
  categoria: 'ventas' 
});

// Obtener categorías
const categorias = await cargador.obtenerCategorias();
console.log(categorias);
// ['ventas', 'inventarios', 'cxc', 'cxp', 'compras', ...]

// Limpiar caché
cargador.limpiarCache();
```

---

#### Resolvedor de Métricas

```javascript
const ResolvedorMetricas = require('./src/semantica/resolvedor_metricas');
const resolvedor = new ResolvedorMetricas();

// Configurar DuckDB (opcional, si no se configura usa modo demo)
// resolvedor.configurarDuckDB(duckdbConnection);

// Resolver métrica simple
const resultado = await resolvedor.resolver('sae_ventas_netas_mes');

console.log(resultado);
// {
//   metrica_id: 'sae_ventas_netas_mes',
//   nombre: 'Ventas Netas del Mes',
//   tipo: 'escalar',
//   datos: {
//     valor: 123456.78,
//     valor_formateado: '$123,456.78',
//     unidad: 'moneda'
//   }
// }

// Resolver con parámetros
const topClientes = await resolvedor.resolver('sae_top_clientes', {
  fecha_inicio: '2026-01-01',
  fecha_fin: '2026-01-31',
  limite: 20
});

// Resolver múltiples métricas en paralelo
const resultados = await resolvedor.resolverVarias([
  { id: 'sae_ventas_netas_mes' },
  { id: 'coi_polizas_mes', parametros: { periodo: 202601 } },
  { id: 'ban_saldo_total' }
]);
```

---

## 📊 Métricas Disponibles

### SAE (20 métricas)

**Ventas:**
- `sae_ventas_netas_mes` - Total de ventas del mes
- `sae_ticket_promedio` - Ticket promedio
- `sae_ventas_por_dia` - Serie de ventas diarias
- `sae_ventas_por_mes` - Comparativo mensual (12 meses)
- `sae_top_clientes` - Top 20 clientes

**Inventarios:**
- `sae_valor_inventario` - Valor total a costo promedio
- `sae_articulos_bajo_minimo` - Artículos con stock crítico
- `sae_top_articulos_vendidos` - Artículos más vendidos
- `sae_rotacion_inventario` - Ratio de rotación

**CxC:**
- `sae_saldo_cxc` - Saldo total por cobrar
- `sae_cxc_vencidas` - Cuentas vencidas
- `sae_antiguedad_saldos` - Antigüedad por rangos

**CxP:**
- `sae_saldo_cxp` - Saldo total por pagar
- `sae_cxp_vencidas` - Cuentas vencidas

**Compras:**
- `sae_compras_mes` - Total de compras
- `sae_top_proveedores` - Top 10 proveedores

**Operación:**
- `sae_documentos_cancelados_hoy` - Documentos cancelados
- `sae_facturas_pendientes_timbrar` - Facturas sin CFDI

---

### COI (20 métricas)

**Pólizas:**
- `coi_polizas_mes` - Total de pólizas
- `coi_polizas_pendientes` - Pólizas sin afectar
- `coi_polizas_descuadradas` - Pólizas con diferencia

**Reportes:**
- `coi_balanza_mes` - Balanza de comprobación
- `coi_suma_balanza` - Suma de cargos/abonos

**Estados Financieros:**
- `coi_utilidad_mes` - Resultado del periodo
- `coi_activo_total` - Total de activos
- `coi_pasivo_total` - Total de pasivos
- `coi_capital_contable` - Capital + resultados

**Bancos:**
- `coi_saldo_bancos` - Saldo en cuentas bancarias
- `coi_movimientos_bancarios_mes` - Movimientos registrados
- `coi_cheques_pendientes` - Cheques sin cobrar
- `coi_conciliacion_pendiente` - Cuentas sin conciliar

**Análisis:**
- `coi_cuentas_mayor_movimiento` - Top 20 cuentas
- `coi_auxiliar_cuenta` - Movimientos de cuenta

**Ratios:**
- `coi_ratio_liquidez` - Activo circulante / Pasivo circulante
- `coi_ratio_endeudamiento` - Pasivo / Activo

**Auditoría:**
- `coi_periodos_abiertos` - Periodos sin cerrar

---

### BANCO (15 métricas)

**Saldos:**
- `ban_saldo_total` - Saldo en todas las cuentas
- `ban_saldo_por_banco` - Distribución por institución
- `ban_flujo_efectivo_mes` - Entradas menos salidas

**Movimientos:**
- `ban_movimientos_mes` - Total de movimientos
- `ban_depositos_vs_retiros` - Comparativa
- `ban_movimientos_por_dia` - Flujo diario

**Cheques:**
- `ban_cheques_pendientes` - Cheques sin cobrar
- `ban_cheques_antiguos` - Más de 90 días
- `ban_cheques_emitidos_mes` - Cantidad emitida
- `ban_monto_cheques_mes` - Importe emitido

**Conciliación:**
- `ban_cuentas_conciliadas` - Cuentas conciliadas
- `ban_cuentas_sin_conciliar` - Pendientes de conciliar

**CFDI:**
- `ban_timbres_disponibles` - Timbres restantes
- `ban_timbres_usados_mes` - Timbres utilizados
- `ban_cfdi_cancelados_mes` - CFDI cancelados

---

### NOI (20 métricas)

**Plantilla:**
- `noi_empleados_activos` - Empleados actuales
- `noi_empleados_por_departamento` - Distribución
- `noi_nuevos_empleados_mes` - Altas
- `noi_bajas_mes` - Bajas
- `noi_rotacion_personal` - Tasa de rotación

**Nómina:**
- `noi_costo_nomina_mes` - Costo total
- `noi_nomina_vs_presupuesto` - % del presupuesto
- `noi_promedio_sueldo` - Sueldo promedio
- `noi_desglose_percepciones` - Por concepto
- `noi_desglose_deducciones` - Por concepto

**Incidencias:**
- `noi_faltas_mes` - Total de faltas
- `noi_incapacidades_mes` - Incapacidades
- `noi_retardos_mes` - Retardos
- `noi_horas_extra_mes` - Horas extra trabajadas
- `noi_costo_horas_extra` - Monto pagado

**Prestaciones:**
- `noi_vacaciones_pendientes` - Empleados sin vacaciones
- `noi_aguinaldos_generados` - Monto de aguinaldos

**Impuestos:**
- `noi_isr_retenido_mes` - ISR retenido
- `noi_imss_patronal` - Cuota patronal
- `noi_imss_obrero` - Cuota obrera

**Cumplimiento:**
- `noi_empleados_sin_timbrar` - Recibos pendientes

---

## 🔧 Configuración

### Variables de Entorno (Opcional)

```bash
# Ruta a esquemas de Aspel (default: Esquemas/cenit)
CENIT_ESQUEMAS_PATH=Esquemas/cenit

# Directorio de salida (default: diccionario)
CENIT_DICCIONARIO_OUTPUT=diccionario

# Expiración de caché en ms (default: 300000 = 5min)
CENIT_CACHE_TTL=300000
```

### Estructura de Métricas YAML

Cada archivo de métricas debe seguir esta estructura:

```yaml
metadata:
  sistema: SAE
  version: 1.0.0
  descripcion: "Descripción del sistema"
  tablas_principales:
    - TABLA01

metricas:
  - id: mi_metrica
    nombre: "Mi Métrica"
    descripcion: "Descripción detallada"
    categoria: ventas
    tipo: escalar  # escalar | serie | tabla
    unidad: moneda  # moneda | cantidad | porcentaje | ratio
    query_duckdb: |
      SELECT valor FROM tabla WHERE condicion
    parametros:
      - nombre: fecha_inicio
        tipo: date
        requerido: true
    formato:
      decimales: 2
      prefijo: "$"
    alerta:
      tipo: umbral
      condicion: "> 0"
      nivel_warning: 100
```

---

## 📝 Agregar Nuevas Métricas

### Paso 1: Editar archivo YAML

```bash
# Editar archivo del sistema correspondiente
nano src/semantica/yaml/metricas/base_SAE.yaml
```

### Paso 2: Agregar métrica

```yaml
- id: mi_nueva_metrica
  nombre: "Mi Nueva Métrica"
  descripcion: "Descripción completa de qué mide y para qué sirve"
  categoria: ventas  # ventas, inventarios, etc.
  tipo: escalar
  unidad: moneda
  query_duckdb: |
    SELECT 
      SUM(IMPORTE) as valor
    FROM mi_tabla
    WHERE fecha BETWEEN {fecha_inicio} AND {fecha_fin}
  parametros:
    - nombre: fecha_inicio
      tipo: date
      requerido: true
    - nombre: fecha_fin
      tipo: date
      requerido: true
  formato:
    decimales: 2
    prefijo: "$"
    separador_miles: ","
```

### Paso 3: Validar

```bash
node src/semantica/validador_yaml.js
```

### Paso 4: Probar

```javascript
const resolvedor = new ResolvedorMetricas();
const resultado = await resolvedor.resolver('mi_nueva_metrica', {
  fecha_inicio: '2026-01-01',
  fecha_fin: '2026-01-31'
});
```

---

## 🐛 Solución de Problemas

### Error: "Archivo YAML no encontrado"

**Causa:** Ruta incorrecta o archivo no existe

**Solución:**
```bash
# Verificar que los archivos existan
ls -la src/semantica/yaml/metricas/
```

### Error: "Metadata de sistema no encontrada"

**Causa:** No se encuentran los archivos de esquemas en `Esquemas/cenit/`

**Solución:**
```bash
# Verificar estructura
ls -la Esquemas/cenit/SAE/schema/
```

### Error: "DuckDB no configurado"

**Causa:** El resolvedor necesita conexión a DuckDB para queries reales

**Solución:**
```javascript
// Modo demo (sin DuckDB)
const resolvedor = new ResolvedorMetricas();

// O configurar DuckDB
const duckdb = require('duckdb');
const db = new duckdb.Database(':memory:');
resolvedor.configurarDuckDB(db);
```

---

## 🤝 Contribuir

Para agregar nuevas métricas o mejorar existentes:

1. Edita el archivo YAML correspondiente
2. Valida con `validador_yaml.js`
3. Prueba con `resolvedor_metricas.js`
4. Documenta en este README

---

## 📜 Licencia

Parte del proyecto CENIT ASP © 2026
