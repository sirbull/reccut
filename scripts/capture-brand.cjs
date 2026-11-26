// Photograph Brand for the handbook: the Brand tab in Edit with saved titles, lower thirds and effect
// presets, and Brand in Design with Brand Elements. Uses an isolated profile and no media files; the
// previews draw Reccut's own sample scene. All text is in English.
// Usage: node scripts/capture-brand.cjs [output-directory]
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = process.versions.electron ? require('electron') : require(path.join(root, 'node_modules/electron'));

if (!electron.app) {
  (async () => {
    const output = path.resolve(process.argv[2] || path.join(root, 'assets/help'));
    const files = [];
    for (const file of [path.join(root, 'build/audiofx-worklet.js')]) {
      if (!fs.existsSync(file)) throw new Error(`Missing capture input: ${file}. Run npm run build first.`);
    }
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-brand-handbook-'));
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
        import * as design from ${file('src/renderer/design/store.js')};
        import * as designBrand from ${file('src/renderer/design/brand.js')};
        import * as content from ${file('src/renderer/design/content.js')};
        import * as panels from ${file('src/renderer/design/panels.js')};
        import { toasts } from ${file('src/renderer/ui.jsx')};
        import { notice } from ${file('src/renderer/recorder/engine.js')};
        window.q = {notice, store, commands, playback, model, design, designBrand, content, panels, toasts};
      `, resolveDir: root, sourcefile: 'brand-photography.jsx', loader: 'jsx' },
      banner: { js: `
        localStorage.setItem('prefs',JSON.stringify({checkUpdates:false,reopenLast:false,aiModelsAsked:true,voicePackagesAsked:true,importCopy:false,skimming:false,audioSkimming:false,brandProfiles:[{id:'default',name:'Northwind Studio'},{id:'lakeside',name:'Lakeside Café'}],brandProfile:'default',designPanel:'brand'}));
        for(const [key,value] of Object.entries({editorBrowserW:470,editorInspectorW:340,editorSplit:0.72}))localStorage.setItem(key,String(value));
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
    const child = require('node:child_process').spawn(electron, [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), __filename, temporary], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain, session } = electron;
  const temporary = process.argv.at(-1);
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
  const timeout = setTimeout(() => { console.error('Brand photography timed out'); app.exit(1); }, 180000);
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
          const ready = true;
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
        win.setContentSize(1600, 1500);
        await wait(4000);
        await js(`(()=>{
          q.store.setProject(q.model.newProject('Northwind Studio'));
          q.store.needsProject.value=false;q.store.room.value='edit';
        })()`);
        await wait(1200);
        // Style titles and lower thirds the way a channel would, and save them to Brand.
        const save = async (setup, kind, name, groups) => js(`(()=>{
          ${setup}
          const target=q.store.selection.value[0];
          q.commands.saveToBrand(target,{kind:${JSON.stringify(kind)},name:${JSON.stringify(name)}${groups ? `,groups:${JSON.stringify(groups)}` : ''}});
          q.playback.seek(q.store.project.value.duration+1);
        })()`);
        const title = (template, props) => `q.commands.addTitle(${JSON.stringify(template)});const id=q.store.selection.value[0];q.store.commit(p=>Object.assign(p.clips[id].props,${JSON.stringify(props)}));`;
        await save(title('lower', { text: 'Maya Lindqvist', subtext: 'Host, Northwind Studio', accent: '#ff9f0a', font: 'rounded' }), 'title', 'Host');
        await save(title('callout', { text: 'Jonas Berg', subtext: 'Mountain guide', accent: '#64d2ff' }), 'title', 'Guest');
        await save(title('lower', { text: 'Northwind Studio', subtext: 'New episodes every Friday', accent: '#30d158' }), 'title', 'Channel Plug');
        await save(title('card', { text: 'Episode 12', subtext: 'The Road North', bgColor: '#0b1a33', font: 'serif' }), 'title', 'Episode Opener');
        await save(title('boxed', { text: 'Chapter 2', bgColor: '#ff9f0a', color: '#111114' }), 'title', 'Chapter Card');
        await save(title('end', { text: 'Thanks for watching', subtext: 'See you next Friday', bgColor: '#0b1a33' }), 'title', 'End Card');
        const look = props => `q.commands.addAdjustmentLayer();const id=q.store.selection.value[0];q.store.commit(p=>Object.assign(p.clips[id].props,${JSON.stringify(props)}));`;
        await save(look({ exposure: 0.04, contrast: 0.12, saturation: 0.15, temperature: 0.45 }), 'effects', 'Warm Grade', ['color']);
        await save(look({ exposure: -0.05, contrast: 0.2, saturation: -0.25, temperature: -0.35 }), 'effects', 'Cool Night', ['color']);
        await save(look({ fx: ['vignette'], vignette: 0.6, contrast: 0.08 }), 'effects', 'Soft Vignette', ['effects', 'color']);
        // The picture: one saved lower third on the timeline, selected.
        await js(`(()=>{q.store.setProject(q.model.newProject('Northwind Studio'));q.store.needsProject.value=false;q.store.room.value='edit';
          const host=q.commands.brandList().find(b=>b.name==='Host');q.commands.addBrandTitle(host.id,0);q.playback.seek(1.5);
          q.commands.browserTab.value='brand';})()`);
        await wait(1500);
        await photo('brand', '.browser, .viewer');

        // Design: a channel badge and a title saved as Brand Elements.
        await js(`(()=>{q.store.room.value='design';q.design.addDesign({name:'Episode 12 Thumbnail'});
          q.content.addTextPreset('title');q.content.addTextPreset('badge');})()`);
        await wait(800);
        await js(`(async()=>{
          const d=q.design.currentDesign.value;const [title,badge]=d.layers.slice(-2);
          q.design.changeDesign(x=>{const t=x.layers.find(l=>l.id===title.id);t.text='The Road North';const b=x.layers.find(l=>l.id===badge.id);b.text='NEW EPISODE';});
          q.design.selection.value=[badge.id];await q.designBrand.saveBrandLayers('New Episode Badge');
          q.design.selection.value=[title.id];await q.designBrand.saveBrandLayers('Episode Title');
          q.design.selection.value=[title.id,badge.id];await q.designBrand.saveBrandLayers('Thumbnail Kit');
          q.design.selection.value=[];q.panels.openDesignPanel('brand');
        })()`);
        await wait(1500);
        await photo('brand-design', '.dz-rail, .dz-library-panel, .dz-center');

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
