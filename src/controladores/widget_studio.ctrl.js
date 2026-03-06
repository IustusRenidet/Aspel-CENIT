'use strict';

/**
 * Widget Studio — constructor dinámico de widgets personalizados
 * Permite al usuario elegir columnas, filtros y visualización sin límites.
 */

const { ejecutarConsulta } = require('../conectores/firebird/conexion');
const { leerTablas, leerCampos } = require('../conectores/firebird/lector_esquema');
const { interpretar } = require('../servicios/interprete_nlp');
const widgetsCustom = require('../servicios/widgets_custom_service');
// resolverParamsSQL: importado desde el servicio para evitar duplicación
const { resolverParamsSQL } = widgetsCustom;

const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG DE TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {
    coi_estado_resultados: {
        id: 'coi_estado_resultados',
        nombre: 'Estado de Resultados vs Presupuesto',
        descripcion: 'Ingresos, costos y gastos del período comparados contra el presupuesto asignado por cuenta',
        sistema: 'COI',
        icono: '📊',
        columnas_disponibles: [
            { id: 'num_cta', nombre: 'Número de Cuenta', tipo: 'texto', defecto: true },
            { id: 'nombre', nombre: 'Nombre de la Cuenta', tipo: 'texto', defecto: true },
            { id: 'nivel', nombre: 'Nivel', tipo: 'numero', defecto: false },
            { id: 'naturaleza', nombre: 'Naturaleza (D/A)', tipo: 'texto', defecto: false },
            { id: 'cargo_mes', nombre: 'Cargos del Mes', tipo: 'moneda', defecto: false },
            { id: 'abono_mes', nombre: 'Abonos del Mes', tipo: 'moneda', defecto: false },
            { id: 'saldo_mes', nombre: 'Saldo del Mes', tipo: 'moneda', defecto: true },
            { id: 'saldo_acumulado', nombre: 'Saldo Acumulado YTD', tipo: 'moneda', defecto: true },
            { id: 'presup_mes', nombre: 'Presupuesto del Mes', tipo: 'moneda', defecto: true },
            { id: 'presup_acumulado', nombre: 'Presupuesto Acumulado', tipo: 'moneda', defecto: true },
            { id: 'variacion_mes', nombre: 'Variación del Mes', tipo: 'moneda', defecto: true },
            { id: 'pct_cumplimiento', nombre: '% Cumplimiento', tipo: 'porcentaje', defecto: true },
        ],
        filtros: [
            { id: 'ejercicio', nombre: 'Ejercicio (Año)', tipo: 'numero', defecto: () => new Date().getFullYear() },
            { id: 'mes', nombre: 'Mes', tipo: 'numero', defecto: () => new Date().getMonth() + 1, min: 1, max: 12 },
            { id: 'nivel', nombre: 'Nivel de Cuenta', tipo: 'numero', defecto: 1, min: 1, max: 5 },
            {
                id: 'tipo_cuenta', nombre: 'Tipo de Cuentas', tipo: 'select', defecto: 'resultado',
                opciones: [
                    { valor: 'resultado', etiqueta: 'Resultado (4,5,6,7)' },
                    { valor: 'activo', etiqueta: 'Activo (1)' },
                    { valor: 'pasivo', etiqueta: 'Pasivo (2)' },
                    { valor: 'capital', etiqueta: 'Capital (3)' },
                    { valor: 'todas', etiqueta: 'Todas las cuentas' },
                ]
            },
        ]
    },

    coi_cuentas_saldos: {
        id: 'coi_cuentas_saldos',
        nombre: 'Cuentas de Mayor con Saldos',
        descripcion: 'Lista de cuentas contables con sus saldos acumulados al período indicado',
        sistema: 'COI',
        icono: '📋',
        columnas_disponibles: [
            { id: 'num_cta', nombre: 'Número de Cuenta', tipo: 'texto', defecto: true },
            { id: 'nombre', nombre: 'Nombre', tipo: 'texto', defecto: true },
            { id: 'nivel', nombre: 'Nivel', tipo: 'numero', defecto: false },
            { id: 'tipo', nombre: 'Tipo (D/A)', tipo: 'texto', defecto: false },
            { id: 'naturaleza', nombre: 'Naturaleza', tipo: 'texto', defecto: false },
            { id: 'saldo_inicial', nombre: 'Saldo Inicial', tipo: 'moneda', defecto: false },
            { id: 'saldo_acumulado', nombre: 'Saldo Acumulado', tipo: 'moneda', defecto: true },
            { id: 'cta_papa', nombre: 'Cuenta Padre', tipo: 'texto', defecto: false },
            { id: 'cta_raiz', nombre: 'Cuenta Raíz', tipo: 'texto', defecto: false },
            { id: 'codagrup', nombre: 'Código Agrupación', tipo: 'texto', defecto: false },
        ],
        filtros: [
            { id: 'ejercicio', nombre: 'Ejercicio', tipo: 'numero', defecto: () => new Date().getFullYear() },
            { id: 'mes', nombre: 'Hasta Mes', tipo: 'numero', defecto: () => new Date().getMonth() + 1, min: 1, max: 12 },
            { id: 'nivel', nombre: 'Nivel Máximo', tipo: 'numero', defecto: 1, min: 1, max: 5 },
        ]
    },

    coi_polizas_periodo: {
        id: 'coi_polizas_periodo',
        nombre: 'Pólizas del Período',
        descripcion: 'Detalle de pólizas contables del ejercicio y mes seleccionados',
        sistema: 'COI',
        icono: '📄',
        columnas_disponibles: [
            { id: 'tipo_poliza', nombre: 'Tipo', tipo: 'texto', defecto: true },
            { id: 'num_poliz', nombre: 'Número', tipo: 'texto', defecto: true },
            { id: 'fecha', nombre: 'Fecha', tipo: 'fecha', defecto: true },
            { id: 'concepto', nombre: 'Concepto', tipo: 'texto', defecto: true },
            { id: 'usuario', nombre: 'Usuario', tipo: 'texto', defecto: false },
            { id: 'autorizacion', nombre: 'Autorización', tipo: 'texto', defecto: false },
        ],
        filtros: [
            { id: 'ejercicio', nombre: 'Ejercicio', tipo: 'numero', defecto: () => new Date().getFullYear() },
            { id: 'mes', nombre: 'Mes', tipo: 'numero', defecto: () => new Date().getMonth() + 1, min: 1, max: 12 },
            {
                id: 'tipo', nombre: 'Tipo de Póliza', tipo: 'select', defecto: 'todas',
                opciones: [
                    { valor: 'todas', etiqueta: 'Todas' },
                    { valor: 'I', etiqueta: 'Ingresos' },
                    { valor: 'E', etiqueta: 'Egresos' },
                    { valor: 'D', etiqueta: 'Diario' },
                ]
            },
        ]
    },

    coi_auxiliar_cuenta: {
        id: 'coi_auxiliar_cuenta',
        nombre: 'Auxiliar de Cuenta',
        descripcion: 'Movimientos detallados de una cuenta contable específica',
        sistema: 'COI',
        icono: '🔍',
        columnas_disponibles: [
            { id: 'num_cta', nombre: 'Cuenta', tipo: 'texto', defecto: true },
            { id: 'tipo_poli', nombre: 'Tipo Póliza', tipo: 'texto', defecto: true },
            { id: 'num_poliz', nombre: 'Núm. Póliza', tipo: 'texto', defecto: true },
            { id: 'fecha_pol', nombre: 'Fecha', tipo: 'fecha', defecto: true },
            { id: 'concep_po', nombre: 'Concepto', tipo: 'texto', defecto: true },
            { id: 'debe_haber', nombre: 'D/H', tipo: 'texto', defecto: true },
            { id: 'montomov', nombre: 'Importe', tipo: 'moneda', defecto: true },
            { id: 'periodo', nombre: 'Período', tipo: 'numero', defecto: false },
        ],
        filtros: [
            { id: 'ejercicio', nombre: 'Ejercicio', tipo: 'numero', defecto: () => new Date().getFullYear() },
            { id: 'mes', nombre: 'Mes', tipo: 'numero', defecto: () => new Date().getMonth() + 1, min: 1, max: 12 },
            { id: 'cuenta', nombre: 'Cuenta (ej: 401)', tipo: 'texto', defecto: '' },
        ]
    },

    sae_ventas_detalle: {
        id: 'sae_ventas_detalle',
        nombre: 'Detalle de Ventas',
        descripcion: 'Facturas de venta del período seleccionado con cliente, importe y estatus',
        sistema: 'SAE',
        icono: '💰',
        columnas_disponibles: [
            { id: 'folio', nombre: 'Folio', tipo: 'texto', defecto: true },
            { id: 'fecha', nombre: 'Fecha', tipo: 'fecha', defecto: true },
            { id: 'cliente', nombre: 'Cliente', tipo: 'texto', defecto: true },
            { id: 'nombre_cli', nombre: 'Nombre Cliente', tipo: 'texto', defecto: true },
            { id: 'vendedor', nombre: 'Vendedor', tipo: 'texto', defecto: false },
            { id: 'subtotal', nombre: 'Subtotal', tipo: 'moneda', defecto: false },
            { id: 'descuento', nombre: 'Descuento', tipo: 'moneda', defecto: false },
            { id: 'iva', nombre: 'IVA', tipo: 'moneda', defecto: false },
            { id: 'total', nombre: 'Total', tipo: 'moneda', defecto: true },
            { id: 'costo', nombre: 'Costo', tipo: 'moneda', defecto: false },
            { id: 'utilidad', nombre: 'Utilidad', tipo: 'moneda', defecto: true },
            { id: 'margen', nombre: 'Margen %', tipo: 'porcentaje', defecto: true },
            { id: 'status', nombre: 'Estatus', tipo: 'texto', defecto: false },
        ],
        filtros: [
            { id: 'fecha_ini', nombre: 'Fecha Inicio', tipo: 'fecha', defecto: () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); } },
            { id: 'fecha_fin', nombre: 'Fecha Fin', tipo: 'fecha', defecto: () => new Date().toISOString().slice(0, 10) },
            { id: 'cliente', nombre: 'Cliente (código o vacío=todos)', tipo: 'texto', defecto: '' },
            { id: 'vendedor', nombre: 'Vendedor (código o vacío=todos)', tipo: 'texto', defecto: '' },
            {
                id: 'canceladas', nombre: 'Incluir canceladas', tipo: 'select', defecto: 'no',
                opciones: [
                    { valor: 'no', etiqueta: 'No incluir' },
                    { valor: 'si', etiqueta: 'Incluir' },
                ]
            },
        ]
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// SQL BUILDERS
// ─────────────────────────────────────────────────────────────────────────────

function buildSQL_EstadoResultados({ ejercicio, mes, nivel, tipo_cuenta, columnas }) {
    const yy = String(ejercicio).slice(-2);
    const mm = String(mes).padStart(2, '0');
    const meses = Array.from({ length: mes }, (_, i) => String(i + 1).padStart(2, '0'));

    const sumaAbonos = meses.map(m => `COALESCE(s.ABONO${m},0)`).join('+');
    const sumaCargos = meses.map(m => `COALESCE(s.CARGO${m},0)`).join('+');
    const sumaPresupAc = meses.map(m => `COALESCE(p.PRESUP${m},0)`).join('+');

    const saldoMes = `CASE WHEN c.NATURALEZA = 2 THEN (COALESCE(s.ABONO${mm},0)-COALESCE(s.CARGO${mm},0)) ELSE (COALESCE(s.CARGO${mm},0)-COALESCE(s.ABONO${mm},0)) END`;
    const saldoAcum = `CASE WHEN c.NATURALEZA = 2 THEN (${sumaAbonos.replace(/\bABONO/g, 's.ABONO')}-${sumaCargos.replace(/\bCARGO/g, 's.CARGO')}) ELSE (${sumaCargos.replace(/\bCARGO/g, 's.CARGO')}-${sumaAbonos.replace(/\bABONO/g, 's.ABONO')}) END`;
    const presupMes = `COALESCE(p.PRESUP${mm},0)`;
    const presupAc = `(${sumaPresupAc.replace(/\bPRESUP/g, 'p.PRESUP')})`;

    const colDef = {
        num_cta: `c.NUM_CTA          AS "Cuenta"`,
        nombre: `c.NOMBRE           AS "Nombre"`,
        nivel: `CAST(c.NIVEL AS INTEGER)  AS "Nivel"`,
        naturaleza: `CASE c.NATURALEZA WHEN 2 THEN 'Acreedora' WHEN 1 THEN 'Deudora' ELSE '' END AS "Naturaleza"`,
        cargo_mes: `COALESCE(s.CARGO${mm},0)  AS "Cargos_Mes"`,
        abono_mes: `COALESCE(s.ABONO${mm},0)  AS "Abonos_Mes"`,
        saldo_mes: `(${saldoMes}) AS "Saldo_Mes"`,
        saldo_acumulado: `(${saldoAcum}) AS "Saldo_Acumulado"`,
        presup_mes: `(${presupMes}) AS "Presup_Mes"`,
        presup_acumulado: `(${presupAc}) AS "Presup_Acumulado"`,
        variacion_mes: `((${saldoMes})-(${presupMes})) AS "Variacion_Mes"`,
        pct_cumplimiento: `CASE WHEN (${presupMes})<>0 THEN CAST(ROUND(((${saldoMes})/(${presupMes}))*100,1) AS DECIMAL(10,1)) ELSE CAST(NULL AS DECIMAL(10,1)) END AS "Pct_Cumpl"`,
    };

    const whereMap = {
        resultado: `(c.NUM_CTA STARTING WITH '4' OR c.NUM_CTA STARTING WITH '5' OR c.NUM_CTA STARTING WITH '6' OR c.NUM_CTA STARTING WITH '7')`,
        activo: `c.NUM_CTA STARTING WITH '1'`,
        pasivo: `c.NUM_CTA STARTING WITH '2'`,
        capital: `c.NUM_CTA STARTING WITH '3'`,
        todas: `1=1`,
    };

    const selectCols = (columnas && columnas.length > 0 ? columnas : ['num_cta', 'nombre', 'saldo_mes', 'presup_mes', 'variacion_mes', 'pct_cumplimiento'])
        .map(c => colDef[c]).filter(Boolean);

    return `SELECT FIRST 500
  ${selectCols.join(',\n  ')}
FROM CUENTAS${yy} c
JOIN SALDOS${yy} s ON s.NUM_CTA = c.NUM_CTA AND s.EJERCICIO = ${ejercicio}
LEFT JOIN PRESUP${yy} p ON p.NUM_CTA = c.NUM_CTA AND p.EJERCICIO = ${ejercicio}
WHERE ${whereMap[tipo_cuenta] || whereMap.resultado}
  AND c.NIVEL <= ${nivel}
ORDER BY c.NUM_CTA`;
}

function buildSQL_CuentasSaldos({ ejercicio, mes, nivel, columnas }) {
    const yy = String(ejercicio).slice(-2);
    const meses = Array.from({ length: mes }, (_, i) => String(i + 1).padStart(2, '0'));
    const sumaCargos = meses.map(m => `COALESCE(s.CARGO${m},0)`).join('+');
    const sumaAbonos = meses.map(m => `COALESCE(s.ABONO${m},0)`).join('+');
    const saldoAcum = `CASE WHEN c.NATURALEZA = 2 THEN (COALESCE(s.INICIAL,0)+(${sumaAbonos.replace(/\bABONO/g, 's.ABONO')})-(${sumaCargos.replace(/\bCARGO/g, 's.CARGO')})) ELSE (COALESCE(s.INICIAL,0)+(${sumaCargos.replace(/\bCARGO/g, 's.CARGO')})-(${sumaAbonos.replace(/\bABONO/g, 's.ABONO')})) END`;

    const colDef = {
        num_cta: `c.NUM_CTA          AS "Cuenta"`,
        nombre: `c.NOMBRE           AS "Nombre"`,
        nivel: `CAST(c.NIVEL AS INTEGER) AS "Nivel"`,
        tipo: `c.TIPO             AS "Tipo"`,
        naturaleza: `CASE c.NATURALEZA WHEN 2 THEN 'Acreedora' WHEN 1 THEN 'Deudora' ELSE '' END AS "Naturaleza"`,
        saldo_inicial: `COALESCE(s.INICIAL,0) AS "Saldo_Inicial"`,
        saldo_acumulado: `(${saldoAcum}) AS "Saldo_Acumulado"`,
        cta_papa: `c.CTA_PAPA         AS "Cta_Padre"`,
        cta_raiz: `c.CTA_RAIZ         AS "Cta_Raiz"`,
        codagrup: `c.CODAGRUP         AS "Cod_Agrup"`,
    };

    const selectCols = (columnas && columnas.length > 0 ? columnas : ['num_cta', 'nombre', 'saldo_inicial', 'saldo_acumulado'])
        .map(c => colDef[c]).filter(Boolean);

    return `SELECT FIRST 500
  ${selectCols.join(',\n  ')}
FROM CUENTAS${yy} c
JOIN SALDOS${yy} s ON s.NUM_CTA = c.NUM_CTA AND s.EJERCICIO = ${ejercicio}
WHERE c.NIVEL <= ${nivel}
ORDER BY c.NUM_CTA`;
}

function buildSQL_PolizasPeriodo({ ejercicio, mes, tipo, columnas }) {
    const yy = String(ejercicio).slice(-2);

    // Columnas reales de POLIZAS{yy} — verificadas contra esquema Firebird
    const colDef = {
        tipo_poliza: `p.TIPO_POLI    AS "Tipo"`,
        num_poliz: `p.NUM_POLIZ    AS "Numero"`,
        fecha: `p.FECHA_POL    AS "Fecha"`,
        concepto: `p.CONCEP_PO    AS "Concepto"`,
        contabiliz: `p.CONTABILIZ   AS "Contabilizada"`,
        origen: `p.ORIGEN       AS "Origen"`,
        uuid: `p.UUID         AS "UUID"`,
    };

    const selectCols = (columnas && columnas.length > 0 ? columnas : ['tipo_poliza', 'num_poliz', 'fecha', 'concepto', 'contabiliz'])
        .map(c => colDef[c]).filter(Boolean);

    const whereExtra = tipo && tipo !== 'todas' ? `\n  AND p.TIPO_POLI = '${tipo}'` : '';

    return `SELECT FIRST 500
  ${selectCols.join(',\n  ')}
FROM POLIZAS${yy} p
WHERE p.EJERCICIO = ${ejercicio}
  AND p.PERIODO = ${mes}${whereExtra}
ORDER BY p.TIPO_POLI, p.NUM_POLIZ`;
}

function buildSQL_AuxiliarCuenta({ ejercicio, mes, cuenta, columnas }) {
    const yy = String(ejercicio).slice(-2);

    const colDef = {
        num_cta: `a.NUM_CTA    AS "Cuenta"`,
        tipo_poli: `a.TIPO_POLI  AS "Tipo_Poliza"`,
        num_poliz: `a.NUM_POLIZ  AS "Num_Poliza"`,
        fecha_pol: `a.FECHA_POL  AS "Fecha"`,
        concep_po: `a.CONCEP_PO  AS "Concepto"`,
        debe_haber: `a.DEBE_HABER AS "DH"`,
        montomov: `a.MONTOMOV   AS "Importe"`,
        periodo: `CAST(a.PERIODO AS INTEGER) AS "Periodo"`,
    };

    const selectCols = (columnas && columnas.length > 0 ? columnas : ['num_cta', 'tipo_poli', 'num_poliz', 'fecha_pol', 'concep_po', 'debe_haber', 'montomov'])
        .map(c => colDef[c]).filter(Boolean);

    const whereExtra = cuenta ? `\n  AND a.NUM_CTA STARTING WITH '${cuenta.replace(/'/g, "''")}'` : '';

    return `SELECT FIRST 1000
  ${selectCols.join(',\n  ')}
FROM AUXILIAR${yy} a
WHERE a.EJERCICIO = ${ejercicio}
  AND a.PERIODO = ${mes}${whereExtra}
ORDER BY a.NUM_CTA, a.FECHA_POL, a.NUM_POLIZ`;
}

function buildSQL_VentasDetalle({ fecha_ini, fecha_fin, cliente, vendedor, canceladas, columnas }) {
    const inclCanceladas = canceladas === 'si';

    // Columnas reales de FACTV01 y CLIE01 — verificadas contra esquema SAE Firebird
    const colDef = {
        folio: `f.FOLIO             AS "Folio"`,
        tipo_doc: `f.TIP_DOC           AS "Tipo"`,
        cve_doc: `f.CVE_DOC           AS "Cve_Doc"`,
        fecha: `f.FECHA_DOC         AS "Fecha"`,
        cliente: `f.CVE_CLPV          AS "Clave_Cliente"`,
        nombre_cli: `c.NOMBRE            AS "Nombre_Cliente"`,
        vendedor: `f.CVE_VEND          AS "Vendedor"`,
        subtotal: `f.IMP_TOT1          AS "Subtotal"`,
        descuento: `COALESCE(f.DES_TOT, 0) AS "Descuento"`,
        iva: `f.IMP_TOT3          AS "IVA"`,
        total: `f.IMPORTE           AS "Total"`,
        status: `f.STATUS            AS "Status"`,
    };

    const selectCols = (columnas && columnas.length > 0 ? columnas : ['folio', 'fecha', 'cliente', 'nombre_cli', 'vendedor', 'subtotal', 'descuento', 'iva', 'total'])
        .map(c => colDef[c]).filter(Boolean);

    const conditions = [`f.FECHA_DOC BETWEEN '${fecha_ini}' AND '${fecha_fin}'`];
    if (!inclCanceladas) conditions.push(`f.STATUS <> 'C'`);
    if (cliente) conditions.push(`f.CVE_CLPV = '${cliente.replace(/'/g, "''")}'`);
    if (vendedor) conditions.push(`f.CVE_VEND = '${vendedor.replace(/'/g, "''")}'`);

    return `SELECT FIRST 2000
  ${selectCols.join(',\n  ')}
FROM FACTV01 f
LEFT JOIN CLIE01 c ON c.CLAVE = f.CVE_CLPV
WHERE ${conditions.join('\n  AND ')}
ORDER BY f.FECHA_DOC DESC, f.FOLIO DESC`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT CONTROLLERS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/widget-studio/templates  →  lista todos los templates disponibles */
exports.getTemplates = (_req, res) => {
    const list = Object.values(TEMPLATES).map(t => {
        const filtrosSerializados = t.filtros.map(f => ({
            ...f,
            defecto: typeof f.defecto === 'function' ? f.defecto() : f.defecto
        }));
        return { ...t, filtros: filtrosSerializados };
    });
    res.json({ ok: true, data: list });
};

/** POST /api/widget-studio/construir  →  genera SQL + ejecuta preview */
exports.construir = async (req, res) => {
    const {
        tipo,           // id del template
        sistema,        // SAE | COI | NOI | BANCO
        params = {},    // filtros del usuario
        columnas = [],  // ids de columnas seleccionadas
        solo_sql = false // si true, no ejecuta, solo devuelve SQL
    } = req.body;

    const template = TEMPLATES[tipo];
    if (!template) {
        return res.status(400).json({ ok: false, error: `Template '${tipo}' no existe. Templates disponibles: ${Object.keys(TEMPLATES).join(', ')}` });
    }

    const sistemaFinal = (sistema || template.sistema || 'COI').toUpperCase();

    // ── Completar parámetros con defaults ────────────────────
    const p = {};
    for (const f of template.filtros) {
        const def = typeof f.defecto === 'function' ? f.defecto() : f.defecto;
        p[f.id] = params[f.id] !== undefined && params[f.id] !== '' ? params[f.id] : def;
    }

    // ── Construir SQL según el template ──────────────────────
    let sql;
    try {
        switch (tipo) {
            case 'coi_estado_resultados':
                sql = buildSQL_EstadoResultados({
                    ejercicio: Number(p.ejercicio),
                    mes: Number(p.mes),
                    nivel: Number(p.nivel),
                    tipo_cuenta: p.tipo_cuenta || 'resultado',
                    columnas
                });
                break;
            case 'coi_cuentas_saldos':
                sql = buildSQL_CuentasSaldos({
                    ejercicio: Number(p.ejercicio),
                    mes: Number(p.mes),
                    nivel: Number(p.nivel),
                    columnas
                });
                break;
            case 'coi_polizas_periodo':
                sql = buildSQL_PolizasPeriodo({
                    ejercicio: Number(p.ejercicio),
                    mes: Number(p.mes),
                    tipo: p.tipo,
                    columnas
                });
                break;
            case 'coi_auxiliar_cuenta':
                sql = buildSQL_AuxiliarCuenta({
                    ejercicio: Number(p.ejercicio),
                    mes: Number(p.mes),
                    cuenta: p.cuenta || '',
                    columnas
                });
                break;
            case 'sae_ventas_detalle':
                sql = buildSQL_VentasDetalle({
                    fecha_ini: p.fecha_ini,
                    fecha_fin: p.fecha_fin,
                    cliente: p.cliente || '',
                    vendedor: p.vendedor || '',
                    canceladas: p.canceladas || 'no',
                    columnas
                });
                break;
            default:
                return res.status(400).json({ ok: false, error: `Builder para '${tipo}' no implementado` });
        }
    } catch (buildErr) {
        return res.status(500).json({ ok: false, error: `Error al construir SQL: ${buildErr.message}` });
    }

    if (solo_sql) {
        return res.json({ ok: true, data: { sql, template: template.nombre, sistema: sistemaFinal } });
    }

    // ── Ejecutar en Firebird ──────────────────────────────────
    try {
        const filas = await ejecutarConsulta(sistemaFinal, sql);
        const preview = Array.isArray(filas) ? filas.slice(0, 10) : [];
        const totalFilas = Array.isArray(filas) ? filas.length : 0;

        // Normalizar keys a lowercase para consistencia con el frontend
        const filasNorm = filas.map(fila => {
            const norm = {};
            for (const [k, v] of Object.entries(fila)) norm[k.toLowerCase()] = v;
            return norm;
        });
        const previewNorm = filasNorm.slice(0, 10);

        return res.json({
            ok: true,
            data: {
                sql,
                template: template.nombre,
                sistema: sistemaFinal,
                total_filas: totalFilas,
                columnas: Object.keys(preview[0] || {}).map(k => k.toLowerCase()),
                filas: filasNorm,
                preview: previewNorm
            }
        });
    } catch (execErr) {
        // Devolvemos el SQL aunque haya fallado para debugging
        return res.status(500).json({
            ok: false,
            error: execErr.message,
            sql,
            hint: 'Verifica que la base de datos esté conectada y el ejercicio/año tenga tablas disponibles'
        });
    }
};

/**
 * POST /api/widget-studio/interpretar
 * Recibe texto libre en español → detecta intención → construye SQL → ejecuta
 */
exports.interpretar = async (req, res) => {
    const { texto, solo_interpretar = false, params_override } = req.body;

    if (!texto || !String(texto).trim()) {
        return res.status(400).json({ ok: false, error: 'El campo texto es obligatorio' });
    }

    // 1. Interpretar lenguaje natural
    const interpretacion = interpretar(String(texto).trim());

    if (!interpretacion.ok) {
        return res.status(200).json({
            ok: false,
            sin_match: true,
            error: interpretacion.error,
            sugerencias: interpretacion.sugerencias
        });
    }

    // Aplicar overrides de parámetros si el usuario ajustó manualmente
    if (params_override && typeof params_override === 'object') {
        Object.assign(interpretacion.params, params_override);
    }

    // Si solo quieren saber la interpretación (para previsualizar antes de ejecutar)
    if (solo_interpretar) {
        return res.json({ ok: true, data: { ...interpretacion, filas: [], total_filas: 0 } });
    }

    // 2. Construir SQL usando el mismo motor del construir()
    const { tipo, sistema, params: p, columnas } = interpretacion;
    const template = TEMPLATES[tipo];

    if (!template) {
        return res.status(500).json({ ok: false, error: `Template '${tipo}' no encontrado internamente` });
    }

    // Completar params con defaults del template
    const paramsCompletos = {};
    for (const f of template.filtros) {
        const def = typeof f.defecto === 'function' ? f.defecto() : f.defecto;
        paramsCompletos[f.id] = p[f.id] !== undefined && p[f.id] !== '' ? p[f.id] : def;
    }
    // Sobreescribir con los detectados por el intérprete
    Object.assign(paramsCompletos, p);

    let sql;
    try {
        switch (tipo) {
            case 'coi_estado_resultados':
                sql = buildSQL_EstadoResultados({
                    ejercicio: Number(paramsCompletos.ejercicio), mes: Number(paramsCompletos.mes),
                    nivel: Number(paramsCompletos.nivel || 1),
                    tipo_cuenta: paramsCompletos.tipo_cuenta || 'resultado', columnas
                });
                break;
            case 'coi_cuentas_saldos':
                sql = buildSQL_CuentasSaldos({
                    ejercicio: Number(paramsCompletos.ejercicio), mes: Number(paramsCompletos.mes),
                    nivel: Number(paramsCompletos.nivel || 1), columnas
                });
                break;
            case 'coi_polizas_periodo':
                sql = buildSQL_PolizasPeriodo({
                    ejercicio: Number(paramsCompletos.ejercicio), mes: Number(paramsCompletos.mes),
                    tipo: paramsCompletos.tipo || 'todas', columnas
                });
                break;
            case 'coi_auxiliar_cuenta':
                sql = buildSQL_AuxiliarCuenta({
                    ejercicio: Number(paramsCompletos.ejercicio), mes: Number(paramsCompletos.mes),
                    cuenta: paramsCompletos.cuenta || '', columnas
                });
                break;
            case 'sae_ventas_detalle':
                sql = buildSQL_VentasDetalle({
                    fecha_ini: paramsCompletos.fecha_ini, fecha_fin: paramsCompletos.fecha_fin,
                    cliente: paramsCompletos.cliente || '', vendedor: paramsCompletos.vendedor || '',
                    canceladas: paramsCompletos.canceladas || 'no', columnas
                });
                break;
            default:
                return res.status(400).json({ ok: false, error: `Builder para '${tipo}' no implementado` });
        }
    } catch (buildErr) {
        return res.status(500).json({ ok: false, error: `Error al construir SQL: ${buildErr.message}` });
    }

    // 3. Ejecutar en Firebird
    try {
        const filas = await ejecutarConsulta(sistema, sql);
        const filasNorm = (filas || []).map(fila => {
            const norm = {};
            for (const [k, v] of Object.entries(fila)) norm[k.toLowerCase()] = v;
            return norm;
        });
        return res.json({
            ok: true,
            data: {
                ...interpretacion,
                sql,
                total_filas: filasNorm.length,
                columnas_resultado: Object.keys(filasNorm[0] || {}),
                filas: filasNorm
            }
        });
    } catch (execErr) {
        // Devolvemos la interpretación + SQL + el error para que el usuario vea qué pasó
        return res.status(200).json({
            ok: false,
            error_ejecucion: execErr.message,
            data: { ...interpretacion, sql, filas: [], total_filas: 0 },
            hint: 'La consulta fue generada correctamente pero la base de datos retornó un error. Verifica la conexión y que el ejercicio/año tenga tablas.'
        });
    }
};

/** POST /api/widget-studio/sql-libre  →  ejecuta SQL personalizado */
exports.ejecutarSQLLibre = async (req, res) => {
    const { sql, sistema = 'COI', params_sql } = req.body;
    if (!sql || !sql.trim()) {
        return res.status(400).json({ ok: false, error: 'El campo sql es obligatorio' });
    }
    const sistemaFinal = sistema.toUpperCase();
    const SQL_PELIGROSO = /\b(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE)\b/i;
    if (SQL_PELIGROSO.test(sql)) {
        return res.status(400).json({ ok: false, error: 'Solo se permiten consultas SELECT' });
    }

    // Resolver parámetros :nombre → ? + array de valores
    const { sql: sqlFinal, values } = resolverParamsSQL(sql.trim(), params_sql || {});

    try {
        const filas = await ejecutarConsulta(sistemaFinal, sqlFinal, values);
        const filasNorm = (filas || []).map(fila => {
            const norm = {};
            for (const [k, v] of Object.entries(fila)) norm[k.toLowerCase()] = v;
            return norm;
        });
        return res.json({
            ok: true,
            data: {
                sistema: sistemaFinal,
                total_filas: filasNorm.length,
                columnas: Object.keys(filasNorm[0] || {}),
                filas: filasNorm
            }
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message, sql: sqlFinal });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MIS WIDGETS — CRUD de widgets personalizados del usuario
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/widget-studio/mis-widgets */
exports.listarMisWidgets = (req, res) => {
    res.json({ ok: true, widgets: widgetsCustom.listar() });
};

/** POST /api/widget-studio/mis-widgets */
exports.guardarMiWidget = async (req, res) => {
    const datos = req.body;
    if (!datos || !String(datos.nombre || '').trim()) {
        return res.status(400).json({ ok: false, error: 'El campo nombre es obligatorio' });
    }
    try {
        const widget = await widgetsCustom.guardar(datos);
        res.json({ ok: true, widget });
    } catch (err) {
        res.status(400).json({ ok: false, error: err.message });
    }
};

/** DELETE /api/widget-studio/mis-widgets/:id */
exports.eliminarMiWidget = (req, res) => {
    const eliminado = widgetsCustom.eliminar(req.params.id);
    if (!eliminado) return res.status(404).json({ ok: false, error: 'Widget no encontrado' });
    res.json({ ok: true });
};

/**
 * POST /api/widget-studio/mis-widgets/:id/ejecutar
 * Delega al servicio WidgetsCustomService.ejecutarWidget() que valida SQL,
 * convierte tipos y ejecuta con parámetros preparados.
 */
exports.ejecutarMiWidget = async (req, res) => {
    const parametros = {
        ...(req.body?.params_sql || {}),
        ...(req.body?.params || {})
    };
    try {
        const resultado = await widgetsCustom.ejecutarWidget(req.params.id, parametros);
        res.json({ ok: true, data: resultado });
    } catch (err) {
        const status = /no encontrado/i.test(err.message) ? 404 : 200;
        res.status(status).json({ ok: false, error: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETADO DE ESQUEMA
// ─────────────────────────────────────────────────────────────────────────────

/** Carga catálogo técnico + semántico de un sistema desde archivo de cache */
function _leerCacheEsquema(sistema) {
    const s = sistema.toUpperCase();
    const catPath = path.join(__dirname, '../../diccionario', `catalogo_tecnico_${s}.json`);
    const semPath = path.join(__dirname, '../../diccionario', `semantica_${s}.json`);
    const cat = JSON.parse(fs.readFileSync(catPath, 'utf8'));
    let sem = null;
    try { sem = JSON.parse(fs.readFileSync(semPath, 'utf8')); } catch (_) { /* opcional */ }
    return { cat, sem };
}

/**
 * GET /api/widget-studio/tablas/:sistema
 * Devuelve todas las tablas con sus campos.
 * Intenta Firebird en vivo; si falla usa el diccionario en caché.
 */
exports.getTablasSistema = async (req, res) => {
    const sistema = (req.params.sistema || 'SAE').toUpperCase();
    let origen = 'live';
    let tablasRaw = [], camposRaw = [];

    // ── 1. Intentar Firebird en vivo ────────────────────────
    try {
        [tablasRaw, camposRaw] = await Promise.all([
            leerTablas(sistema),
            leerCampos(sistema)
        ]);
    } catch (_) {
        origen = 'cache';
    }

    // ── 2. Enriquecer con semántica ─────────────────────────
    let sem = null;
    try {
        const { sem: s } = _leerCacheEsquema(sistema);
        sem = s;
    } catch (_) { /* sin semántica */ }

    let tablas;

    if (origen === 'live') {
        // Agrupar campos por tabla
        const camposPorTabla = {};
        for (const c of camposRaw) {
            (camposPorTabla[c.tabla] = camposPorTabla[c.tabla] || []).push(c);
        }

        tablas = tablasRaw.map(t => {
            const semT = sem?.tablas?.[t.tabla] || {};
            const campos = (camposPorTabla[t.tabla] || []).map(c => {
                const semC = semT.campos?.[c.campo] || {};
                return {
                    nombre: c.campo,
                    tipo: c.tipo,
                    descripcion: semC.descripcion || null,
                    tipo_semantico: semC.tipo_semantico || null,
                    posicion: c.posicion
                };
            });
            return {
                nombre: t.tabla,
                descripcion: semT.descripcion || null,
                modulo: semT.modulo || null,
                campos
            };
        });
    } else {
        // Fallback: usar catálogo en caché
        try {
            const { cat } = _leerCacheEsquema(sistema);
            const tablasObj = cat.tablas || {};
            tablas = Object.values(tablasObj).map(t => {
                const semT = sem?.tablas?.[t.nombre] || {};
                return {
                    nombre: t.nombre,
                    descripcion: semT.descripcion || t.descripcion || null,
                    modulo: semT.modulo || null,
                    campos: (t.campos || []).map(c => {
                        const semC = semT.campos?.[c.nombre] || {};
                        return {
                            nombre: c.nombre,
                            tipo: c.tipo_detalle || c.tipo_base || null,
                            descripcion: semC.descripcion || null,
                            tipo_semantico: semC.tipo_semantico || null,
                            posicion: c.posicion ?? 0
                        };
                    })
                };
            });
        } catch (cacheErr) {
            return res.status(503).json({
                ok: false,
                error: `Firebird no disponible y no hay caché para ${sistema}: ${cacheErr.message}`
            });
        }
    }

    return res.json({ ok: true, sistema, origen, total: tablas.length, tablas });
};

/**
 * GET /api/widget-studio/tabla/:sistema/:nombre/campos
 * Devuelve los campos de una tabla específica con tipos y descripción semántica.
 * Intenta Firebird en vivo; si falla usa el diccionario en caché.
 */
exports.getCamposTablaSistema = async (req, res) => {
    const sistema = (req.params.sistema || 'SAE').toUpperCase();
    const nombre = (req.params.nombre || '').toUpperCase();
    if (!nombre) return res.status(400).json({ ok: false, error: 'Nombre de tabla requerido' });

    let origen = 'live';
    let campos = [];

    // ── Intentar Firebird en vivo ───────────────────────────
    try {
        const rows = await leerCampos(sistema, nombre);
        if (!rows.length) throw new Error('sin_filas');
        campos = rows.map(c => ({ nombre: c.campo, tipo_tecnico: c.tipo, posicion: c.posicion, tipo_semantico: null, descripcion: null }));
    } catch (_) {
        origen = 'cache';
    }

    // ── Si falla, usar caché ────────────────────────────────
    if (origen === 'cache') {
        try {
            const { cat } = _leerCacheEsquema(sistema);
            const tbl = (cat.tablas || {})[nombre];
            if (!tbl) {
                // Sugerir tablas similares
                const prefix = nombre.slice(0, 4);
                const similares = Object.keys(cat.tablas || {})
                    .filter(k => k.startsWith(prefix))
                    .slice(0, 5);
                return res.status(404).json({
                    ok: false,
                    error: `Tabla ${nombre} no existe en ${sistema}`,
                    tablas_similares: similares
                });
            }
            campos = (tbl.campos || []).map(c => ({
                nombre: c.nombre,
                tipo_tecnico: c.tipo_detalle || c.tipo_base || null,
                tipo_semantico: null,
                descripcion: null,
                posicion: c.posicion ?? 0
            }));
        } catch (e) {
            return res.status(503).json({ ok: false, error: `Sin datos de esquema para ${sistema}: ${e.message}` });
        }
    }

    // ── Enriquecer con semántica ────────────────────────────
    try {
        const { sem: s } = _leerCacheEsquema(sistema);
        const semT = s?.tablas?.[nombre]?.campos || {};
        campos = campos.map(c => {
            const semC = semT[c.nombre] || {};
            return { ...c, tipo_semantico: semC.tipo_semantico || c.tipo_semantico, descripcion: semC.descripcion || c.descripcion };
        });
    } catch (_) { /* semántica opcional */ }

    return res.json({ ok: true, sistema, tabla: nombre, origen, campos });
};

/**
 * POST /api/widget-studio/preview-sql
 * Ejecuta las primeras 5 filas del SQL proporcionado.
 * En caso de tabla no encontrada, sugiere tablas similares del catálogo.
 */
exports.previewSQLEstudio = async (req, res) => {
    const { sql, sistema } = req.body;
    const sistemaFinal = (sistema || 'SAE').toUpperCase();
    const t0 = Date.now();

    // Limitar a FIRST 5 para preview (reemplaza FIRST N existente o lo agrega)
    const sqlConFirst = sql.trim().replace(
        /^(\s*SELECT\s+)(FIRST\s+\d+\s+)?/i,
        (_, sel) => `${sel}FIRST 5 `
    );

    try {
        const filas = await ejecutarConsulta(sistemaFinal, sqlConFirst);
        const filasNorm = (filas || []).map(fila => {
            const norm = {};
            for (const [k, v] of Object.entries(fila)) norm[k.toLowerCase()] = v;
            return norm;
        });

        const columnas_detectadas = Object.keys(filasNorm[0] || {}).map(nombre => {
            const val = filasNorm[0]?.[nombre];
            const tipo = (val instanceof Date) ? 'fecha'
                : (typeof val === 'number') ? 'numero'
                    : 'texto';
            return { nombre, tipo };
        });

        return res.json({
            ok: true,
            columnas_detectadas,
            filas_muestra: filasNorm,
            tiempo_ms: Date.now() - t0,
            origen: 'live'
        });
    } catch (err) {
        const msg = err.message || '';

        // Detectar "Table unknown NOMBRE" típico de Firebird
        const matchTabla = msg.match(/Table unknown\s+([A-Z0-9_$]+)/i)
            || msg.match(/Dynamic SQL Error.*?\b([A-Z][A-Z0-9_$]{2,})\b.*not found/i);

        if (matchTabla) {
            const tablaDesconocida = matchTabla[1].toUpperCase();
            let similares = [];
            try {
                const { cat } = _leerCacheEsquema(sistemaFinal);
                const allTablas = Object.keys(cat.tablas || {});
                const prefix = tablaDesconocida.slice(0, 4);
                similares = allTablas
                    .filter(t => t.startsWith(prefix) || t.includes(prefix))
                    .slice(0, 5);
            } catch (_) { /* catálogo no disponible */ }

            return res.status(400).json({
                ok: false,
                error: `La tabla ${tablaDesconocida} no existe en ${sistemaFinal}.${similares.length ? ` Tablas similares: ${similares.join(', ')}` : ''}`,
                tabla_desconocida: tablaDesconocida,
                tablas_similares: similares,
                origen: 'live'
            });
        }

        return res.status(400).json({ ok: false, error: msg, origen: 'live' });
    }
};
