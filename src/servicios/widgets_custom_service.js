'use strict';
/**
 * WidgetsCustomService — persiste widgets del usuario en config/widgets_custom.json
 * Compatible con el enfoque JSON-file de PanelesService (sin SQLite extra por ahora).
 */

const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('crypto');

const ARCHIVO = path.join(process.cwd(), 'config', 'widgets_custom.json');

class WidgetsCustomService {
    _leer() {
        if (!fs.pathExistsSync(ARCHIVO)) return [];
        const data = fs.readJsonSync(ARCHIVO, { throws: false });
        return Array.isArray(data) ? data : [];
    }

    _escribir(widgets) {
        fs.ensureDirSync(path.dirname(ARCHIVO));
        fs.writeJsonSync(ARCHIVO, widgets, { spaces: 2 });
    }

    listar() {
        return this._leer().slice(); // copia para no mutar
    }

    obtener(id) {
        return this._leer().find(w => w.id === id) || null;
    }

    /**
     * Guarda o actualiza un widget personalizado.
     * Campos esperados en `datos`:
     *   nombre, descripcion?, sistema, sql, params_sql?, params_dinamicos?,
     *   tipo_viz, color_primario?, columnas_visibles?, columnas_resultado?,
     *   tipo_origen ('sql_libre'|'asistente_ia'), interpretacion_tipo?
     */
    guardar(datos) {
        const widgets = this._leer();
        const ahora = new Date().toISOString();

        const widget = {
            id: datos.id || randomUUID(),
            nombre: String(datos.nombre || 'Widget sin nombre').slice(0, 120),
            descripcion: String(datos.descripcion || '').slice(0, 400),
            sistema: datos.sistema || null,
            sql: datos.sql || null,
            params_sql: datos.params_sql && typeof datos.params_sql === 'object' ? datos.params_sql : {},
            params_dinamicos: Array.isArray(datos.params_dinamicos) ? datos.params_dinamicos : [],
            tipo_viz: datos.tipo_viz || 'tabla',
            color_primario: datos.color_primario || '#6366f1',
            columnas_visibles: Array.isArray(datos.columnas_visibles) ? datos.columnas_visibles : [],
            columnas_resultado: Array.isArray(datos.columnas_resultado) ? datos.columnas_resultado : [],
            tipo_origen: datos.tipo_origen || 'sql_libre',
            interpretacion_tipo: datos.interpretacion_tipo || null,
            params_override: datos.params_override || null,
            creado_en: datos.creado_en || ahora,
            actualizado_en: ahora,
        };

        const idx = widgets.findIndex(w => w.id === widget.id);
        if (idx >= 0) {
            widget.creado_en = widgets[idx].creado_en; // preservar fecha original
            widgets[idx] = widget;
        } else {
            widgets.unshift(widget);
        }

        this._escribir(widgets);
        return widget;
    }

    eliminar(id) {
        const widgets = this._leer();
        const resto = widgets.filter(w => w.id !== id);
        if (resto.length === widgets.length) return false;
        this._escribir(resto);
        return true;
    }
}

module.exports = new WidgetsCustomService();
