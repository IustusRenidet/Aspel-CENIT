const { contextBridge, ipcRenderer } = require('electron');
const Chart = require('chart.js/auto');
const TomSelect = require('tom-select');
const dayjs = require('dayjs');

const portArgument = process.argv.find((arg) => arg.startsWith('--server-port='));
const serverPort = portArgument
  ? Number(portArgument.split('=')[1])
  : Number(process.env.EXPRESS_PORT || 4823);

contextBridge.exposeInMainWorld('AppBridge', {
  port: serverPort,
  fetch: (path, options = {}) => {
    const url = path.startsWith('http')
      ? path
      : `http://127.0.0.1:${serverPort}${path.startsWith('/') ? path : `/${path}`}`;

    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    return fetch(url, {
      ...options,
      headers
    });
  },
  getConfigPath: () => ipcRenderer.invoke('config:getPath'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
});

contextBridge.exposeInMainWorld('Libraries', {
  Chart,
  TomSelect,
  dayjs
});
