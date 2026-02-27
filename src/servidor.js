const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const rutasDatosAnaliticos = require('./rutas/datos_analiticos.rutas');
const rutasConexiones = require('./rutas/conexiones.rutas');
const rutasPaneles = require('./rutas/paneles.rutas');
const rutasWidgetStudio = require('./rutas/widget_studio.rutas');
const { cerrarConexiones } = require('./conectores/firebird/conexion');

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', rutasDatosAnaliticos);
app.use('/api/conexiones', rutasConexiones);
app.use('/api/paneles', rutasPaneles);
app.use('/api/widget-studio', rutasWidgetStudio);
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
  console.log('Comando principal: npm start');
  console.log('============================================================');
});

let apagando = false;

async function apagarServidor(signal) {
  if (apagando) return;
  apagando = true;

  console.log(`\nRecibida senal ${signal}. Cerrando servicios...`);

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
