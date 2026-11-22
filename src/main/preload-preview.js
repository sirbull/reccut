const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('preview', {
  ready: () => ipcRenderer.send('external-preview:ready'),
  signal: (message) => ipcRenderer.send('external-preview:signal', message),
  onSignal: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('external-preview:signal', listener);
    return () => ipcRenderer.removeListener('external-preview:signal', listener);
  },
  close: () => ipcRenderer.invoke('external-preview:close'),
  command: (command) => ipcRenderer.send('external-preview:command', command),
});
