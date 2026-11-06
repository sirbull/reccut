// Explicit real Electron integration test; optional downloads require --download-optional.
// Uses an isolated profile and never changes the user's settings or model registry.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename, ...process.argv.slice(2)], { env, stdio: 'inherit', cwd: root });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, session } = electron;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-subtitle-integration-'));
  app.setPath('appData', profile); app.setPath('userData', path.join(profile, 'profile'));
  const requested = process.argv.filter(a => a.startsWith('--model=')).map(a => a.slice(8));
  const ids = requested.length ? requested : ['whisper-base'];
  if (ids.some(id => id !== 'whisper-base') && !process.argv.includes('--download-optional')) throw new Error('Optional model tests require --download-optional.');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let started = false;
  const deadline = setTimeout(() => { console.error('Integration test timed out.'); app.exit(1); }, 20 * 60 * 1000);
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('console-message', event => { if (event.level === 'error') console.error('Renderer:', event.message); });
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/build/index.html')) return;
      started = true;
      const js = code => win.webContents.executeJavaScript(code);
      try {
        for (let i = 0; i < 100 && !await js(`!!document.querySelector('button[title^="Edit ("]')`); i++) await sleep(100);
        await js(`document.querySelector('button[title^="Edit ("]').click()`);
        for (let i = 0; i < 100 && !await js(`!!document.querySelector('button[title^="Settings ("]')`); i++) await sleep(100);
        await js(`localStorage.setItem('settingsPane','extensions');document.querySelector('button[title^="Settings ("]').click()`);
        for (let i = 0; i < 100 && !await js(`!!document.querySelector('.subtitle-model-summary')`); i++) await sleep(100);
        assert.ok(await js(`document.querySelector('.settings-body').innerText.indexOf('LOCAL SUBTITLE MODELS') < document.querySelector('.settings-body').innerText.indexOf('AI ASSISTANT')`));
        const aiBefore = await js('window.api.aiConfig()');
        console.log('PASS: Settings → AI shows local models above the existing AI Assistant.');
        await js(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Manage Models').click()`);
        await sleep(250);
        assert.ok(await js(`!!document.querySelector('[aria-label="Subtitle Model Manager"]')`));
        fs.writeFileSync(path.join(profile, 'model-manager.png'), (await win.webContents.capturePage()).toPNG());
        console.log(`UI screenshot: ${path.join(profile, 'model-manager.png')}`);
        // Renderer inference must be completely offline; main-process model downloads use Node fetch.
        let blocked = 0;
        session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (details, cb) => {
          const worker = BrowserWindow.getAllWindows().find(w => w.webContents.id === details.webContentsId && w.webContents.getURL().endsWith('/transcribe.html'));
          if (worker) blocked++;
          cb({ cancel: Boolean(worker) });
        });
        for (const id of ids) {
          console.log(`Preparing ${id}…`);
          await js(`window.api.downloadSubtitleModel(${JSON.stringify(id)})`);
          let state, model;
          for (let i = 0; i < 2400; i++) {
            state = await js('window.api.subtitleModels()'); model = state.models.find(m => m.id === id);
            if (model.installed) break;
            if (model.status === 'failed' || model.status === 'unsupported') throw new Error(`${id}: ${model.error || model.status}`);
            if (i % 40 === 0) console.log(`${id}: ${model.downloadedBytes || 0} / ${model.totalBytes || model.downloadSizeBytes}`);
            await sleep(250);
          }
          assert.ok(model.installed, `${id} installed`);
          await js(`window.api.selectSubtitleModel(${JSON.stringify(id)})`);
          const sample = path.join(root, 'test/fixtures/subtitle-speech.wav');
          const startedAt = Date.now();
          const result = await js(`new Promise(async(resolve,reject)=>{
            const offDone=window.api.onTranscribeDone(e=>{if(e.payload.agent){offDone();offError();resolve(e)}});
            const offError=window.api.onTranscribeError(e=>{offDone();offError();reject(new Error(e.error))});
            try {await window.api.startTranscribe({sources:[{path:${JSON.stringify(sample)},in:0,dur:4.8,start:3}],duration:8,language:'english',agent:true})}catch(e){offDone();offError();reject(e)}
          })`);
          assert.ok(result.segments.length); assert.ok(result.words.length);
          const text = result.segments.map(s => s.text).join(' ');
          assert.match(text, /hello|welcome|subtitle/i);
          for (const s of result.segments) { assert.ok(Number.isFinite(s.start) && s.start >= 2.5 && s.end > s.start && s.end <= 8, JSON.stringify(s)); }
          assert.equal(blocked, 0, 'Inference attempted a network request');
          console.log(`PASS: ${id}, offline word timestamps and timeline offset (${((Date.now()-startedAt)/1000).toFixed(1)} s): ${text}`);
        }
        // Exercise deletion through the real renderer action and IPC confirmation.
        // Only this isolated test profile is affected; no native dialogs need human input.
        await js(`window.api.selectSubtitleModel('whisper-base')`);
        const removable = (await js('window.api.subtitleModels()')).models.filter(m => m.installed && m.removable);
        const originalDialog = electron.dialog.showMessageBox;
        let allowDelete = false, confirmations = 0;
        electron.dialog.showMessageBox = async (parent, options) => {
          if (options?.title !== 'Delete this subtitle model?') return originalDialog(parent, options);
          assert.match(options.detail, /MB/); assert.match(options.detail, /downloaded again/); confirmations++;
          return { response: allowDelete ? 1 : 0 };
        };
        try {
          for (const model of removable) {
            await js(`window.api.removeSubtitleModel(${JSON.stringify(model.id)})`);
            assert.ok((await js('window.api.subtitleModels()')).models.find(m => m.id === model.id).installed, 'Cancel must preserve the model');
            allowDelete = true;
            await js(`Array.from(document.querySelectorAll('.subtitle-model-card')).find(card=>card.querySelector('h3').textContent===${JSON.stringify(model.name)}).querySelector('button[title="Delete this model"]').click()`);
            for (let i = 0; i < 100 && (await js('window.api.subtitleModels()')).models.find(m => m.id === model.id).installed; i++) await sleep(50);
            assert.equal((await js('window.api.subtitleModels()')).models.find(m => m.id === model.id).installed, false);
            allowDelete = false;
          }
          assert.equal(confirmations, removable.length * 2);
          if (removable.length) console.log('PASS: Cancel/Delete confirmation, renderer Delete actions, freed storage and protected default.');
        } finally { electron.dialog.showMessageBox = originalDialog; }
        await js(`new Promise(async(resolve,reject)=>{
          let jobId, timer, poll;
          const cleanup=()=>{clearTimeout(timer);clearTimeout(poll);offError();offDone()};
          const offError=window.api.onTranscribeError(e=>{if(e.id===jobId){cleanup();e.error==='Canceled'?resolve():reject(new Error(e.error))}});
          const offDone=window.api.onTranscribeDone(e=>{if(e.id===jobId){cleanup();reject(new Error('Transcription completed before cancellation'))}});
          timer=setTimeout(()=>{cleanup();reject(new Error('Cancellation timed out'))},25000);
          try {
            jobId=await window.api.startTranscribe({sources:[{path:${JSON.stringify(path.join(root, 'test/fixtures/subtitle-speech.wav'))},in:0,dur:4.8,start:0}],duration:8,language:'english',agent:true});
            const check=async()=>{const task=(await window.api.listTasks()).find(t=>t.id===jobId);if(/Loading speech model|Recognizing speech/.test(task?.stage||''))await window.api.cancelTask(jobId);else poll=setTimeout(check,20)};
            await check();
          }catch(e){cleanup();reject(e)}
        })`);
        console.log('PASS: Cancelling transcription interrupts the worker and releases the model.');
        assert.deepEqual(await js('window.api.aiConfig()'), aiBefore);
        console.log('PASS: AI Assistant configuration is unchanged.');
        console.log(`PASS: ${ids.length} real model(s). Test profile: ${profile}`);
        clearTimeout(deadline); app.quit();
      } catch (e) { console.error(e); clearTimeout(deadline); app.exit(1); }
    });
  });
  // Screen-recording hooks are unrelated to subtitle inference and can trigger
  // native accessibility callbacks during automated teardown.
  require('../src/main/input').InputTracker.prototype.start = function () {};
  if (process.argv.includes('--debug-cache')) {
    const Manager = require('../src/main/subtitleModels').SubtitleModelManager;
    const read = Manager.prototype.readModelFile;
    Manager.prototype.readModelFile = async function (key) { const result = await read.call(this, key); console.log('Model cache:', key, result?.byteLength); return result; };
  }
  require('../src/main/main');
}
