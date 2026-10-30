const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  listScreens: () => ipcRenderer.invoke('screens:list'),
  selectScreen: (id) => ipcRenderer.invoke('screens:select', id),
  setShortcuts: (modifier) => ipcRenderer.invoke('shortcuts:set', modifier),
  hideFromCapture: (hide) => ipcRenderer.invoke('window:hideFromCapture', hide),
  permissionStatus: () => ipcRenderer.invoke('permissions:status'),
  requestPermissions: () => ipcRenderer.invoke('permissions:request'),
  openScreenSettings: () => ipcRenderer.invoke('permissions:openScreenSettings'),
  defaultOutputDir: () => ipcRenderer.invoke('output:default'),
  chooseOutputDir: (current) => ipcRenderer.invoke('output:choose', current),
  reveal: (filePath) => ipcRenderer.invoke('output:reveal', filePath),
  startRecording: (opts) => ipcRenderer.invoke('rec:start', opts),
  writeChunk: (chunk) => ipcRenderer.invoke('rec:chunk', chunk),
  stopRecording: () => ipcRenderer.invoke('rec:stop'),
  onShortcut: (cb) => ipcRenderer.on('shortcut', (_e, action) => cb(action)),
});
