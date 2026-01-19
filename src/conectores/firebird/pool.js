/**
 * Pool de conexiones Firebird para Aspel
 */

const Firebird = require('node-firebird');
const { obtenerConfiguracion } = require('./configuracion');

// Cache de pools por sistema
const pools = new Map();

/**
 * Obtener o crear pool de conexiones para un sistema
 */
function obtenerPool(sistema) {
    const sistemaUpper = sistema.toUpperCase();
    
    if (pools.has(sistemaUpper)) {
        return pools.get(sistemaUpper);
    }
    
    const config = obtenerConfiguracion(sistemaUpper);
    const pool = Firebird.pool(5, config); // Pool de 5 conexiones
    
    pools.set(sistemaUpper, pool);
    console.log(`✅ Pool de conexiones creado para ${sistemaUpper}`);
    
    return pool;
}

/**
 * Ejecutar consulta SQL en un sistema específico
 */
function ejecutarConsulta(sistema, sql, params = []) {
    return new Promise((resolve, reject) => {
        const pool = obtenerPool(sistema);
        
        pool.get((err, db) => {
            if (err) {
                console.error(`❌ Error obteniendo conexión para ${sistema}:`, err.message);
                return reject(err);
            }
            
            db.query(sql, params, (err, result) => {
                db.detach(); // Liberar conexión
                
                if (err) {
                    console.error(`❌ Error ejecutando consulta en ${sistema}:`, err.message);
                    return reject(err);
                }
                
                resolve(result);
            });
        });
    });
}

/**
 * Probar conexión a un sistema
 */
function probarConexion(sistema) {
    return new Promise((resolve, reject) => {
        const config = obtenerConfiguracion(sistema);
        
        Firebird.attach(config, (err, db) => {
            if (err) {
                return reject(err);
            }
            
            db.query('SELECT 1 AS TEST FROM RDB$DATABASE', [], (err, result) => {
                db.detach();
                
                if (err) {
                    return reject(err);
                }
                
                resolve({
                    sistema,
                    conectado: true,
                    resultado: result
                });
            });
        });
    });
}

/**
 * Cerrar todos los pools
 */
function cerrarPools() {
    for (const [sistema, pool] of pools.entries()) {
        try {
            pool.destroy();
            console.log(`✅ Pool de ${sistema} cerrado`);
        } catch (error) {
            console.error(`❌ Error cerrando pool de ${sistema}:`, error.message);
        }
    }
    pools.clear();
}

module.exports = {
    obtenerPool,
    ejecutarConsulta,
    probarConexion,
    cerrarPools
};
