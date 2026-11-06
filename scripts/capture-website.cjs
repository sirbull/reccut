// Photograph the real app in an isolated profile. Never opens the source project.
// Usage: node scripts/capture-website.cjs [source.reccut] [demo-directory] [--resume] [--looks-only]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const source = path.resolve(process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Help Demo - Into the Wild/Into the Wild.reccut'));
    const destination = path.resolve(process.argv[3] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-05'));
    const demo = path.join(destination, 'Into the Wild');
    const resume = process.argv.includes('--resume');
    if (fs.existsSync(demo) && !resume) throw new Error(`Demo already exists: ${demo}. Choose a new demo-directory to preserve it, or use --resume.`);
    if (!resume) fs.cpSync(path.dirname(source), demo, { recursive: true });
    const projectFile = path.join(demo, 'Into the Wild.reccut');
    const project = JSON.parse(fs.readFileSync(source, 'utf8').split(path.dirname(source)).join(demo));
    project.id = 'website-into-the-wild-2026-11';
    project.sequenceId = 'website-landscape';
    project.sequenceName = 'Main film';
    project.designs ||= {};
    project.designAssets ||= {};
    if (!resume) fs.writeFileSync(projectFile, JSON.stringify(project, null, 2));
    // Standalone, reopenable projects for each output format.
    for (const [name, width, height] of [['Portrait',1080,1920], ['Square',1080,1080]]) {
      const folder = path.join(destination, name);
      fs.mkdirSync(folder, { recursive: true });
      const p = structuredClone(project);
      p.id = `website-${name.toLowerCase()}-2026-11`;
      p.name = `Into the Wild · ${name}`;
      p.width = width; p.height = height;
      for (const clip of Object.values(p.clips)) {
        if (clip.type === 'video') clip.props.scale = width === height ? 16 / 9 : (16 / 9) ** 2;
      }
      if (!resume) fs.writeFileSync(path.join(folder, `${name}.reccut`), JSON.stringify(p, null, 2));
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-website-refresh-'));
    console.log(`Capture workspace: ${temporary}`);
    const imports = name => JSON.stringify(path.join(root, name));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `
        import ${imports('src/renderer/app.jsx')};
        import * as store from ${imports('src/renderer/editor/store.js')};
        import * as commands from ${imports('src/renderer/editor/commands.js')};
        import * as playback from ${imports('src/renderer/editor/playback.js')};
        import * as exports from ${imports('src/renderer/export/state.js')};
        import * as registry from ${imports('src/renderer/registry.js')};
        import {toasts} from ${imports('src/renderer/ui.jsx')};
        import {frameExportSettings} from ${imports('src/shared/frameExport.js')};
        import * as designStore from ${imports('src/renderer/design/store.js')};
        import * as designModel from ${imports('src/shared/design.js')};
        window.photography = {store, commands, playback, exports, registry, toasts, frameExportSettings, designStore, designModel};
      `, resolveDir: root, sourcefile: 'website-photography.jsx', loader: 'jsx' },
      banner: { js: `localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,skimming:false,audioSkimming:false,reopenLast:false,viewerQuality:'quality'}));localStorage.setItem('editorSplit','0.57');localStorage.setItem('editorBrowserW','285');localStorage.setItem('editorInspectorW','320');` },
      outfile: path.join(temporary, 'capture.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
    });
    fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(temporary, 'audiofx-worklet.js'));
    fs.cpSync(path.join(root, 'build/emoji'), path.join(temporary, 'emoji'), { recursive: true });
    fs.writeFileSync(path.join(temporary, 'capture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css', 'capture.css').replace('app.js', 'capture.js'));
    fs.writeFileSync(path.join(destination, 'README.txt'), `Website demo projects, photographed with Reccut ${require('../package.json').version}.\nSource copied from ${source}. The source project is unchanged.\nInto the Wild contains its own media and cache. Portrait and Square reference that copy.\nScreenshots are generated from the current renderer, with real media and real export jobs.\n`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(electron, [__filename, temporary, projectFile, ...process.argv.filter(arg=>arg==='--looks-only')], { env, stdio: 'inherit', cwd: root });
    process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
    console.log(`Demo projects: ${destination}`);
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, session } = electron;
  const temporary = process.argv[2], projectFile = process.argv[3];
  app.setPath('appData', temporary);
  app.setPath('userData', path.join(temporary, 'profile'));
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const load = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return load.call(this, file === path.join(root, 'build/index.html') ? path.join(temporary, 'capture.html') : file, options);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeout = setTimeout(() => { console.error('Website photography timed out'); app.exit(1); }, 240000);
  let started = false;
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      const mediaDir = path.join(root, 'docs/media');
      const photo = async (name, rect, width = 2000) => {
        await js('photography.toasts.value=[];document.activeElement?.blur()');
        await wait(250);
        const capture = await win.webContents.capturePage(rect);
        const resized = capture.resize({ width });
        fs.writeFileSync(path.join(mediaDir, `${name}.jpg`), resized.toJPEG(92));
        console.log(`Captured ${name}: ${JSON.stringify(resized.getSize())}`);
      };
      const frame = async (name, time, project) => {
        const file = path.join(temporary, `${name}.jpg`);
        const id = await js(`(async()=>{const p=${project || 'photography.store.project.value'};return window.api.startExport({project:p,settings:{frame:photography.frameExportSettings(p,{time:${time},format:'jpeg',width:p.width,height:p.height}),output:${JSON.stringify(file)},sourceMedia:'original',quiet:true}})})()`);
        const jobs = require(path.join(root, 'src/main/jobs'));
        for (let i = 0; i < 600; i++) {
          const task = jobs.snapshot().find(task => task.id === id);
          if (task?.state === 'error') throw new Error(`${name}: ${task.error}`);
          if (task?.state === 'done') {
            const width=name.startsWith('look-')||name==='fmt-169'?1280:name==='fmt-916'?720:name==='fmt-11'?1080:1600;
            await require(path.join(root,'src/main/ffmpeg')).run(['-i',file,'-vf',`scale=${width}:-2`,'-frames:v','1','-q:v','3','-pix_fmt','yuvj420p','-update','1',path.join(mediaDir,`${name}.jpg`)]).promise;
            console.log(`Exported ${name}`); return;
          }
          await wait(100);
        }
        throw new Error(`Frame export timed out: ${name}`);
      };
      try {
        win.setContentSize(1500, 1000);
        for (let i = 0; i < 100 && !(await js('Boolean(window.photography)')); i++) await wait(100);
        await wait(3500);
        await js(`photography.store.openProjectFile(${JSON.stringify(projectFile)})`);
        if(!process.argv.includes('--looks-only')) {
        await js(`photography.store.room.value='edit';photography.store.selection.value=['shot-mountain-lake'];photography.commands.inspectorTab.value='video';photography.playback.seek(3)`);
        await wait(2000);
        await js('photography.commands.zoomFit()');
        await wait(500);
        await photo('overview');
        const timeline = await js(`(()=>{const r=document.querySelector('.timeline').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`);
        await photo('timeline', timeline);
        await js('photography.registry.paletteOpen.value=true'); await wait(250);
        await js(`(()=>{const e=document.querySelector('.palette input');if(!e)throw Error('Search field missing');e.value='color';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
        await wait(400);
        const search = await js(`(()=>{const e=document.querySelector('.command-palette,.palette,.console');if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.max(0,Math.round(r.x)-40),y:Math.max(0,Math.round(r.y)-40),width:Math.round(r.width)+80,height:Math.round(r.height)+80}})()`);
        await photo('quick-search', search || undefined, 1200);
        await js('photography.registry.paletteOpen.value=false');
        await frame('still-title', 3);
        await frame('still-lowerthird', 14.5);
        await frame('ba-before', 26);
        await frame('ba-after', 26, `(()=>{const p=structuredClone(photography.store.project.value);p.clips['shot-coastal-ridge'].props.film='technicolor';p.clips['shot-coastal-ridge'].props.filmMix=1;return p})()`);
        }
        for (const [name, shot, time, film] of [
          ['look-velvia50','falling-water',14,'velvia50'], ['look-vision500t','forest-light',8,'vision500t'],
          ['look-goldenhour','blossoms-and-bees',32,'goldenhour'], ['look-portra400','coastal-ridge',26,'portra400'],
          ['look-bleachbypass','river-gorge',39,'bleachbypass'], ['look-trix400','quiet-coast',21,'trix400'],
        ]) {
          const original=`(()=>{const p=structuredClone(photography.store.project.value);for(const c of Object.values(p.clips)){if(c.type==='title')c.enabled=false;delete c.props.film;c.props.filmMix=0;}return p})()`;
          await frame(`${name}-before`,time,original);
          await frame(name, time, `(()=>{const p=${original};const c=p.clips[${JSON.stringify('shot-')}+${JSON.stringify(shot)}];c.props.film=${JSON.stringify(film)};c.props.filmMix=1;return p})()`);
        }
        if(process.argv.includes('--looks-only')) { clearTimeout(timeout);app.exit(0);return; }
        await frame('fmt-169', 14, `(()=>{const p=structuredClone(photography.store.project.value);for(const c of Object.values(p.clips))if(c.type==='title')c.enabled=false;return p})()`);
        for (const [format, name] of [['Portrait','fmt-916'],['Square','fmt-11']]) {
          const file = path.join(path.dirname(path.dirname(projectFile)), format, `${format}.reccut`);
          await frame(name, 14, `await (async()=>{const p=await window.api.loadProject(${JSON.stringify(file)});for(const c of Object.values(p.clips))if(c.type==='title')c.enabled=false;return p})()`);
        }
        // A real layered thumbnail, saved alongside the film for future photography.
        const designFrame = path.join(path.dirname(projectFile),'Assets','Coastal ridge.jpg');
        fs.copyFileSync(path.join(mediaDir,'ba-before.jpg'),designFrame);
        await js(`(()=>{
          const q=photography,{newDesign,newLayer,solidFill}=q.designModel;
          const d=newDesign({name:'Into the Wild · Film cover',width:1280,height:720});
          d.id='website-film-cover';d.background=solidFill('#102a23');
          d.layers=[
            newLayer('image',{name:'Coastal ridge · video frame',asset:'website-cover-frame',x:0,y:0,w:1280,h:720,fit:'cover',locked:true}),
            newLayer('shape',{name:'Forest panel',shape:'rect',x:0,y:0,w:680,h:720,fill:solidFill('#102a23'),opacity:0.96,locked:true}),
            newLayer('text',{name:'Film label',text:'A MOMENT OUTSIDE',x:64,y:70,w:490,h:50,size:23,weight:600,tracking:4,align:'left',fill:solidFill('#c9d8aa')}),
            newLayer('text',{name:'Film title',text:'INTO\\nTHE WILD',x:58,y:202,w:590,h:255,size:114,weight:800,lineHeight:0.98,align:'left',fill:solidFill('#ffffff')}),
            newLayer('shape',{name:'Accent line',shape:'rect',x:64,y:520,w:96,h:5,fill:solidFill('#c9d8aa')}),
            newLayer('text',{name:'Film description',text:'Mountains, forests and the quiet coast.',x:64,y:558,w:510,h:70,size:29,weight:400,align:'left',fill:solidFill('#d8e1d4')}),
          ];
          q.store.commit(p=>{p.designAssets['website-cover-frame']={id:'website-cover-frame',name:'Coastal ridge',path:${JSON.stringify(designFrame)},width:1920,height:1080,origin:'frame'};p.designs[d.id]=d});
          q.designStore.openDesign(d.id);q.store.room.value='design';
        })()`);
        await wait(1500);
        for(let i=0;i<300 && await js("document.querySelector('.dz-room')?.innerText.includes('Analyzing frames')");i++) await wait(100);
        await photo('design');
        await js('photography.store.saveNow()');
        await js('photography.exports.prepareProjectExport()');
        await js(`photography.exports.addFiles(${JSON.stringify(['Forest light.mp4', 'Falling water.mp4'].map(name => path.join(path.dirname(projectFile), 'Media', name)))})`);
        const exportDirectory=path.join(path.dirname(projectFile),'Exports',`Website ${Date.now()}`);
        fs.mkdirSync(exportDirectory,{recursive:true});
        await js(`photography.exports.selectedId.value='project';photography.exports.setSettings({dir:${JSON.stringify(exportDirectory)}})`);
        await wait(1000);
        await js(`(()=>{const e=document.querySelector('.ex-transport input[type=range]');e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
        const jobs = require(path.join(root, 'src/main/jobs'));
        jobs.clearFinished();
        // Queue real output jobs rather than invented progress indicators.
        await js(`(async()=>{const e=photography.exports;for(const id of ['project',...e.files.value.map(f=>f.id)]){const p=e.sourceProject(id);await window.api.startExport({project:p,settings:{format:'mp4-h264',quality:'high',fps:p.fps,size:{preset:0,w:p.width,h:p.height},captions:'none',sourceMedia:'original',output:e.settings.value.dir+'/'+p.name+'.mp4'}})}})()`);
        for(let i=0;i<100&&!jobs.snapshot().some(t=>t.kind==='export'&&t.progress>0.03);i++) await wait(100);
        await photo('export-queue');
        await photo('exportroom');
        // Let the demo queue finish and keep the useful output in the demo folder.
        for(let i=0;i<1200 && jobs.snapshot().some(t=>t.kind==='export'&&['queued','running'].includes(t.state));i++) await wait(100);
        if(jobs.snapshot().some(t=>t.kind==='export'&&['queued','running'].includes(t.state))) throw new Error('Demo export queue did not finish');
        const failures=jobs.snapshot().filter(t=>t.state==='error');
        if(failures.length) throw new Error(JSON.stringify(failures));
        clearTimeout(timeout); app.exit(0);
      } catch (error) { console.error(error.stack); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require(path.join(root, 'src/main/input'));
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
  require(path.join(root, 'src/main/main'));
  ipcMain.removeHandler('permissions:request'); ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list'); ipcMain.handle('screens:list', () => []);
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false)));
}
