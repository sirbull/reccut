// Exercise real preview video and the Edit layout using an isolated profile and simulated displays.
// Run after npm run build: node scripts/test-external-preview.cjs
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));
if (!electron.app) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-preview-check-'));
    const ref = (file) => JSON.stringify(path.join(root, file));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `import ${ref('src/renderer/app.jsx')};
        import * as store from ${ref('src/renderer/editor/store.js')};
        import * as preview from ${ref('src/renderer/editor/externalPreview.js')};
        import * as playback from ${ref('src/renderer/editor/playback.js')};
        import * as model from ${ref('src/shared/model.js')};
        import {prefs,setPrefs} from ${ref('src/renderer/prefs.js')};
        window.check={store,preview,playback,model,prefs,setPrefs};`, resolveDir: root },
      banner: { js: `localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,reopenLast:false,aiModelsAsked:true,skimming:false,audioSkimming:false}));
        navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Integration test','NotAllowedError'));navigator.mediaDevices.enumerateDevices=async()=>[];` },
      outfile: path.join(dir, 'check.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome130',
      jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
    });
    fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
    fs.copyFileSync(path.join(root, 'build/external-preview.html'), path.join(dir, 'external-preview.html'));
    fs.copyFileSync(path.join(root, 'build/external-preview.js'), path.join(dir, 'external-preview.js'));
    fs.writeFileSync(path.join(dir, 'check.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replaceAll('app.css', 'check.css').replaceAll('app.js', 'check.js'));
    console.log('Test artifacts: ' + dir);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(electron, [__filename, dir], { cwd: root, env, stdio: 'inherit' });
    process.exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));
  })().catch((e) => { console.error(e); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, screen, ipcMain } = electron;
  const dir = process.argv[2];
  app.setPath('appData', dir); app.setPath('userData', path.join(dir, 'profile'));
  BrowserWindow.prototype.show = function() {};
  BrowserWindow.prototype.maximize = function() {};
  BrowserWindow.prototype.showInactive = function() {};
  const loadFile = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    if(file === path.join(root, 'build/external-preview.html')) file = path.join(dir, 'external-preview.html');
    return loadFile.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'check.html') : file, options);
  };
  let displays;
  app.whenReady().then(() => {
    const actual = screen.getPrimaryDisplay();
    console.log('Physical displays: ' + screen.getAllDisplays().length);
    displays = [{ ...actual, id: 1, label: 'Test Editor Display' },
      { ...actual, id: 2, label: 'Test Preview Display', bounds: { x: 3000, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 1 }];
    screen.getAllDisplays = () => displays;
    screen.getPrimaryDisplay = () => displays[0];
    screen.getDisplayMatching = () => displays[0];
  });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const timeout = setTimeout(() => { console.error('Integration timed out'); app.exit(1); }, 55000);
  let started = false;
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('Renderer: ' + event.message); });
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/check.html')) return;
      started = true;
      const js = (code) => win.webContents.executeJavaScript(code);
      const until = async (predicate, label) => {
        for (let i = 0; i < 100; i++) { if (await predicate()) return; await wait(100); }
        throw new Error('Timed out: ' + label);
      };
      try {
        await wait(1200);
        await js(`(()=>{const q=window.check,p=q.model.newProject('External preview test');
          const c=q.model.makeClip('title',{dur:10,props:{text:'External Preview',style:'card',bg:true,bgColor:'#1460c0',anim:'none'}});
          p.clips[c.id]=c;p.primary=[c.id];p.duration=10;
          q.store.setProject(p);q.store.needsProject.value=false;q.store.room.value='edit';q.playback.seek(1);})()`);
        await until(() => js(`Boolean([...document.querySelectorAll('[role=dialog]')].find(d=>d.textContent.includes('Use a Separate Screen')))`) , 'display offer');
        assert.equal(await js(`check.preview.previewDisplays.value.displays.length`), 1);
        await js(`[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Use This Screen').click()`);
        await until(() => js(`Boolean(check.preview.previewDisplays.value.active)`), 'output active');
        const output = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Reccut Preview');
        assert.ok(output, 'output window exists');
        const outJs = (code) => output.webContents.executeJavaScript(code);
        await until(() => outJs(`document.querySelector('video').videoWidth > 0`), 'first actual video frame');
        const videoState = await outJs(`(()=>{const v=document.querySelector('video');return {width:v.videoWidth,height:v.videoHeight,muted:v.muted,audioTracks:v.srcObject.getAudioTracks().length,frames:v.getVideoPlaybackQuality().totalVideoFrames}})()`);
        console.log('Received real video: ' + JSON.stringify(videoState));
        assert.equal(videoState.width, 1280);
        assert.equal(videoState.height, 720);
        assert.equal(videoState.audioTracks, 0);
        const pixel = async () => outJs(`(()=>{const v=document.querySelector('video'),c=document.createElement('canvas');c.width=2;c.height=2;const g=c.getContext('2d');g.drawImage(v,0,0,2,2);return [...g.getImageData(0,0,1,1).data]})()`);
        const initialPixel = await pixel();
        console.log('Received frame pixel: ' + JSON.stringify(initialPixel));
        assert.ok(initialPixel[2] > initialPixel[0] + 40, 'received blue title background');
        assert.equal(await js(`Boolean(document.querySelector('.external-preview-layout'))`), true);
        fs.writeFileSync(path.join(dir, 'external-layout.png'), (await win.webContents.capturePage()).toPNG());
        await js(`check.setPrefs({externalPreviewShowLocal:true})`);
        await until(() => js(`!document.querySelector('.external-preview-layout')`), 'show local preview');
        await js(`check.setPrefs({externalPreviewShowLocal:false});check.store.commit(p=>Object.values(p.clips)[0].props.bgColor='#cc3010');check.playback.seek(2)`);
        await until(async () => { const p = await pixel(); return p[0] > p[2] + 70; }, 'live edit arrives on output');
        output.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
        await until(() => js(`check.store.playing.value`), 'external play control');
        output.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});
        await until(() => js(`!check.store.playing.value`), 'external pause control');
        await js(`check.playback.seek(2)`);
        output.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'});
        await wait(150);
        assert.ok(await js(`check.playback.getViewerTime()>2`), 'external frame-step controls editor');
        output.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
        await until(() => js(`!check.preview.previewDisplays.value.active`), 'escape restores local preview');
        await js(`check.store.room.value='design'`); await wait(150);
        await js(`check.store.room.value='edit'`); await wait(1200);
        assert.equal(await js(`Boolean(document.querySelector('[role=dialog]'))`), false, 'offer does not repeat on room changes');
        await js(`check.preview.setPreviewDisplay('2')`);
        await js(`check.store.room.value='record'`);
        await until(() => js(`!check.preview.previewDisplays.value.active`), 'room change closes external preview');
        await js(`check.store.room.value='edit';check.preview.setPreviewDisplay('2')`);
        await until(() => js(`Boolean(check.preview.previewDisplays.value.active)`), 'reopen before unplug');
        displays = [displays[0]]; screen.emit('display-removed', {}, { id: 2 });
        await until(() => js(`!check.preview.previewDisplays.value.active`), 'unplug restores preview');
        fs.writeFileSync(path.join(dir, 'editor.png'), (await win.webContents.capturePage()).toPNG());
        console.log('PASS: offer, real video, live edits, layout, frame stepping, Esc, room changes, unplug');
        clearTimeout(timeout); app.exit(0);
      } catch (e) {
        console.error(e);
        console.error(await js(`({text:document.body.innerText.slice(-1800),state:check.preview.previewDisplays.value})`).catch(() => 'no state'));
        clearTimeout(timeout); app.exit(1);
      }
    });
  });
  const Module = require('node:module');
  const mainFile = require.resolve(path.join(root, 'src/main/main.js'));
  const loadJavaScript = Module._extensions['.js'];
  Module._extensions['.js'] = function(module, filename) {
    if(filename!==mainFile)return loadJavaScript(module,filename);
    Module._extensions['.js']=loadJavaScript;
    module._compile(fs.readFileSync(filename,'utf8').replace('backgroundThrottling: false,','backgroundThrottling: false, offscreen: true,'),filename);
  };
  require(mainFile);
  ipcMain.removeHandler('permissions:request'); ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list'); ipcMain.handle('screens:list', () => []);
}
