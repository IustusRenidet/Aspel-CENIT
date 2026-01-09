# Descripciones Automáticas de Tablas y Campos

Este directorio contiene las descripciones automáticas generadas para todas las tablas y campos de los 4 sistemas Aspel utilizados por CENIT ASP.

## 📊 Archivos Generados

| Archivo | Sistema | Tablas | Campos | Descripción |
|---------|---------|--------|--------|-------------|
| `descripciones_SAE.json` | SAE | 203 | 3,990 | Sistema Administrativo Empresarial (ventas, inventarios, CxC, CxP) |
| `descripciones_COI.json` | COI | 219 | 6,671 | Contabilidad Integral (pólizas, cuentas, bancos) |
| `descripciones_BANCO.json` | BANCO | 110 | 3,610 | Sistema Bancario (movimientos, cheques, conciliación) |
| `descripciones_NOI.json` | NOI | 2,005 | 48,792 | Nómina Integral (empleados, percepciones, deducciones) |

**Total:** 2,537 tablas y 62,063 campos documentados automáticamente.

---

## 🔍 Cómo se Generan las Descripciones

Las descripciones se generan mediante inferencia semántica basada en:

### 1. Patrones de Nombres de Campos

El generador reconoce patrones comunes en nombres de campos:

**Fechas:**
- `FECHA_DOC` → "Fecha del documento"
- `FECHA_VENC` → "Fecha de vencimiento"
- `FECHA_ALTA` → "Fecha de alta o registro"

**Importes:**
- `IMPORTE` → "Importe o monto total"
- `IMP_NETO` → "Importe neto después de descuentos"
- `SUBTOTAL` → "Subtotal antes de impuestos"
- `DESCUENTO` → "Monto de descuento aplicado"

**Claves y Códigos:**
- `CVE_CLIE` → "Clave de cliente"
- `CVE_PROV` → "Clave de proveedor"
- `FOLIO` → "Número de folio consecutivo"
- `UUID` → "Identificador único universal (UUID)"

**Estatus:**
- `STATUS` → "Estatus o estado del registro"
- `ACTIVO` → "Indica si está activo"
- `CANCELADO` → "Indica si está cancelado"

### 2. Prefijos Comunes

El sistema reconoce prefijos y construye descripciones contextuales:

- `CVE_*` → "Clave de..."
- `NO_*` → "Número de..."
- `FECHA_*` → "Fecha de..."
- `IMP_*` → "Importe de..."
- `TIPO_*` → "Tipo de..."

### 3. Sufijos Identificativos

- `*_01`, `*_02` → Indica orden o versión
- `*_CLIE` → Relacionado con cliente
- `*_PROV` → Relacionado con proveedor
- `*_ART` → Relacionado con artículo

### 4. Patrones de Tablas

Las tablas se clasifican automáticamente:

**SAE:**
- `FACTF*` → "Facturas (movimientos)"
- `CLIE*` → "Clientes (catálogo)"
- `INVE*` → "Inventarios"
- `VTAS*` → "Ventas"

**COI:**
- `POLIZ*` → "Pólizas contables"
- `CUEN*` → "Cuentas contables"
- `BANCO*` → "Bancos"

**BANCO:**
- `CUENT*` → "Cuentas bancarias"
- `CHEQU*` → "Cheques"
- `CONCI*` → "Conciliación"

**NOI:**
- `EMPLEA*` → "Empleados"
- `NOMINA*` → "Nóminas"
- `PERCEP*` → "Percepciones"

### 5. Inferencia por Tipo de Dato

Cuando no hay coincidencia de patrón, se infiere por tipo SQL:

- `DATE`, `TIMESTAMP` → "Fecha - [nombre campo]"
- `DECIMAL`, `NUMERIC` → "Monto en pesos" (si contiene PRECIO/COSTO/IMPORTE)
- `INTEGER` → "Cantidad" (si contiene CANTIDAD/EXISTENCIA)
- `VARCHAR(<=10)` → "Código o clave"
- `VARCHAR(>10)` → "Texto"

---

## 📖 Estructura del JSON

Cada archivo tiene la siguiente estructura:

```json
{
  "sistema": "SAE",
  "fecha_generacion": "2026-01-08T00:08:43.400Z",
  "total_tablas": 203,
  "tablas": {
    "FACTF01": {
      "descripcion": "Facturas (movimientos) del sistema de ventas",
      "campos": {
        "FACTURA": "Número de folio consecutivo",
        "FECHA_DOC": "Fecha del documento",
        "CVE_CLIE": "Clave de cliente",
        "IMPORTE": "Importe o monto total",
        "IVA": "Impuesto al Valor Agregado",
        "STATUS": "Estatus o estado del registro"
      }
    }
  }
}
```

---

## 🚀 Uso de las Descripciones

### 1. Consulta Programática

```javascript
const fs = require('fs-extra');

// Cargar descripciones
const descripciones = await fs.readJson('Esquemas/cenit/descripciones/descripciones_SAE.json');

// Obtener descripción de tabla
console.log(descripciones.tablas.FACTF01.descripcion);
// "Facturas (movimientos) del sistema de ventas"

// Obtener descripción de campo
console.log(descripciones.tablas.FACTF01.campos.FECHA_DOC);
// "Fecha del documento"
```

### 2. Documentación Automática

Usa las descripciones para generar documentación automática en:
- Diccionarios de datos
- Diagramas ER
- Interfaces de usuario (tooltips, labels)
- Reportes técnicos

### 3. Búsqueda Semántica

```javascript
// Buscar todas las tablas de clientes
const tablasClientes = Object.entries(descripciones.tablas)
  .filter(([nombre, info]) => 
    info.descripcion.toLowerCase().includes('cliente')
  );

// Buscar todos los campos de fecha
const camposFecha = {};
for (const [tabla, info] of Object.entries(descripciones.tablas)) {
  const fechas = Object.entries(info.campos)
    .filter(([campo, desc]) => desc.toLowerCase().includes('fecha'))
    .map(([campo, desc]) => ({ tabla, campo, descripcion: desc }));
  
  if (fechas.length > 0) {
    camposFecha[tabla] = fechas;
  }
}
```

### 4. Validación de Consultas

Usa las descripciones para validar que un campo existe:

```javascript
function validarCampo(sistema, tabla, campo) {
  const descripciones = require(`./descripciones_${sistema}.json`);
  
  if (!descripciones.tablas[tabla]) {
    throw new Error(`Tabla ${tabla} no existe en ${sistema}`);
  }
  
  if (!descripciones.tablas[tabla].campos[campo]) {
    throw new Error(`Campo ${campo} no existe en tabla ${tabla}`);
  }
  
  return descripciones.tablas[tabla].campos[campo];
}

// Uso
const desc = validarCampo('SAE', 'FACTF01', 'FECHA_DOC');
console.log(desc); // "Fecha del documento"
```

---

## 🔄 Regeneración

Para regenerar las descripciones (por ejemplo, después de actualizar los metadatos):

```bash
node src/semantica/generador_descripciones.js
```

El script:
1. Lee los diccionarios técnicos desde `diccionario/catalogo_tecnico_*.json`
2. Aplica las reglas de inferencia semántica
3. Genera los archivos JSON en esta carpeta
4. Crea un reporte de generación

---

## 📝 Mejora de Descripciones

Las descripciones automáticas son un punto de partida. Para mejorarlas:

### Opción 1: Editar el Archivo JSON

Puedes editar directamente los archivos JSON para agregar descripciones más específicas:

```json
{
  "tablas": {
    "FACTF01": {
      "descripcion": "Facturas emitidas a clientes - Documento fiscal principal",
      "campos": {
        "UUID": "Folio fiscal electrónico (UUID del SAT) para facturación CFDI"
      }
    }
  }
}
```

### Opción 2: Agregar Patrones al Generador

Edita [generador_descripciones.js](../../src/semantica/generador_descripciones.js) y agrega nuevos patrones:

```javascript
construirPatrones() {
  return {
    // ... patrones existentes ...
    'MI_CAMPO_ESPECIAL': { tipo: 'custom', desc: 'Mi descripción específica' }
  };
}
```

### Opción 3: Usar Metadata Externa

Si tienes un diccionario de datos oficial de Aspel, puedes integrarlo:

1. Coloca el archivo en `Esquemas/cenit/diccionario_oficial/`
2. Modifica el generador para leer ese diccionario primero
3. Usa la inferencia automática solo para campos no documentados

---

## 📊 Estadísticas de Cobertura

El reporte de generación muestra estadísticas de calidad:

```json
{
  "fecha": "2026-01-08T00:08:44.163Z",
  "exitosos": ["SAE", "COI", "BANCO", "NOI"],
  "fallidos": [],
  "estadisticas": {
    "SAE": {
      "tablas": 203,
      "campos_total": 3990
    },
    "COI": {
      "tablas": 219,
      "campos_total": 6671
    },
    "BANCO": {
      "tablas": 110,
      "campos_total": 3610
    },
    "NOI": {
      "tablas": 2005,
      "campos_total": 48792
    }
  }
}
```

---

## 🤝 Contribución

Para mejorar el sistema de inferencia:

1. Identifica patrones recurrentes en los nombres de campos
2. Agrega esos patrones al diccionario en `construirPatrones()`
3. Regenera las descripciones
4. Valida que las descripciones mejoraron

---

## 📜 Licencia

Parte del proyecto CENIT ASP © 2026

---

## 🔗 Referencias

- [Constructor de Diccionarios](../../src/semantica/constructor_diccionario.js) - Lee metadata de Firebird
- [Motor de Inferencias](../../src/semantica/inferencias.js) - Clasifica semánticamente
- [Generador de Descripciones](../../src/semantica/generador_descripciones.js) - Este generador
- [Diccionarios Técnicos](../../diccionario/) - Catálogos consolidados
