'use strict';

const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('crypto');

const ARCHIVO_PANELES = path.join(process.cwd(), 'config', 'paneles.json');

class PanelesService {
    _leer() {
        if (!fs.pathExistsSync(ARCHIVO_PANELES)) return [];
        const data = fs.readJsonSync(ARCHIVO_PANELES, { throws: false });
        return Array.isArray(data) ? data : [];
    }

    _escribir(paneles) {
        fs.ensureDirSync(path.dirname(ARCHIVO_PANELES));
        fs.writeJsonSync(ARCHIVO_PANELES, paneles, { spaces: 2 });
    }

    listar() {
        return this._leer().map(({ widgets: _w, ...resumen }) => resumen);
    }

    obtener(id) {
        return this._leer().find((p) => p.id === id) || null;
    }

    guardar(datos) {
        const paneles = this._leer();
        const ahora = new Date().toISOString();

        const panel = {
            id: datos.id || randomUUID(),
            nombre: String(datos.nombre || 'Dashboard sin nombre').slice(0, 120),
            objetivo: String(datos.objetivo || '').slice(0, 400),
            sistemas: Array.isArray(datos.sistemas) ? datos.sistemas : [],
            widgets: Array.isArray(datos.widgets) ? datos.widgets : [],
            creado_en: datos.creado_en || ahora,
            actualizado_en: ahora,
            vizTypes: datos.vizTypes || {}
        };

        const existeIdx = paneles.findIndex((p) => p.id === panel.id);
        if (existeIdx >= 0) {
            paneles[existeIdx] = panel;
        } else {
            paneles.unshift(panel);
        }

        this._escribir(paneles);
        return panel;
    }

    eliminar(id) {
        const paneles = this._leer();
        const restantes = paneles.filter((p) => p.id !== id);
        if (restantes.length === paneles.length) return false;
        this._escribir(restantes);
        return true;
    }
}

module.exports = PanelesService;
