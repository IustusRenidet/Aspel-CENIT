/* ==============================================================
   CENIT IA — app-main.js
   Punto de entrada ES Module — orquesta todos los sub-módulos.
   ============================================================== */

import { state } from './modules/state.js';
import { API, api } from './modules/api.js';
import {
    esc, fmt, fmtMoneda, fmtCompacto,
    toast, loading, getSistemas,
    actualizarStatusGlobal, destroyChart,
    normalizarFilas, normalizarValor,
    renderizarEnContenedor,
    renderKPI, renderTabla, renderChart, renderReporte
} from './modules/ui.js';
import {
    iniciarExplorador, buscarMetricasExp,
    abrirModalEjecutar, ejecutarMetricaModal,
    analizarConAsistente, renderInterpretacionCard,
    actualizarVizToggleAsistente, renderAsistenteResultado,
    renderAjusteControles, aplicarAjusteAsistente,
    mostrarSugerenciasRefinamiento,
    exportarCSVAsistente, agregarWidgetAsistenteAlDashboard
} from './modules/busqueda.js';
import {
    cargarMisWidgets, ejecutarWidgetGuardado, eliminarWidgetGuardado,
    abrirModalGuardar, cerrarModalGuardar,
    _wzRenderPaso, _wzPopularDropdowns,
    wzSiguiente, wzAtras, wzInterpretar, wzPreview,
    guardarWidgetDesdeModal, wzAgregarAlPanel
} from './modules/widgets.js';
import { callbacks } from './modules/registry.js';

// Exponer navegar globalmente para canvas.js y otros scripts legacy
window.navegar = navegar;

// ── Registrar callbacks en el registry ────────────────────────
callbacks.navegar = navegar;
callbacks.mostrarFase = mostrarFase;
callbacks.renderWidgetsSupgeridos = renderWidgetsSupgeridos;

// ── ═══════════════ NAVEGACIÓN ═══════════════ ────────────────
function navegar(vista) {
    state.view = vista;
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.classList.add('hidden'); });
    const el = document.getElementById(`view-${vista}`);
    if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
    document.querySelectorAll('.nav-item').forEach(li => {
        const isActive = li.dataset.view === vista;
        li.classList.toggle('active', isActive);
        if (isActive) li.setAttribute('aria-current', 'page');
        else li.removeAttribute('aria-current');
    });

    if (vista === 'inicio') cargarInicio();
    if (vista === 'dashboards') cargarPaneles();
    if (vista === 'conexiones') cargarConexiones();
    if (vista === 'explorador') iniciarExplorador();
    if (vista === 'studio') cargarStudio();
    if (vista === 'mis-widgets') cargarMisWidgets();
}

// ── ═══════════════ INICIO ═══════════════ ────────────────────
async function cargarInicio() {
    const grid = document.getElementById('sistemas-cards');
    grid.innerHTML = '<div class="spinner" role="status" aria-label="Cargando..."></div>';
    try {
        const { data } = await api(`${API}/health`);
        const sistemas = data || [];
        grid.innerHTML = sistemas.map(s => `
      <div class="sistema-card sistema-${esc(s.sistema?.toLowerCase())}">
        <div class="sc-header">
          <span class="sc-badge">${esc(s.sistema)}</span>
          <span class="sc-count">${s.metricas ?? 0} métricas</span>
        </div>
        <h3 class="sc-name">${esc(s.nombre || s.sistema)}</h3>
        <p class="sc-tablas">${s.tablas ?? 0} tablas mapeadas</p>
        <button class="btn btn-ghost sc-btn" data-goto="builder" data-sistemas="${esc(s.sistema)}">
          Construir dashboard →
        </button>
      </div>`).join('');
        actualizarStatusGlobal(true);
    } catch (e) {
        grid.innerHTML = `<p class="error-msg">Error cargando estado: ${esc(e.message)}</p>`;
        actualizarStatusGlobal(false);
    }
}

// ── ═══════════════ CONSTRUCTOR IA ═══════════════ ────────────
async function construirDashboard(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-construir');
    loading(btn, true, '✦ Analizando con IA...');
    const objetivo = document.getElementById('builder-objetivo').value.trim();
    const sistemas = getSistemas();
    const maxWidgets = Number(document.getElementById('slider-widgets').value);
    const vizPref = document.querySelector('[name="vizPref"]:checked')?.value || 'auto';

    try {
        const { data } = await api(`${API}/dashboard/sugerir`, {
            method: 'POST',
            body: JSON.stringify({ objetivo, sistemas, maxWidgets })
        });
        state.dashboard = { ...data, objetivo, vizPref };
        state.vizTypes = {};
        state.resultados = {};
        if (vizPref !== 'auto') {
            (data.widgets || []).forEach(w => { state.vizTypes[w.id] = vizPref; });
        }
        mostrarFase('widgets');
        renderWidgetsSupgeridos(data.widgets || [], objetivo);
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally {
        loading(btn, false);
    }
}

function mostrarFase(fase) {
    ['input', 'widgets', 'dashboard'].forEach(f => {
        const el = document.getElementById(`builder-fase-${f}`);
        if (el) el.classList.toggle('hidden', f !== fase);
    });
}

function vizDefecto(widget) {
    if (widget.tipo_widget === 'kpi' || widget.tipo === 'escalar') return 'kpi';
    if (widget.tipo_widget === 'tabla' || widget.tipo === 'tabla') return 'tabla';
    if (widget.tipo_widget === 'grafica_barras') return 'barra';
    if (widget.tipo_widget === 'grafica_lineas') return 'linea';
    if (widget.tipo_widget === 'grafica_pie') return 'pastel';
    return 'barra';
}

function vizLabel(v) {
    return { kpi: '◈ KPI', tabla: '⊞ Tabla', barra: '▊ Barras', linea: '╱ Línea', pastel: '◑ Pastel', area: '▲ Área' }[v] || v;
}

function renderWidgetsSupgeridos(widgets, objetivo) {
    const meta = document.getElementById('builder-meta-text');
    meta.textContent = `${widgets.length} widgets sugeridos para: "${objetivo}"`;
    const grid = document.getElementById('widgets-sugeridos');
    grid.innerHTML = '';

    widgets.forEach(w => {
        const vizActual = state.vizTypes[w.id] || vizDefecto(w);
        const card = document.createElement('article');
        card.className = 'widget-sugerido';
        card.dataset.id = w.id;
        card.innerHTML = `
      <div class="ws-header">
        <span class="badge badge-${esc(w.sistema?.toLowerCase())}">${esc(w.sistema)}</span>
        <span class="badge badge-cat">${esc(w.categoria || 'general')}</span>
        <button class="btn-remove" data-id="${esc(w.id)}" aria-label="Quitar widget ${esc(w.titulo || w.nombre || w.id)}">✕</button>
      </div>
      <h3 class="ws-titulo">${esc(w.titulo || w.nombre || w.id)}</h3>
      <p class="ws-desc">${esc(w.descripcion || '')}</p>
      <div class="viz-toggler" role="group" aria-label="Tipo de visualización">
        ${['kpi', 'tabla', 'barra', 'linea', 'pastel', 'area'].map(v =>
            `<button class="viz-btn ${vizActual === v ? 'active' : ''}" data-viz="${v}" data-wid="${esc(w.id)}" aria-pressed="${vizActual === v}">${vizLabel(v)}</button>`
        ).join('')}
      </div>
      <div class="ws-footer">
        <code class="ws-id">${esc(w.metrica_id || w.id)}</code>
        <button class="btn btn-sm btn-secondary ws-run" data-wid="${esc(w.id)}" aria-label="Ejecutar ${esc(w.titulo || w.id)}">▶ Ejecutar</button>
      </div>`;
        grid.appendChild(card);
    });

    grid.querySelectorAll('.viz-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const wid = btn.dataset.wid;
            const viz = btn.dataset.viz;
            state.vizTypes[wid] = viz;
            grid.querySelectorAll(`.viz-btn[data-wid="${wid}"]`).forEach(b => {
                b.classList.toggle('active', b.dataset.viz === viz);
                b.setAttribute('aria-pressed', String(b.dataset.viz === viz));
            });
            if (state.resultados[wid]) re_renderResultado(wid);
        });
    });

    grid.querySelectorAll('.ws-run').forEach(btn => {
        btn.addEventListener('click', () => {
            const wid = btn.dataset.wid;
            const widget = state.dashboard.widgets.find(w => w.id === wid);
            if (widget) ejecutarWidget(widget, btn);
        });
    });

    grid.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const wid = btn.dataset.id;
            state.dashboard.widgets = state.dashboard.widgets.filter(w => w.id !== wid);
            btn.closest('.widget-sugerido').remove();
            document.getElementById('builder-meta-text').textContent =
                `${state.dashboard.widgets.length} widgets sugeridos`;
        });
    });
}

async function ejecutarWidget(widget, btnEl) {
    if (btnEl) loading(btnEl, true, '⏳');
    const metricaId = widget.metrica_id || widget.id;
    const sistema = widget.sistema;
    try {
        const { data } = await api(`${API}/metricas/${encodeURIComponent(metricaId)}/ejecutar`, {
            method: 'POST',
            body: JSON.stringify({ sistema, modo: 'auto' })
        });
        state.resultados[widget.id] = data;
        re_renderResultado(widget.id);
    } catch (err) {
        const card = document.querySelector(`.widget-sugerido[data-id="${widget.id}"]`);
        if (card) {
            let errDiv = card.querySelector('.ws-error');
            if (!errDiv) { errDiv = document.createElement('div'); errDiv.className = 'ws-error'; card.appendChild(errDiv); }
            errDiv.textContent = `⚠ ${err.message}`;
        }
    } finally {
        if (btnEl) loading(btnEl, false);
    }
}

function re_renderResultado(widgetId) {
    const card = document.querySelector(`.widget-sugerido[data-id="${widgetId}"]`);
    if (!card) return;
    destroyChart(`ws-chart-${widgetId}`);
    let resDiv = card.querySelector('.ws-resultado');
    if (!resDiv) { resDiv = document.createElement('div'); resDiv.className = 'ws-resultado'; card.querySelector('.ws-footer').after(resDiv); }
    resDiv.innerHTML = '';
    const datos = state.resultados[widgetId];
    const viz = state.vizTypes[widgetId] || 'barra';
    const titulo = card.querySelector('.ws-titulo')?.textContent || '';
    renderizarEnContenedor(resDiv, datos, viz, titulo, `ws-chart-${widgetId}`);
}

async function ejecutarTodos() {
    const btn = document.getElementById('btn-ejecutar-todo');
    loading(btn, true, '⏳ Ejecutando...');
    const widgets = state.dashboard?.widgets || [];
    await Promise.all(widgets.map(w => ejecutarWidget(w)));
    loading(btn, false);
    toast('Todos los widgets ejecutados', 'ok');
}

// ── Guardar dashboard ─────────────────────────────────────────
function abrirModalGuardarDashboard() {
    const modal = document.getElementById('modal-guardar');
    const input = document.getElementById('input-nombre-panel');
    input.value = state.dashboard?.objetivo?.slice(0, 80) || '';
    modal.classList.remove('hidden');
    input.focus();
}

async function confirmarGuardarDashboard() {
    const nombre = document.getElementById('input-nombre-panel').value.trim();
    if (!nombre) { toast('Escribe un nombre para el dashboard', 'error'); return; }
    try {
        const payload = {
            nombre,
            objetivo: state.dashboard?.objetivo || '',
            sistemas: state.dashboard?.sistemas || [],
            widgets: state.dashboard?.widgets || [],
            vizTypes: state.vizTypes
        };
        await api(`${API}/paneles`, { method: 'POST', body: JSON.stringify(payload) });
        toast(`Dashboard "${nombre}" guardado ✓`, 'ok');
        document.getElementById('modal-guardar').classList.add('hidden');
    } catch (err) {
        toast(`Error al guardar: ${err.message}`, 'error');
    }
}

// ── Mis Dashboards ────────────────────────────────────────────
async function cargarPaneles() {
    const grid = document.getElementById('paneles-lista');
    grid.innerHTML = '<div class="spinner" role="status" aria-label="Cargando..."></div>';
    try {
        const { data } = await api(`${API}/paneles`);
        state.dashboards = data || [];
        if (state.dashboards.length === 0) {
            grid.innerHTML = `<div class="empty-state">
        <p>No tienes dashboards guardados.</p>
        <button class="btn btn-primary" data-goto="builder">Crear el primero →</button>
      </div>`;
            return;
        }
        grid.innerHTML = state.dashboards.map(p => `
      <div class="panel-card">
        <h3>${esc(p.nombre)}</h3>
        <p class="panel-obj">${esc(p.objetivo || '')}</p>
        <div class="panel-meta">
          ${(p.sistemas || []).map(s => `<span class="badge badge-${s.toLowerCase()}">${s}</span>`).join('')}
          <span class="badge">${p.widgets?.length ?? '?'} widgets</span>
        </div>
        <div class="panel-actions">
          <button class="btn btn-primary panel-cargar" data-id="${esc(p.id)}" aria-label="Cargar dashboard ${esc(p.nombre)}">▶ Cargar</button>
          <button class="btn btn-danger panel-eliminar" data-id="${esc(p.id)}" aria-label="Eliminar dashboard ${esc(p.nombre)}">✕</button>
        </div>
      </div>`).join('');
        grid.querySelectorAll('.panel-cargar').forEach(btn =>
            btn.addEventListener('click', () => cargarDashboard(btn.dataset.id)));
        grid.querySelectorAll('.panel-eliminar').forEach(btn =>
            btn.addEventListener('click', () => eliminarDashboard(btn.dataset.id)));
    } catch (err) {
        grid.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
    }
}

async function cargarDashboard(id) {
    try {
        const { data } = await api(`${API}/paneles/${id}`);
        state.dashboard = data;
        state.vizTypes = data.vizTypes || {};
        state.resultados = {};
        navegar('builder');
        mostrarFase('widgets');
        renderWidgetsSupgeridos(data.widgets || [], data.objetivo || data.nombre);
        toast('Dashboard cargado — ejecuta los widgets para ver datos', 'info');
    } catch (err) { toast(`Error cargando: ${err.message}`, 'error'); }
}

async function eliminarDashboard(id) {
    if (!confirm('¿Eliminar este dashboard?')) return;
    try {
        await api(`${API}/paneles/${id}`, { method: 'DELETE' });
        toast('Eliminado', 'ok');
        cargarPaneles();
    } catch (err) { toast(err.message, 'error'); }
}

// ── Conexiones ────────────────────────────────────────────────
async function cargarConexiones() {
    try {
        const { data } = await api(`${API}/conexiones`);
        state.conexiones = data;
        renderConexionTab(state.conexionTab);
    } catch (err) { toast(`Error cargando conexiones: ${err.message}`, 'error'); }
}

function renderConexionTab(sistema) {
    state.conexionTab = sistema;
    document.querySelectorAll('.cx-tab').forEach(b => b.classList.toggle('active', b.dataset.sistema === sistema));
    const cfg = state.conexiones[sistema] || {};
    const panel = document.getElementById('conexion-panel');
    panel.innerHTML = `
    <div class="conexion-form">
      <div class="form-row">
        <div class="form-group flex-1">
          <label class="form-label" for="cx-host">Host / IP</label>
          <input class="form-input" id="cx-host" value="${esc(cfg.host || '127.0.0.1')}">
        </div>
        <div class="form-group w-100">
          <label class="form-label" for="cx-port">Puerto</label>
          <input class="form-input" id="cx-port" type="number" value="${esc(cfg.port || 3050)}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="cx-database">Ruta de base de datos (.FDB)</label>
        <input class="form-input" id="cx-database" value="${esc(cfg.database || '')}">
        <small class="form-hint">Ejemplo: C:\\Program Files (x86)\\...\\SAE90EMPRE01.FDB</small>
      </div>
      <div class="form-row">
        <div class="form-group flex-1">
          <label class="form-label" for="cx-user">Usuario</label>
          <input class="form-input" id="cx-user" value="${esc(cfg.user || 'SYSDBA')}">
        </div>
        <div class="form-group flex-1">
          <label class="form-label" for="cx-password">Contraseña</label>
          <input class="form-input" id="cx-password" type="password" placeholder="${cfg.password ? '••••••••' : 'masterkey'}">
          <small class="form-hint">Dejar vacío para no cambiar</small>
        </div>
      </div>
      <div class="form-group">
        <label class="toggle-label">
          <input type="checkbox" id="cx-enabled" ${cfg.enabled !== false ? 'checked' : ''}>
          Conexión habilitada
        </label>
      </div>
      <div class="form-row form-actions-row">
        <button class="btn btn-primary" id="btn-cx-guardar">Guardar configuración</button>
        <button class="btn btn-secondary" id="btn-cx-probar">⬡ Probar conexión</button>
      </div>
      <div id="cx-resultado" class="cx-resultado" role="status" aria-live="polite"></div>
    </div>`;
    document.getElementById('btn-cx-guardar').addEventListener('click', () => guardarConexion(sistema));
    document.getElementById('btn-cx-probar').addEventListener('click', () => probarConexion(sistema));
}

async function guardarConexion(sistema) {
    const btn = document.getElementById('btn-cx-guardar');
    loading(btn, true, 'Guardando...');
    const body = {
        host: document.getElementById('cx-host').value.trim(),
        port: Number(document.getElementById('cx-port').value),
        database: document.getElementById('cx-database').value.trim(),
        user: document.getElementById('cx-user').value.trim(),
        enabled: document.getElementById('cx-enabled').checked
    };
    const pwd = document.getElementById('cx-password').value;
    if (pwd) body.password = pwd;
    try {
        const resp = await api(`${API}/conexiones/${sistema}`, { method: 'PUT', body: JSON.stringify(body) });
        toast(`Conexión ${sistema} guardada ✓`, 'ok');
        await cargarConexiones();   // re-renderiza el panel (cx-resultado queda limpio)
        const resEl = document.getElementById('cx-resultado');
        if (resEl && resp) {
            if (resp.esquema_actualizado) {
                resEl.innerHTML = `<div class="cx-ok">✅ Esquema actualizado: ${resp.tablas} tablas, ${resp.campos} campos leídos desde ${sistema}</div>`;
            } else if (resp.motivo) {
                resEl.innerHTML = `<div class="cx-warn">ℹ️ Esquema no actualizado aún: ${esc(resp.motivo)}</div>`;
            }
        }
    } catch (err) { toast(`Error: ${err.message}`, 'error'); }
    finally { loading(btn, false); }
}

async function probarConexion(sistema) {
    const btn = document.getElementById('btn-cx-probar');
    const res = document.getElementById('cx-resultado');
    loading(btn, true, '⬡ Probando...');
    res.innerHTML = '';
    try {
        const data = await api(`${API}/conexiones/${sistema}/probar`, { method: 'POST' });
        res.innerHTML = `<div class="cx-ok">✓ ${esc(data.mensaje)}</div>`;
        toast(`${sistema}: conexión exitosa`, 'ok');
    } catch (err) {
        res.innerHTML = `<div class="cx-error">✗ ${esc(err.message)}</div>`;
        toast(`${sistema}: error de conexión`, 'error');
    } finally { loading(btn, false); }
}

async function probarTodas() {
    const btn = document.getElementById('btn-probar-todas');
    loading(btn, true, '⬡ Probando...');
    try {
        const { data } = await api(`${API}/conexiones/probar-todas`, { method: 'POST' });
        const oks = data.filter(d => d.exito).length;
        toast(`${oks} de ${data.length} sistemas conectados`, oks === data.length ? 'ok' : 'error');
        renderConexionTab(state.conexionTab);
    } catch (err) { toast(err.message, 'error'); }
    finally { loading(btn, false); }
}

// ── Widget Studio ─────────────────────────────────────────────
async function cargarStudio() {
    if (state.studio.templates.length > 0) return;
    try {
        const { data } = await api(`${API}/widget-studio/templates`);
        state.studio.templates = data || [];
        renderTemplatesGrid();
    } catch (e) {
        document.getElementById('studio-templates-grid').innerHTML =
            `<p class="error-msg">Error cargando plantillas: ${esc(e.message)}</p>`;
    }
}

function renderTemplatesGrid() {
    const grid = document.getElementById('studio-templates-grid');
    grid.innerHTML = state.studio.templates.map(t => `
    <button class="studio-template-card" data-tid="${esc(t.id)}" aria-label="${esc(t.nombre)} — ${esc(t.sistema)}">
      <span class="stc-icon" aria-hidden="true">${esc(t.icono || '📊')}</span>
      <strong class="stc-nombre">${esc(t.nombre)}</strong>
      <span class="stc-sistema badge badge-${esc((t.sistema || '').toLowerCase())}">${esc(t.sistema)}</span>
      <p class="stc-desc">${esc(t.descripcion)}</p>
    </button>`).join('');
    grid.querySelectorAll('.studio-template-card').forEach(btn =>
        btn.addEventListener('click', () => seleccionarTemplate(btn.dataset.tid)));
}

function seleccionarTemplate(templateId) {
    const template = state.studio.templates.find(t => t.id === templateId);
    if (!template) return;
    state.studio.templateActivo = template;
    state.studio.resultado = null;
    state.studio.viz = 'tabla';
    document.querySelectorAll('.studio-template-card').forEach(b => b.classList.toggle('active', b.dataset.tid === templateId));
    document.getElementById('studio-paso2-titulo').textContent = template.nombre;
    renderFiltrosStudio(template);
    renderColumnasStudio(template);
    document.getElementById('studio-sql-display').textContent = '— Haz clic en Previsualizar para generar el SQL —';
    document.getElementById('studio-paso-resultado').classList.add('hidden');
    document.getElementById('studio-paso-config').classList.remove('hidden');
    document.getElementById('studio-paso-config').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFiltrosStudio(template) {
    const container = document.getElementById('studio-filtros-container');
    container.innerHTML = (template.filtros || []).map(f => {
        const val = typeof f.defecto === 'function' ? f.defecto() : (f.defecto ?? '');
        if (f.tipo === 'select') {
            return `<div class="form-row">
        <label class="form-label" for="sf-${esc(f.id)}">${esc(f.nombre)}</label>
        <select class="form-select studio-filtro" id="sf-${esc(f.id)}" data-fid="${esc(f.id)}">
          ${(f.opciones || []).map(op => `<option value="${esc(op.valor)}" ${op.valor === val ? 'selected' : ''}>${esc(op.etiqueta)}</option>`).join('')}
        </select></div>`;
        }
        if (f.tipo === 'fecha') {
            return `<div class="form-row">
        <label class="form-label" for="sf-${esc(f.id)}">${esc(f.nombre)}</label>
        <input type="date" class="form-input studio-filtro" id="sf-${esc(f.id)}" data-fid="${esc(f.id)}" value="${esc(val)}"/></div>`;
        }
        const extra = f.min !== undefined ? `min="${f.min}"` : '';
        const extra2 = f.max !== undefined ? `max="${f.max}"` : '';
        return `<div class="form-row">
      <label class="form-label" for="sf-${esc(f.id)}">${esc(f.nombre)}</label>
      <input type="${f.tipo === 'numero' ? 'number' : 'text'}" class="form-input studio-filtro"
        id="sf-${esc(f.id)}" data-fid="${esc(f.id)}" value="${esc(val)}" ${extra} ${extra2}/></div>`;
    }).join('');
}

function renderColumnasStudio(template) {
    const container = document.getElementById('studio-columnas-container');
    container.innerHTML = (template.columnas_disponibles || []).map(col => `
    <label class="col-check-item ${col.defecto ? 'defecto' : ''}">
      <input type="checkbox" class="studio-col-check" data-cid="${esc(col.id)}"
        data-defecto="${col.defecto ? '1' : '0'}" ${col.defecto ? 'checked' : ''} />
      <span class="col-badge col-${esc(col.tipo)}">${esc(col.tipo)}</span>
      ${esc(col.nombre)}
    </label>`).join('');
}

function getParamsStudio() {
    const params = {};
    document.querySelectorAll('.studio-filtro').forEach(el => { params[el.dataset.fid] = el.value; });
    return params;
}

function getColsSeleccionadas() {
    return [...document.querySelectorAll('.studio-col-check:checked')].map(ch => ch.dataset.cid);
}

async function previsualizarStudio() {
    const template = state.studio.templateActivo;
    if (!template) return;
    const btn = document.getElementById('btn-studio-preview');
    loading(btn, true, '⏳ Generando...');
    const params = getParamsStudio();
    const columnas = getColsSeleccionadas();
    try {
        const { data: sqlData } = await api(`${API}/widget-studio/construir`, {
            method: 'POST',
            body: JSON.stringify({ tipo: template.id, sistema: template.sistema, params, columnas, solo_sql: true })
        });
        document.getElementById('studio-sql-display').textContent = sqlData.sql || '';
        const { data } = await api(`${API}/widget-studio/construir`, {
            method: 'POST',
            body: JSON.stringify({ tipo: template.id, sistema: template.sistema, params, columnas })
        });
        state.studio.resultado = { ...data, filas: data.filas.slice(0, 5) };
        state.studio.modoPreview = true;
        mostrarResultadoStudio(`Vista previa — ${data.total_filas} filas totales (mostrando 5)`);
        document.getElementById('studio-sql-display').textContent = data.sql || '';
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally { loading(btn, false); }
}

async function ejecutarCompletoStudio() {
    const template = state.studio.templateActivo;
    if (!template) return;
    const btn = document.getElementById('btn-studio-ejecutar');
    loading(btn, true, '⏳ Ejecutando...');
    const params = getParamsStudio();
    const columnas = getColsSeleccionadas();
    try {
        const { data } = await api(`${API}/widget-studio/construir`, {
            method: 'POST',
            body: JSON.stringify({ tipo: template.id, sistema: template.sistema, params, columnas })
        });
        state.studio.resultado = data;
        state.studio.modoPreview = false;
        document.getElementById('studio-sql-display').textContent = data.sql || '';
        mostrarResultadoStudio(`${data.total_filas} filas — ${data.template || template.nombre}`);
        toast(`✓ ${data.total_filas} filas cargadas`, 'ok');
    } catch (err) {
        toast(`Error al ejecutar: ${err.message}`, 'error');
    } finally { loading(btn, false); }
}

function mostrarResultadoStudio(meta) {
    const paso = document.getElementById('studio-paso-resultado');
    paso.classList.remove('hidden');
    document.getElementById('studio-resultado-meta').textContent = meta;
    renderStudioChart();
    paso.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderStudioChart() {
    const datos = state.studio.resultado;
    if (!datos) return;
    destroyChart('studio-chart');
    const container = document.getElementById('studio-resultado-container');
    container.innerHTML = '';
    const filas = Array.isArray(datos.filas) ? datos.filas : [];
    const titulo = state.studio.templateActivo?.nombre || '';
    const datosWrap = {
        datos: {
            filas: filas.map(fila => {
                const row = {};
                for (const [k, v] of Object.entries(fila)) row[k] = { valor: v, valor_formateado: fmt(v) };
                return row;
            })
        }
    };
    renderizarEnContenedor(container, datosWrap, state.studio.viz, titulo, 'studio-chart');
}

function exportarCSVStudio() {
    const datos = state.studio.resultado;
    if (!datos?.filas?.length) { toast('Sin datos para exportar', 'error'); return; }
    const cols = Object.keys(datos.filas[0] || {});
    const header = cols.join(',');
    const rows = datos.filas.map(row => cols.map(c => {
        const v = row[c] ?? '';
        return typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))
            ? `"${v.replace(/"/g, '""')}"` : String(v);
    }).join(','));
    const csv = [header, ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.studio.templateActivo?.id || 'widget'}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function agregarWidgetAlDashboard() {
    const datos = state.studio.resultado;
    const template = state.studio.templateActivo;
    if (!datos || !template) { toast('Primero ejecuta el análisis', 'error'); return; }
    const widgetId = `studio_${template.id}_${Date.now()}`;
    const widget = {
        id: widgetId, metrica_id: widgetId, nombre: template.nombre,
        titulo: template.nombre, descripcion: template.descripcion,
        sistema: template.sistema, categoria: 'studio', tipo_widget: 'tabla', _studio_datos: datos
    };
    if (!state.dashboard) { state.dashboard = { widgets: [], objetivo: 'Widget Studio' }; state.vizTypes = {}; state.resultados = {}; }
    state.dashboard.widgets.push(widget);
    state.vizTypes[widgetId] = state.studio.viz;
    state.resultados[widgetId] = {
        datos: {
            filas: datos.filas.map(fila => {
                const row = {};
                for (const [k, v] of Object.entries(fila)) row[k] = { valor: v, valor_formateado: fmt(v) };
                return row;
            })
        }
    };
    toast(`✓ "${template.nombre}" agregado al dashboard`, 'ok');
    navegar('builder');
    mostrarFase('widgets');
    renderWidgetsSupgeridos(state.dashboard.widgets, state.dashboard.objetivo);
}

// ── SQL Libre ─────────────────────────────────────────────────
function detectarParamsSQL(sql) {
    const vistos = new Set();
    const orden = [];
    const re = /(\/\*[\s\S]*?\*\/|--[^\r\n]*)|:([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m;
    while ((m = re.exec(sql)) !== null) {
        if (m[1]) continue;
        const n = m[2].toLowerCase();
        if (!vistos.has(n)) { vistos.add(n); orden.push(n); }
    }
    return orden;
}

function renderParamsSQL(paramNames) {
    const panel = document.getElementById('sql-params-panel');
    const cont = document.getElementById('sql-params-inputs');
    if (!paramNames.length) { panel.classList.add('hidden'); return; }
    const NUMERICOS = new Set(['mes', 'nivel', 'ejercicio', 'ano', 'limite', 'nivel_max', 'num_poliz']);
    const NULLABLE = new Set(['prefijo', 'cliente', 'vendedor', 'cuenta', 'cta', 'num_cta']);
    cont.innerHTML = paramNames.map(name => {
        const isNum = NUMERICOS.has(name);
        const hint = NULLABLE.has(name) ? '(vacío = NULL)' : '';
        const defaults = { mes: new Date().getMonth() + 1, ejercicio: new Date().getFullYear(), nivel: 1 };
        const def = defaults[name] !== undefined ? defaults[name] : '';
        return `<div class="sql-param-field">
      <label class="sql-param-label" for="sqlp-${name}">:${name}</label>
      <input type="${isNum ? 'number' : 'text'}" id="sqlp-${name}"
        class="form-input sql-param-input" placeholder="${hint}" value="${def}"></div>`;
    }).join('');
    panel.classList.remove('hidden');
}

async function ejecutarSQLLibre() {
    const sql = document.getElementById('sql-libre-input').value.trim();
    const sistema = document.getElementById('sql-libre-sistema').value;
    const btn = document.getElementById('btn-sql-libre-ejecutar');
    if (!sql) { toast('Escribe una consulta SQL', 'error'); return; }
    const paramNames = detectarParamsSQL(sql);
    const params_sql = {};
    for (const name of paramNames) {
        const el = document.getElementById(`sqlp-${name}`);
        const val = el ? el.value.trim() : '';
        params_sql[name] = val === '' ? null : (!isNaN(val) && val !== '' ? Number(val) : val);
    }
    loading(btn, true, '⏳ Ejecutando...');
    const container = document.getElementById('sql-libre-resultado');
    container.innerHTML = '';
    destroyChart('sql-libre-chart');
    try {
        const { data } = await api(`${API}/widget-studio/sql-libre`, {
            method: 'POST',
            body: JSON.stringify({ sql, sistema, ...(paramNames.length ? { params_sql } : {}) })
        });
        const filas = data.filas || [];
        const datosWrap = {
            datos: {
                filas: filas.map(fila => {
                    const row = {};
                    for (const [k, v] of Object.entries(fila)) row[k] = { valor: v, valor_formateado: fmt(v) };
                    return row;
                })
            }
        };
        renderizarEnContenedor(container, datosWrap, 'tabla', `Resultados (${data.total_filas} filas)`, 'sql-libre-chart');
        toast(`✓ ${data.total_filas} filas`, 'ok');
        state.pendingWidgetSave = {
            sql, sistema,
            columnas_resultado: data.columnas || (filas.length ? Object.keys(filas[0]) : []),
            params_sql, params_dinamicos: paramNames, tipo_origen: 'sql_libre', tipo_viz: 'tabla'
        };
        // Recomendador de viz
        try {
            const primeraFila = filas[0] || {};
            const colsParaRec = Object.keys(primeraFila).map(k => {
                const v = primeraFila[k];
                let tipo = 'texto';
                if (typeof v === 'number') tipo = 'numero';
                else if (v instanceof Date) tipo = 'fecha';
                else if (typeof v === 'string') {
                    if (/^\d{4}-\d{2}-\d{2}/.test(v)) tipo = 'fecha';
                    else if (/^-?\d+(\.\d+)?$/.test(v)) tipo = 'numero';
                }
                return { nombre: k, tipo };
            });
            const vizResp = await api(`${API}/widgets/recomendar-viz`, {
                method: 'POST',
                body: JSON.stringify({ columnas: colsParaRec, muestra: filas.slice(0, 5) })
            });
            if (vizResp?.data?.recomendado) {
                const rec = vizResp.data;
                const VIZ_OK = ['tabla', 'barra', 'linea', 'pastel', 'kpi'];
                const vizFinal = VIZ_OK.includes(rec.recomendado) ? rec.recomendado : (rec.recomendado === 'barra_horizontal' ? 'barra' : 'tabla');
                state.pendingWidgetSave.tipo_viz = vizFinal;
                state.pendingWidgetSave.viz_recomendada = rec;
                const vizLabels = { tabla: 'Tabla', barra: 'Barras', linea: 'Línea', pastel: 'Pastel', kpi: 'KPI', barra_horizontal: 'Barras H.', dispersion: 'Dispersión' };
                let hint = document.getElementById('viz-rec-hint');
                if (!hint) {
                    hint = document.createElement('span');
                    hint.id = 'viz-rec-hint';
                    hint.className = 'viz-rec-hint';
                    const btnG = document.getElementById('btn-sql-guardar-widget');
                    btnG.parentNode.insertBefore(hint, btnG.nextSibling);
                }
                hint.textContent = `Viz sugerida: ${vizLabels[rec.recomendado] || rec.recomendado} — ${rec.razon}`;
                hint.title = rec.alternativas?.length ? `Alternativas: ${rec.alternativas.join(', ')}` : '';
            }
        } catch (_) { /* silenciar — el recomendador no debe bloquear */ }
        document.getElementById('btn-sql-guardar-widget').classList.remove('hidden');
    } catch (err) {
        container.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
    } finally { loading(btn, false); }
}

// ── ═══════════════ INIT ═══════════════ ──────────────────────
function init() {
    // Tema claro/oscuro
    if (localStorage.getItem('cenit-light') === 'true') document.body.classList.add('light');
    const btnTheme = document.getElementById('btn-dark-mode');
    btnTheme.addEventListener('click', () => {
        document.body.classList.toggle('light');
        const isLight = document.body.classList.contains('light');
        localStorage.setItem('cenit-light', String(isLight));
        btnTheme.textContent = isLight ? '🌙' : '☀️';
        btnTheme.setAttribute('aria-label', isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
    });

    // ESC cierra cualquier modal abierto
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        ['modal-guardar-widget', 'modal-guardar', 'modal-ejecutar',
            'modal-ejecutar-widget', 'modal-canvas-params', 'modal-canvas-customize'].forEach(id => {
                const el = document.getElementById(id);
                if (el && !el.classList.contains('hidden')) {
                    el.classList.add('hidden');
                    if (id === 'modal-guardar-widget') cerrarModalGuardar();
                }
            });
    });

    // Teclado — nav items (Enter / Espacio)
    document.getElementById('nav-menu').addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const li = e.target.closest('.nav-item');
            if (li?.dataset.view) navegar(li.dataset.view);
        }
    });

    // Navegación sidebar (click)
    document.getElementById('nav-menu').addEventListener('click', e => {
        const li = e.target.closest('.nav-item');
        if (li?.dataset.view) navegar(li.dataset.view);
    });

    // Botones data-goto
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-goto]');
        if (el) navegar(el.dataset.goto);
    });

    // Builder form
    document.getElementById('builder-form').addEventListener('submit', construirDashboard);

    // Slider
    const slider = document.getElementById('slider-widgets');
    const sliderVal = document.getElementById('slider-val');
    slider.addEventListener('input', () => { sliderVal.textContent = slider.value; });

    // Ejecutar todos
    document.getElementById('btn-ejecutar-todo').addEventListener('click', ejecutarTodos);

    // Guardar dashboard
    document.getElementById('btn-guardar-dashboard').addEventListener('click', abrirModalGuardarDashboard);
    document.getElementById('btn-guardar-dashboard-2').addEventListener('click', abrirModalGuardarDashboard);

    // Volver fases
    document.getElementById('btn-volver-form').addEventListener('click', () => mostrarFase('input'));
    document.getElementById('btn-volver-widgets').addEventListener('click', () => mostrarFase('widgets'));

    // Imprimir
    document.getElementById('btn-imprimir').addEventListener('click', () => window.print());

    // Reload context
    document.getElementById('btn-reload-context').addEventListener('click', async () => {
        try { await api(`${API}/admin/recargar-contexto`, { method: 'POST' }); toast('Contexto recargado', 'ok'); }
        catch (e) { toast(e.message, 'error'); }
    });

    // Modal guardar dashboard
    document.getElementById('modal-guardar-confirm').addEventListener('click', confirmarGuardarDashboard);
    document.getElementById('modal-guardar-cancel').addEventListener('click', () => document.getElementById('modal-guardar').classList.add('hidden'));
    document.getElementById('modal-guardar-close').addEventListener('click', () => document.getElementById('modal-guardar').classList.add('hidden'));

    // Conexiones tabs
    document.querySelectorAll('.cx-tab').forEach(btn =>
        btn.addEventListener('click', () => renderConexionTab(btn.dataset.sistema)));
    document.getElementById('btn-probar-todas').addEventListener('click', probarTodas);

    // Explorador
    document.getElementById('btn-exp-buscar').addEventListener('click', buscarMetricasExp);
    document.getElementById('exp-buscar').addEventListener('keydown', e => { if (e.key === 'Enter') buscarMetricasExp(); });

    // Modal explorador
    document.getElementById('modal-btn-ejecutar').addEventListener('click', ejecutarMetricaModal);
    document.getElementById('modal-close').addEventListener('click', () => document.getElementById('modal-ejecutar').classList.add('hidden'));
    document.getElementById('modal-btn-cerrar').addEventListener('click', () => document.getElementById('modal-ejecutar').classList.add('hidden'));
    document.getElementById('modal-viz-toggle').addEventListener('click', e => {
        const btn = e.target.closest('.viz-btn');
        if (!btn) return;
        state.modalViz = btn.dataset.viz;
        document.getElementById('modal-viz-toggle').querySelectorAll('.viz-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.viz === state.modalViz));
    });

    // Widget Studio tabs
    document.querySelectorAll('.studio-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.studio-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.studio-pane').forEach(p => p.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(`studio-tab-${btn.dataset.tab}`).classList.remove('hidden');
            if (btn.dataset.tab === 'plantillas') cargarStudio();
        });
    });

    document.getElementById('btn-studio-preview').addEventListener('click', previsualizarStudio);
    document.getElementById('btn-studio-ejecutar').addEventListener('click', ejecutarCompletoStudio);
    document.getElementById('btn-studio-csv').addEventListener('click', exportarCSVStudio);
    document.getElementById('btn-studio-add').addEventListener('click', agregarWidgetAlDashboard);
    document.getElementById('btn-sql-libre-ejecutar').addEventListener('click', ejecutarSQLLibre);

    document.getElementById('sql-libre-input').addEventListener('input', function () {
        renderParamsSQL(detectarParamsSQL(this.value));
    });

    // Asistente IA
    document.getElementById('btn-asistente-analizar').addEventListener('click', analizarConAsistente);
    document.getElementById('asistente-texto').addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); analizarConAsistente(); }
    });
    document.querySelector('#studio-tab-asistente').addEventListener('click', e => {
        const pill = e.target.closest('.ej-pill');
        if (!pill) return;
        const texto = pill.dataset.texto;
        if (texto) { document.getElementById('asistente-texto').value = texto; analizarConAsistente(); }
    });
    document.getElementById('btn-asistente-editar').addEventListener('click', () => document.getElementById('asistente-ajuste-panel').classList.toggle('hidden'));
    document.getElementById('btn-asistente-cerrar-ajuste').addEventListener('click', () => document.getElementById('asistente-ajuste-panel').classList.add('hidden'));
    document.getElementById('btn-asistente-reaplicar').addEventListener('click', aplicarAjusteAsistente);
    document.getElementById('asistente-viz-toggle').addEventListener('click', e => {
        const btn = e.target.closest('.viz-btn');
        if (!btn) return;
        state.asistente.viz = btn.dataset.viz;
        actualizarVizToggleAsistente(state.asistente.viz);
        if (state.asistente.resultado) renderAsistenteResultado();
    });
    document.getElementById('btn-asistente-csv').addEventListener('click', exportarCSVAsistente);
    document.getElementById('btn-asistente-add').addEventListener('click', agregarWidgetAsistenteAlDashboard);
    document.getElementById('btn-asistente-guardar-widget').addEventListener('click', () => {
        if (state.pendingWidgetSave) abrirModalGuardar(state.pendingWidgetSave);
        else toast('Ejecuta primero una consulta', 'error');
    });

    // SQL Libre – guardar widget
    document.getElementById('btn-sql-guardar-widget').addEventListener('click', () => {
        if (state.pendingWidgetSave) abrirModalGuardar(state.pendingWidgetSave);
        else toast('Ejecuta primero una consulta', 'error');
    });

    // Wizard
    document.getElementById('btn-nuevo-widget').addEventListener('click', () => abrirModalGuardar(null));
    document.getElementById('mw-btn-cerrar').addEventListener('click', cerrarModalGuardar);
    document.getElementById('mw-btn-cancelar').addEventListener('click', cerrarModalGuardar);
    document.getElementById('mw-btn-guardar').addEventListener('click', guardarWidgetDesdeModal);
    document.getElementById('modal-guardar-widget').addEventListener('click', e => {
        if (e.target === e.currentTarget) cerrarModalGuardar();
    });

    document.getElementById('wz-btn-interpretar').addEventListener('click', wzInterpretar);
    document.getElementById('wz-nl-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); wzInterpretar(); }
    });
    document.getElementById('wz-btn-personalizado').addEventListener('click', () => {
        if (state.wizard) { state.wizard.tipo = 'personalizado'; _wzRenderPaso(2); }
    });
    document.getElementById('wz-btn-preview').addEventListener('click', wzPreview);
    document.getElementById('wz-viz-toggle').addEventListener('click', e => {
        const btn = e.target.closest('.viz-btn');
        if (!btn || !state.wizard) return;
        state.wizard.viz = btn.dataset.viz;
        document.getElementById('wz-viz-toggle').querySelectorAll('.viz-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.viz === state.wizard.viz));
    });
    document.getElementById('wz-color-presets').addEventListener('click', e => {
        const dot = e.target.closest('.color-dot');
        if (dot) document.getElementById('wz-color').value = dot.dataset.color;
    });
    document.getElementById('wz-btn-siguiente').addEventListener('click', wzSiguiente);
    document.getElementById('wz-btn-atras').addEventListener('click', wzAtras);
    document.getElementById('wz-btn-agregar-panel').addEventListener('click', wzAgregarAlPanel);

    // Mis Widgets — delegación de eventos
    document.getElementById('mis-widgets-lista').addEventListener('click', e => {
        const btnRun = e.target.closest('.wcg-btn-run');
        const btnDel = e.target.closest('.wcg-btn-delete');
        const btnCanvas = e.target.closest('.wcg-btn-canvas');
        if (btnRun) ejecutarWidgetGuardado(btnRun.dataset.id);
        if (btnDel) eliminarWidgetGuardado(btnDel.dataset.id, btnDel.dataset.nombre);
        if (btnCanvas) {
            const d = btnCanvas.dataset;
            let params = [];
            try { params = JSON.parse(d.params || '[]'); } catch (_) { /* noop */ }
            if (typeof window.addTileToCanvas === 'function') {
                window.addTileToCanvas({ id: d.id, nombre: d.nombre, sistema: d.sistema, sql: d.sql, color_primario: d.color, tipo_viz: d.viz, params_dinamicos: params });
                navegar('canvas');
                toast('Widget agregado al Canvas ⊞', 'ok');
            } else {
                toast('Navega al Canvas Editor primero', 'info');
            }
        }
    });

    document.getElementById('btn-copiar-sql').addEventListener('click', () => {
        const sql = document.getElementById('studio-sql-display').textContent;
        navigator.clipboard.writeText(sql).then(() => toast('SQL copiado', 'ok')).catch(() => toast('No se pudo copiar', 'error'));
    });
    document.getElementById('btn-cols-all').addEventListener('click', () =>
        document.querySelectorAll('.studio-col-check').forEach(ch => { ch.checked = true; }));
    document.getElementById('btn-cols-none').addEventListener('click', () =>
        document.querySelectorAll('.studio-col-check').forEach(ch => { ch.checked = false; }));
    document.getElementById('btn-cols-default').addEventListener('click', () =>
        document.querySelectorAll('.studio-col-check').forEach(ch => { ch.checked = ch.dataset.defecto === '1'; }));

    document.getElementById('studio-viz-toggle').addEventListener('click', e => {
        const btn = e.target.closest('.viz-btn');
        if (!btn) return;
        state.studio.viz = btn.dataset.viz;
        document.getElementById('studio-viz-toggle').querySelectorAll('.viz-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.viz === state.studio.viz));
        if (state.studio.resultado) renderStudioChart();
    });

    // Vista inicial
    navegar('inicio');
}

document.addEventListener('DOMContentLoaded', init);
