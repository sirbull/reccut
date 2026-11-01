// node scripts/capture-export-demo.cjs [path/to/Into the Wild.reccut]
// One isolated Electron instance; supplied footage and the user's app profile are untouched.
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
if (!process.versions.electron) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-export-photo-'));
    const original = process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Help Demo - Into the Wild/Into the Wild.reccut');
    let child;
    try {
      const project = JSON.parse(fs.readFileSync(original, 'utf8'));
      if (project.id !== 'reccut-nature-help-demo') throw new Error('Use the dedicated nature demo project for export photography.');
      const file = path.join(dir, 'Into the Wild.reccut'); fs.writeFileSync(file, JSON.stringify(project));
      for (const folder of ['Media', 'Recordings', 'Exports']) fs.mkdirSync(path.join(dir, folder));
      await require('esbuild').build({ entryPoints: [path.join(__dirname, 'export-photography.jsx')], outfile: path.join(dir, 'capture.js'), bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' } });
      fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
      fs.writeFileSync(path.join(dir, 'capture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'capture.css').replace('app.js', 'capture.js'));
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      child = require('child_process').spawn(require('electron'), [__filename, dir, file], { env, stdio: 'inherit', detached: process.platform !== 'win32' });
      const stop = () => { try { process.platform === 'win32' ? child.kill() : process.kill(-child.pid, 'SIGTERM'); } catch {} };
      const timer = setTimeout(stop, 90000);
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      try { process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); }); }
      finally { clearTimeout(timer); process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); stop(); }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, session, globalShortcut } = require('electron');
  const dir = process.argv[2], file = process.argv[3];
  app.setPath('appData', dir); app.setPath('userData', path.join(dir, 'profile')); fs.mkdirSync(app.getPath('userData'));
  globalShortcut.register = () => true; globalShortcut.unregisterAll = () => {};
  const load = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, opts) { return load.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'capture.html') : file, opts); };
  let started = false;
  const timeout = setTimeout(() => app.exit(1), 80000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      const js = source => win.webContents.executeJavaScript(source);
      let code = 1;
      try {
        win.setContentSize(1440, 960); win.show(); win.focus();
        await js(`helpPhotography.init(${JSON.stringify(file)})`);
        await js(`exportPhotography.prepare(${JSON.stringify(path.join(dir, 'Exports'))})`);
        fs.writeFileSync(path.join(root, 'docs/media/export-queue.jpg'), (await win.webContents.capturePage()).resize({ width: 2000 }).toJPEG(92));
        console.log('Saved docs/media/export-queue.jpg'); code = 0;
      } catch (error) { console.error(error.stack); }
      finally {
        try { await js('exportPhotography.cancel()'); } catch {}
        clearTimeout(timeout); app.exit(code);
      }
    });
  });
  const { InputTracker } = require('../src/main/input.js');
  InputTracker.prototype.start = () => false; InputTracker.prototype.startPolling = () => {};
  require('../src/main/main.js');
  for (const [channel, result] of [['permissions:request', {}], ['screens:list', []], ['rec:showControls', null]]) {
    ipcMain.removeHandler(channel); ipcMain.handle(channel, () => result);
  }
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false)));
}
