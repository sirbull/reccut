const path = require('path');
const { randomUUID } = require('crypto');

// A clean video output. This window has only a small preview API, never the editor API.
function createExternalPreview({ BrowserWindow, ipcMain, screen, getMainWindow, buildDir }) {
  let output = null;
  let targetId = null;
  let session = null;
  const fromMain = (event) => {
    const main = getMainWindow();
    return main && !main.isDestroyed() && event.sender === main.webContents && event.senderFrame === main.webContents.mainFrame;
  };
  const fromOutput = (event) => output && event.sender === output.webContents && event.senderFrame === output.webContents.mainFrame;
  const sendMain = (channel, value) => {
    const main = getMainWindow();
    if (main && !main.isDestroyed()) main.webContents.send(channel, value);
  };
  function displays() {
    const main = getMainWindow();
    const current = main && !main.isDestroyed() ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay();
    return screen.getAllDisplays().filter((d) => d.id !== current.id &&
      // Mirrored screens provide no separate workspace.
      (d.bounds.x !== current.bounds.x || d.bounds.y !== current.bounds.y));
  }
  const describe = (d) => ({
    id: d.id, label: d.label || `Display ${screen.getAllDisplays().findIndex((v) => v.id === d.id) + 1}`,
    width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor),
  });
  const state = () => {
    const available = displays().map(describe);
    return { displays: available, connectedDisplayIds: screen.getAllDisplays().map((d) => d.id), active: available.find((d) => d.id === targetId) || null, session };
  };
  const changed = () => sendMain('external-preview:state', state());
  function close() {
    const previous = output;
    output = null;
    targetId = null;
    session = null;
    if (previous && !previous.isDestroyed()) previous.destroy();
    changed();
  }
  ipcMain.handle('external-preview:state', (event) => {
    if (!fromMain(event)) throw new Error('Only the editor can read preview displays.');
    return state();
  });
  ipcMain.handle('external-preview:open', async (event, displayId) => {
    if (!fromMain(event)) throw new Error('Only the editor can open a preview.');
    const display = displays().find((d) => d.id === displayId);
    if (!display) throw new Error('This display is no longer available.');
    if (output && targetId === displayId) return state();
    close();
    const created = new BrowserWindow({
      title: 'Reccut Preview', ...display.bounds, frame: false, show: false,
      backgroundColor: '#000000', autoHideMenuBar: true, fullscreenable: false,
      enableLargerThanScreen: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload-preview.js'), contextIsolation: true,
        nodeIntegration: false, sandbox: true, backgroundThrottling: false,
      },
    });
    output = created;
    targetId = display.id;
    session = randomUUID();
    created.setMenu(null);
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    created.webContents.on('will-navigate', (e) => e.preventDefault());
    created.webContents.on('render-process-gone', () => { if (output === created) close(); });
    created.on('closed', () => { if (output === created) close(); });
    changed();
    try {
      await created.loadFile(path.join(buildDir, 'external-preview.html'));
      // Loading can finish after unplugging a screen, changing rooms or closing the app.
      if (output === created && !created.isDestroyed()) {
        const current = displays().find((d) => d.id === targetId);
        if (current) { created.setBounds(current.bounds); created.showInactive(); }
        else close();
      }
    } catch (error) {
      if (output === created) { close(); throw error; }
    }
    return state();
  });
  ipcMain.handle('external-preview:close', (event) => {
    if (!fromMain(event) && !fromOutput(event)) throw new Error('Unknown preview window.');
    close();
  });
  ipcMain.on('external-preview:ready', (event) => {
    if (fromOutput(event)) sendMain('external-preview:signal', { session, ready: true });
  });
  ipcMain.on('external-preview:signal', (event, message) => {
    if (!output || message?.session !== session || typeof message?.description?.sdp !== 'string' || message.description.sdp.length > 100000) return;
    const isMain = fromMain(event);
    if (!isMain && !fromOutput(event)) return;
    if (message.description.type !== (isMain ? 'offer' : 'answer')) return;
    const receiver = isMain ? output : getMainWindow();
    receiver.webContents.send('external-preview:signal', message);
  });
  ipcMain.on('external-preview:command', (event, command) => {
    if (!fromOutput(event)) return;
    if (['toggle', 'previousFrame', 'nextFrame', 'start', 'end', 'frameReady'].includes(command)) sendMain('external-preview:command', command);
    if (command === 'failed') {
      close();
      sendMain('external-preview:error', 'The preview connection was interrupted. Preview has returned to the editor.');
    }
  });
  return {
    destroy: close,
    displaysChanged() {
      if (output) {
        const display = displays().find((d) => d.id === targetId);
        if (!display) return close();
        output.setBounds(display.bounds);
      }
      changed();
    },
  };
}

module.exports = { createExternalPreview };
