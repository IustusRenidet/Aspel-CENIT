const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');

const DIR_OVERRIDES = path.join(__dirname, '../overrides');
const DIR_DICCIONARIO = path.join(__dirname, '../diccionario');

const PATRONES_SAE = {
    CLIE: 'Catalogo de clientes y prospectos',
    VEND: 'Catalogo de vendedores',
    FACT: 'Facturas de venta',
    NOTA: 'Notas de credito',
    PEDI: 'Pedidos de clientes',
    COTI: 'Cotizaciones',
    REMI: 'Remisiones',
    PROV: 'Catalogo de proveedores',
    COMP: 'Compras y ordenes de compra',
    ACOMP: 'Acumulados de compras',
    INVE: 'Catalogo de articulos/productos',
    MINVE: 'Movimientos de inventario',
    EXIST: 'Existencias por almacen',
    ALMA: 'Catalogo de almacenes',
    LINE: 'Lineas de productos',
    UBIC: 'Ubicaciones en almacen',
    CUEN: 'Cuentas por cobrar',
    PAGA: 'Pagos y aplicaciones',
    SALDO: 'Saldos de cuentas',
    PARAM: 'Parametros de configuracion',
    EMPRE: 'Datos de la empresa',
    CONFI: 'Configuracion del sistema'
};

const PATRONES_COI = {
    POLI: 'Polizas contables',
    POLID: 'Detalle de movimientos de poliza',
    CTACON: 'Catalogo de cuentas contables',
    AUXILIAR: 'Auxiliares contables por mes',
    SALDOS: 'Saldos contables',
    CTABAN: 'Cuentas bancarias',
    CHEQUES: 'Cheques emitidos',
    ACTIVOS: 'Catalogo de activos fijos',
    DEPREC: 'Depreciacion de activos',
    CENTRO: 'Centros de costos',
    PRESUP: 'Presupuestos',
    CCOSTO: 'Centros de costo'
};

const PATRONES_NOI = {
    TRAB: 'Catalogo de trabajadores/empleados',
    EMPL: 'Catalogo de empleados',
    NWNOM: 'Nominas procesadas',
    NOMIN: 'Calculos de nomina',
    PERCE: 'Percepciones (ingresos)',
    DEDUC: 'Deducciones (descuentos)',
    INCID: 'Incidencias (faltas, retardos)',
    DEPTO: 'Departamentos',
    PUEST: 'Puestos de trabajo',
    TURNO: 'Turnos laborales',
    HORARIO: 'Horarios de trabajo',
    ASIST: 'Asistencias',
    FALT: 'Faltas',
    VACA: 'Vacaciones',
    AGUINA: 'Aguinaldos',
    FINIQ: 'Finiquitos',
    LIQUID: 'Liquidaciones',
    IMSS: 'Informacion IMSS',
    ISR: 'Calculos de ISR',
    FONACOT: 'Creditos FONACOT',
    INFONA: 'Creditos INFONAVIT',
    AC: 'Acumulados de nomina',
    CA: 'Calculos auxiliares de nomina',
    SALARIO: 'Informacion salarial',
    CUOTA: 'Cuotas patronales',
    TIMBRE: 'Timbrado de recibos',
    CFDI: 'CFDI de nomina'
};

const PATRONES_BANCO = {
    CTAS: 'Catalogo de cuentas bancarias',
    MOVS: 'Movimientos bancarios',
    MOVAUX: 'Movimientos auxiliares/temporales',
    CHQ: 'Cheques',
    CHEQ: 'Cheques emitidos',
    BENEF: 'Beneficiarios de pagos',
    CONC: 'Conciliacion bancaria',
    CTECONC: 'Control de conciliacion bancaria',
    TRANS: 'Transferencias bancarias',
    DEPOS: 'Depositos bancarios',
    RETIRO: 'Retiros de efectivo',
    SALDO: 'Saldos bancarios',
    ESTADO: 'Estados de cuenta',
    COMIS: 'Comisiones bancarias',
    COMD: 'Comisiones y cargos diversos',
    INTERE: 'Intereses bancarios',
    CONTROL: 'Parametros de control del sistema',
    CONTROLREGMOV: 'Control de registro de movimientos',
    HISTOR: 'Historico de operaciones',
    MONEDA: 'Catalogo de monedas',
    FORMPAGO: 'Formas de pago disponibles'
};

const SUFIJOS = {
    _CLIB: 'Campos libres personalizables',
    _D: 'Detalle/lineas del documento',
    _H: 'Encabezado del documento',
    _PAR: 'Partidas/lineas de movimiento',
    '01-12': 'Informacion del mes'
};

function inferirDescripcion(nombreTabla, sistema, camposTecnicos = []) {
    const tablaUpper = nombreTabla.toUpperCase();

    let patrones;
    switch (sistema) {
        case 'SAE':
            patrones = PATRONES_SAE;
            break;
        case 'COI':
            patrones = PATRONES_COI;
            break;
        case 'NOI':
            patrones = PATRONES_NOI;
            break;
        case 'BANCO':
            patrones = PATRONES_BANCO;
            break;
        default:
            return null;
    }

    const patronesOrdenados = Object.entries(patrones).sort((a, b) => b[0].length - a[0].length);

    for (const [patron, descripcion] of patronesOrdenados) {
        if (tablaUpper.includes(patron)) {
            const matchMes = tablaUpper.match(/(\d{2})$/);
            if (matchMes) {
                const mes = parseInt(matchMes[1], 10);
                const meses = [
                    '',
                    'enero',
                    'febrero',
                    'marzo',
                    'abril',
                    'mayo',
                    'junio',
                    'julio',
                    'agosto',
                    'septiembre',
                    'octubre',
                    'noviembre',
                    'diciembre'
                ];
                if (mes >= 1 && mes <= 12) {
                    return `${descripcion} - Mes de ${meses[mes]}`;
                }
            }

            if (tablaUpper.endsWith('_CLIB')) return `${descripcion} - ${SUFIJOS._CLIB}`;
            if (tablaUpper.endsWith('_D')) return `${descripcion} - ${SUFIJOS._D}`;
            if (tablaUpper.endsWith('_H')) return `${descripcion} - ${SUFIJOS._H}`;

            return descripcion;
        }
    }

    if (camposTecnicos && camposTecnicos.length > 0) {
        const nombresCampos = camposTecnicos.map(c => (c.nombre || '').toUpperCase());

        if (nombresCampos.some(n => n.includes('SALDO') || n.includes('MONTO'))) {
            if (nombresCampos.some(n => n.includes('FECHA'))) {
                return `Movimientos y transacciones (${sistema.toLowerCase()})`;
            }
            return `Control de saldos (${sistema.toLowerCase()})`;
        }

        if (nombresCampos.some(n => n.includes('NOMBRE') || n.includes('DESCRIPCION'))) {
            return `Catalogo maestro (${sistema.toLowerCase()})`;
        }

        if (nombresCampos.some(n => n.includes('FOLIO') || n.includes('DOCTO'))) {
            return `Documentos y folios (${sistema.toLowerCase()})`;
        }
    }

    const contexto = {
        SAE: 'administracion empresarial',
        COI: 'contabilidad',
        NOI: 'nomina',
        BANCO: 'operaciones bancarias'
    };

    return `Registro de ${contexto[sistema]} - ${nombreTabla}`;
}

function inferirModulo(nombreTabla, sistema) {
    const tablaUpper = nombreTabla.toUpperCase();

    if (sistema === 'SAE') {
        if (tablaUpper.includes('CLIE') || tablaUpper.includes('FACT') || tablaUpper.includes('VEND')) return 'Ventas';
        if (tablaUpper.includes('COMP') || tablaUpper.includes('PROV')) return 'Compras';
        if (tablaUpper.includes('INVE') || tablaUpper.includes('ALMA') || tablaUpper.includes('EXIST')) return 'Inventarios';
        if (tablaUpper.includes('CUEN') || tablaUpper.includes('PAGA')) return 'Cuentas por Cobrar';
        return 'General';
    }

    if (sistema === 'COI') {
        if (tablaUpper.includes('POLI')) return 'Polizas';
        if (tablaUpper.includes('CTACON') || tablaUpper.includes('SALDO')) return 'Contabilidad';
        if (tablaUpper.includes('ACTIVO')) return 'Activos Fijos';
        if (tablaUpper.includes('BANCO') || tablaUpper.includes('CHE')) return 'Bancos';
        return 'Contabilidad';
    }

    if (sistema === 'NOI') {
        if (tablaUpper.includes('TRAB') || tablaUpper.includes('EMPL')) return 'Empleados';
        if (tablaUpper.includes('NOM') || tablaUpper.includes('CALC')) return 'Nomina';
        if (tablaUpper.includes('PERC') || tablaUpper.includes('DEDU')) return 'Percepciones y Deducciones';
        if (tablaUpper.includes('INCID') || tablaUpper.includes('ASIST') || tablaUpper.includes('FALT')) return 'Incidencias';
        if (tablaUpper.includes('DEPTO') || tablaUpper.includes('PUEST')) return 'Organizacion';
        return 'Nomina';
    }

    if (sistema === 'BANCO') {
        if (tablaUpper.includes('CTA')) return 'Cuentas';
        if (tablaUpper.includes('MOV')) return 'Movimientos';
        if (tablaUpper.includes('CHE') || tablaUpper.includes('CHQ')) return 'Cheques';
        if (tablaUpper.includes('CONC')) return 'Conciliacion';
        if (tablaUpper.includes('BENEF')) return 'Beneficiarios';
        if (tablaUpper.includes('CONTROL')) return 'Configuracion';
        return 'General';
    }

    return 'General';
}

function inferirTags(nombreTabla, modulo) {
    const tags = [modulo.toLowerCase()];
    const tablaUpper = nombreTabla.toUpperCase();

    if (tablaUpper.match(/\d{2}$/)) tags.push('temporal');
    if (tablaUpper.includes('_CLIB')) tags.push('campos-libres');
    if (tablaUpper.includes('_D')) tags.push('detalle');
    if (tablaUpper.includes('HIST')) tags.push('historico');
    if (tablaUpper.includes('PARAM') || tablaUpper.includes('CONFIG') || tablaUpper.includes('CONTROL')) {
        tags.push('configuracion');
    }

    return tags;
}

function esDescripcionGenerica(descripcion, nombreTabla) {
    if (!descripcion) return true;
    const texto = descripcion.toLowerCase();
    const tablaLower = (nombreTabla || '').toLowerCase();

    if (texto.includes('tabla de sistema')) return true;
    if (texto.includes('tabla de operaciones')) return true;
    if (texto.includes('tabla de nomina')) return true;
    if (texto.includes('registro de')) return true;
    if (tablaLower && texto === tablaLower) return true;

    return false;
}

async function enriquecerOverrides(sistema) {
    console.log(`\n=== Enriqueciendo ${sistema} ===`);

    const pathOverride = path.join(DIR_OVERRIDES, `${sistema}.yaml`);
    const pathTecnico = path.join(DIR_DICCIONARIO, `catalogo_tecnico_${sistema}.json`);

    if (!fs.existsSync(pathOverride)) {
        console.warn(`No existe: ${pathOverride}`);
        return;
    }

    const yamlContent = await fs.readFile(pathOverride, 'utf8');
    const overrides = yaml.load(yamlContent) || {};
    if (!overrides.tablas) overrides.tablas = {};

    let tecnico = {};
    if (fs.existsSync(pathTecnico)) {
        tecnico = await fs.readJson(pathTecnico);
    }

    const tablasTecnicas = tecnico.tablas || {};
    let mejoradas = 0;

    for (const nombreTabla of Object.keys(tablasTecnicas)) {
        const actual = overrides.tablas[nombreTabla];
        const descripcionActual = actual?.descripcion || '';
        const infoTecnica = tablasTecnicas[nombreTabla];
        const campos = infoTecnica?.campos || [];

        if (esDescripcionGenerica(descripcionActual, nombreTabla) || !actual) {
            const nuevaDescripcion = inferirDescripcion(nombreTabla, sistema, campos);
            const nuevoModulo = inferirModulo(nombreTabla, sistema);
            const nuevosTags = inferirTags(nombreTabla, nuevoModulo);

            overrides.tablas[nombreTabla] = {
                descripcion: nuevaDescripcion,
                modulo: nuevoModulo,
                tipo_negocio: actual?.tipo_negocio || 'Desconocido',
                tags: nuevosTags
            };

            mejoradas++;
        }
    }

    const yamlOut = yaml.dump(overrides, { indent: 2, lineWidth: -1 });
    await fs.writeFile(pathOverride, yamlOut, 'utf8');

    console.log(`V ${mejoradas} tablas mejoradas`);
}

async function main() {
    console.log('Enriquecimiento de descripciones - Version mejorada\n');

    for (const sistema of ['SAE', 'COI', 'NOI', 'BANCO']) {
        await enriquecerOverrides(sistema);
    }

    console.log('\n? Completado. Ejecuta generar_diccionario_mejorado.js');
}

main().catch(console.error);
