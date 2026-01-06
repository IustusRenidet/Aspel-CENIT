Todo está alineado a:  **Express separado** ,  **AppData** ,  **SQLite + DuckDB en archivo** ,  **layout JSON en TEXT** ,  **export/import** ,  **backups** .

---

## 1) Esquema SQLite exacto (DDL)

> Archivo: `src/almacenamiento/sqlite/migraciones/001_init.sql` (o similar)

```sql
PRAGMA foreign_keys = ON;

-- =========================
-- Control de esquema
-- =========================
CREATE TABLE IF NOT EXISTS esquema_db (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  aplicado_en TEXT NOT NULL
);

INSERT OR IGNORE INTO esquema_db (id, version, aplicado_en)
VALUES (1, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- =========================
-- Usuarios y seguridad
-- =========================
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,                 -- ej: usr_01H...
  usuario TEXT NOT NULL UNIQUE,        -- login
  nombre TEXT NOT NULL,
  correo TEXT,
  hash_password TEXT NOT NULL,         -- bcrypt
  rol TEXT NOT NULL DEFAULT 'usuario', -- admin|analista|usuario
  activo INTEGER NOT NULL DEFAULT 1,   -- 1/0
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_activo ON usuarios (activo);

-- Si usas sesiones (express-session) con store en SQLite
CREATE TABLE IF NOT EXISTS sesiones (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,                  -- JSON serializado
  expira_en INTEGER NOT NULL            -- epoch ms/seg según tu implementación
);

CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira_en);

-- =========================
-- Preferencias por usuario (UI/UX)
-- =========================
CREATE TABLE IF NOT EXISTS preferencias_usuario (
  usuario_id TEXT PRIMARY KEY,
  preferencias_json TEXT NOT NULL,      -- JSON
  actualizado_en TEXT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- =========================
-- Paneles (Dashboards)
-- =========================
CREATE TABLE IF NOT EXISTS paneles (
  id TEXT PRIMARY KEY,                  -- pan_01H...
  propietario_usuario_id TEXT,          -- null si es compartido por empresa
  empresa_id TEXT NOT NULL,             -- emp_0001 (definido por tu capa empresas)
  nombre TEXT NOT NULL,
  descripcion TEXT,
  visibilidad TEXT NOT NULL,            -- personal|empresa_compartido
  etiquetas_json TEXT NOT NULL DEFAULT '[]', -- JSON array
  layout_json TEXT NOT NULL,            -- JSON COMPLETO del panel (TEXT tal cual)
  schema_version INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  FOREIGN KEY (propietario_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_paneles_empresa ON paneles (empresa_id);
CREATE INDEX IF NOT EXISTS idx_paneles_propietario ON paneles (propietario_usuario_id);
CREATE INDEX IF NOT EXISTS idx_paneles_visibilidad ON paneles (visibilidad);

-- Para marcar “panel por defecto” por usuario/empresa
CREATE TABLE IF NOT EXISTS panel_por_defecto (
  usuario_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  panel_id TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  PRIMARY KEY (usuario_id, empresa_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (panel_id) REFERENCES paneles(id) ON DELETE CASCADE
);

-- =========================
-- Diccionarios YAML (opcional: cache de carga)
-- Si decides guardar "qué versión de YAML" está activa.
-- =========================
CREATE TABLE IF NOT EXISTS semantica_versiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id TEXT NOT NULL,
  catalogo_version INTEGER NOT NULL DEFAULT 1,
  metricas_version INTEGER NOT NULL DEFAULT 1,
  plantillas_version INTEGER NOT NULL DEFAULT 1,
  actualizado_en TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_semantica_empresa ON semantica_versiones (empresa_id);

-- =========================
-- Estado de sincronización (ETL)
-- =========================
CREATE TABLE IF NOT EXISTS estado_sincronizacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id TEXT NOT NULL,
  sistema TEXT NOT NULL,                 -- SAE|COI|NOI|BANCO
  dataset TEXT NOT NULL,                 -- ventas_resumen_mes, etc.
  ultimo_run_en TEXT,                    -- ISO
  ultimo_ok_en TEXT,                     -- ISO
  ultimo_error TEXT,                     -- texto breve
  ultimo_checkpoint_json TEXT NOT NULL DEFAULT '{}',  -- JSON: last_key, window_days...
  politica_json TEXT NOT NULL DEFAULT '{}',           -- JSON: cada_min, ventana_dias...
  creado_en TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  UNIQUE (empresa_id, sistema, dataset)
);

CREATE INDEX IF NOT EXISTS idx_estado_sync_empresa ON estado_sincronizacion (empresa_id);
CREATE INDEX IF NOT EXISTS idx_estado_sync_dataset ON estado_sincronizacion (dataset);

-- =========================
-- Cola de trabajos (Jobs ETL / Backups)
-- =========================
CREATE TABLE IF NOT EXISTS cola_trabajos (
  id TEXT PRIMARY KEY,                   -- job_01H...
  empresa_id TEXT NOT NULL,
  tipo TEXT NOT NULL,                    -- sync|backup|restore|export_config|import_config
  nombre TEXT NOT NULL,                  -- "SAE Sync Ventas", etc.
  payload_json TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'pendiente', -- pendiente|ejecutando|ok|error|cancelado
  progreso INTEGER NOT NULL DEFAULT 0,   -- 0..100
  mensaje TEXT,
  creado_en TEXT NOT NULL,
  iniciado_en TEXT,
  terminado_en TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_empresa ON cola_trabajos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_jobs_estado ON cola_trabajos (estado);
CREATE INDEX IF NOT EXISTS idx_jobs_tipo ON cola_trabajos (tipo);

-- =========================
-- Backups registrados (historial)
-- =========================
CREATE TABLE IF NOT EXISTS respaldos (
  id TEXT PRIMARY KEY,                   -- bkp_01H...
  empresa_id TEXT NOT NULL,
  ruta_archivo TEXT NOT NULL,            -- path al ZIP
  manifest_json TEXT NOT NULL,           -- JSON con tamaños, fechas, version app
  creado_en TEXT NOT NULL,
  creado_por_usuario_id TEXT,
  FOREIGN KEY (creado_por_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_respaldos_empresa ON respaldos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_respaldos_fecha ON respaldos (creado_en);

-- =========================
-- Configuración de rutas (AppData) y archivos
-- =========================
CREATE TABLE IF NOT EXISTS configuracion_local (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL
);

INSERT OR IGNORE INTO configuracion_local (id, config_json, actualizado_en)
VALUES (1, '{"data_dir":"","duckdb_path":"","sqlite_path":""}', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
```

### Notas de implementación (importantes)

* `layout_json` es tu “fuente de verdad” del panel. No necesitas tabla `widgets` si todo vive dentro del JSON.
* `estado_sincronizacion.ultimo_checkpoint_json` te guarda `last_key`, `window_days`, etc.
* `cola_trabajos` permite UI con “Progreso / Último error”.

---

## 2) Ejemplos completos de `layout_json` (panel con 2 widgets: línea y tabla)

> Estos ejemplos son exactamente lo que guardarías en `paneles.layout_json` como `TEXT`.

### 2.1 Panel “Ventas” (línea + tabla)

```json
{
  "schema_version": 1,
  "panel": {
    "id": "pan_01HZZA0VENTAS0000000001",
    "nombre": "Ventas - Seguimiento",
    "descripcion": "Tendencia de ventas y top clientes",
    "visibilidad": "personal",
    "etiquetas": ["ventas", "seguimiento"],
    "creado_en": "2026-01-06T10:00:00-06:00",
    "actualizado_en": "2026-01-06T10:00:00-06:00"
  },
  "rejilla": {
    "columnas": 12,
    "alto_fila": 36,
    "margen": [12, 12],
    "contenedor_padding": [12, 12],
    "compactacion": "vertical",
    "bloquear_colision": false
  },
  "contexto": {
    "empresa_id": "emp_0001",
    "sistema_fuente": ["SAE"],
    "zona_horaria": "America/Mexico_City",
    "moneda": "MXN"
  },
  "widgets": [
    {
      "id": "wid_01HZZA1LINEA00000000001",
      "tipo": "linea",
      "titulo": "Ventas netas - últimos 12 meses",
      "subtitulo": "Agrupado por mes",
      "origen": {
        "motor": "duckdb",
        "dataset": "ventas_resumen_mes",
        "metrica_id": "ventas_netas_mes"
      },
      "parametros": {
        "periodo": { "modo": "ultimos_n_meses", "n": 12 },
        "filtros": [
          { "campo": "cancelado", "operador": "eq", "valor": 0 }
        ],
        "agrupar_por": ["mes"],
        "limite": 0,
        "orden": [{ "campo": "mes", "direccion": "asc" }]
      },
      "visual": {
        "formato": "moneda",
        "decimales": 2,
        "mostrar_tendencia": true,
        "comparativo": { "modo": "anio_anterior_mismo_periodo" },
        "ejes": {
          "x": { "campo": "mes", "etiqueta": "Mes" },
          "y": { "campo": "valor", "etiqueta": "Ventas netas" }
        }
      },
      "disposicion": { "x": 0, "y": 0, "w": 12, "h": 4, "minW": 6, "minH": 3, "maxW": 12, "maxH": 10 },
      "refresco": { "modo": "cache", "minutos": 0 },
      "permisos": { "roles": ["admin", "analista", "usuario"], "solo_lectura": true }
    },
    {
      "id": "wid_01HZZA2TABLA00000000001",
      "tipo": "tabla",
      "titulo": "Top 20 clientes del mes",
      "subtitulo": "Ventas netas por cliente",
      "origen": {
        "motor": "duckdb",
        "dataset": "ventas_resumen_mes",
        "metrica_id": "ventas_netas_mes"
      },
      "parametros": {
        "periodo": { "modo": "mes_actual" },
        "filtros": [
          { "campo": "cancelado", "operador": "eq", "valor": 0 }
        ],
        "agrupar_por": ["cliente"],
        "limite": 20,
        "orden": [{ "campo": "valor", "direccion": "desc" }]
      },
      "visual": {
        "columnas": [
          { "campo": "cliente", "titulo": "Cliente", "tipo": "texto" },
          { "campo": "valor", "titulo": "Ventas netas", "tipo": "moneda", "decimales": 2 }
        ],
        "paginacion": { "habilitada": true, "tamano_pagina": 20 },
        "busqueda": { "habilitada": true }
      },
      "disposicion": { "x": 0, "y": 4, "w": 12, "h": 5, "minW": 6, "minH": 3, "maxW": 12, "maxH": 12 },
      "refresco": { "modo": "cache", "minutos": 0 },
      "permisos": { "roles": ["admin", "analista", "usuario"], "solo_lectura": true }
    }
  ],
  "versionado": { "plantilla_id": null, "clonado_desde_panel_id": null }
}
```

---

## 3) Contrato JSON de Export/Import (exacto y versionado)

### 3.1 Archivo de exportación (`cenit-asp-config-export.json`)

```json
{
  "app": "CENIT ASP",
  "export_version": 1,
  "generado_en": "2026-01-06T11:00:00-06:00",
  "origen": {
    "app_version": "0.1.0",
    "sistema_operativo": "Windows",
    "equipo": "DESKTOP-XYZ",
    "usuario_etiqueta": "Sophia"
  },
  "opciones": {
    "incluir_preferencias": true,
    "incluir_paneles_compartidos": false
  },
  "preferencias": {
    "tema": "oscuro",
    "densidad": "compacta",
    "idioma": "es-MX"
  },
  "paneles": [
    {
      "panel_id": "pan_01HZZA0VENTAS0000000001",
      "nombre": "Ventas - Seguimiento",
      "visibilidad": "personal",
      "layout_json": "{...PEGA AQUÍ EL JSON COMPLETO DEL PANEL COMO STRING...}",
      "metadatos": {
        "etiquetas": ["ventas", "seguimiento"],
        "creado_en": "2026-01-06T10:00:00-06:00",
        "actualizado_en": "2026-01-06T10:00:00-06:00"
      }
    }
  ]
}
```

### 3.2 Payload de importación (endpoint)

```json
{
  "modo": "crear_nuevos",
  "renombrar_si_existe": true,
  "sufijo_importado": " (importado)",
  "aplicar_preferencias": true,
  "contenido": { "...contenido del archivo de export..." }
}
```

### Regla: regeneración de IDs al importar (obligatoria)

* Generar nuevos `panel.id` y `widgets[].id`
* Reescribir dentro del `layout_json`
* Guardar el nuevo `layout_json` en SQLite

---

## 4) Recomendación para DuckDB (solo naming base)

En DuckDB, tus datasets recomendados para arrancar:

* `ventas_resumen_mes(empresa_id, mes, cliente, vendedor, almacen, cancelado, valor)`
* (Luego) `inventario_snapshot(empresa_id, fecha, producto, almacen, existencia, costo, valor)`
* (Luego) `balanza_mes(empresa_id, mes, cuenta, naturaleza, cargos, abonos, saldo)`
