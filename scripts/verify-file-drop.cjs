// Isolated Electron check: native File paths, DOM event propagation and actual media copying.
const electron = require('electron');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-drop-'));
  (async () => {
    try {
      await require('esbuild').build({ entryPoints: [path.join(root, 'test/file-drop.browser.jsx')], outfile: path.join(dir, 'fixture.js'), bundle: true, platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' } });
      fs.copyFileSync(path.join(root, 'build/app.css'), path.join(dir, 'fixture.css'));
      fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
      fs.writeFileSync(path.join(dir, 'setup.js'), "navigator.mediaDevices.enumerateDevices=async()=>[];localStorage.setItem('settings',JSON.stringify({screenId:'',cameraId:'',micId:''}));");
      fs.writeFileSync(path.join(dir, 'fixture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'fixture.css').replace('app.js', 'fixture.js').replace('<script type="module"', '<script src="setup.js"></script><script type="module"'));
      const ffmpeg = require('../src/main/ffmpeg-path.js');
      require('child_process').execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=blue:s=640x360:r=30:d=1', '-frames:v', '1', path.join(dir, 'Bilde æ ø.png')]);
      require('child_process').execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=640x360:r=30:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'Video one.mp4')]);
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const result = require('child_process').spawnSync(electron, [__filename, dir], { env, stdio: 'inherit', timeout: 50000 });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (err) { console.error(err); process.exitCode = 1; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
} else {
  const { app, BrowserWindow, ipcMain, globalShortcut, session } = electron;
  const assert = require('node:assert/strict');
  const dir = process.argv[2];
  app.setPath('appData', dir); app.setPath('userData', path.join(dir, 'profile'));
  globalShortcut.register = () => true; globalShortcut.unregisterAll = () => {};
  const originalLoad = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return originalLoad.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'fixture.html') : file, options);
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
  const timeout = setTimeout(() => { console.error('File drop verification timed out'); app.exit(1); }, 40000);
  let testing = false;
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' && !event.message.startsWith('ResizeObserver loop')) console.error('Renderer:', event.message);
    });
    win.webContents.on('did-finish-load', async () => {
      if (testing || !win.webContents.getURL().endsWith('/fixture.html')) return;
      testing = true;
      const js = (source) => win.webContents.executeJavaScript(source).catch((err) => { throw new Error(`${source}: ${err.message}`); });
      const state = () => js('fileDropTest.state()');
      try {
        await js('fileDropTest.ready()');
        win.show(); win.focus(); await wait();
        win.webContents.debugger.attach('1.3');
        const { root: document } = await win.webContents.debugger.sendCommand('DOM.getDocument');
        const { nodeId } = await win.webContents.debugger.sendCommand('DOM.querySelector', { nodeId: document.nodeId, selector: '#native-drop-files' });
        const image = path.join(dir, 'Bilde æ ø.png'), video = path.join(dir, 'Video one.mp4');
        const select = (files) => win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files });
        await select([image, video]);
        assert.equal(await js("fileDropTest.send('.app')"), true, 'native files must never navigate the window');
        await wait();
        assert.equal((await state()).modal, false, 'first create a project, keeping the pending files');
        await js(`fileDropTest.create(${JSON.stringify(dir)})`); await wait();
        assert.deepEqual((await state()).request.paths, [image, video], 'preload must resolve native paths with spaces and Unicode');
        assert.equal((await state()).modal, true, 'pending import opens after project creation');
        await js("fileDropTest.click('Cancel');fileDropTest.prepare()"); await wait();
        await js("fileDropTest.send('.app', 'dragenter');fileDropTest.send('.app', 'dragover')"); await wait();
        assert.equal((await state()).hover, true);
        await js("fileDropTest.send('.app', 'dragleave')"); await wait();
        assert.equal((await state()).hover, false, 'leaving the window clears feedback');
        await js("fileDropTest.send('.app')"); await wait();
        let s = await state();
        assert.equal(s.room, 'edit'); assert.equal(s.browser, 'media'); assert.equal(s.visible, true);
        assert.equal(s.hover, false); assert.equal(s.media.length, 0, 'wait for import confirmation');
        await js("fileDropTest.send('.ib-grid');fileDropTest.send('.import-modal footer')"); await wait();
        assert.equal((await state()).request.paths.length, 2, 'repeated drops merge without duplicates');
        await js("fileDropTest.click('Copy to project')"); await wait();
        await js("fileDropTest.click('Import 2 Files')");
        for (let n = 0; n < 100 && (await state()).media.length < 2; n++) await wait();
        s = await state();
        assert.equal(s.media.length, 2); assert.deepEqual(s.clips, [], 'ordinary drops only populate the browser');
        for (const media of s.media) {
          assert.equal(path.dirname(media.path), s.folders.media);
          assert.ok(fs.existsSync(media.path));
        }
        await select([video]);
        await js("fileDropTest.send('.viewer')"); await wait();
        await js("fileDropTest.click('Leave in place');fileDropTest.optimize()"); await wait();
        await js("fileDropTest.click('Import')");
        for (let n = 0; n < 100 && (await state()).media.length < 3; n++) await wait();
        s = await state();
        assert.ok(s.media.some((m) => m.path === video), 'Leave in place keeps the original file path');
        assert.equal(s.media.length, 3); assert.deepEqual(s.clips, []);
        for (let n = 0; n < 150 && !(await state()).media.find((m) => m.path === video)?.streams.main.optimized; n++) await wait();
        s = await state();
        const optimized = s.media.find((m) => m.path === video).streams.main.optimized;
        assert.ok(optimized && fs.existsSync(optimized), 'optimization creates a real editing copy in the background');
        assert.equal(path.dirname(optimized), s.folders.optimized);
        await js("fileDropTest.send('.app', 'drop', true)"); await wait();
        assert.equal((await state()).request, null, 'internal media drags never open a native import dialog');
        await js("fileDropTest.send('.tl-content')"); await wait();
        assert.ok((await state()).request.placement, 'direct timeline drops retain their insertion destination');
        await js("fileDropTest.click('Cancel')");
        console.log('File drop passed: native paths, project creation, all-window import, hover, merged selections, copy, leave in place, background optimization, timeline and internal drags.');
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
