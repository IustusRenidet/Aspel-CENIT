const express = require('express');
const http = require('http');
const path = require('path');
const { aplicarSeguridad } = require('./middleware/seguridad_helmet');
const rutasDatosAnaliticos = require('./rutas/datos_analiticos.rutas');
const rutasConexiones = require('./rutas/conexiones.rutas');
const rutasPaneles = require('./rutas/paneles.rutas');
const rutasWidgetStudio = require('./rutas/widget_studio.rutas');
const rutasWidgets = require('./rutas/widgets.rutas');
const rutasBusqueda = require('./rutas/busqueda.rutas');
const rutasAdmin = require('./rutas/admin.rutas');
const { cerrarConexiones } = require('./conectores/firebird/conexion');
const programador = require('./etl/programador');

// ── Documentación OpenAPI (solo entorno desarrollo) ──────────────────────────
const IS_DEV = process.env.NODE_ENV !== 'production';
let swaggerUi, swaggerSpec;
if (IS_DEV) {
  try {
    swaggerUi = require('swagger-ui-express');
    swaggerSpec = require('./docs/swagger');
  } catch (e) {
    console.warn('[swagger] No disponible:', e.message);
    swaggerUi = null;
  }
}

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Seguridad: Helmet + CORS + CSRF + Rate Limiting ─────────────────────────────
app.disable('x-powered-by');  // por si helmet no lo cubre en algún edge case
aplicarSeguridad(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', rutasDatosAnaliticos);
app.use('/api/conexiones', rutasConexiones);
app.use('/api/paneles', rutasPaneles);
app.use('/api/widget-studio', rutasWidgetStudio);
app.use('/api/widgets', rutasWidgets);
app.use('/api/busqueda', rutasBusqueda);
app.use('/api/admin', rutasAdmin);

// ── Swagger UI (solo desarrollo) ─────────────────────────────────────────────
if (IS_DEV && swaggerUi && swaggerSpec) {
  const swaggerOptions = {
    customSiteTitle: 'Aspel-CENIT API Docs',
    customCss: `
      .swagger-ui .topbar { background: #161b22; }
      .swagger-ui .topbar-wrapper .link span { display: none; }
      .swagger-ui .info .title { color: #00b4c5; }
    `,
    swaggerOptions: { persistAuthorization: true, tryItOutEnabled: true }
  };
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));
}
app.use(express.static(PUBLIC_DIR));

app.get('/', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((req, res) => {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      error: 'Ruta API no encontrada'
    });
  }

  return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const server = http.createServer(app);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Error: El puerto ${PORT} ya está en uso. Cierra la instancia anterior o usa PORT=XXXX npm start`);
  } else {
    console.error(`Error de servidor: ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const displayUrl = `http://localhost:${PORT}`;
  console.log('============================================================');
  console.log(' CENIT ASP - API Inteligente + Constructor de Dashboards');
  console.log('============================================================');
  console.log(`Servidor:  ${displayUrl}`);
  console.log(`Salud API: ${displayUrl}/api/health`);
  if (IS_DEV && swaggerUi) {
    console.log(`API Docs:  ${displayUrl}/api/docs`);
  }
  console.log('Comando principal: npm start');
  console.log('============================================================');

  // Arrancar ETL scheduler
  try {
    programador.iniciar();
  } catch (e) {
    console.error('[ETL] Error al iniciar programador:', e.message);
  }

  // Refrescar diccionarios técnicos desde Firebird al arrancar (best-effort, no bloquea)
  setImmediate(async () => {
    try {
      const ConstructorDiccionario = require('./semantica/constructor_diccionario');
      const ConexionesAspel = require('./servicios/conexiones_aspel');
      const cd = new ConstructorDiccionario();
      const todosSist = new ConexionesAspel().leerTodo().sistemas || {};
      const habilitados = Object.entries(todosSist)
        .filter(([, cfg]) => cfg.enabled !== false)
        .map(([nombre]) => nombre);

      for (const sistema of habilitados) {
        cd.refrescarSiConectado(sistema)
          .then((r) => console.log(
            `[Diccionario] ${sistema}: ${r.origen_datos} (${r.tablas} tablas, ${r.campos} campos)`
          ))
          .catch((e) => console.warn(`[Diccionario] ${sistema} error inesperado:`, e.message));
      }
    } catch (e) {
      console.warn('[Diccionario] No se pudo iniciar refresco de esquemas:', e.message);
    }
  });
});

let apagando = false;

async function apagarServidor(signal) {
  if (apagando) return;
  apagando = true;

  console.log(`\nRecibida senal ${signal}. Cerrando servicios...`);

  try {
    programador.detener();
  } catch (_) { }

  try {
    await cerrarConexiones();
  } catch (error) {
    console.error(`Error cerrando pools Firebird: ${error.message}`);
  }

  server.close(() => {
    console.log('Servidor HTTP detenido');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Cierre forzado por timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => apagarServidor('SIGINT'));
process.on('SIGTERM', () => apagarServidor('SIGTERM'));

process.on('unhandledRejection', (error) => {
  console.error('Promesa rechazada sin manejo:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Excepcion no controlada:', error);
});

module.exports = app;
