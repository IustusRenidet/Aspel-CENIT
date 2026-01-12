const fs = require('fs-extra');
const yaml = require('js-yaml');
const path = require('path');

const RUTAS = {
    sae: path.join(__dirname, '../Esquemas/sae_tablas_por_modulo.json'),
    coi: path.join(__dirname, '../Esquemas/coi_funcion_por_tabla.json'),
    noi: path.join(__dirname, '../Esquemas/noi_schema.json'), // Nuevo
    banco: path.join(__dirname, '../Esquemas/banco.squema.json'), // Nuevo
    output: path.join(__dirname, '../overrides')
};

// ... (Funciones SAE y COI existentes sin cambios)

async function generarOverridesSAE() {
    console.log('Generando overrides para SAE...');
    if (!fs.existsSync(RUTAS.sae)) {
        console.warn('No se encontró archivo de insumo SAE:', RUTAS.sae);
        return;
    }

    const data = await fs.readJson(RUTAS.sae);
    const overrides = { tablas: {} };

    // Estructura actual: { "Modulo": { "TABLA": { descripcion, tipo, ... } } }
    for (const [modulo, tablas] of Object.entries(data)) {
        for (const [nombreTabla, info] of Object.entries(tablas)) {
            overrides.tablas[nombreTabla] = {
                descripcion: info.descripcion,
                modulo: modulo,
                tipo_negocio: info.tipo, // Mapeo "tipo" del JSON a "tipo_negocio"
                tags: [modulo.toLowerCase(), info.tipo?.toLowerCase()].filter(Boolean)
            };
        }
    }

    // Añadir relaciones inferidas comunes (Ejemplo)
    overrides.relaciones_inferidas = [
        {
            origen_patron: "CVE_CLPV",
            destino_tabla: "CLIE01",
            destino_campo: "CLAVE",
            descripcion: "Relación Cliente-Proveedor"
        },
        {
            origen_patron: "CVE_VEND",
            destino_tabla: "VEND01",
            destino_campo: "CVE_VEND",
            descripcion: "Relación Vendedor"
        }
    ];

    const yamlStr = yaml.dump(overrides, { indent: 2, lineWidth: -1 });
    await fs.outputFile(path.join(RUTAS.output, 'SAE.yaml'), yamlStr);
    console.log('SAE.yaml generado.');
}

async function generarOverridesCOI() {
    console.log('Generando overrides para COI...');
    if (!fs.existsSync(RUTAS.coi)) {
        console.warn('No se encontró archivo de insumo COI:', RUTAS.coi);
        return;
    }

    const data = await fs.readJson(RUTAS.coi);
    const overrides = { tablas: {} };

    // Estructura actual COI: { "TABLA": { descripcion } }
    for (const [nombreTabla, info] of Object.entries(data)) {
        // COI muchas veces trae tablas duplicadas con sufijos (ACTIVOS01...21)
        overrides.tablas[nombreTabla] = {
            descripcion: info.descripcion,
            modulo: "Contabilidad", 
            tags: ["contabilidad"]
        };
    }

    const yamlStr = yaml.dump(overrides, { indent: 2, lineWidth: -1 });
    await fs.outputFile(path.join(RUTAS.output, 'COI.yaml'), yamlStr);
    console.log('COI.yaml generado.');
}

async function readJsonWithNaN(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    // Reemplaza NaN por null (asegurándose de no romper palabras que terminan en NaN si las hubiera, 
    // pero en JSON estándar NaN aparece como valor sin comillas)
    const fixedContent = content.replace(/:\s*NaN/g, ': null'); 
    return JSON.parse(fixedContent);
}

// Nueva función para NOI
async function generarOverridesNOI() {
    console.log('Generando overrides para NOI...');
    if (!fs.existsSync(RUTAS.noi)) {
        console.warn('No se encontró archivo de insumo NOI:', RUTAS.noi);
        return;
    }

    const data = await readJsonWithNaN(RUTAS.noi);
    const overrides = { tablas: {} };

    // Estructura NOI: [ { "table": "NAME", "table_description": "..." ... } ]
    for (const item of data) {
        const nombreTabla = item.table;
        let modulo = "General";
        let tags = [];

        // Heurística básica por nombre
        if (nombreTabla.startsWith("PER") || nombreTabla.startsWith("DED")) { modulo = "Percepciones/Deducciones"; tags.push("nomina"); }
        else if (nombreTabla.startsWith("NOM")) { modulo = "Nómina"; tags.push("nomina"); }
        else if (nombreTabla.startsWith("TRAB")) { modulo = "Trabajadores"; tags.push("rh"); }
        else if (nombreTabla.startsWith("DEP")) { modulo = "Departamentos"; tags.push("catalogo"); }
        else if (nombreTabla.startsWith("PUE")) { modulo = "Puestos"; tags.push("catalogo"); }
        else if (nombreTabla.startsWith("FALT")) { modulo = "Faltas"; tags.push("incidencias"); }

        overrides.tablas[nombreTabla] = {
            descripcion: item.table_description || "Tabla de sistema NOI",
            modulo: modulo,
            tags: tags
        };
    }

    const yamlStr = yaml.dump(overrides, { indent: 2, lineWidth: -1 });
    await fs.outputFile(path.join(RUTAS.output, 'NOI.yaml'), yamlStr);
    console.log('NOI.yaml generado.');
}

// Nueva función para BANCO
async function generarOverridesBANCO() {
    console.log('Generando overrides para BANCO...');
    if (!fs.existsSync(RUTAS.banco)) {
        console.warn('No se encontró archivo de insumo BANCO:', RUTAS.banco);
        return;
    }

    const data = await readJsonWithNaN(RUTAS.banco);
    const overrides = { tablas: {} };

    // Estructura BANCO: similar a NOI
    for (const item of data) {
        const nombreTabla = item.table;
        let modulo = "General";
        let tags = [];

        if (nombreTabla.startsWith("CTA")) { modulo = "Cuentas"; tags.push("catalogo"); }
        else if (nombreTabla.startsWith("MOV")) { modulo = "Movimientos"; tags.push("transacciones"); }
        else if (nombreTabla.startsWith("CHQ")) { modulo = "Cheques"; tags.push("transacciones"); }
        else if (nombreTabla.startsWith("CONC")) { modulo = "Conciliación"; tags.push("finanzas"); }
        else if (nombreTabla.startsWith("BEN")) { modulo = "Beneficiarios"; tags.push("catalogo"); }

        overrides.tablas[nombreTabla] = {
            descripcion: item.table_description || "Tabla de sistema BANCO",
            modulo: modulo,
            tags: tags
        };
    }

    const yamlStr = yaml.dump(overrides, { indent: 2, lineWidth: -1 });
    await fs.outputFile(path.join(RUTAS.output, 'BANCO.yaml'), yamlStr);
    console.log('BANCO.yaml generado.');
}

// Eliminada generarBaseOtros y reemplazada por llamadas reales

async function main() {
    await fs.ensureDir(RUTAS.output);
    await generarOverridesSAE();
    await generarOverridesCOI();
    await generarOverridesNOI();
    await generarOverridesBANCO();
}


main().catch(console.error);
