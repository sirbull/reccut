const {
  app,
  BrowserWindow,
  protocol,
  Menu,
  Notification,
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
const os = require('os');
const path = require('path');
const ff = require('./ffmpeg');
const jobs = require('./jobs');
const media = require('./media');
const projects = require('./projects');
const { InputTracker, ZOOM_KEYS } = require('./input');

const isMac = process.platform === 'darwin';

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
    return new Response('Ikke funnet', { status: 404 });
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
let saveFlushed = false;
let selectedScreenId = null;
let wantSystemAudio = false;
let shortcutModifier = null;
let shortcutsActive = true;
const input = new InputTracker();
const openFiles = new Map();
let fileSeq = 1;
let recordingDir = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function baseDir() {
  return path.join(app.getPath('videos'), 'OBSlite');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    title: 'OBSlite',
    backgroundColor: '#1b1b1d',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 16 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Opptak og avspilling skal fortsette selv om vinduet er skjult.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', '..', 'build', 'index.html'));
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
    win = null;
    // Skjulte arbeidsvinduer skal ikke holde appen i live.
    jobs.destroyWorkers();
    app.quit();
  });
}

/* Meny med snarveier som i Final Cut Pro. Kommandoene håndteres i vinduet. */
function buildMenu() {
  const cmd = (id, label, accelerator) => ({ label, accelerator, click: () => send('menu', id) });
  // Viser snarveien, men vinduet håndterer tasten selv (så den virker i tekstfelt som vanlig).
  const show = (id, label, accelerator) => ({ label, accelerator, registerAccelerator: false, click: () => send('menu', id) });
  const template = [
    ...(isMac
      ? [{ label: 'OBSlite', submenu: [{ role: 'about', label: 'About OBSlite' }, { type: 'separator' }, cmd('prefs', 'Preferences', 'Cmd+,'), { type: 'separator' }, { role: 'hide', label: 'Hide OBSlite' }, { role: 'hideOthers', label: 'Hide Others' }, { type: 'separator' }, { role: 'quit', label: 'Quit OBSlite' }] }]
      : []),
    {
      label: 'File',
      submenu: [
        cmd('newProject', 'New Project', 'CmdOrCtrl+N'),
        cmd('openProject', 'Open Project', 'CmdOrCtrl+O'),
        cmd('save', 'Save', 'CmdOrCtrl+S'),
        { type: 'separator' },
        cmd('import', 'Import Media', 'CmdOrCtrl+I'),
        ...(isMac ? [] : [cmd('prefs', 'Preferences', 'Ctrl+,')]),
        cmd('export', 'Export', 'CmdOrCtrl+E'),
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit', label: 'Quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        cmd('undo', 'Undo', 'CmdOrCtrl+Z'),
        cmd('redo', 'Redo', 'Shift+CmdOrCtrl+Z'),
        { type: 'separator' },
        cmd('cut', 'Cut', 'CmdOrCtrl+X'),
        cmd('copy', 'Copy', 'CmdOrCtrl+C'),
        cmd('paste', 'Paste', 'CmdOrCtrl+V'),
        cmd('selectAll', 'Select All', 'CmdOrCtrl+A'),
      ],
    },
    {
      label: 'Clip',
      submenu: [
        show('blade', 'Blade', 'CmdOrCtrl+B'),
        show('toggleEnabled', 'Enable or Disable', 'V'),
        show('addTransition', 'Add Cross Dissolve', 'CmdOrCtrl+T'),
        { type: 'separator' },
        show('expandAudio', 'Expand Audio', isMac ? 'Ctrl+S' : 'Alt+E'),
        show('detachAudio', 'Detach Audio', isMac ? 'Ctrl+Shift+S' : 'Alt+Shift+E'),
        show('solo', 'Solo', 'Alt+S'),
        { type: 'separator' },
        {
          label: 'Retime',
          submenu: [
            show('retime', 'Show Speed Controls', 'CmdOrCtrl+R'),
            { type: 'separator' },
            ...[0.1, 0.25, 0.5].map((v) => show(`speed:${v}`, `Slow ${v * 100}%`)),
            show('speed:1', 'Normal (100%)', 'Alt+CmdOrCtrl+R'),
            ...[2, 4, 8, 20].map((v) => show(`speed:${v}`, `Fast ${v}x`)),
            { type: 'separator' },
            show('freeze', 'Add Freeze Frame', 'Alt+F'),
          ],
        },
        { type: 'separator' },
        show('lift', 'Lift from Storyline', 'Alt+CmdOrCtrl+Up'),
        show('overwriteDown', 'Overwrite to Storyline', 'Alt+CmdOrCtrl+Down'),
        show('insertGap', 'Insert Gap', 'Alt+W'),
      ],
    },
    {
      label: 'View',
      submenu: [
        cmd('roomRecord', 'Record', 'CmdOrCtrl+1'),
        cmd('roomEdit', 'Edit', 'CmdOrCtrl+2'),
        cmd('roomExport', 'Export', 'CmdOrCtrl+3'),
        { type: 'separator' },
        cmd('zoomIn', 'Zoom In on Timeline', 'CmdOrCtrl+='),
        cmd('zoomOut', 'Zoom Out on Timeline', 'CmdOrCtrl+-'),
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Enter Full Screen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Developer Tools' }]),
      ],
    },
    { label: 'Window', role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* Skjermvalg og opptak */

async function listScreens() {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 320, height: 180 } });
  const displays = screen.getAllDisplays();
  return sources.map((source, i) => {
    const display = displays.find((d) => String(d.id) === source.display_id) || displays[i] || screen.getPrimaryDisplay();
    return {
      id: source.id,
      displayId: display.id,
      name: sources.length > 1 ? `Display ${i + 1}` : 'Main Display',
      width: Math.round(display.size.width * display.scaleFactor),
      height: Math.round(display.size.height * display.scaleFactor),
    };
  });
}

function registerShortcuts() {
  globalShortcut.unregisterAll();
  if (!shortcutModifier || !shortcutsActive) return [];
  const failed = [];
  const reg = (key, fn) => {
    const acc = `${shortcutModifier}+${key}`;
    if (!globalShortcut.register(acc, fn)) failed.push(acc);
  };
  for (let n = 1; n <= 6; n++) reg(String(n), () => send('shortcut', { layout: n }));
  reg('0', () => send('shortcut', { toggleRecord: true }));
  // Uten tastaturlytter blir forstørring av pekeren en av/på-snarvei.
  if (!input.started) reg('9', () => input.toggleZoom());
  return failed;
}

input.listener = (event) => send('input', event);

ipcMain.handle('screens:list', () => listScreens());
ipcMain.handle('screens:select', (_e, { id, displayId, systemAudio }) => {
  selectedScreenId = id;
  wantSystemAudio = Boolean(systemAudio);
  input.setDisplay(displayId);
});
ipcMain.handle('shortcuts:set', (_e, modifier) => {
  shortcutModifier = modifier;
  input.setAppShortcuts(modifier);
  return registerShortcuts();
});
ipcMain.handle('shortcuts:active', (_e, active) => {
  shortcutsActive = active;
  registerShortcuts();
});
ipcMain.handle('input:status', () => ({
  available: input.available(),
  permission: input.permission(false),
  started: input.started,
  zoomKeys: ZOOM_KEYS,
}));
ipcMain.handle('input:request', () => {
  input.permission(true);
  const started = input.start();
  registerShortcuts();
  return { permission: input.permission(false), started };
});
ipcMain.handle('input:setZoomKey', (_e, key) => {
  input.zoomKey = key;
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
  const pane = which === 'accessibility' ? 'Privacy_Accessibility' : 'Privacy_ScreenCapture';
  shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
});

ipcMain.handle('paths:base', () => baseDir());
ipcMain.handle('app:flushed', () => {
  saveFlushed = true;
  win?.close();
});

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

ipcMain.handle('rec:begin', async (_e, { t0, base }) => {
  const dir = path.join(base || baseDir(), 'Recordings', `Recording ${stamp()}`);
  await fs.promises.mkdir(dir, { recursive: true });
  recordingDir = dir;
  input.beginSession(t0);
  input.startPolling();
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

// Avslutter opptaket: remukser filene og skriver recording.json.
ipcMain.handle('rec:finish', async (_e, meta) => {
  const dir = recordingDir;
  recordingDir = null;
  const events = input.endSession() || { cursor: [], zooms: [], clicks: [], keys: [] };
  const out = { version: 1, createdAt: new Date().toISOString(), ...meta, ...events };
  for (const key of ['screen', 'camera']) {
    const s = meta[key];
    if (!s) continue;
    const raw = path.join(dir, s.raw);
    const final = path.join(dir, s.file);
    try {
      await ff.remux(raw, final);
      await fs.promises.unlink(raw).catch(() => {});
    } catch (err) {
      console.error('Remuksing feilet, beholder originalen', err);
      await fs.promises.rename(raw, final);
    }
    delete out[key].raw;
  }
  await fs.promises.writeFile(path.join(dir, 'recording.json'), JSON.stringify(out, null, 1));
  return dir;
});

/* Media */

const notifyAnalyzed = (payload) => send('media:analyzed', payload);

ipcMain.handle('media:import', (_e, files) => media.importFiles(files, notifyAnalyzed));
ipcMain.handle('media:importRecording', (_e, dir) => media.recordingMedia(dir, notifyAnalyzed));
ipcMain.handle('media:reanalyze', async (_e, items) => {
  // Kjøres når et prosjekt åpnes, slik at bufrede analyser hentes inn igjen.
  for (const m of items) {
    if (m.kind === 'recording') await media.recordingMedia(m.path, (p) => notifyAnalyzed({ ...p, mediaId: m.id })).catch(() => {});
    else await media.importFiles([m.path], (p) => notifyAnalyzed({ ...p, mediaId: m.id })).catch(() => {});
  }
});
ipcMain.handle('media:wave', async (_e, file) => JSON.parse(await fs.promises.readFile(file, 'utf8')));
ipcMain.handle('media:exists', (_e, file) => fs.existsSync(file));
ipcMain.handle('media:recordings', async () => {
  const dir = path.join(baseDir(), 'Recordings');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of await fs.promises.readdir(dir)) {
    const full = path.join(dir, name);
    if (fs.existsSync(path.join(full, 'recording.json'))) {
      const st = await fs.promises.stat(full);
      out.push({ name, path: full, modified: st.mtimeMs });
    }
  }
  return out.sort((a, b) => b.modified - a.modified);
});
ipcMain.handle('file:read', async (_e, file) => fs.promises.readFile(file, 'utf8'));
ipcMain.handle('file:write', async (_e, file, data) => fs.promises.writeFile(file, data));

/* Dialoger og filsystem */

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
    const build = (list) =>
      list.map((it) =>
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
ipcMain.handle('projects:save', (_e, project, previousPath) => projects.save(baseDir(), project, previousPath));
ipcMain.handle('projects:remove', (_e, file) => projects.remove(file));

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
    run: (ctx) =>
      jobs.runInWorker(
        'export',
        { ...payload, ffmpeg: ff.getFfmpegPath(), tmpDir: path.join(os.tmpdir(), 'obslite-export') },
        ctx
      ),
  });
  done.finally(() => reservedOutputs.delete(payload.settings.output)).catch(() => {});
  done.then(
    (file) => {
      send('export:done', { id, file });
      if (Notification.isSupported() && !win?.isFocused()) {
        new Notification({ title: 'Export finished', body: path.basename(file) }).show();
      }
    },
    () => {}
  );
  return id;
});

ipcMain.handle('transcribe:start', (_e, payload) => {
  const { id, done } = jobs.add({
    kind: 'transcribe',
    title: 'Generating captions',
    queue: 'heavy',
    run: async (ctx) => {
      ctx.progress(0, 'Reading audio');
      const audio = await mixForTranscription(payload, ctx);
      return jobs.runInWorker('transcribe', { ...payload, audio }, ctx);
    },
  });
  done.then((segments) => send('transcribe:done', { id, segments, payload }), (err) => send('transcribe:error', { id, error: String(err.message || err) }));
  return id;
});

// Whisper trenger 16 kHz mono. Hver lydkilde dekodes og legges på riktig sted.
async function mixForTranscription({ sources, duration }, ctx) {
  const rate = 16000;
  const out = new Float32Array(Math.ceil(duration * rate));
  for (const [i, s] of sources.entries()) {
    const job = ff.decodePcm(s.path, { start: s.in, duration: s.dur, rate, channels: 1 });
    ctx.setCancel(job.kill);
    const buf = await job.promise;
    const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
    const offset = Math.round(s.start * rate);
    const gain = s.gain ?? 1;
    for (let j = 0; j < pcm.length && offset + j < out.length; j++) out[offset + j] += pcm[j] * gain;
    ctx.progress(((i + 1) / sources.length) * 0.1, 'Reading audio');
  }
  return out;
}

// Talemodellene for teksting lagres på disk, slik at de bare lastes ned én gang.
function modelCachePath(key) {
  const hash = require('crypto').createHash('sha1').update(key).digest('hex');
  return path.join(app.getPath('userData'), 'models', hash);
}
ipcMain.handle('modelcache:get', async (_e, key) => {
  const file = modelCachePath(key);
  return fs.existsSync(file) ? new Uint8Array(await fs.promises.readFile(file)) : null;
});
ipcMain.handle('modelcache:put', async (_e, key, data) => {
  const file = modelCachePath(key);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await fs.promises.writeFile(file + '.tmp', Buffer.from(data));
  await fs.promises.rename(file + '.tmp', file);
});

app.whenReady().then(() => {
  protocol.handle('media', serveMedia);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'display-capture', 'mediaKeySystem', 'notifications'].includes(permission));
  });

  // getDisplayMedia i vinduet får skjermen som er valgt i appen, uten systemvelger.
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
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
  if (input.permission(false) === 'granted') input.start();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  input.stop();
  jobs.destroyWorkers();
});

app.on('window-all-closed', () => app.quit());
