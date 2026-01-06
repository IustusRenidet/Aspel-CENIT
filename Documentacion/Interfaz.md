
# 1) Mapa de navegación definitivo

## Rutas (router) y jerarquía

1. `/auth/login`
2. `/auth/registro`
3. `/app` (shell con sidebar + topbar + breadcrumb)
   * `/app/paneles`
   * `/app/panel/:panelId`
   * `/app/constructor` (wizard de widget)
   * `/app/sincronizacion`
   * `/app/empresas`
   * `/app/empresas/:empresaId/conexiones`
   * `/app/respaldos`
   * `/app/configuracion`

**Regla:** dentro de `/app` todo depende de la  **empresa activa** .

---

# 2) Layout base (Shell UI)

## Sidebar (izquierda)

Secciones:

* Paneles
* Constructor
* Sincronización
* Reportes (opcional inicial)
* Empresas y Conexiones
* Respaldos
* Configuración

Elementos fijos:

* Logo SVG + nombre **CENIT ASP**
* **Selector de empresa activa**
* Al pie:
  * Usuario
  * Exportar/Importar configuración

### Comportamiento

* Sidebar colapsable
* Item activo resaltado en morado (tu paleta)
* Sistemas habilitados se muestran como “chips” cerca del selector de empresa: `SAE | COI | NOI | BANCO`

---

## Topbar (arriba)

* **Breadcrumb** (siempre visible)
* Acciones rápidas a la derecha:
  * `Actualizar ahora` (si hay sistemas habilitados)
  * Estado de sincronización (icono + badge con jobs activos)
  * “Datos actualizados: HH:MM” (por dataset/panel)

Microinteracciones:

* `anime.js` para:
  * check de “Actualizado”
  * spinner suave en “Sincronizando…”
* `React Spring` solo para parallax en pantallas no críticas (Login/Empty State)

---

# 3) Pantallas (modelado completo)

## 3.1 Login `/auth/login`

**Objetivo:** entrar rápido sin fricción.

* Card centrada
* Fondo con parallax ligero (React Spring)
* Inputs Bootstrap + SCSS
* Botón primario (morado)
* Link a registro

Estados:

* error credenciales
* cargando

---

## 3.2 Registro `/auth/registro`

* Usuario, nombre, correo opcional, password
* Crea usuario en SQLite local
* Rol default: `usuario` (admin por seed)

---

## 3.3 Empresas `/app/empresas`

Lista (cards o tabla):

* Nombre
* Sistemas habilitados (chips)
* Última verificación (OK/warn/error)
* Botones:
  * **Abrir**
  * **Conexiones**
  * **Eliminar** (con confirmación)

Acción principal:

* **Crear empresa**

Empty state:

* SVG + texto + botón “Crear empresa” (aquí puedes usar parallax suave)

---

## 3.4 Crear/Editar empresa (modal o page)

Campos:

* Nombre empresa (obligatorio)
* Notas (opcional)

Botones:

* Guardar
* Guardar y configurar conexiones (te lleva directo a Conexiones)

---

## 3.5 Conexiones por empresa `/app/empresas/:empresaId/conexiones`

Aquí es donde se materializa tu lógica.

### Diseño recomendado: Wizard + Vista avanzada

En la parte superior:

* “Empresa: Sophia”
* Breadcrumb: `Empresas > Sophia > Conexiones`

Tabs:

1. **Asistente** (Wizard)
2. **Avanzado** (tabla editable)

---

### 3.5.1 Tab: Asistente (Wizard)

#### Paso 1 — Detectar instalaciones Aspel

Escanea:
`C:\Program Files (x86)\Common Files\Aspel\Sistemas Aspel\`

Detecta carpetas y las mapea:

* BAN6.00 → BANCO
* COI10.00, COI11.00 → COI
* NOI10.00, NOI11.00 → NOI
* SAE7.00, SAE8.00, SAE9.00 → SAE

UI por sistema (tarjeta):

* Nombre sistema + icono SVG
* Versiones encontradas (dropdown)
* Toggle **Habilitar**
* Estado: “Detectado” / “No instalado”

Microinteracción anime.js:

* al detectar versiones: contador + check animado

Botón:

* “Continuar”

---

#### Paso 2 — Detectar empresas por sistema habilitado (método A)

Por cada sistema habilitado:

* Busca carpetas tipo:
  * COI: `Datos\Empresa1`, `Datos\Empresa2`…
  * BANCO: `Datos\Empresa01`, `Datos\Empresa02`…
  * NOI: `Datos\Empresa01`…
  * SAE: `Empresa01\Datos\` (según versión)

UI:

* Acordeón por sistema
* Dentro, tabla:
  * Carpeta empresa detectada (Empresa01/Epresa1)
  * Archivo FDB detectado (por default)
  * Ruta completa
  * Botón: **Usar**
  * Botón: **Personalizar ruta** (file picker a .FDB)

**Regla:** aunque detecte un `.FDB` con nombre por default, permites:

* cambiar a otro `.FDB` dentro de la carpeta
* o seleccionar uno diferente fuera

Botón:

* “Continuar”

---

#### Paso 3 — Asignar conexiones definitivas a la empresa

Tabla final por empresa activa “Sophia”:

Columnas:

* Sistema (SAE/COI/NOI/BANCO)
* Versión
* Ruta FDB (editable)
* Botón “Elegir archivo”
* Botón “Verificar”
* Estado (OK/Error)

Botón global:

* **Verificar todo**

---

#### Paso 4 — Resultado y guardado

Resumen:

* Sistemas habilitados
* Conexiones OK
* Conexiones con error

Botones:

* Guardar
* Guardar y abrir Paneles

---

### 3.5.2 Tab: Avanzado (tabla editable)

Para usuarios pro/soporte:

* Un grid editable tipo “config”
* Permite:
  * habilitar/deshabilitar
  * cambiar versión
  * cambiar ruta
  * ver logs de error
  * re-verificar

---

## 3.6 Paneles `/app/paneles`

Arriba:

* Filtros por sistema: `Todos | SAE | COI | NOI | BANCO`
* Toggle: `Corporativos | Personales`
* Botón: **Nuevo panel**
* Botón: **Importar configuración**

Lista de paneles:

* Card con:
  * nombre
  * sistema principal (chip)
  * tipo (corporativo/personal)
  * acciones: abrir, clonar, exportar, eliminar

**Regla:** solo se muestran paneles de sistemas habilitados.

---

## 3.7 Vista de Panel `/app/panel/:panelId`

Topbar:

* Breadcrumb: `Paneles > SAE > Ventas - Seguimiento`
* Acciones:
  * Modo edición (switch)
  * Guardar / Cancelar
  * Guardar como
  * Exportar panel

Cuerpo:

* `react-grid-layout` con widgets
* Click en widget abre Drawer derecho:
  * Métrica
  * Periodo
  * Filtros
  * Agrupar
  * Visual
  * Guardar cambios

Estados por widget:

* “Actualizado a HH:MM”
* “Sin datos”
* “Error” (botón ver detalle)

---

## 3.8 Constructor `/app/constructor`

Wizard de widget (3 pasos):

1. Seleccionar sistema y métrica (desde YAML)
2. Configurar periodo, filtros, agrupación
3. Seleccionar visual y preview

Botón:

* “Agregar al panel actual” o “Crear widget”

---

## 3.9 Sincronización `/app/sincronizacion`

Vista tipo tabla por empresa:

* Sistema
* Dataset
* Último OK
* Último error
* Política (cada X min, ventana Y)
* Botón “Ejecutar ahora”
* Botón “Ver historial”

Incluye un panel de jobs:

* cola_trabajos con progreso

---

## 3.10 Respaldos `/app/respaldos`

Sección:

* Crear respaldo (ZIP) ahora
* Configurar backups automáticos (diario/semanal + retención)
* Lista de respaldos con:
  * fecha
  * tamaño
  * restaurar

---

# 4) Endpoints backend (los mínimos para esta UI)

## Auth

* `POST /api/auth/login`
* `POST /api/auth/registro`
* `POST /api/auth/logout` (si usas sesiones)

## Empresas / Conexiones

* `GET /api/empresas`
* `POST /api/empresas`
* `PUT /api/empresas/:id`
* `DELETE /api/empresas/:id`
* `POST /api/conexiones/detectar-instalaciones`
  * devuelve versiones detectadas por sistema
* `POST /api/conexiones/detectar-empresas`
  * input: sistemas habilitados + versiones
  * output: rutas detectadas por sistema (Empresa01…)
* `PUT /api/empresas/:id/conexiones`
  * guarda rutas definitivas + habilitados
* `POST /api/empresas/:id/conexiones/verificar`
  * verifica conexión por sistema / o todas

## Paneles

* `GET /api/paneles?empresa_id=...&sistema=SAE&visibilidad=personal`
* `POST /api/paneles`
* `PUT /api/paneles/:id`
* `DELETE /api/paneles/:id`
* `POST /api/paneles/:id/exportar`
* `POST /api/paneles/importar`

## Widgets/Datos

* `POST /api/widgets/resolver` (ya definido)
* `GET /api/sincronizacion/estado`
* `POST /api/sincronizacion/ejecutar`

## Respaldos

* `POST /api/respaldos/crear`
* `POST /api/respaldos/restaurar`
* `GET /api/respaldos/listar`

---

# 5) Detalles de implementación UI con tus librerías

## Bootstrap + SCSS

* Bootstrap para grid, forms, modals, table base
* SCSS para:
  * tokens de color (morado/navy/oro)
  * estados (ok/warn/error)
  * sidebar/topbar
  * cards de sistemas

## SVG

* Un set de íconos por:
  * sistemas (SAE/COI/NOI/BANCO)
  * estados (ok/error/warn)
  * acciones (editar, exportar, verificar)

## anime.js

Usos recomendados:

* animación de detección (Paso 1)
* animación de verificación (Paso 4)
* feedback de “guardado”
* progress bar de jobs

## React Spring

* login/registro y empty states
* no aplicarlo a dashboards (por performance)

---

# 6) Lo más importante: cómo modelas “habilitar sistemas” y “mostrar paneles”

Reglas UI:

1. Empresa activa → determina sistemas habilitados.
2. Si COI está deshabilitado → no se ve:
   * paneles COI
   * métricas COI en constructor
   * datasets COI en sincronización
3. Si está habilitado pero no verificado → se ve, pero con badge:
   * “No verificado”
   * botones que dependen de data (sync/metrics) se bloquean hasta verificar.

---

# 7) Resultado final: experiencia del usuario (sin confusión)

1. Login
2. Crear empresa “Sophia”
3. Wizard:
   * detecta instalaciones
   * detecta empresas
   * asigna rutas por sistema
   * verifica todo
4. Abre Paneles → ya ve SAE/COI/NOI/BANCO según habilitados
5. Edita/crea widgets con constructor

---

Si quieres, el siguiente paso para que quede totalmente accionable es que te entregue:

* el **payload exacto** de `POST /api/conexiones/detectar-instalaciones`
* el **payload exacto** de `POST /api/conexiones/detectar-empresas` (método A)
* y el **modelo SQLite** para `empresas` + `conexiones_empresa` (DDL en español) que soporte múltiples sistemas, versión, ruta, habilitado, verificado, último error.
