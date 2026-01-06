# CENIT ASP — Recopilación completa definida

## 1) Identidad del producto

**CENIT ASP** es una suite de **análisis y visualización** para empresas que usan **Aspel (SAE, COI, NOI, BANCO)**.

* Se conecta a Firebird en **solo lectura**
* Construye una **capa analítica local** para dashboards rápidos
* Permite **paneles (dashboards) personalizables** por widgets
* Evita consultar Firebird para cada render / reporte

## Objetivos funcionales

1. **Conectar** por empresa a uno o varios sistemas (SAE/COI/NOI/BANCO).
2. **Detectar** instalaciones y empresas (por rutas y nombres por defecto, con override).
3. **Sincronizar** datos (ETL incremental controlado).
4. **Construir** datasets analíticos en DuckDB.
5. **Configurar** dashboards con widgets declarativos (YAML + constructor).
6. **Persistir** layout y preferencias (JSON en SQLite).
7. **Exportar/Importar** configuración de paneles entre usuarios.
8. **Respaldar/Restaurar** SQLite + DuckDB.
9. **Actualizar** el aplicativo por auto-update.

---

## 2) Arquitectura (definida)

### Desktop (fase 1)

* **Electron** como apps de escritorio
* **Express** como backend local en **proceso separado** (`src/servidor.js`)
* UI React en el renderer
* Comunicación UI ↔ backend por HTTP local (127.0.0.1)

### Datos (todas en archivo, nada in-memory)

* Fuente: **Firebird** (Aspel) vía **`node-firebird-driver-native`**
* Configuración/estado: **SQLite (archivo)** con `better-sqlite3`
* Cache analítica: **DuckDB (archivo)**

### Ubicación de datos

* **AppData por usuario** (sin permisos admin; sobrevive actualizaciones)
* Funciones para:

  * **Exportar/Importar configuración** de paneles
  * **Backups** (SQLite + DuckDB)
  * **Restore** desde zip

---

## 3) Stack tecnológico completo (definido y recomendado)

## 3.1 Plataforma y empaquetado

* **Node.js**
* **npm**
* **Electron**
* **electron-builder** (NSIS + portable)
* **asar** + `asarUnpack` (para módulos nativos)
* **electron-updater** (auto update)
* electron-rebuild
* cross-env
* esbuild
* **auto-launch** (inicio con Windows; opcional)

## 3.2 Backend local (API)

* **Express**
* **helmet**
* **Joi** (validación)
* **bcryptjs** (hash contraseñas)
* cooki-parser
* Autenticación:

  * **express-session** (válido para desktop local)
  * o **jsonwebtoken (JWT)** (si preparas futuro “web”)

> Para fase 1 desktop: sesiones suelen ser más simples. JWT puede quedar preparado si lo deseas.

## 3.3 Datos y conectores

* Firebird: **`node-firebird-driver-native`** (pool, rendimiento)
* **better-sqlite3** (SQLite archivo)
* **DuckDB** (archivo)

## 3.4 UI / Frontend

* **React**
* **ReactDOM**
* **Bootstrap 5**
* **SCSS**
* SVG
* anime.js
* **React Spring** (parallax/animaciones)
* **Chart.js** (gráficas)
* **react-grid-layout** (grid de widgets arrastrables)
* **react-window** (virtualización para tablas grandes)
* Breadcrumb + Top Panel (UI definida)

## 3.5 Importación/Exportación y reportes

* **xlsx**
* **csv-parse**
* (Opcional) **PDFKit** para reportes PDF formales

## 3.6 Build y calidad

* **cross-env**
* **esbuild**
* **node --test**

---

## 4) Diseño de frontend (definido)

### Principios de UX/Performance

* **Dashboard grid** con widgets (drag/resize)
* **Constructor de widgets** (elige métrica + filtros + visual)
* Virtualización en tablas grandes
* Lazy loading de dashboards y widgets
* Parallax (React Spring) como capa estética, no crítica

### Tipos de widgets (definidos)

* KPI
* Gráfica de línea
* Gráfica de barras
* Tabla
* Alertas

### Modelo de paneles

* **Panel corporativo compartido** (plantilla base)
* **Panel personal por usuario** (clonable y personalizable)

Persistencia:

* **layout_json** guardado **tal cual** como TEXT en SQLite.

---

## 5) Sincronización y actualización de datos (definido)

### Concepto

CENIT ASP no depende de “tiempo real”.
Funciona con **sincronización incremental controlada**:

* Programada cada X minutos (configurable)
* Manual (“Actualizar ahora”)
* Por dataset (solo ventas, solo inventario, etc.)

### ¿Cuándo se ve un cambio hecho en Aspel?

* En el siguiente ciclo programado, o
* Al terminar el refresh manual

**Siempre se muestra**:

* “Última actualización: fecha/hora”
* Estado del job y errores

Estrategia incremental:

* `sync_state` en SQLite define:

  * `last_run_at`
  * `last_key` (folio/fecha)
  * `window_days` (recalcular ventana reciente para capturar ediciones retroactivas)

---

## 6) Configuración export/import (definido)

### Exporta (JSON)

* Paneles, widgets, layout_json
* Preferencias UI

### NO exporta

* Usuarios/contraseñas
* credenciales Firebird
* datos analíticos DuckDB

Import:

* Regenera IDs para evitar conflictos
* Crea paneles nuevos (“(importado)”)

---

## 7) Backups (definido)

Archivos:

* `cenit.sqlite3`
* `analytics.duckdb`

Modalidades:

* Manual (zip)
* Automático (diario/semanal + retención)

Restore:

* lock global
* cierre conexiones
* reemplazo archivos
* reinicio backend

---

## 8) YAML (capa semántica) — definido

Tres grupos:

1. **Catálogo técnico**: tablas/campos/reglas
2. **Métricas**: definiciones declarativas
3. **Paneles plantilla**: dashboards base

El usuario crea widgets sin escribir SQL.

---

# 9) Estructura de carpetas

```
ASPEL-CENIT/
├─ package.json
├─ principal.js                          # Electron main
├─ precarga.js                           # preload (contextBridge)
│
├─ electron/
│  ├─ ventanas/
│  │  ├─ ventana_principal.js
│  │  └─ ventana_splash.js
│  ├─ actualizaciones/
│  │  ├─ auto_actualizacion.js           # electron-updater
│  │  └─ canales_release.js
│  ├─ inicio_windows/
│  │  └─ auto_inicio.js                  # auto-launch (opcional)
│  └─ seguridad/
│     ├─ csp.js
│     └─ permisos.js
│
├─ src/
│  ├─ servidor.js                        # Express (proceso separado)
│  │
│  ├─ rutas/
│  │  ├─ autenticacion.rutas.js
│  │  ├─ paneles.rutas.js
│  │  ├─ widgets.rutas.js
│  │  ├─ datos_analiticos.rutas.js       # DuckDB datasets
│  │  ├─ sincronizacion.rutas.js         # ETL / jobs
│  │  ├─ exportacion_config.rutas.js     # export/import paneles
│  │  └─ respaldos.rutas.js              # backup/restore
│  │
│  ├─ controladores/
│  │  ├─ autenticacion.ctrl.js
│  │  ├─ paneles.ctrl.js
│  │  ├─ widgets.ctrl.js
│  │  ├─ datos_analiticos.ctrl.js
│  │  ├─ sincronizacion.ctrl.js
│  │  ├─ exportacion_config.ctrl.js
│  │  └─ respaldos.ctrl.js
│  │
│  ├─ middleware/
│  │  ├─ seguridad_helmet.js
│  │  ├─ sesiones_o_jwt.js
│  │  ├─ validar_joi.js
│  │  └─ errores.js
│  │
│  ├─ configuracion/
│  │  ├─ entorno.js                      # dotenv
│  │  ├─ rutas_appdata.js                # paths AppData
│  │  └─ parametros.js                   # defaults (intervalos, etc.)
│  │
│  ├─ almacenamiento/
│  │  ├─ sqlite/
│  │  │  ├─ indice.js
│  │  │  ├─ migraciones/
│  │  │  └─ repositorios/
│  │  └─ duckdb/
│  │     ├─ indice.js
│  │     ├─ esquema/
│  │     └─ repositorios/
│  │
│  ├─ conectores/
│  │  └─ firebird/
│  │     ├─ indice.js                    # node-firebird-driver-native wrapper
│  │     ├─ pool.js
│  │     ├─ consultas.js
│  │     └─ errores.js
│  │
│  ├─ etl/
│  │  ├─ programador.js                  # scheduler
│  │  ├─ cola_trabajos.js                # jobs en sqlite
│  │  ├─ trabajos/
│  │  │  ├─ SAE/
│  │  │  ├─ COI/
│  │  │  ├─ NOI/
│  │  │  └─ BANCO/
│  │  ├─ transformaciones/
│  │  └─ carga/
│  │     ├─ cargar_duckdb.js
│  │     └─ checkpoints.js               # sync_state
│  │
│  ├─ semantica/
│  │  ├─ yaml/
│  │  │  ├─ catalogo/
│  │  │  ├─ metricas/
│  │  │  └─ paneles_plantilla/
│  │  ├─ cargador_yaml.js
│  │  ├─ validador_yaml.js
│  │  └─ resolvedor_metricas.js
│  │
│  ├─ reportes/
│  │  ├─ pdf/
│  │  └─ exportaciones/
│  │
│  ├─ respaldos/
│  │  ├─ crear_respaldo.js
│  │  ├─ restaurar_respaldo.js
│  │  └─ retencion.js
│  │
│  └─ utilidades/
│     ├─ bloqueos.js
│     ├─ ids.js
│     └─ archivos.js
│
├─ interfaz/                             # React renderer
│  ├─ index.html
│  ├─ esbuild.config.js
│  └─ src/
│     ├─ principal.jsx
│     ├─ app.jsx
│     ├─ api/
│     ├─ paginas/
│     ├─ componentes/
│     │  ├─ rejilla_panel.jsx            # react-grid-layout
│     │  └─ marco_widget.jsx
│     ├─ widgets/
│     │  ├─ widget_kpi.jsx
│     │  ├─ widget_linea.jsx
│     │  ├─ widget_barras.jsx
│     │  ├─ widget_tabla.jsx
│     │  └─ widget_alerta.jsx
│     ├─ estado/
│     ├─ estilos/
│     └─ animaciones/
│        └─ parallax_react_spring.js
│
├─ recursos/
│  ├─ iconos/
│  ├─ fuentes/                           # Manrope si la empaquetas local
│  └─ plantillas_iniciales/              # YAML base
│
├─ scripts/
│  ├─ gestionar_nativos.js               # Node vs Electron (rebuild)
│  ├─ inicializar_datos.js               # crea DBs en AppData
│  └─ migrar_sqlite.js
│
└─ docs/
   ├─ arquitectura.md
   ├─ frontend.md
   ├─ sincronizacion.md
   ├─ respaldos.md
   └─ seguridad.md

```
