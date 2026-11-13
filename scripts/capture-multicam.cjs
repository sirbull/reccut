// Photograph the actual editor for the multicam handbook, using an isolated profile.
// Usage: node scripts/capture-multicam.cjs <city-shots-directory> [output-directory]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'Downloads/city-shots'));
    const output = path.resolve(process.argv[3] || path.join(root, 'assets/help'));
    const files = ['343478_medium.mp4', '21116-315137080_medium.mp4', '84973-587646755_medium.mp4',
      '91744-636709154_medium.mp4', '14385-256955049_medium.mp4'].map(file => path.join(source, file));
    for (const file of [...files, path.join(root, 'build/audiofx-worklet.js')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-multicam-handbook-'));
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(temporary, 'inputs.json'), JSON.stringify({ files, output }));
    const file = name => JSON.stringify(path.join(root, name));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `
        import ${file('src/renderer/app.jsx')};
        import * as store from ${file('src/renderer/editor/store.js')};
        import * as commands from ${file('src/renderer/editor/commands.js')};
        import * as playback from ${file('src/renderer/editor/playback.js')};
        import * as controller from ${file('src/renderer/editor/multicam.js')};
        import * as model from ${file('src/shared/model.js')};
        import * as multicam from ${file('src/shared/multicam.js')};
        import { addMediaClip } from ${file('src/shared/ops.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        window.multicamPhotography = {store, commands, playback, controller, model, multicam, addMediaClip, toasts};
      `, resolveDir: root, sourcefile: 'multicam-photography.jsx', loader: 'jsx' },
      banner: { js: `
        localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,reopenLast:false,aiModelsAsked:true,importCopy:false,importOptimize:false,importAnalyzeStab:false,skimming:false,audioSkimming:false}));
        for(const [key,value] of Object.entries({mcBrowserVisible:'on',mcPropsVisible:'on',mcBrowserView:'filmstrip',mcBrowserW:240,mcPropsW:285,mcSplit:0.5,mcTimelineH:490,mcAngleH:45,mcSoundH:65,mcProgramH:75,editorBrowserW:280,editorInspectorW:300}))localStorage.setItem(key,String(value));
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
  const timeout = setTimeout(() => { console.error('Multicam photography timed out'); app.exit(1); }, 180000);
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
        await js('multicamPhotography.toasts.value=[];document.activeElement?.blur()');
        for (let i = 0; i < 100; i++) {
          const ready = await js(`(()=>{
            if(document.querySelector('.mc-window'))return [...document.querySelectorAll('.mc-grid video')].every(el=>el.readyState>=2&&!el.seeking&&el.videoWidth>0);
            return !multicamPhotography.store.project.value.duration||Boolean(multicamPhotography.playback.snapshot({fresh:true}));
          })()`);
          if (ready) break;
          if (i === 99) throw new Error(`Video frames were not ready for ${name}`);
          await wait(100);
        }
        win.webContents.invalidate();
        await js(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        await js(`Promise.all([...document.querySelectorAll('.mc-window')].flatMap(el=>el.getAnimations()).map(animation=>animation.finished.catch(()=>{})))`);
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
      const mount = async (definition, time = 3, dirty = false) => {
        await js(`(()=>{const q=multicamPhotography;const s=q.controller.multicamSession.value;q.controller.multicamSession.value={...s,key:s.key+100,mc:${definition},time:${time},dirty:${dirty}};})()`);
        await wait(700);
      };
      try {
        win.setContentSize(1800, 1200);
        await wait(4000);
        const ff = require(path.join(root, 'src/main/ffmpeg'));
        const ambience = path.join(temporary, 'Camera 4 audio.flac');
        await ff.run(['-i', files[3], '-vn', '-c:a', 'flac', ambience]).promise;
        await js(`(async()=>{
          const q=multicamPhotography;
          q.store.setProject(q.model.newProject('City shots - Multicam guide'));
          q.store.needsProject.value=false;q.store.room.value='edit';
          const media=await q.store.importPaths(${JSON.stringify([...files, ambience])},null,{copy:false,optimize:false});
          if(media.length!==6)throw Error('The demo media could not be imported');
          q.ids=media.map(m=>m.id);
        })()`);
        const jobs = require(path.join(root, 'src/main/jobs'));
        for (let i = 0; i < 300 && jobs.snapshot().some(task => task.state === 'running' || task.state === 'queued'); i++) await wait(100);
        const failed = jobs.snapshot().filter(task => task.state === 'error');
        if (failed.length) throw new Error(`Demo media analysis failed: ${JSON.stringify(failed)}`);
        await js(`(()=>{const q=multicamPhotography;q.base=structuredClone(q.store.project.value);q.controller.newMulticamClip([...q.ids.slice(0,4),q.ids[5]]);q.controller.multicamSession.value.mc.name='City shots';})()`);
        await wait(1200);
        assert.equal(await js(`document.querySelectorAll('.mc-seg').length`), 0);
        await photo('multicam-empty');

        // Build the first ten seconds through the same paused keyboard workflow used in the guide.
        for (const [time, angle] of [[0,1],[2,2],[4,3],[6,4],[10,4]]) {
          await seek(time);
          if (time === 10) await key('ArrowLeft', 'ArrowLeft');
          await key(String(angle), 'Digit' + angle);
        }
        await seek(3);
        await js('multicamPhotography.controller.flushMulticamDraft()');
        console.log('Camera choices: ' + JSON.stringify(await js('multicamPhotography.controller.savedMulticamDrafts.value[0]?.mc.cuts')));
        await photo('multicam-window');
        await photo('multicam-angles', '.mc-angles, .mc-program');
        await photo('multicam-timeline', '.mc-timeline');
        await js(`(()=>{const q=multicamPhotography;q.chosen=structuredClone(q.controller.savedMulticamDrafts.value[0].mc)})()`);

        await click('.mc-head button[title="Hide Files"]');
        await click('.mc-head button[title="Hide Properties"]');
        await photo('multicam-panels-hidden');
        await click('.mc-head button[title="Show Files"]');
        await click('.mc-head button[title="Show Properties"]');

        // The first three city clips have no audio. The actual sync result explains that.
        await js(`(()=>{const b=[...document.querySelectorAll('.mc-head button')].find(b=>b.textContent.includes('Auto Sync'));b.click()})()`);
        for (let i = 0; i < 100 && await js(`document.querySelector('.mc-head').textContent.includes('Synchronizing')`); i++) await wait(100);
        await photo('multicam-sync');
        await mount('structuredClone(q.chosen)');

        const sound = `(()=>{const m=structuredClone(q.chosen);const a=m.angles.find(a=>q.store.project.value.media[a.mediaId].kind==='audio');a.sound={...q.multicam.SOUND_DEFAULTS,volume:-3,volumeKf:[[0,-3],[5,-3],[7,-12],[10,-12]],rumble:true};return m})()`;
        await mount(sound, 3, true);
        await js(`document.querySelector('.mc-props-body').scrollTop=document.querySelector('.mc-props-body').scrollHeight`);
        await photo('multicam-panels', '.mc-properties');
        await photo('multicam-sound-track', '.mc-timeline');

        await seek(2);await key('i','KeyI');
        await seek(8);await key('o','KeyO');
        await seek(3);
        await photo('multicam-range');
        await mount('structuredClone(q.chosen)', 3, true);

        // Capture the real drag indicator before dropping the fourth camera above the third.
        const drag = await js(`(()=>{const rows=[...document.querySelectorAll('.mc-tl-head.track')];return [rows[3],rows[2]].map(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x+13),y:Math.round(r.y+r.height/2)}})})()`);
        if (drag.length !== 2) throw new Error('Camera track headers are missing');
        win.webContents.sendInputEvent({ type: 'mouseDown', ...drag[0], button: 'left', clickCount: 1 });
        win.webContents.sendInputEvent({ type: 'mouseMove', ...drag[1], movementX: 0, movementY: drag[1].y - drag[0].y });
        await photo('multicam-reorder', '.mc-timeline');
        win.webContents.sendInputEvent({ type: 'mouseUp', ...drag[1], button: 'left', clickCount: 1 });
        await mount('structuredClone(q.chosen)', 3, true);

        await js(`document.querySelector('.mc-file-strip[data-media="'+multicamPhotography.ids[4]+'"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
        await photo('multicam-new-camera');
        await mount('structuredClone(q.chosen)', 3, true);
        await key('Escape', 'Escape');
        assert.equal(await js('multicamPhotography.controller.multicamSession.value'), null);
        await js('multicamPhotography.controller.resumeMulticamDraft()');
        await photo('multicam-draft');
        assert.equal(await js('multicamPhotography.controller.multicamSession.value.restored'), true);

        await js(`(()=>{const b=[...document.querySelectorAll('.mc-head button')].find(b=>b.textContent.includes('Add to Timeline'));b.click()})()`);
        await wait(500);
        assert.ok(Math.abs(await js('multicamPhotography.store.project.value.duration') - 10) < 1e-6);
        await js('multicamPhotography.commands.zoomFit();multicamPhotography.playback.seek(3)');
        await wait(800);
        await photo('multicam-result');

        await js('multicamPhotography.commands.removeBrowserMedia([multicamPhotography.ids[0]],{forceDialog:true})');
        await photo('multicam-media-removal', '.modal');
        await key('Escape', 'Escape');

        await js(`(()=>{const q=multicamPhotography;q.store.setProject(structuredClone(q.base));q.store.needsProject.value=false;q.store.room.value='edit';q.store.commit(p=>q.ids.slice(0,3).forEach((id,i)=>q.addMediaClip(p,p.media[id],i===0?'append':'connect',0,i)));q.store.selection.value=Object.keys(q.store.project.value.clips);q.commands.zoomFit();q.playback.seek(2);})()`);
        await photo('multicam-stacked');
        fs.writeFileSync(path.join(temporary, 'capture-report.json'), JSON.stringify({ version: require('../package.json').version,
          cameraFiles: files.map(file => path.basename(file)), separateAudio: 'Extracted losslessly from camera 4',
          initialProgramEmpty: true, recoveredDraft: true, outputDuration: 10, images: fs.readdirSync(output).filter(name => name.startsWith('multicam-')) }, null, 2));
        console.log('Verified empty Program, paused camera choices, draft recovery and ten-second output.');
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
