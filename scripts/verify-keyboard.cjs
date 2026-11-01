// Exercise actual Electron focus, application handlers and native shortcut routing.
// No OS-level keys, devices, user profiles or projects are accessed by this check.
const electron = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-keyboard-'));
    try {
      await require('esbuild').build({ entryPoints: [path.join(root, 'test/keyboard.browser.jsx')], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' } });
      fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
      fs.writeFileSync(path.join(dir, 'setup.js'), "navigator.mediaDevices.enumerateDevices=async()=>[];localStorage.setItem('settings',JSON.stringify({screenId:'',cameraId:'',micId:''}));");
      fs.writeFileSync(path.join(dir, 'fixture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'fixture.css').replace('app.js', 'fixture.js').replace('<script type="module"', '<script src="setup.js"></script><script type="module"'));
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const result = require('child_process').spawnSync(electron, [__filename, dir], { env, stdio: 'inherit', timeout: 45000 });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
} else {
  const { app, BrowserWindow, ipcMain, globalShortcut, session, Menu } = electron;
  const dir = process.argv[2], keys = new Map(), errors = [];
  app.setPath('appData', dir); app.setPath('userData', path.join(dir, 'profile'));
  // Test registration and callback handling without capturing real system keys.
  globalShortcut.register = (key, callback) => { keys.set(key, callback); return true; };
  globalShortcut.unregisterAll = () => keys.clear();
  const originalLoad = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return originalLoad.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'fixture.html') : file, options);
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 180));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const timeout = setTimeout(() => { console.error('Keyboard verification timed out'); app.exit(1); }, 35000);
  let testing = false;
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' && e.message !== 'ResizeObserver loop completed with undelivered notifications.') errors.push(e.message);
    });
    win.webContents.on('did-finish-load', async () => {
      if (testing || !win.webContents.getURL().endsWith('/fixture.html')) return;
      testing = true;
      try {
        const js = (source) => win.webContents.executeJavaScript(source);
        const key = async (keyCode) => {
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
          await wait();
        };
        win.show(); win.focus(); await js('keyboardTest.ready()'); await wait();
        assert(await js('document.hasFocus()'), 'editor must be focused for the positive control');
        await key('B');
        assert(await js('keyboardTest.state().tool === "blade"'), 'ordinary editor shortcuts must still work');
        for (const [tag, type] of [['textarea', ''], ['input', 'text'], ['input', 'number'], ['div', '']]) {
          await js(`keyboardTest.edit(); keyboardTest.field(${JSON.stringify(tag)},${JSON.stringify(type)})`); await wait();
          assert(keys.size === 0, `${tag}/${type} must release native recording keys`);
          await key('B'); await key('Space');
          win.webContents.send('menu', 'roomRecord'); await wait();
          assert(await js('keyboardTest.state().tool === "select" && keyboardTest.state().room === "edit" && !keyboardTest.state().playing'), 'typing must not change tools, rooms or playback');
        }
        await js('keyboardTest.clear();keyboardTest.dialog()'); await wait();
        await key('B'); await key('Space');
        assert(await js('keyboardTest.state().tool === "select" && !keyboardTest.state().playing'), 'floating dialog buttons must shield the editor');
        await js('keyboardTest.clear();keyboardTest.settings(true)'); await wait();
        await key('B'); await key('Space');
        win.webContents.send('menu', 'roomRecord'); await wait();
        assert(await js('keyboardTest.state().room === "edit" && keyboardTest.state().tool === "select"'), 'Settings must own menu and editor shortcuts');
        await js('keyboardTest.settings(false);keyboardTest.record()'); await wait();
        const layoutKey = `${await js('keyboardTest.state().modifier')}+1`;
        const queued = keys.get(layoutKey);
        assert(queued, 'focused Record room should register layout keys');
        await js('keyboardTest.field()'); await wait();
        const before = await js('keyboardTest.state().layout'); queued(); await wait();
        assert(await js('keyboardTest.state().layout') === before, 'late native callbacks must not affect focused inputs');
        await js('keyboardTest.clear();keyboardTest.edit()'); await wait();
        const other = new BrowserWindow({ width: 400, height: 250, webPreferences: { sandbox: true } });
        await other.loadURL('data:text/html,<textarea autofocus></textarea>'); other.focus(); await wait();
        assert(keys.size === 0, 'another focused window must release every recording accelerator');
        const findRecord = (items) => {
          for (const item of items) {
            if (item.label === 'Record' && item.accelerator) return item;
            const nested = findRecord(item.submenu?.items || []);
            if (nested) return nested;
          }
        };
        const item = findRecord(Menu.getApplicationMenu().items);
        assert(item, 'native Record menu command must exist');
        item.click(); await wait();
        assert(await js('keyboardTest.state().room === "edit"'), 'secondary windows must not route menu commands to the project');
        // Opt-in is also suppressed while Help/another app window owns focus.
        await js('keyboardTest.background(true)'); await wait();
        assert(keys.size === 0, 'background opt-in must still protect other Reccut windows');
        other.destroy(); win.focus(); await wait();
        await js('keyboardTest.background(false);keyboardTest.edit()'); await wait();
        await key('B');
        assert(await js('keyboardTest.state().tool === "blade"'), 'shortcuts should resume after returning to the editor');
        assert(!errors.length, `Renderer errors: ${errors.join('\n')}`);
        console.log('Keyboard isolation passed: text/number/editable fields, dialogs, native menus, late callbacks and window focus.');
        clearTimeout(timeout); app.exit(0);
      } catch (error) { console.error(error.stack); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require('../src/main/input.js');
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
  require('../src/main/main.js');
  ipcMain.removeHandler('permissions:request'); ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list'); ipcMain.handle('screens:list', () => []);
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false)));
}
