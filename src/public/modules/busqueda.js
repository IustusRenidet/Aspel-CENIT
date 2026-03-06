/* ==============================================================
   CENIT IA — modules/busqueda.js
   Explorador de métricas + Asistente IA (NLP)
   ============================================================== */

import { state } from './state.js';
import { API, api } from './api.js';
import {
    esc, fmt, toast, loading,
    destroyChart, renderizarEnContenedor
} from './ui.js';
import { callbacks } from './registry.js';

// ── ═══════════════ EXPLORADOR DE MÉTRICAS ═══════════════ ────

export async function iniciarExplorador() {
    await buscarMetricasExp();
}

export async function buscarMetricasExp() {
    const sistema = document.getElementById('exp-sistema')?.value || '';
    const texto = document.getElementById('exp-buscar')?.value?.trim() || '';
    const btn = document.getElementById('btn-exp-buscar');
    if (btn) loading(btn, true, 'Buscando...');
    const grid = document.getElementById('exp-resultados');
    grid.innerHTML = '<div class="spinner" role="status" aria-label="Cargando..."></div>';

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
          <span class="badge badge-${esc((m.sistema || '').toLowerCase())}">${esc(m.sistema)}</span>
          <span class="badge badge-cat">${esc(m.categoria || 'general')}</span>
          <span class="badge">${esc(m.tipo || 'escalar')}</span>
        </div>
        <h4 class="exp-mc-titulo">${esc(m.nombre || m.id)}</h4>
        <p class="exp-mc-desc">${esc(m.descripcion || '')}</p>
        <button class="btn btn-sm btn-primary exp-mc-run"
          data-id="${esc(m.id)}" data-sistema="${esc(m.sistema)}"
          aria-label="Ejecutar métrica ${esc(m.nombre || m.id)}">
          ▶ Ejecutar ad-hoc
        </button>
      </div>
    `).join('');

        grid.querySelectorAll('.exp-mc-run').forEach(button => {
            button.addEventListener('click', () => abrirModalEjecutar(button.dataset.id, button.dataset.sistema));
        });
    } catch (err) {
        grid.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
    } finally {
        if (btn) loading(btn, false);
    }
}

export function abrirModalEjecutar(metricaId, sistema) {
    const metrica = state.expMetricas.find(m => m.id === metricaId);
    state.expMetricaActiva = { metricaId, sistema };
    state.modalViz = 'tabla';

    document.getElementById('modal-titulo').textContent = metrica?.nombre || metricaId;
    document.getElementById('modal-descripcion').textContent = metrica?.descripcion || '';
    document.getElementById('modal-resultado').innerHTML = '';
    document.getElementById('modal-viz-toggle')
        .querySelectorAll('.viz-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.viz === 'tabla'));
    const modal = document.getElementById('modal-ejecutar');
    modal.classList.remove('hidden');
    // Mover el foco al primer botón interactivo del modal
    setTimeout(() => modal.querySelector('button')?.focus(), 50);
}

export async function ejecutarMetricaModal() {
    const { metricaId, sistema } = state.expMetricaActiva || {};
    if (!metricaId) return;
    const btn = document.getElementById('modal-btn-ejecutar');
    loading(btn, true, '⏳');
    const container = document.getElementById('modal-resultado');
    container.innerHTML = '';
    destroyChart('modal-chart');

    try {
        const { data } = await api(`${API}/metricas/${encodeURIComponent(metricaId)}/ejecutar`, {
            method: 'POST',
            body: JSON.stringify({ sistema, modo: 'auto' })
        });
        const titulo = document.getElementById('modal-titulo').textContent;
        renderizarEnContenedor(container, data, state.modalViz, titulo, 'modal-chart');
    } catch (err) {
        container.innerHTML = `<p class="error-msg">${esc(err.message)}</p>`;
    } finally {
        loading(btn, false);
    }
}

// ── ═══════════════ ASISTENTE IA ═══════════════ ──────────────

export async function analizarConAsistente() {
    const texto = (document.getElementById('asistente-texto').value || '').trim();
    if (!texto) { toast('Escribe qué quieres analizar', 'error'); return; }

    const btn = document.getElementById('btn-asistente-analizar');
    loading(btn, true, '✦ Analizando...');
    document.getElementById('asistente-resultado-area').classList.add('hidden');

    try {
        const resp = await fetch(`${API}/widget-studio/interpretar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto })
        }).then(r => r.json());

        const { ok, data, error, sin_match, sugerencias, error_ejecucion } = resp;

        if (sin_match) {
            _mostrarNoMatch(error, sugerencias);
            return;
        }

        if (!ok && data) {
            const dataConError = { ...data, error_ejecucion };
            state.asistente.ultimaInterpretacion = dataConError;
            state.asistente.resultado = dataConError;
            state.asistente.viz = data.viz || 'tabla';
            renderInterpretacionCard(dataConError);
            actualizarVizToggleAsistente(state.asistente.viz);
            document.getElementById('asistente-resultado-container').innerHTML = `
        <div class="ai-no-match">
          <div class="ai-no-match-icon" aria-hidden="true">⚠️</div>
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

function _mostrarNoMatch(error, sugerencias) {
    const area = document.getElementById('asistente-resultado-area');
    area.classList.remove('hidden');
    document.getElementById('asistente-resultado-container').innerHTML = `
    <div class="ai-no-match">
      <div class="ai-no-match-icon" aria-hidden="true">🤔</div>
      <p class="ai-no-match-msg">${esc(error || 'No pude interpretar la consulta')}</p>
      ${sugerencias?.length ? `<p class="sug-hint">Intenta con:</p>
        <div class="asistente-ejemplos">
          ${sugerencias.map(s => `<button class="ej-pill ej-sug" data-texto="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>` : ''}
    </div>`;
    document.getElementById('asistente-interpretacion-card').classList.add('hidden');
    document.getElementById('asistente-viz-bar').classList.add('hidden');
    document.getElementById('asistente-meta').textContent = '';
}

export function renderInterpretacionCard(data) {
    const { interpretacion, confianza, error_ejecucion } = data;
    if (!interpretacion) return;

    const bar = document.getElementById('asistente-confianza-bar');
    const pct = Math.round(confianza || 0);
    const color = pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
    bar.innerHTML = `<span class="ai-conf-label">Confianza ${pct}%</span>
    <span class="ai-conf-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <span class="ai-conf-fill" style="width:${pct}%;background:${color}"></span>
    </span>`;

    const ul = document.getElementById('asistente-decisiones');
    ul.innerHTML = (interpretacion.decisiones || [])
        .map(d => `<li class="ai-decision-item">${esc(d)}</li>`).join('');

    if (error_ejecucion) {
        ul.innerHTML += `<li class="ai-decision-item ai-decision-warn">⚠ Error al ejecutar: ${esc(error_ejecucion)}</li>`;
    }
    renderAjusteControles(data.tipo, data.params);
}

export function actualizarVizToggleAsistente(viz) {
    document.getElementById('asistente-viz-toggle').querySelectorAll('.viz-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.viz === viz);
    });
}

export function renderAsistenteResultado() {
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

    const datosWrap = {
        datos: {
            filas: filas.map(fila => {
                const row = {};
                for (const [k, v] of Object.entries(fila)) row[k] = { valor: v, valor_formateado: fmt(v) };
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

export function renderAjusteControles(tipo, params) {
    const cont = document.getElementById('asistente-ajuste-controles');
    if (!tipo || !params) { cont.innerHTML = ''; return; }

    const p = params;
    const controles = [];

    if (p.mes !== undefined) {
        const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        controles.push(`<div class="studio-filtro-campo">
      <label for="ajuste-mes">Mes</label>
      <select id="ajuste-mes">
        ${meses.map((m, i) => `<option value="${i + 1}" ${p.mes === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}
      </select></div>`);
    }
    if (p.ejercicio !== undefined) {
        controles.push(`<div class="studio-filtro-campo">
      <label for="ajuste-ejercicio">Año (Ejercicio)</label>
      <input type="number" id="ajuste-ejercicio" value="${p.ejercicio}" min="2000" max="2099"></div>`);
    }
    if (p.nivel !== undefined) {
        controles.push(`<div class="studio-filtro-campo">
      <label for="ajuste-nivel">Nivel de cuentas</label>
      <select id="ajuste-nivel">
        <option value="">Todos</option>
        ${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${p.nivel == n ? 'selected' : ''}>Nivel ${n}</option>`).join('')}
      </select></div>`);
    }
    if (p.tipo_cuenta !== undefined) {
        const tipos = { '': 'Todos', 'I': 'Ingresos', 'E': 'Egresos', 'A': 'Activo', 'P': 'Pasivo', 'C': 'Capital' };
        controles.push(`<div class="studio-filtro-campo">
      <label for="ajuste-tipo-cuenta">Tipo de cuenta</label>
      <select id="ajuste-tipo-cuenta">
        ${Object.entries(tipos).map(([v, l]) => `<option value="${v}" ${p.tipo_cuenta === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>`);
    }
    if (tipo === 'coi_polizas_periodo') {
        const valTipo = p.tipo || 'todas';
        controles.push(`<div class="studio-filtro-campo">
      <label for="ajuste-tipo-poliza">Tipo de póliza</label>
      <select id="ajuste-tipo-poliza">
        ${[['todas', 'Todas'], ['I', 'Ingreso (I)'], ['E', 'Egreso (E)'], ['D', 'Diario (D)']].map(([v, l]) =>
            `<option value="${v}" ${valTipo === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></div>`);
    }
    if (p.cuenta !== undefined) {
        controles.push(`<div class="studio-filtro-campo">
      <label for="ajuste-cuenta">Número de cuenta</label>
      <input type="text" id="ajuste-cuenta" value="${esc(p.cuenta || '')}" placeholder="Ej: 401"></div>`);
    }
    controles.push(`<div class="studio-filtro-campo">
    <label for="ajuste-limite">Máx. filas</label>
    <input type="number" id="ajuste-limite" value="${p.limite || 500}" min="10" max="5000" step="50"></div>`);

    cont.innerHTML = controles.join('') ||
        '<p class="empty-msg">No hay parámetros ajustables para este análisis.</p>';
}

export async function aplicarAjusteAsistente() {
    const interp = state.asistente.ultimaInterpretacion;
    if (!interp) return;

    const paramsAjustados = { ...interp.params };
    const get = id => document.getElementById(id);
    if (get('ajuste-mes')) paramsAjustados.mes = Number(get('ajuste-mes').value);
    if (get('ajuste-ejercicio')) paramsAjustados.ejercicio = Number(get('ajuste-ejercicio').value);
    if (get('ajuste-nivel')) paramsAjustados.nivel = get('ajuste-nivel').value ? Number(get('ajuste-nivel').value) : undefined;
    if (get('ajuste-tipo-cuenta')) paramsAjustados.tipo_cuenta = get('ajuste-tipo-cuenta').value;
    if (get('ajuste-tipo-poliza')) paramsAjustados.tipo = get('ajuste-tipo-poliza').value;
    if (get('ajuste-cuenta')) paramsAjustados.cuenta = get('ajuste-cuenta').value;
    if (get('ajuste-limite')) paramsAjustados.limite = Number(get('ajuste-limite').value);

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

export function mostrarSugerenciasRefinamiento(sugs) {
    const sec = document.getElementById('asistente-sugerencias-ref');
    const pills = document.getElementById('asistente-sug-pills');
    if (!sugs || !sugs.length) { sec.classList.add('hidden'); return; }
    pills.innerHTML = sugs.map(s =>
        `<button class="ej-pill ej-sug" data-texto="${esc(s)}">${esc(s)}</button>`
    ).join('');
    sec.classList.remove('hidden');
}

export function exportarCSVAsistente() {
    const datos = state.asistente.resultado;
    if (!datos?.filas?.length) { toast('Sin datos para exportar', 'error'); return; }
    const filas = datos.filas;
    const cols = Object.keys(filas[0]);
    const csv = [
        cols.join(','),
        ...filas.map(f => cols.map(c => {
            const v = f[c] ?? '';
            return typeof v === 'string' && (v.includes(',') || v.includes('"'))
                ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(','))
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `asistente_${state.asistente.ultimaInterpretacion?.tipo || 'resultado'}_${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    toast('CSV descargado', 'ok');
}

export function agregarWidgetAsistenteAlDashboard() {
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
    callbacks.navegar('builder');
    callbacks.mostrarFase('widgets');
    callbacks.renderWidgetsSupgeridos(state.dashboard.widgets, state.dashboard.objetivo);
}
