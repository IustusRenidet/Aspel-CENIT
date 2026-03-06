/* ==============================================================
   CENIT IA — modules/widgets.js
   Gestión de widgets guardados + Wizard de creación (4 pasos)
   ============================================================== */

import { state } from './state.js';
import { API, api } from './api.js';
import {
    esc, fmt, toast, loading,
    destroyChart, renderizarEnContenedor
} from './ui.js';
import { callbacks } from './registry.js';

// ── ═══════════════ MIS WIDGETS ═══════════════ ───────────────

export async function cargarMisWidgets() {
    const container = document.getElementById('mis-widgets-lista');
    const vacio = document.getElementById('mis-widgets-vacio');
    container.innerHTML = '<p class="loading-text" role="status">Cargando...</p>';
    try {
        const { ok, widgets } = await api(`${API}/widget-studio/mis-widgets`);
        if (!ok) throw new Error('Error cargando widgets');
        container.innerHTML = '';
        if (!widgets || !widgets.length) { vacio.classList.remove('hidden'); return; }
        vacio.classList.add('hidden');
        container.innerHTML = widgets.map(w => renderMisWidgetCard(w)).join('');
    } catch (err) {
        container.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
    }
}

export function renderMisWidgetCard(w) {
    const vizIcons = { tabla: '⊞', barra: '▊', linea: '╱', pastel: '◑', kpi: '◈' };
    const icono = vizIcons[w.tipo_viz] || '⊞';
    const sistemaColor = { COI: '#6366f1', SAE: '#22c55e', NOI: '#f59e0b', BANCO: '#3b82f6' }[w.sistema] || '#888';
    const fecha = w.actualizado_en
        ? new Date(w.actualizado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
        : '—';
    const tieneDinamicos = w.params_dinamicos && w.params_dinamicos.length > 0;
    return `<div class="widget-card-guardado" data-id="${esc(w.id)}">
    <div class="wcg-header" style="border-left-color:${esc(w.color_primario || '#6366f1')}">
      <span class="wcg-viz" aria-hidden="true">${icono}</span>
      <span class="wcg-name">${esc(w.nombre)}</span>
      <span class="wcg-sistema" style="background:${sistemaColor}22;color:${sistemaColor}">${esc(w.sistema || '?')}</span>
    </div>
    ${w.descripcion ? `<p class="wcg-desc">${esc(w.descripcion)}</p>` : ''}
    ${tieneDinamicos ? `<p class="wcg-params">⚙ Params: ${w.params_dinamicos.map(p => `<code>:${esc(p)}</code>`).join(', ')}</p>` : ''}
    <div class="wcg-footer">
      <span class="wcg-date">Act. ${fecha}</span>
      <div class="wcg-actions">
        <button class="btn btn-primary btn-xs wcg-btn-run" data-id="${esc(w.id)}" aria-label="Ejecutar widget ${esc(w.nombre)}">▶ Ejecutar</button>
        <button class="btn btn-ghost btn-xs wcg-btn-canvas"
          data-id="${esc(w.id)}"
          data-nombre="${esc(w.nombre)}"
          data-sistema="${esc(w.sistema || '')}"
          data-sql="${esc(w.sql || '')}"
          data-color="${esc(w.color_primario || '#6366f1')}"
          data-viz="${esc(w.tipo_viz || 'tabla')}"
          data-params='${JSON.stringify(w.params_dinamicos || [])}'
          aria-label="Agregar ${esc(w.nombre)} al Canvas Editor"
          title="Agregar al Canvas Editor">⊞ Canvas</button>
        <button class="btn btn-ghost btn-xs wcg-btn-delete" data-id="${esc(w.id)}" data-nombre="${esc(w.nombre)}" aria-label="Eliminar widget ${esc(w.nombre)}">✕</button>
      </div>
    </div>
    <div class="wcg-resultado hidden" id="wcg-res-${esc(w.id)}" aria-live="polite"></div>
  </div>`;
}

export async function ejecutarWidgetGuardado(id) {
    const container = document.getElementById(`wcg-res-${id}`);
    if (!container) return;
    container.classList.remove('hidden');
    container.innerHTML = '<p class="loading-text" role="status">Ejecutando...</p>';
    destroyChart(`wcg-chart-${id}`);
    try {
        const { ok, data, error } = await api(
            `${API}/widget-studio/mis-widgets/${encodeURIComponent(id)}/ejecutar`,
            { method: 'POST', body: JSON.stringify({}) }
        );
        if (!ok) { container.innerHTML = `<p class="error-msg">⚠ ${esc(error || 'Error')}</p>`; return; }
        const w = data.widget;
        const filas = data.filas || [];
        const visibles = new Set(w.columnas_visibles?.length ? w.columnas_visibles : data.columnas_resultado || []);
        const datosWrap = {
            datos: {
                filas: filas.map(fila => {
                    const row = {};
                    for (const [k, v] of Object.entries(fila)) {
                        if (!visibles.size || visibles.has(k)) row[k] = { valor: v, valor_formateado: fmt(v) };
                    }
                    return row;
                })
            }
        };
        renderizarEnContenedor(container, datosWrap, w.tipo_viz || 'tabla',
            `${data.total_filas} filas`, `wcg-chart-${id}`);
    } catch (err) {
        container.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
    }
}

export async function eliminarWidgetGuardado(id, nombre) {
    if (!confirm(`¿Eliminar el widget "${nombre}"?`)) return;
    try {
        await api(`${API}/widget-studio/mis-widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast(`Widget "${nombre}" eliminado`, 'ok');
        cargarMisWidgets();
    } catch (err) { toast(err.message, 'error'); }
}

// ── ═══════════════ WIZARD (4 pasos) ═══════════════ ──────────

/**
 * Abre el wizard.
 * Con `config` (desde SQL Libre / Asistente IA) salta al paso 3.
 * Sin config, arranca en el paso 1 (lenguaje natural).
 */
export function abrirModalGuardar(config) {
    const inicio = config ? 3 : 1;
    state.wizard = {
        paso: inicio,
        tipo: config ? 'personalizado' : null,
        metricaIa: null,
        sql: config?.sql || '',
        sistema: config?.sistema || 'SAE',
        columnas: config?.columnas_detectadas || [],
        filas: [],
        vizRec: config?.viz_recomendada || null,
        viz: config?.tipo_viz || 'tabla',
        ejeX: (config?.viz_recomendada?.config_sugerida?.eje_x || '').toLowerCase(),
        ejeY: (config?.viz_recomendada?.config_sugerida?.eje_y || '').toLowerCase(),
        nombre: '',
        descripcion: '',
        color: config?.color_primario || '#6366f1',
        columnas_resultado: config?.columnas_resultado || [],
        params_sql: config?.params_sql || {},
        params_dinamicos: config?.params_dinamicos || [],
        tipo_origen: config?.tipo_origen || 'sql_libre',
        widget_guardado: null
    };
    _wzRenderPaso(inicio);
    const modal = document.getElementById('modal-guardar-widget');
    modal.classList.remove('hidden');
    setTimeout(() => modal.querySelector('button, input, textarea')?.focus(), 60);
}

export function cerrarModalGuardar() {
    document.getElementById('modal-guardar-widget').classList.add('hidden');
    state.wizard = null;
}

// ── Renderización de paso / indicadores ──────────────────────
export function _wzRenderPaso(n) {
    const wz = state.wizard;
    wz.paso = n;

    for (let i = 1; i <= 4; i++) {
        const ind = document.getElementById(`wz-step-ind-${i}`);
        if (!ind) continue;
        ind.classList.toggle('active', i === n);
        ind.classList.toggle('done', i < n);
        ind.setAttribute('aria-current', i === n ? 'step' : 'false');
    }

    for (let i = 1; i <= 4; i++) {
        const p = document.getElementById(`wz-panel-${i}`);
        if (p) p.classList.toggle('hidden', i !== n);
    }

    const btnAtras = document.getElementById('wz-btn-atras');
    const btnSig = document.getElementById('wz-btn-siguiente');
    const btnGuardar = document.getElementById('mw-btn-guardar');
    const btnPanel = document.getElementById('wz-btn-agregar-panel');

    if (btnAtras) btnAtras.classList.toggle('hidden', n === 1);
    if (btnSig) btnSig.classList.toggle('hidden', n >= 4);
    if (btnGuardar) {
        btnGuardar.classList.toggle('hidden', n !== 4);
        btnGuardar.disabled = false;
        btnGuardar.textContent = '★ Guardar Widget';
    }
    if (btnPanel) btnPanel.classList.toggle('hidden', n !== 4 || !wz.widget_guardado);

    if (n === 2) _wzInicializarPaso2();
    if (n === 3) _wzInicializarPaso3();
    if (n === 4) _wzInicializarPaso4();
}

function _wzInicializarPaso2() {
    const wz = state.wizard;
    if (wz.sql) document.getElementById('wz-sql').value = wz.sql;
    if (wz.sistema) document.getElementById('wz-sistema').value = wz.sistema;

    // ── Autocompletado: wiring de eventos ─────────────────
    const selSistema = document.getElementById('wz-sistema');
    const btnCargar = document.getElementById('wz-btn-cargar-tablas');
    const selTabla = document.getElementById('wz-tabla-select');
    const btnInsertar = document.getElementById('wz-btn-insertar-campos');
    const chkTodos = document.getElementById('wz-check-todos');

    // Al cambiar sistema, limpiar tabla y campos
    selSistema?.addEventListener('change', () => {
        if (selTabla) { selTabla.innerHTML = '<option value="">— presiona ↺ para cargar tablas —</option>'; selTabla.disabled = true; }
        document.getElementById('wz-campos-panel')?.classList.add('hidden');
        document.getElementById('wz-campos-lista').innerHTML = '';
    });

    // Botón ↺ Cargar tablas
    btnCargar?.addEventListener('click', () => {
        const sistema = document.getElementById('wz-sistema').value;
        _wzCargarTablas(sistema);
    });

    // Al seleccionar tabla, cargar sus campos
    selTabla?.addEventListener('change', () => {
        const sistema = document.getElementById('wz-sistema').value;
        const tabla = selTabla.value;
        if (!tabla) { document.getElementById('wz-campos-panel')?.classList.add('hidden'); return; }
        _wzCargarCampos(sistema, tabla);
    });

    // Botón "Insertar en SQL"
    btnInsertar?.addEventListener('click', _wzInsertarCamposSQL);

    // Checkbox "Todos"
    chkTodos?.addEventListener('change', () => {
        document.querySelectorAll('#wz-campos-lista .wz-campo-check').forEach(cb => {
            cb.checked = chkTodos.checked;
        });
    });
}

/** Carga la lista de tablas del sistema en el <select> */
async function _wzCargarTablas(sistema) {
    const btn = document.getElementById('wz-btn-cargar-tablas');
    const select = document.getElementById('wz-tabla-select');
    if (!btn || !select) return;
    loading(btn, true, '...');
    select.disabled = true;
    select.innerHTML = '<option value="">Cargando tablas...</option>';
    try {
        const data = await api(`${API}/widget-studio/tablas/${encodeURIComponent(sistema)}`);
        const tablas = data.tablas || [];
        select.innerHTML = '<option value="">— elige una tabla —</option>' +
            tablas.map(t =>
                `<option value="${esc(t.nombre)}" title="${esc(t.descripcion || t.nombre)}">${esc(t.nombre)}${t.modulo ? ` (${esc(t.modulo)})` : ''}</option>`
            ).join('');
        select.disabled = false;
        toast(`${tablas.length} tablas cargadas desde ${data.origen === 'live' ? 'Firebird' : 'caché'} (${sistema})`, 'ok');
    } catch (err) {
        select.innerHTML = '<option value="">Error al cargar tablas</option>';
        toast(`Error cargando tablas: ${err.message}`, 'error');
    } finally { loading(btn, false, '↺ Cargar'); }
}

/** Carga los campos de la tabla elegida como checkboxes */
async function _wzCargarCampos(sistema, tabla) {
    const panel = document.getElementById('wz-campos-panel');
    const lista = document.getElementById('wz-campos-lista');
    const chkTodos = document.getElementById('wz-check-todos');
    if (!panel || !lista) return;
    panel.classList.remove('hidden');
    lista.innerHTML = '<span class="loading-text">Cargando campos...</span>';
    if (chkTodos) chkTodos.checked = false;
    try {
        const data = await api(`${API}/widget-studio/tabla/${encodeURIComponent(sistema)}/${encodeURIComponent(tabla)}/campos`);
        const campos = data.campos || [];
        const TIPO_ICON = { numero: '🔢', fecha: '📅', texto: '🔤', default: '⬜' };
        lista.innerHTML = campos.map(c => {
            const icono = TIPO_ICON[c.tipo_semantico] || TIPO_ICON[
                c.tipo_tecnico?.match(/INT|FLOAT|DOUBLE|DECIMAL|NUMERIC|SMALLINT|BIGINT/) ? 'numero' :
                    c.tipo_tecnico?.match(/DATE|TIME|TIMESTAMP/) ? 'fecha' : 'default'
            ] || '⬜';
            return `<label class="wz-campo-label" title="${esc(c.descripcion || c.nombre)}">
                <input type="checkbox" class="wz-campo-check" value="${esc(c.nombre)}" data-tipo="${esc(c.tipo_tecnico || '')}">
                <span class="wz-campo-ico">${icono}</span>
                <span class="wz-campo-nombre">${esc(c.nombre)}</span>
                <span class="wz-campo-tipo">${esc(c.tipo_tecnico || '')}</span>
                ${c.descripcion ? `<span class="wz-campo-desc">${esc(c.descripcion)}</span>` : ''}
              </label>`;
        }).join('');
    } catch (err) {
        lista.innerHTML = `<span class="error-msg">⚠ ${esc(err.message)}</span>`;
    }
}

/** Inserta los campos marcados como columnas SELECT en el textarea SQL */
function _wzInsertarCamposSQL() {
    const tabla = document.getElementById('wz-tabla-select')?.value;
    const sqlEl = document.getElementById('wz-sql');
    const marcados = [...document.querySelectorAll('#wz-campos-lista .wz-campo-check:checked')]
        .map(cb => cb.value);
    if (!marcados.length) { toast('Marca al menos un campo', 'error'); return; }
    if (!sqlEl) return;

    const tablaNombre = tabla || 'TABLA';
    const cols = marcados.join(',\n  ');
    const sql = `SELECT FIRST 100\n  ${cols}\nFROM ${tablaNombre}`;
    sqlEl.value = sql;
    sqlEl.focus();
    sqlEl.selectionStart = sqlEl.selectionEnd = sql.length;
    toast(`${marcados.length} campo(s) insertado(s) en el SQL`, 'ok');
}

function _wzInicializarPaso3() {
    const wz = state.wizard;

    document.getElementById('wz-viz-toggle').querySelectorAll('.viz-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.viz === wz.viz)
    );

    const hint = document.getElementById('wz-viz-rec');
    if (hint) {
        if (wz.vizRec?.razon) {
            hint.textContent = `✦ ${wz.vizRec.razon}`;
            hint.title = wz.vizRec.alternativas?.join(', ') || '';
            hint.classList.remove('hidden');
        } else {
            hint.classList.add('hidden');
        }
    }

    _wzPopularDropdowns();
    document.getElementById('wz-nombre').value = wz.nombre || '';
    document.getElementById('wz-descripcion').value = wz.descripcion || '';
    document.getElementById('wz-color').value = wz.color || '#6366f1';
    setTimeout(() => document.getElementById('wz-nombre').focus(), 60);
}

export function _wzPopularDropdowns() {
    const wz = state.wizard;
    const cols = wz.columnas || [];
    const nums = cols.filter(c => c.tipo === 'numero');

    const optsAll = `<option value="">— ninguna —</option>` + cols.map(c =>
        `<option value="${esc(c.nombre)}" ${c.nombre.toLowerCase() === wz.ejeX ? 'selected' : ''}>${esc(c.nombre)} (${c.tipo})</option>`
    ).join('');
    const optsNum = `<option value="">— ninguna —</option>` + (nums.length ? nums : cols).map(c =>
        `<option value="${esc(c.nombre)}" ${c.nombre.toLowerCase() === wz.ejeY ? 'selected' : ''}>${esc(c.nombre)}</option>`
    ).join('');

    const selX = document.getElementById('wz-eje-x');
    const selY = document.getElementById('wz-eje-y');
    if (selX) selX.innerHTML = optsAll;
    if (selY) selY.innerHTML = optsNum;

    const ejesSection = document.getElementById('wz-ejes-section');
    if (ejesSection) ejesSection.classList.toggle('hidden', cols.length === 0);
}

async function _wzInicializarPaso4() {
    const wz = state.wizard;
    const summary = document.getElementById('wz-summary');
    const preview = document.getElementById('wz-final-preview');
    const vizLabel = { tabla: 'Tabla', barra: 'Barras', linea: 'Línea', pastel: 'Pastel', kpi: 'KPI' };

    summary.innerHTML = `
    <div class="wz-summary-row"><span>Nombre:</span><strong>${esc(wz.nombre || '—')}</strong></div>
    <div class="wz-summary-row"><span>Sistema:</span><strong>${esc(wz.sistema || '—')}</strong></div>
    <div class="wz-summary-row"><span>Visualización:</span><strong>${esc(vizLabel[wz.viz] || wz.viz)}</strong></div>
    ${wz.columnas?.length ? `<div class="wz-summary-row"><span>Columnas:</span><strong>${wz.columnas.map(c => esc(c.nombre)).join(', ')}</strong></div>` : ''}`;

    if (!wz.sql || !wz.sistema) {
        if (wz.metricaIa) {
            preview.innerHTML = `<p class="hint-text">✦ Métrica de IA: <strong>${esc(wz.metricaIa.nombre)}</strong><br>Vista previa al ejecutar.</p>`;
        } else {
            preview.innerHTML = '<p class="hint-text">Sin SQL configurado — vista previa no disponible.</p>';
        }
        return;
    }

    preview.innerHTML = '<div class="spinner" role="status" aria-label="Cargando vista previa..."></div>';
    try {
        const { ok, data, error } = await api(`${API}/widgets/preview`, {
            method: 'POST',
            body: JSON.stringify({ sql: wz.sql, sistema: wz.sistema, parametros: wz.params_sql || {} })
        });
        if (!ok) throw new Error(error);
        const filas = data.filas || [];
        if (!filas.length) { preview.innerHTML = '<p class="hint-text">La consulta no devolvió filas en la muestra.</p>'; return; }
        const datosWrap = {
            datos: {
                filas: filas.map(fila => {
                    const row = {};
                    for (const [k, v] of Object.entries(fila)) row[k] = { valor: v, valor_formateado: fmt(v) };
                    return row;
                })
            }
        };
        renderizarEnContenedor(preview, datosWrap, wz.viz, wz.nombre || 'Vista previa', 'wz-final-chart');
    } catch (err) {
        preview.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
    }
}

// ── Acciones de navegación del wizard ────────────────────────
export async function wzSiguiente() {
    const wz = state.wizard;
    if (wz.paso === 1) { if (!wz.tipo) wz.tipo = 'personalizado'; _wzRenderPaso(wz.tipo === 'personalizado' ? 2 : 3); return; }
    if (wz.paso === 2) {
        const sql = document.getElementById('wz-sql').value.trim();
        const sistema = document.getElementById('wz-sistema').value;
        if (!sql) { toast('Escribe un SQL para continuar', 'error'); return; }
        wz.sql = sql; wz.sistema = sistema; _wzRenderPaso(3); return;
    }
    if (wz.paso === 3) {
        const nombre = document.getElementById('wz-nombre').value.trim();
        if (!nombre) { toast('El nombre del widget es obligatorio', 'error'); return; }
        wz.nombre = nombre;
        wz.descripcion = document.getElementById('wz-descripcion').value.trim();
        wz.color = document.getElementById('wz-color').value || '#6366f1';
        wz.ejeX = document.getElementById('wz-eje-x')?.value || '';
        wz.ejeY = document.getElementById('wz-eje-y')?.value || '';
        _wzRenderPaso(4); return;
    }
}

export function wzAtras() {
    const wz = state.wizard;
    if (wz.paso === 3) { wz.nombre = document.getElementById('wz-nombre').value.trim(); wz.descripcion = document.getElementById('wz-descripcion').value.trim(); wz.color = document.getElementById('wz-color').value; }
    if (wz.paso === 2) { wz.sql = document.getElementById('wz-sql').value.trim(); wz.sistema = document.getElementById('wz-sistema').value; }
    const prev = (wz.paso === 3 && wz.tipo === 'ia') ? 1 : wz.paso - 1;
    _wzRenderPaso(Math.max(1, prev));
}

export async function wzInterpretar() {
    const texto = document.getElementById('wz-nl-input').value.trim();
    if (!texto) { toast('Describe qué quieres analizar', 'error'); return; }
    const btn = document.getElementById('wz-btn-interpretar');
    const container = document.getElementById('wz-metricas-ia');
    loading(btn, true, '✦ Interpretando...');
    container.innerHTML = '<div class="spinner" role="status"></div>';
    container.classList.remove('hidden');
    try {
        const resp = await api(`${API}/inteligencia/buscar`, {
            method: 'POST', body: JSON.stringify({ objetivo: texto, limite: 6 })
        });
        const resultados = resp?.resultados || [];
        if (!resultados.length) {
            container.innerHTML = '<p class="hint-text">No encontré métricas — usa «Widget personalizado con SQL».</p>';
            return;
        }
        container.innerHTML = resultados.map(m => `
      <div class="wz-metrica-card">
        <div class="wz-mc-badges">
          <span class="badge badge-${esc((m.sistema || '').toLowerCase())}">${esc(m.sistema || '?')}</span>
          <span class="badge badge-cat">${esc(m.categoria || 'general')}</span>
          ${m.score_relevancia ? `<span class="wz-score">${m.score_relevancia}%</span>` : ''}
        </div>
        <div class="wz-mc-nombre">${esc(m.nombre || m.id)}</div>
        ${m.descripcion ? `<p class="wz-mc-desc">${esc(m.descripcion)}</p>` : ''}
        <button class="btn btn-primary btn-sm wz-usar-metrica"
          data-id="${esc(m.id)}" data-sistema="${esc(m.sistema || '')}"
          data-nombre="${esc(m.nombre || m.id)}">✓ Usar esta métrica</button>
      </div>`).join('');
        container.querySelectorAll('.wz-usar-metrica').forEach(b => {
            b.addEventListener('click', () => {
                const wz = state.wizard;
                wz.tipo = 'ia';
                wz.metricaIa = { id: b.dataset.id, sistema: b.dataset.sistema, nombre: b.dataset.nombre };
                wz.nombre = b.dataset.nombre;
                wz.sistema = b.dataset.sistema;
                _wzRenderPaso(3);
            });
        });
    } catch (err) {
        container.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
    } finally { loading(btn, false); }
}

export async function wzPreview() {
    const sql = document.getElementById('wz-sql').value.trim();
    const sistema = document.getElementById('wz-sistema').value;
    if (!sql) { toast('Escribe un SQL primero', 'error'); return; }
    const btn = document.getElementById('wz-btn-preview');
    const area = document.getElementById('wz-preview-area');
    const tablaDiv = document.getElementById('wz-preview-tabla');
    const colsBadges = document.getElementById('wz-cols-detectadas');
    const vizHint = document.getElementById('wz-viz-hint');
    loading(btn, true, '⏳ Consultando...');
    area.classList.remove('hidden');
    tablaDiv.innerHTML = '<div class="spinner" role="status"></div>';
    colsBadges.innerHTML = '';
    vizHint.classList.add('hidden');
    try {
        // Usar el nuevo endpoint con detección de tablas similares
        const resp = await api(`${API}/widget-studio/preview-sql`, {
            method: 'POST',
            body: JSON.stringify({ sql, sistema })
        });

        const wz = state.wizard;
        wz.sql = sql; wz.sistema = sistema;

        const filas = resp.filas_muestra || [];
        const colsDetect = resp.columnas_detectadas || [];

        wz.columnas = colsDetect;
        wz.filas = filas;

        // Intentar recomendación de viz desde el otro endpoint (best-effort)
        try {
            if (colsDetect.length) {
                const vizResp = await api(`${API}/widgets/recomendar-viz`, {
                    method: 'POST',
                    body: JSON.stringify({ columnas: colsDetect, muestra: filas.slice(0, 20) })
                });
                wz.vizRec = vizResp?.data || null;
                if (wz.vizRec?.recomendado) {
                    const OK = ['tabla', 'barra', 'linea', 'pastel', 'kpi'];
                    wz.viz = OK.includes(wz.vizRec.recomendado) ? wz.vizRec.recomendado : 'tabla';
                }
                if (wz.vizRec?.config_sugerida) {
                    wz.ejeX = (wz.vizRec.config_sugerida.eje_x || '').toLowerCase();
                    wz.ejeY = (wz.vizRec.config_sugerida.eje_y || '').toLowerCase();
                }
            }
        } catch (_) { /* viz opcional */ }

        if (filas.length) {
            const cols = Object.keys(filas[0]);
            tablaDiv.innerHTML = `<div class="wz-preview-scroll"><table class="mini-tabla">
        <thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${filas.map(f => `<tr>${cols.map(c => `<td>${esc(String(f[c] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <p class="wz-preview-meta">⏱ ${resp.tiempo_ms ?? '?'} ms · origen: ${esc(resp.origen || 'live')}</p>`;
        } else {
            tablaDiv.innerHTML = '<p class="hint-text">La consulta no devolvió filas en esta muestra.</p>';
        }

        colsBadges.innerHTML = '<span class="wz-cols-label">Columnas detectadas:</span> ' +
            colsDetect.map(c =>
                `<span class="wz-col-badge wz-col-${c.tipo}">${esc(c.nombre)} <em>${c.tipo}</em></span>`
            ).join('');

        if (wz.vizRec?.razon) {
            vizHint.textContent = `✦ Sugerida: ${wz.vizRec.recomendado} — ${wz.vizRec.razon}`;
            vizHint.classList.remove('hidden');
        }
        toast(`Vista previa: ${filas.length} fila(s)`, 'ok');
    } catch (err) {
        // Mostrar error enriquecido con sugerencias de tabla
        let msg = err.message || 'Error al consultar';
        tablaDiv.innerHTML = `<p class="error-msg">⚠ ${esc(msg)}</p>`;
        toast(msg, 'error');
    } finally { loading(btn, false); }
}

export async function guardarWidgetDesdeModal() {
    const wz = state.wizard;
    if (!wz) return;
    const nombre = wz.nombre || document.getElementById('wz-nombre')?.value?.trim();
    if (!nombre) { toast('El nombre es obligatorio', 'error'); return; }
    const payload = {
        nombre, descripcion: wz.descripcion || '',
        tipo_viz: wz.viz || 'tabla', color_primario: wz.color || '#6366f1',
        columnas_visibles: wz.columnas?.map(c => c.nombre) || [],
        columnas_resultado: wz.columnas_resultado || wz.columnas?.map(c => c.nombre) || [],
        columnas_detectadas: wz.columnas || [],
        sql: wz.sql || null, sistema: wz.sistema || null,
        params_sql: wz.params_sql || {}, params_dinamicos: wz.params_dinamicos || [],
        tipo_origen: wz.tipo_origen || 'sql_libre',
        interpretacion_tipo: wz.metricaIa?.id || null
    };
    const btn = document.getElementById('mw-btn-guardar');
    loading(btn, true, 'Guardando...');
    try {
        const { ok, widget, error } = await api(`${API}/widgets`, {
            method: 'POST', body: JSON.stringify(payload)
        });
        if (!ok) throw new Error(error || 'Error guardando');
        wz.widget_guardado = widget;
        document.getElementById('wz-summary').insertAdjacentHTML('beforeend',
            `<div class="wz-saved-badge" role="status">✓ Widget "${esc(widget.nombre)}" guardado correctamente</div>`
        );
        btn.textContent = '✓ Guardado';
        btn.disabled = true;
        const btnPanel = document.getElementById('wz-btn-agregar-panel');
        if (btnPanel) btnPanel.classList.remove('hidden');
        if (!document.getElementById('view-mis-widgets').classList.contains('hidden')) cargarMisWidgets();
        toast(`✓ Widget "${widget.nombre}" guardado`, 'ok');
    } catch (err) {
        toast(err.message, 'error');
    } finally { loading(btn, false); }
}

export function wzAgregarAlPanel() {
    const wz = state.wizard;
    const w = wz?.widget_guardado;
    if (!w) { toast('Guarda el widget primero', 'error'); return; }

    if (typeof window.addTileToCanvas === 'function') {
        window.addTileToCanvas({
            id: w.id, nombre: w.nombre, sistema: w.sistema,
            sql: w.sql, color_primario: w.color_primario, tipo_viz: w.tipo_viz,
            params_dinamicos: w.params_dinamicos || []
        });
        cerrarModalGuardar();
        callbacks.navegar('canvas');
        toast('Widget agregado al Canvas ⊞', 'ok');
    } else {
        cerrarModalGuardar();
        toast('Navega al Canvas Editor para agregar el widget', 'info');
    }
}
