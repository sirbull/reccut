// Native menu -> real App -> dialog -> preload -> export queue -> encoded image.
const electron = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-frame-menu-'));
  (async () => {
    try {
      await require('esbuild').build({ entryPoints: [path.join(root, 'test/frame-menu.browser.jsx')], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' } });
      fs.copyFileSync(path.join(root, 'build/app.css'), path.join(dir, 'fixture.css'));
      fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
      fs.writeFileSync(path.join(dir, 'setup.js'), "navigator.mediaDevices.enumerateDevices=async()=>[];localStorage.setItem('settings',JSON.stringify({screenId:'',cameraId:'',micId:''}));");
      fs.writeFileSync(path.join(dir, 'fixture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'fixture.css').replace('app.js', 'fixture.js').replace('<script type="module"', '<script src="setup.js"></script><script type="module"'));
      require('child_process').execFileSync(require('../src/main/ffmpeg-path.js'), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=64x32', '-frames:v', '1', path.join(dir, 'source.png')]);
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const result = require('child_process').spawnSync(electron, [__filename, dir], { env, stdio: 'inherit', timeout: 45000 });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (err) { console.error(err); process.exitCode = 1; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
} else {
  const { app, BrowserWindow, ipcMain, globalShortcut, session, Menu, dialog, nativeImage } = electron;
  const assert = require('node:assert/strict');
  const dir = process.argv[2];
  app.setPath('appData', dir); app.setPath('userData', path.join(dir, 'profile'));
  globalShortcut.register = () => true; globalShortcut.unregisterAll = () => {};
  const originalLoad = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return originalLoad.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'fixture.html') : file, options);
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 150));
  const timeout = setTimeout(() => { console.error('Frame menu verification timed out'); app.exit(1); }, 35000);
  let testing = false;
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' && !event.message.startsWith('ResizeObserver loop')) console.error('Renderer:', event.message);
    });
    win.webContents.on('did-finish-load', async () => {
      if (testing || !win.webContents.getURL().endsWith('/fixture.html')) return;
      testing = true;
      const js = (source) => win.webContents.executeJavaScript(source);
      const find = (label, items = Menu.getApplicationMenu().items) => {
        for (const item of items) {
          if (item.label === label) return item;
          const child = item.submenu && find(label, item.submenu.items);
          if (child) return child;
        }
      };
      try {
        await js(`frameMenuTest.ready(${JSON.stringify(path.join(dir, 'source.png'))})`);
        win.show(); win.focus(); await wait();
        const item = find('Export Frame…');
        assert.ok(item, 'native File menu must contain Export Frame');
        item.click(); await wait();
        let state = await js('frameMenuTest.state()');
        console.log('Menu with editor focus:', JSON.stringify(state));
        assert.ok(state.visible, 'native menu must mount the actual dialog');
        await js('frameMenuTest.close();frameMenuTest.field()'); await wait();
        item.click(); await wait();
        state = await js('frameMenuTest.state()');
        console.log('Menu with input focus:', JSON.stringify(state));
        assert.ok(state.visible, 'explicit Export Frame menu selection must work after typing in a field');
        const output = path.join(dir, 'saved-frame.png');
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: output });
        await js('frameMenuTest.export()');
        for (let n = 0; n < 100 && !fs.existsSync(output); n++) await wait();
        assert.ok(fs.existsSync(output), 'confirming the real dialog must write an image via the real export queue');
        const image = nativeImage.createFromPath(output);
        assert.deepEqual(image.getSize(), { width: 64, height: 32 });
        assert.ok(image.toBitmap()[2] > 220, 'encoded image must contain the actual red frame');
        await js('frameMenuTest.close();frameMenuTest.field()'); await wait();
        find('Easy Export').click(); await wait();
        assert.equal((await js('frameMenuTest.state()')).heading, 'Easy Export', 'Easy Export menu must also open after typing');
        console.log('Frame menu passed: actual native menus, focused inputs, actual App dialogs and encoded image through preload and queue.');
        clearTimeout(timeout); app.exit(0);
      } catch (err) { console.error(err.stack); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require('../src/main/input.js');
  InputTracker.prototype.start = () => false; InputTracker.prototype.startPolling = () => {};
  require('../src/main/main.js');
  ipcMain.removeHandler('permissions:request'); ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list'); ipcMain.handle('screens:list', () => []);
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false)));
}
