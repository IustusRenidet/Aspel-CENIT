## Modelo de paneles y widgets 

### Tipos de widgets (definidos)

* KPI (valor único + variación)
* Línea (serie tiempo)
* Barras (categorías)
* Tabla (listado con filtros)
* Alertas (reglas + semáforo)

### Layout y persistencia

* Layout por widget (grid):
  * `x,y,w,h`
  * `minW,minH`
  * `locked`
* Persistencia:
  * `layout_json` guardado **tal cual** como TEXT en SQLite
  * `widgets_json` (config por widget) como TEXT

### Modelo corporativo vs personal

* **Plantilla corporativa** (compartida por empresa)
* **Vista personal** por usuario (clonable desde corporativa)

Recomendación:

* Empresa define panel base
* Usuario puede:
  * “Usar panel corporativo”
  * “Clonar a panel personal”
  * Exportar su panel personal

---

## Configuración de bases de datos Aspel (completo)

### Ruta base

`C:\Program Files (x86)\Common Files\Aspel\Sistemas Aspel`

### Sistemas detectables

* BAN6.00 → BANCO
* COI10.00 / COI11.00 → COI
* NOI10.00 / NOI11.00 → NOI
* SAE7.00 / SAE8.00 / SAE9.00 → SAE

version agnostic 

### Rutas por defecto (ejemplos)

* COI: `...\COI10.00\Datos\Empresa1\COI10EMPRE1.FDB`
* BANCO: `...\BAN6.00\Datos\Empresa01\BAN60EMPRE01.FDB`
* NOI: `...\NOI11.00\Datos\Empresa01\NOI11EMPRE01.FDB`
* SAE: `...\SAE9.00\Empresa01\Datos\SAE90EMPRE01.FDB`

### Configuración por empresa

Cada empresa en CENIT ASP tiene:

* Nombre de empresa (CENIT ejemplo)
* Sistemas habilitados (SAE/COI/NOI/BANCO)
* Para cada sistema:
  * ruta FDB
  * charset (default WIN1252)
  * usuario/password Firebird (guardado cifrado)
  * verificación de conexión

### 7.5 Detección automática + override

* Escaneo de carpetas de Aspel
* Heurística:
  * buscar `Empresa01`, `Empresa1`, etc.
  * detectar `.FDB`
* UI permite:
  * “Usar ruta detectada”
  * “Seleccionar archivo .FDB manualmente”
  * “Guardar como plantilla por empresa”

---

## Sincronización y actualización de datos

### Concepto

No es tiempo real”.

Hay sincronización:

* Programada cada X minutos
* Manual
* Por dataset (ventas, inventario, pólizas, etc.)

Siempre mostrar:

* última actualización
* estado de job
* errores recientes

### Incremental y ventana móvil

SQLite guarda `sync_state`:

* `last_run_at`
* `last_key` (folio/fecha)
* `window_days` (recalcular últimos N días para captar correcciones)

### Flujo ETL

1. Extract Firebird (solo lectura)
2. Transform (normalización, join de claves, fechas)
3. Load a DuckDB (tablas analíticas)

---

## Diccionario inteligente + YAML 

### Archivos fuente (los que exportas)

### Tres capas YAML

1. **Catálogo técnico**
   * tablas, campos, relaciones, tipos
2. **Métricas**
   * definiciones declarativas (sin SQL manual del usuario)
3. **Paneles plantilla**
   * dashboards base por sistema

### Resolver de métricas

* Entrada: YAML métrica + filtros + rango
* Salida: SQL DuckDB (preferente) o Firebird (fallback)

---

## Export/Import Config (completo)

Exporta JSON:

* paneles
* widgets
* layout_json
* preferencias UI

No exporta:

* credenciales Firebird
* usuarios/contraseñas
* DuckDB cache

Import:

* regenera IDs
* crea “(importado)”
* respeta compatibilidad de versiones

---

## Backups y Restore (completo)

Archivos:

* `cenit.sqlite3`
* `analytics.duckdb`

Modalidades:

* manual (zip)
* automático (diario/semanal + retención)

Restore:

* lock global
* cerrar conexiones
* reemplazar archivos
* reiniciar backend

---

## Contrato de endpoints (API) — añadido

### Autenticación

* `POST /api/auth/login`
* `POST /api/auth/register`
* `POST /api/auth/logout`
* `GET  /api/auth/me`

### Empresas y conexiones

* `GET  /api/empresas`
* `POST /api/empresas`
* `PUT  /api/empresas/:id`
* `POST /api/conexiones/probar`
* `PUT  /api/empresas/:id/conexiones`

### Paneles y widgets

* `GET  /api/paneles`
* `POST /api/paneles`
* `PUT  /api/paneles/:id`
* `DELETE /api/paneles/:id`
* `POST /api/widgets/previsualizar`
* `POST /api/widgets/ejecutar`

### Sincronización

* `POST /api/sync/ejecutar`
* `GET  /api/sync/estado`
* `GET  /api/sync/logs`

### Export/import

* `POST /api/config/exportar`
* `POST /api/config/importar`

### Backups

* `POST /api/backups/crear`
* `GET  /api/backups/listar`
* `POST /api/backups/restaurar`

---

## Estructura de carpetas (actualizada)

Tu estructura está bien; solo agrego lo que faltaba (anime.js, scss, actualizaciones, logs, tema):

* `electron/actualizaciones/` (auto update)
* `interfaz/src/estilos/` (scss + tema)
* `interfaz/src/animaciones/` (anime.js + react-spring)
* `src/logs/` (logs de sync/update)
* `src/semantica/yaml/` (catalogo/metricas/paneles)

---

## Seguridad (añadido)

Desktop local:

* CSP estricta
* contextIsolation true
* nodeIntegration false
* preload con contextBridge
* Express solo en 127.0.0.1
* Validación Joi en todos endpoints
* Sanitización inputs (filtros)

Credenciales Firebird:

* Guardar cifrado (clave derivada por usuario o machine key)
* Nunca exportarlas

---

## Observaciones claves (para ejecución real)

* Firebird 2.5 obliga compatibilidad en metadatos (ya lo comprobaste).
* DuckDB será tu motor de queries rápidas.
* SQLite es estado/config y cola de jobs.
* YAML es la capa “no-code” para widgets inteligentes.
