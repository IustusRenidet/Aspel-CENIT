/**
 * Configuración de bases de datos Firebird de Aspel
 */

const RUTAS_DB = {
    SAE: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\SAE9.00\\Empresa01\\Datos\\SAE90EMPRE01.FDB",
    BANCO: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\BAN6.00\\Datos\\Empresa01\\BAN60EMPRE01.FDB",
    COI: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\COI10.00\\Datos\\Empresa1\\COI10EMPRE1.FDB",
    NOI: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\NOI11.00\\Datos\\Empresa01\\NOI11EMPRE01.FDB"
};

const OPCIONES_CONEXION = {
    host: 'localhost',
    port: 3050,
    user: 'SYSDBA',
    password: 'masterkey',
    lowercase_keys: false,
    role: null,
    pageSize: 4096
};

function obtenerConfiguracion(sistema) {
    const database = RUTAS_DB[sistema.toUpperCase()];
    
    if (!database) {
        throw new Error(`Sistema ${sistema} no encontrado. Sistemas válidos: ${Object.keys(RUTAS_DB).join(', ')}`);
    }
    
    return {
        ...OPCIONES_CONEXION,
        database
    };
}

module.exports = {
    RUTAS_DB,
    OPCIONES_CONEXION,
    obtenerConfiguracion
};
