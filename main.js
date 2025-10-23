const path = require('path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { createServer } = require('./src/server');
const { getConfigurationPath } = require('./src/config/configManager');

const SERVER_PORT = parseInt(process.env.EXPRESS_PORT || process.env.PORT || '4823', 10);
let httpServer;

process.env.EXPRESS_PORT = String(SERVER_PORT);

async function startBackend() {
  const expressApp = await createServer();

  return new Promise((resolve) => {
    const server = expressApp.listen(SERVER_PORT, () => {
      console.info(`[Electron] Servidor Express escuchando en http://127.0.0.1:${SERVER_PORT}`);
      resolve(server);
    });
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 768,
    backgroundColor: '#050816',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [`--server-port=${SERVER_PORT}`]
    },
    show: false
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  return mainWindow;
}

app.whenReady().then(async () => {
  httpServer = await startBackend();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (httpServer) {
    httpServer.close();
  }
});

ipcMain.handle('config:getPath', () => getConfigurationPath());
ipcMain.handle('app:openExternal', (event, url) => {
  if (url) {
    return shell.openExternal(url);
  }
  return undefined;
});
