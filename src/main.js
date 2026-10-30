const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
  systemPreferences,
} = require('electron');
const fs = require('fs');
const path = require('path');

const isMac = process.platform === 'darwin';

// Video og lyd skal starte uten at brukeren må klikke først.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let selectedScreenId = null;
let recording = null; // { handle, filePath, queue }

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    title: 'OBSlite',
    backgroundColor: '#0e1014',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Opptaket må fortsette selv om vinduet er minimert eller skjult.
      backgroundThrottling: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => {
    win = null;
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// Skjermer med native oppløsning (fysiske piksler, også på Retina/HiDPI).
async function listScreens() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 },
  });
  const displays = screen.getAllDisplays();
  return sources.map((source, i) => {
    const display =
      displays.find((d) => String(d.id) === source.display_id) ||
      displays[i] ||
      screen.getPrimaryDisplay();
    const width = Math.round(display.size.width * display.scaleFactor);
    const height = Math.round(display.size.height * display.scaleFactor);
    return {
      id: source.id,
      name: sources.length > 1 ? `Skjerm ${i + 1}` : 'Hovedskjerm',
      width,
      height,
      thumbnail: source.thumbnail.toDataURL(),
    };
  });
}

function registerShortcuts(modifier) {
  globalShortcut.unregisterAll();
  const failed = [];
  for (let n = 1; n <= 6; n++) {
    const accelerator = `${modifier}+${n}`;
    const ok = globalShortcut.register(accelerator, () => send('shortcut', { layout: n }));
    if (!ok) failed.push(accelerator);
  }
  const recordKey = `${modifier}+0`;
  if (!globalShortcut.register(recordKey, () => send('shortcut', { toggleRecord: true }))) {
    failed.push(recordKey);
  }
  return failed;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

function defaultOutputDir() {
  return path.join(app.getPath('videos'), 'OBSlite');
}

ipcMain.handle('screens:list', () => listScreens());

ipcMain.handle('screens:select', (_e, id) => {
  selectedScreenId = id;
});

ipcMain.handle('shortcuts:set', (_e, modifier) => registerShortcuts(modifier));

ipcMain.handle('window:hideFromCapture', (_e, hide) => {
  if (win) win.setContentProtection(Boolean(hide));
});

ipcMain.handle('permissions:status', async () => {
  if (!isMac) return { camera: 'granted', microphone: 'granted', screen: 'granted' };
  return {
    camera: systemPreferences.getMediaAccessStatus('camera'),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    screen: systemPreferences.getMediaAccessStatus('screen'),
  };
});

ipcMain.handle('permissions:request', async () => {
  if (!isMac) return;
  await systemPreferences.askForMediaAccess('camera').catch(() => {});
  await systemPreferences.askForMediaAccess('microphone').catch(() => {});
});

ipcMain.handle('permissions:openScreenSettings', () => {
  if (isMac) {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  }
});

ipcMain.handle('output:default', () => defaultOutputDir());

ipcMain.handle('output:choose', async (_e, current) => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Velg mappe for opptak',
    defaultPath: current || defaultOutputDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('output:reveal', (_e, filePath) => shell.showItemInFolder(filePath));

ipcMain.handle('rec:start', async (_e, { dir, ext }) => {
  const outDir = dir || defaultOutputDir();
  await fs.promises.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, `OBSlite ${timestamp()}.${ext}`);
  const handle = await fs.promises.open(filePath, 'w');
  recording = { handle, filePath, queue: Promise.resolve() };
  return filePath;
});

// Opptaket strømmes rett til disk i biter, så lange opptak ikke fyller minnet.
ipcMain.handle('rec:chunk', (_e, chunk) => {
  if (!recording) return;
  const rec = recording;
  rec.queue = rec.queue.then(() => rec.handle.write(Buffer.from(chunk)));
  return rec.queue;
});

ipcMain.handle('rec:stop', async () => {
  if (!recording) return null;
  const rec = recording;
  recording = null;
  await rec.queue;
  await rec.handle.close();
  return rec.filePath;
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'mediaKeySystem'].includes(permission));
  });

  // getDisplayMedia i rendereren får skjermen som er valgt i appen, uten systemvelger.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        const source = sources.find((s) => s.id === selectedScreenId) || sources[0];
        callback(source ? { video: source } : {});
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false }
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  app.quit();
});
