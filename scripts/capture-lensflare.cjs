// Photograph Lens Flare in Properties and Flare Studio for the handbook, using an isolated profile.
// Usage: node scripts/capture-lensflare.cjs [clip.mp4] [output-directory]
//        node scripts/capture-lensflare.cjs --website [clip.mp4]   (the Lens flares card on the website, to docs/media)
// Default clip: Mountain lake from the Help Demo project (open sky in the upper right).
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

// The blue flare on the website card. The card shows it on black, rendered by the export renderer;
// clicking the card shows the same flare in Flare Studio.
const WEBSITE_FLARE = {
  x: 0.68, y: 0.32, cx: 0.5, cy: 0.5, intensity: 1, scale: 1, spread: 1, opacity: 1, color: '#3a8bff', colorize: 0, blend: 'add',
  elements: [
    { asset: 'glow_blue', size: 1.1, intensity: 0.8 },
    { asset: 'halo_soft', size: 0.62, intensity: 0.25, tint: '#5a9bff', thickness: 0.3, softness: 0.35, chroma: 0.04 },
    { asset: 'glow_white', size: 0.3, intensity: 0.9 },
    { asset: 'diffraction_cool_12', size: 0.7, intensity: 0.4 },
    { asset: 'starburst_12_white', size: 0.85, intensity: 0.32, tint: '#a9c9ff', rotation: 7 },
    { asset: 'glint_blue_cross', size: 0.5, intensity: 0.8 },
    { asset: 'streak_anamorphic_blue', size: 3.4, intensity: 1 },
    { asset: 'streak_cyan_double', size: 2.4, intensity: 0.45 },
    { asset: 'lens_dirt_dust_bokeh', size: 1, intensity: 0.25 },
    { asset: 'iris_polygon', distance: 0.4, size: 0.06, intensity: 0.4, tint: '#7fd0ff', blades: 6 },
    { asset: 'iris_round', distance: 0.15, size: 0.035, intensity: 0.6, tint: '#9fd8ff' },
    { asset: 'iris_polygon', distance: -0.2, size: 0.15, intensity: 0.3, tint: '#2f7bff', blades: 6, chroma: 0.04 },
    { asset: 'ring_clean', distance: -0.4, size: 0.5, intensity: 0.35, tint: '#3fb6ff', thickness: 0.04, chroma: 0.03 },
    { asset: 'arc_blue_right', distance: -0.55, size: 0.9, intensity: 0.35 },
    { asset: 'iris_spectral', distance: -0.7, size: 0.2, intensity: 0.26, phase: 0.55, chroma: 0.05, spectrum: 0.6 },
    { asset: 'iris_round', distance: -0.95, size: 0.06, intensity: 0.45, tint: '#7a6bff' },
    { asset: 'iris_polygon', distance: -1.2, size: 0.3, intensity: 0.22, tint: '#2f6dff', blades: 7, edge: 2, chroma: 0.05 },
    { asset: 'iris_round', distance: -1.45, size: 0.1, intensity: 0.3, tint: '#45c8ff', softness: 0.5 },
    { asset: 'ring_spectral', distance: -1.7, size: 0.55, intensity: 0.22, thickness: 0.05, phase: 0.55, spectrum: 0.5 },
  ],
};

if (!electron.app) {
  (async () => {
    const args = process.argv.slice(2), website = args[0] === '--website';
    if (website) args.shift();
    const clip = path.resolve(args[0] || path.join(os.homedir(), 'Movies/Reccut/Help Demo - Into the Wild/Media/Mountain lake.mp4'));
    const output = path.resolve(website ? path.join(root, 'docs/media') : args[1] || path.join(root, 'assets/help'));
    for (const file of [clip, path.join(root, 'build/audiofx-worklet.js'), path.join(root, 'build/lensflare')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-lensflare-handbook-'));
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(temporary, 'inputs.json'), JSON.stringify({ clip, output, website }));
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
        import { FLARE_DEFAULTS, makeElement } from ${file('src/shared/lensFlare.js')};
        import { drawLensFlare, loadFlareSprites } from ${file('src/shared/lensFlareRender.js')};
        import { addMediaClip } from ${file('src/shared/ops.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        import { notice } from ${file('src/renderer/recorder/engine.js')};
        window.flarePhotography = {store, commands, playback, model, makeVideoEffect, flareStudio, addMediaClip, toasts, notice, FLARE_DEFAULTS, makeElement, drawLensFlare, loadFlareSprites};
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
  const { clip, output, website } = JSON.parse(fs.readFileSync(path.join(temporary, 'inputs.json'), 'utf8'));
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
      // The website pictures are taken at 2x, sharp on high-density screens.
      const zoom = website ? 2 : 1;
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
          const scale = size.width / (win.getContentSize()[0] / zoom);
          const x = Math.max(0, Math.round(rect.x * scale));
          const y = Math.max(0, Math.round(rect.y * scale));
          image = image.crop({ x, y, width: Math.min(size.width - x, Math.round(rect.width * scale)),
            height: Math.min(size.height - y, Math.round(rect.height * scale)) });
        }
        const resized = image.getSize().width > width ? image.resize({ width, quality: 'best' }) : image;
        fs.writeFileSync(path.join(output, name + '.jpg'), resized.toJPEG(90));
        console.log(`Captured ${name}: ${JSON.stringify(resized.getSize())}`);
      };
      // Change the flare on the clip, like the inspector does.
      const flare = values => js(`(()=>{const q=flarePhotography;q.store.commit(p=>Object.assign(p.clips[q.clipId].props.vfx[0].p,${JSON.stringify(values)}))})()`);
      const showProperties = () => js(`(()=>{const item=document.querySelector('.vfx-item[data-vfx="lensFlare"]');if(!item)throw Error('Lens Flare is missing in Properties');
        item.querySelector('details')?.setAttribute('open','');const body=item.closest('.insp-body');body.scrollTop+=item.getBoundingClientRect().top-body.getBoundingClientRect().top-8;})()`);
      try {
        win.setContentSize((website ? 1400 : 1800) * zoom, (website ? 1000 : 1300) * zoom);
        win.webContents.setZoomFactor(zoom);
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
        if (website) {
          await js(`(()=>{const q=flarePhotography,spec=${JSON.stringify(WEBSITE_FLARE)};
            q.store.commit(p=>{const fx=p.clips[q.clipId].props.vfx[0];fx.p={...structuredClone(q.FLARE_DEFAULTS),...spec,preset:'',
              elements:spec.elements.map(e=>({...q.makeElement(e.asset),distance:1,...e}))};});})()`);
          // The card: the flare alone on black, from the same renderer as the export.
          const card = await js(`(async()=>{const q=flarePhotography;await q.loadFlareSprites(q.store.project.value);
            const w=1600,h=900,img=document.createElement('canvas'),out=document.createElement('canvas');img.width=out.width=w;img.height=out.height=h;
            img.getContext('2d').fillRect(0,0,w,h);q.drawLensFlare(out.getContext('2d'),img,w,h,q.store.project.value.clips[q.clipId].props.vfx[0].p);
            return out.toDataURL('image/jpeg',0.9)})()`);
          fs.writeFileSync(path.join(output, 'feature-lens-flare.jpg'), Buffer.from(card.split(',')[1], 'base64'));
          console.log('Rendered feature-lens-flare: 1600x900');
          // The same flare in Flare Studio, on black, with the spectral ghost selected.
          await js('flarePhotography.flareStudio.value={clipId:flarePhotography.clipId,effectId:flarePhotography.store.project.value.clips[flarePhotography.clipId].props.vfx[0].id}');
          await wait(1500);
          await js(`(()=>{[...document.querySelectorAll('.flare-studio .seg-btn, .flare-studio button')].find(b=>b.textContent.trim()==='Black').click();
            [...document.querySelectorAll('.fs-row')].find(r=>/Iris ghost spectral/.test(r.textContent)).click()})()`);
          await wait(800);
          await photo('feature-lens-flare-studio', '.flare-studio', 2400);
          clearTimeout(timeout);
          app.exit(0);
          return;
        }
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
