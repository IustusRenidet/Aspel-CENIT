'use strict';
/* ============================================================
   CENIT IA — canvas.js
   Dashboard Canvas: drag+drop, resize, params, personalización
   ============================================================ */

// ── Extensión del estado global ────────────────────────────
window.canvasState = {
  tiles: {},     // tileId → { id, nombre, sistema, sql, params_dinamicos, params_values, viz, color, labelCol, valueCols, ... }
  gs: null,      // instancia GridStack
  nombre: 'Mi Canvas',
  dirty: false
};

// ── Inicializar GridStack ───────────────────────────────────
function initCanvas() {
  if (window.canvasState.gs) return;
  const el = document.getElementById('canvas-grid');
  if (!el) return;

  const gs = GridStack.init({
    el,
    cellHeight: 80,
    column: 12,
    animate: true,
    margin: 6,
    handle: '.tile-drag',
    resizable: { handles: 'se,s,e' }
  });

  gs.on('change', () => {
    gs.engine.nodes.forEach(node => {
      const id = node.id;
      if (id && canvasState.tiles[id]) {
        canvasState.tiles[id].x = node.x;
        canvasState.tiles[id].y = node.y;
        canvasState.tiles[id].w = node.w;
        canvasState.tiles[id].h = node.h;
      }
    });
    canvasState.dirty = true;
    actualizarEmptyState();
  });

  window.canvasState.gs = gs;
  actualizarEmptyState();
}

function actualizarEmptyState() {
  const vacio = document.getElementById('canvas-empty');
  if (!vacio) return;
  const tileCount = Object.keys(canvasState.tiles).length;
  vacio.classList.toggle('hidden', tileCount > 0);
}

// ── Generar ID único ────────────────────────────────────────
function genTileId() {
  return `tile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ── Parámetros por defecto según nombre ─────────────────────
function buildDefaultParams(paramNames) {
  if (!paramNames || !paramNames.length) return {};
  const now = new Date();
  const defaults = {};
  for (const p of paramNames) {
    const ln = p.toLowerCase();
    if (['mes', 'month', 'periodo'].includes(ln)) defaults[p] = now.getMonth() + 1;
    else if (['ejercicio', 'ano', 'anio', 'year'].includes(ln)) defaults[p] = now.getFullYear();
    else if (['nivel', 'nivel_max'].includes(ln)) defaults[p] = 1;
    else if (['tipo', 'tipo_pol', 'tipo_poliza'].includes(ln)) defaults[p] = 'todas';
    else defaults[p] = '';
  }
  return defaults;
}

// ── Construir HTML de tile ──────────────────────────────────
function buildTileHTML(tile) {
  const color = tile.color || '#6366f1';
  const hasParams = tile.params_dinamicos && tile.params_dinamicos.length > 0;
  return `
    <div class="canvas-tile" data-tile-id="${esc(tile.id)}" style="--tile-color:${color}">
      <div class="tile-header">
        <span class="tile-drag" title="Arrastrar">⠿</span>
        <div class="tile-meta-info">
          <span class="tile-name" title="${esc(tile.nombre)}">${esc(tile.nombre)}</span>
          <span class="badge badge-${(tile.sistema || '').toLowerCase()}">${esc(tile.sistema || '')}</span>
        </div>
        <div class="tile-controls">
          <button class="tile-btn tile-run" data-tile-id="${esc(tile.id)}" title="Ejecutar">▶</button>
          ${hasParams ? `<button class="tile-btn tile-params" data-tile-id="${esc(tile.id)}" title="Cambiar parámetros">≡</button>` : ''}
          <button class="tile-btn tile-customize" data-tile-id="${esc(tile.id)}" title="Personalizar">⚙</button>
          <button class="tile-btn tile-remove" data-tile-id="${esc(tile.id)}" title="Quitar">✕</button>
        </div>
      </div>
      <div class="tile-body" id="tile-body-${esc(tile.id)}">
        <div class="tile-placeholder">Haz clic en ▶ para cargar datos</div>
      </div>
      <div class="tile-footer-meta" id="tile-meta-${esc(tile.id)}"></div>
    </div>`;
}

// ── Agregar widget al canvas ────────────────────────────────
function addTileToCanvas(widget) {
  if (!canvasState.gs) initCanvas();

  const id = genTileId();
  const tile = {
    id,
    nombre: widget.nombre || widget.name || 'Widget',
    sistema: widget.sistema || 'COI',
    sql: widget.sql || null,
    params_dinamicos: widget.params_dinamicos || [],
    params_values: widget.params_values || buildDefaultParams(widget.params_dinamicos || []),
    viz: widget.tipo_viz || 'tabla',
    color: widget.color_primario || '#6366f1',
    labelCol: null,
    valueCols: [],
    _allCols: [],
    _lastData: null,
    _widget_id: widget.id,
    w: 6, h: 4, x: 0, y: 0
  };

  canvasState.tiles[id] = tile;

  // Añadir widget al grid
  const el = canvasState.gs.addWidget({
    w: tile.w, h: tile.h,
    id,
    content: buildTileHTML(tile)
  });
  if (el) el.dataset.tileId = id;

  actualizarEmptyState();
  canvasState.dirty = true;

  // Si tiene parámetros, abre modal primero; si no, ejecutar directo
  if (tile.params_dinamicos.length > 0) {
    abrirParamsModal(id);
  } else {
    ejecutarTile(id);
  }
}

// ── Ejecutar tile ───────────────────────────────────────────
async function ejecutarTile(tileId) {
  const tile = canvasState.tiles[tileId];
  if (!tile || !tile.sql) {
    const body = document.getElementById(`tile-body-${tileId}`);
    if (body) body.innerHTML = '<div class="tile-error">Este widget no tiene SQL configurado.</div>';
    return;
  }

  const body = document.getElementById(`tile-body-${tileId}`);
  if (!body) return;

  body.innerHTML = `<div class="tile-loading"><span class="spinner-sm"></span> Cargando…</div>`;
  destroyChart(`tile-chart-${tileId}`);

  try {
    const { data } = await api(`${API}/widget-studio/sql-libre`, {
      method: 'POST',
      body: JSON.stringify({
        sql: tile.sql,
        sistema: tile.sistema,
        params_sql: tile.params_values || {}
      })
    });

    const filas = data.filas || [];

    // Cache de columnas para personalización
    if (filas.length) {
      const cols = Object.keys(filas[0]);
      tile._allCols = cols;
      if (!tile.labelCol) tile.labelCol = cols[0];
      if (!tile.valueCols.length) {
        tile.valueCols = cols.filter((c, i) => {
          if (i === 0) return false;
          const vals = filas.slice(0, 10).map(r => Number(r[c]));
          return vals.some(n => isFinite(n) && n !== 0);
        });
      }
    }

    tile._lastData = filas;

    // Meta count
    const metaEl = document.getElementById(`tile-meta-${tileId}`);
    if (metaEl) metaEl.textContent = `${data.total_filas} registros`;

    renderTileContent(tileId, filas);

  } catch (err) {
    body.innerHTML = `<div class="tile-error">⚠ ${esc(err.message)}</div>`;
  }
}

// ── Renderizar contenido del tile ────────────────────────────
function renderTileContent(tileId, filas) {
  const tile = canvasState.tiles[tileId];
  if (!tile) return;
  const body = document.getElementById(`tile-body-${tileId}`);
  if (!body) return;

  destroyChart(`tile-chart-${tileId}`);
  body.innerHTML = '';
  body.style.setProperty('--tile-accent', tile.color || '#6366f1');

  // Para gráficas, filtrar las columnas configuradas
  let displayFilas = filas;
  if (['barra', 'linea', 'area', 'pastel'].includes(tile.viz) && tile.labelCol && tile.valueCols.length) {
    const keyCols = [tile.labelCol, ...tile.valueCols];
    displayFilas = filas.map(r => {
      const row = {};
      keyCols.forEach(c => { if (c in r) row[c] = r[c]; });
      return row;
    });
  }

  const datosWrap = {
    datos: {
      filas: displayFilas.map(fila => {
        const row = {};
        for (const [k, v] of Object.entries(fila)) {
          row[k] = { valor: v, valor_formateado: fmt(v) };
        }
        return row;
      })
    }
  };

  renderizarEnContenedor(body, datosWrap, tile.viz, tile.nombre, `tile-chart-${tileId}`);
}

// ── Modal de parámetros ─────────────────────────────────────
function abrirParamsModal(tileId) {
  const tile = canvasState.tiles[tileId];
  if (!tile) return;

  const modal = document.getElementById('modal-canvas-params');
  document.getElementById('mcp-titulo').textContent = tile.nombre;
  modal.dataset.tileId = tileId;

  const form = document.getElementById('mcp-form');
  form.innerHTML = tile.params_dinamicos.map(p =>
    buildParamField(p, tile.params_values?.[p] ?? '')
  ).join('');

  modal.classList.remove('hidden');
  form.querySelector('input, select')?.focus();
}

function buildParamField(name, currentVal) {
  const ln = name.toLowerCase();
  const MESES = [
    ['1', 'Enero'], ['2', 'Febrero'], ['3', 'Marzo'], ['4', 'Abril'],
    ['5', 'Mayo'], ['6', 'Junio'], ['7', 'Julio'], ['8', 'Agosto'],
    ['9', 'Septiembre'], ['10', 'Octubre'], ['11', 'Noviembre'], ['12', 'Diciembre']
  ];
  const curStr = String(currentVal ?? '');

  // Mes
  if (['mes', 'month', 'periodo'].includes(ln)) {
    return `<div class="mcp-field">
      <label class="form-label">Mes <code>:${esc(name)}</code></label>
      <select class="form-select mcp-input" data-param="${esc(name)}">
        ${MESES.map(([v, l]) => `<option value="${v}" ${curStr === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>`;
  }

  // Año
  if (['ejercicio', 'ano', 'anio', 'year'].includes(ln)) {
    const now = new Date().getFullYear();
    const years = Array.from({ length: now - 2014 }, (_, i) => now + 1 - i);
    return `<div class="mcp-field">
      <label class="form-label">Año <code>:${esc(name)}</code></label>
      <select class="form-select mcp-input" data-param="${esc(name)}">
        ${years.map(y => `<option value="${y}" ${curStr === String(y) ? 'selected' : ''}>${y}</option>`).join('')}
      </select></div>`;
  }

  // Tipo póliza
  if (['tipo', 'tipo_pol', 'tipo_poliza'].includes(ln)) {
    const opts = [['todas', 'Todas'], ['I', 'Ingreso (I)'], ['E', 'Egreso (E)'], ['D', 'Diario (D)']];
    return `<div class="mcp-field">
      <label class="form-label">Tipo de póliza <code>:${esc(name)}</code></label>
      <select class="form-select mcp-input" data-param="${esc(name)}">
        ${opts.map(([v, l]) => `<option value="${v}" ${curStr === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>`;
  }

  // Nivel
  if (['nivel', 'nivel_max'].includes(ln)) {
    return `<div class="mcp-field">
      <label class="form-label">Nivel de cuenta <code>:${esc(name)}</code></label>
      <select class="form-select mcp-input" data-param="${esc(name)}">
        <option value="">Todos</option>
        ${[1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${curStr === String(n) ? 'selected' : ''}>${n}</option>`).join('')}
      </select></div>`;
  }

  // Status SAE
  if (['status', 'estatus'].includes(ln)) {
    return `<div class="mcp-field">
      <label class="form-label">Estatus <code>:${esc(name)}</code></label>
      <select class="form-select mcp-input" data-param="${esc(name)}">
        <option value="">Todos</option>
        <option value="A" ${curStr === 'A' ? 'selected' : ''}>Activo (A)</option>
        <option value="C" ${curStr === 'C' ? 'selected' : ''}>Cancelado (C)</option>
        <option value="S" ${curStr === 'S' ? 'selected' : ''}>Suspendido (S)</option>
      </select></div>`;
  }

  // Naturaleza
  if (['naturaleza'].includes(ln)) {
    return `<div class="mcp-field">
      <label class="form-label">Naturaleza <code>:${esc(name)}</code></label>
      <select class="form-select mcp-input" data-param="${esc(name)}">
        <option value="">Todas</option>
        <option value="D" ${curStr === 'D' ? 'selected' : ''}>Deudora (D)</option>
        <option value="A" ${curStr === 'A' ? 'selected' : ''}>Acreedora (A)</option>
      </select></div>`;
  }

  // Fechas
  if (/fecha/.test(ln)) {
    return `<div class="mcp-field">
      <label class="form-label">${ln.includes('ini') || ln.includes('desde') ? 'Fecha inicial' : 'Fecha final'} <code>:${esc(name)}</code></label>
      <input type="date" class="form-input mcp-input" data-param="${esc(name)}" value="${esc(curStr)}"/>
    </div>`;
  }

  // Numérico
  const isNum = ['limite', 'num_poliz', 'num_cta', 'ejercicio', 'mes'].includes(ln);
  return `<div class="mcp-field">
    <label class="form-label"><code>:${esc(name)}</code></label>
    <input type="${isNum ? 'number' : 'text'}" class="form-input mcp-input"
      data-param="${esc(name)}" value="${esc(curStr)}" placeholder="${esc(name)}"/>
  </div>`;
}

function confirmarParamsModal() {
  const modal = document.getElementById('modal-canvas-params');
  const tileId = modal.dataset.tileId;
  const tile = canvasState.tiles[tileId];
  if (!tile) return;

  const newParams = {};
  modal.querySelectorAll('.mcp-input').forEach(el => {
    const param = el.dataset.param;
    const val = el.value.trim();
    newParams[param] = val === '' ? null : (isNaN(val) || val === '' ? val : Number(val));
  });

  tile.params_values = newParams;
  modal.classList.add('hidden');
  ejecutarTile(tileId);
}

// ── Modal de personalización ────────────────────────────────
function abrirCustomizarTile(tileId) {
  const tile = canvasState.tiles[tileId];
  if (!tile) return;

  const modal = document.getElementById('modal-canvas-customize');
  modal.dataset.tileId = tileId;

  document.getElementById('mcc-titulo').value = tile.nombre;
  document.getElementById('mcc-color').value = tile.color || '#6366f1';

  // Viz
  modal.querySelectorAll('.viz-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.viz === tile.viz);
  });

  // Color dots
  modal.querySelectorAll('.color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === (tile.color || '#6366f1'));
  });

  // Columnas (solo si hay datos cargados)
  const allCols = tile._allCols || [];
  const colsSection = document.getElementById('mcc-cols-section');
  if (allCols.length > 0) {
    const labelSel = document.getElementById('mcc-label-col');
    labelSel.innerHTML = allCols.map(c =>
      `<option value="${esc(c)}" ${c === tile.labelCol ? 'selected' : ''}>${esc(c)}</option>`
    ).join('');

    document.getElementById('mcc-value-cols').innerHTML = allCols.slice(1).map(c =>
      `<label class="col-check-item">
        <input type="checkbox" class="mcc-val-col" value="${esc(c)}" ${tile.valueCols.includes(c) ? 'checked' : ''}/>
        ${esc(c)}
      </label>`
    ).join('');

    colsSection.classList.remove('hidden');
  } else {
    colsSection.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function aplicarCustomizacion() {
  const modal = document.getElementById('modal-canvas-customize');
  const tileId = modal.dataset.tileId;
  const tile = canvasState.tiles[tileId];
  if (!tile) return;

  tile.nombre = document.getElementById('mcc-titulo').value.trim() || tile.nombre;
  tile.color = document.getElementById('mcc-color').value;
  tile.viz = modal.querySelector('#mcc-viz-toggle .viz-btn.active')?.dataset.viz || tile.viz;

  const labelSel = document.getElementById('mcc-label-col');
  if (labelSel) tile.labelCol = labelSel.value;
  tile.valueCols = [...modal.querySelectorAll('.mcc-val-col:checked')].map(el => el.value);

  // Actualizar apariencia del tile
  const tileEl = document.querySelector(`.canvas-tile[data-tile-id="${tileId}"]`);
  if (tileEl) {
    tileEl.style.setProperty('--tile-color', tile.color);
    const nameEl = tileEl.querySelector('.tile-name');
    if (nameEl) nameEl.textContent = tile.nombre;
  }

  modal.classList.add('hidden');
  canvasState.dirty = true;

  // Re-renderizar si hay datos
  if (tile._lastData) renderTileContent(tileId, tile._lastData);
  toast('Widget personalizado ✓', 'ok');
}

// ── Quitar tile ─────────────────────────────────────────────
function removeTile(tileId) {
  const gs = canvasState.gs;
  if (!gs) return;

  // Buscar por gs-id attribute
  const gsItem = document.querySelector(`.grid-stack-item[gs-id="${tileId}"]`);
  if (gsItem) gs.removeWidget(gsItem);

  destroyChart(`tile-chart-${tileId}`);
  delete canvasState.tiles[tileId];
  canvasState.dirty = true;
  actualizarEmptyState();
}

// ── Ejecutar todos los tiles ────────────────────────────────
function ejecutarTodosLosTiles() {
  Object.keys(canvasState.tiles).forEach(id => ejecutarTile(id));
}

// ── Limpiar canvas ──────────────────────────────────────────
function limpiarCanvas() {
  if (!confirm('¿Limpiar el canvas? Se perderán los widgets actuales.')) return;
  const gs = canvasState.gs;
  if (gs) gs.removeAll();
  // Destruir charts
  Object.keys(canvasState.tiles).forEach(id => destroyChart(`tile-chart-${id}`));
  canvasState.tiles = {};
  canvasState.dirty = false;
  actualizarEmptyState();
}

// ── Guardar canvas ──────────────────────────────────────────
async function guardarCanvas() {
  const nombre = document.getElementById('canvas-nombre')?.value?.trim();
  if (!nombre) { toast('Escribe un nombre para el dashboard', 'error'); return; }

  const gs = canvasState.gs;
  const layout = gs ? gs.save(false) : [];

  const tilesArr = Object.values(canvasState.tiles).map(t => ({
    id: t.id,
    nombre: t.nombre,
    sistema: t.sistema,
    sql: t.sql,
    params_dinamicos: t.params_dinamicos,
    params_values: t.params_values,
    viz: t.viz,
    color: t.color,
    labelCol: t.labelCol,
    valueCols: t.valueCols,
    _widget_id: t._widget_id
  }));

  const payload = {
    nombre,
    objetivo: nombre,
    widgets: [],
    vizTypes: {},
    _canvas_data: { nombre, tiles: tilesArr, layout }
  };

  const btn = document.getElementById('btn-canvas-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  try {
    await api(`${API}/paneles`, { method: 'POST', body: JSON.stringify(payload) });
    canvasState.nombre = nombre;
    canvasState.dirty = false;
    toast(`Canvas "${nombre}" guardado ✓`, 'ok');
  } catch (err) {
    toast(`Error guardando: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar'; }
  }
}

// ── Cargar librería de widgets ──────────────────────────────
async function cargarLibreria() {
  const lib = document.getElementById('canvas-library');
  if (!lib) return;
  lib.innerHTML = '<div class="lib-loading"><span class="spinner-sm"></span> Cargando…</div>';

  try {
    const { ok, widgets } = await api(`${API}/widget-studio/mis-widgets`);
    if (!ok || !widgets?.length) {
      lib.innerHTML = `<div class="lib-empty">
        <p>No tienes widgets guardados.</p>
        <small>Ve a Widget Studio → guarda una consulta con ★</small>
      </div>`;
      return;
    }

    lib.innerHTML = widgets.map(w => {
      const hasParams = w.params_dinamicos?.length > 0;
      const vizIcons = { tabla: '⊞', barra: '▊', linea: '╱', pastel: '◑', kpi: '◈', area: '▲' };
      return `<div class="lib-item">
        <div class="lib-item-top">
          <span class="lib-viz-icon">${vizIcons[w.tipo_viz] || '⊞'}</span>
          <span class="lib-item-name" title="${esc(w.nombre)}">${esc(w.nombre)}</span>
          <span class="badge badge-${(w.sistema || '').toLowerCase()}">${esc(w.sistema || '?')}</span>
        </div>
        ${w.descripcion ? `<p class="lib-item-desc">${esc(w.descripcion.slice(0, 50))}${w.descripcion.length > 50 ? '…' : ''}</p>` : ''}
        ${hasParams ? `<div class="lib-params">${w.params_dinamicos.map(p => `<code>:${esc(p)}</code>`).join(' ')}</div>` : ''}
        <button class="btn btn-sm btn-primary lib-add-btn"
          data-wid="${esc(w.id)}"
          data-nombre="${esc(w.nombre)}"
          data-sistema="${esc(w.sistema || '')}"
          data-sql="${esc(w.sql || '')}"
          data-color="${esc(w.color_primario || '#6366f1')}"
          data-viz="${esc(w.tipo_viz || 'tabla')}"
          data-params='${JSON.stringify(w.params_dinamicos || [])}'
          title="Agregar al canvas">+ Agregar</button>
      </div>`;
    }).join('');

    lib.querySelectorAll('.lib-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        let params_din = [];
        try { params_din = JSON.parse(btn.dataset.params || '[]'); } catch (_) { }
        addTileToCanvas({
          id: btn.dataset.wid,
          nombre: btn.dataset.nombre,
          sistema: btn.dataset.sistema,
          sql: btn.dataset.sql,
          tipo_viz: btn.dataset.viz,
          color_primario: btn.dataset.color,
          params_dinamicos: params_din
        });
      });
    });

  } catch (err) {
    lib.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
  }
}

// ── Hook en navegar ─────────────────────────────────────────
// Intercepta la función navegar de app.js para inicializar el canvas
document.addEventListener('DOMContentLoaded', () => {
  const originalNavegar = window.navegar;
  window.navegar = function (vista) {
    originalNavegar(vista);
    if (vista === 'canvas') {
      setTimeout(() => {
        initCanvas();
        cargarLibreria();
      }, 30);
    }
  };

  // ── Eventos canvas ─────────────────────────────────────
  const canvasView = document.getElementById('view-canvas');
  if (!canvasView) return;

  // Delegación: botones dentro de tiles
  canvasView.addEventListener('click', e => {
    const runBtn = e.target.closest('.tile-run');
    if (runBtn) { ejecutarTile(runBtn.dataset.tileId); return; }

    const paramsBtn = e.target.closest('.tile-params');
    if (paramsBtn) { abrirParamsModal(paramsBtn.dataset.tileId); return; }

    const customBtn = e.target.closest('.tile-customize');
    if (customBtn) { abrirCustomizarTile(customBtn.dataset.tileId); return; }

    const removeBtn = e.target.closest('.tile-remove');
    if (removeBtn) { removeTile(removeBtn.dataset.tileId); return; }
  });

  // Topbar buttons
  document.getElementById('btn-canvas-save')?.addEventListener('click', guardarCanvas);
  document.getElementById('btn-canvas-run-all')?.addEventListener('click', ejecutarTodosLosTiles);
  document.getElementById('btn-canvas-clear')?.addEventListener('click', limpiarCanvas);
  document.getElementById('btn-lib-refresh')?.addEventListener('click', cargarLibreria);

  // Sidebar toggle
  document.getElementById('btn-canvas-library')?.addEventListener('click', () => {
    document.getElementById('canvas-sidebar')?.classList.toggle('collapsed');
  });

  // Nombre del canvas
  document.getElementById('canvas-nombre')?.addEventListener('change', e => {
    canvasState.nombre = e.target.value;
  });

  // ── Modal params ───────────────────────────────────────
  document.getElementById('mcp-btn-confirmar')?.addEventListener('click', confirmarParamsModal);
  document.getElementById('mcp-btn-cancelar')?.addEventListener('click', () =>
    document.getElementById('modal-canvas-params').classList.add('hidden'));
  document.getElementById('mcp-btn-cerrar')?.addEventListener('click', () =>
    document.getElementById('modal-canvas-params').classList.add('hidden'));
  document.getElementById('modal-canvas-params')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // ── Modal customize ────────────────────────────────────
  document.getElementById('mcc-btn-aplicar')?.addEventListener('click', aplicarCustomizacion);
  document.getElementById('mcc-btn-cancelar')?.addEventListener('click', () =>
    document.getElementById('modal-canvas-customize').classList.add('hidden'));
  document.getElementById('mcc-btn-cerrar')?.addEventListener('click', () =>
    document.getElementById('modal-canvas-customize').classList.add('hidden'));
  document.getElementById('modal-canvas-customize')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // Viz toggle en modal customize
  document.getElementById('mcc-viz-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.viz-btn');
    if (!btn) return;
    document.getElementById('mcc-viz-toggle').querySelectorAll('.viz-btn')
      .forEach(b => b.classList.toggle('active', b === btn));
  });

  // Color dots en modal customize
  document.getElementById('modal-canvas-customize')?.addEventListener('click', e => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    const color = dot.dataset.color;
    document.getElementById('mcc-color').value = color;
    document.getElementById('modal-canvas-customize').querySelectorAll('.color-dot')
      .forEach(d => d.classList.toggle('active', d === dot));
  });

  // Actualizar dots al cambiar color con picker
  document.getElementById('mcc-color')?.addEventListener('input', e => {
    document.getElementById('modal-canvas-customize').querySelectorAll('.color-dot')
      .forEach(d => d.classList.toggle('active', d.dataset.color === e.target.value));
  });
});
