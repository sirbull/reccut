const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pip', {
  onFrame: (cb) => ipcRenderer.on('pip:frame', (_e, image) => cb(image)),
});
