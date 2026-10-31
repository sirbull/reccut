// Kontrollinjen under opptak: sender knappetrykk til hovedprosessen og mottar status.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('control', {
  send: (cmd) => ipcRenderer.send('control:cmd', cmd),
  onState: (cb) => ipcRenderer.on('control:state', (_e, s) => cb(s)),
});
