const { ipcRenderer } = require('electron');

ipcRenderer.on('startup:status', (_event, text) => {
  const status = document.getElementById('status');
  if (status) status.textContent = text;
});
