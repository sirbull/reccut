// Real app UI, synthetic hardware only. No model files or downloads are needed.
// Run after npm run build: node scripts/test-model-recommendations.cjs weak|balanced|powerful
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const electron = require('electron');
const scenarios = { weak: { ramGB: 4, cpuThreads: 2, id: 'whisper-tiny', name: 'Whisper Tiny' }, balanced: { ramGB: 12, cpuThreads: 12, id: 'whisper-base', name: 'Whisper Base' }, powerful: { ramGB: 32, cpuThreads: 16, id: 'whisper-medium', name: 'Whisper Medium' } };
const scenario = scenarios[process.argv.at(-1)] || scenarios.balanced;
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename, process.argv[2] || 'balanced'], { env, stdio: 'inherit', cwd: path.resolve(__dirname, '..'), windowsHide: true });
  child.on('error', e => { console.error(e); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, desktopCapturer, ipcMain, BrowserWindow } = electron;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-model-advice-ui-'));
  fs.mkdirSync(path.join(profile, 'videos'));
  app.setPath('appData', profile); app.setPath('userData', path.join(profile, 'profile')); app.setPath('videos', path.join(profile, 'videos'));
  desktopCapturer.getSources = async () => [];
  const mod = require('../src/main/subtitleModels'), Original = mod.SubtitleModelManager;
  mod.SubtitleModelManager = class extends Original {
    constructor(options) { super({ ...options, ram: scenario.ramGB * 1024 ** 3, cpuThreads: scenario.cpuThreads }); }
  };
  const installs = [];
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => handle(channel, (...args) => {
    if (/download|install/i.test(channel)) { installs.push(channel); throw Error(`Unexpected model download: ${channel}`); }
    return handler(...args);
  });
  let started = false;
  const timeout = setTimeout(() => { console.error('Model UI test timed out:', profile); app.exit(1); }, 90000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, cb) => cb(false));
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/build/index.html')) return;
      started = true;
      win.show(); win.focus();
      const js = code => win.webContents.executeJavaScript(`{${code}}`);
      const wait = async (code, target = win) => { for (let i = 0; i < 400; i++) { if (await target.webContents.executeJavaScript(`{${code}}`)) return; await new Promise(r => setTimeout(r, 50)); } throw Error(`Missing UI: ${code}`); };
      const click = text => js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
      try {
        await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Create Project'&&!b.disabled)`);
        await click('Create Project');
        await wait(`!!document.querySelector('[aria-label="AI Models (Optional)"]')`);
        await wait(`document.querySelectorAll('.ai-models .setup-badge').length===2`);
        const captions = `[...document.querySelectorAll('.ai-models-group')].find(s=>s.querySelector('header b')?.textContent==='Captions and transcripts')`;
        assert.equal(await js(`${captions}.querySelector('.setup-badge').closest('li').querySelector('input').getAttribute('aria-label')`), `Download ${scenario.name}`);
        assert.equal(await js(`${captions}.querySelector('input:checked').getAttribute('aria-label')`), `Download ${scenario.name}`);
        await js(`${captions}.querySelector('input:checked').click()`);
        await new Promise(r => setTimeout(r, 100));
        assert.equal(await js(`${captions}.querySelectorAll('input:checked').length`), 0, 'manual deselection must stay cleared');
        const state = await js('window.api.subtitleModels()');
        assert.equal(state.recommendation.id, scenario.id);
        assert.equal(state.active, null);
        await new Promise(r => setTimeout(r, 250));
        fs.writeFileSync(path.join(profile, 'models.png'), (await win.webContents.capturePage()).toPNG());
        await click('Set Up AI Agent');
        await wait(`!document.querySelector('[aria-label="AI Models (Optional)"]')`);
        await wait(`[...document.querySelectorAll('h3')].some(h=>h.textContent==='Set up the AI Agent')`);
        assert.deepEqual(installs, [], 'AI Agent setup must not download preselected models');
        await click('Close');
        // Exercise the registered command through the same menu IPC as the app.
        win.show(); win.focus();
        await js(`document.activeElement?.blur()`);
        win.webContents.send('menu', 'ai:models');
        await wait(`!!document.querySelector('[aria-label="AI Models"]')`);
        await wait(`document.querySelectorAll('.ai-models .setup-badge').length===2`);
        await click('Choose packages…');
        await wait(`!!document.querySelector('[aria-label="Voice Packages"]')`);
        await wait(`document.querySelectorAll('.voice-package .setup-badge').length>0`);
        assert.equal(await js(`[...document.querySelectorAll('.voice-package')].some(r=>r.querySelector('b')?.textContent.includes('VoxCPM2')&&r.querySelector('.setup-badge'))`), false, 'Windows must not recommend the unsupported VoxCPM2 engine');
        assert.deepEqual(installs, []);
        await new Promise(r => setTimeout(r, 250));
        fs.writeFileSync(path.join(profile, 'voices.png'), (await win.webContents.capturePage()).toPNG());
        await click('Done');
        await js(`window.api.openHelp({commands:[],request:{article:'ai-models'}})`);
        const help = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/build/help.html'));
        await wait(`document.body.innerText.includes('Local AI Models and Recommendations')&&document.body.innerText.includes('single-threaded CPU inference')`, help);
        const site = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await site.loadFile(path.resolve(__dirname, '../docs/docs/index.html'), { hash: 'ai-models' });
        await wait(`document.body.innerText.includes('Local AI Models and Recommendations')&&document.body.innerText.includes('Your choices stay yours')`, site);
        console.log(`PASS: ${scenario.ramGB} GB / ${scenario.cpuThreads} CPUs → ${scenario.name}; badges, first-run suggestion, manual deselection, menu command and voice recommendations; no downloads. Screenshot: ${profile}`);
        clearTimeout(timeout); app.exit(0);
      } catch (error) {
        console.error(error); console.error('Profile:', profile);
        fs.writeFileSync(path.join(profile, 'failure.png'), (await win.webContents.capturePage()).toPNG());
        clearTimeout(timeout); app.exit(1);
      }
    });
  });
  require('../src/main/main');
}
