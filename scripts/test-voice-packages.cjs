// Real Electron UI test in a disposable profile. Download IPC uses tiny fixture
// jobs; no model or engine is downloaded and no user project is opened.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename], { env, stdio: 'inherit', cwd: root });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, ipcMain } = electron;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-voice-packages-ui-'));
  fs.mkdirSync(path.join(profile, 'videos'));
  app.setPath('appData', profile); app.setPath('userData', path.join(profile, 'profile')); app.setPath('videos', path.join(profile, 'videos'));
  const catalog = require('../src/main/ttsCatalog.json');
  const state = { installed: false, addon: false, sizeBytes: 116e6, piper: {}, voxcpm: { supported: true, installed: false, engine: false, sizeBytes: 3552406272, languages: {} } };
  const installs = [], pending = new Map();
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => {
    if (channel === 'tts:status') handler = () => structuredClone(state);
    if (['tts:install', 'tts:piperInstall', 'tts:voxcpmInstall'].includes(channel)) handler = async (_event, id) => {
      const key = channel === 'tts:install' ? 'kokoro' : channel === 'tts:piperInstall' ? `piper:${id}` : `voxcpm:${id || 'model'}`;
      installs.push(key);
      const task = require('../src/main/jobs').add({ kind: 'download', title: `Test download ${key}`, queue: 'voiceDownloads', packageKey: key, run: (ctx) => new Promise((resolve, reject) => {
        ctx.progress(0.25, 'Fixture download');
        ctx.setCancel(() => { pending.delete(key); reject(new Error('Canceled')); });
        pending.set(key, () => {
          if (key === 'kokoro') state.installed = true;
          if (key.startsWith('piper:')) state.piper[id] = { installed: true };
          state.addon = true; resolve();
        });
      }) });
      await task.done;
      return structuredClone(state);
    };
    return originalHandle(channel, handler);
  };
  let started = false;
  const timeout = setTimeout(() => { console.error('Voice package UI test timed out'); app.exit(1); }, 60000);
  app.on('browser-window-created', (_event, win) => {
    win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('Renderer:', event.message); });
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/build/index.html')) return;
      started = true;
      const js = (code) => win.webContents.executeJavaScript(`{${code}}`).catch((error) => { throw new Error(`${code}: ${error.message}`); });
      const wait = async (code) => {
        for (let i = 0; i < 150; i++) { if (await js(code)) return; await new Promise((r) => setTimeout(r, 50)); }
        throw new Error(`UI condition not reached: ${code}`);
      };
      const click = (text) => js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
      try {
        await wait(`!!document.querySelector('[aria-label="Welcome to Reccut"]')`);
        await js(`localStorage.setItem('prefs', JSON.stringify({aiModelsAsked:true})); navigator.mediaDevices.getUserMedia=async()=>{throw new Error('No microphone in UI test')};void 0`);
        await click('Create Project');
        console.log('Created isolated test project');
        // The current renderer loaded before prefs were changed, so dismiss the
        // app-wide first-run chooser if it appears after project creation.
        await wait(`!document.querySelector('[aria-label="Welcome to Reccut"]')`);
        await new Promise((r) => setTimeout(r, 400));
        await click('Not Now');
        await js(`document.querySelector('button[title^="Edit ("]').click()`);
        await wait(`!!document.querySelector('.vo-open-btn')`);
        await js(`document.querySelector('.vo-open-btn').click()`);
        await wait(`!!document.querySelector('[aria-label="Voice Packages"]')`);
        await wait(`(()=>{const r=document.querySelector('.voice-packages-dialog').getBoundingClientRect();return !!document.elementFromPoint(r.x+r.width/2,r.y+40)?.closest('.voice-packages-dialog')})()`);
        await new Promise((r)=>setTimeout(r,200));
        assert.equal(installs.length, 0, 'opening and suggesting packages must not download');
        assert.equal((await js('window.api.voicePackagesStatus()')).voicePackagesAsked, true);
        assert.ok(await js(`document.querySelectorAll('.voice-package input:checked').length > 0`));
        assert.ok(await js(`Array.from(document.querySelectorAll('.voice-package')).every(r=>r.textContent.match(/MB|GB/))`));
        fs.writeFileSync(path.join(profile, 'voice-packages.png'), (await win.webContents.capturePage()).toPNG());
        await click('Not now');
        await wait(`!document.querySelector('[aria-label="Voice Packages"]')`);
        await click('Skip for now');
        await js(`document.querySelector('.vo-back').click()`);
        await js(`document.querySelector('.vo-open-btn').click()`);
        await new Promise((r) => setTimeout(r, 250));
        assert.equal(await js(`!!document.querySelector('[aria-label="Voice Packages"]')`), false, 'welcome chooser appears only once');
        await click('Skip for now');
        await js(`document.querySelector('.vo-back').click()`);
        await js(`localStorage.setItem('settingsPane','extensions');document.querySelector('button[title^="Settings ("]').click()`);
        await wait(`!!document.querySelector('.settings-body .voice-packages')`);
        assert.equal(installs.length, 0, 'Settings must not download');
        // Search and listen before installing, then choose two lightweight packs.
        await js(`const input=document.querySelector('[aria-label="Search voice packages"]');input.value='Norwegian';input.dispatchEvent(new Event('input',{bubbles:true}))`);
        assert.equal(await js(`document.querySelectorAll('.voice-package').length`), 2 + catalog.voxcpm.languages.filter((l) => l.lang === 'nb').length);
        await js(`document.querySelector('.voice-package-sample button').click()`);
        await new Promise((r) => setTimeout(r, 200));
        assert.equal(installs.length, 0, 'samples must not invoke synthesis or download');
        assert.equal(await js(`document.querySelector('.voice-package-sample button').textContent.trim()`), 'Stop', 'the bundled sample must actually start playing');
        await js(`document.querySelector('.voice-package-sample button').click();const input=document.querySelector('[aria-label="Search voice packages"]');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));`);
        await js(`document.querySelectorAll('.voice-package input:checked').forEach(c=>c.click());document.querySelector('[aria-label="Download Norwegian (Bokmål) · Talesyntese"]').click()`);
        await js(`document.querySelector('[aria-label="Download Swedish · NST"]').click()`);
        await click('Download selected');
        await wait(`document.querySelectorAll('.voice-package .ai-models-busy').length >= 2`);
        assert.equal(installs.length, 2);
        const active = [...pending.keys()][0];
        assert.ok(active);
        const jobs = require('../src/main/jobs');
        const queued = jobs.snapshot().find((j) => j.state === 'queued');
        assert.ok(queued && queued.packageKey);
        await js(`window.api.cancelTask(${queued.id})`);
        pending.get(active)();
        await wait(`!document.querySelector('.voice-package .ai-models-busy')`);
        assert.equal(jobs.snapshot().find((j) => j.id === queued.id).state, 'canceled');
        assert.equal(jobs.snapshot().filter((j) => j.state === 'done').length, 1);
        console.log(`PASS: no automatic downloads, one-time prompt, shared Settings list, search, local samples, explicit selection, serial jobs and queued cancellation. Screenshot: ${path.join(profile, 'voice-packages.png')}`);
        clearTimeout(timeout);
        // Tests use disposable profiles; never leave a passed GUI test running
        // if normal window/worker teardown stalls.
        setTimeout(() => app.exit(0), 5000).unref();
        app.quit();
      } catch (error) { console.error(error); console.error('Test profile:', profile); clearTimeout(timeout); app.exit(1); }
    });
  });
  require('../src/main/input').InputTracker.prototype.start = function () {};
  require('../src/main/main');
}
