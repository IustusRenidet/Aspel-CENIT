
---

# ¿Qué sigue para “ya hacer el diccionario”?

El diccionario no es “otro export”; es una **capa semántica** encima de esos metadatos. La construcción se hace en 3 niveles (en este orden):

## Nivel A — Catálogo técnico (1:1 con metadata)

**Objetivo:** Tener un objeto por tabla con todo lo técnico consolidado.

Salida recomendada por sistema:

* `diccionario/catalogo_tecnico_<SISTEMA>.json` (o `.yaml`)

Contenido mínimo por tabla:

* `tabla`
* `campos[]` (nombre, tipo, longitud/escala, nullable, default, descripcion)
* `indices[]` (nombre, unique, columnas)
* `constraints[]`
* `fks[]` (tabla_origen.campo → tabla_destino.campo)

Esto se arma uniendo `metadata_campos + metadata_indices + metadata_constraints + metadata_fks` por `tabla`.

## Nivel B — Semántica e inferencias (la “inteligencia”)

**Objetivo:** Agregar significado utilizable para widgets.

Salida:

* `diccionario/semantica_<SISTEMA>.json`
* y/o `semantica/yaml/catalogo/<SISTEMA>.yaml`

Por tabla agrega:

* `tipo_inferido`: catálogo / movimiento / detalle / configuración / bitácora
* `campos_clave`:
  * `fechas` (FECHA*, FEC*, etc.)
  * `importes` (IMP*, TOTAL*, MONTO*, SALDO*, etc.)
  * `estatus` (STATUS/ESTATUS)
  * `claves` (CVE_*, ID, UUID)
* `pk_probable` (por índices unique/PK)
* `relaciones` (grafo desde FKs)
* `tags` (ej. “ventas”, “inventarios”, “bancos”, “contabilidad”)
  * En SAE esto lo puedes enriquecer con tu “tablas por módulo” si lo tienes.

Este nivel es el que convierte tus metadatos en algo “accionable”.

## Nivel C — Catálogo de widgets (plantillas)

**Objetivo:** Que CENIT pueda sugerir widgets sin que el usuario escriba SQL.

Salida:

* `semantica/yaml/metricas/base_<SISTEMA>.yaml`
* `semantica/yaml/paneles_plantilla/base_<SISTEMA>.yaml`

Ejemplos:

* KPI: “Total facturado (últimos 30 días)”
* Serie: “Ventas por día”
* Tabla: “Top 20 clientes por monto”
* Alertas: “Documentos cancelados hoy”

Estas métricas deben apuntar preferentemente a **DuckDB** (cuando ya cargues datasets analíticos).

---

# Recomendación práctica: “qué construir primero” (sin perderte)

1. **Construir el Nivel A (catálogo técnico)** para BANCO y SAE primero (son manejables y validas el pipeline).
2. Aplicar **Nivel B (inferencias)** y validar que el “ranking” y las señales tengan sentido.
3. Luego  **COI** .
4. Y al final  **NOI** , pero con estrategia:
   * generar diccionario **por lotes** (por prefijos de tabla o por ranking)
   * y guardar incrementalmente.

---

# ¿Tu ZIP es suficiente “ya” para el diccionario?

Para el  **catálogo técnico** , sí (tienes tablas/campos/índices/constraints/FKs).
Para la **semántica de negocio** (widgets “inteligentes”), te faltan 2 fuentes que normalmente se agregan:

1. **Mapeo funcional por sistema** (sobre todo SAE):
   * “estas tablas son Ventas / Inventarios / CxC / CxP…”
   * puede venir de un JSON/YAML manual o del archivo “tablas por módulo” si lo manejas.
2. **Reglas de métricas** (YAML de métricas):
   * esto lo vas a crear tú (con mi ayuda) con 15–30 métricas base por sistema.

---

# Qué te recomiendo que hagas ahora mismo (paso siguiente concreto)

Define estas salidas como “contrato” para CENIT:

1. `diccionario/catalogo_tecnico_<SISTEMA>.json`
2. `diccionario/semantica_<SISTEMA>.json`
3. `semantica/yaml/catalogo/<SISTEMA>.yaml`
4. `semantica/yaml/metricas/base_<SISTEMA>.yaml`
5. `semantica/yaml/paneles_plantilla/base_<SISTEMA>.yaml`

Con eso, tu app ya puede:

* “saber qué hay” (catálogo)
* “saber qué importa” (semántica)
* “sugerir widgets” (métricas/paneles)

---

Si me dices cuál enfoque quieres para el diccionario (elige 1 y avanzamos con eso):

1. **Python** (rápido para generar JSON/YAML y validar con Parquet/JSONL).
2. **Node** (para que el mismo backend Express genere/actualice el diccionario y lo guarde en SQLite/DuckDB).

Yo te recomiendo: **Python para construir el diccionario base** y después lo embebes en tu repo como recursos/versionado; y ya en CENIT solo lo consumes y actualizas cuando detectes cambios.
