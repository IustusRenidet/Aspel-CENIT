/* ==============================================================
   CENIT IA — modules/api.js
   Capa de comunicación HTTP con el backend Express
   ============================================================== */

/** Base de la API — en producción podría cambiarse por variable */
export const API = '/api';

/**
 * Wrapper sobre fetch que:
 *  - Incluye Content-Type: application/json
 *  - Lanza Error con mensaje del servidor si la respuesta no es ok o data.ok === false
 * @param {string} url  URL relativa (p. ej. `${API}/metricas`)
 * @param {RequestInit} [opts]  Opciones de fetch (method, body, headers, …)
 * @returns {Promise<any>}  JSON parseado de la respuesta
 */
export async function api(url, opts = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
}
