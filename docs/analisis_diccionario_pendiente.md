# Análisis del Diccionario: Qué falta y cómo mejorarlo

## Estado Actual ✅

### Archivos generados correctamente:
1. **Catálogo Técnico** (`diccionario/catalogo_tecnico_*.json`) - ✅ Completo
2. **Semántica JSON** (`diccionario/semantica_*.json`) - ✅ Completo
3. **Overrides YAML** (`overrides/*.yaml`) - ✅ Generado
4. **Runtime YAML** (`src/semantica/yaml/catalogo/*.yaml`) - ✅ Generado
5. **Métricas** (`src/semantica/yaml/metricas/base_*.yaml`) - ✅ Básico
6. **Paneles** (`src/semantica/yaml/paneles_plantilla/base_*.yaml`) - ✅ Básico

---

## Qué FALTA (Crítico) ❌

### 1. **Sensibilidad de Datos (PII/Seguridad)**
**Problema:** Ningún campo tiene marcado si contiene datos sensibles.
**Impacto:** No hay control sobre qué información mostrar según permisos.

**Qué agregar:**
```yaml
# En overrides/*.yaml
campos_sensibles:
  RFC:
    sensibilidad: "PII"
    razon: "Dato fiscal personal"
  CURP:
    sensibilidad: "PII"
    razon: "Identificador único personal"
  SUELDO:
    sensibilidad: "NOMINA"
    razon: "Información salarial confidencial"
  CUENTA_BANCARIA:
    sensibilidad: "FINANCIERO"
    razon: "Datos bancarios"
```

### 2. **Relaciones Inferidas**
**Problema:** SAE tiene 2 relaciones inferidas, pero COI/NOI/BANCO tienen 0.
**Impacto:** No se pueden hacer JOINs automáticos entre tablas.

**Ejemplo para BANCO:**
```yaml
relaciones_inferidas:
  - origen_patron: "NUM_CTA"
    destino_tabla: "CTAS"
    destino_campo: "NUM_CTA"
    descripcion: "Relación cuenta bancaria"
  - origen_patron: "NUM_BENEF"
    destino_tabla: "BENEF"
    destino_campo: "NUM_REG"
    descripcion: "Relación beneficiario"
```

### 3. **Validación de Métricas**
**Problema:** Las métricas hacen referencia a campos que pueden no existir.
**Qué falta:** Script de validación que cruce:
- `base_SAE.yaml` → verifica que `FACTF01.IMPORTE` exista en `semantica_SAE.json`

### 4. **Descripciones de Negocio Detalladas**
**Problema:** 
- NOI: ~2000 tablas con "Tabla de sistema NOI" (genérico)
- BANCO: ~60 tablas con "Tabla de sistema BANCO"

**Solución:** Script que use IA o mapeo manual para:
```yaml
MOVS01:
  descripcion: "Movimientos bancarios del mes 01 (enero)"
  descripcion_negocio: "Registro de todos los cargos y abonos..."
  campos_importantes:
    - FECHA
    - MONTO
    - TIPO_MOV
```

### 5. **Campos Calculados y Reglas de Negocio**
**Problema:** No hay definición de lógica común.
**Ejemplo:**
```yaml
reglas_negocio:
  estatus_cancelado:
    condicion: "STATUS = 'C'"
  documento_vigente:
    condicion: "STATUS NOT IN ('C', 'X')"
  periodo_mes_actual:
    condicion: "FECHA >= date_trunc('month', CURRENT_DATE)"
```

---

## Qué MEJORAR (Importante) ⚠️

### 6. **Enriquecimiento de Métricas**
**Actual:** 3-4 métricas básicas por sistema.
**Recomendado:** 15-30 métricas útiles.

**Ejemplos SAE faltantes:**
- Top 10 productos más vendidos
- Margen de utilidad promedio
- Rotación de inventario
- Días cartera promedio
- Productos con stock bajo mínimo

### 7. **Tipos de Negocio Inconsistentes**
**Problema:** Muchas tablas tienen `tipo: "Desconocido"`.
**Solución:** Mejorar heurística en `scripts/generar_diccionario_mejorado.js`:

```javascript
function inferirTipoTabla(nombreTabla, campos, indices) {
    // Si tiene PK única + fechas = Catálogo
    if (tienePKUnica && !tieneFechas) return "Catalogo";
    
    // Si tiene fecha + importes = Movimiento
    if (tieneFechas && tieneImportes) return "Movimiento";
    
    // Si nombre termina en PAR* o *_D = Detalle
    if (/PAR\d+|_D$/.test(nombreTabla)) return "Detalle";
    
    return "Desconocido";
}
```

### 8. **Mapeo de Dimensiones vs Medidas**
**Problema:** El YAML Runtime no distingue qué campos son "dimensiones" (para agrupar) vs "medidas" (para agregar).

**Agregar:**
```yaml
datasets:
  FACTF01:
    fields:
      FECHA_DOC:
        tipo: fecha
        rol: "dimension"  # ← NUEVO
      CVE_CLPV:
        tipo: clave
        rol: "dimension"
      IMPORTE:
        tipo: dinero
        rol: "medida"  # ← NUEVO
        agregable: true
```

### 9. **Paneles con Layouts Reales**
**Actual:** Paneles muy básicos (4-5 widgets).
**Mejora:** Agregar layouts completos tipo dashboard:

```yaml
paneles:
  director_general:
    titulo: "Dirección General"
    layout_type: "grid"  # 12 columnas
    widgets:
      - id: "kpi_ventas"
        posicion: {fila: 1, columna: 1, ancho: 3, alto: 1}
      - id: "grafico_tendencia"
        posicion: {fila: 2, columna: 1, ancho: 6, alto: 2}
```

### 10. **Documentación de Patrones de Nombres**
**Falta:** Documentar convenciones Aspel para que otros entiendan el sistema.

Ejemplo:
```yaml
convenciones_aspel:
  sufijos_tablas:
    "01-12": "Representa meses (MOVS01 = Enero, MOVS12 = Diciembre)"
    "_CLIB": "Campos libres (customizables por usuario)"
    "_D": "Detalle de documento (líneas de factura)"
  prefijos_campos:
    "CVE_": "Clave primaria o foránea"
    "IMP_": "Importe monetario"
    "FEC_": "Fecha"
```

---

## Scripts Faltantes 🛠️

1. **`scripts/validar_diccionario.js`**
   - Verificar que campos de métricas existan
   - Verificar integridad de relaciones inferidas
   - Reportar tablas sin descripción

2. **`scripts/enriquecer_sensibilidad.js`**
   - Detectar automáticamente campos PII (RFC, CURP, NOMBRE)
   - Marcar campos monetarios como FINANCIERO

3. **`scripts/generar_relaciones_inferidas.js`**
   - Analizar patrones de nombres de campos
   - Proponer FKs probables

4. **`scripts/reporte_cobertura.js`**
   - % de tablas con descripción real
   - % de campos con tipo semántico
   - % de métricas validadas

---

## Prioridades Recomendadas

### 🔴 ALTA (Hacer primero)
1. Agregar sensibilidad de datos (PII)
2. Script de validación de métricas
3. Relaciones inferidas para NOI/BANCO
4. Mejorar descripciones de tablas core (top 20 por sistema)

### 🟡 MEDIA
5. Ampliar métricas a 15-20 por sistema
6. Mapeo dimensiones vs medidas
7. Mejorar inferencia de tipos de tabla

### 🟢 BAJA (Opcional)
8. Paneles complejos con layouts
9. Documentación de convenciones
10. Campos calculados y reglas de negocio

---

## Siguiente Paso Sugerido

Crear **`scripts/validar_diccionario.js`** que verifique:
- ✅ Todos los datasets en métricas existen
- ✅ Todos los campos en métricas existen
- ✅ Todas las tablas tienen descripción no genérica
- ✅ Generar reporte HTML con cobertura

¿Quieres que implemente alguno de estos puntos?
