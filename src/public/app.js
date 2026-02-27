'use strict';

/* =========================================================
   CENIT IA — app.js
   Dashboard Inteligente para Aspel SAE · COI · NOI · BANCO
   ========================================================= */

const API = '/api';

// ── Estado global ──────────────────────────────────────────
const state = {
  view: 'inicio',
  dashboard: null,       // dashboard en edición
  vizTypes: {},          // widgetId → tipo visualización
  resultados: {},        // widgetId → datos ejecutados
  dashboards: [],        // paneles guardados
  conexiones: {},        // config conexiones
  conexionTab: 'SAE',    // tab activo en conexiones
  expMetricas: [],       // métricas en explorador
  expMetricaActiva: null,
  modalViz: 'tabla',
  charts: {},            // Chart.js instances activos
  pendingWidgetSave: null // contexto para modal «Guardar como Widget»
};

// ── Utilidades ─────────────────────────────────────────────
async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString('es-MX', { maximumFractionDigits: 2 });
  return String(v);
}

function fmtMoneda(v) {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function toast(msg, tipo = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

function loading(el, on, texto = 'Procesando...') {
  if (on) { el.disabled = true; el.dataset.orig = el.textContent; el.textContent = texto; }
  else { el.disabled = false; el.textContent = el.dataset.orig || el.textContent; }
}

function getSistemas() {
  return [...document.querySelectorAll('[name="sistemas"]:checked')].map(c => c.value);
}

function destroyChart(id) {
  if (state.charts[id]) { try { state.charts[id].destroy(); } catch (_) { } delete state.charts[id]; }
}

// ── Navegación ─────────────────────────────────────────────
function navegar(vista) {
  state.view = vista;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', false));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', true));
  const el = document.getElementById(`view-${vista}`);
  if (el) { el.classList.remove('hidden'); el.classList.add('active'); }
  document.querySelectorAll('.nav-item').forEach(li => li.classList.toggle('active', li.dataset.view === vista));

  if (vista === 'inicio') cargarInicio();
  if (vista === 'dashboards') cargarPaneles();
  if (vista === 'conexiones') cargarConexiones();
  if (vista === 'explorador') iniciarExplorador();
  if (vista === 'studio') cargarStudio();
  if (vista === 'mis-widgets') cargarMisWidgets();
}

// ── ═══════════════ INICIO ═══════════════ ──
async function cargarInicio() {
  const grid = document.getElementById('sistemas-cards');
  grid.innerHTML = '<div class="spinner"></div>';
  try {
    const { data } = await api(`${API}/health`);
    const sistemas = data || [];
    grid.innerHTML = sistemas.map(s => `
      <div class="sistema-card sistema-${s.sistema?.toLowerCase()}">
        <div class="sc-header">
          <span class="sc-badge">${esc(s.sistema)}</span>
          <span class="sc-count">${s.metricas ?? 0} métricas</span>
        </div>
        <h3 class="sc-name">${esc(s.nombre || s.sistema)}</h3>
        <p class="sc-tablas">${s.tablas ?? 0} tablas mapeadas</p>
        <button class="btn btn-ghost sc-btn" data-goto="builder" data-sistemas="${esc(s.sistema)}">
          Construir dashboard →
        </button>
      </div>
    `).join('');
    actualizarStatusGlobal(true);
  } catch (e) {
    grid.innerHTML = `<p class="error-msg">Error cargando estado: ${esc(e.message)}</p>`;
    actualizarStatusGlobal(false);
  }
}

function actualizarStatusGlobal(ok) {
  const dot = document.getElementById('dot-global');
  const txt = document.getElementById('status-global-text');
  dot.className = `dot ${ok ? 'ok' : 'error'}`;
  txt.textContent = ok ? 'Sistema operativo' : 'Sin conexión';
}

// ── ═══════════════ CONSTRUCTOR IA ═══════════════ ──
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
        <span class="badge badge-${w.sistema?.toLowerCase()}">${esc(w.sistema)}</span>
        <span class="badge badge-cat">${esc(w.categoria || 'general')}</span>
        <button class="btn-remove" data-id="${esc(w.id)}" title="Quitar">✕</button>
      </div>
      <h3 class="ws-titulo">${esc(w.titulo || w.nombre || w.id)}</h3>
      <p class="ws-desc">${esc(w.descripcion || '')}</p>
      <div class="viz-toggler">
        ${['kpi', 'tabla', 'barra', 'linea', 'pastel', 'area'].map(v =>
      `<button class="viz-btn ${vizActual === v ? 'active' : ''}" data-viz="${v}" data-wid="${esc(w.id)}">${vizLabel(v)}</button>`
    ).join('')}
      </div>
      <div class="ws-footer">
        <code class="ws-id">${esc(w.metrica_id || w.id)}</code>
        <button class="btn btn-sm btn-secondary ws-run" data-wid="${esc(w.id)}">▶ Ejecutar</button>
      </div>
    `;
    grid.appendChild(card);
  });

  // listeners
  grid.querySelectorAll('.viz-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const wid = btn.dataset.wid;
      const viz = btn.dataset.viz;
      state.vizTypes[wid] = viz;
      grid.querySelectorAll(`.viz-btn[data-wid="${wid}"]`).forEach(b => b.classList.toggle('active', b.dataset.viz === viz));
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

// ── Normaliza datos de API → array plano de {col: valor} ──
function normalizarFilas(datos) {
  if (!datos) return [];

  // El ejecutor envuelve en {datos: <resultado formateado>, ...}
  const d = datos.datos ?? datos.data ?? datos.resultado ?? datos.rows;

  // 1. Ya es un array plano
  if (Array.isArray(d)) return d;

  // 2. formatearTabla → { filas: [{col: {valor, valor_formateado}},...] }
  if (d && Array.isArray(d.filas)) {
    return d.filas.map(fila =>
      Object.fromEntries(
        Object.entries(fila).map(([col, cell]) => [
          col,
          (cell !== null && typeof cell === 'object' && 'valor' in cell) ? cell.valor : cell
        ])
      )
    );
  }

  // 3. formatearSerie → { serie: [{fecha, valor, valor_formateado},...] }
  if (d && Array.isArray(d.serie)) {
    return d.serie.map(s => ({ periodo: s.fecha ?? s.periodo, valor: s.valor }));
  }

  // 4. Array en el objeto raíz (fallback)
  if (Array.isArray(datos)) return datos;

  return [];
}

// Extrae valor escalar de la respuesta (formatearEscalar → { valor, ... })
function normalizarValor(datos) {
  if (!datos) return undefined;
  if (datos.valor !== undefined) return datos.valor;
  const d = datos.datos ?? datos.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    if (d.valor !== undefined) return d.valor;
    if (d.filas && Array.isArray(d.filas) && d.filas[0]) {
      const primera = d.filas[0];
      const firstCell = Object.values(primera)[0];
      return (firstCell && typeof firstCell === 'object' && 'valor' in firstCell)
        ? firstCell.valor
        : firstCell;
    }
  }
  return undefined;
}

// ── Renderización de visualizaciones ──────────────────────
function renderizarEnContenedor(container, datos, viz, titulo, chartId) {
  if (!datos) { container.innerHTML = '<p class="sin-datos">Sin datos</p>'; return; }

  const filas = normalizarFilas(datos);
  const valor = normalizarValor(datos);

  if (viz === 'kpi') {
    renderKPI(container, valor ?? (filas[0] ? Object.values(filas[0])[0] : null), titulo, datos.unidad, datos.variacion);
    return;
  }

  if (viz === 'tabla') {
    renderTabla(container, filas);
    return;
  }

  if (viz === 'reporte') {
    renderReporte(container, filas, titulo);
    return;
  }

  if (!filas || filas.length === 0) {
    if (valor !== undefined) { renderKPI(container, valor, titulo, datos.unidad); return; }
    container.innerHTML = '<p class="sin-datos">Sin registros para graficar</p>';
    return;
  }

  renderChart(container, chartId, filas, viz, titulo);
}

function fmtCompacto(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(2) + ' B';
  if (abs >= 1_000_000)     return sign + (abs / 1_000_000).toFixed(2) + ' M';
  if (abs >= 1_000)         return sign + (abs / 1_000).toFixed(1) + ' K';
  return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function renderKPI(container, valor, titulo, unidad = '', variacion = null) {
  const n = Number(valor);
  const display = isFinite(n) ? fmtCompacto(n) : fmt(valor);

  const colorClass = isFinite(n) ? (n < 0 ? 'kpi-neg' : n > 0 ? 'kpi-pos' : 'kpi-zero') : '';

  let varHtml = '';
  if (variacion !== null) {
    const vn = Number(variacion);
    const cls = vn >= 0 ? 'kpi-up' : 'kpi-down';
    varHtml = `<div class="kpi-var ${cls}">${vn >= 0 ? '▲' : '▼'} ${Math.abs(vn).toFixed(1)}%</div>`;
  }

  const icon = isFinite(n)
    ? (n < 0 ? '📉' : n > 0 ? '📈' : '—')
    : '📊';

  container.innerHTML = `
    <div class="kpi-card ${colorClass}">
      <div class="kpi-icon">${icon}</div>
      <div class="kpi-body">
        <div class="kpi-titulo">${esc(titulo)}</div>
        <div class="kpi-valor">${esc(display)}${unidad ? `<span class="kpi-unidad"> ${esc(unidad)}</span>` : ''}</div>
        ${varHtml}
      </div>
    </div>
  `;
}

function renderTabla(container, filas) {
  if (!filas || filas.length === 0) {
    container.innerHTML = '<p class="sin-datos">Sin registros</p>';
    return;
  }

  const cols = Object.keys(filas[0] || {});
  const muestra = filas.slice(0, 200);

  // Detectar columnas numéricas y calcular máximos por columna
  const esCurrencyCol = c => /importe|total|monto|saldo|cargo|abono|subtotal|iva|presup|inicial|montomov|imp_tot/i.test(c);
  const esPctCol     = c => /pct|margen|porc|cumpl|variacion/i.test(c);

  const numCols = {};
  cols.forEach(c => {
    const vals = muestra.map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '');
    const todos = vals.map(v => Number(v));
    if (todos.length > 0 && todos.every(n => isFinite(n))) {
      const maxAbs = Math.max(...todos.map(Math.abs));
      numCols[c] = { max: maxAbs, esCurrency: esCurrencyCol(c), esPct: esPctCol(c) };
    }
  });

  // Estado de orden
  let sortCol = null;
  let sortAsc = true;

  function fmtCell(col, v) {
    const n = Number(v);
    if (v === null || v === undefined || v === '') return '<span class="null-val">—</span>';
    if (numCols[col]) {
      const info = numCols[col];
      const cls  = n < 0 ? 'num-neg' : n > 0 ? 'num-pos' : 'num-zero';
      let txt;
      if (info.esCurrency) txt = fmtMoneda(n);
      else if (info.esPct)  txt = n.toFixed(1) + '%';
      else txt = n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

      const pct  = info.max > 0 ? Math.min(Math.abs(n) / info.max * 100, 100) : 0;
      return `<div class="cell-num ${cls}">
        <div class="ibar" style="width:${pct.toFixed(1)}%"></div>
        <span class="cell-txt">${txt}</span>
      </div>`;
    }
    return `<span>${esc(fmt(v))}</span>`;
  }

  function buildTable(data) {
    const headerCells = cols.map(c => {
      const isNum = !!numCols[c];
      const sortMark = sortCol === c ? (sortAsc ? ' ▲' : ' ▼') : '';
      return `<th class="th-smart${isNum ? ' th-num' : ''}" data-col="${esc(c)}">${esc(c)}${sortMark}</th>`;
    }).join('');

    const rows = data.map(row =>
      `<tr>${cols.map(c => `<td class="${numCols[c] ? 'td-num' : ''}">${fmtCell(c, row[c])}</td>`).join('')}</tr>`
    ).join('');

    return `<table class="data-table smart-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  function render(data) {
    container.innerHTML = `
      <div class="tabla-scroll">
        ${buildTable(data)}
      </div>
      <div class="tabla-footer">
        ${data.length} registro${data.length !== 1 ? 's' : ''}${filas.length > 200 ? ` (mostrando 200 de ${filas.length})` : ''}
      </div>`;

    // Bind sort headers
    container.querySelectorAll('.th-smart').forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) sortAsc = !sortAsc;
        else { sortCol = col; sortAsc = true; }

        const sorted = [...muestra].sort((a, b) => {
          const av = numCols[col] ? Number(a[col]) : String(a[col] ?? '');
          const bv = numCols[col] ? Number(b[col]) : String(b[col] ?? '');
          return sortAsc ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
        });
        render(sorted);
      });
    });
  }

  render(muestra);
}

function renderReporte(container, filas, titulo) {
  if (!filas || filas.length === 0) { container.innerHTML = '<p class="sin-datos">Sin datos</p>'; return; }
  const cols = Object.keys(filas[0] || {});
  container.innerHTML = `
    <div class="reporte">
      <h4 class="reporte-titulo">${esc(titulo)}</h4>
      <table class="reporte-table">
        <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${filas.map(row =>
    `<tr>${cols.map(c => `<td>${esc(fmt(row[c]))}</td>`).join('')}</tr>`
  ).join('')}</tbody>
      </table>
    </div>
  `;
}

function renderChart(container, chartId, filas, viz, titulo) {
  if (!filas || filas.length === 0) { container.innerHTML = '<p class="sin-datos">Sin datos para graficar</p>'; return; }

  const cols = Object.keys(filas[0]);
  const labelCol = cols[0];
  // Detectar todas las columnas numéricas como series
  const numCols = cols.slice(1).filter(c => {
    const vals = filas.slice(0, 20).map(r => Number(r[c]));
    return vals.every(n => isFinite(n));
  });
  const valueCols = numCols.length > 0 ? numCols : [cols[1] ?? cols[0]];

  const labels = filas.map(r => fmt(r[labelCol])).slice(0, 50);
  const MAX_ROWS = 50;

  const palette = ['#00b4c5', '#f28f3b', '#7cc8a0', '#9983d4', '#f4c542',
    '#e07b6a', '#3fa7d6', '#59cd90', '#ffd166', '#ef476f'];

  const tipo = viz === 'area' ? 'line' : viz === 'pastel' ? 'pie' : viz === 'linea' ? 'line' : 'bar';

  // Construir datasets — uno por columna de valor
  const datasets = tipo === 'pie'
    ? [{
        label: valueCols[0],
        data: filas.slice(0, MAX_ROWS).map(r => Number(r[valueCols[0]]) || 0),
        backgroundColor: palette,
        borderColor: '#161b22',
        borderWidth: 2,
      }]
    : valueCols.map((col, i) => {
        const color = palette[i % palette.length];
        const data  = filas.slice(0, MAX_ROWS).map(r => Number(r[col]) || 0);
        return {
          label: col,
          data,
          backgroundColor: tipo === 'bar'
            ? color + 'bb'
            : (ctx) => {
                const chart = ctx.chart;
                const { ctx: c2d, chartArea } = chart;
                if (!chartArea) return color;
                const gradient = c2d.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                gradient.addColorStop(0, color + 'cc');
                gradient.addColorStop(1, color + '11');
                return gradient;
              },
          borderColor: color,
          borderWidth: tipo === 'line' ? 2 : 0,
          fill: viz === 'area',
          tension: 0.35,
          pointRadius: tipo === 'line' ? 3 : 0,
          pointHoverRadius: 5,
        };
      });

  const wrapper = document.createElement('div');
  wrapper.className = 'chart-wrapper';
  const canvas = document.createElement('canvas');
  canvas.id = chartId;
  wrapper.appendChild(canvas);
  container.innerHTML = '';
  container.appendChild(wrapper);

  const fmtTooltip = v => {
    const n = Number(v);
    return isFinite(n) ? fmtMoneda(n) : v;
  };

  const config = {
    type: tipo,
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: tipo === 'pie' || datasets.length > 1,
          labels: { color: '#c9d1d9', boxWidth: 12, padding: 12 }
        },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#c9d1d9',
          bodyColor: '#8b949e',
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtTooltip(ctx.raw)}`
          }
        },
        title: { display: false }
      },
      scales: tipo !== 'pie' ? {
        x: {
          ticks: { color: '#8b949e', maxTicksLimit: 14, maxRotation: 45 },
          grid: { color: '#21262d' }
        },
        y: {
          ticks: {
            color: '#8b949e',
            callback: v => fmtCompacto(Number(v))
          },
          grid: { color: '#21262d' }
        }
      } : {}
    }
  };

  destroyChart(chartId);
  state.charts[chartId] = new Chart(canvas, config);
}

// ── ═══════════════ GUARDAR DASHBOARD ═══════════════ ──
function abrirModalGuardar() {
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

// ── ═══════════════ MIS DASHBOARDS ═══════════════ ──
async function cargarPaneles() {
  const grid = document.getElementById('paneles-lista');
  grid.innerHTML = '<div class="spinner"></div>';
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
          <button class="btn btn-primary panel-cargar" data-id="${esc(p.id)}">▶ Cargar</button>
          <button class="btn btn-danger panel-eliminar" data-id="${esc(p.id)}">✕</button>
        </div>
      </div>
    `).join('');

    grid.querySelectorAll('.panel-cargar').forEach(btn => {
      btn.addEventListener('click', () => cargarDashboard(btn.dataset.id));
    });
    grid.querySelectorAll('.panel-eliminar').forEach(btn => {
      btn.addEventListener('click', () => eliminarDashboard(btn.dataset.id));
    });
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
  } catch (err) {
    toast(`Error cargando: ${err.message}`, 'error');
  }
}

async function eliminarDashboard(id) {
  if (!confirm('¿Eliminar este dashboard?')) return;
  try {
    await api(`${API}/paneles/${id}`, { method: 'DELETE' });
    toast('Eliminado', 'ok');
    cargarPaneles();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ── ═══════════════ CONEXIONES ═══════════════ ──
async function cargarConexiones() {
  try {
    const { data } = await api(`${API}/conexiones`);
    state.conexiones = data;
    renderConexionTab(state.conexionTab);
  } catch (err) {
    toast(`Error cargando conexiones: ${err.message}`, 'error');
  }
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
          <label class="form-label">Host / IP</label>
          <input class="form-input" id="cx-host" value="${esc(cfg.host || '127.0.0.1')}">
        </div>
        <div class="form-group w-100">
          <label class="form-label">Puerto</label>
          <input class="form-input" id="cx-port" type="number" value="${esc(cfg.port || 3050)}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Ruta de base de datos (.FDB)</label>
        <input class="form-input" id="cx-database" value="${esc(cfg.database || '')}">
        <small class="form-hint">Ejemplo: C:\\Program Files (x86)\\...\\SAE90EMPRE01.FDB</small>
      </div>
      <div class="form-row">
        <div class="form-group flex-1">
          <label class="form-label">Usuario</label>
          <input class="form-input" id="cx-user" value="${esc(cfg.user || 'SYSDBA')}">
        </div>
        <div class="form-group flex-1">
          <label class="form-label">Contraseña</label>
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
      <div id="cx-resultado" class="cx-resultado"></div>
    </div>
  `;

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
    await api(`${API}/conexiones/${sistema}`, { method: 'PUT', body: JSON.stringify(body) });
    toast(`Conexión ${sistema} guardada ✓`, 'ok');
    await cargarConexiones();
  } catch (err) {
    toast(`Error: ${err.message}`, 'error');
  } finally {
    loading(btn, false);
  }
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
  } finally {
    loading(btn, false);
  }
}

async function probarTodas() {
  const btn = document.getElementById('btn-probar-todas');
  loading(btn, true, '⬡ Probando...');
  try {
    const { data } = await api(`${API}/conexiones/probar-todas`, { method: 'POST' });
    const oks = data.filter(d => d.exito).length;
    toast(`${oks} de ${data.length} sistemas conectados`, oks === data.length ? 'ok' : 'error');

    // Actualizar panel activo
    renderConexionTab(state.conexionTab);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(btn, false);
  }
}

// ── ═══════════════ EXPLORADOR ═══════════════ ──
async function iniciarExplorador() {
  await buscarMetricasExp();
}

async function buscarMetricasExp() {
  const sistema = document.getElementById('exp-sistema')?.value || '';
  const texto = document.getElementById('exp-buscar')?.value?.trim() || '';
  const btn = document.getElementById('btn-exp-buscar');
  if (btn) loading(btn, true, 'Buscando...');
  const grid = document.getElementById('exp-resultados');
  grid.innerHTML = '<div class="spinner"></div>';

  try {
    let endpoint = `${API}/metricas?limite=50`;
    if (sistema) endpoint += `&sistema=${sistema}`;
    if (texto) endpoint += `&texto=${encodeURIComponent(texto)}`;
    const { data } = await api(endpoint);
    state.expMetricas = data || [];

    if (!state.expMetricas.length) {
      grid.innerHTML = '<p class="sin-datos">Sin resultados — prueba otro término</p>';
      return;
    }

    grid.innerHTML = state.expMetricas.map(m => `
      <div class="exp-metric-card">
        <div class="exp-mc-header">
          <span class="badge badge-${(m.sistema || '').toLowerCase()}">${esc(m.sistema)}</span>
          <span class="badge badge-cat">${esc(m.categoria || 'general')}</span>
          <span class="badge">${esc(m.tipo || 'escalar')}</span>
        </div>
        <h4 class="exp-mc-titulo">${esc(m.nombre || m.id)}</h4>
        <p class="exp-mc-desc">${esc(m.descripcion || '')}</p>
        <button class="btn btn-sm btn-primary exp-mc-run" data-id="${esc(m.id)}" data-sistema="${esc(m.sistema)}">
          ▶ Ejecutar ad-hoc
        </button>
      </div>
    `).join('');

    grid.querySelectorAll('.exp-mc-run').forEach(btn => {
      btn.addEventListener('click', () => abrirModalEjecutar(btn.dataset.id, btn.dataset.sistema));
    });
  } catch (err) {
    grid.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
  } finally {
    if (btn) loading(btn, false);
  }
}

function abrirModalEjecutar(metricaId, sistema) {
  const metrica = state.expMetricas.find(m => m.id === metricaId);
  state.expMetricaActiva = { metricaId, sistema };
  state.modalViz = 'tabla';

  document.getElementById('modal-titulo').textContent = metrica?.nombre || metricaId;
  document.getElementById('modal-descripcion').textContent = metrica?.descripcion || '';
  document.getElementById('modal-resultado').innerHTML = '';
  document.getElementById('modal-viz-toggle').querySelectorAll('.viz-btn').forEach(b => b.classList.toggle('active', b.dataset.viz === 'tabla'));
  document.getElementById('modal-ejecutar').classList.remove('hidden');
}

async function ejecutarMetricaModal() {
  const { metricaId, sistema } = state.expMetricaActiva || {};
  if (!metricaId) return;
  const btn = document.getElementById('modal-btn-ejecutar');
  loading(btn, true, '⏳');
  const container = document.getElementById('modal-resultado');
  container.innerHTML = '';
  destroyChart('modal-chart');

  try {
    const { data } = await api(`${API}/metricas/${encodeURIComponent(metricaId)}/ejecutar`, {
      method: 'POST', body: JSON.stringify({ sistema, modo: 'auto' })
    });
    const titulo = document.getElementById('modal-titulo').textContent;
    renderizarEnContenedor(container, data, state.modalViz, titulo, 'modal-chart');
  } catch (err) {
    container.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
  } finally {
    loading(btn, false);
  }
}

// ── ═══════════════ WIDGET STUDIO ═══════════════ ──

// Estado del studio
state.studio = {
  templates: [],
  templateActivo: null,
  viz: 'tabla',
  resultado: null,
  modoPreview: false
};

async function cargarStudio() {
  if (state.studio.templates.length > 0) return; // ya cargado
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
    <button class="studio-template-card" data-tid="${esc(t.id)}">
      <span class="stc-icon">${esc(t.icono || '📊')}</span>
      <strong class="stc-nombre">${esc(t.nombre)}</strong>
      <span class="stc-sistema badge badge-${(t.sistema || '').toLowerCase()}">${esc(t.sistema)}</span>
      <p class="stc-desc">${esc(t.descripcion)}</p>
    </button>
  `).join('');

  grid.querySelectorAll('.studio-template-card').forEach(btn => {
    btn.addEventListener('click', () => seleccionarTemplate(btn.dataset.tid));
  });
}

function seleccionarTemplate(templateId) {
  const template = state.studio.templates.find(t => t.id === templateId);
  if (!template) return;

  state.studio.templateActivo = template;
  state.studio.resultado = null;
  state.studio.viz = 'tabla';

  // Highlight tarjeta seleccionada
  document.querySelectorAll('.studio-template-card').forEach(b => {
    b.classList.toggle('active', b.dataset.tid === templateId);
  });

  // Actualizar título paso 2
  document.getElementById('studio-paso2-titulo').textContent = template.nombre;

  // Renderizar filtros
  renderFiltrosStudio(template);

  // Renderizar selector de columnas
  renderColumnasStudio(template);

  // Resetear SQL preview y resultado
  document.getElementById('studio-sql-display').textContent = '— Haz clic en Previsualizar para generar el SQL —';
  document.getElementById('studio-paso-resultado').classList.add('hidden');

  // Mostrar paso 2
  document.getElementById('studio-paso-config').classList.remove('hidden');
  document.getElementById('studio-paso-config').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderFiltrosStudio(template) {
  const container = document.getElementById('studio-filtros-container');
  container.innerHTML = (template.filtros || []).map(f => {
    const val = typeof f.defecto === 'function' ? f.defecto() : (f.defecto ?? '');

    if (f.tipo === 'select') {
      return `
        <div class="form-row">
          <label class="form-label">${esc(f.nombre)}</label>
          <select class="form-select studio-filtro" data-fid="${esc(f.id)}">
            ${(f.opciones || []).map(op =>
        `<option value="${esc(op.valor)}" ${op.valor === val ? 'selected' : ''}>${esc(op.etiqueta)}</option>`
      ).join('')}
          </select>
        </div>`;
    }

    if (f.tipo === 'fecha') {
      return `
        <div class="form-row">
          <label class="form-label">${esc(f.nombre)}</label>
          <input type="date" class="form-input studio-filtro" data-fid="${esc(f.id)}" value="${esc(val)}" />
        </div>`;
    }

    // numero / texto
    const extra = f.min !== undefined ? `min="${f.min}"` : '';
    const extra2 = f.max !== undefined ? `max="${f.max}"` : '';
    return `
      <div class="form-row">
        <label class="form-label">${esc(f.nombre)}</label>
        <input type="${f.tipo === 'numero' ? 'number' : 'text'}" class="form-input studio-filtro"
          data-fid="${esc(f.id)}" value="${esc(val)}" ${extra} ${extra2} />
      </div>`;
  }).join('');
}

function renderColumnasStudio(template) {
  const container = document.getElementById('studio-columnas-container');
  container.innerHTML = (template.columnas_disponibles || []).map(col => `
    <label class="col-check-item ${col.defecto ? 'defecto' : ''}">
      <input type="checkbox" class="studio-col-check" data-cid="${esc(col.id)}"
        data-defecto="${col.defecto ? '1' : '0'}"
        ${col.defecto ? 'checked' : ''} />
      <span class="col-badge col-${esc(col.tipo)}">${esc(col.tipo)}</span>
      ${esc(col.nombre)}
    </label>
  `).join('');
}

function getParamsStudio() {
  const params = {};
  document.querySelectorAll('.studio-filtro').forEach(el => {
    params[el.dataset.fid] = el.value;
  });
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
    // Primero solo SQL para el preview del código
    const { data: sqlData } = await api(`${API}/widget-studio/construir`, {
      method: 'POST',
      body: JSON.stringify({ tipo: template.id, sistema: template.sistema, params, columnas, solo_sql: true })
    });
    document.getElementById('studio-sql-display').textContent = sqlData.sql || '';

    // Luego ejecutar (preview = solo 5 filas — el backend ya limita con FIRST 500 pero mostramos 5)
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
    if (err.sql) document.getElementById('studio-sql-display').textContent = err.sql;
  } finally {
    loading(btn, false);
  }
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
    if (err.sql) document.getElementById('studio-sql-display').textContent = err.sql;
  } finally {
    loading(btn, false);
  }
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

  // Normalizar: los datos del widget studio ya vienen como array plano
  const filas = Array.isArray(datos.filas) ? datos.filas : [];
  const titulo = state.studio.templateActivo?.nombre || '';

  // Usar la misma función renderizarEnContenedor pero con los datos adaptatados
  const datosWrap = {
    datos: {
      filas: filas.map(fila => {
        const row = {};
        for (const [k, v] of Object.entries(fila)) {
          row[k] = { valor: v, valor_formateado: fmt(v) };
        }
        return row;
      })
    }
  };

  renderizarEnContenedor(container, datosWrap, state.studio.viz, titulo, 'studio-chart');
}

function exportarCSVStudio() {
  const datos = state.studio.resultado;
  if (!datos || !datos.filas || datos.filas.length === 0) {
    toast('Sin datos para exportar', 'error'); return;
  }
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

  // Crear un widget synthetic con los datos ya cargados
  const widgetId = `studio_${template.id}_${Date.now()}`;
  const widget = {
    id: widgetId,
    metrica_id: widgetId,
    nombre: template.nombre,
    titulo: template.nombre,
    descripcion: template.descripcion,
    sistema: template.sistema,
    categoria: 'studio',
    tipo_widget: 'tabla',
    _studio_datos: datos // datos precargados
  };

  if (!state.dashboard) {
    state.dashboard = { widgets: [], objetivo: 'Widget Studio' };
    state.vizTypes = {};
    state.resultados = {};
  }

  state.dashboard.widgets.push(widget);
  state.vizTypes[widgetId] = state.studio.viz;
  state.resultados[widgetId] = {
    datos: {
      filas: datos.filas.map(fila => {
        const row = {};
        for (const [k, v] of Object.entries(fila)) {
          row[k] = { valor: v, valor_formateado: fmt(v) };
        }
        return row;
      })
    }
  };

  toast(`✓ "${template.nombre}" agregado al dashboard`, 'ok');
  navegar('builder');
  mostrarFase('widgets');
  renderWidgetsSupgeridos(state.dashboard.widgets, state.dashboard.objetivo);
}

// SQL LIBRE

// Extrae nombres únicos de parámetros :nombre en un SQL (orden de primera aparición).
// Ignora ocurrencias dentro de comentarios SQL (bloques y lineas --).
function detectarParamsSQL(sql) {
  const vistos = new Set();
  const orden = [];
  const re = /(\/\*[\s\S]*?\*\/|--[^\r\n]*)|:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    if (m[1]) continue; // saltar comentarios
    const n = m[2].toLowerCase();
    if (!vistos.has(n)) { vistos.add(n); orden.push(n); }
  }
  return orden;
}

/* Renderiza inputs por cada :param detectado en el SQL */
function renderParamsSQL(paramNames) {
  const panel = document.getElementById('sql-params-panel');
  const cont = document.getElementById('sql-params-inputs');
  if (!paramNames.length) { panel.classList.add('hidden'); return; }

  const NUMERICOS = new Set(['mes', 'nivel', 'ejercicio', 'ano', 'limite', 'nivel_max', 'num_poliz']);
  const NULLABLE = new Set(['prefijo', 'cliente', 'vendedor', 'cuenta', 'cta', 'num_cta']);

  cont.innerHTML = paramNames.map(name => {
    const isNum = NUMERICOS.has(name);
    const hint = NULLABLE.has(name) ? '(vacío = NULL)' : '';
    // Valores por defecto típicos
    const defaults = { mes: new Date().getMonth() + 1, ejercicio: new Date().getFullYear(), nivel: 1 };
    const def = defaults[name] !== undefined ? defaults[name] : '';
    return `<div class="sql-param-field">
      <label class="sql-param-label">:${name}</label>
      <input
        type="${isNum ? 'number' : 'text'}"
        id="sqlp-${name}"
        class="form-input sql-param-input"
        placeholder="${hint}"
        value="${def}"
      >
    </div>`;
  }).join('');

  panel.classList.remove('hidden');
}

async function ejecutarSQLLibre() {
  const sql = document.getElementById('sql-libre-input').value.trim();
  const sistema = document.getElementById('sql-libre-sistema').value;
  const btn = document.getElementById('btn-sql-libre-ejecutar');

  if (!sql) { toast('Escribe una consulta SQL', 'error'); return; }

  // Recoger valores de parámetros :nombre
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
    // Guardar contexto para el modal «Guardar como Widget»
    state.pendingWidgetSave = {
      sql, sistema,
      columnas_resultado: data.columnas || (filas.length ? Object.keys(filas[0]) : []),
      params_sql,
      params_dinamicos: paramNames,
      tipo_origen: 'sql_libre',
      tipo_viz: 'tabla'
    };
    document.getElementById('btn-sql-guardar-widget').classList.remove('hidden');
  } catch (err) {
    container.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
  } finally {
    loading(btn, false);
  }
}

// ── ═══════════════ ASISTENTE IA ═══════════════ ──

// Estado del asistente
state.asistente = {
  ultimaInterpretacion: null,
  viz: 'tabla',
  resultado: null
};

async function analizarConAsistente() {
  const texto = (document.getElementById('asistente-texto').value || '').trim();
  if (!texto) { toast('Escribe qué quieres analizar', 'error'); return; }

  const btn = document.getElementById('btn-asistente-analizar');
  loading(btn, true, '✦ Analizando...');

  // Ocultar resultado anterior
  document.getElementById('asistente-resultado-area').classList.add('hidden');

  try {
    const { ok, data, error, sin_match, sugerencias, error_ejecucion } = await fetch(`${API}/widget-studio/interpretar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto })
    }).then(r => r.json());

    // Sin match NLP — no entendió la consulta
    if (sin_match) {
      const area = document.getElementById('asistente-resultado-area');
      area.classList.remove('hidden');
      document.getElementById('asistente-resultado-container').innerHTML =
        `<div class="ai-no-match">
          <div class="ai-no-match-icon">🤔</div>
          <p class="ai-no-match-msg">${esc(error || 'No pude interpretar la consulta')}</p>
          ${sugerencias?.length ? `<p class="sug-hint">Intenta con:</p>
            <div class="asistente-ejemplos">${sugerencias.map(s =>
          `<button class="ej-pill ej-sug" data-texto="${esc(s)}">${esc(s)}</button>`).join('')}
            </div>` : ''}
        </div>`;
      document.getElementById('asistente-interpretacion-card').classList.add('hidden');
      document.getElementById('asistente-viz-bar').classList.add('hidden');
      document.getElementById('asistente-meta').textContent = '';
      return;
    }

    // Error de ejecución Firebird (NLP funcionó, SQL falló) — mostrar tarjeta con aviso
    if (!ok && data) {
      const dataConError = { ...data, error_ejecucion };
      state.asistente.ultimaInterpretacion = dataConError;
      state.asistente.resultado = dataConError;
      state.asistente.viz = data.viz || 'tabla';
      renderInterpretacionCard(dataConError); // incluirá el bullet de error de ejecución
      actualizarVizToggleAsistente(state.asistente.viz);
      document.getElementById('asistente-resultado-container').innerHTML =
        `<div class="ai-no-match">
          <div class="ai-no-match-icon">⚠️</div>
          <p class="ai-no-match-msg">Entendí la consulta, pero Firebird devolvió un error:</p>
          <pre class="ai-sql-error">${esc(error_ejecucion || '')}</pre>
          <p class="sug-hint">Revisa que las tablas del ejercicio existan en la base de datos.</p>
        </div>`;
      document.getElementById('asistente-interpretacion-card').classList.remove('hidden');
      document.getElementById('asistente-viz-bar').classList.add('hidden');
      document.getElementById('asistente-resultado-area').classList.remove('hidden');
      document.getElementById('asistente-meta').textContent = '';
      return;
    }

    state.asistente.ultimaInterpretacion = data;
    state.asistente.resultado = data;
    state.asistente.viz = data.viz || 'tabla';

    renderInterpretacionCard(data);
    actualizarVizToggleAsistente(state.asistente.viz);
    renderAsistenteResultado();
    mostrarSugerenciasRefinamiento(data.sugerencias_refinamiento);
    // Guardar contexto para el modal «Guardar como Widget»
    state.pendingWidgetSave = {
      sql: data.sql || null,
      sistema: data.sistema || null,
      columnas_resultado: data.columnas_resultado || [],
      params_sql: data.params || {},
      params_dinamicos: [],
      tipo_origen: 'asistente_ia',
      interpretacion_tipo: data.tipo || null,
      tipo_viz: data.viz || 'tabla'
    };

    document.getElementById('asistente-interpretacion-card').classList.remove('hidden');
    document.getElementById('asistente-viz-bar').classList.remove('hidden');
    document.getElementById('asistente-resultado-area').classList.remove('hidden');
    document.getElementById('asistente-ajuste-panel').classList.add('hidden');

    toast('✓ Análisis completado', 'ok');

  } catch (err) {
    toast(err.message || 'Error analizando la consulta', 'error');
  } finally {
    loading(btn, false);
  }
}

function renderInterpretacionCard(data) {
  const { interpretacion, confianza, error_ejecucion } = data;
  if (!interpretacion) return;

  // Barra de confianza
  const bar = document.getElementById('asistente-confianza-bar');
  const pct = Math.round(confianza || 0);
  const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
  bar.innerHTML = `<span class="ai-conf-label">Confianza ${pct}%</span>
    <span class="ai-conf-track">
      <span class="ai-conf-fill" style="width:${pct}%;background:${color}"></span>
    </span>`;

  // Decisiones / bullets
  const ul = document.getElementById('asistente-decisiones');
  const decisiones = interpretacion.decisiones || [];
  ul.innerHTML = decisiones.map(d => `<li class="ai-decision-item">${esc(d)}</li>`).join('');

  if (error_ejecucion) {
    ul.innerHTML += `<li class="ai-decision-item ai-decision-warn">⚠ Error al ejecutar: ${esc(error_ejecucion)}</li>`;
  }

  // Pre-poblar panel de ajuste
  renderAjusteControles(data.tipo, data.params);
}

function actualizarVizToggleAsistente(viz) {
  document.getElementById('asistente-viz-toggle').querySelectorAll('.viz-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.viz === viz);
  });
}

function renderAsistenteResultado() {
  const datos = state.asistente.resultado;
  if (!datos) return;

  const container = document.getElementById('asistente-resultado-container');
  destroyChart('asistente-chart');

  const filas = datos.filas || [];

  if (!filas.length) {
    container.innerHTML = '<p class="empty-msg">Sin resultados para los filtros seleccionados.</p>';
    document.getElementById('asistente-meta').textContent = '0 filas';
    return;
  }

  // Normalizar filas al formato datosWrap que espera renderizarEnContenedor
  const datosWrap = {
    datos: {
      filas: filas.map(fila => {
        const row = {};
        for (const [k, v] of Object.entries(fila)) {
          row[k] = { valor: v, valor_formateado: fmt(v) };
        }
        return row;
      })
    }
  };

  const titulo = datos.interpretacion?.entendido || '';
  renderizarEnContenedor(container, datosWrap, state.asistente.viz, titulo, 'asistente-chart');

  const meta = document.getElementById('asistente-meta');
  const totalMostradas = Math.min(filas.length, datos.total_filas || filas.length);
  meta.textContent = totalMostradas < (datos.total_filas || filas.length)
    ? `Mostrando ${totalMostradas} de ${datos.total_filas} filas`
    : `${filas.length} filas`;
}

function renderAjusteControles(tipo, params) {
  const cont = document.getElementById('asistente-ajuste-controles');
  if (!tipo || !params) { cont.innerHTML = ''; return; }

  const p = params;
  const controles = [];

  // Mes
  if (p.mes !== undefined) {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    controles.push(`
      <div class="studio-filtro-campo">
        <label>Mes</label>
        <select id="ajuste-mes">
          ${meses.map((m, i) => `<option value="${i + 1}" ${p.mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
      </div>`);
  }
  // Año/Ejercicio
  if (p.ejercicio !== undefined) {
    controles.push(`
      <div class="studio-filtro-campo">
        <label>Año (Ejercicio)</label>
        <input type="number" id="ajuste-ejercicio" value="${p.ejercicio}" min="2000" max="2099">
      </div>`);
  }
  // Nivel (solo plantillas COI)
  if (p.nivel !== undefined) {
    controles.push(`
      <div class="studio-filtro-campo">
        <label>Nivel de cuentas</label>
        <select id="ajuste-nivel">
          <option value="">Todos</option>
          ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${p.nivel == n ? 'selected' : ''}>Nivel ${n}</option>`).join('')}
        </select>
      </div>`);
  }
  // Tipo cuenta
  if (p.tipo_cuenta !== undefined) {
    const tipos = {
      '': 'Todos', 'I': 'Ingresos', 'E': 'Egresos', 'A': 'Activo',
      'P': 'Pasivo', 'C': 'Capital'
    };
    controles.push(`
      <div class="studio-filtro-campo">
        <label>Tipo de cuenta</label>
        <select id="ajuste-tipo-cuenta">
          ${Object.entries(tipos).map(([v, l]) =>
      `<option value="${v}" ${p.tipo_cuenta === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>`);
  }
  // Tipo póliza (solo para plantilla pólizas)
  if (tipo === 'coi_polizas_periodo') {
    const valTipo = p.tipo || 'todas';
    controles.push(`
      <div class="studio-filtro-campo">
        <label>Tipo de póliza</label>
        <select id="ajuste-tipo-poliza">
          <option value="todas" ${'todas' === valTipo ? 'selected' : ''}>Todas</option>
          <option value="I" ${'I' === valTipo ? 'selected' : ''}>Ingreso (I)</option>
          <option value="E" ${'E' === valTipo ? 'selected' : ''}>Egreso (E)</option>
          <option value="D" ${'D' === valTipo ? 'selected' : ''}>Diario (D)</option>
        </select>
      </div>`);
  }
  // Número de cuenta (auxiliar)
  if (p.cuenta !== undefined) {
    controles.push(`
      <div class="studio-filtro-campo">
        <label>Número de cuenta</label>
        <input type="text" id="ajuste-cuenta" value="${esc(p.cuenta || '')}" placeholder="Ej: 401">
      </div>`);
  }
  // Límite de filas
  controles.push(`
    <div class="studio-filtro-campo">
      <label>Máx. filas</label>
      <input type="number" id="ajuste-limite" value="${p.limite || 500}" min="10" max="5000" step="50">
    </div>`);

  cont.innerHTML = controles.join('') ||
    '<p class="empty-msg">No hay parámetros ajustables para este análisis.</p>';
}

async function aplicarAjusteAsistente() {
  const interp = state.asistente.ultimaInterpretacion;
  if (!interp) return;

  // Recoger valores del panel de ajuste
  const paramsAjustados = { ...interp.params };

  const mesEl = document.getElementById('ajuste-mes');
  if (mesEl) paramsAjustados.mes = Number(mesEl.value);
  const ejeEl = document.getElementById('ajuste-ejercicio');
  if (ejeEl) paramsAjustados.ejercicio = Number(ejeEl.value);
  const niveEl = document.getElementById('ajuste-nivel');
  if (niveEl) paramsAjustados.nivel = niveEl.value ? Number(niveEl.value) : undefined;
  const tcEl = document.getElementById('ajuste-tipo-cuenta');
  if (tcEl) paramsAjustados.tipo_cuenta = tcEl.value;
  const tpEl = document.getElementById('ajuste-tipo-poliza');
  if (tpEl) paramsAjustados.tipo = tpEl.value;
  const ctaEl = document.getElementById('ajuste-cuenta');
  if (ctaEl) paramsAjustados.cuenta = ctaEl.value;
  const limEl = document.getElementById('ajuste-limite');
  if (limEl) paramsAjustados.limite = Number(limEl.value);

  const btn = document.getElementById('btn-asistente-reaplicar');
  loading(btn, true, '⏳ Re-ejecutando...');

  try {
    const { ok, data, error } = await fetch(`${API}/widget-studio/interpretar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: document.getElementById('asistente-texto').value,
        params_override: paramsAjustados
      })
    }).then(r => r.json());

    if (!ok) { toast(error || 'Error al re-ejecutar', 'error'); return; }

    state.asistente.resultado = data;
    state.asistente.ultimaInterpretacion = data;
    renderInterpretacionCard(data);
    renderAsistenteResultado();
    mostrarSugerenciasRefinamiento(data.sugerencias_refinamiento);
    document.getElementById('asistente-ajuste-panel').classList.add('hidden');
    toast('✓ Re-ejecutado con ajustes', 'ok');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(btn, false);
  }
}

function mostrarSugerenciasRefinamiento(sugs) {
  const sec = document.getElementById('asistente-sugerencias-ref');
  const pills = document.getElementById('asistente-sug-pills');
  if (!sugs || !sugs.length) { sec.classList.add('hidden'); return; }
  pills.innerHTML = sugs.map(s =>
    `<button class="ej-pill ej-sug" data-texto="${esc(s)}">${esc(s)}</button>`
  ).join('');
  sec.classList.remove('hidden');
}

function exportarCSVAsistente() {
  const datos = state.asistente.resultado;
  if (!datos?.filas?.length) { toast('Sin datos para exportar', 'error'); return; }
  const filas = datos.filas;
  const cols = Object.keys(filas[0]);
  const csv = [cols.join(','),
  ...filas.map(f => cols.map(c => {
    const v = f[c] ?? '';
    return typeof v === 'string' && (v.includes(',') || v.includes('"'))
      ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(','))
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const interp = state.asistente.ultimaInterpretacion;
  a.download = `asistente_${interp?.tipo || 'resultado'}_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast('CSV descargado', 'ok');
}

function agregarWidgetAsistenteAlDashboard() {
  const datos = state.asistente.resultado;
  const interp = state.asistente.ultimaInterpretacion;
  if (!datos?.filas?.length) { toast('Ejecuta un análisis primero', 'error'); return; }

  const widgetId = `asistente_${Date.now()}`;
  const widget = {
    id: widgetId,
    metrica_id: `asistente_${interp?.tipo || 'custom'}`,
    nombre: interp?.interpretacion?.entendido || 'Análisis IA',
    sistema: interp?.sistema || 'COI',
    tipo_viz: state.asistente.viz,
    configuracion: {},
    params: {}
  };

  if (!state.dashboard) {
    state.dashboard = { widgets: [], objetivo: interp?.interpretacion?.entendido || 'Análisis IA' };
    state.vizTypes = {};
    state.resultados = {};
  }

  state.dashboard.widgets.push(widget);
  state.vizTypes[widgetId] = state.asistente.viz;
  state.resultados[widgetId] = {
    datos: {
      filas: datos.filas.map(fila => {
        const row = {};
        for (const [k, v] of Object.entries(fila)) row[k] = { valor: v, valor_formateado: fmt(v) };
        return row;
      })
    }
  };

  toast(`✓ "${widget.nombre}" agregado al dashboard`, 'ok');
  navegar('builder');
  mostrarFase('widgets');
  renderWidgetsSupgeridos(state.dashboard.widgets, state.dashboard.objetivo);
}

// ── ═══════════════ INIT ═══════════════ ──
// ── ═══════════════ MIS WIDGETS ═══════════════ ──

function abrirModalGuardar(config) {
  state.pendingWidgetSave = config;
  document.getElementById('mw-nombre').value = '';
  document.getElementById('mw-descripcion').value = '';
  document.getElementById('mw-color').value = config.color_primario || '#6366f1';

  // Viz toggle
  state._mwViz = config.tipo_viz || 'tabla';
  document.getElementById('mw-viz-toggle').querySelectorAll('.viz-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.viz === state._mwViz);
  });

  // Columnas
  const cols = config.columnas_resultado || [];
  const colsVisibles = config.columnas_visibles || cols;
  document.getElementById('mw-columnas').innerHTML = cols.map(c =>
    `<label class="col-check-item"><input type="checkbox" class="mw-col-check" value="${esc(c)}" ${colsVisibles.includes(c) ? 'checked' : ''}/> ${esc(c)}</label>`
  ).join('');
  document.getElementById('mw-columnas-field').classList.toggle('hidden', !cols.length);

  // Params dinámicos
  const params = config.params_dinamicos || [];
  const paramsField = document.getElementById('mw-params-field');
  if (params.length) {
    document.getElementById('mw-params-list').innerHTML = params.map(p =>
      `<span class="param-tag">:${esc(p)}</span>`
    ).join('');
    paramsField.classList.remove('hidden');
  } else {
    paramsField.classList.add('hidden');
  }

  document.getElementById('modal-guardar-widget').classList.remove('hidden');
  setTimeout(() => document.getElementById('mw-nombre').focus(), 50);
}

function cerrarModalGuardar() {
  document.getElementById('modal-guardar-widget').classList.add('hidden');
}

async function guardarWidgetDesdeModal() {
  const nombre = document.getElementById('mw-nombre').value.trim();
  if (!nombre) { toast('Escribe un nombre para el widget', 'error'); return; }

  const config = state.pendingWidgetSave || {};
  const columnas_visibles = [...document.querySelectorAll('.mw-col-check:checked')].map(el => el.value);

  const payload = {
    nombre,
    descripcion: document.getElementById('mw-descripcion').value.trim(),
    tipo_viz: state._mwViz || 'tabla',
    color_primario: document.getElementById('mw-color').value || '#6366f1',
    columnas_visibles,
    columnas_resultado: config.columnas_resultado || [],
    sql: config.sql || null,
    sistema: config.sistema || null,
    params_sql: config.params_sql || {},
    params_dinamicos: config.params_dinamicos || [],
    tipo_origen: config.tipo_origen || 'sql_libre',
    interpretacion_tipo: config.interpretacion_tipo || null
  };

  const btn = document.getElementById('mw-btn-guardar');
  loading(btn, true, 'Guardando...');
  try {
    const { ok, widget, error } = await api(`${API}/widget-studio/mis-widgets`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (!ok) throw new Error(error || 'Error guardando');
    cerrarModalGuardar();
    toast(`✓ Widget "${widget.nombre}" guardado`, 'ok');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    loading(btn, false);
  }
}

async function cargarMisWidgets() {
  const container = document.getElementById('mis-widgets-lista');
  const vacio = document.getElementById('mis-widgets-vacio');
  container.innerHTML = '<p class="loading-text">Cargando...</p>';
  try {
    const { ok, widgets } = await api(`${API}/widget-studio/mis-widgets`);
    if (!ok) throw new Error('Error cargando widgets');
    container.innerHTML = '';
    if (!widgets || !widgets.length) {
      vacio.classList.remove('hidden');
      return;
    }
    vacio.classList.add('hidden');
    container.innerHTML = widgets.map(w => renderMisWidgetCard(w)).join('');
  } catch (err) {
    container.innerHTML = `<p class="error-msg">⚠ ${esc(err.message)}</p>`;
  }
}

function renderMisWidgetCard(w) {
  const vizIcons = { tabla: '⊞', barra: '▊', linea: '╱', pastel: '◑', kpi: '◈' };
  const icono = vizIcons[w.tipo_viz] || '⊞';
  const sistemaColor = { COI: '#6366f1', SAE: '#22c55e', NOI: '#f59e0b', BANCO: '#3b82f6' }[w.sistema] || '#888';
  const fecha = w.actualizado_en
    ? new Date(w.actualizado_en).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
  const tieneDinamicos = w.params_dinamicos && w.params_dinamicos.length > 0;
  return `<div class="widget-card-guardado" data-id="${esc(w.id)}">
    <div class="wcg-header" style="border-left-color:${esc(w.color_primario || '#6366f1')}">
      <span class="wcg-viz">${icono}</span>
      <span class="wcg-name">${esc(w.nombre)}</span>
      <span class="wcg-sistema" style="background:${sistemaColor}22;color:${sistemaColor}">${esc(w.sistema || '?')}</span>
    </div>
    ${w.descripcion ? `<p class="wcg-desc">${esc(w.descripcion)}</p>` : ''}
    ${tieneDinamicos ? `<p class="wcg-params">⚙ Params: ${w.params_dinamicos.map(p => `<code>:${esc(p)}</code>`).join(', ')}</p>` : ''}
    <div class="wcg-footer">
      <span class="wcg-date">Act. ${fecha}</span>
      <div class="wcg-actions">
        <button class="btn btn-primary btn-xs wcg-btn-run" data-id="${esc(w.id)}">▶ Ejecutar</button>
        <button class="btn btn-ghost btn-xs wcg-btn-canvas"
          data-id="${esc(w.id)}"
          data-nombre="${esc(w.nombre)}"
          data-sistema="${esc(w.sistema || '')}"
          data-sql="${esc(w.sql || '')}"
          data-color="${esc(w.color_primario || '#6366f1')}"
          data-viz="${esc(w.tipo_viz || 'tabla')}"
          data-params='${JSON.stringify(w.params_dinamicos || [])}'
          title="Agregar al Canvas Editor">⊞ Canvas</button>
        <button class="btn btn-ghost btn-xs wcg-btn-delete" data-id="${esc(w.id)}" data-nombre="${esc(w.nombre)}">✕</button>
      </div>
    </div>
    <div class="wcg-resultado hidden" id="wcg-res-${esc(w.id)}"></div>
  </div>`;
}

async function ejecutarWidgetGuardado(id) {
  const container = document.getElementById(`wcg-res-${id}`);
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '<p class="loading-text">Ejecutando...</p>';
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

async function eliminarWidgetGuardado(id, nombre) {
  if (!confirm(`¿Eliminar el widget "${nombre}"?`)) return;
  try {
    await api(`${API}/widget-studio/mis-widgets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast(`Widget "${nombre}" eliminado`, 'ok');
    cargarMisWidgets();
  } catch (err) { toast(err.message, 'error'); }
}

// ─────────────────────────────────────────────────────────────────────────────

function init() {
  // Navegación sidebar
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

  // Botones guardar dashboard
  document.getElementById('btn-guardar-dashboard').addEventListener('click', abrirModalGuardar);
  document.getElementById('btn-guardar-dashboard-2').addEventListener('click', abrirModalGuardar);

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

  // Modal guardar
  document.getElementById('modal-guardar-confirm').addEventListener('click', confirmarGuardarDashboard);
  document.getElementById('modal-guardar-cancel').addEventListener('click', () => document.getElementById('modal-guardar').classList.add('hidden'));
  document.getElementById('modal-guardar-close').addEventListener('click', () => document.getElementById('modal-guardar').classList.add('hidden'));

  // Conexiones tabs
  document.querySelectorAll('.cx-tab').forEach(btn => {
    btn.addEventListener('click', () => renderConexionTab(btn.dataset.sistema));
  });
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
    document.getElementById('modal-viz-toggle').querySelectorAll('.viz-btn').forEach(b => b.classList.toggle('active', b.dataset.viz === state.modalViz));
  });

  // Widget Studio
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

  // Detectar :params en tiempo real al escribir en el área SQL
  document.getElementById('sql-libre-input').addEventListener('input', function () {
    renderParamsSQL(detectarParamsSQL(this.value));
  });

  // ── Asistente IA ──────────────────────────────────────────
  document.getElementById('btn-asistente-analizar').addEventListener('click', analizarConAsistente);

  // Ctrl+Enter en textarea ejecuta análisis
  document.getElementById('asistente-texto').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); analizarConAsistente(); }
  });

  // Pills de ejemplo: poner texto + ejecutar
  document.querySelector('#studio-tab-asistente').addEventListener('click', e => {
    const pill = e.target.closest('.ej-pill');
    if (!pill) return;
    const texto = pill.dataset.texto;
    if (texto) {
      document.getElementById('asistente-texto').value = texto;
      analizarConAsistente();
    }
  });

  // Botón ajustar → toggle panel
  document.getElementById('btn-asistente-editar').addEventListener('click', () => {
    const panel = document.getElementById('asistente-ajuste-panel');
    panel.classList.toggle('hidden');
  });

  // Cerrar panel ajuste
  document.getElementById('btn-asistente-cerrar-ajuste').addEventListener('click', () => {
    document.getElementById('asistente-ajuste-panel').classList.add('hidden');
  });

  // Re-ejecutar con ajustes
  document.getElementById('btn-asistente-reaplicar').addEventListener('click', aplicarAjusteAsistente);

  // Viz toggle del asistente
  document.getElementById('asistente-viz-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.viz-btn');
    if (!btn) return;
    state.asistente.viz = btn.dataset.viz;
    actualizarVizToggleAsistente(state.asistente.viz);
    if (state.asistente.resultado) renderAsistenteResultado();
  });

  // CSV + Add dashboard del asistente
  document.getElementById('btn-asistente-csv').addEventListener('click', exportarCSVAsistente);
  document.getElementById('btn-asistente-add').addEventListener('click', agregarWidgetAsistenteAlDashboard);
  document.getElementById('btn-asistente-guardar-widget').addEventListener('click', () => {
    if (state.pendingWidgetSave) abrirModalGuardar(state.pendingWidgetSave);
    else toast('Ejecuta primero una consulta', 'error');
  });
  // ─────────────────────────────────────────────────────────

  // ── Guardar en SQL Libre ──────────────────────────────────
  document.getElementById('btn-sql-guardar-widget').addEventListener('click', () => {
    if (state.pendingWidgetSave) abrirModalGuardar(state.pendingWidgetSave);
    else toast('Ejecuta primero una consulta', 'error');
  });

  // ── Modal Guardar Widget ──────────────────────────────────
  document.getElementById('mw-btn-cerrar').addEventListener('click', cerrarModalGuardar);
  document.getElementById('mw-btn-cancelar').addEventListener('click', cerrarModalGuardar);
  document.getElementById('mw-btn-guardar').addEventListener('click', guardarWidgetDesdeModal);
  document.getElementById('modal-guardar-widget').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModalGuardar();
  });
  document.getElementById('mw-viz-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.viz-btn');
    if (!btn) return;
    state._mwViz = btn.dataset.viz;
    document.getElementById('mw-viz-toggle').querySelectorAll('.viz-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.viz === state._mwViz)
    );
  });
  document.getElementById('modal-guardar-widget').addEventListener('click', e => {
    const dot = e.target.closest('.color-dot');
    if (dot) document.getElementById('mw-color').value = dot.dataset.color;
  });

  // ── Mis Widgets: ejecutar / eliminar (delegación) ─────────
  document.getElementById('mis-widgets-lista').addEventListener('click', e => {
    const btnRun    = e.target.closest('.wcg-btn-run');
    const btnDel    = e.target.closest('.wcg-btn-delete');
    const btnCanvas = e.target.closest('.wcg-btn-canvas');
    if (btnRun) ejecutarWidgetGuardado(btnRun.dataset.id);
    if (btnDel) eliminarWidgetGuardado(btnDel.dataset.id, btnDel.dataset.nombre);
    if (btnCanvas) {
      const d = btnCanvas.dataset;
      let params = [];
      try { params = JSON.parse(d.params || '[]'); } catch(_) {}
      if (typeof window.addTileToCanvas === 'function') {
        window.addTileToCanvas({
          id: d.id, nombre: d.nombre, sistema: d.sistema,
          sql: d.sql, color_primario: d.color, tipo_viz: d.viz,
          params_dinamicos: params
        });
        window.navegar('canvas');
        toast('Widget agregado al Canvas ⊞', 'ok');
      } else {
        toast('Navega al Canvas Editor primero', 'info');
      }
    }
  });
  // ─────────────────────────────────────────────────────────

  document.getElementById('btn-copiar-sql').addEventListener('click', () => {
    const sql = document.getElementById('studio-sql-display').textContent;
    navigator.clipboard.writeText(sql).then(() => toast('SQL copiado', 'ok')).catch(() => toast('No se pudo copiar', 'error'));
  });

  document.getElementById('btn-cols-all').addEventListener('click', () => {
    document.querySelectorAll('.studio-col-check').forEach(ch => { ch.checked = true; });
  });
  document.getElementById('btn-cols-none').addEventListener('click', () => {
    document.querySelectorAll('.studio-col-check').forEach(ch => { ch.checked = false; });
  });
  document.getElementById('btn-cols-default').addEventListener('click', () => {
    document.querySelectorAll('.studio-col-check').forEach(ch => {
      ch.checked = ch.dataset.defecto === '1';
    });
  });

  document.getElementById('studio-viz-toggle').addEventListener('click', e => {
    const btn = e.target.closest('.viz-btn');
    if (!btn) return;
    state.studio.viz = btn.dataset.viz;
    document.getElementById('studio-viz-toggle').querySelectorAll('.viz-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.viz === state.studio.viz);
    });
    if (state.studio.resultado) renderStudioChart();
  });

  // Inicio
  navegar('inicio');
}

document.addEventListener('DOMContentLoaded', init);

