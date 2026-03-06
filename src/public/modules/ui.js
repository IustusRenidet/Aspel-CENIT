/* ==============================================================
   CENIT IA — modules/ui.js
   Utilidades de interfaz: escape, formato, toast, skeleton,
   normalización y renderización de visualizaciones.
   ============================================================== */

import { state } from './state.js';

// ── Escape HTML ───────────────────────────────────────────────
export function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Formateo de valores ───────────────────────────────────────
export function fmt(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toLocaleString('es-MX', { maximumFractionDigits: 2 });
    return String(v);
}

export function fmtMoneda(v) {
    const n = Number(v);
    if (!isFinite(n)) return '—';
    return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export function fmtCompacto(n) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(2) + ' B';
    if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(2) + ' M';
    if (abs >= 1_000) return sign + (abs / 1_000).toFixed(1) + ' K';
    return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

// ── Notificaciones Toast ──────────────────────────────────────
export function toast(msg, tipo = 'info') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${tipo}`;
    t.textContent = msg;
    t.setAttribute('role', 'alert');
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// ── Botón con estado de carga ─────────────────────────────────
export function loading(el, on, texto = 'Procesando...') {
    if (on) {
        el.disabled = true;
        el.dataset.orig = el.textContent;
        el.textContent = texto;
    } else {
        el.disabled = false;
        el.textContent = el.dataset.orig || el.textContent;
    }
}

// ── Helpers DOM ───────────────────────────────────────────────
export function getSistemas() {
    return [...document.querySelectorAll('[name="sistemas"]:checked')].map(c => c.value);
}

export function actualizarStatusGlobal(ok) {
    const dot = document.getElementById('dot-global');
    const txt = document.getElementById('status-global-text');
    dot.className = `dot ${ok ? 'ok' : 'error'}`;
    txt.textContent = ok ? 'Sistema operativo' : 'Sin conexión';
}

// ── Gestión de instancias Chart.js ────────────────────────────
export function destroyChart(id) {
    if (state.charts[id]) {
        try { state.charts[id].destroy(); } catch (_) { /* noop */ }
        delete state.charts[id];
    }
}

// ── Normalización de datos de API ─────────────────────────────

/**
 * Convierte la respuesta del ejecutor en un array plano de {col: valor}.
 */
export function normalizarFilas(datos) {
    if (!datos) return [];

    const d = datos.datos ?? datos.data ?? datos.resultado ?? datos.rows;

    // 1. Ya es array plano
    if (Array.isArray(d)) return d;

    // 2. formatearTabla → { filas: [{col: {valor, valor_formateado}}, …] }
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

    // 3. formatearSerie → { serie: [{fecha, valor, …}, …] }
    if (d && Array.isArray(d.serie)) {
        return d.serie.map(s => ({ periodo: s.fecha ?? s.periodo, valor: s.valor }));
    }

    // 4. Fallback
    if (Array.isArray(datos)) return datos;
    return [];
}

/**
 * Extrae el valor escalar de la respuesta del ejecutor.
 */
export function normalizarValor(datos) {
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

// ── Renderización principal ───────────────────────────────────

/**
 * Renderiza cualquier tipo de visualización dentro de un contenedor DOM.
 */
export function renderizarEnContenedor(container, datos, viz, titulo, chartId) {
    if (!datos) { container.innerHTML = '<p class="sin-datos">Sin datos</p>'; return; }

    const filas = normalizarFilas(datos);
    const valor = normalizarValor(datos);

    if (viz === 'kpi') {
        renderKPI(container, valor ?? (filas[0] ? Object.values(filas[0])[0] : null), titulo, datos.unidad, datos.variacion);
        return;
    }
    if (viz === 'tabla') { renderTabla(container, filas); return; }
    if (viz === 'reporte') { renderReporte(container, filas, titulo); return; }

    if (!filas || filas.length === 0) {
        if (valor !== undefined) { renderKPI(container, valor, titulo, datos.unidad); return; }
        container.innerHTML = '<p class="sin-datos">Sin registros para graficar</p>';
        return;
    }

    renderChart(container, chartId, filas, viz, titulo);
}

// ── KPI ───────────────────────────────────────────────────────
export function renderKPI(container, valor, titulo, unidad = '', variacion = null) {
    const n = Number(valor);
    const display = isFinite(n) ? fmtCompacto(n) : fmt(valor);
    const colorClass = isFinite(n) ? (n < 0 ? 'kpi-neg' : n > 0 ? 'kpi-pos' : 'kpi-zero') : '';

    let varHtml = '';
    if (variacion !== null) {
        const vn = Number(variacion);
        const cls = vn >= 0 ? 'kpi-up' : 'kpi-down';
        varHtml = `<div class="kpi-var ${cls}">${vn >= 0 ? '▲' : '▼'} ${Math.abs(vn).toFixed(1)}%</div>`;
    }

    const icon = isFinite(n) ? (n < 0 ? '📉' : n > 0 ? '📈' : '—') : '📊';

    container.innerHTML = `
    <div class="kpi-card ${colorClass}" role="img" aria-label="${esc(titulo)}: ${esc(display)}${unidad ? ' ' + esc(unidad) : ''}">
      <div class="kpi-icon" aria-hidden="true">${icon}</div>
      <div class="kpi-body">
        <div class="kpi-titulo">${esc(titulo)}</div>
        <div class="kpi-valor">${esc(display)}${unidad ? `<span class="kpi-unidad"> ${esc(unidad)}</span>` : ''}</div>
        ${varHtml}
      </div>
    </div>`;
}

// ── Tabla inteligente ─────────────────────────────────────────
export function renderTabla(container, filas) {
    if (!filas || filas.length === 0) {
        container.innerHTML = '<p class="sin-datos">Sin registros</p>';
        return;
    }

    const cols = Object.keys(filas[0] || {});
    const muestra = filas.slice(0, 200);

    const esCurrencyCol = c => /importe|total|monto|saldo|cargo|abono|subtotal|iva|presup|inicial|montomov|imp_tot/i.test(c);
    const esPctCol = c => /pct|margen|porc|cumpl|variacion/i.test(c);

    const numCols = {};
    cols.forEach(c => {
        const vals = muestra.map(r => r[c]).filter(v => v !== null && v !== undefined && v !== '');
        const todos = vals.map(v => Number(v));
        if (todos.length > 0 && todos.every(n => isFinite(n))) {
            const maxAbs = Math.max(...todos.map(Math.abs));
            numCols[c] = { max: maxAbs, esCurrency: esCurrencyCol(c), esPct: esPctCol(c) };
        }
    });

    let sortCol = null;
    let sortAsc = true;

    function fmtCell(col, v) {
        const n = Number(v);
        if (v === null || v === undefined || v === '') return '<span class="null-val">—</span>';
        if (numCols[col]) {
            const info = numCols[col];
            const cls = n < 0 ? 'num-neg' : n > 0 ? 'num-pos' : 'num-zero';
            let txt;
            if (info.esCurrency) txt = fmtMoneda(n);
            else if (info.esPct) txt = n.toFixed(1) + '%';
            else txt = n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
            const pct = info.max > 0 ? Math.min(Math.abs(n) / info.max * 100, 100) : 0;
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
            return `<th class="th-smart${isNum ? ' th-num' : ''}" data-col="${esc(c)}" scope="col" tabindex="0" aria-sort="${sortCol === c ? (sortAsc ? 'ascending' : 'descending') : 'none'}">${esc(c)}${sortMark}</th>`;
        }).join('');

        const rows = data.map(row =>
            `<tr>${cols.map(c => `<td class="${numCols[c] ? 'td-num' : ''}">${fmtCell(c, row[c])}</td>`).join('')}</tr>`
        ).join('');

        return `<table class="data-table smart-table" role="grid">
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

        container.querySelectorAll('.th-smart').forEach(th => {
            th.style.cursor = 'pointer';
            th.addEventListener('click', () => sortBy(th.dataset.col));
            th.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortBy(th.dataset.col); }
            });
        });
    }

    function sortBy(col) {
        if (sortCol === col) sortAsc = !sortAsc;
        else { sortCol = col; sortAsc = true; }
        const sorted = [...muestra].sort((a, b) => {
            const av = numCols[col] ? Number(a[col]) : String(a[col] ?? '');
            const bv = numCols[col] ? Number(b[col]) : String(b[col] ?? '');
            return sortAsc ? (av > bv ? 1 : av < bv ? -1 : 0) : (av < bv ? 1 : av > bv ? -1 : 0);
        });
        render(sorted);
    }

    render(muestra);
}

// ── Reporte ───────────────────────────────────────────────────
export function renderReporte(container, filas, titulo) {
    if (!filas || filas.length === 0) { container.innerHTML = '<p class="sin-datos">Sin datos</p>'; return; }
    const cols = Object.keys(filas[0] || {});
    container.innerHTML = `
    <div class="reporte">
      <h4 class="reporte-titulo">${esc(titulo)}</h4>
      <table class="reporte-table">
        <thead><tr>${cols.map(c => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${filas.map(row =>
        `<tr>${cols.map(c => `<td>${esc(fmt(row[c]))}</td>`).join('')}</tr>`
    ).join('')}</tbody>
      </table>
    </div>`;
}

// ── Gráfica (Chart.js) ────────────────────────────────────────
export function renderChart(container, chartId, filas, viz, titulo) {
    if (!filas || filas.length === 0) {
        container.innerHTML = '<p class="sin-datos">Sin datos para graficar</p>';
        return;
    }

    const cols = Object.keys(filas[0]);
    const labelCol = cols[0];
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

    const datasets = tipo === 'pie'
        ? [{
            label: valueCols[0], data: filas.slice(0, MAX_ROWS).map(r => Number(r[valueCols[0]]) || 0),
            backgroundColor: palette, borderColor: '#161b22', borderWidth: 2
        }]
        : valueCols.map((col, i) => {
            const color = palette[i % palette.length];
            return {
                label: col,
                data: filas.slice(0, MAX_ROWS).map(r => Number(r[col]) || 0),
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
                pointHoverRadius: 5
            };
        });

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-wrapper';
    const canvas = document.createElement('canvas');
    canvas.id = chartId;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', esc(titulo));
    wrapper.appendChild(canvas);
    container.innerHTML = '';
    container.appendChild(wrapper);

    destroyChart(chartId);
    state.charts[chartId] = new Chart(canvas, {
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
                        label: ctx => {
                            const n = Number(ctx.raw);
                            return ` ${ctx.dataset.label}: ${isFinite(n) ? fmtMoneda(n) : ctx.raw}`;
                        }
                    }
                },
                title: { display: false }
            },
            scales: tipo !== 'pie' ? {
                x: { ticks: { color: '#8b949e', maxTicksLimit: 14, maxRotation: 45 }, grid: { color: '#21262d' } },
                y: { ticks: { color: '#8b949e', callback: v => fmtCompacto(Number(v)) }, grid: { color: '#21262d' } }
            } : {}
        }
    });
}
