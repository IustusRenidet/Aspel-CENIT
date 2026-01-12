# Plan de Mejora del Diccionario de Datos

Este documento describe la implementación de la nueva arquitectura de diccionario basada en **Niveles (Técnico -> Semántico -> Runtime)**.

## Estructura de Archivos

### 1. Insumos (Overrides)
Ubicación: `overrides/`
Archivos: `SAE.yaml`, `COI.yaml`, `NOI.yaml`, `BANCO.yaml`
Función: Definiciones manuales de negocio, descripciones amigables y relaciones inferidas que no existen en la base de datos física.

### 2. Diccionarios Consolidados (JSON)
Ubicación: `diccionario/`
Archivos: `semantica_SAE.json`, `semantica_COI.json`, etc.
Función: Resultado de mezclar el **Catálogo Técnico** con los **Overrides**. Contienen toda la información rica (tipos de datos inferidos, tags, módulos).
*Se generan con el script `scripts/generar_diccionario_mejorado.js`*

### 3. Configuración Runtime (YAML)
Ubicación: `src/semantica/yaml/catalogo/`
Archivos: `SAE.yaml`, `COI.yaml`, etc.
Función: Versión simplificada y optimizada para lectura rápida por el backend. Define dataset, descripción y campos con su tipo semántico (clave, dinero, fecha).
*Se generan con el script `scripts/generar_diccionario_mejorado.js`*

### 4. Definición de Métricas y Paneles
Ubicación: `src/semantica/yaml/metricas/` y `src/semantica/yaml/paneles_plantilla/`
Función: Define los KPIs disponibles para el usuario y los tableros por defecto.
*Estos archivos son estáticos y editables por el analista de negocio.*

## Scripts Implementados

### `scripts/generar_overrides_iniciales.js`
Genera los archivos YAML iniciales en `overrides/` leyendo los JSONs de esquemas antiguos (`Esquemas/sae_tablas_por_modulo.json`, etc.).
**Uso:** Ejecutar una veza para poblar la carpeta `overrides`.

### `scripts/generar_diccionario_mejorado.js`
El motor principal. Lee `diccionario/catalogo_tecnico_*.json` y `overrides/*.yaml`.
Genera:
1. `diccionario/semantica_*.json` (Enriquecido)
2. `src/semantica/yaml/catalogo/*.yaml` (Runtime)

## Siguientes Pasos
1. Revisar y ajustar manualmente los archivos en `overrides/` para mejorar descripciones.
2. Definir más métricas en `src/semantica/yaml/metricas/`.
3. Conectar el backend para que lea los YAML de `src/semantica/yaml/catalogo` en lugar de consultar la base de datos cruda para metadatos.
