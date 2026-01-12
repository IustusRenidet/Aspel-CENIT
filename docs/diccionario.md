
---

## Para qué se solicita el diccionario

Sin diccionario, tu app solo ve “tablas y campos” sin contexto. Con diccionario, tu app puede:

1. **Entender significado de datos Aspel**

* Qué tabla es catálogo vs movimiento vs detalle.
* Qué campo es fecha, importe, estatus, clave, referencia, etc.
* Qué relaciones existen (FKs) para unir datos correctamente.

2. **Construir widgets sin hardcodear**

* El usuario elige “Ventas por mes” y el sistema sabe qué tablas/campos usar.
* Se puede generar SQL automáticamente (DuckDB preferente) con filtros coherentes.

3. **Hacer búsqueda tipo “humana”**

* “Total facturado”, “clientes con saldo”, “pólizas del mes”, “pagos cancelados”.
* Se resuelve consultando el diccionario (no adivinando).

4. **Estabilizar el producto**

* Aspel cambia versiones y nombres; el diccionario actúa como “capa intermedia”.
* Te protege de depender de nombres específicos o queries frágiles.

5. **Gobernanza y mantenibilidad**

* Documentación viva: qué datos existen, cómo se interpretan, sensibilidad (PII/financiera).
* Facilita auditoría y onboarding de nuevos desarrolladores.

En una frase:  **se solicita porque es la base para un sistema configurable e inteligente** , sin que tú tengas que programar cada widget/consulta a mano.

---

## Qué necesitas para construir el diccionario (insumos)

Piensa en 3 niveles:  **Técnico → Semántico → Métricas** . Cada nivel usa insumos distintos.

### Nivel A: Catálogo técnico (lo que existe)

1. **Tablas**

* Nombre de tabla
* Descripción (si existe)
* Indicadores (si es vista, sistema, etc.)
* Conteos básicos (campos, índices)

2. **Campos**

* Tabla, campo
* Tipo (FIELD_TYPE), sub_type, length, scale
* Nullable
* Default (si existe)
* Descripción (si existe)
* Charset/collation (si aplica)

3. **Índices**

* Nombre índice
* Unique
* Columnas en el índice y orden
* Estado (activo/inactivo)

4. **Constraints**

* PK/UNIQUE/CHECK (según lo exportes)
* Nombre de constraint
* Campos asociados (si es posible)

5. **Foreign Keys (FKs)**

* Tabla origen, campo origen
* Tabla destino, campo destino
* Nombre de la FK
* Reglas (ON UPDATE/DELETE si existen)

**Con esto construyes el “mapa estructural” completo** de la base.

> En tu caso: esos 5 insumos ya vienen como `metadata_campos_*`, `metadata_indices_*`, `metadata_constraints_*`, `metadata_fks_*`, `metadata_tablas_*`.

---

### Nivel B: Semántica (qué significa)

El técnico dice “qué hay”. La semántica dice “qué representa”.

Necesitas:

1. **Reglas heurísticas (automáticas)**

* Diccionario de patrones por nombre:
  * fechas: `FECHA*`, `FEC*`, `*_F`, `*_T`
  * importes: `IMP*`, `TOTAL*`, `MONTO*`, `SALDO*`, `COSTO*`
  * estatus: `STATUS`, `ESTATUS`, `SITUACION`
  * claves: `CVE_*`, `ID_*`, `UUID`, `FOLIO`
* Clasificación de tablas:
  * `PAR_*` suele ser detalle
  * `*MOV*`, `MINVE`, `FACT*` movimiento
  * `PARAM_*` configuración
  * `BITA*`, `LOG*` bitácora

2. **Mapa “funcional” por sistema (semi-manual, recomendado)**
   Esto es clave para que el diccionario sea útil en negocio:

* Para SAE: Ventas, Compras, Inventario, CxC, CxP…
* Para COI: Pólizas, Cuentas, Auxiliares…
* Para NOI: Nómina, Incidencias, Percepciones/Deducciones…
* Para BANCO: Movimientos bancarios, conciliación, cuentas…

Este mapa puede empezar simple:

* 20–60 tablas “core” por sistema con etiqueta de módulo/uso.
* Luego crece.

3. **Sensibilidad y seguridad**
   Marca campos como:

* PII (RFC, CURP, nombre, dirección)
* Nómina (salarios)
* Bancario (cuentas, CLABE)
  Esto se usa para:
* ocultar en widgets
* permisos
* auditoría

Resultado del Nivel B:

* Por tabla: tipo (catálogo/mov/detalle/config), módulo, tags, campos clave.
* Por campo: rol semántico (fecha/importe/estatus/clave), sensibilidad, formato.

---

### Nivel C: Métricas y Widgets (lo que el usuario ve)

Para que tu “constructor de widgets” funcione sin SQL manual, necesitas:

1. **Definición declarativa de métricas (YAML)**
   Ejemplo conceptual:

* métrica: `ventas_total`
* dataset: `ventas`
* agregación: `SUM(importe)`
* dimensiones: `fecha`, `cliente`, `sucursal`
* filtros permitidos: `rango_fecha`, `estatus != cancelado`

2. **Plantillas de widgets**

* KPI: `SUM`, `COUNT`, `AVG`
* Serie: agrupar por fecha (día/mes)
* Barras: top N por dimensión
* Tabla: columnas + orden + paginación
* Alertas: regla booleana (umbral)

3. **Contrato de datos**
   Tu UI necesita que el diccionario diga:

* qué datasets existen
* qué campos son “usables” como dimensión o filtro
* qué campos son medidas (sumables)

---

## Qué archivos debe producir “el diccionario” (entregables)

Para que sea operativo y versionable, te recomiendo producir 4 artefactos por sistema:

1. **Catálogo técnico consolidado**

* `diccionario/catalogo_tecnico_<SISTEMA>.json`
  Contiene: tablas→campos/índices/constraints/fks.

2. **Semántica consolidada**

* `diccionario/semantica_<SISTEMA>.json`
  Contiene: clasificación de tablas, roles de campos, sensibilidad, tags.

3. **YAML de catálogo (runtime)**

* `semantica/yaml/catalogo/<SISTEMA>.yaml`
  Es el formato que tu backend cargará para resolver widgets.

4. **Métricas base + paneles plantilla**

* `semantica/yaml/metricas/base_<SISTEMA>.yaml`
* `semantica/yaml/paneles_plantilla/base_<SISTEMA>.yaml`

Con esto, tu app puede: mostrar paneles base, sugerir widgets, validar filtros, y generar consultas.

---

## Qué información suele faltar (y cómo completarla)

Aunque tengas toda la metadata, normalmente faltan:

1. **Descripción de negocio**

* Firebird trae pocas descripciones; Aspel no documenta todo dentro de la BD.
  Solución: archivo de “overrides” manual:
* `overrides/<SISTEMA>.yaml` con descripciones y tags.

2. **Relaciones reales (cuando no hay FK)**
   Aspel a veces no declara FKs.
   Solución:

* “Relaciones inferidas” por patrones:
  * `CVE_CLPV` → cliente
  * `CVE_ART` → producto
  * `CVE_DOC` → documento
    Esto se guarda como “relaciones inferidas” separadas de las FKs oficiales.

3. **Campos calculados y lógica de estatus**

* Cancelado, aplicado, timbrado, etc.
  Solución: reglas semánticas en YAML:
* `status_cancelado: STATUS='C'` (ejemplo)

---

## Proceso recomendado para construirlo (paso a paso)

1. **Ingesta**

* Leer tus `metadata_*.jsonl.txt` por sistema.

2. **Consolidación**

* Agrupar por tabla y unir campos+índices+constraints+fks.

3. **Inferencias**

* Detectar PK probable, campos fecha/importe/estatus, tipo de tabla.
* Calcular “relevancia” (qué tablas son core) por señales: índices unique, presencia de fechas/importes, conexiones FK.

4. **Curación mínima (overrides)**

* Añadir módulos, descripciones, sensibilidad.
* Añadir relaciones inferidas donde falten.

5. **Export**

* Generar JSON (técnico y semántico) + YAML runtime.

6. **Validación**

* Validar esquema YAML.
* Validar que una muestra de widgets se pueda resolver (dry-run de SQL).

---

## En tu proyecto, qué necesitas específicamente (checklist)

### Ya lo tienes (del ZIP)

* metadata_campos / índices / constraints / fks / tablas por sistema.

### Te falta crear (lo mínimo para que sea “inteligente”)

1. `overrides/SAE.yaml`, `overrides/COI.yaml`, `overrides/NOI.yaml`, `overrides/BANCO.yaml`

* módulos
* descripciones core
* sensibilidad
* relaciones inferidas (si aplica)

2. `semantica/yaml/metricas/base_*.yaml`

* 15–30 métricas iniciales por sistema (core)

3. `semantica/yaml/paneles_plantilla/base_*.yaml`

* 2–5 paneles base por sistema

---


* **Un esquema YAML definitivo** (catálogo + métricas + paneles)
* **y una plantilla real** para BANCO, COI, NOI y SAE (con 10–15 métricas iniciales).
