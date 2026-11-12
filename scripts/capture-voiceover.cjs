// Photograph the actual studio in an isolated profile, using demo audio only.
// Usage: node scripts/capture-voiceover.cjs <demo-directory>
// The directory contains script.txt (four English paragraphs) and matching English
// narration in line-0.wav to line-3.wav. Use Reccut's openly licensed voices, never Lingit.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    if (!process.argv[2]) throw new Error('Supply a demo directory with script.txt and line-0.wav to line-3.wav.');
    const demo = path.resolve(process.argv[2]);
    for (const name of ['script.txt', ...Array.from({ length: 4 }, (_, i) => `line-${i}.wav`)]) {
      if (!fs.existsSync(path.join(demo, name))) throw new Error(`Missing demo input: ${name}`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-voiceover-photography-'));
    const file = name => JSON.stringify(path.join(root, name));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `
        import ${file('src/renderer/app.jsx')};
        import * as store from ${file('src/renderer/editor/store.js')};
        import * as booth from ${file('src/renderer/voiceover/booth.js')};
        import * as preview from ${file('src/renderer/voiceover/preview.js')};
        import * as timeline from ${file('src/renderer/voiceover/VoTimeline.jsx')};
        import { newProject } from ${file('src/shared/model.js')};
        import { parseScript, detectSpeech, levelEnvelope, trimFor, peakInfo } from ${file('src/shared/voiceover.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        window.voicePhotography = {store, booth, preview, timeline, newProject, parseScript, detectSpeech, levelEnvelope, trimFor, peakInfo, toasts};
      `, resolveDir: root, loader: 'jsx' },
      banner: { js: `localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,reopenLast:false,aiModelsAsked:true,voSubtitles:true,voRoomFill:false,voTimelineH:180,voFont:22,voMic:'',voCam:''}));navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('Demo capture does not use input devices','NotAllowedError'));navigator.mediaDevices.enumerateDevices=async()=>[];` },
      outfile: path.join(temporary, 'capture.js'), bundle: true, format: 'iife', platform: 'browser',
      target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
    });
    fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(temporary, 'audiofx-worklet.js'));
    fs.writeFileSync(path.join(temporary, 'capture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'capture.css').replace('app.js', 'capture.js'));
    console.log(`Capture workspace: ${temporary}`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(electron, [__filename, temporary, demo], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, session } = electron;
  const temporary = process.argv[2], demo = process.argv[3];
  app.setPath('appData', temporary);
  app.setPath('userData', path.join(temporary, 'profile'));
  const originalLoad = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return originalLoad.call(this, file === path.join(root, 'build/index.html') ? path.join(temporary, 'capture.html') : file, options);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let started = false;
  const timeout = setTimeout(() => { console.error('Studio photography timed out'); app.exit(1); }, 90000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      try {
        await wait(1500);
        win.unmaximize();
        win.setContentSize(1500, 1050);
        const script = fs.readFileSync(path.join(demo, 'script.txt'), 'utf8');
        const files = Array.from({ length: 4 }, (_, i) => path.join(demo, `line-${i}.wav`));
        await js(`(async () => {
          const q = voicePhotography;
          const p = q.newProject('A story starts with a voice');
          const script = ${JSON.stringify(script)};
          const lines = q.parseScript(script).filter(b => b.kind === 'line');
          if (lines.length !== 4) throw Error('Demo script must contain four paragraphs.');
          const files = ${JSON.stringify(files)};
          const takes = [];
          for (let i = 0; i < files.length; i++) {
            const audio = await q.preview.load(files[i]);
            const samples = audio.getChannelData(0);
            const trim = q.trimFor(q.detectSpeech(q.levelEnvelope(samples, audio.sampleRate)), audio.duration, {preRoll: 0.05, postRoll: 0.08});
            const id = 'narration-' + i;
            p.media[id] = { id, name: 'Narration ' + (i + 1), kind: 'audio', duration: audio.duration,
              path: files[i], streams: {main: {path: files[i], hasAudio: true, hasVideo: false, duration: audio.duration}} };
            takes.push({id: 'take-' + i, key: lines[i].key, person: 'p1', mediaId: id, file: files[i],
              ...trim, ...q.peakInfo(samples), n: 1, duration: audio.duration, star: i === 0});
          }
          p.voiceover = { script: {name: 'A story starts with a voice', text: script}, pos: lines[0].index,
            people: [{id: 'p1', name: 'Narrator', color: '#5ac8fa', gain: 0, fx: q.booth.DEFAULT_FX()}],
            person: 'p1', takes, selected: {}, skip: {}, roomToneSkipped: true };
          q.store.setProject(p);
          q.store.needsProject.value = false;
          q.store.room.value = 'edit';
          q.booth.boothOpen.value = true;
        })()`);
        await wait(2000);
        await js(`voicePhotography.timeline.studioMenu('zoomFit'); voicePhotography.booth.inputError.value = null; voicePhotography.toasts.value = []; document.activeElement?.blur()`);
        await js(`document.querySelector('.vo-scroll').scrollTop = 0; document.querySelector('.vo-side').scrollTop = document.querySelector('.vo-sound').offsetTop - 20`);
        await wait(1000);
        const text = await js(`document.querySelector('.vo-booth')?.innerText || document.body.innerText`);
        if (!text.includes('AI Clean Voice') || !text.includes('Send to Edit')) throw new Error('Studio did not finish rendering');
        const shot = await win.webContents.capturePage();
        const image = shot.resize({ width: 2000 });
        const output = path.join(root, 'docs/media/voice-over-studio.jpg');
        fs.writeFileSync(output, image.toJPEG(90));
        console.log(`Captured ${output}: ${JSON.stringify(image.getSize())}`);
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) { console.error(error?.stack || error); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require(path.join(root, 'src/main/input'));
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
  require(path.join(root, 'src/main/main'));
  ipcMain.removeHandler('permissions:request');
  ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list');
  ipcMain.handle('screens:list', () => []);
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)));
}
