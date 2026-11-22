// Photograph the actual editor for the captions handbook: a caption with its own style,
// the Styles cards on one caption, and several captions styled at once.
// Usage: node scripts/capture-captions.cjs <nature-media-directory> [output-directory]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-05/Into the Wild/Media'));
    const output = path.resolve(process.argv[3] || path.join(root, 'assets/help'));
    const files = ['Coastal ridge.mp4'].map(file => path.join(source, file));
    for (const file of [...files, path.join(root, 'build/audiofx-worklet.js')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-captions-handbook-'));
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(temporary, 'inputs.json'), JSON.stringify({ files, output }));
    const file = name => JSON.stringify(path.join(root, name));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `
        import ${file('src/renderer/app.jsx')};
        import * as store from ${file('src/renderer/editor/store.js')};
        import * as commands from ${file('src/renderer/editor/commands.js')};
        import * as playback from ${file('src/renderer/editor/playback.js')};
        import * as model from ${file('src/shared/model.js')};
        import { CAPTION_PRESETS } from ${file('src/shared/captionWords.js')};
        import { addMediaClip, placeFree } from ${file('src/shared/ops.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        import { notice } from ${file('src/renderer/recorder/engine.js')};
        window.q = {notice, store, commands, playback, model, CAPTION_PRESETS, addMediaClip, placeFree, toasts};
      `, resolveDir: root, sourcefile: 'captions-photography.jsx', loader: 'jsx' },
      banner: { js: `
        localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,reopenLast:false,aiModelsAsked:true,importCopy:false,importOptimize:false,importAnalyzeStab:false,skimming:false,audioSkimming:false}));
        for(const [key,value] of Object.entries({editorBrowserW:260,editorInspectorW:340}))localStorage.setItem(key,String(value));
        navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Documentation capture uses local media','NotAllowedError'));
        navigator.mediaDevices.enumerateDevices=async()=>[];
      ` },
      outfile: path.join(temporary, 'capture.js'), bundle: true, format: 'iife', platform: 'browser',
      target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
    });
    fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(temporary, 'audiofx-worklet.js'));
    fs.writeFileSync(path.join(temporary, 'capture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8')
      .replace('app.css', 'capture.css').replace('app.js', 'capture.js'));
    console.log(`Capture workspace: ${temporary}`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(electron, [__filename, temporary], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, session } = electron;
  const temporary = process.argv[2];
  const { files, output } = JSON.parse(fs.readFileSync(path.join(temporary, 'inputs.json'), 'utf8'));
  app.setPath('appData', temporary);
  app.setPath('userData', path.join(temporary, 'profile'));
  // Keep the capture out of the user's desktop and project session.
  BrowserWindow.prototype.show = function() {};
  BrowserWindow.prototype.maximize = function() {};
  const load = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return load.call(this, file === path.join(root, 'build/index.html') ? path.join(temporary, 'capture.html') : file, options);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeout = setTimeout(() => { console.error('Captions photography timed out'); app.exit(1); }, 180000);
  let started = false;
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.setAudioMuted(true);
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      const key = async (key, code, shiftKey = false, altKey = false) => {
        await js(`window.dispatchEvent(new KeyboardEvent('keydown',${JSON.stringify({ key, code, shiftKey, altKey, bubbles: true })}))`);
        await wait(45);
      };
      const seek = async time => {
        await key('Home', 'Home');
        for (let i = 0; i < time; i++) await key('ArrowRight', 'ArrowRight', true);
        await wait(250);
      };
      const click = async selector => {
        await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Control missing: '+${JSON.stringify(selector)});el.click();})()`);
        await wait(180);
      };
      const photo = async (name, selector) => {
        await js('q.toasts.value=[];q.notice.value=null;document.activeElement?.blur()');
        for (let i = 0; i < 100; i++) {
          const ready = await js(`(()=>{
            return !q.store.project.value.duration||Boolean(q.playback.snapshot({fresh:true}));
          })()`);
          if (ready) break;
          if (i === 99) throw new Error(`Video frames were not ready for ${name}`);
          await wait(100);
        }
        win.webContents.invalidate();
        await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        await wait(300);
        win.webContents.invalidate();
        await wait(100);
        const rect = selector ? await js(`(()=>{const nodes=[...document.querySelectorAll(${JSON.stringify(selector)})];if(!nodes.length)throw Error('Screenshot area missing: '+${JSON.stringify(selector)});const boxes=nodes.map(el=>el.getBoundingClientRect());const x=Math.min(...boxes.map(r=>r.x)),y=Math.min(...boxes.map(r=>r.y));return {x:Math.round(x),y:Math.round(y),width:Math.round(Math.max(...boxes.map(r=>r.right))-x),height:Math.round(Math.max(...boxes.map(r=>r.bottom))-y)}})()`) : undefined;
        let image = await win.webContents.capturePage();
        if (rect) {
          const size = image.getSize();
          const scale = size.width / win.getContentSize()[0];
          const x = Math.max(0, Math.round(rect.x * scale));
          const y = Math.max(0, Math.round(rect.y * scale));
          image = image.crop({ x, y, width: Math.min(size.width - x, Math.round(rect.width * scale)),
            height: Math.min(size.height - y, Math.round(rect.height * scale)) });
        }
        const resized = image.resize({ width: Math.min(rect?.width || 1800, 1800) });
        fs.writeFileSync(path.join(output, name + '.jpg'), resized.toJPEG(92));
        console.log(`Captured ${name}: ${JSON.stringify(resized.getSize())}`);
      };
      // A fresh project per picture: the coast clip on the storyline, three captions under it,
      // the given edit, then the playhead at T.
      const scene = async (edit, T) => {
        await js(`(()=>{const p=structuredClone(q.base);q.store.setProject(p);q.store.needsProject.value=false;q.store.room.value='edit';
          q.store.commit(p=>{q.addMediaClip(p,p.media[q.ids[0]],'append',0,0);
            ['Waves roll in from the open sea','The ridge holds back the wind','Evening light on the coast'].forEach((text,i)=>{
              const c=q.model.makeClip('caption',{start:i*2.5,dur:2.4,lane:q.model.CAPTION_LANE,props:{text,align:null,pos:null},name:'Caption'});
              q.placeFree(p,c,c.start,q.model.CAPTION_LANE);});});
          q.caps=Object.values(q.store.project.value.clips).filter(c=>c.type==='caption').sort((a,b)=>a.start-b.start).map(c=>c.id);
          ${edit}
          q.commands.inspectorTab.value='caption';q.commands.zoomFit();q.playback.seek(${T});})()`);
        await wait(1500);
      };
      // Open an inspector section by its heading and scroll it to the top of the inspector.
      // solo closes the other sections, so a long section fills the picture.
      const section = async (title, solo = false) => {
        assert.equal(await js(`(()=>{const all=[...document.querySelectorAll('.inspector section')];const s=all.find(s=>s.querySelector('h3')?.textContent===${JSON.stringify(title)});
          if(!s)return false;for(const o of all)if(o!==s&&${solo}&&!o.classList.contains('closed'))o.querySelector('header').click();
          if(s.classList.contains('closed'))s.querySelector('header').click();return true;})()`), true, `Section missing: ${title}`);
        await wait(300);
        await js(`[...document.querySelectorAll('.inspector section')].find(s=>s.querySelector('h3')?.textContent===${JSON.stringify(title)}).scrollIntoView({block:'start'})`);
        await wait(300);
      };
      try {
        win.setContentSize(1800, 1100);
        await wait(4000);
        await js(`(async()=>{
          q.store.setProject(q.model.newProject('Coast - Captions guide'));
          q.store.needsProject.value=false;q.store.room.value='edit';
          const media=await q.store.importPaths(${JSON.stringify(files)},null,{copy:false,optimize:false});
          if(media.length!==${files.length})throw Error('The demo media could not be imported');
          q.ids=media.map(m=>m.id);
        })()`);
        const jobs = require(path.join(root, 'src/main/jobs'));
        for (let i = 0; i < 300 && jobs.snapshot().some(task => task.state === 'running' || task.state === 'queued'); i++) await wait(100);
        await js('q.base=structuredClone(q.store.project.value)');
        const area = '.viewer, .inspector';

        // One caption with its own style: bigger and red, while the default stays white.
        await scene(`q.store.commit(p=>{p.clips[q.caps[1]].props.style={size:64,color:'#ff453a'};});q.store.selection.value=[q.caps[1]];`, 3.5);
        await section('Style for this caption');
        await photo('captions-own-style', area);

        // The Styles cards on one selected caption: click uses the style here, right click makes it the default.
        await scene(`const look=q.CAPTION_PRESETS.find(x=>x.id==='yellow-outline');
          const {chunkWords,maxLines,...own}=look.style;q.store.commit(p=>{p.clips[q.caps[1]].props.style=own;});q.store.selection.value=[q.caps[1]];`, 3.5);
        await section('Styles', true);
        await photo('captions-styles', area);

        // Several captions selected at once share one style editor.
        await scene(`q.store.commit(p=>{for(const id of q.caps)p.clips[id].props.style={weight:800,bg:true,bgColor:'#0a84ff',bgOpacity:0.9};});q.store.selection.value=[...q.caps];`, 3.5);
        await section('Style for these captions');
        await photo('captions-several');

        clearTimeout(timeout);
        app.exit(0);
      } catch (error) { console.error(error?.stack || error); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require(path.join(root, 'src/main/input'));
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
  // The documentation process uses offscreen rendering so animation and video
  // frames continue without showing a window. Application source stays intact.
  const Module = require('node:module');
  const mainFile = require.resolve(path.join(root, 'src/main/main'));
  const loadJavaScript = Module._extensions['.js'];
  Module._extensions['.js'] = function(module, filename) {
    if (filename !== mainFile) return loadJavaScript(module, filename);
    Module._extensions['.js'] = loadJavaScript;
    const source = fs.readFileSync(filename, 'utf8');
    assert.ok(source.includes('backgroundThrottling: false,'), 'The main window capture setting moved');
    module._compile(source.replace('backgroundThrottling: false,', 'backgroundThrottling: false, offscreen: true,'), filename);
  };
  require(mainFile);
  ipcMain.removeHandler('permissions:request');
  ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list');
  ipcMain.handle('screens:list', () => []);
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)));
}
