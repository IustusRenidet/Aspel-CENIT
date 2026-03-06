/* ==============================================================
   CENIT IA — modules/state.js
   Estado global compartido (mutable, sin framework)
   ============================================================== */

export const state = {
    view: 'inicio',
    dashboard: null,        // dashboard en edición
    vizTypes: {},           // widgetId → tipo visualización
    resultados: {},         // widgetId → datos ejecutados
    dashboards: [],         // paneles guardados
    conexiones: {},         // config conexiones
    conexionTab: 'SAE',     // tab activo en conexiones
    expMetricas: [],        // métricas en explorador
    expMetricaActiva: null,
    modalViz: 'tabla',
    charts: {},             // Chart.js instances activos
    pendingWidgetSave: null, // contexto para modal «Guardar como Widget»

    // Sub-estado del Widget Studio (inicializado en cargarStudio)
    studio: {
        templates: [],
        templateActivo: null,
        viz: 'tabla',
        resultado: null,
        modoPreview: false
    },

    // Sub-estado del Asistente IA (inicializado en analizarConAsistente)
    asistente: {
        ultimaInterpretacion: null,
        viz: 'tabla',
        resultado: null
    },

    // Sub-estado del Wizard (null cuando está cerrado)
    wizard: null
};
