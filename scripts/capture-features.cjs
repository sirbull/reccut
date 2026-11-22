// Photograph Beat Grid, Transcript Search, the color tools and the video scopes in the real editor for the website feature cards,
// using an isolated profile. Media comes from scripts/feature-demo-media.mjs and the nature demo.
// The speech model is copied from the given app profile into the temporary profile; nothing is downloaded.
// Usage: node scripts/capture-features.cjs [feature-media-dir] [nature-media-dir] [user-data-with-models] [output-dir]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const features = path.resolve(process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-22/Feature Cards/Media'));
    const nature = path.resolve(process.argv[3] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-05/Into the Wild/Media'));
    const userData = path.resolve(process.argv[4] || path.join(os.homedir(), 'Library/Application Support/Reccut Development'));
    const output = path.resolve(process.argv[5] || path.join(root, 'docs/media'));
    const clips = ['Mountain lake.mp4', 'Coastal ridge.mp4', 'Falling water.mp4', 'Forest light.mp4', 'Quiet coast.mp4', 'River gorge.mp4'].map(f => path.join(nature, f));
    const beat = path.join(features, 'Demo beat - 100 BPM.wav');
    const takes = ['Interview - Take 1.wav', 'Interview - Take 2.wav', 'Narration - Coast.wav'].map(f => path.join(features, f));
    for (const file of [...clips, beat, ...takes, path.join(userData, 'subtitle-models/manifest.json'), path.join(root, 'build/audiofx-worklet.js')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run feature-demo-media.mjs and npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-feature-cards-'));
    // The installed Whisper model, with its manifest pointing at the copy.
    const models = path.join(temporary, 'profile/subtitle-models');
    fs.cpSync(path.join(userData, 'subtitle-models'), models, { recursive: true });
    const manifest = path.join(models, 'manifest.json');
    fs.writeFileSync(manifest, fs.readFileSync(manifest, 'utf8').split(path.join(userData, 'subtitle-models')).join(models));
    fs.writeFileSync(path.join(temporary, 'inputs.json'), JSON.stringify({ clips, beat, takes, output }));
    const file = name => JSON.stringify(path.join(root, name));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `
        import ${file('src/renderer/app.jsx')};
        import * as store from ${file('src/renderer/editor/store.js')};
        import * as commands from ${file('src/renderer/editor/commands.js')};
        import * as playback from ${file('src/renderer/editor/playback.js')};
        import * as model from ${file('src/shared/model.js')};
        import * as transcripts from ${file('src/renderer/editor/transcripts.js')};
        import { addMediaClip } from ${file('src/shared/ops.js')};
        import { setPrefs } from ${file('src/renderer/prefs.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        import { notice } from ${file('src/renderer/recorder/engine.js')};
        window.q = {notice, store, commands, playback, model, transcripts, addMediaClip, setPrefs, toasts};
      `, resolveDir: root, sourcefile: 'feature-photography.jsx', loader: 'jsx' },
      banner: { js: `
        localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,reopenLast:false,aiModelsAsked:true,voicePackagesAsked:true,importCopy:false,importOptimize:false,importAnalyzeStab:false,skimming:false,audioSkimming:false,beatGrid:true}));
        for(const [key,value] of Object.entries({editorBrowserW:260,editorInspectorW:300,editorSplit:0.5}))localStorage.setItem(key,String(value));
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
  const { clips, beat, takes, output } = JSON.parse(fs.readFileSync(path.join(temporary, 'inputs.json'), 'utf8'));
  app.setPath('appData', temporary);
  app.setPath('userData', path.join(temporary, 'profile'));
  BrowserWindow.prototype.show = function() {};
  BrowserWindow.prototype.maximize = function() {};
  const load = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return load.call(this, file === path.join(root, 'build/index.html') ? path.join(temporary, 'capture.html') : file, options);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ZOOM = 2;
  const timeout = setTimeout(() => { console.error('Feature photography timed out'); app.exit(1); }, 600000);
  let started = false;
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.setAudioMuted(true);
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      const jobs = require(path.join(root, 'src/main/jobs'));
      const idle = async () => {
        for (let i = 0; i < 3000 && jobs.snapshot().some(t => t.state === 'running' || t.state === 'queued'); i++) await wait(100);
      };
      // trim: optional { left, top, width, height } in CSS pixels inside the element.
      const photo = async (name, selector, trim) => {
        await js('q.toasts.value=[];q.notice.value=null;document.activeElement?.blur?.()');
        win.webContents.invalidate();
        await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
        await wait(500);
        win.webContents.invalidate();
        await wait(150);
        const rect = await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Screenshot area missing: '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`);
        let image = await win.webContents.capturePage();
        // Pictures are taken at 2x (see ZOOM), sharp on high-density screens.
        const scale = image.getSize().width / (win.getContentSize()[0] / ZOOM);
        if (trim) Object.assign(rect, { x: rect.x + (trim.left || 0), y: rect.y + (trim.top || 0), width: trim.width || rect.width, height: trim.height || rect.height });
        image = image.crop({ x: Math.round(rect.x * scale), y: Math.round(rect.y * scale), width: Math.round(rect.width * scale), height: Math.round(rect.height * scale) });
        fs.writeFileSync(path.join(output, name + '.jpg'), image.toJPEG(92));
        console.log(`Captured ${name}: ${JSON.stringify(image.getSize())}`);
      };
      try {
        win.setContentSize(1440 * ZOOM, 1000 * ZOOM);
        win.webContents.setZoomFactor(ZOOM);
        await wait(4000);
        await js(`(async()=>{
          q.store.setProject(q.model.newProject('Feature cards'));
          q.store.needsProject.value=false;q.store.room.value='edit';
          const media=await q.store.importPaths(${JSON.stringify([...clips, beat, ...takes])},null,{copy:false,optimize:false});
          if(media.length!==${clips.length + 1 + takes.length})throw Error('The demo media could not be imported');
          q.ids=media.map(m=>m.id);
        })()`);
        await idle();

        // Beat Grid: six shots cut on every second bar of a 100 BPM beat, on a track marked Music.
        await js(`(()=>{const ids=q.ids;q.store.commit(p=>{
          for(let i=0;i<${clips.length};i++)q.addMediaClip(p,p.media[ids[i]],'append',0,0,{in:1,dur:4.8,includeAudio:false});
          const id=q.addMediaClip(p,p.media[ids[${clips.length}]],'connect',0,-1);p.clips[id].dur=28.8;
          p.lanes={...(p.lanes||{}),[-1]:{music:true}};
        });})()`);
        for (let i = 0; i < 600; i++) {
          if (await js(`Boolean(Object.values(q.store.project.value.media).find(m=>m.kind==='audio'&&m.streams.main.beats?.beats?.length))`)) break;
          if (i === 599) throw new Error('No beats were detected');
          await wait(100);
        }
        const bpm = await js(`Object.values(q.store.project.value.media).find(m=>m.streams.main.beats)?.streams.main.beats.bpm`);
        assert.ok(Math.abs(bpm - 100) < 1, `The demo beat was detected at ${bpm} BPM`);
        await js(`q.commands.zoomFit();q.store.pps.value=62;q.playback.seek(9.6);document.querySelector('.tl-scroll, .timeline [class*="scroll"]')?.scrollTo?.({left:0})`);
        await wait(1500);
        await photo('feature-beat-grid', '.timeline', { top: 36, width: 1000, height: 356 });

        // Color: Mountain lake with teal shadows and warm highlights, the Color tab, then the four video scopes.
        await js(`(()=>{const c=Object.values(q.store.project.value.clips).find(c=>c.lane===0&&q.store.project.value.media[c.mediaId].name.startsWith('Mountain lake'));
          q.store.commit(p=>Object.assign(p.clips[c.id].props,{contrast:0.14,highlights:-0.15,shadows:0.06,saturation:0.06,temperature:0.04,liftX:-0.14,liftY:-0.08,liftL:-0.03,gainX:0.08,gainY:0.1,gainL:0.02}));
          q.store.selection.value=[c.id];q.commands.inspectorTab.value='color';q.setPrefs({editorBrowserVisible:false});q.playback.seek(2.2);})()`);
        for (let i = 0; i < 100 && !(await js('Boolean(q.playback.snapshot({fresh:true}))')); i++) await wait(100);
        await wait(800);
        await js(`document.querySelector('.inspector [data-section="wheels"]').scrollIntoView({block:'end'})`);
        await wait(300);
        await photo('color-tile-grade', '.editor-top', { left: 233, top: 44, width: 674, height: 378 });
        // The color wheels with room below them, for the website tile.
        await js(`document.querySelector('.inspector [data-section="wheels"]').scrollIntoView({block:'center'})`);
        await wait(300);
        await photo('color-tile-wheels', '.inspector', { left: 5, top: 190, width: 285, height: 160 });
        await js(`q.setPrefs({videoScopesVisible:true,videoScopesMode:'all',videoScopesGain:2})`);
        await wait(2500);
        await photo('color-tile-vectorscope', '.video-scopes', { left: 892, top: 62, width: 210, height: 165 });
        await js(`q.setPrefs({videoScopesVisible:false})`);

        // Transcript Search: three English takes transcribed by the local speech model, searched for "sunrise".
        // A project of its own, so only the takes are listed.
        const speech = await js(`(async()=>{
          q.store.setProject(q.model.newProject('Interviews'));
          q.store.needsProject.value=false;q.store.room.value='edit';
          return (await q.store.importPaths(${JSON.stringify(takes)},null,{copy:false,optimize:false})).map(m=>m.id);
        })()`);
        await idle();
        await js(`q.transcripts.transcribeAll(${JSON.stringify(speech)},'english')`);
        const words = await js(`${JSON.stringify(speech)}.map(id=>q.store.project.value.media[id].transcript?.segments.map(s=>s.text).join(' '))`);
        console.log('Transcripts:', words);
        assert.ok(words.every(Boolean), 'A take was not transcribed');
        await js(`q.transcripts.transcriptSearchOpen.value=true`);
        await wait(600);
        await js(`(()=>{const i=document.querySelector('.transcript-search input');i.value='sunrise';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await wait(600);
        const hits = await js(`document.querySelectorAll('.transcript-search .palette-item').length`);
        assert.ok(hits >= 2, `Expected two hits for sunrise, found ${hits}`);
        await photo('feature-transcript-search', '.transcript-search');

        clearTimeout(timeout);
        app.exit(0);
      } catch (error) { console.error(error?.stack || error); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require(path.join(root, 'src/main/input'));
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
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
