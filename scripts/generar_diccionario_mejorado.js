const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');

const SISTEMAS = ['SAE', 'COI', 'NOI', 'BANCO'];
const DIR_DICCIONARIO = path.join(__dirname, '../diccionario');
const DIR_OVERRIDES = path.join(__dirname, '../overrides');
const DIR_YAML_OUT = path.join(__dirname, '../src/semantica/yaml/catalogo');
const DIR_DESCRIPCIONES = path.join(__dirname, '../Esquemas/cenit/descripciones');
const RUTAS_SCHEMA = {
    SAE: path.join(__dirname, '../Esquemas/sae_schema.json'),
    COI: path.join(__dirname, '../Esquemas/coi_schema.json'),
    NOI: path.join(__dirname, '../Esquemas/noi_schema.json'),
    BANCO: path.join(__dirname, '../Esquemas/banco.squema.json')
};

const PATRONES_CAMPOS = [
    { regex: /^(FECHA|FEC|F_)/i, tipo: 'fecha' },
    { regex: /^(IMPORTE|IMP|MONTO|SALDO|COSTO|PRECIO|TOTAL|SUBTOTAL|IVA|IEPS|RET)/i, tipo: 'dinero' },
    { regex: /^(CVE_|ID_|CLAVE|FOLIO|UUID|NUM_|NO_)/i, tipo: 'clave' },
    { regex: /^(STATUS|ESTATUS|SITUACION)/i, tipo: 'estatus' }
];

function inferirTipoCampo(nombreCampo) {
    for (const p of PATRONES_CAMPOS) {
        if (p.regex.test(nombreCampo)) return p.tipo;
    }
    return 'texto'; // Default
}

function esTextoNoVacio(valor) {
    return typeof valor === 'string' && valor.trim().length > 0;
}

function esDescripcionGenerica(descripcion, nombreTabla) {
    if (!esTextoNoVacio(descripcion)) return true;
    const texto = descripcion.toLowerCase();
    const tablaLower = (nombreTabla || '').toLowerCase();
    if (texto.includes('tabla de sistema')) return true;
    if (texto.includes('tabla de administr')) return true;
    if (tablaLower && texto === tablaLower) return true;
    return false;
}

function esModuloGenerico(modulo) {
    if (!esTextoNoVacio(modulo)) return true;
    return modulo.toLowerCase() === 'general';
}

function esTipoGenerico(tipo) {
    if (!esTextoNoVacio(tipo)) return true;
    return tipo.toLowerCase() === 'desconocido';
}

function inferirTipoTabla(nombreTabla, camposMap) {
    const nombreUpper = nombreTabla.toUpperCase();
    if (/(^PAR|_PAR|_D$|_DET$|DET)/.test(nombreUpper)) return 'Detalle';
    if (/^(PARAM|CONFIG|CTRL|CONTROL|RDB\$)/.test(nombreUpper)) return 'Configuracion';
    if (/^(LOG|BIT|HIST|AUDIT)/.test(nombreUpper)) return 'Bitacora';

    const campos = Object.keys(camposMap || {});
    const tieneFecha = campos.some(c => /^(FECHA|FEC|DATE|TIMESTAMP|HORA)/i.test(c));
    const tieneImporte = campos.some(c => /^(IMP|IMPORTE|MONTO|SALDO|TOTAL|SUBTOTAL|IVA|IEPS|RET|COSTO|PRECIO)/i.test(c));

    if (tieneFecha && tieneImporte) return 'Movimiento';
    if (!tieneFecha && !tieneImporte && campos.length > 0) return 'Catalogo';
    return 'Desconocido';
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
        if (tablaUpper.includes('ACTIV')) return 'Activos Fijos';
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
        return 'General';
    }

    return 'General';
}

function inferirTags(nombreTabla, modulo) {
    const tags = new Set();
    if (esTextoNoVacio(modulo)) tags.add(modulo.toLowerCase());

    const tablaUpper = nombreTabla.toUpperCase();
    if (tablaUpper.match(/\d{2}$/)) tags.add('temporal');
    if (tablaUpper.includes('_CLIB')) tags.add('campos-libres');
    if (tablaUpper.endsWith('_D')) tags.add('detalle');
    if (tablaUpper.includes('HIST')) tags.add('historico');
    if (tablaUpper.includes('PARAM') || tablaUpper.includes('CONFIG')) tags.add('configuracion');

    return Array.from(tags);
}

async function leerJsonConNaN(filePath) {
    const contenido = await fs.readFile(filePath, 'utf8');
    const fijo = contenido.replace(/:\s*NaN/g, ': null');
    return JSON.parse(fijo);
}

async function cargarDescripcionesSchema(sistema) {
    const resultado = { tablas: {}, campos: {} };
    const ruta = RUTAS_SCHEMA[sistema];
    if (!ruta || !fs.existsSync(ruta)) return resultado;

    try {
        const data = await leerJsonConNaN(ruta);
        if (!Array.isArray(data)) return resultado;

        for (const item of data) {
            if (esTextoNoVacio(item.table_description)) {
                resultado.tablas[item.table] = item.table_description;
            }

            if (Array.isArray(item.fields)) {
                for (const field of item.fields) {
                    if (esTextoNoVacio(field.description)) {
                        if (!resultado.campos[item.table]) resultado.campos[item.table] = {};
                        resultado.campos[item.table][field.name] = field.description;
                    }
                }
            }
        }
    } catch (error) {
        console.warn(`[WARN] No se pudieron cargar descripciones de schema para ${sistema}: ${error.message}`);
    }

    return resultado;
}

async function cargarDescripcionesAuto(sistema) {
    const resultado = { tablas: {}, campos: {} };
    const ruta = path.join(DIR_DESCRIPCIONES, `descripciones_${sistema}.json`);
    if (!fs.existsSync(ruta)) return resultado;

    try {
        const data = await fs.readJson(ruta);
        const tablas = data.tablas || {};

        for (const [nombreTabla, info] of Object.entries(tablas)) {
            if (esTextoNoVacio(info.descripcion)) {
                resultado.tablas[nombreTabla] = info.descripcion;
            }

            if (info.campos && typeof info.campos === 'object') {
                for (const [nombreCampo, desc] of Object.entries(info.campos)) {
                    if (esTextoNoVacio(desc)) {
                        if (!resultado.campos[nombreTabla]) resultado.campos[nombreTabla] = {};
                        resultado.campos[nombreTabla][nombreCampo] = desc;
                    }
                }
            }
        }
    } catch (error) {
        console.warn(`[WARN] No se pudieron cargar descripciones auto para ${sistema}: ${error.message}`);
    }

    return resultado;
}

function encontrarOverride(nombreTabla, overrides) {
    // 1. Busqueda exacta
    if (overrides[nombreTabla]) return overrides[nombreTabla];

    // 2. Busqueda por prefijo (Ej: CLIE01 -> CLIE)
    // Asumimos sufijo numerico de 2 digitos al final comun en Aspel
    const match = nombreTabla.match(/^([A-Z_]+)\d{2}$/);
    if (match) {
        const base = match[1];
        if (overrides[base]) return overrides[base];
    }
    return null;
}

async function procesarSistema(sistema) {
    console.log(`\nProcesando sistema: ${sistema}`);
    
    // Rutas de archivos
    const pathTecnico = path.join(DIR_DICCIONARIO, `catalogo_tecnico_${sistema}.json`);
    const pathOverrides = path.join(DIR_OVERRIDES, `${sistema}.yaml`);
    const pathSemanticaOut = path.join(DIR_DICCIONARIO, `semantica_${sistema}.json`);
    const pathYamlOut = path.join(DIR_YAML_OUT, `${sistema}.yaml`);

    // Validaciones
    if (!fs.existsSync(pathTecnico)) {
        console.warn(`[SKIP] No existe catalogo tecnico: ${pathTecnico}`);
        return;
    }

    // Cargar datos
    const tecnico = await fs.readJson(pathTecnico);
    let overrides = { tablas: {} };
    if (fs.existsSync(pathOverrides)) {
        const yamlContent = await fs.readFile(pathOverrides, 'utf8');
        overrides = yaml.load(yamlContent) || { tablas: {} };
    }
    const descSchema = await cargarDescripcionesSchema(sistema);
    const descAuto = await cargarDescripcionesAuto(sistema);

    // Estructura de salida Semántica
    const semantica = {
        sistema,
        generado_en: new Date().toISOString(),
        version: "2.0.0", // Mejorada
        tablas: {}
    };

    // Estructura de salida Runtime (YAML Simplificado)
    const runtime = {
        datasets: {}
    };

    const listaTablas = tecnico.tablas ? tecnico.tablas : tecnico;

    for (const [nombreTabla, infoTecnica] of Object.entries(listaTablas)) {
        // Ignorar tablas sistema Firebird si quieres
        if (nombreTabla.startsWith('RDB$')) continue;

        const ov = encontrarOverride(nombreTabla, overrides.tablas);

        const camposMap = {};
        const listaCamposArray = infoTecnica.campos || [];
        if (Array.isArray(listaCamposArray)) {
            listaCamposArray.forEach(c => camposMap[c.nombre] = c);
        } else {
            Object.assign(camposMap, listaCamposArray);
        }

        const descripcionOverride = ov?.descripcion;
        const descripcionTabla = !esDescripcionGenerica(descripcionOverride, nombreTabla)
            ? descripcionOverride
            : (descSchema.tablas[nombreTabla] || descAuto.tablas[nombreTabla] || descripcionOverride || infoTecnica.descripcion || "Sin descripcion");

        const modulo = !esModuloGenerico(ov?.modulo)
            ? ov?.modulo
            : (inferirModulo(nombreTabla, sistema) || ov?.modulo || "General");

        const tags = (Array.isArray(ov?.tags) && ov.tags.length > 0)
            ? ov.tags
            : inferirTags(nombreTabla, modulo);
        const tipoTabla = esTipoGenerico(ov?.tipo_negocio)
            ? inferirTipoTabla(nombreTabla, camposMap)
            : ov?.tipo_negocio;

        // Construir objeto semántico
        const tablaSem = {
            nombre: nombreTabla,
            descripcion: descripcionTabla,
            modulo: modulo,
            tipo: tipoTabla,
            tags: tags,
            campos: {}
        };

        const camposRuntime = {};

        for (const [nombreCampo, infoCampo] of Object.entries(camposMap)) {
            const tipoSemantico = inferirTipoCampo(nombreCampo);
            const descCampo = descSchema.campos[nombreTabla]?.[nombreCampo]
                || descAuto.campos[nombreTabla]?.[nombreCampo]
                || infoCampo.descripcion
                || "";
            
            tablaSem.campos[nombreCampo] = {
                tipo_tecnico: infoCampo.tipo_base || infoCampo.tipo, // Ajuste para propiedad tipo
                tipo_semantico: tipoSemantico,
                descripcion: descCampo
            };

            // Agregar a runtime
            camposRuntime[nombreCampo] = {
                tipo: tipoSemantico,
                sql_type: infoCampo.tipo_base || infoCampo.tipo
            };
        }

        semantica.tablas[nombreTabla] = tablaSem;
        
        // Agregar a Runtime
        runtime.datasets[nombreTabla] = {
            description: tablaSem.descripcion,
            module: tablaSem.modulo,
            fields: camposRuntime
        };
    }

    if (Array.isArray(overrides.relaciones_inferidas)) {
        semantica.relaciones_inferidas = overrides.relaciones_inferidas;
    }

    // Escribir salidas
    await fs.outputJson(pathSemanticaOut, semantica, { spaces: 2 });
    console.log(` -> Generado JSON Semántico: ${pathSemanticaOut}`);

    await fs.outputFile(pathYamlOut, yaml.dump(runtime, { indent: 2 }));
    console.log(` -> Generado YAML Runtime: ${pathYamlOut}`);
}

async function main() {
    await fs.ensureDir(DIR_YAML_OUT);
    
    for (const sis of SISTEMAS) {
        await procesarSistema(sis);
    }
}

main().catch(err => {
    console.error("Error fatal:", err);
});


