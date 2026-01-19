/**
 * Conexión a bases de datos Firebird de Aspel
 * Usando node-firebird (puro JavaScript)
 */

const Firebird = require('node-firebird');

// Configuración de rutas de bases de datos Aspel
const BASES_ASPEL = {
    SAE: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\SAE9.00\\Empresa01\\Datos\\SAE90EMPRE01.FDB",
    BANCO: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\BAN6.00\\Datos\\Empresa01\\BAN60EMPRE01.FDB",
    COI: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\COI10.00\\Datos\\Empresa1\\COI10EMPRE1.FDB",
    NOI: "C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\NOI11.00\\Datos\\Empresa01\\NOI11EMPRE01.FDB"
};

// Pool de conexiones por sistema
const pools = {};

/**
 * Obtener configuración de conexión
 */
function obtenerConfig(sistema) {
    return {
        host: '127.0.0.1',
        port: 3050,
        database: BASES_ASPEL[sistema],
        user: 'SYSDBA',
        password: 'masterkey',
        lowercase_keys: false,
        role: null,
        pageSize: 4096
    };
}

/**
 * Obtener o crear pool de conexiones
 */
function obtenerPool(sistema) {
    const sistemaUpper = sistema.toUpperCase();
    
    if (!BASES_ASPEL[sistemaUpper]) {
        throw new Error(`Sistema ${sistema} no configurado`);
    }
    
    if (!pools[sistemaUpper]) {
        const config = obtenerConfig(sistemaUpper);
        pools[sistemaUpper] = Firebird.pool(5, config); // Pool de 5 conexiones
        console.log(`✅ Pool creado para ${sistemaUpper}`);
    }
    
    return pools[sistemaUpper];
}

/**
 * Ejecutar consulta SQL
 */
function ejecutarConsulta(sistema, sql, params = []) {
    return new Promise((resolve, reject) => {
        const pool = obtenerPool(sistema);
        
        pool.get((err, db) => {
            if (err) {
                return reject(err);
            }
            
            db.query(sql, params, (err, result) => {
                db.detach();
                
                if (err) {
                    return reject(err);
                }
                
                resolve(result);
            });
        });
    });
}

/**
 * Cerrar todos los pools
 */
function cerrarConexiones() {
    return new Promise((resolve) => {
        const sistemasActivos = Object.keys(pools);
        let cerrados = 0;
        
        if (sistemasActivos.length === 0) {
            return resolve();
        }
        
        sistemasActivos.forEach(sistema => {
            pools[sistema].destroy(() => {
                console.log(`✅ Pool cerrado: ${sistema}`);
                delete pools[sistema];
                cerrados++;
                
                if (cerrados === sistemasActivos.length) {
                    resolve();
                }
            });
        });
    });
}

/**
 * Probar conexión
 */
function probarConexion(sistema) {
    return new Promise((resolve) => {
        const config = obtenerConfig(sistema.toUpperCase());
        
        Firebird.attach(config, (err, db) => {
            if (err) {
                return resolve({ 
                    exito: false, 
                    mensaje: err.message 
                });
            }
            
            db.query('SELECT FIRST 1 * FROM RDB$DATABASE', [], (err, result) => {
                db.detach();
                
                if (err) {
                    return resolve({ 
                        exito: false, 
                        mensaje: err.message 
                    });
                }
                
                resolve({ 
                    exito: true, 
                    mensaje: `Conexión exitosa a ${sistema}` 
                });
            });
        });
    });
}

module.exports = {
    ejecutarConsulta,
    cerrarConexiones,
    probarConexion,
    BASES_ASPEL
};
