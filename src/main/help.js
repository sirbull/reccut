// A reusable, independent handbook window. It has no project, filesystem or AI APIs.
const path = require('path');

function createHelpWindow({ BrowserWindow, ipcMain, getMainWindow, buildDir }) {
  let window = null;
  let state = { commands: [], platform: process.platform };
  const fromMain = (event) => {
    const main = getMainWindow();
    return main && event.sender === main.webContents && event.senderFrame === main.webContents.mainFrame;
  };
  const fromHelp = (event) => window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame;
  const navigate = (request = {}) => {
    if (window && !window.isDestroyed()) window.webContents.send('help:navigate', request);
  };
  ipcMain.handle('help:open', async (event, payload) => {
    if (!fromMain(event)) throw new Error('Only the main application can open Help.');
    state = { commands: payload.commands, platform: process.platform, request: payload.request || {} };
    if (window && !window.isDestroyed()) {
      window.webContents.send('help:state', state);
      navigate(payload.request);
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      return;
    }
    const created = new BrowserWindow({
      title: 'Reccut Help', width: 1160, height: 850, minWidth: 720, minHeight: 540,
      backgroundColor: '#141416', autoHideMenuBar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload-help.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window = created;
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', (e) => e.preventDefault());
    created.on('closed', () => { if (window === created) window = null; });
    // Include initial navigation in the bootstrap: renderer listeners need not win a load-event race.
    state = { ...state, request: payload.request || {} };
    await created.loadFile(path.join(buildDir, 'help.html'));
    if (!created.isDestroyed()) { created.show(); created.focus(); }
  });
  ipcMain.handle('help:state', (event) => {
    if (!fromHelp(event)) throw new Error('Only Help can read the handbook state.');
    return state;
  });
  ipcMain.handle('help:update', (event, commands) => {
    if (!fromMain(event)) throw new Error('Only the main application can update Help.');
    state = { ...state, commands };
    if (window && !window.isDestroyed()) window.webContents.send('help:state', state);
  });
  ipcMain.handle('help:command', (event, id) => {
    if (!fromHelp(event) || typeof id !== 'string' || !state.commands.some((c) => c.id === id)) throw new Error('Unknown Help command.');
    const main = getMainWindow();
    if (!main || main.isDestroyed()) return false;
    if (main.isMinimized()) main.restore();
    main.show(); main.focus();
    main.webContents.send('help:command', id);
    return true;
  });
  return {
    destroy() { if (window && !window.isDestroyed()) window.destroy(); window = null; },
    // Native menu accelerators must edit Help's text instead of editing the timeline behind it.
    handleMenu(id) {
      if (!window?.isFocused()) return false;
      const text = { undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste', selectAll: 'selectAll' }[id];
      if (text) window.webContents[text]();
      else if (id === 'help' || id === 'shortcuts') navigate({ article: id === 'help' ? 'home' : 'shortcuts' });
      else if (id === 'findCommand') navigate({ focusSearch: true });
      return true;
    },
  };
}
module.exports = { createHelpWindow };
