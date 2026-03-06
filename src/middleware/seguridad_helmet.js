'use strict';

/**
 * src/middleware/seguridad_helmet.js
 *
 * Conjunto de middlewares de seguridad para Aspel-CENIT:
 *
 *  1. Helmet     — HTTP security headers (HSTS, nosniff, XSS, frameguard, CSP)
 *  2. CORS       — solo orígenes configurados por CORS_ORIGIN (no wildcard en producción)
 *  3. CSRF       — Double-submit stateless via HMAC + X-CSRF-Token header
 *  4. Rate limit — 100 req/min general, 10 req/min para endpoints pesados
 *
 * Uso en servidor.js:
 *   const { aplicarSeguridad, limitadorPesado } = require('./middleware/seguridad_helmet');
 *   aplicarSeguridad(app);
 *   router.post('/endpoint-pesado', limitadorPesado, controlador.fn);
 */

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// ─── Configuración desde variables de entorno ─────────────────────────────────

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Orígenes permitidos para CORS.
 * Separados por coma: CORS_ORIGIN=http://localhost:3000,https://miapp.example.com
 * En desarrollo, si no se define, se permite localhost y 127.0.0.1 en puertos comunes.
 */
const CORS_ORIGINS_RAW = process.env.CORS_ORIGIN || '';
const LOCALHOST_ORIGINS = [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5173', 'http://127.0.0.1:5173',
    'http://localhost:8080', 'http://127.0.0.1:8080'
];

const ALLOWED_ORIGINS = CORS_ORIGINS_RAW
    ? CORS_ORIGINS_RAW.split(',').map(s => s.trim()).filter(Boolean)
    : (!IS_PROD ? LOCALHOST_ORIGINS : []);

/**
 * Clave secreta para firmar tokens CSRF.
 * En producción debe estar en variable de entorno; en desarrollo se genera aleatoriamente.
 */
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');

// ─── 1. Helmet — HTTP Security Headers ───────────────────────────────────────

/**
 * Construye la directiva CSP apropiada para el entorno.
 * En desarrollo se permiten 'unsafe-inline' y 'unsafe-eval' para hot-reload.
 */
function buildCsp() {
    const base = {
        defaultSrc: ["'self'"],
        scriptSrc: IS_PROD
            ? ["'self'"]
            : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],   // inline styles en dashboard
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: IS_PROD ? [] : null   // solo en prod
    };

    // Quitar directivas con valor null
    return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== null));
}

const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        directives: buildCsp(),
        reportOnly: !IS_PROD   // en dev solo reporta, no bloquea
    },
    crossOriginEmbedderPolicy: false,   // no bloquear scripts de terceros en dev
    crossOriginResourcePolicy: { policy: IS_PROD ? 'same-origin' : 'cross-origin' },
    hsts: IS_PROD
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    noSniff: true,
    xssFilter: true,
    frameguard: { action: 'deny' }
});

// ─── 2. CORS — configurado por variables de entorno ───────────────────────────

const corsOptions = {
    origin(origin, callback) {
        // Permitir requests sin origin (peticiones same-origin en Electron, curl, Postman)
        if (!origin) return callback(null, true);

        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }

        // En desarrollo tolerar cualquier localhost
        if (!IS_PROD && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }

        return callback(
            Object.assign(new Error(`CORS: Origen no permitido → ${origin}`), { status: 403 }),
            false
        );
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Requested-With'],
    exposedHeaders: ['X-CSRF-Token'],
    credentials: true,
    optionsSuccessStatus: 204
};

const corsMiddleware = cors(corsOptions);

// ─── 3. CSRF — Double-submit HMAC stateless ───────────────────────────────────

/** Métodos que mutan estado y requieren CSRF token */
const METODOS_MUTANTES = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

/**
 * Rutas exentas de CSRF (webhooks, health, docs):
 * - /api/docs cualquier subpath
 * - /api/health
 * - /api/csrf-token  (el propio endpoint de generación)
 */
const CSRF_EXEMPTS = [
    /^\/api\/docs/,
    /^\/api\/health/,
    /^\/api\/csrf-token/,
    /^\/api\/busqueda\/sugerencias/,
    /^\/api\/busqueda\/populares/
];

/**
 * Genera un token CSRF firmado con HMAC-SHA256.
 * Formato: `<timestamp_hour>.<hmac>`
 * El timestamp limita la ventana de validez a ~1 hora.
 */
function generarCsrfToken() {
    const ts = String(Math.floor(Date.now() / 3_600_000)); // hora actual
    const hmac = crypto.createHmac('sha256', CSRF_SECRET).update(ts).digest('hex');
    return `${ts}.${hmac}`;
}

/**
 * Verifica que un token CSRF sea válido.
 * Acepta tokens de la hora actual y la anterior (para no romper en cambio de hora).
 */
function verificarCsrfToken(token) {
    if (!token || typeof token !== 'string') return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [ts, hmac] = parts;
    const horaActual = Math.floor(Date.now() / 3_600_000);

    for (const h of [horaActual, horaActual - 1]) {
        const expected = crypto.createHmac('sha256', CSRF_SECRET).update(String(h)).digest('hex');
        if (crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex')) &&
            ts === String(h)) {
            return true;
        }
    }

    return false;
}

/**
 * Middleware CSRF: verifica X-CSRF-Token en métodos mutantes.
 * Las rutas exentas (health, docs, csrf-token) pasan sin verificación.
 */
function csrfMiddleware(req, res, next) {
    if (!METODOS_MUTANTES.has(req.method)) return next();

    // Ruta exenta?
    if (CSRF_EXEMPTS.some(pattern => pattern.test(req.path))) return next();

    // En desarrollo se puede deshabilitar para facilitar pruebas con Swagger/curl
    if (!IS_PROD && process.env.CSRF_DISABLED === '1') return next();

    const token = req.headers['x-csrf-token'];
    if (!verificarCsrfToken(token)) {
        return res.status(403).json({
            ok: false,
            error: 'Token CSRF inválido o ausente. Obtén uno en GET /api/csrf-token y envíalo en el header X-CSRF-Token.'
        });
    }

    next();
}

// ─── 4. Rate Limiting ─────────────────────────────────────────────────────────

/** Mensaje de respuesta cuando se supera el límite */
function respuestaLimite(req, res) {
    return res.status(429).json({
        ok: false,
        error: `Límite de solicitudes excedido. Intenta de nuevo en ${req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).toISOString() : 'un momento'}.`,
        retry_after_s: req.rateLimit?.resetTime
            ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
            : 60
    });
}

/** Limitador general: 100 req/min por IP */
const limitadorGeneral = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_GENERAL) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    handler: respuestaLimite,
    skip(req) {
        // No limitar rutas estáticas ni health check
        return !req.path.startsWith('/api/') || req.path === '/api/health';
    }
});

/** Limitador pesado: 10 req/min por IP — para ejecución de queries Firebird */
const limitadorPesado = rateLimit({
    windowMs: 60 * 1000,
    max: Number(process.env.RATE_LIMIT_PESADO) || 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: respuestaLimite
});

// ─── Endpoint utilitario: GET /api/csrf-token ─────────────────────────────────

/**
 * Genera y devuelve un token CSRF válido.
 * El frontend debe guardarlo y enviarlo en X-CSRF-Token en cada request mutante.
 *
 * @example
 *   const { token } = await fetch('/api/csrf-token').then(r => r.json());
 *   // Luego en fetch POST: headers: { 'X-CSRF-Token': token }
 */
function manejadorCsrfToken(_req, res) {
    const token = generarCsrfToken();
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, token, expires_in_s: 7200 });
}

// ─── Función de montaje ───────────────────────────────────────────────────────

/**
 * Aplica todos los middlewares de seguridad a la app Express.
 * Reemplaza el `app.use(cors())` y el `app.disable('x-powered-by')` del servidor.
 *
 * @param {import('express').Application} app
 */
function aplicarSeguridad(app) {
    // Helmet (ya incluye x-powered-by removal equivalente)
    app.use(helmetMiddleware);

    // CORS configurado
    app.use(corsMiddleware);
    app.options(/.*/, corsMiddleware); // preflight — regex requerido en Express 5

    // Rate limit general sobre todas las rutas /api/
    app.use(limitadorGeneral);

    // CSRF endpoint (antes del guard para que no se bloquee a sí mismo)
    app.get('/api/csrf-token', manejadorCsrfToken);

    // CSRF guard para métodos mutantes
    app.use(csrfMiddleware);
}

module.exports = {
    aplicarSeguridad,
    limitadorPesado,
    limitadorGeneral,
    csrfMiddleware,
    helmetMiddleware,
    corsMiddleware,
    generarCsrfToken,
    verificarCsrfToken
};
