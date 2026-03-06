/* ==============================================================
   CENIT IA — modules/registry.js
   Registro central de callbacks para evitar dependencias circulares.
   app-main.js registra las funciones; los módulos secundarios
   las invocan sin conocer el origen.
   ============================================================== */

/**
 * Callbacks que app-main.js registra en tiempo de inicialización.
 * Los módulos (busqueda, widgets, …) los utilizan sin importar app-main directamente.
 *
 * @type {{ navegar: function, mostrarFase: function, renderWidgetsSupgeridos: function }}
 */
export const callbacks = {
    navegar: (/* vista */) => { /* placeholder — se reemplaza en app-main.js */ },
    mostrarFase: (/* fase */) => { },
    renderWidgetsSupgeridos: (/* widgets, objetivo */) => { }
};
