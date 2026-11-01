const { contextBridge, ipcRenderer } = require('electron');
const on = (channel) => (callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('handbook', {
  getState: () => ipcRenderer.invoke('help:state'),
  onState: on('help:state'),
  onNavigate: on('help:navigate'),
  runCommand: (id) => ipcRenderer.invoke('help:command', id),
});
