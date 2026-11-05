// Usage: node scripts/capture-recording.cjs [raw-recording-directory] [new-demo-directory] [reference-project.reccut]
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Test 2/Recordings/Recording 2026-11-05 22.35.43'));
    const folder = path.resolve(process.argv[3] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-05/Echoes - Screen and Camera'));
    const reference = path.resolve(process.argv[4] || path.join(os.homedir(), 'Movies/Reccut/Test 2/Test 3.reccut'));
    if (fs.existsSync(folder)) throw new Error(`Demo already exists: ${folder}. Choose a new directory.`);
    if (!fs.existsSync(source)) throw new Error(`Recording not found: ${source}`);
    for (const name of ['Media', 'Recordings', 'Exports']) fs.mkdirSync(path.join(folder, name), { recursive: true });
    for (const name of ['recording.json','screen.mp4','camera.mp4']) if (!fs.existsSync(path.join(source,name))) throw new Error(`Missing raw recording file: ${name}`);
    const input = path.join(folder, 'Recordings', 'Echoes raw recording'); fs.cpSync(source, input,{recursive:true});
    const original=JSON.parse(fs.readFileSync(reference,'utf8'));
    const screen=Object.values(original.clips).find(c=>c.recordingPart==='screen'&&path.resolve(original.media[c.mediaId]?.path||'')===source);
    if(!screen) throw new Error('The reference project has no screen clip for this recording');
    const range={in:screen.in,dur:screen.dur,fps:original.fps};
    const { newProject } = await import(path.join(root, 'src/shared/model.js'));
    const p = newProject('Echoes of Quite Recent'); p.id = 'website-echoes-demo';
    const project = path.join(folder, 'Echoes of Quite Recent.reccut');
    fs.writeFileSync(project, JSON.stringify(p, null, 2));
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-echoes-photography-'));
    console.log(`Capture workspace: ${temporary}`);
    fs.writeFileSync(path.join(temporary,'range.json'),JSON.stringify(range));
    fs.writeFileSync(path.join(folder,'README.txt'),`Screen and camera copied from ${source}.\nTrim copied from ${reference}: source ${range.in}s, duration ${range.dur}s, ${range.fps} fps.\nOriginal source files and project are unchanged. The edit keeps linked screen/camera tracks, adds a 0.7s fade-in and an editable game link.\n`);
    await require(path.join(root, 'node_modules/esbuild')).build({
      entryPoints: [path.join(root, 'scripts/website-recording.jsx')], outfile: path.join(temporary, 'capture.js'),
      bundle: true, format: 'iife', platform: 'browser', target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
      banner: { js: `localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,skimming:false,audioSkimming:false,askSequenceSettings:false}));localStorage.setItem('editorSplit','0.55');` },
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
  const timeout = setTimeout(() => { console.error('Gameplay photography timed out'); app.exit(1); }, 240000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      const media = path.join(root, 'docs/media');
      try {
        win.setContentSize(1500, 1000);
        const range=JSON.parse(fs.readFileSync(path.join(temporary,'range.json'),'utf8'));
        await js(`recordPhotography.start(${JSON.stringify(input)},${JSON.stringify(range)})`);
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
        const output=path.join(path.dirname(process.argv[3]),'Exports','Echoes of Quite Recent.mp4');
        const id=await js(`recordPhotography.exportEdit(${JSON.stringify(output)})`);
        const jobs=require(path.join(root,'src/main/jobs'));
        const finish=async id=>{
          for(let i=0;i<1500;i++){
            const task=jobs.snapshot().find(t=>t.id===id);
            if(task?.state==='error')throw new Error(task.error);
            if(task?.state==='done')return;
            await wait(100);
          }
          throw new Error('Edited clip export timed out');
        };
        await finish(id);
        await ff.run(['-i',output,'-c:v','libx264','-preset','slow','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',path.join(media,'echoes-edited.mp4')]).promise;
        for(const [label,time] of [['fade-start',0],['fade-middle',0.35],['fade-complete',0.8],['game-link',3.5]]){
          await finish(await js(`recordPhotography.exportFrame(${JSON.stringify(path.join(temporary,label+'.jpg'))},${time})`));
        }
        console.log('Captured separate-track recording loop, poster, editor screenshot, and finished edit');
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
