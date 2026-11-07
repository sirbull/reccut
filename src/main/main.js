const {
  app,
  BrowserWindow,
  protocol,
  Menu,
  Notification,
  desktopCapturer,
  clipboard,
  nativeImage,
  dialog,
  globalShortcut,
  ipcMain,
  net,
  screen,
  session,
  safeStorage,
  shell,
  systemPreferences,
} = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
// Source runs need their own profile and instance lock so an installed copy cannot
// silently intercept npm start. Keep installed projects/settings in their existing profile.
const developmentMode = !app.isPackaged && process.argv.includes('--reccut-development');
if (developmentMode) app.setPath('userData', path.join(app.getPath('appData'), 'Reccut Development'));
const ff = require('./ffmpeg');
const { finalizeRecordingStream } = require('./recording');
const jobs = require('./jobs');
const { SubtitleModelManager } = require('./subtitleModels');
const subtitleModels = new SubtitleModelManager({
  dir: path.join(app.getPath('userData'), 'subtitle-models'),
  legacyDir: path.join(app.getPath('userData'), 'models'),
  bundleDir: app.isPackaged ? path.join(process.resourcesPath, 'subtitle-models') : path.join(__dirname, '../../vendor/subtitle-models'),
  onChange: state => send('subtitle-models:changed', state),
  unload: () => jobs.unloadTranscription(),
});
subtitleModels.ready.catch(error => console.error('Subtitle model registry:', error));
const about = require('./about');
const { createSplashWindow } = require('./splash');
const media = require('./media');
const sequence = require('./sequence');
const decoders = require('./decoders');
const projects = require('./projects');
const psd = require('./psd');
const area = require('./area');
const packager = require('./packager');
const { createRecordUI } = require('./recordui');
const { createPipPreview } = require('./pip');
const updates = require('./updates');
const { InputTracker } = require('./input');
const { createKeystrokes, comboLabel, appShortcut, pushPress, pausedPresses } = require('./keystrokes');
const { createCorridorKey } = require('./corridorkey');

const { createExtensionHost, readDocument } = require('./extensions');
const { renderGraphic } = require('./graphics');
const extensions = createExtensionHost({ dir: path.join(app.getPath('userData'), 'extensions'), safeStorage, ffmpegPath: ff.getFfmpegPath() });

const stock=require('./stock').createStockHost({dir:path.join(app.getPath('userData'),'stock'),cacheDir:path.join(app.getPath('userData'),'Cache','Stock'),fetchImpl:(...args)=>require('electron').net.fetch(...args),safeStorage,openExternal:url=>shell.openExternal(url)});
for(const [channel,method]of Object.entries({providers:'providers',addPlugin:'addPlugin',testConnection:'testConnection',settings:'settings',search:'search',preview:'preview',download:'download',install:'install',remove:'remove',manifest:'manifest',saveKey:'saveKey',signIn:'signIn',signOut:'signOut',acceptCosts:'acceptCosts',catalog:'catalog',catalogFile:'catalogFile',catalogPreview:'catalogPreview'}))ipcMain.handle('stock:'+channel,(_event,...args)=>stock[method](...args));
const isMac = process.platform === 'darwin';

// Keep Electron's built-in UI in English, including on Norwegian systems.
app.commandLine.appendSwitch('lang', 'en-GB');

// Video og lyd skal starte uten at brukeren må klikke først.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Systemlyd fra skjermopptak på macOS 13 og nyere (ScreenCaptureKit).
app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');

// Egen protokoll for lokale mediefiler, med støtte for søking (Range) og CORS,
// slik at lyd kan gå gjennom Web Audio og bilder kan tegnes på lerret.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
};

function serveMedia(request) {
  const url = new URL(request.url);
  const file = decodeURIComponent(url.pathname.slice(1));
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
  };
  const range = request.headers.get('range');
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1]) start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), stat.size - 1);
      if (!m[1] && m[2]) {
        start = Math.max(0, stat.size - Number(m[2]));
        end = stat.size - 1;
      }
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
  }
  if (start > end || start >= stat.size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
  }
  headers['Content-Length'] = String(end - start + 1);
  const { Readable } = require('stream');
  const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
  return new Response(body, { status, headers });
}

let win = null;
let splash = null;
let startupComplete = false;
const helpWindow = require('./help').createHelpWindow({ BrowserWindow, ipcMain, getMainWindow: () => win, buildDir: path.join(__dirname, '..', '..', 'build') });
let saveFlushed = false;
let selectedScreenId = null;
let wantSystemAudio = false;
let shortcutModifier = null;
let shortcutsActive = true;
let shortcutsBlocked = true;
let backgroundShortcuts = false;
let recordingKeys = false;
const input = new InputTracker();
const openFiles = new Map();
let fileSeq = 1;
let recordingDir = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function baseDir() {
  return path.join(app.getPath('videos'), 'Reccut');
}

// Appen het tidligere OBSlite. Innstillinger, buffer og nylige prosjekter flyttes over første gang.
function migrateFromOldName() {
  if (developmentMode) return;
  try {
    const oldData = path.join(app.getPath('appData'), 'OBSlite');
    const newData = app.getPath('userData');
    if (!fs.existsSync(oldData)) return;
    // Electron kan ha laget den nye mappen allerede. Flytt alt som ikke finnes der ennå,
    // men bare første gang (før den nye mappen har egne innstillinger).
    if (fs.existsSync(path.join(newData, 'Local Storage')) || fs.existsSync(path.join(newData, 'recent-projects.json'))) return;
    fs.mkdirSync(newData, { recursive: true });
    for (const name of fs.readdirSync(oldData)) {
      const to = path.join(newData, name);
      if (!fs.existsSync(to)) fs.renameSync(path.join(oldData, name), to);
    }
    fs.rmSync(oldData, { recursive: true, force: true });
  } catch (err) {
    console.error('Could not move settings from OBSlite', err);
  }
}
migrateFromOldName();

function createWindow() {
  let painted = false;
  let workspaceReady = false;
  const showWorkspace = () => {
    if (startupComplete || !painted || !workspaceReady || !win || win.isDestroyed()) return;
    // maximize() can show a hidden window, so wait until the workspace is ready.
    win.maximize();
    win.show();
    splash?.destroy();
    splash = null;
    startupComplete = true;
  };
  const failStartup = (message) => {
    if (startupComplete) return;
    dialog.showErrorBox('Could not start Reccut', message);
    app.exit(1);
  };
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: developmentMode ? 'Reccut (Development)' : 'Reccut',
    backgroundColor: '#1b1b1d',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 16 },
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Opptak og avspilling skal fortsette selv om vinduet er skjult.
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => { painted = true; showWorkspace(); });
  ipcMain.handle('startup:stage', async (event, stage) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) return;
    if (stage === 'project') splash?.setStatus('Restoring project…');
    if (stage === 'recovery') splash?.setStatus('Checking unfinished recordings…');
    if (stage === 'ready') {
      splash?.setStatus('Ready — click outside to continue');
      await splash?.waitForDismissal();
      workspaceReady = true;
      showWorkspace();
    }
  });
  win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) failStartup(description);
  });
  win.webContents.on('render-process-gone', (_event, details) => failStartup(`The workspace stopped loading (${details.reason}).`));
  win.loadFile(path.join(__dirname, '..', '..', 'build', 'index.html')).catch((err) => failStartup(err.message));
  win.on('focus', () => { pipPreview.hide(); registerShortcuts(); });
  win.on('blur', registerShortcuts);
  win.on('move', () => send('screens:changed'));
  const resetKeyboardScope = () => {
    pipPreview.hide(); shortcutsBlocked = true; backgroundShortcuts = false; recordingKeys = false; registerShortcuts();
  };
  win.webContents.on('render-process-gone', resetKeyboardScope);
  win.webContents.on('did-start-loading', resetKeyboardScope);
  win.on('close', (e) => {
    if (recordingDir) {
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        buttons: ['Keep Recording', 'Quit Anyway'],
        defaultId: 0,
        message: 'A recording is in progress. Do you want to quit?',
      });
      if (choice === 0) {
        e.preventDefault();
        return;
      }
    }
    // La vinduet lagre prosjektet før det lukkes, så ingen endringer går tapt.
    if (!saveFlushed) {
      e.preventDefault();
      send('app:flush');
      setTimeout(() => {
        saveFlushed = true;
        win?.close();
      }, 3000);
    }
  });
  win.on('closed', () => {
    ipcMain.removeHandler('startup:stage');
    helpWindow.destroy();
    win = null;
    pipPreview.destroy();
    area.closeFrame();
    // Skjulte arbeidsvinduer skal ikke holde appen i live.
    jobs.destroyWorkers();
    app.quit();
  });
}

/* Meny med snarveier som i Final Cut Pro. Kommandoene håndteres i vinduet. */
// Menylinjen bygges fra kommandoregisteret i vinduet (src/renderer/registry.js) og sendes hit.
// Til det kommer, brukes en enkel meny så Cmd Q og tekstredigering virker.
function buildMenu() {
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Hurtigtaster med Cmd eller Ctrl som også skal virke i tekstfelt registreres i menyen.
// De andre vises bare i menyen, og håndteres av vinduet, så de ikke stjeler vanlige tastetrykk.
function menuFromTemplate(items) {
  return items.map((it) => {
    if (it.separator) return { type: 'separator' };
    if (it.role === 'about') return { label: it.label, click: about.show };
    if (it.role && !it.submenu) return { role: it.role, label: it.label, accelerator: it.accelerator };
    if (it.submenu) return { label: it.label, role: it.role, submenu: menuFromTemplate(it.submenu) };
    return {
      label: it.label,
      accelerator: it.accelerator,
      registerAccelerator: Boolean(it.register),
      type: it.checked !== undefined ? 'checkbox' : 'normal',
      checked: it.checked,
      enabled: it.enabled !== false,
      click: () => {
        if (!helpWindow.handleMenu(it.id) && win?.isFocused()) send('menu', it.id);
      },
    };
  });
}

ipcMain.handle('menu:set', (_e, items) => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuFromTemplate(items)));
});

/* Skjermvalg og opptak */

async function listScreens() {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 180 } });
  const displays = screen.getAllDisplays();
  const list = sources.map((source, i) => {
    const display = displays.find((d) => String(d.id) === source.display_id) || displays[i] || screen.getPrimaryDisplay();
    return {
      id: source.id,
      kind: 'screen',
      displayId: display.id,
      name: sources.length > 1 ? `Display ${i + 1}` : 'Main Display',
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    };
  });
  // Enkeltvinduer fra andre programmer. Reccut sine egne vinduer tas ikke med.
  try {
    const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId?.()).filter(Boolean));
    const wins = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    for (const w of wins) {
      if (own.has(w.id) || !w.name || /^Reccut$/.test(w.name)) continue;
      list.push({ id: w.id, kind: 'window', displayId: screen.getPrimaryDisplay().id, name: w.name.length > 60 ? `${w.name.slice(0, 57)}...` : w.name });
    }
  } catch (err) {
    console.warn('Could not list windows', err.message);
  }
  return list;
}

const recordingShortcuts = require('./shortcuts').createRecordingShortcuts({
  globalShortcut,
  context: () => ({
    modifier: shortcutModifier, active: shortcutsActive, blocked: shortcutsBlocked,
    background: backgroundShortcuts, recording: recordingKeys,
    focused: Boolean(win?.isFocused()),
    otherWindowFocused: Boolean(BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow() !== win),
  }),
  send: (payload) => send('shortcut', payload),
  toggleZoom: () => input.toggleZoom(),
});
function registerShortcuts() { return recordingShortcuts.refresh(); }
app.on('browser-window-focus', registerShortcuts);
app.on('browser-window-blur', () => setImmediate(registerShortcuts));

input.listener = (event) => send('input', event);

ipcMain.handle('screens:list', () => listScreens());
// Use the display containing the app, independent of the selected recording source.
ipcMain.handle('screens:current', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const display = window ? screen.getDisplayMatching(window.getBounds()) : screen.getPrimaryDisplay();
  return {
    width: Math.round(display.size.width * display.scaleFactor),
    height: Math.round(display.size.height * display.scaleFactor),
  };
});
ipcMain.handle('screens:select', (_e, { id, displayId, systemAudio, area: rect }) => {
  selectedScreenId = id;
  wantSystemAudio = Boolean(systemAudio);
  input.setDisplay(displayId);
  input.area = rect || null;
});
// Opptaksområde: pekeren, klikk og zoom regnes om til området.
ipcMain.handle('screens:area', (_e, rect) => {
  input.area = rect || null;
});
ipcMain.handle('area:select', (_e, { displayId, current }) => area.selectArea({ displayId, current, mainWindow: win }));
ipcMain.handle('area:frame', (_e, state) => area.setFrame(state));
// Status for opptaket: ikonet i menylinjen og kontrollinjen oppdateres.
const recordUI = createRecordUI({ send: (ch, payload) => send(ch, payload), getMainWindow: () => win, modifierLabel: () => (shortcutModifier || 'Control+Alt').replace('Command', 'Cmd') });
const pipPreview = createPipPreview({ getMainWindow: () => win });
ipcMain.on('rec:pipPreview', (e, frame) => {
  if (e.sender !== win?.webContents) return;
  if (frame && (frame.screenId !== selectedScreenId || !String(selectedScreenId).startsWith('screen:'))) return pipPreview.hide();
  pipPreview.update(frame);
});
ipcMain.handle('rec:state', (_e, s) => {
  recordUI.setState(s);
  if ((s.state !== 'idle') === recordingKeys) return;
  recordingKeys = !recordingKeys;
  registerShortcuts();
});
ipcMain.handle('rec:showControls', (_e, v) => recordUI.setShowControls(Boolean(v)));
ipcMain.on('control:cmd', (_e, cmd) => recordUI.command(cmd));
ipcMain.handle('window:minimize', () => win?.minimize());
ipcMain.handle('window:restore', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
});
ipcMain.handle('shortcuts:set', (_e, modifier) => {
  shortcutModifier = modifier;
  return registerShortcuts();
});
ipcMain.handle('shortcuts:active', (_e, active) => {
  shortcutsActive = active;
  return registerShortcuts();
});
ipcMain.handle('shortcuts:scope', (e, scope) => {
  if (e.sender !== win?.webContents) return [];
  shortcutsBlocked = Boolean(scope.blocked);
  backgroundShortcuts = scope.background === true;
  return registerShortcuts();
});
// Keystroke Add-on: downloaded only on request, and running only while recording.
const keystrokes = createKeystrokes({
  dir: path.join(app.getPath('userData'), 'addons', 'keystrokes'),
  version: app.getVersion(),
  repo: updates.repo(),
  fetchImpl: (url) => net.fetch(url, { headers: { 'User-Agent': `Reccut/${app.getVersion()}` } }),
});
let keySession = null;
const sessionTime = () => Math.round(Date.now() - keySession.t0) / 1000;
function onKeystroke(e) {
  if (e.type === 'press') {
    if (!keySession) return;
    pushPress(keySession.inputs, sessionTime(), e.name, e.down);
    send('input', { type: 'press', name: e.name, down: e.down });
    return;
  }
  if (e.type !== 'key') {
    if (e.type === 'error') send('keystrokes:error', e.reason);
    return;
  }
  if (!keySession || appShortcut(shortcutModifier, e.name, e.mods)) return;
  const label = comboLabel(e.name, e.mods);
  keySession.keys.push([sessionTime(), label]);
  send('input', { type: 'key', label });
}
function stopKeystrokes() {
  clearInterval(keyWatchdog);
  keyWatchdog = null;
  keystrokes.stop();
  keySession = null;
  send('keystrokes:running', false);
}
// The add-on never outlives a recording: if the recorder stops reporting, the helper stops.
let keyWatchdog = null;
let lastCheckpoint = 0;
function watchKeystrokes() {
  lastCheckpoint = Date.now();
  clearInterval(keyWatchdog);
  keyWatchdog = setInterval(() => {
    if (Date.now() - lastCheckpoint > 30000) stopKeystrokes();
  }, 5000);
}
// Stop pressed: no more keys are read while the files are being finished.
ipcMain.handle('rec:stopping', () => {
  keystrokes.stop();
  send('keystrokes:running', false);
});
const fromMain = (e) => e.sender === win?.webContents;
ipcMain.handle('keystrokes:status', () => keystrokes.status());
ipcMain.handle('keystrokes:install', (e, opts) => {
  if (!fromMain(e)) throw new Error('Not allowed.');
  return keystrokes.install({ consent: opts?.consent === true });
});
ipcMain.handle('keystrokes:allowKeyboard', (e, opts) => {
  if (!fromMain(e)) throw new Error('Not allowed.');
  return keystrokes.allowKeyboard({ consent: opts?.consent === true, mode: opts?.mode });
});
// Controller state comes from the Gamepad API in the renderer. It needs no add-on process.
ipcMain.handle('rec:pad', (e, presses, stick) => {
  if (!fromMain(e) || !keySession) return;
  const t = sessionTime();
  for (const [name, down] of presses || []) {
    if (/^Pad[A-Za-z]{1,8}$/.test(name)) pushPress(keySession.inputs, t, name, down);
  }
  if (stick?.length === 4 && stick.every(Number.isFinite)) keySession.sticks.push([t, ...stick]);
});
ipcMain.handle('keystrokes:remove', (e) => {
  if (!fromMain(e)) throw new Error('Not allowed.');
  keySession = null;
  return keystrokes.remove();
});
ipcMain.handle('keystrokes:request', (e) => {
  if (!fromMain(e)) throw new Error('Not allowed.');
  const state = keystrokes.request();
  if (state !== 'granted' && isMac) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
  return keystrokes.status();
});
ipcMain.handle('input:polling', (_e, on) => (on ? input.startPolling() : input.stopPolling()));

ipcMain.handle('window:hideFromCapture', (_e, hide) => win?.setContentProtection(Boolean(hide)));

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
ipcMain.handle('permissions:open', (_e, which) => {
  if (!isMac) return;
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
});

ipcMain.handle('paths:base', () => baseDir());
ipcMain.handle('app:flushed', async () => {
  // En siste versjon i historikken når appen lukkes.
  await projects.historySnapshot(null, 'closed').catch(() => {});
  saveFlushed = true;
  win?.close();
});
// Nye versjoner på GitHub. Uten nett gir det bare en feil som grensesnittet ignorerer.
ipcMain.handle('updates:check', () => updates.check());
let updateDownloadId = null;
ipcMain.handle('updates:download', (_e, requested) => {
  if (updateDownloadId !== null) return updateDownloadId;
  const asset = updates.resolveAsset(requested);
  const { id, done } = jobs.add({ kind: 'download', title: `Downloading ${asset.name}`, queue: 'light', run: (ctx) => {
    const ctrl = new AbortController();
    ctx.setCancel(() => ctrl.abort(new Error('Download canceled.')));
    return updates.download(asset, (p) => ctx.progress(p), ctrl.signal);
  } });
  updateDownloadId = id;
  done.then((file) => send('updates:downloaded', { id, file }), (err) => send('updates:downloaded', { id, error: err.message }))
    .finally(() => { updateDownloadId = null; });
  return id;
});
ipcMain.handle('app:version', () => app.getVersion());
// Bare nettadresser til GitHub åpnes i nettleseren.
ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https:\/\/(github\.com|aistudio\.google\.com|console\.anthropic\.com|platform\.openai\.com|console\.higgsfield\.ai|ollama\.com|lmstudio\.ai|openrouter\.ai|console\.mistral\.ai|console\.groq\.com|www\.python\.org|www\.blackmagicdesign\.com|www\.red\.com|www\.arri\.com|imaging\.nikon\.com)\//.test(String(url))) return shell.openExternal(url);
});
ipcMain.handle('history:list', (_e, file) => projects.historyList(file));
ipcMain.handle('history:load', (_e, snap, file) => projects.historyLoad(snap, file));
ipcMain.handle('history:snapshot', (_e, file, reason) => projects.historySnapshot(file, reason));

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

// base er opptaksmappen i det åpne prosjektet.
// Et merke om at et opptak pågår. Krasjer appen, finnes merket ved neste start, og opptaket
// kan reddes fra filene som allerede er skrevet til disk.
const markerFile = () => path.join(app.getPath('userData'), 'recording-in-progress.json');

ipcMain.handle('rec:begin', async (_e, { t0, base, keys }) => {
  const dir = path.join(base || path.join(baseDir(), 'Recordings'), `Recording ${stamp()}`);
  await fs.promises.mkdir(dir, { recursive: true });
  recordingDir = dir;
  await fs.promises.writeFile(markerFile(), JSON.stringify({ dir, t0 })).catch(() => {});
  input.beginSession(t0);
  input.startPolling();
  stopKeystrokes();
  if (keys) {
    keySession = { t0, keys: [], inputs: [], sticks: [] };
    if (keystrokes.start(onKeystroke, keys)) {
      watchKeystrokes();
      send('keystrokes:running', true);
    } else if (!keys.pad) keySession = null;
  }
  return dir;
});

ipcMain.handle('rec:open', async (_e, name) => {
  const file = path.join(recordingDir, name);
  const handle = await fs.promises.open(file, 'w');
  const id = fileSeq++;
  openFiles.set(id, { handle, file, queue: Promise.resolve() });
  return id;
});

// Opptaket strømmes rett til disk i biter, så lange opptak ikke fyller minnet.
ipcMain.handle('rec:write', (_e, id, chunk) => {
  const f = openFiles.get(id);
  if (!f) return;
  f.queue = f.queue.then(() => f.handle.write(Buffer.from(chunk)));
  return f.queue;
});

ipcMain.handle('rec:close', async (_e, id) => {
  const f = openFiles.get(id);
  if (!f) return;
  openFiles.delete(id);
  await f.queue;
  await f.handle.close();
});

// Avslutter opptaket i valgt format og skriver recording.json.
// Pauser: hendelser i en pause fjernes, og tiden etter flyttes tilbake med lengden på pausene.
function removePauses(out, pauses) {
  if (!pauses?.length) return out;
  const ps = pauses.filter((p) => p[1] > p[0]).sort((a, b) => a[0] - b[0]);
  const shift = (t) => {
    let d = 0;
    for (const [a, b] of ps) {
      if (t >= b) d += b - a;
      else if (t > a) return { t: a - d, inside: true };
    }
    return { t: Math.round((t - d) * 1000) / 1000, inside: false };
  };
  const points = (list) => (list || []).map((e) => [shift(e[0]), ...e.slice(1)]).filter(([s]) => !s.inside).map(([s, ...rest]) => [s.t, ...rest]);
  out.cursor = points(out.cursor);
  if (out.keys) out.keys = points(out.keys);
  if (out.inputs) out.inputs = pausedPresses(out.inputs, shift);
  if (out.sticks) out.sticks = points(out.sticks);
  out.layouts = (out.layouts || []).map(([t, v]) => [shift(t).t, v]);
  out.zooms = (out.zooms || []).map(([a, b]) => [shift(a).t, shift(b).t]).filter(([a, b]) => b > a);
  delete out.pauses;
  return out;
}

// Mellomlagring under opptak (hvert femte sekund): oppsett og hendelser så langt.
ipcMain.handle('rec:checkpoint', async (_e, meta) => {
  lastCheckpoint = Date.now();
  if (!recordingDir) return;
  const events = input.session ? { cursor: input.session.cursor, zooms: input.session.zooms, ...(keySession ? { keys: keySession.keys, inputs: keySession.inputs, sticks: keySession.sticks } : {}) } : {};
  await fs.promises.writeFile(path.join(recordingDir, 'recording.partial.json'), JSON.stringify({ ...meta, ...events, savedAt: Date.now() })).catch(() => {});
});

// Opptak som ikke ble avsluttet (krasj eller strømbrudd).
ipcMain.handle('rec:recoverList', async () => {
  try {
    const m = JSON.parse(await fs.promises.readFile(markerFile(), 'utf8'));
    if (recordingDir || !fs.existsSync(m.dir)) return [];
    const files = (await fs.promises.readdir(m.dir)).filter((f) => f.includes('.raw.'));
    if (!files.length) {
      await fs.promises.unlink(markerFile()).catch(() => {});
      return [];
    }
    let size = 0;
    for (const f of files) size += (await fs.promises.stat(path.join(m.dir, f))).size;
    return [{ dir: m.dir, t0: m.t0, size, name: path.basename(m.dir) }];
  } catch {
    return [];
  }
});

ipcMain.handle('rec:recover', async (_e, dir) => {
  let partial = {};
  try {
    partial = JSON.parse(await fs.promises.readFile(path.join(dir, 'recording.partial.json'), 'utf8'));
  } catch {}
  const out = { version: 1, id: crypto.randomUUID(), name: path.basename(dir), createdAt: new Date(partial.t0 || Date.now()).toISOString(), recovered: true, fps: 30, layouts: [[0, 6]], cursor: [], zooms: [], ...partial };
  delete out.savedAt;
  // Zoom som var på da det stoppet, avsluttes ved siste kjente tid.
  const end = Math.max(0, ...(out.cursor || []).map((c) => c[0]), ...(out.keys || []).map((k) => k[0]));
  out.zooms = (out.zooms || []).map(([a, b]) => [a, b ?? end]);
  // Før filene skrives, så dataene i filene har riktige tider.
  removePauses(out, out.pauses);
  const sources = [];
  out.formatWarnings = [];
  for (const f of await fs.promises.readdir(dir)) {
    const m = f.match(/^(screen|camera)\.raw\.(\w+)$/);
    if (!m) continue;
    const key = m[1];
    const result = await finalizeRecordingStream(dir, { ...(partial[key] || {}), raw: f, file: partial[key]?.file || `${key}.${m[2]}`, offset: partial[key]?.offset || 0 }, undefined, { ...out, part: key });
    out[key] = result.stream;
    if (result.warning) out.formatWarnings.push(result.warning);
    if (result.stream.file !== f) sources.push(f);
  }
  await fs.promises.writeFile(path.join(dir, 'recording.json'), JSON.stringify(out, null, 1));
  for (const file of sources) await fs.promises.unlink(path.join(dir, file)).catch(() => {});
  await fs.promises.unlink(path.join(dir, 'recording.partial.json')).catch(() => {});
  await fs.promises.unlink(markerFile()).catch(() => {});
  return dir;
});

ipcMain.handle('rec:discard', async (_e, dir) => {
  await fs.promises.unlink(markerFile()).catch(() => {});
  if (dir) await shell.trashItem(dir).catch(() => {});
});

ipcMain.handle('rec:finish', async (_e, meta) => {
  const dir = recordingDir;
  recordingDir = null;
  const events = input.endSession() || { cursor: [], zooms: [] };
  if (keySession) Object.assign(events, { keys: keySession.keys, inputs: keySession.inputs, sticks: keySession.sticks });
  stopKeystrokes();
  const out = removePauses({ version: 1, id: crypto.randomUUID(), name: path.basename(dir), createdAt: new Date().toISOString(), ...meta, ...events }, meta.pauses);
  const sources = [];
  out.formatWarnings = [];
  for (const key of ['screen', 'camera']) {
    const s = meta[key];
    if (!s) continue;
    const result = await finalizeRecordingStream(dir, s, undefined, { ...out, part: key });
    out[key] = result.stream;
    if (result.warning) out.formatWarnings.push(result.warning);
    if (result.stream.file !== s.raw) sources.push(s.raw);
  }
  await fs.promises.writeFile(path.join(dir, 'recording.json'), JSON.stringify(out, null, 1));
  for (const file of sources) await fs.promises.unlink(path.join(dir, file)).catch(() => {});
  await fs.promises.unlink(path.join(dir, 'recording.partial.json')).catch(() => {});
  await fs.promises.unlink(markerFile()).catch(() => {});
  return { dir, warnings: out.formatWarnings };
});

/* Media */

const notifyAnalyzed = (payload) => send('media:analyzed', payload);

ipcMain.handle('media:import', (_e, files) => media.importFiles(files, notifyAnalyzed));
// Bildesekvens: videoen lages i bakgrunnen og importeres så som vanlig video.
// outDir: prosjektets mediemappe når filene kopieres inn, ellers ved siden av bildene.
ipcMain.handle('media:importSequence', async (_e, file, fps, outDir) => {
  const dirs = [outDir || path.dirname(file), path.join(media.cacheRoot(), 'sequences')];
  const { done } = jobs.add({ kind: 'sequence', title: `Creating video from ${path.basename(file)}`, queue: 'optimize', run: (ctx) => sequence.render(file, fps, dirs, ctx) });
  return media.importFiles([await done], notifyAnalyzed);
});
ipcMain.handle('decoders:locate', (_e, tool) => decoders.locate(tool, win));
ipcMain.handle('media:importRecording', (_e, dir) => media.recordingMedia(dir, notifyAnalyzed));
ipcMain.handle('media:recordingPaths', (_e, files) => media.recordingPaths(files));
ipcMain.handle('media:reanalyze', async (_e, items) => {
  // Kjøres når et prosjekt åpnes, slik at bufrede analyser hentes inn igjen.
  for (const m of items) {
    if (m.kind === 'recording') await media.recordingMedia(m.path, (p) => notifyAnalyzed({ ...p, mediaId: m.id })).catch(() => {});
    else await media.importFiles([m.path], (p) => notifyAnalyzed({ ...p, mediaId: m.id })).catch(() => {});
  }
});
ipcMain.handle('media:reverse', (_e, m) => {
  media.scheduleReverse(m, notifyAnalyzed);
});
// Malpakken: kopierer skriptene og beskrivelsen til en mappe brukeren velger, pluss eksempelmalen.
ipcMain.handle('kit:save', async (_e, exampleJson) => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose where to save the Reccut Template Kit', defaultPath: app.getPath('downloads'), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return null;
  const dir = path.join(r.filePaths[0], 'Reccut Template Kit');
  await fs.promises.mkdir(dir, { recursive: true });
  const src = path.join(__dirname, '..', '..', 'build', 'template-kit');
  for (const f of await fs.promises.readdir(src)) await fs.promises.writeFile(path.join(dir, f), await fs.promises.readFile(path.join(src, f)));
  await fs.promises.writeFile(path.join(dir, 'Example Lower Third.reccut-title'), exampleJson);
  shell.showItemInFolder(path.join(dir, 'README.txt'));
  return dir;
});
/* Lagdelte filer (PSD). Dokumentet huskes mellom oversikten og uttrekket. */
const psdDocs = new Map();
ipcMain.handle('layers:psd', async (_e, file) => {
  const doc = await psd.readPsd(file);
  psdDocs.set(file, doc);
  const merged = doc.composite || psd.flatten(doc, doc.layers.filter((l) => l.visible));
  return {
    width: doc.width,
    height: doc.height,
    thumb: psd.thumbnail(doc, merged, 160),
    layers: doc.layers.map((l) => ({ index: l.index, name: l.name, group: l.group, visible: l.visible, thumb: psd.thumbnail(doc, psd.layerCanvas(doc, l), 64) })),
  };
});
// Skriver valgte lag som PNG i dokumentets størrelse, eller ett sammenslått bilde.
ipcMain.handle('layers:psdExtract', async (_e, file, indices, mode, outDir) => {
  const doc = psdDocs.get(file) || (await psd.readPsd(file));
  await fs.promises.mkdir(outDir, { recursive: true });
  const base = path.basename(file, path.extname(file));
  const safe = (s) => String(s).replace(/[\\/:*?"<>|]/g, '_').trim() || 'Layer';
  const chosen = doc.layers.filter((l) => indices.includes(l.index));
  const out = [];
  if (mode === 'merged') {
    const all = indices.length === doc.layers.length && doc.composite && doc.layers.every((l) => l.visible);
    const rgba = all ? doc.composite : psd.flatten(doc, chosen);
    const target = path.join(outDir, `${safe(base)}.png`);
    await fs.promises.writeFile(target, psd.encodePng(rgba, doc.width, doc.height));
    out.push({ path: target, name: base });
  } else {
    for (const l of chosen) {
      const target = path.join(outDir, `${safe(base)} ${String(l.index + 1).padStart(2, '0')} ${safe(l.name)}.png`);
      await fs.promises.writeFile(target, psd.encodePng(psd.layerCanvas(doc, l), doc.width, doc.height));
      out.push({ path: target, name: `${base}: ${l.name}` });
    }
  }
  return out;
});
ipcMain.handle('file:writeBinary', async (_e, file, data) => {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file, Buffer.from(data));
});
const designCleanup = require('./designCleanup');
designCleanup.onCollected(value=>send('design:cutoutsCollected',value));
ipcMain.handle('design:retainCutouts',(_e,id,paths)=>designCleanup.retain(id,paths));
ipcMain.handle('design:discardCutout',(_e,file)=>designCleanup.discard(file));
ipcMain.handle('design:videoThumbnail',(_e,file,data)=>require('./design').writeVideoThumbnail(file,data));
ipcMain.handle('design:readableImage', (_e, file) => media.readableImage(file));
ipcMain.handle('design:imageExtensions', () => media.imageExtensions());
ipcMain.handle('design:writeImage', async (_e, file, data) => designCleanup.register(await require('./design').writeImage(file, data)));
let designLibrary;
function getDesignLibrary() {
  if(!designLibrary)designLibrary=require('./designLibrary').createDesignLibrary(app.getPath('userData'),require('../../build/designTemplates.cjs').validateDesignTemplate);
  return designLibrary;
}
ipcMain.handle('design:templates:list',()=>getDesignLibrary().list());
ipcMain.handle('design:templates:save',(_e,data,id)=>getDesignLibrary().save(data,id));
ipcMain.handle('design:templates:remove',(_e,id)=>getDesignLibrary().remove(id));
ipcMain.handle('design:brand:logo',()=>getDesignLibrary().logo());
ipcMain.handle('design:brand:setLogo',(_e,file)=>getDesignLibrary().setLogo(file));
function startDesignSegment(payload) {
  if (!payload || typeof payload.path !== 'string' || !path.isAbsolute(payload.path)) throw new Error('Choose a local image to remove its background.');
  const model = require('./designModels');
  const modelDir = app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(__dirname, '..', '..', 'vendor', 'models');
  let result;
  const task=jobs.add({ kind: 'segment', title: 'Removing background', queue: 'heavy', run: async (ctx) => { result=await jobs.runInWorker('segment', { path: payload.path, maxSide: Math.max(1, Math.min(2048, Number(payload.maxSide) || 1024)), model: model.id, fallback: model.fallback, modelDir }, ctx);return {width:result.width,height:result.height,model:result.model,device:result.device}; } });
  return {id:task.id,done:task.done.then(()=>result)};
}
ipcMain.handle('design:segment', (_e, payload) => startDesignSegment(payload).done);
ipcMain.handle('design:segmentStart', (_e, payload) => {
  const { id, done } = startDesignSegment(payload);
  done.then((result) => send('design:segmentDone', { id, result }), (err) => send('design:segmentDone', { id, error: String(err.message || err) }));
  return id;
});
ipcMain.handle('design:clipboardRead', () => require('./design').readClipboard(clipboard, (bytes) => nativeImage.createFromBuffer(bytes).toPNG()));
ipcMain.handle('design:clipboardWrite', (_e, text) => clipboard.writeText(String(text)));

ipcMain.handle('media:analyzeMotion', (_e, m) => {
  media.scheduleMotion(m, notifyAnalyzed);
});
// Følger et objekt i videoen (se track i motion.js), så et klipp kan festes til det.
ipcMain.handle('media:track', (_e, file, opts) => {
  const { done } = jobs.add({
    kind: 'analyze',
    title: 'Tracking motion',
    queue: 'light',
    run: (ctx) => require('./motion').track(ff.getFfmpegPath(), file, { ...opts, onProgress: (p) => ctx.progress(p), isCanceled: ctx.isCanceled }),
  });
  return done;
});
ipcMain.handle('media:details', (_e, file) => ff.details(file));
// Sceneskift (nytt vindu, ny side, kameraklipp) for AI-agenten. Bildet skaleres ned først, så
// også lange skjermopptak går raskt. Resultatet er [[sekund, styrke 0 til 1], ...].
ipcMain.handle('media:scenes', (_e, file, duration) => {
  const { done } = jobs.add({
    kind: 'analyze',
    title: 'Finding scene changes',
    queue: 'light',
    run: async (ctx) => {
      const job = ff.run(
        ['-hwaccel', 'auto', '-i', file, '-an', '-sn', '-vf', "fps=4,scale=160:-2,select='gte(scene\\,0.04)',metadata=print:file=-", '-f', 'null', '-'],
        { onProgress: (t) => ctx.progress(Math.min(0.99, t / Math.max(duration || 1, 1))) }
      );
      ctx.setCancel(job.kill);
      const out = (await job.promise).toString();
      return [...out.matchAll(/pts_time:([\d.]+)\s+lavfi\.scene_score=([\d.]+)/g)].map((m) => [Number(m[1]), Math.round(Number(m[2]) * 100) / 100]);
    },
  });
  return done;
});
ipcMain.handle('media:offline', (_e, items) => items.filter((m) => media.isOffline(m)).map((m) => m.id));
ipcMain.handle('media:relink', (_e, m, file) => media.relink(m, file, notifyAnalyzed));
ipcMain.handle('media:optimize', (_e, items, outDir) => {
  for (const m of items) media.scheduleOptimize(m, outDir, notifyAnalyzed);
});
ipcMain.handle('media:wave', async (_e, file) => JSON.parse(await fs.promises.readFile(file, 'utf8')));
ipcMain.handle('media:exists', (_e, file) => fs.existsSync(file));
// Opptak i prosjektets opptaksmappe, og i den felles mappen fra eldre versjoner.
ipcMain.handle('media:recordings', async (_e, projectDir) => {
  const out = [];
  for (const dir of [projectDir, path.join(baseDir(), 'Recordings'), path.join(path.dirname(baseDir()), 'OBSlite', 'Recordings')]) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of await fs.promises.readdir(dir)) {
      const full = path.join(dir, name);
      if (fs.existsSync(path.join(full, 'recording.json'))) {
        const st = await fs.promises.stat(full);
        out.push({ name: dir === projectDir ? name : `${name} (older)`, path: full, modified: st.mtimeMs });
      }
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
});
ipcMain.handle('file:read', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('file:write', async (_e, file, data) => fs.promises.writeFile(file, data));

/* Dialoger og filsystem */

ipcMain.handle('browse:dir', (_e, dir) => media.browseDir(dir));
ipcMain.handle('browse:thumb', (_e, file) => media.browseThumb(file).catch(() => null));
ipcMain.handle('browse:places', () => media.browsePlaces());

ipcMain.handle('dialog:openMedia', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Import Media',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Media', extensions: media.extensions() },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:openFile', async (_e, { title, filters }) => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openFile'], filters });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('dialog:saveFile', async (_e, { title, defaultPath, filters }) => {
  const r = await dialog.showSaveDialog(win, { title, defaultPath, filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('dialog:chooseDir', async (_e, current) => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose Folder', defaultPath: current || baseDir(), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('shell:reveal', (_e, file) => shell.showItemInFolder(file));
ipcMain.handle('shell:open', (_e, file) => shell.openPath(file));

ipcMain.handle('menu:popup', (e, items) => {
  return new Promise((resolve) => {
    let chosen = null;
    // Doble skillelinjer og skillelinjer i kantene fjernes.
    const tidy = (list) => list.filter((it, i) => !it.separator || (i > 0 && i < list.length - 1 && !list[i + 1].separator));
    const build = (list) =>
      tidy(list).map((it) =>
        it.separator
          ? { type: 'separator' }
          : it.submenu
          ? { label: it.label, submenu: build(it.submenu) }
          : { label: it.label, accelerator: it.accelerator, enabled: it.enabled !== false, type: it.checked !== undefined ? 'checkbox' : 'normal', checked: it.checked, registerAccelerator: false, click: () => (chosen = it.id) }
      );
    const menu = Menu.buildFromTemplate(build(items));
    menu.popup({ window: BrowserWindow.fromWebContents(e.sender), callback: () => setTimeout(() => resolve(chosen), 0) });
  });
});

/* Prosjekter */

ipcMain.handle('projects:list', () => projects.list(baseDir()));
ipcMain.handle('projects:load', (_e, file) => projects.load(file));
ipcMain.handle('projects:save', (_e, project, file) => projects.save(baseDir(), project, file));
ipcMain.handle('projects:saveAs', (_e, { project, location, name }) => projects.saveAs(project, location, name));
ipcMain.handle('package:sizes', (_e, paths) => packager.sizes(paths));
ipcMain.handle('package:start', (_e, payload) => {
  const { id, done } = jobs.add({ kind: 'package', title: `Packaging ${payload.name}`, queue: 'heavy', run: (ctx) => packager.packageProject(payload, ctx) });
  done.then((r) => send('package:done', { id, ...r })).catch((err) => send('package:done', { id, error: err.message }));
  return id;
});
ipcMain.handle('projects:create', (_e, { location, name }) => projects.create(location || baseDir(), name));
ipcMain.handle('projects:folders', (_e, file) => projects.folders(baseDir(), file));
ipcMain.handle('projects:forget', (_e, file) => projects.forget(file));
ipcMain.handle('projects:trash', (_e, file) => projects.trash(baseDir(), file));
ipcMain.handle('projects:rename', (_e, file, name) => projects.rename(file, name));
ipcMain.handle('dialog:openProject', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open Project', defaultPath: baseDir(), properties: ['openFile'], filters: [{ name: 'Reccut Project', extensions: ['reccut', 'obslite'] }] });
  return r.canceled ? null : r.filePaths[0];
});

// Kopierer filer inn i prosjektmappen. Filer som allerede ligger der, brukes som de er.
ipcMain.handle('media:copyIn', (_e, files, dir, options = {}) => {
  const { done } = jobs.add({
    kind: 'copy',
    title: files.length > 1 ? `Copying ${files.length} files to the project` : `Copying ${path.basename(files[0])} to the project`,
    queue: 'light',
    run: async (ctx) => {
      await fs.promises.mkdir(dir, { recursive: true });
      const sizes = await Promise.all(files.map((f) => fs.promises.stat(f).then((st) => st.size, () => 0)));
      const total = sizes.reduce((a, b) => a + b, 0) || 1;
      let copied = 0;
      const out = [];
      for (const [i, file] of files.entries()) {
        if (path.dirname(file) === dir || fs.statSync(file).isDirectory()) {
          out.push(file);
          continue;
        }
        const ext = path.extname(file);
        const stem = path.basename(file, ext);
        let target = path.join(dir, path.basename(file));
        let n = 2;
        while (fs.existsSync(target) && (options.unique || fs.statSync(target).size !== sizes[i])) target = path.join(dir, `${stem} ${n++}${ext}`);
        if (!fs.existsSync(target)) {
          const tmp = target + '.part';
          await new Promise((resolve, reject) => {
            const rs = fs.createReadStream(file);
            const ws = fs.createWriteStream(tmp);
            ctx.setCancel(() => rs.destroy(new Error('Canceled')));
            rs.on('data', (b) => {
              copied += b.length;
              ctx.progress(copied / total, 'Copying');
            });
            rs.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', resolve);
            rs.pipe(ws);
          });
          await fs.promises.rename(tmp, target);
          const st = await fs.promises.stat(file);
          await fs.promises.utimes(target, st.atime, st.mtime).catch(() => {});
        } else copied += sizes[i];
        out.push(target);
      }
      return out;
    },
  });
  return done;
});

/* Bakgrunnsoppgaver */

jobs.onChange((list) => send('tasks', list));
ipcMain.handle('tasks:list', () => jobs.snapshot());
ipcMain.handle('tasks:cancel', (_e, id) => jobs.cancel(id));
ipcMain.handle('tasks:clear', () => jobs.clearFinished());

// Overskriv aldri en eksisterende fil, eller en som allerede står i køen.
const reservedOutputs = new Set();
function uniqueOutput(file) {
  const ext = path.extname(file);
  const base = file.slice(0, -ext.length);
  let out = file;
  let n = 2;
  while (fs.existsSync(out) || reservedOutputs.has(out)) out = `${base} ${n++}${ext}`;
  reservedOutputs.add(out);
  return out;
}

ipcMain.handle('export:start', (_e, payload) => {
  payload = { ...payload, settings: { ...payload.settings, output: uniqueOutput(payload.settings.output) } };
  const { id, done } = jobs.add({
    kind: 'export',
    title: `Exporting ${path.basename(payload.settings.output)}`,
    queue: 'heavy',
    run: async (ctx) => {
      // Baklengs klipp trenger en baklengs kopi av kilden for å eksporteres raskt.
      const p = payload.project;
      // Media som mangler, eksporteres som testkortet Media Offline.
      for (const m of Object.values(p.media)) m.offline = media.isOffline(m);
      // Originaler WebCodecs ikke kan lese (ProRes, DNxHD ...) dekodes av FFmpeg i eksporten, med samme filtre som kopien.
      for (const m of Object.values(p.media)) {
        if (m.kind === 'image') continue;
        for (const st of Object.values(m.streams)) if (st.hasVideo && st.needsProxy) st.decodeFilters = ff.decodeFilters(st);
      }
      for (const c of payload.settings.frame ? [] : Object.values(p.clips)) {
        const m = c.reverse && !p.media[c.mediaId]?.offline && p.media[c.mediaId];
        if (!m) continue;
        for (const [key, st] of Object.entries(m.streams)) {
          if (st.reversed && fs.existsSync(st.reversed)) continue;
          ctx.progress(0, 'Creating reversed media');
          st.reversed = await media.reverseStream(st, ctx);
          notifyAnalyzed({ mediaId: m.id, stream: key, patch: { reversed: st.reversed } });
        }
      }
      return jobs.runInWorker('export', { ...payload, ffmpeg: ff.getFfmpegPath(), tmpDir: path.join(os.tmpdir(), 'reccut-export') }, ctx);
    },
  });
  done.finally(() => reservedOutputs.delete(payload.settings.output)).catch(() => {});
  done.then(
    (file) => {
      send('export:done', { id, file, quiet: Boolean(payload.settings.quiet) });
      if (!payload.settings.quiet && Notification.isSupported() && !win?.isFocused()) {
        new Notification({ title: 'Export finished', body: path.basename(file) }).show();
      }
    },
    () => {}
  );
  return id;
});

ipcMain.handle('transcribe:start', async (_e, payload) => {
  const lease = await subtitleModels.acquireActiveModel();
  const { id, done } = jobs.add({
    kind: 'transcribe',
    title: 'Generating captions',
    queue: 'heavy',
    run: async (ctx) => {
      ctx.progress(0, 'Reading audio');
      const audio = await mixForTranscription(payload, ctx);
      if (ctx.isCanceled()) throw new Error('Canceled');
      const result = await jobs.runInWorker('transcribe', { ...payload, model: lease.model, audio }, ctx);
      if (ctx.isCanceled()) throw new Error('Canceled');
      return result;
    },
  });
  done.then((result) => send('transcribe:done', { id, ...result, payload }), (err) => send('transcribe:error', { id, error: String(err.message || err), payload: { agent: payload.agent } })).finally(lease.release);
  return id;
});

// Whisper trenger 16 kHz mono. Hver lydkilde dekodes og legges på riktig sted.
async function mixForTranscription({ sources, duration }, ctx) {
  const rate = 16000;
  const out = new Float32Array(Math.ceil(duration * rate));
  for (const [i, s] of sources.entries()) {
    if (ctx.isCanceled()) throw new Error('Canceled');
    const job = ff.decodePcm(s.path, { start: s.in, duration: s.dur, rate, channels: 1 });
    ctx.setCancel(job.kill);
    const buf = await job.promise;
    const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const gain = s.gain ?? 1;
    // Audio is mapped into timeline time before inference, including trims and speed ramps.
    const { mixSpeechSource } = require('../../build/subtitleAudio.cjs');
    mixSpeechSource(out, pcm, s, rate, gain);
    ctx.progress(((i + 1) / sources.length) * 0.1, 'Reading audio');
  }
  return out;
}

// Talemodellene for teksting lagres på disk, slik at de bare lastes ned én gang.
function modelCachePath(key) {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(app.getPath('userData'), 'models', hash);
}
ipcMain.handle('modelcache:get', async (_e, key) => {
  const subtitleFile = await subtitleModels.readModelFile(key);
  if (subtitleFile) return subtitleFile;
  const file = modelCachePath(key);
  return fs.existsSync(file) ? new Uint8Array(await fs.promises.readFile(file)) : null;
});
ipcMain.handle('modelcache:put', async (_e, key, data) => {
  const file = modelCachePath(key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file + '.tmp', Buffer.from(data));
  await fs.promises.rename(file + '.tmp', file);
});

// Prosjektfiler som åpnes fra Finder eller Utforsker (dobbeltklikk på en .reccut-fil).
let pendingOpen = process.argv.find((a) => a.endsWith('.reccut')) || null;
// Plugin files (.reccut-plugin) opened from Finder or Explorer are shown for review, never installed directly.
let pendingPlugin = process.argv.find((a) => a.endsWith('.reccut-plugin')) || null;
function openProjectFromOS(file) {
  if (file?.endsWith('.reccut-plugin')) {
    if (win && !win.webContents.isLoading()) send('plugin:open', file);
    else pendingPlugin = file;
    return;
  }
  if (!file || !file.endsWith('.reccut')) return;
  if (win && !win.webContents.isLoading()) send('project:open', file);
  else pendingOpen = file;
}
// Bare én Reccut om gangen: åpnes en prosjektfil mens appen kjører, åpnes den i vinduet.
if (!app.requestSingleInstanceLock()) {
  console.info('Reccut is already running; activating its window.');
  app.quit();
}
app.on('second-instance', (_e, argv) => {
  openProjectFromOS(argv.find((a) => a.endsWith('.reccut') || a.endsWith('.reccut-plugin')));
  if (win) {
    if (win.isMinimized()) win.restore();
    if (startupComplete) { win.show(); win.focus(); }
  }
});
app.on('open-file', (e, file) => {
  e.preventDefault();
  openProjectFromOS(file);
});
ipcMain.handle('plugins:pendingOpen', () => {
  const f = pendingPlugin;
  pendingPlugin = null;
  return f;
});
ipcMain.handle('project:pendingOpen', () => {
  const f = pendingOpen;
  pendingOpen = null;
  return f;
});

app.whenReady().then(async () => {
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(event, () => send('screens:changed'));
  splash = createSplashWindow({ BrowserWindow, version: app.getVersion() });
  try {
    await splash.ready;
  } catch (err) {
    console.error(err);
    splash.destroy();
    splash = null;
  }
  splash?.setStatus('Loading workspace…');
  // Ferdigbygd app får ikonet fra electron-builder; under utvikling viser Docken ellers Electron-ikonet.
  if (!app.isPackaged) app.dock?.setIcon(path.join(__dirname, '../../assets/icon-mac.png'));
  protocol.handle('media', serveMedia);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'mediaKeySystem', 'notifications', 'fullscreen'].includes(permission) || permission==='local-fonts'&&_wc===win?.webContents);
  });

  // getDisplayMedia i vinduet får skjermen som er valgt i appen, uten systemvelger.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: String(selectedScreenId).startsWith('window:') ? ['window'] : ['screen'] });
        const source = sources.find((s) => s.id === selectedScreenId) || sources[0];
        if (!source) return callback({});
        const audio = wantSystemAudio && process.platform !== 'linux' ? 'loopback' : undefined;
        callback(audio ? { video: source, audio } : { video: source });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: false }
  );

  buildMenu();
  createWindow();
  recordUI.init();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let subtitleShutdown = false;
app.on('will-quit', event => {
  // At this point every window has accepted closing. A recording's "Keep
  // Recording" action must not permanently shut down the model manager.
  event.preventDefault();
  if (subtitleShutdown) return;
  subtitleShutdown = true;
  subtitleModels.shutdown().catch(error => console.error(error)).finally(() => {
    splash?.destroy();
    area.closeFrame();
    pipPreview.destroy();
    recordUI.destroy();
    globalShortcut.unregisterAll();
    input.stop();
    keystrokes.stop();
    jobs.destroyWorkers();
    // All windows have already closed. Re-entering app.quit() from will-quit
    // can leave Electron alive after an asynchronous prevented quit.
    app.exit(0);
  });
});

// A failed splash may be destroyed before the workspace window is created.
app.on('window-all-closed', () => { if (!splash) app.quit(); });

// Only the main app frame can configure credentials or launch a local processor.
function extensionHandler(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Only the main app can use extensions.');
    return handler(...args);
  });
}
extensionHandler('ai:config', () => extensions.aiConfig());
extensionHandler('subtitle-models:list', () => subtitleModels.listAvailableModels());
extensionHandler('subtitle-models:download', id => subtitleModels.downloadModel(id));
extensionHandler('subtitle-models:cancel', id => subtitleModels.cancelDownload(id));
extensionHandler('subtitle-models:select', id => subtitleModels.setActiveModel(id));
extensionHandler('subtitle-models:remove', async id => {
  const state = await subtitleModels.listAvailableModels(), model = state.models.find(m => m.id === id);
  if (!model?.installed || !model.removable) throw new Error('This model cannot be deleted.');
  const { response } = await dialog.showMessageBox(win, { type: 'question', title: 'Delete this subtitle model?', message: 'Delete this subtitle model?', detail: `${model.name} — ${(model.installedSizeBytes / 1e6).toFixed(1)} MB\nThe model can be downloaded again later.`, buttons: ['Cancel', 'Delete'], defaultId: 0, cancelId: 0, noLink: true });
  return response === 1 ? subtitleModels.removeModel(id) : subtitleModels.listAvailableModels();
});
extensionHandler('ai:save', (config) => extensions.saveAI(config));
extensionHandler('ai:complete', (request) => extensions.complete(request));
extensionHandler('ai:models', (config) => extensions.listModels(config));
extensionHandler('ai:readDocument', (file) => readDocument(String(file)));
extensionHandler('plugins:draft', (raw) => extensions.draftProcessor(raw));
extensionHandler('gen:config', () => extensions.genConfig());
extensionHandler('gen:save', (raw) => extensions.saveGen(raw));
extensionHandler('gen:estimate', (req) => extensions.estimateVideo(req));
extensionHandler('gen:video', (req) => {
  const { done } = jobs.add({ kind: 'generate', title: 'Generating video', queue: 'light', run: (ctx) => extensions.generateVideo(req, ctx, path.join(baseDir(), 'Generated')) });
  return done;
});
extensionHandler('gfx:render', (req) => {
  const { done } = jobs.add({ kind: 'graphic', title: `Rendering ${String(req?.name || 'graphic').slice(0, 40)}`, queue: 'heavy', run: (ctx) => renderGraphic(req, ctx, path.join(baseDir(), 'Generated')) });
  return done;
});
extensionHandler('plugins:list', () => extensions.listPlugins());
extensionHandler('plugins:install', (manifest, opts) => extensions.installPlugin(manifest, opts));
extensionHandler('plugins:readFile', (file) => extensions.readPluginFile(String(file)));
extensionHandler('plugins:installPackage', (pkg, opts) => extensions.installPackage(pkg, opts));
extensionHandler('plugins:export', async (id, opts) => {
  const pkg = extensions.exportPlugin(id, opts);
  const r = await dialog.showSaveDialog(win, { title: 'Export Plugin', defaultPath: path.join(app.getPath('documents'), `${pkg.name.replace(/[\\/:*?"<>|]+/g, '')}.reccut-plugin`), filters: [{ name: 'Reccut Plugin', extensions: ['reccut-plugin'] }] });
  if (r.canceled || !r.filePath) return null;
  await fs.promises.writeFile(r.filePath, JSON.stringify(pkg, null, 2));
  return r.filePath;
});
extensionHandler('plugins:remove', async (id) => {
  const list = extensions.removePlugin(id);
  if (id === 'corridorkey') await corridorKey.remove(); // Several GB; it goes with the plugin.
  return list;
});
// Roto Brush Add-on: downloaded only after the user has read what it is. See src/main/roto.js.
require('./roto').registerRoto({
  handle: extensionHandler,
  roto: require('./roto').createRoto({
    dir: path.join(app.getPath('userData'), 'addons', 'roto'),
    cacheDir: path.join(app.getPath('userData'), 'Cache', 'Roto'),
    ffmpegPath: ff.getFfmpegPath(),
    fetchImpl: (url, opts) => net.fetch(url, { ...opts, headers: { 'User-Agent': `Reccut/${app.getVersion()}` } }),
  }),
  jobs,
  media,
  notifyAnalyzed,
  outputDir: () => path.join(baseDir(), 'Processed'),
  send: (ch, payload) => send(ch, payload),
});
// CorridorKey Add-on: downloaded only after the user has read what it is and needs.
const corridorKey = createCorridorKey({
  dir: path.join(app.getPath('userData'), 'addons', 'corridorkey'),
  fetchImpl: (url, opts) => net.fetch(url, { ...opts, headers: { 'User-Agent': `Reccut/${app.getVersion()}` } }),
});
extensionHandler('corridorkey:status', () => corridorKey.status());
extensionHandler('corridorkey:install', (opts) => {
  if (opts?.consent !== true) throw new Error('CorridorKey is only installed after you accept what it is and its licence.');
  const { done } = jobs.add({ kind: 'addon', title: 'Installing CorridorKey', queue: 'light', run: async (ctx) => {
    const manifest = await corridorKey.install(ctx);
    return extensions.installPlugin(manifest, { accepted: true });
  } });
  return done;
});
extensionHandler('plugins:process', (request) => {
  const { done } = jobs.add({ kind: 'processor', title: 'External video processor', queue: 'heavy', run: async (ctx) => {
    const result = await extensions.processFile({ id: request.id, input: request.input, params: request.params, outputDir: path.join(baseDir(), 'Processed') }, ctx);
    const imported = await media.importFiles([result.output], notifyAnalyzed);
    if (!imported.items?.[0]?.streams?.main?.hasVideo) throw new Error('The processor output must be a readable video file.');
    if (ctx.isCanceled()) throw new Error('Canceled');
    return { ...result, media: imported.items[0] };
  } });
  return done;
});
