const fs = require('fs-extra');
const path = require('path');

const SISTEMAS = ['SAE', 'COI', 'NOI', 'BANCO'];
const ARCHIVO_CONFIG_DEFAULT = path.join(process.cwd(), 'config', 'conexiones_aspel.json');

const CONEXIONES_DEFAULT = {
  SAE: {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\SAE9.00\\Empresa01\\Datos\\SAE90EMPRE01.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    pageSize: 4096,
    role: null,
    enabled: true
  },
  COI: {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\COI10.00\\Datos\\Empresa1\\COI10EMPRE1.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    pageSize: 4096,
    role: null,
    enabled: true
  },
  NOI: {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\NOI11.00\\Datos\\Empresa01\\NOI11EMPRE01.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    pageSize: 4096,
    role: null,
    enabled: true
  },
  BANCO: {
    host: '127.0.0.1',
    port: 3050,
    database: 'C:\\Program Files (x86)\\Common Files\\Aspel\\Sistemas Aspel\\BAN6.00\\Datos\\Empresa01\\BAN60EMPRE01.FDB',
    user: 'SYSDBA',
    password: 'masterkey',
    pageSize: 4096,
    role: null,
    enabled: true
  }
};

class ConexionesAspel {
  constructor(opciones = {}) {
    this.archivoConfig = opciones.archivoConfig || ARCHIVO_CONFIG_DEFAULT;
  }

  normalizarSistema(sistema) {
    const valor = String(sistema || '').toUpperCase();
    if (!SISTEMAS.includes(valor)) {
      throw new Error(`Sistema invalido: ${sistema}`);
    }
    return valor;
  }

  asegurarArchivo() {
    if (!fs.pathExistsSync(this.archivoConfig)) {
      fs.ensureDirSync(path.dirname(this.archivoConfig));
      fs.writeJsonSync(
        this.archivoConfig,
        { version: 1, actualizado_en: new Date().toISOString(), sistemas: CONEXIONES_DEFAULT },
        { spaces: 2 }
      );
    }
  }

  leerTodo() {
    this.asegurarArchivo();
    const contenido = fs.readJsonSync(this.archivoConfig, { throws: false }) || {};
    const sistemas = { ...CONEXIONES_DEFAULT, ...(contenido.sistemas || {}) };

    return {
      version: contenido.version || 1,
      actualizado_en: contenido.actualizado_en || null,
      sistemas
    };
  }

  escribirTodo(data) {
    fs.ensureDirSync(path.dirname(this.archivoConfig));
    fs.writeJsonSync(this.archivoConfig, {
      version: data.version || 1,
      actualizado_en: new Date().toISOString(),
      sistemas: data.sistemas || {}
    }, { spaces: 2 });
  }

  obtenerSistema(sistema) {
    const sistemaNormalizado = this.normalizarSistema(sistema);
    const data = this.leerTodo();
    const config = data.sistemas[sistemaNormalizado];

    if (!config) {
      throw new Error(`No existe configuracion para ${sistemaNormalizado}`);
    }

    return { ...config };
  }

  obtenerTodas() {
    return this.leerTodo().sistemas;
  }

  validarParcial(configParcial = {}) {
    const permitido = ['host', 'port', 'database', 'user', 'password', 'pageSize', 'role', 'enabled'];
    const salida = {};

    for (const [key, value] of Object.entries(configParcial || {})) {
      if (!permitido.includes(key)) continue;
      salida[key] = value;
    }

    if ('port' in salida) salida.port = Number(salida.port);
    if ('pageSize' in salida) salida.pageSize = Number(salida.pageSize);
    if ('enabled' in salida) salida.enabled = Boolean(salida.enabled);

    return salida;
  }

  actualizarSistema(sistema, configParcial = {}) {
    const sistemaNormalizado = this.normalizarSistema(sistema);
    const data = this.leerTodo();
    const actual = data.sistemas[sistemaNormalizado] || CONEXIONES_DEFAULT[sistemaNormalizado];
    const cambios = this.validarParcial(configParcial);

    const actualizado = { ...actual, ...cambios };

    if (!actualizado.database || typeof actualizado.database !== 'string') {
      throw new Error('database es obligatorio');
    }
    if (!actualizado.user || typeof actualizado.user !== 'string') {
      throw new Error('user es obligatorio');
    }
    if (!actualizado.password || typeof actualizado.password !== 'string') {
      throw new Error('password es obligatorio');
    }
    if (!actualizado.host || typeof actualizado.host !== 'string') {
      throw new Error('host es obligatorio');
    }
    if (!Number.isFinite(actualizado.port)) {
      throw new Error('port debe ser numerico');
    }

    data.sistemas[sistemaNormalizado] = actualizado;
    this.escribirTodo(data);

    return { ...actualizado };
  }

  ocultarSecreto(config = {}) {
    return {
      ...config,
      password: config.password ? '********' : ''
    };
  }

  obtenerTodasPublicas() {
    const todas = this.obtenerTodas();
    const salida = {};

    for (const sistema of SISTEMAS) {
      salida[sistema] = this.ocultarSecreto(todas[sistema] || {});
    }

    return salida;
  }
}

module.exports = ConexionesAspel;
