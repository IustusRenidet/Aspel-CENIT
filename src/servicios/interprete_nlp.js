'use strict';

/**
 * Intérprete de Lenguaje Natural para Aspel CENIT
 * ─────────────────────────────────────────────────
 * Transforma una descripción en español de negocios en una
 * configuración completa de widget (template + parámetros + columnas + viz).
 *
 * Sin LLM externo — inteligencia integrada con conocimiento total del esquema Aspel.
 */

// ═══════════════════════════════════════════════════════════
//  DICCIONARIOS DE CONOCIMIENTO
// ═══════════════════════════════════════════════════════════

const MESES = {
    enero: 1, ene: 1, jan: 1,
    febrero: 2, feb: 2,
    marzo: 3, mar: 3,
    abril: 4, abr: 4, apr: 4,
    mayo: 5, may: 5,
    junio: 6, jun: 6,
    julio: 7, jul: 7,
    agosto: 8, ago: 8, aug: 8,
    septiembre: 9, sep: 9, sept: 9,
    octubre: 10, oct: 10,
    noviembre: 11, nov: 11,
    diciembre: 12, dic: 12
};

// Puntajes de intención → template (mayor puntaje gana)
const REGLAS_TEMPLATE = [
    {
        id: 'coi_estado_resultados',
        sistema: 'COI',
        pesos: {
            'estado de resultado': 100, 'estado resultado': 100,
            'pyg': 90, 'p&g': 90,
            'resultados': 60, 'perdidas y ganancias': 80,
            'perdidas ganancias': 80, 'utilidades': 50,
            'ingresos vs': 55, 'gastos vs': 55,
            'presupuesto vs': 55, 'real vs presupuesto': 80,
            'vs presupuesto': 70, 'comparativo presupuesto': 75,
            'cuentas de resultado': 70, 'cuentas resultado': 70,
            'variacion presupuesto': 70, 'variacion ppto': 70,
            'cumplimiento': 50, 'avance': 40,
            'contabilidad coi': 30, 'coi': 20,
            'contabilidad': 15, 'mayor': 15,
        }
    },
    {
        id: 'coi_cuentas_saldos',
        sistema: 'COI',
        pesos: {
            'cuentas mayor': 80, 'saldos cuentas': 80,
            'catalogo cuentas': 70, 'catálogo cuentas': 70,
            'balance cuentas': 65, 'cuentas contables': 60,
            'saldo cuentas': 70, 'lista cuentas': 60,
            'saldo acumulado': 50, 'cuentas de mayor': 80,
            'primer nivel': 50, 'nivel 1': 40,
            'mayor contable': 65, 'libro mayor': 70,
        }
    },
    {
        id: 'coi_polizas_periodo',
        sistema: 'COI',
        pesos: {
            'poliza': 90, 'póliza': 90,
            'polizas': 90, 'pólizas': 90,
            'asientos': 70, 'asiento contable': 80,
            'registro contable': 60, 'diario contable': 60,
            'movimientos contables': 60,
        }
    },
    {
        id: 'coi_auxiliar_cuenta',
        sistema: 'COI',
        pesos: {
            'auxiliar': 90, 'detalle cuenta': 85,
            'movimientos cuenta': 90, 'movimiento cuenta': 90,
            'historial cuenta': 80, 'cuenta especifica': 75,
            'cuenta especìfica': 75,
        }
    },
    {
        id: 'sae_ventas_detalle',
        sistema: 'SAE',
        pesos: {
            'ventas': 80, 'venta': 60,
            'facturas': 80, 'factura': 60,
            'facturacion': 75, 'facturación': 75,
            'sae': 30, 'clientes ventas': 70,
            'reporte venta': 75, 'reporte ventas': 80,
            'detalle ventas': 90, 'desglose ventas': 80,
            'ingresos ventas': 60, 'ticket': 40,
            'cobro': 30, 'cobros': 30,
        }
    },
];

// Columnas por template ← palabras clave que las activan
const COLUMNAS_KEYWORDS = {
    // — coi_estado_resultados & coi_cuentas_saldos ——
    num_cta: [
        'numero de cuenta', 'número de cuenta', 'clave cuenta', 'no cuenta',
        'número cuenta', 'numero cuenta', 'id cuenta', 'nro cuenta',
        'cuenta contable', 'codigo cuenta', 'código cuenta'
    ],
    nombre: [
        'nombre', 'nombre de la cuenta', 'descripcion cuenta',
        'descripción cuenta', 'etiqueta', 'concepto cuenta'
    ],
    nivel: ['nivel', 'profundidad', 'jerarquia', 'jerarquía'],
    naturaleza: ['naturaleza', 'deudora', 'acreedora', 'tipo naturaleza'],
    cargo_mes: ['cargos', 'cargo del mes', 'debe', 'débitos del mes', 'debitos mes'],
    abono_mes: ['abonos', 'abono del mes', 'haber', 'créditos del mes', 'creditos mes'],
    saldo_mes: [
        'saldo del mes', 'saldo mensual', 'saldo mes', 'saldo actual', 'saldo corriente',
        'saldo', 'movimiento mes', 'neto mes', 'real mes'
    ],
    saldo_acumulado: [
        'acumulado', 'saldo acumulado', 'ytd', 'año completo', 'anual', 'acumulado año',
        'acumulado anual', 'total año', 'total anual', 'balance acumulado'
    ],
    presup_mes: [
        'presupuesto', 'ppto', 'presupuesto del mes', 'presupuesto mensual',
        'meta mes', 'objetivo mes', 'target mes'
    ],
    presup_acumulado: [
        'presupuesto acumulado', 'ppto acumulado', 'presupuesto anual', 'meta anual',
        'objetivo anual', 'presupuesto año', 'target anual'
    ],
    variacion_mes: [
        'variacion', 'variación', 'diferencia', 'desvio', 'desvío', 'brecha',
        'diferencia vs', 'diferencia presupuesto', 'variacion mes'
    ],
    pct_cumplimiento: [
        'porcentaje', '%', 'pct', 'cumplimiento', 'avance', 'logro',
        'eficiencia', 'cumplimiento presupuesto', '% cumplimiento', 'porcentaje cumplimiento'
    ],

    // — coi_cuentas_saldos extras ——
    tipo: ['tipo cuenta', 'tipo de cuenta'],
    saldo_inicial: ['saldo inicial', 'inicio', 'balance inicial', 'al inicio'],
    cta_papa: ['cuenta padre', 'cuenta papa', 'cta padre'],
    cta_raiz: ['cuenta raiz', 'cuenta raíz', 'raiz'],
    codagrup: ['codigo agrupacion', 'código agrupación', 'agrupacion', 'agrupación'],

    // — coi_polizas_periodo ——
    tipo_poliza: ['tipo poliza', 'tipo de póliza', 'tipo de poliza', 'clase poliza'],
    num_poliz: ['numero poliza', 'número póliza', 'numero de poliza', 'folio poliza'],
    fecha: ['fecha', 'date', 'dia', 'día'],
    concepto: ['concepto', 'descripcion', 'descripción', 'glosa'],
    usuario: ['usuario', 'capturador', 'quien'],
    autorizacion: ['autorizacion', 'autorización'],

    // — coi_auxiliar_cuenta ——
    num_cta_aux: ['cuenta', 'numero de cuenta'],
    tipo_poli: ['tipo poliza', 'clase poliza'],
    num_poliz_aux: ['numero poliza', 'folio poliza'],
    fecha_pol: ['fecha'],
    concep_po: ['concepto', 'descripcion', 'descripción'],
    debe_haber: ['cargo abono', 'debe haber', 'dh', 'ch'],
    montomov: ['importe', 'monto', 'valor', 'cantidad'],
    periodo: ['periodo', 'período'],

    // — sae_ventas_detalle ——
    folio: ['folio', 'numero factura', 'número factura', 'nro factura', 'id factura'],
    cliente: ['clave cliente', 'codigo cliente', 'código cliente'],
    nombre_cli: ['nombre cliente', 'nombre del cliente', 'razon social', 'razón social', 'cliente nombre'],
    vendedor: ['vendedor', 'asesor', 'agente ventas'],
    subtotal: ['subtotal', 'sub total'],
    descuento: ['descuento'],
    iva: ['iva', 'impuesto', 'tax'],
    total: ['total', 'importe total', 'monto total', 'valor total'],
    costo: ['costo', 'costo de venta', 'costo mercancia', 'cmv'],
    utilidad: ['utilidad', 'ganancia', 'utilidad bruta', 'margen bruto', 'beneficio'],
    margen: ['margen', '% margen', 'porcentaje margen', 'margen porcentaje', 'margen pct'],
    status: ['status', 'estatus', 'estado factura', 'cancelada', 'cancelado'],
};

// Mapeo columna clave → columnas que la complementan siempre
const COMPLEMENTOS = {
    saldo_mes: ['nombre'],
    saldo_acumulado: ['nombre'],
    variacion_mes: ['nombre', 'saldo_mes', 'presup_mes'],
    pct_cumplimiento: ['nombre', 'saldo_mes', 'presup_mes'],
    presup_mes: ['nombre', 'saldo_mes'],
    utilidad: ['nombre_cli', 'total'],
    margen: ['nombre_cli', 'total', 'utilidad'],
    montomov: ['concep_po', 'fecha_pol'],
};

// Tipo de cuenta ← palabras clave
const TIPO_CUENTA_RULES = [
    { tipo: 'activo', palabras: ['activo', 'activos', 'patrimonio activo', 'bienes'] },
    { tipo: 'pasivo', palabras: ['pasivo', 'pasivos', 'deudas', 'obligaciones', 'cuentas por pagar', 'pasivo circulante'] },
    { tipo: 'capital', palabras: ['capital', 'patrimonio', 'equity', 'capital contable', 'resultados acumulados'] },
    { tipo: 'todas', palabras: ['todas las cuentas', 'todas', 'completo', 'total', 'general', 'balance general', 'balance todos'] },
    { tipo: 'resultado', palabras: ['resultado', 'ingresos', 'gastos', 'costos', 'erogaciones', 'perdidas', 'ganancias', 'utilidad', 'pyg', 'p&g', 'ventas coi', 'cuentas resultado'] },
];

// Nivel de cuenta ← palabras clave
const NIVEL_RULES = [
    { nivel: 1, palabras: ['nivel 1', 'primer nivel', 'mayor', 'cuentas principales', 'cuentas raiz', 'nivel mayor', 'primer nivel'] },
    { nivel: 2, palabras: ['nivel 2', 'subcuenta', 'subcuentas', 'segundo nivel'] },
    { nivel: 3, palabras: ['nivel 3', 'tercer nivel'] },
    { nivel: 4, palabras: ['nivel 4', 'cuarto nivel'] },
    { nivel: 5, palabras: ['nivel 5', 'quinto nivel', 'detallado', 'todo detalle', 'auxiliar nivel'] },
];

// Visualización ← palabras clave
const VIZ_RULES = [
    { viz: 'barra', palabras: ['barras', 'barra', 'grafica barras', 'gráfica barras', 'bar chart', 'histograma', 'comparativa grafica'] },
    { viz: 'linea', palabras: ['linea', 'línea', 'tendencia', 'evolución', 'evolucion', 'tiempo', 'historico', 'histórico', 'trend'] },
    { viz: 'pastel', palabras: ['pastel', 'pie', 'torta', 'dona', 'distribucion porcentual', 'participacion'] },
    { viz: 'kpi', palabras: ['kpi', 'indicador', 'resumen', 'total', 'sumatoria', 'suma total'] },
    { viz: 'reporte', palabras: ['reporte', 'informe', 'report', 'imprimible', 'para imprimir'] },
    { viz: 'tabla', palabras: ['tabla', 'listado', 'lista', 'detalle', 'desglose', 'grid'] },
];

// ─────────────────────────────────────────────────────────────
// STEMMING ESPAÑOL SIMPLE
// raíz (4-6 letras) → variantes consideradas equivalentes
// Se usa para expandir la detección de columnas y filtros.
// ─────────────────────────────────────────────────────────────
const STEM_MAP = {
    'vent': ['ventas', 'venta', 'vendido', 'vendidos', 'vender', 'vendio', 'vendieron'],
    'compr': ['compra', 'compras', 'comprar', 'comprado', 'comprados', 'compraron'],
    'factur': ['factura', 'facturas', 'facturar', 'facturacion', 'facturado'],
    'cobr': ['cobro', 'cobros', 'cobrar', 'cobrado', 'cobranza', 'cobraron'],
    'pag': ['pago', 'pagos', 'pagar', 'pagado', 'pagaron'],
    'sald': ['saldo', 'saldos', 'saldado'],
    'utilid': ['utilidad', 'utilidades', 'utilidad bruta', 'utilidad neta'],
    'marg': ['margen', 'margenes', 'margen bruto'],
    'invent': ['inventario', 'inventarios', 'stock', 'existencia', 'existencias'],
    'proveeds': ['proveedor', 'proveedores'],
    'clien': ['cliente', 'clientes', 'clave cliente'],
    'vended': ['vendedor', 'vendedores', 'asesor', 'agente ventas'],
    'poliz': ['poliza', 'polizas', 'póliza', 'pólizas', 'asiento', 'asientos'],
    'presup': ['presupuesto', 'presupuestos', 'ppto', 'budget'],
    'vari': ['variacion', 'variación', 'variaciones', 'diferencia', 'desviacion'],
};

// Índice inverso: variante → raíz (construido en arranque)
const _STEM_INDEX = (() => {
    const idx = new Map();
    for (const [raiz, variantes] of Object.entries(STEM_MAP)) {
        for (const v of variantes) idx.set(v, raiz);
        idx.set(raiz, raiz);
    }
    return idx;
})();

/** Devuelve la raíz del término si existe en el STEM_INDEX, si no el término mismo */
function stemOf(term) {
    return _STEM_INDEX.get(term) || term;
}

/** Versión stem-aware de `contains`: verdadera si el texto contiene la frase
 *  O si algún token del texto comparte raíz con algún token de la frase */
function stemContains(texto, frase) {
    if (contains(texto, frase)) return true;
    // tokeniza frase y texto, cruza por raíz
    const fraseTokens = frase.split(/\s+/);
    const textoTokens = texto.split(/\s+/);
    const raicesFrase = new Set(fraseTokens.map(stemOf));
    return textoTokens.some(t => raicesFrase.has(stemOf(t)));
}

// ─────────────────────────────────────────────────────────────
// TÉRMINOS DE EXCLUSIÓN → códigos de estatus a filtrar
// ─────────────────────────────────────────────────────────────
const EXCLUSION_TERMS = [
    { patrones: [/\bsin\s+cancelad/, /\bexcluir\s+cancelad/, /\bexcluyendo\s+cancelad/, /\bno\s+cancelad/], codigos: ['CANCEL', 'CA'] },
    { patrones: [/\bsin\s+devoluc/, /\bexcluir\s+devoluc/, /\bexcluyendo\s+devoluc/], codigos: ['DEV', 'DEVOL', 'NC'] },
    { patrones: [/\bsin\s+notas?\s+cr/, /\bexcluir\s+notas?\s+cr/], codigos: ['NC', 'NCC'] },
    { patrones: [/\bsin\s+pendient/, /\bexcluir\s+pendient/, /\bexcluyendo\s+pendient/], codigos: ['PEND', 'P'] },
    { patrones: [/\bsolo\s+(?:las\s+)?vigentes?/, /\bnicamente\s+vigentes?/], codigos: ['CANCEL', 'CA', 'DEV'] },
    { patrones: [/\bsin\s+cerrad/, /\bexcluir\s+cerrad/, /\bexcluyendo\s+cerrad/], codigos: ['CER', 'CERR'] },
];

// ═══════════════════════════════════════════════════════════
//  FUNCIONES DE ANÁLISIS
// ═══════════════════════════════════════════════════════════

function normalizar(texto) {
    return String(texto)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // sin tildes
        .replace(/[^a-z0-9\s.%&]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function contains(texto, frase) {
    return texto.includes(frase);
}

/** Detecta el mes del texto y devuelve su número (1–12) o null */
function detectarMes(texto) {
    // Mes por nombre
    for (const [nombre, num] of Object.entries(MESES)) {
        if (contains(texto, nombre)) return num;
    }
    // "mes N" pattern
    const mN = texto.match(/\bmes\s*(\d{1,2})\b/);
    if (mN) { const n = Number(mN[1]); if (n >= 1 && n <= 12) return n; }
    // "periodo N" pattern
    const pN = texto.match(/\bperiodo\s*(\d{1,2})\b/);
    if (pN) { const n = Number(pN[1]); if (n >= 1 && n <= 12) return n; }
    return null;
}

/** Detecta el año del texto */
function detectarAno(texto) {
    const hoy = new Date();
    if (contains(texto, 'año pasado') || contains(texto, 'anio pasado') ||
        contains(texto, 'ejercicio pasado') || contains(texto, 'año anterior') ||
        contains(texto, 'anterior')) {
        return hoy.getFullYear() - 1;
    }
    if (contains(texto, 'este año') || contains(texto, 'año actual') ||
        contains(texto, 'ejercicio actual') || contains(texto, 'año en curso') ||
        contains(texto, 'ejercicio en curso')) {
        return hoy.getFullYear();
    }
    const yrMatch = texto.match(/\b(20\d{2})\b/);
    if (yrMatch) return Number(yrMatch[1]);
    return hoy.getFullYear();
}

/** Detecta la cuenta COI específica mencionada */
function detectarCuenta(texto) {
    // "cuenta 4", "cuenta 501", "cuenta 401.01", "cuentas del 4", "las 4000", etc.
    const m = texto.match(/\bcuenta[s]?\s+(?:del?\s+)?([0-9]{1,8}(?:\.[0-9]+)*)\b/);
    if (m) return m[1];
    // Prefijo numérico standalone como "401", "5", "60" rodeado de espacios
    const n = texto.match(/\bcuentas?\s+(\d{1,3})\b/);
    if (n) return n[1];
    return '';
}

/** Detecta el rango de fechas para SAE (devuelve {ini, fin} en YYYY-MM-DD) */
function detectarFechas(texto, mes, ano) {
    const hoy = new Date();
    const mesObj = new Date(ano, (mes || hoy.getMonth() + 1) - 1, 1);
    const finMes = new Date(ano, (mes || hoy.getMonth() + 1), 0);

    // "semana pasada", "semana anterior"
    if (contains(texto, 'semana pasada') || contains(texto, 'semana anterior')) {
        const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - hoy.getDay() - 6);
        const dom = new Date(lunes); dom.setDate(lunes.getDate() + 6);
        return { ini: lunes.toISOString().slice(0, 10), fin: dom.toISOString().slice(0, 10) };
    }
    // "hoy"
    if (contains(texto, 'hoy') || contains(texto, 'dia de hoy')) {
        const h = hoy.toISOString().slice(0, 10);
        return { ini: h, fin: h };
    }
    // "ayer"
    if (contains(texto, 'ayer')) {
        const ay = new Date(hoy); ay.setDate(hoy.getDate() - 1);
        const a = ay.toISOString().slice(0, 10);
        return { ini: a, fin: a };
    }
    // "ultimos N dias" / "últimos N días"
    const ud = texto.match(/\bultimos?\s+(\d+)\s+dias?\b/);
    if (ud) {
        const fin = hoy.toISOString().slice(0, 10);
        const ini = new Date(hoy); ini.setDate(hoy.getDate() - Number(ud[1]));
        return { ini: ini.toISOString().slice(0, 10), fin };
    }
    // "este mes" / "mes actual"
    if (contains(texto, 'este mes') || contains(texto, 'mes actual') || contains(texto, 'mes en curso')) {
        return { ini: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`, fin: hoy.toISOString().slice(0, 10) };
    }
    // Por mes y año detectados
    return {
        ini: `${mesObj.getFullYear()}-${String(mesObj.getMonth() + 1).padStart(2, '0')}-01`,
        fin: finMes.toISOString().slice(0, 10)
    };
}

/** Analiza qué dimensiones faltan para producir diagnóstico de baja confianza */
function _diagnosticarFallos(texto, mejorPuntaje) {
    const sugs = [];
    // ¿Se mencionó algún sistema?
    const tieneSistema =
        /\b(sae|coi|noi|banco)\b/.test(texto) ||
        ['ventas', 'facturas', 'poliza', 'polizas', 'auxiliar', 'balanza',
            'nomina', 'nominas', 'cheque', 'estado de resultado'].some(p => texto.includes(p));
    if (!tieneSistema)
        sugs.push('No detecté sistema (SAE/COI/NOI/BANCO) — menciona el sistema o el módulo (ej. "ventas SAE", "contabilidad COI")');

    // ¿Se mencionó algún periodo?
    const tienePeriodo =
        /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\bmes\b|periodo|trimestre|anio|ano|20\d{2}|este mes|mes actual|hoy|ayer)\b/.test(texto);
    if (!tienePeriodo)
        sugs.push('No detecté periodo de tiempo — menciona mes, año o rango (ej. "enero 2025", "del mes 1 al 3", "últimos 30 días")');

    // ¿Se mencionó algún tipo de reporte?
    const tieneReporte =
        /\b(venta|ventas|factura|facturas|poliza|saldo|saldos|estado|balanza|auxiliar|reporte|listado|detalle|analisis|resumen|cobro|cobranza|inventario|nomina|banco)\b/.test(texto);
    if (!tieneReporte)
        sugs.push('No detecté tipo de reporte — describe qué datos necesitas (ej. "ventas", "pólizas", "cuentas por cobrar")');

    // Si el puntaje fue muy bajo también, añade pista genérica
    if (mejorPuntaje < 5)
        sugs.push('La descripción es muy corta o genérica — agrega más contexto de negocio');

    return sugs;
}

/** Puntea los templates contra el texto y siempre devuelve el mejor candidato.
 *  Incluye `sugerencias_fallo` cuando confianza < 40. */
function puntuarTemplates(texto) {
    const resultados = REGLAS_TEMPLATE.map(t => {
        let puntaje = 0;
        for (const [frase, peso] of Object.entries(t.pesos)) {
            if (contains(texto, frase)) puntaje += peso;
        }
        return { ...t, puntaje };
    }).sort((a, b) => b.puntaje - a.puntaje);

    const mejor = resultados[0];
    const confianza = Math.min(100, Math.round((mejor.puntaje / 200) * 100));

    if (mejor.puntaje < 15) {
        // Sin match mínimo: devuelve objeto especial (ok:false se maneja en interpretar)
        return {
            _sinMatch: true,
            puntaje: mejor.puntaje,
            sugerencias_fallo: _diagnosticarFallos(texto, mejor.puntaje)
        };
    }

    const resultado = { ...mejor };
    if (confianza < 40) {
        resultado.sugerencias_fallo = _diagnosticarFallos(texto, mejor.puntaje);
    }
    return resultado;
}

/** Detecta columnas pedidas explícitamente (con stemming español simple) */
function detectarColumnas(texto, templateId) {
    const template = COLUMNAS_KEYWORDS;
    const activas = new Set();

    // Detectar por keywords — usa stemContains para matchear variantes morfológicas
    for (const [colId, frases] of Object.entries(template)) {
        for (const frase of frases) {
            if (stemContains(texto, frase)) {
                activas.add(colId);
                // Añadir complementos automáticos
                const comps = COMPLEMENTOS[colId] || [];
                comps.forEach(c => activas.add(c));
                break;
            }
        }
    }

    // Si el usuario pide "todo" o "todas las columnas", devolvemos vacío (defaults del template)
    if (contains(texto, 'todo') || contains(texto, 'todas las columnas') ||
        contains(texto, 'completo') || activas.size === 0) {
        return [];  // [] = usar defaults del template
    }

    // Siempre incluir nombre si hay columnas numéricas
    const NUMERICAS = ['saldo_mes', 'saldo_acumulado', 'presup_mes', 'presup_acumulado',
        'variacion_mes', 'pct_cumplimiento', 'cargo_mes', 'abono_mes',
        'total', 'utilidad', 'margen', 'montomov'];
    const tieneNumerica = NUMERICAS.some(c => activas.has(c));
    if (tieneNumerica) activas.add('nombre');

    // Para SAE siempre nombre_cli si hay total/utilidad
    if ((activas.has('total') || activas.has('utilidad')) && templateId === 'sae_ventas_detalle') {
        activas.add('nombre_cli');
        activas.add('fecha');
    }

    return [...activas];
}

/** Detecta tipo de cuenta COI */
function detectarTipoCuenta(texto) {
    for (const rule of TIPO_CUENTA_RULES) {
        if (rule.palabras.some(p => contains(texto, p))) return rule.tipo;
    }
    return 'resultado'; // default
}

/** Detecta nivel de cuenta */
function detectarNivel(texto) {
    for (const rule of NIVEL_RULES) {
        if (rule.palabras.some(p => contains(texto, p))) return rule.nivel;
    }
    // "nivel N" genérico
    const m = texto.match(/\bnivel\s*(\d)\b/);
    if (m) { const n = Number(m[1]); if (n >= 1 && n <= 5) return n; }
    return 1; // default: mayor
}

/** Detecta tipo de visualización */
function detectarViz(texto) {
    for (const rule of VIZ_RULES) {
        if (rule.palabras.some(p => contains(texto, p))) return rule.viz;
    }
    return null; // null = el sistema lo decide
}

/** Detecta si pide canceladas (SAE) */
function detectarCanceladas(texto) {
    if (contains(texto, 'incluir canceladas') || contains(texto, 'con canceladas') ||
        contains(texto, 'incluyendo canceladas') || contains(texto, 'canceladas tambien')) {
        return 'si';
    }
    return 'no';
}

// ═══════════════════════════════════════════════════════════
//  DETECCIÓN DE FILTROS DE NEGOCIO COMPUESTOS
// ═══════════════════════════════════════════════════════════

/**
 * detectarFiltrosNegocio(texto) → filtros_adicionales[]
 *
 * Detecta cuatro clases de filtros:
 *  · umbral   → { tipo:'umbral',    campo, operador, valor }
 *  · topN     → { tipo:'top_n',     limite, orden }
 *  · rango    → { tipo:'rango_fecha', fecha_inicio, fecha_fin }
 *  · exclusion→ { tipo:'exclusion',  excluir: [] }
 */
function detectarFiltrosNegocio(texto) {
    const filtros = [];

    // ── 1. UMBRAL NUMÉRICO ───────────────────────────────────
    // Mapeo de campos de negocio reconocibles en el texto
    const CAMPOS_UMBRAL = [
        [/(saldo\s+(?:de\s+)?(?:cliente|clientes)?|saldo\s+por\s+cobrar)/, 'saldo'],
        [/total\s+(?:de\s+)?(?:venta|ventas)?/, 'total'],
        [/monto/, 'monto'],
        [/importe/, 'importe'],
        [/precio/, 'precio'],
        [/deuda/, 'deuda'],
        [/cartera/, 'cartera'],
        [/utilidad/, 'utilidad'],
        [/venta[s]?/, 'ventas'],
        [/compra[s]?/, 'compras'],
        [/factura[s]?/, 'factura'],
    ];

    const MULT_MAP = { mil: 1e3, miles: 1e3, millon: 1e6, millones: 1e6, mdp: 1e6 };

    // Operadores: símbolo + lenguaje natural
    const OP_PATS = [
        [/(?:mayor\s+(?:a|que)|mas\s+de|superior\s+a|>=|>\s*)/, '>='],
        [/(?:menor\s+(?:a|que)|menos\s+de|inferior\s+a|<=|<\s*)/, '<='],
        [/(?:igual\s+a|==?)/, '='],
    ];

    // Detecta patrón: [campo?] [operador] [número] [multiplicador?]
    // IMPORTANTE: millon(es) debe ir ANTES de mil(es) para que el alternador no engulla el prefijo
    const numRe = /([\d,.]+)\s*(millon(?:es)?|mil(?:es)?|mdp)?/g;
    let m;
    while ((m = numRe.exec(texto)) !== null) {
        let val = parseFloat(m[1].replace(/,/g, ''));
        if (!Number.isFinite(val)) continue;
        // Excluir años (1900-2199) y números de un solo dígito sin multiplicador
        if (!m[2] && ((val >= 1900 && val <= 2199) || val < 2)) continue;
        if (m[2] && MULT_MAP[m[2]]) val *= MULT_MAP[m[2]];

        // Buscar operador justo antes del número (ventana de 40 chars)
        const ventana = texto.slice(Math.max(0, m.index - 40), m.index);
        let operador = null;
        for (const [re, op] of OP_PATS) {
            if (re.test(ventana)) { operador = op; break; }
        }
        if (!operador) continue; // sin operador no es un filtro

        // Buscar campo en ventana extendida (80 chars)
        const ventanaCampo = texto.slice(Math.max(0, m.index - 80), m.index);
        let campo = 'valor';
        for (const [re, nombre] of CAMPOS_UMBRAL) {
            if (re.test(ventanaCampo)) { campo = nombre; break; }
        }

        filtros.push({ tipo: 'umbral', campo, operador, valor: val });
    }

    // ── 2. TOP N ─────────────────────────────────────────────
    // "top 10 productos", "los 5 mejores vendedores", "primeros 20"
    const topRe = /(?:top\s+(\d+)|los?\s+(\d+)\s+(?:mejores?|mayores?|principales?|primeros?)|(?:primeros?|mejores?)\s+(\d+))/g;
    while ((m = topRe.exec(texto)) !== null) {
        const n = Number(m[1] || m[2] || m[3]);
        if (n > 0 && n <= 10000) {
            // No duplicar si ya hay uno
            if (!filtros.some(f => f.tipo === 'top_n')) {
                const ordenPat = /(?:peores?|menores?|ultimos?|infracc)/;
                filtros.push({ tipo: 'top_n', limite: n, orden: ordenPat.test(texto) ? 'asc' : 'desc' });
            }
        }
    }
    // "los N menores" (bottom-N)
    const botRe = /(?:los?\s+(\d+)\s+(?:peores?|menores?|ultimos?)|(?:ultimos?|peores?)\s+(\d+))/g;
    while ((m = botRe.exec(texto)) !== null) {
        const n = Number(m[1] || m[2]);
        if (n > 0 && !filtros.some(f => f.tipo === 'top_n')) {
            filtros.push({ tipo: 'top_n', limite: n, orden: 'asc' });
        }
    }

    // ── 3. RANGO DE FECHAS ───────────────────────────────────
    // "entre enero y marzo", "de enero a marzo 2024", "del mes 1 al 3"
    const hoy = new Date();
    const anoActual = hoy.getFullYear();

    const mesKeys = Object.keys(MESES).join('|');
    const rangoNombreRe = new RegExp(
        `de(?:l)?\\s+(${mesKeys})\\s+(?:a(?:l)?|hasta|y)\\s+(${mesKeys})(?:\\s+(20\\d{2}))?` +
        `|entre\\s+(${mesKeys})\\s+y\\s+(${mesKeys})(?:\\s+(20\\d{2}))?`,
        'g'
    );
    while ((m = rangoNombreRe.exec(texto)) !== null) {
        const mesIniNom = m[1] || m[4];
        const mesFinNom = m[2] || m[5];
        const ano = Number(m[3] || m[6] || anoActual);
        const mi = MESES[mesIniNom];
        const mf = MESES[mesFinNom];
        if (mi && mf) {
            const ini = `${ano}-${String(mi).padStart(2, '0')}-01`;
            const ult = new Date(ano, mf, 0);
            const fin = ult.toISOString().slice(0, 10);
            filtros.push({ tipo: 'rango_fecha', fecha_inicio: ini, fecha_fin: fin });
        }
    }

    // "del mes N al M"
    const rangoNumRe = /del?\s+mes\s+(\d{1,2})\s+al?\s+(\d{1,2})(?:\s+(?:de\s+)?(20\d{2}))?/g;
    while ((m = rangoNumRe.exec(texto)) !== null) {
        const mi = Number(m[1]), mf = Number(m[2]);
        const ano = Number(m[3] || anoActual);
        if (mi >= 1 && mi <= 12 && mf >= 1 && mf <= 12 && !filtros.some(f => f.tipo === 'rango_fecha')) {
            const ini = `${ano}-${String(mi).padStart(2, '0')}-01`;
            const ult = new Date(ano, mf, 0);
            filtros.push({ tipo: 'rango_fecha', fecha_inicio: ini, fecha_fin: ult.toISOString().slice(0, 10) });
        }
    }

    // ── 4. EXCLUSIONES ───────────────────────────────────────
    for (const { patrones, codigos } of EXCLUSION_TERMS) {
        if (patrones.some(re => re.test(texto))) {
            const yaExiste = filtros.find(f => f.tipo === 'exclusion');
            if (yaExiste) {
                // Unir sin duplicar
                codigos.forEach(c => { if (!yaExiste.excluir.includes(c)) yaExiste.excluir.push(c); });
            } else {
                filtros.push({ tipo: 'exclusion', excluir: [...codigos] });
            }
        }
    }

    return filtros;
}

// ═══════════════════════════════════════════════════════════
//  GENERADOR DE EXPLICACIÓN AMIGABLE
// ═══════════════════════════════════════════════════════════

const NOMBRE_MES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function generarExplicacion(templateId, params, columnas, viz) {
    const decs = [];
    const t = REGLAS_TEMPLATE.find(r => r.id === templateId);

    // Sistema
    const iconSistema = { COI: '📗', SAE: '📦', NOI: '👥', BANCO: '🏦' }[t?.sistema] || '📊';
    decs.push(`${iconSistema} **Sistema ${t?.sistema}** — analizo datos contables/operativos reales`);

    // Período
    if (params.mes && params.ejercicio) {
        const mesNombre = NOMBRE_MES[params.mes] || params.mes;
        decs.push(`📅 **Período:** ${mesNombre} ${params.ejercicio}`);
    } else if (params.fecha_ini && params.fecha_fin) {
        decs.push(`📅 **Rango:** del ${params.fecha_ini} al ${params.fecha_fin}`);
    }

    // Tipo análisis
    const descTemplate = {
        coi_estado_resultados: 'Estado de Resultados — saldo real vs presupuesto con variación y % de cumplimiento',
        coi_cuentas_saldos: 'Cuentas de Mayor — saldos acumulados del ejercicio',
        coi_polizas_periodo: 'Pólizas contables del período seleccionado',
        coi_auxiliar_cuenta: 'Auxiliar de cuenta — detalle de todos los movimientos',
        sae_ventas_detalle: 'Facturas de venta con importe, utilidad y margen',
    };
    decs.push(`📊 **Análisis:** ${descTemplate[templateId] || templateId}`);

    // Nivel (COI)
    if (params.nivel) {
        const nDesc = {
            1: 'Mayor (nivel 1 — cuentas principales)', 2: 'Nivel 2 (subcuentas)',
            3: 'Nivel 3', 4: 'Nivel 4', 5: 'Nivel 5 (detalle completo)'
        };
        decs.push(`🗂 **Nivel de cuenta:** ${nDesc[params.nivel] || `Nivel ${params.nivel}`}`);
    }

    // Tipo cuenta (COI)
    if (params.tipo_cuenta) {
        const tDesc = {
            resultado: 'Cuentas de resultado (4, 5, 6, 7) — ingresos y gastos',
            activo: 'Cuentas de activo (1)',
            pasivo: 'Cuentas de pasivo (2)',
            capital: 'Cuentas de capital (3)',
            todas: 'Todas las cuentas del catálogo',
        };
        decs.push(`🎯 **Tipo:** ${tDesc[params.tipo_cuenta] || params.tipo_cuenta}`);
    }

    // Columnas
    if (columnas.length > 0) {
        const NOMBRE_COL = {
            num_cta: 'Nº Cuenta', nombre: 'Nombre', nivel: 'Nivel', naturaleza: 'Naturaleza',
            cargo_mes: 'Cargos Mes', abono_mes: 'Abonos Mes', saldo_mes: 'Saldo Mes',
            saldo_acumulado: 'Saldo Acumulado', presup_mes: 'Presupuesto Mes',
            presup_acumulado: 'Presupuesto Acumulado', variacion_mes: 'Variación',
            pct_cumplimiento: '% Cumplimiento', saldo_inicial: 'Saldo Inicial',
            tipo: 'Tipo', cta_papa: 'Cta Padre', cta_raiz: 'Cta Raíz', codagrup: 'Cód Agrup',
            folio: 'Folio', fecha: 'Fecha', cliente: 'Cliente', nombre_cli: 'Nombre Cliente',
            vendedor: 'Vendedor', subtotal: 'Subtotal', descuento: 'Descuento', iva: 'IVA',
            total: 'Total', costo: 'Costo', utilidad: 'Utilidad', margen: 'Margen %', status: 'Estatus',
            tipo_poliza: 'Tipo Póliza', num_poliz: 'Nº Póliza', concepto: 'Concepto',
            usuario: 'Usuario', autorizacion: 'Autorización', tipo_poli: 'Tipo Póliza',
            num_poliz_aux: 'Nº Póliza', fecha_pol: 'Fecha', concep_po: 'Concepto',
            debe_haber: 'D/H', montomov: 'Importe', periodo: 'Período',
        };
        const nombresLeg = columnas.map(c => NOMBRE_COL[c] || c).join(', ');
        decs.push(`📋 **Columnas:** ${nombresLeg}`);
    } else {
        decs.push(`📋 **Columnas:** configuración estándar del análisis`);
    }

    // Viz
    if (viz) {
        const vDesc = {
            tabla: 'Tabla detallada', barra: 'Gráfica de barras', linea: 'Gráfica de línea',
            pastel: 'Gráfica de pastel', kpi: 'Indicador KPI', reporte: 'Reporte imprimible'
        };
        decs.push(`👁 **Visualización:** ${vDesc[viz] || viz}`);
    }

    return decs;
}

// ═══════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL EXPORTADA
// ═══════════════════════════════════════════════════════════

/**
 * interpretar(texto) → { tipo, sistema, params, columnas, viz, interpretacion }
 * @param {string} texto - Descripción libre del usuario en español
 * @returns {{ tipo, sistema, params, columnas, viz, interpretacion, confianza, sugerencias }}
 */
function interpretar(texto) {
    const hoy = new Date();
    const norm = normalizar(texto);

    // 1. ── Detectar template ──────────────────────────────────
    const templateGanador = puntuarTemplates(norm);
    if (templateGanador._sinMatch) {
        return {
            ok: false,
            error: 'No pude identificar qué tipo de análisis necesitas. Prueba describir con más detalle.',
            sugerencias_fallo: templateGanador.sugerencias_fallo || [],
            sugerencias: [
                '📊 "Estado de resultados de COI vs presupuesto del mes de junio"',
                '💰 "Ventas de SAE del mes pasado con cliente y total"',
                '📋 "Cuentas de mayor COI con saldos acumulados"',
                '📄 "Pólizas de ingreso de enero 2025 en COI"',
                '🔍 "Auxiliar de la cuenta 401 del mes de marzo"',
            ]
        };
    }

    const tipo = templateGanador.id;
    const sistema = templateGanador.sistema;
    const confianza = Math.min(100, Math.round((templateGanador.puntaje / 200) * 100));

    // 2. ── Detectar período ───────────────────────────────────
    const mes = detectarMes(norm) || (hoy.getMonth() + 1);
    const ejercicio = detectarAno(norm);

    // 3. ── Detectar parámetros específicos por template ───────
    let params = {};
    if (sistema === 'COI') {
        const nivel = detectarNivel(norm);
        const tipo_cuenta = (tipo === 'coi_estado_resultados' || tipo === 'coi_cuentas_saldos')
            ? detectarTipoCuenta(norm) : undefined;
        const cuenta = tipo === 'coi_auxiliar_cuenta' ? detectarCuenta(norm) : undefined;

        params = {
            ejercicio,
            mes,
            nivel,
            ...(tipo_cuenta !== undefined && { tipo_cuenta }),
            ...(cuenta !== undefined && { cuenta }),
        };
    } else if (sistema === 'SAE') {
        const fechas = detectarFechas(norm, mes, ejercicio);
        const canceladas = detectarCanceladas(norm);
        params = {
            fecha_ini: fechas.ini,
            fecha_fin: fechas.fin,
            cliente: '',
            vendedor: '',
            canceladas,
        };
    }

    // 4. ── Detectar filtros de negocio compuestos ─────────────
    const filtros_adicionales = detectarFiltrosNegocio(norm);

    // 4b. Si hay un rango de fecha en filtros_adicionales y sistema es SAE,
    //     sobrescribe las fechas calculadas por detectarFechas (más fino)
    if (sistema === 'SAE') {
        const rangoFiltro = filtros_adicionales.find(f => f.tipo === 'rango_fecha');
        if (rangoFiltro) {
            params.fecha_ini = rangoFiltro.fecha_inicio;
            params.fecha_fin = rangoFiltro.fecha_fin;
        }
    }

    // 5. ── Detectar columnas ──────────────────────────────────
    const columnas = detectarColumnas(norm, tipo);

    // 6. ── Detectar viz ───────────────────────────────────────
    const viz = detectarViz(norm) || 'tabla';

    // 7. ── Generar explicación amigable ───────────────────────
    const decisiones = generarExplicacion(tipo, params, columnas, viz);

    return {
        ok: true,
        tipo,
        sistema,
        params,
        columnas,
        filtros_adicionales,
        viz,
        confianza,
        ...(templateGanador.sugerencias_fallo ? { sugerencias_fallo: templateGanador.sugerencias_fallo } : {}),
        interpretacion: {
            texto_original: texto,
            entendido: decisiones[1]?.replace(/\*\*/g, '') || tipo,
            decisiones
        },
        sugerencias_refinamiento: generarSugerenciasRefinamiento(tipo, params, columnas)
    };
}

/** Genera sugerencias de refinamiento según el contexto */
function generarSugerenciasRefinamiento(tipo, params, columnas) {
    const sugs = [];
    const mesNombre = NOMBRE_MES[params.mes] || '';
    const ano = params.ejercicio;

    if (tipo === 'coi_estado_resultados') {
        sugs.push(`"Muéstrame también el número de cuenta"`);
        sugs.push(`"Amplía a nivel 2 (subcuentas)"`);
        sugs.push(`"Cambia a ${mesNombre !== NOMBRE_MES[1] ? 'enero' : 'febrero'} ${ano}"`);
        sugs.push(`"Muéstrame solo cuentas de activo"`);
        sugs.push(`"Ponlo en gráfica de barras"`);
    } else if (tipo === 'sae_ventas_detalle') {
        sugs.push(`"Filtra solo el vendedor V001"`);
        sugs.push(`"Incluye también el IVA y el subtotal"`);
        sugs.push(`"Muéstrame en gráfica de barras"`);
        sugs.push(`"Cambia el período a todo ${ano}"`);
    } else if (tipo === 'coi_cuentas_saldos') {
        sugs.push(`"Incluye el saldo inicial también"`);
        sugs.push(`"Amplía al nivel 2"`);
        sugs.push(`"Muéstrame solo cuentas de activo"`);
    } else if (tipo === 'coi_auxiliar_cuenta') {
        sugs.push(`"Filtra solo la cuenta 401"`);
        sugs.push(`"Cambia al mes de ${mesNombre || 'enero'}"`);
        sugs.push(`"Muéstrame también el tipo de póliza"`);
    }
    return sugs.slice(0, 4);
}

module.exports = { interpretar, normalizar };
