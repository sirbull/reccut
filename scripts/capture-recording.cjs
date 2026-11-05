// Usage: node scripts/capture-recording.cjs [echoes.mp4] [new-demo-directory]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'Downloads/echoes.mp4'));
    const folder = path.resolve(process.argv[3] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-05/Gameplay recording demo'));
    if (fs.existsSync(folder)) throw new Error(`Demo already exists: ${folder}. Choose a new directory.`);
    if (!fs.existsSync(source)) throw new Error(`Recording not found: ${source}`);
    for (const name of ['Media', 'Recordings', 'Exports']) fs.mkdirSync(path.join(folder, name), { recursive: true });
    const input = path.join(folder, 'Media', 'echoes.mp4'); fs.copyFileSync(source, input);
    const { newProject } = await import(path.join(root, 'src/shared/model.js'));
    const p = newProject('Gameplay recording demo'); p.id = 'website-echoes-demo';
    const project = path.join(folder, 'Gameplay recording demo.reccut');
    fs.writeFileSync(project, JSON.stringify(p, null, 2));
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-echoes-photography-'));
    console.log(`Capture workspace: ${temporary}`);
    await require(path.join(root, 'node_modules/esbuild')).build({
      entryPoints: [path.join(root, 'scripts/website-recording.jsx')], outfile: path.join(temporary, 'capture.js'),
      bundle: true, format: 'iife', platform: 'browser', target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
      banner: { js: `localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,skimming:false,audioSkimming:false,askSequenceSettings:false}));localStorage.setItem('editorSplit','0.58');` },
    });
    fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(temporary, 'audiofx-worklet.js'));
    fs.writeFileSync(path.join(temporary, 'capture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'capture.css').replace('app.js', 'capture.js'));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(electron, [__filename, temporary, project, input], { env, stdio: 'inherit', cwd: root });
    process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
    console.log(`Gameplay project: ${project}`);
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, session } = electron;
  const temporary = process.argv[2], input = process.argv[4];
  app.setPath('appData', temporary); app.setPath('userData', path.join(temporary, 'profile'));
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const load = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return load.call(this, file === path.join(root, 'build/index.html') ? path.join(temporary, 'capture.html') : file, options);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let started = false;
  const timeout = setTimeout(() => { console.error('Gameplay photography timed out'); app.exit(1); }, 120000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      const media = path.join(root, 'docs/media');
      try {
        win.setContentSize(1500, 1000);
        await js(`recordPhotography.start(${JSON.stringify(input)})`);
        await js('recordPhotography.clean()');
        const frames = path.join(temporary, 'frames'); fs.mkdirSync(frames);
        const fps = 15, count = 120, began = Date.now();
        for (let i = 0; i < count; i++) {
          const due = began + i * 1000 / fps;
          if (Date.now() < due) await wait(due - Date.now());
          const frame = await win.webContents.capturePage();
          fs.writeFileSync(path.join(frames, `${String(i).padStart(4, '0')}.jpg`), frame.resize({ width: 1500 }).toJPEG(92));
          if (i === 45) fs.writeFileSync(path.join(media, 'record-gameplay.jpg'), frame.resize({ width: 2000 }).toJPEG(92));
        }
        await js('recordPhotography.edit()');
        await js('recordPhotography.clean()');
        const frame = await win.webContents.capturePage();
        fs.writeFileSync(path.join(media, 'record-gameplay-edit.jpg'), frame.resize({ width: 2000 }).toJPEG(92));
        const ff = require(path.join(root, 'src/main/ffmpeg'));
        await ff.run(['-framerate',String(fps),'-i',path.join(frames,'%04d.jpg'),'-vf','scale=1440:-2:out_range=tv:out_color_matrix=bt709,setsar=1,format=yuv420p','-an','-c:v','libx264','-preset','slow','-crf','22','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-movflags','+faststart',path.join(media,'record-gameplay.mp4')]).promise;
        console.log('Captured new recording loop, poster, and editor screenshot from echoes.mp4');
        clearTimeout(timeout); app.exit(0);
      } catch (error) { console.error(error.stack); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require(path.join(root, 'src/main/input'));
  InputTracker.prototype.start = () => false; InputTracker.prototype.startPolling = () => {};
  require(path.join(root, 'src/main/main'));
  for (const [channel, result] of [['permissions:request', {}], ['screens:list', []], ['rec:showControls', null]]) {
    ipcMain.removeHandler(channel); ipcMain.handle(channel, () => result);
  }
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)));
}
