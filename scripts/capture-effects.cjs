// Photograph the actual editor for the effects handbook (Hue/Saturation, Light leaks,
// Blinking Lights and Blend mode), using an isolated profile.
// Usage: node scripts/capture-effects.cjs <nature-media-directory> [output-directory]
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
    const files = ['Falling water.mp4', 'Coastal ridge.mp4', 'Quiet coast.mp4', 'Mountain lake.mp4', 'Blossoms and bees.mp4'].map(file => path.join(source, file));
    for (const file of [...files, path.join(root, 'build/audiofx-worklet.js')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-effects-handbook-'));
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
        import * as lights from ${file('src/shared/lights.js')};
        import { LEAK_PRESETS } from ${file('src/shared/lightLeak.js')};
        import { addMediaClip } from ${file('src/shared/ops.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        import { notice } from ${file('src/renderer/recorder/engine.js')};
        window.q = {notice, store, commands, playback, model, lights, LEAK_PRESETS, addMediaClip, toasts};
      `, resolveDir: root, sourcefile: 'effects-photography.jsx', loader: 'jsx' },
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
  const timeout = setTimeout(() => { console.error('Effects photography timed out'); app.exit(1); }, 180000);
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
      // A fresh project per picture: the given clips on V1 (and V2), the playhead at T.
      const scene = async (clips, edit, T) => {
        await js(`(()=>{const p=structuredClone(q.base);q.store.setProject(p);q.store.needsProject.value=false;q.store.room.value='edit';
          q.store.commit(p=>${JSON.stringify(clips)}.forEach((i,lane)=>q.addMediaClip(p,p.media[q.ids[i]],lane===0?'append':'connect',0,lane)));
          q.clip=lane=>Object.values(q.store.project.value.clips).find(c=>c.mediaId===q.ids[${JSON.stringify(clips)}[lane]]&&c.type==='video');
          ${edit}
          q.commands.zoomFit();q.playback.seek(${T});})()`);
        await wait(1500);
      };
      try {
        win.setContentSize(1800, 1100);
        await wait(4000);
        await js(`(async()=>{
          q.store.setProject(q.model.newProject('Nature - Effects guide'));
          q.store.needsProject.value=false;q.store.room.value='edit';
          const media=await q.store.importPaths(${JSON.stringify(files)},null,{copy:false,optimize:false});
          if(media.length!==${files.length})throw Error('The demo media could not be imported');
          q.ids=media.map(m=>m.id);
        })()`);
        const jobs = require(path.join(root, 'src/main/jobs'));
        for (let i = 0; i < 300 && jobs.snapshot().some(task => task.state === 'running' || task.state === 'queued'); i++) await wait(100);
        await js('q.base=structuredClone(q.store.project.value)');
        const area = '.viewer, .inspector';
        // Scroll the inspector so the effect's own controls are in the picture.
        const show = async type => { await js(`document.querySelector('.inspector [data-vfx="${type}"]').scrollIntoView({block:'start'})`); await wait(200); };

        // Advanced Hue / Saturation: the green forest by the waterfall turned autumn orange with the Greens range.
        await scene([0], `const c=q.clip(0);q.store.selection.value=[c.id];q.commands.addEffect('hueSaturation',c.id);
          q.store.commit(p=>{const e=p.clips[c.id].props.vfx.at(-1);Object.assign(e.p,{greenHue:-75,greenSaturation:0.25,yellowHue:-20});});`, 2);
        await click('.inspector button.hue-band[aria-label="Greens"]');
        await show('hueSaturation');
        await photo('effects-hue-saturation', area);

        // Light leaks, Golden Hour preset.
        await scene([1], `const c=q.clip(0);q.store.selection.value=[c.id];q.commands.addEffect('lightLeak',c.id);
          q.store.commit(p=>{const e=p.clips[c.id].props.vfx.at(-1);e.p=structuredClone(q.LEAK_PRESETS.find(x=>x.id==='golden').p);});`, 2.5);
        await show('lightLeak');
        await photo('effects-light-leaks', area);

        // Blinking Lights, Police Lights preset, at the frame where the red light is brightest.
        const flash = await js(`(()=>{const p=q.lights.LIGHT_PRESETS[0].p;let best=0,T=1;
          for(let f=15;f<120;f++){const t=f/30,l=q.lights.lightsAt(p,t*p.frequency).lights[0].level;if(l>best){best=l;T=t;}}return T;})()`);
        await scene([2], `const c=q.clip(0);q.store.selection.value=[c.id];q.commands.addEffect('lights',c.id);`, flash);
        await show('lights');
        await photo('effects-blinking-lights', area);

        // Blend mode: blossoms over the mountain lake with Screen, a double exposure.
        await scene([3, 4], `const c=q.clip(1);q.store.commit(p=>{p.clips[c.id].props.blendMode='screen';});
          q.store.selection.value=[c.id];q.commands.inspectorTab.value='video';`, 2);
        assert.equal(await js(`(()=>{const row=[...document.querySelectorAll('.inspector *')].find(el=>el.children.length===0&&el.textContent==='Compositing');row?.scrollIntoView({block:'start'});return Boolean(row)})()`), true);
        await wait(200);
        await photo('effects-blend-mode', area);

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
