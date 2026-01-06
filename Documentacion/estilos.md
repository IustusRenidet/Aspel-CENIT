
## Paleta detectada (de tus SVGs)

* Fondo oscuro base: **#0F172A** (navy)
* Primario (acciones/enlaces): **#7067F0**
* Secundario / hover / énfasis suave: **#8B7FF5**
* Fondo claro / tarjetas suaves: **#CAF0F8**
* Acento “premium” (alertas positivas/insignias): **#F2C94C** y **#D4AF37**
* Neutro texto secundario: **#94A3B8**
* Blanco: **#FFFFFF**

---

# 1) Distribución recomendada (layout general)

## Estructura base (apta para dashboards)

**A) Barra lateral (izquierda) + B) Topbar + C) Área de trabajo**

### A) Sidebar (colapsable)

* Logo / nombre: **CENIT ASP**
* Selector de empresa (si aplica) + indicador de “fuente Aspel conectada”
* Menú:
  * **Paneles**
  * **Constructor**
  * **Reportes**
  * **Sincronización**
  * **Administración**
  * **Configuración**
* Abajo: usuario + botón de **Exportar/Importar configuración** y **Respaldos**

**Por qué sidebar:** cuando hay muchas secciones (paneles, builder, reportes, admin), es el patrón más rápido y familiar.

### B) Topbar (contexto y acciones)

* “Breadcrumb” o título del panel activo
* Buscador global (en fase 2, puede buscar métricas/widgets)
* Estado de datos:
  * **“Actualizado: 11:15”**
  * botón **Actualizar ahora**
  * indicador de job (spinner + % cuando esté corriendo)
* Acciones rápidas del panel:
  * **Editar**
  * **Guardar**
  * **Guardar como**
  * **Compartir/Plantilla** (si es corporativo)

### C) Área de trabajo

* Vista principal (Dashboard grid)
* Panel lateral derecho (drawer) para editar widget cuando seleccionas uno:
  * Métrica
  * Periodo
  * Filtros
  * Agrupaciones
  * Visual (tipo, formato moneda, decimales)
  * Permisos (si aplica)

---

# 2) Navegación (flujo mental del usuario)

Te propongo una navegación con 2 niveles: “ver” vs “construir”.

## Sección: Paneles

* Lista de paneles:
  * **Corporativos** (compartidos por empresa)
  * **Personales** (solo del usuario)
* Acciones:
  * Crear panel desde plantilla
  * Clonar panel corporativo → “Mi panel”
  * Importar configuración (JSON)

## Sección: Constructor

* “Biblioteca de widgets” (plantillas)
* “Crear widget” (wizard de 3 pasos):
  1. Selecciona métrica/dataset
  2. Filtros/periodo/agrupación
  3. Tipo de visual (KPI/linea/barras/tabla/alerta) + formato

## Sección: Sincronización

* Estado por sistema/dataset:
  * SAE: ventas_resumen_mes — OK 11:15
  * COI: balanza_mes — OK 10:30
* Botones por dataset:
  * Ejecutar ahora
  * Ver historial/errores

## Sección: Respaldos

* Crear respaldo (ZIP)
* Restaurar respaldo
* Retención (automático diario/semanal)

---

# 3) Diseño visual (cómo usar tu paleta sin saturar)

## Tema recomendado: oscuro “pro”

* **Fondo app** : #0F172A
* **Tarjetas/paneles** : usa tonos cercanos al fondo (un navy ligeramente más claro) y deja **#CAF0F8** para:
* highlights
* estados vacíos elegantes
* banners informativos
* tooltips/callouts

## Jerarquía de color (regla simple)

* **#7067F0** = acción primaria (botones “Actualizar”, “Guardar”, “Crear”)
* **#8B7FF5** = hover/selección/estado activo (tab activo, item seleccionado)
* **#F2C94C / #D4AF37** = “insignias premium” y alertas positivas / advertencias suaves
  (no lo uses como primario, si no se vuelve “casino”)
* **#94A3B8** = texto secundario, labels, hints
* **#FFFFFF** = texto principal sobre fondo oscuro

## Componentes (look & feel recomendado)

* Cards con borde sutil + sombra mínima
* Tablas con:
  * encabezado fijo
  * filas densidad “compacta”
  * búsqueda dentro de la tabla
* Gráficas: fondo transparente, gridlines discretas

---

# 4) Pantalla de Panel (Dashboard) — distribución recomendada

## Arriba (resumen rápido)

Fila de **KPI widgets** (4–6 máximo):

* Ventas netas
* Margen
* Cobranza
* Inventario valorizado
* Alertas (negativos, vencidos, etc.)

## Centro (tendencias)

2 columnas:

* Izquierda: línea 12 meses (ventas)
* Derecha: barras (top 10 clientes / productos)

## Abajo (detalle)

* Tabla con top clientes / documentos / partidas (virtualizada)
* Drill-down: clic abre modal o vista detalle

---

# 5) Personalización sin perder control

Tu decisión “corporativo + personal” se refleja así:

* Los **paneles corporativos** se muestran como “bloqueados” (badge dorado discreto).
* El usuario puede **Clonar** y ahí sí mover/editar.
* Los **paneles personales** se pueden exportar/importar.

En UI: un switch visible:

* “Estoy viendo: Corporativo” / “Estoy viendo: Personal”

---

# 6) Detalles que mejoran mucho la experiencia

* Un **“modo edición”** para el dashboard:
  * fuera de edición: widgets no se mueven (evitas arrastres accidentales)
  * en edición: drag/resize + guardar/cancelar
* Cada widget muestra:
  * mini estado: “cache” y “actualizado a las 11:15”
  * menú (⋮): duplicar, cambiar tipo, exportar widget, eliminar
* Un “Centro de estado” (icono en topbar):
  * muestra progreso ETL, errores y último OK por dataset

---

## Recomendación final (la más importante)

Con tu paleta (navy + morados + acento dorado), lo que mejor se ve y mejor funciona es:

* **Tema oscuro estable**
* **Morado como primario**
* **Dorado solo como acento (badges/estados)**
* Layout: **sidebar + topbar + dashboard grid**
* Edición de widgets mediante **panel lateral derecho (drawer)**

Si quieres, te armo un **wireframe textual** (pantalla por pantalla con secciones) o un **mini “design system”** con tokens (colores, tamaños, tipografías, espaciado) para que tu interfaz quede consistente desde el día 1.
