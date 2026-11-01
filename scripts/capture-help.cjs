// Photograph the real application using the user's nature-footage demo project.
const electron = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-nature-help-'));
    try {
      const { prepareHelpDemo } = await import('./help-demo.mjs');
      const result = await prepareHelpDemo({ ...(process.argv[2] ? { source: path.resolve(process.argv[2]) } : {}), ...(process.argv[3] ? { destination: path.resolve(process.argv[3]) } : {}) });
      await require('esbuild').build({ entryPoints: [path.join(root, 'scripts/help-photography.jsx')], outfile: path.join(dir, 'capture.js'), bundle: true, format: 'iife', platform: 'browser', target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' } });
      fs.copyFileSync(path.join(root, 'build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
      fs.writeFileSync(path.join(dir, 'capture.html'), fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8').replace('app.css','capture.css').replace('app.js','capture.js'));
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const child = require('child_process').spawn(electron, [__filename, dir, result.projectFile], { env, stdio: 'inherit' });
      process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code) => resolve(code ?? 1)); });
    } catch (error) { console.error(error); process.exitCode = 1; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
} else {
  const { app, BrowserWindow, ipcMain, session } = electron;
  const dir = process.argv[2], projectFile = process.argv[3];
  // Never read the user's application profile, API keys or recent projects.
  app.setPath('appData', dir); app.setPath('userData', path.join(dir, 'profile'));
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const originalLoad = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function(file, options) {
    return originalLoad.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'capture.html') : file, options);
  };
  let capturing = false;
  const timeout = setTimeout(() => { console.error('Nature screenshot capture timed out'); app.exit(1); }, 150000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('did-finish-load', async () => {
      if (capturing || !win.webContents.getURL().endsWith('/capture.html')) return;
      capturing = true;
      win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('Capture renderer:', event.message); });
      const js = (code) => win.webContents.executeJavaScript(code);
      const captured = [];
      try {
        win.setContentSize(1440, 960);
        await js(`helpPhotography.init(${JSON.stringify(projectFile)})`);
        const photo = async (name, selector) => {
          await js('helpPhotography.cleanFocus(); helpPhotography.ready()');
          const rect = selector ? await js(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw new Error('Missing screenshot subject: '+${JSON.stringify(selector)});const r=el.getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`) : undefined;
          const output = path.join(root, 'assets/help', `${name}.jpg`);
          fs.writeFileSync(output, (await win.webContents.capturePage(rect)).toJPEG(91));
          fs.copyFileSync(output, path.join(root, 'build/help', `${name}.jpg`));
          captured.push(`${name}.jpg`); console.log(`Captured ${name}`);
        };
        await photo('overview');
        await photo('timeline', '.timeline');
        await photo('toolbar', '.tl-toolbar');
        await photo('viewer', '.viewer');
        for (const [variant, name, crop] of [
          ['browser','browser','.editor-top'], ['video','video','.editor-top'], ['info','info','.editor-top'],
          ['color','color','.editor-top'], ['speed','speed','.editor-top'], ['audio','audio','.editor-top'],
          ['titles','titles','.editor-top'], ['lowerthird','lowerthird-full',null], ['lowerthird','lowerthird','.editor-top'],
          ['colors','clip-colors','.timeline'], ['palette','palette',null], ['quickexport','quickexport',null],
          ['exportroom','exportroom',null], ['settings','settings',null], ['settings','prefs',null], ['keyboard','keyboard',null],
          ['newproject','newproject',null], ['import','import',null], ['layers','layers',null],
          ['offline','offline',null], ['record','record',null], ['ai-setup','ai-setup',null],
          ['ai-settings','ai-settings',null], ['plugins','plugins',null], ['ai-chat','ai-chat',null],
        ]) { await js(`helpPhotography.shot(${JSON.stringify(variant)})`); await photo(name, crop); }
        await js('helpPhotography.shot("busy")'); await photo('clip-busy', '.timeline');
        await js('helpPhotography.stabilizationReady()'); await photo('stabilize', '.editor-top');
        await js('helpPhotography.reset();helpPhotography.openHelp()');
        for (let i=0;i<50;i++) {
          const help = BrowserWindow.getAllWindows().find((w) => w !== win && w.webContents.getURL().endsWith('/help.html'));
          if (help && !help.webContents.isLoading()) {
            await help.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,500))');
            await help.webContents.executeJavaScript('document.activeElement?.blur();');
            fs.writeFileSync(path.join(root, 'assets/help/handbook.jpg'), (await help.webContents.capturePage()).toJPEG(91));
            captured.push('handbook.jpg'); break;
          }
          await new Promise((resolve) => setTimeout(resolve,100));
        }
        fs.writeFileSync(path.join(root,'docs/help-screenshots.json'), JSON.stringify({ project:'Into the Wild', source:'Downloads/Nature-video', generator:'npm run help:screenshots', images:captured }, null, 2)+'\n');
        console.log(`Saved ${captured.length} screenshots. Demo project: ${projectFile}`);
        clearTimeout(timeout); app.exit(0);
      } catch (error) { console.error(error.stack); clearTimeout(timeout); app.exit(1); }
    });
  });
  const { InputTracker } = require('../src/main/input.js');
  InputTracker.prototype.start = () => false;
  InputTracker.prototype.startPolling = () => {};
  require('../src/main/main.js');
  // No camera/microphone/screen access is needed for documentation photography.
  ipcMain.removeHandler('permissions:request'); ipcMain.handle('permissions:request', () => ({}));
  ipcMain.removeHandler('screens:list'); ipcMain.handle('screens:list', () => []);
  // The import dialog must show only the dedicated demo, never Finder favourites or other files.
  const demoRoot = path.dirname(projectFile), demoMedia = path.join(demoRoot, 'Media');
  const media = require('../src/main/media.js');
  const withinDemo = (file) => { if (typeof file !== 'string') return false; const relative = path.relative(demoRoot, path.resolve(file)); return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
  ipcMain.removeHandler('browse:places');
  ipcMain.handle('browse:places', () => ({ places: [{ label: 'Nature footage', path: demoMedia }, { label: 'Title artwork', path: path.join(demoRoot, 'Assets') }], volumes: [], home: demoRoot, start: demoMedia }));
  ipcMain.removeHandler('browse:dir');
  ipcMain.handle('browse:dir', (_event, folder) => media.browseDir(withinDemo(folder) ? folder : demoMedia));
  ipcMain.removeHandler('browse:thumb');
  ipcMain.handle('browse:thumb', (_event, file) => withinDemo(file) ? media.browseThumb(file) : null);
  app.whenReady().then(() => session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false)));
}
