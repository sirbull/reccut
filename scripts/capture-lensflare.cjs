// Photograph Lens Flare in Properties and Flare Studio for the handbook, using an isolated profile.
// Usage: node scripts/capture-lensflare.cjs [clip.mp4] [output-directory]
// Default clip: Mountain lake from the Help Demo project (open sky in the upper right).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const clip = path.resolve(process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Help Demo - Into the Wild/Media/Mountain lake.mp4'));
    const output = path.resolve(process.argv[3] || path.join(root, 'assets/help'));
    for (const file of [clip, path.join(root, 'build/audiofx-worklet.js'), path.join(root, 'build/lensflare')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-lensflare-handbook-'));
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(temporary, 'inputs.json'), JSON.stringify({ clip, output }));
    const file = name => JSON.stringify(path.join(root, name));
    await require(path.join(root, 'node_modules/esbuild')).build({
      stdin: { contents: `
        import ${file('src/renderer/app.jsx')};
        import * as store from ${file('src/renderer/editor/store.js')};
        import * as commands from ${file('src/renderer/editor/commands.js')};
        import * as playback from ${file('src/renderer/editor/playback.js')};
        import * as model from ${file('src/shared/model.js')};
        import { makeVideoEffect } from ${file('src/shared/videoEffects.js')};
        import { flareStudio } from ${file('src/renderer/editor/LensFlareControls.jsx')};
        import { addMediaClip } from ${file('src/shared/ops.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        import { notice } from ${file('src/renderer/recorder/engine.js')};
        window.flarePhotography = {store, commands, playback, model, makeVideoEffect, flareStudio, addMediaClip, toasts, notice};
      `, resolveDir: root, sourcefile: 'lensflare-photography.jsx', loader: 'jsx' },
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
    // Flare textures and thumbnails load relative to the page.
    fs.cpSync(path.join(root, 'build/lensflare'), path.join(temporary, 'lensflare'), { recursive: true });
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
  const { clip, output } = JSON.parse(fs.readFileSync(path.join(temporary, 'inputs.json'), 'utf8'));
  app.setPath('appData', temporary);
  app.setPath('userData', path.join(temporary, 'profile'));
  BrowserWindow.prototype.show = function() {};
  BrowserWindow.prototype.maximize = function() {};
  const load = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return load.call(this, file === path.join(root, 'build/index.html') ? path.join(temporary, 'capture.html') : file, options);
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeout = setTimeout(() => { console.error('Lens flare photography timed out'); app.exit(1); }, 180000);
  let started = false;
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/capture.html')) return;
      started = true;
      win.webContents.setAudioMuted(true);
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      const js = code => win.webContents.executeJavaScript(code);
      const photo = async (name, selector, width = 1800) => {
        await js('flarePhotography.toasts.value=[];flarePhotography.notice.value=null;document.activeElement?.blur()');
        for (let i = 0; i < 100; i++) {
          if (await js('Boolean(flarePhotography.playback.snapshot({fresh:true}))')) break;
          if (i === 99) throw new Error(`Video frame was not ready for ${name}`);
          await wait(100);
        }
        // Flare textures and the Flare Studio clip frame load asynchronously.
        await wait(900);
        win.webContents.invalidate();
        await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await wait(200);
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
        const resized = image.resize({ width: Math.min(image.getSize().width, width) });
        fs.writeFileSync(path.join(output, name + '.jpg'), resized.toJPEG(90));
        console.log(`Captured ${name}: ${JSON.stringify(resized.getSize())}`);
      };
      // Change the flare on the clip, like the inspector does.
      const flare = values => js(`(()=>{const q=flarePhotography;q.store.commit(p=>Object.assign(p.clips[q.clipId].props.vfx[0].p,${JSON.stringify(values)}))})()`);
      const showProperties = () => js(`(()=>{const item=document.querySelector('.vfx-item[data-vfx="lensFlare"]');if(!item)throw Error('Lens Flare is missing in Properties');
        item.querySelector('details')?.setAttribute('open','');const body=item.closest('.insp-body');body.scrollTop+=item.getBoundingClientRect().top-body.getBoundingClientRect().top-8;})()`);
      try {
        win.setContentSize(1800, 1300);
        await wait(4000);
        await js(`(async()=>{
          const q=flarePhotography;
          q.store.setProject(q.model.newProject('Lens flare guide'));
          q.store.needsProject.value=false;q.store.room.value='edit';
          const media=await q.store.importPaths(${JSON.stringify([clip])},null,{copy:false,optimize:false});
          if(media.length!==1)throw Error('The demo clip could not be imported');
          q.store.commit(p=>q.addMediaClip(p,p.media[media[0].id],'append',0,0));
          q.clipId=Object.keys(q.store.project.value.clips)[0];
          q.store.commit(p=>{const fx=q.makeVideoEffect('lensFlare');Object.assign(fx.p,{x:0.78,y:0.16});p.clips[q.clipId].props.vfx=[fx];});
          q.store.selection.value=[q.clipId];
          q.commands.inspectorTab.value='effects';
          q.commands.zoomFit();q.playback.seek(2);
        })()`);
        const jobs = require(path.join(root, 'src/main/jobs'));
        for (let i = 0; i < 300 && jobs.snapshot().some(task => task.state === 'running' || task.state === 'queued'); i++) await wait(100);
        await wait(1500);
        await showProperties();
        assert.ok(await js('Boolean(document.querySelector(".flare-sun"))'), 'Viewer handles are missing');
        await photo('lensflare-editor');
        await photo('lensflare-properties', '.vfx-item[data-vfx="lensFlare"]', 700);
        await photo('lensflare-viewer', '.viewer-box', 1200);

        // Flare color recolors the whole flare.
        await flare({ color: '#3a8bff', colorize: 1 });
        await photo('lensflare-color', '.viewer-box', 1200);
        await flare({ color: '#ff9a3c', colorize: 0 });

        await js('flarePhotography.flareStudio.value={clipId:flarePhotography.clipId,effectId:flarePhotography.store.project.value.clips[flarePhotography.clipId].props.vfx[0].id}');
        await wait(1500);
        assert.ok(await js('Boolean(document.querySelector(".flare-studio .fs-row"))'), 'Flare Studio did not open');
        await photo('lensflare-studio', '.flare-studio');
        await photo('lensflare-studio-presets', '.fs-presets', 1400);
        await photo('lensflare-studio-lower', '.fs-lower', 1400);
        // Select the procedural iris ghost, show its settings, then solo it.
        await js(`(()=>{const rows=[...document.querySelectorAll('.fs-row')];const row=rows.find(r=>/Iris ghost/i.test(r.textContent))||rows[1];row.click()})()`);
        await wait(300);
        await photo('lensflare-studio-inspector', '.fs-inspector', 700);
        await js(`document.querySelector('.fs-row.sel button[title^="Solo"]').click()`);
        await photo('lensflare-studio-solo', '.fs-stage', 1400);
        clearTimeout(timeout);
        app.exit(0);
      } catch (error) { console.error(error?.stack || error); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require(path.join(root, 'src/main/input'));
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
  // Offscreen rendering keeps frames flowing without showing a window, as in capture-multicam.cjs.
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
