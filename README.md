# Aspel-CENIT
Dashboard ejecutivo innovador, desarrollado como una solución web fullstack, diseñado para ofrecer una visión 360° del rendimiento empresarial. Consolidando y reportando datos de sistemas Aspel clave como SAE, NOI, COI y BANCO

Este programa usa:
chart.js
node.js
express
dotenv
bcryptjs 
node-firebird-driver-native (poolTiempo real)
Tom Select
PDFKit
Day.js
electron: "^38.2.2"
electron-builder: "^24.6.0"
asar
bootstrap 5
helmet, joi

{
  "name": "aspel-cenit",
  "version": "1.0.0",
  "main": "electron-main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder --win portable"
  },
  "build": {
    "appId": "com.aspel.cenit",
    "asar": true,
    "files": ["dist/**/*", "electron-main.js", "preload.js"],
    "win": {
      "target": [
        {
          "target": "nsis",
          "arch": ["x64"]
        }
      ],
      "publisherName": "Tu Nombre"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
            