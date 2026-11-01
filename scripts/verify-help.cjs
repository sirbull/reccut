// Runs Help in actual Electron windows with an isolated profile; never opens a real project.
const electron = require('electron');
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-help-'));
    try {
      await require('esbuild').build({ entryPoints: [path.join(root, 'test/help.browser.jsx')], outfile: path.join(dir, 'fixture.js'), bundle: true, format: 'iife', globalName: 'helpTest', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact' });
      for (const f of ['help.html', 'help.js', 'handbook.css', 'app.css', 'audiofx-worklet.js']) fs.copyFileSync(path.join(root, 'build', f), path.join(dir, f));
      fs.cpSync(path.join(root, 'assets/help'), path.join(dir, 'help'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('testBridge',{openHelp:(p)=>ipcRenderer.invoke('help:open',p),updateHelp:(c)=>ipcRenderer.invoke('help:update',c),onHelpCommand:(cb)=>{const fn=(_e,id)=>cb(id);ipcRenderer.on('help:command',fn);return()=>ipcRenderer.removeListener('help:command',fn)}});`);
      fs.writeFileSync(path.join(dir, 'mock.js'), `window.demoConfigured=true;window.receivedCommands=[];window.api=new Proxy({platform:'darwin',...window.testBridge,onHelpCommand:(cb)=>window.testBridge.onHelpCommand((id)=>{window.receivedCommands.push(id);cb(id)}),listTasks:async()=>[],saveProject:async()=>'/fictional/Practice.reccut',pluginsList:async()=>[{id:'demo-sharpen',name:'Example Sharpen',description:'An example local sharpening processor.',version:1,kind:'ffmpeg',params:[{id:'strength',label:'Strength',type:'number',min:0,max:2,default:0.5}]}],aiConfig:async()=>({provider:'compatible',endpoint:'https://api.openai.com/v1',model:window.demoConfigured?'example-tool-capable-model':'',hasKey:window.demoConfigured,encryptedStorage:true,vision:true}),aiModels:async()=>['example-tool-capable-model'],genConfig:async()=>({configured:false,models:[]})},{get:(o,k)=>o[k]||(String(k).startsWith('on')?()=>()=>{}:async()=>null)});`);
      fs.writeFileSync(path.join(dir, 'fixture.html'), `<!doctype html><html lang="en"><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="mock.js"></script><script src="fixture.js"></script></body></html>`);
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      const result = require('child_process').spawnSync(electron, [__filename, dir, ...process.argv.slice(2)], { env, stdio: 'inherit', timeout: 90000 });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    } catch (e) { console.error(e); process.exitCode = 1; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  })();
} else {
  const { app, BrowserWindow, ipcMain } = electron;
  const dir = process.argv[2], capture = process.argv.includes('--screenshots');
  app.setPath('userData', path.join(dir, 'profile'));
  app.on('window-all-closed', () => {});
  const timeout = setTimeout(() => { console.error('Help verification timed out'); app.exit(1); }, 70000);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise((resolve) => setTimeout(resolve, 150));
  app.whenReady().then(async () => {
    let host;
    const errors = [];
    try {
      host = new BrowserWindow({ width: 1100, height: 900, show: false, webPreferences: { preload: path.join(dir, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
      const help = require('../src/main/help').createHelpWindow({ BrowserWindow, ipcMain, getMainWindow: () => host, buildDir: dir });
      host.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
      await host.loadFile(path.join(dir, 'fixture.html'));
      const js = (source) => host.webContents.executeJavaScript(source);
      console.log('References:', await js('helpTest.verifyReferences()'));
      await js('helpTest.openManual({article:"ai-setup"})'); await tick();
      const manual = BrowserWindow.getAllWindows().find((w) => w !== host);
      manual.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push(e.message); });
      const hj = (source) => manual.webContents.executeJavaScript(source);
      assert(await hj('document.querySelector("h1").textContent === "Set Up a Cloud AI Agent"'), 'initial deep link should open');
      assert(await hj('typeof window.api === "undefined" && typeof window.handbook.runCommand === "function"'), 'Help must expose only its restricted bridge');
      await js('helpTest.openManual({article:"ai-local"})'); await tick();
      assert(BrowserWindow.getAllWindows().length === 2, 'reopening must reuse one Help window');
      assert(await hj('document.querySelector("h1").textContent === "Use a Local AI Model"'), 'reused Help window must navigate');
      await hj(`document.querySelector('input[aria-label="Search the handbook"]').value='connection refused';document.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}))`); await tick();
      assert(await hj('document.querySelector(".help-results").textContent.includes("Troubleshoot the AI Connection")'), 'full-text search should find error messages');
      await hj(`Array.from(document.querySelectorAll('.help-hit')).find(b=>b.textContent.includes('Troubleshoot the AI Connection')).click()`); await tick();
      assert(await hj('document.querySelectorAll("article mark").length > 0'), 'opening a search hit should highlight matching article text');
      await hj(`document.querySelector('[aria-label="Back"]').click()`); await tick();
      assert(await hj('document.querySelector("input").value === "connection refused"'), 'Back should restore search');
      await hj(`document.querySelector('[aria-label="Forward"]').click()`); await tick();
      assert(await hj('document.querySelector("h1").textContent === "Troubleshoot the AI Connection"'), 'Forward should restore article');
      await js('helpTest.customize()'); await tick();
      await js('helpTest.openManual({article:"shortcuts"})'); await tick();
      assert(await hj(`Array.from(document.querySelectorAll('.handbook-command')).find(e=>e.textContent.includes('Blade Tool')).textContent.includes('⇧B')`), 'custom shortcuts should be live');
      await js('helpTest.openManual({article:"tools"})'); await tick();
      await hj(`Array.from(document.querySelectorAll('.help-cmd')).find(b=>b.textContent.includes('Blade Tool')).click()`); await tick();
      assert(await js('window.receivedCommands.includes("tool:blade")'), 'explicit command should reach the main app');
      assert(!manual.isDestroyed(), 'running a command should keep the manual open');
      await js('helpTest.openManual({article:"welcome"})'); await tick();
      await hj(`Array.from(document.querySelectorAll('.help-run')).find(b=>b.textContent.includes('Show all shortcuts')).click()`); await tick();
      assert(await js('window.receivedCommands.includes("shortcuts")'), 'inline action buttons should preserve their own command IDs');
      await hj(`document.querySelector('.handbook-image').click()`); await tick();
      assert(await hj('document.querySelector("dialog").open'), 'images should enlarge in a modal dialog');
      await hj(`document.querySelector('[aria-label="Close enlarged image"]').click()`); await tick();
      manual.setSize(720, 600); await tick();
      assert(await hj('document.documentElement.scrollWidth <= innerWidth'), 'minimum width should not overflow');
      manual.setSize(1160, 850);
      // Validate every bundled image in Chromium, including images not currently visible.
      const assets = fs.readdirSync(path.join(dir, 'help'));
      assert(await hj(`Promise.all(${JSON.stringify(assets)}.map(file=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(true);im.onerror=()=>resolve(false);im.src='help/'+file}))).then(r=>r.every(Boolean))`), 'all handbook images should load');
      if (capture) {
        fs.mkdirSync(path.join(root, 'assets/help'), { recursive: true });
        for (const [name, source] of [['ai-settings', 'helpTest.settings()'], ['plugins', 'helpTest.settings("plugins")'], ['ai-setup', 'helpTest.chat(true)'], ['ai-chat', 'helpTest.chat(false)']]) {
          await js(source); await tick();
          fs.writeFileSync(path.join(root, `assets/help/${name}.jpg`), (await host.webContents.capturePage()).toJPEG(88));
        }
        await js('helpTest.openManual({article:"welcome"})'); await tick();
        fs.writeFileSync(path.join(root, 'assets/help/handbook.jpg'), (await manual.webContents.capturePage()).toJPEG(88));
      }
      assert(!errors.length, `renderer errors: ${errors.join('\n')}`);
      help.destroy();
      await js('helpTest.openManual({article:"export-settings"})'); await tick();
      assert(BrowserWindow.getAllWindows().length === 2, 'Help should reopen after closing');
      help.destroy(); host.destroy();
      console.log('Help window, navigation, search, images, command handoff and shortcut checks passed.');
      clearTimeout(timeout); app.exit(0);
    } catch (e) { console.error(e.stack); clearTimeout(timeout); app.exit(1); }
  });
}
