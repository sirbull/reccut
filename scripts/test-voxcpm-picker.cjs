// Exercise the real studio with a fixture-only catalog in a temporary build.
// Reviewed voices are never added to the shipped catalog by this test. Download
// and synthesis IPC are fixtures; settings, saving and WAV import use the app.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '..');
if (!electron.app) {
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-voxcpm-picker-'));
    const buildDir = path.join(dir, 'build'); fs.mkdirSync(buildDir);
    const catalog = structuredClone(require('../src/main/ttsCatalog.json'));
    catalog.voxcpm.languages = ['nb', 'en-us', 'de'].map((lang) => ({ lang, repository: 'test/fixture', revision: 'a'.repeat(40), voices: [
      { id: `${lang}-test-woman`, name: 'Test Woman', gender: 'Female', reference: { path: 'woman.wav', size: 1, sha256: 'a'.repeat(64) } },
      { id: `${lang}-test-man`, name: 'Test Man', gender: 'Male', reference: { path: 'man.wav', size: 1, sha256: 'b'.repeat(64) } },
    ] }));
    await require('esbuild').build({ entryPoints: [path.join(root, 'src/renderer/app.jsx')], outfile: path.join(buildDir, 'app.js'),
      bundle: true, format: 'esm', platform: 'browser', target: 'chrome130', jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
      plugins: [{ name: 'fixture-voices-only', setup(b) { b.onLoad({ filter: /ttsCatalog\.json$/ }, () => ({ contents: JSON.stringify(catalog), loader: 'json' })); } }],
    });
    for (const name of ['index.html', 'app.css', 'audiofx-worklet.js']) fs.copyFileSync(path.join(root, 'build', name), path.join(buildDir, name));
    const samples = path.join(buildDir, 'voice-samples'); fs.mkdirSync(path.join(samples, 'voxcpm'), { recursive: true });
    for (const engine of ['kokoro', 'piper']) fs.symlinkSync(path.join(root, 'assets/voice-samples', engine), path.join(samples, engine), 'dir');
    for (const l of catalog.voxcpm.languages) for (const v of l.voices) for (const m of catalog.voxcpm.moods) {
      // Technical playback fixture only; these are not VoxCPM listening samples.
      fs.copyFileSync(path.join(root, 'assets/voice-samples/kokoro/af_heart.ogg'), path.join(samples, 'voxcpm', `${v.id}-${m.id}.ogg`));
    }
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(electron, [__filename, dir], { env, stdio: 'inherit', cwd: root });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
  })().catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain } = electron;
  const dir = process.argv[2];
  const profile = path.join(dir, 'profile'); fs.mkdirSync(profile); fs.mkdirSync(path.join(dir, 'videos'));
  app.setPath('appData', profile); app.setPath('userData', profile); app.setPath('videos', path.join(dir, 'videos'));
  fs.writeFileSync(path.join(profile, 'voice-packages.json'), JSON.stringify({ voicePackagesAsked: true }));
  const originalLoad = BrowserWindow.prototype.loadFile;
  BrowserWindow.prototype.loadFile = function (file, ...args) {
    return originalLoad.call(this, file === path.join(root, 'build/index.html') ? path.join(dir, 'build/index.html') : file, ...args);
  };
  const state = { installed: false, addon: true, sizeBytes: 116e6, piper: { 'no_NO-talesyntese-medium': { installed: true }, 'sv_SE-nst-medium': { installed: true } },
    voxcpm: { supported: true, installed: false, engine: false, sizeBytes: 3552406272, languages: Object.fromEntries(['nb', 'en-us', 'de'].map((lang) => [lang, { installed: false }])) } };
  const generated = [], downloads = [], saved = [];
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => {
    if (channel === 'tts:status') handler = () => structuredClone(state);
    if (channel === 'projects:save') {
      const save = handler;
      handler = async (...args) => { saved.push(structuredClone(args[1])); return save(...args); };
    }
    if (['tts:install', 'tts:piperInstall', 'tts:voxcpmInstall'].includes(channel)) handler = () => { downloads.push(channel); throw new Error('No downloads in picker test'); };
    if (channel === 'tts:generate') handler = (event, payload) => {
      generated.push(payload);
      const synthesize = require('../src/main/ttsJobs').createTtsJobs({ jobs: require('../src/main/jobs'), onProgress: (p) => event.sender.send('tts:progress', p) });
      return synthesize(payload, async (_p, ctx) => {
        ctx.progress(0.5, 'Test voice', { phase: 'synthesizing' });
        const rate = 48000, samples = Float32Array.from({ length: rate / 2 }, (_, i) => 0.2 * Math.sin(i * 2 * Math.PI * 220 / rate));
        return { rate, samples };
      });
    };
    return originalHandle(channel, handler);
  };
  let started = false;
  const timeout = setTimeout(() => { console.error('VoxCPM picker UI test timed out'); app.exit(1); }, 90000);
  app.on('browser-window-created', (_e, win) => {
    win.webContents.on('console-message', (event) => { if (event.level === 'error') console.error('Renderer:', event.message); });
    win.webContents.on('did-finish-load', async () => {
      if (started || !win.webContents.getURL().endsWith('/build/index.html')) return;
      started = true;
      const js = (code) => win.webContents.executeJavaScript(`{${code}}`).catch((error) => { throw new Error(`${code}: ${error.message}`); });
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const wait = async (code) => { for (let i = 0; i < 160; i++) { if (await js(code)) return; await sleep(50); } throw new Error(`UI condition not reached: ${code}`); };
      const click = (text, scope = 'document') => js(`[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`);
      const select = (selector, value) => js(`const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))`);
      const openVoices = () => js(`document.querySelector('button[title="Use another AI voice (free, runs on this computer)"]').click()`);
      const setReady = (ready) => {
        state.voxcpm.installed = ready; state.voxcpm.engine = ready;
        for (const l of Object.values(state.voxcpm.languages)) l.installed = ready;
        win.webContents.send('tts:changed', structuredClone(state));
      };
      try {
        await wait(`!!document.querySelector('[aria-label="Welcome to Reccut"]')`);
        await js(`navigator.mediaDevices.getUserMedia=async()=>{throw new Error('No microphone in UI test')};void 0`);
        await click('Create Project');
        await wait(`!!document.querySelector('[aria-label="AI Models (Optional)"]')`);
        await click('Not Now');
        await js(`document.querySelector('button[title^="Edit ("]').click()`);
        await wait(`!!document.querySelector('.vo-open-btn')`);
        await js(`document.querySelector('.vo-open-btn').click()`);
        await wait(`!!document.querySelector('.vo-setup')`);
        await click('Skip for now');
        await wait(`!document.querySelector('.vo-setup')`);
        await wait(`!!document.querySelector('.vo-side')`);
        await openVoices();
        await select('.ai-pick-bar select', 'nb');
        await wait(`document.querySelectorAll('.ai-voxcpm li').length===2`);
        await select('.ai-voxcpm li:first-child select', 'angry');
        await js(`document.querySelector('.ai-voxcpm li:first-child button[title^="Listen"]').click()`);
        await sleep(200);
        assert.equal(generated.length, 0, 'auditioning an undownloaded mood uses its bundled sample');
        assert.equal(downloads.length, 0);
        assert.ok(await js(`!!document.querySelector('.ai-voxcpm li:first-child svg.lucide-square')`));
        await click('Choose package…', "document.querySelector('.ai-voxcpm')");
        await wait(`!!document.querySelector('[aria-label="Voice Packages"]')`);
        assert.equal(downloads.length, 0, 'opening the package chooser is not download consent');
        await click('Done', "document.querySelector('[aria-label=\"Voice Packages\"]')");
        setReady(true);
        await openVoices(); await select('.ai-pick-bar select', 'nb');
        await select('.ai-voxcpm li:first-child select', 'angry');
        await sleep(200);
        fs.writeFileSync(path.join(dir, 'voxcpm-picker.png'), (await win.webContents.capturePage()).toPNG());
        await click('Add', "document.querySelector('.ai-voxcpm li:first-child')");
        await wait(`!!document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]')`);
        assert.equal(await js(`document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]').value`), 'angry');
        assert.equal(await js(`document.querySelector('.vo-sound').innerText.includes('Generation speed')`), false);
        await select('.vo-sound select[title="Mood for new VoxCPM2 takes"]', 'sad');
        await click('Write or Paste');
        await wait(`!!document.querySelector('.vo-editor')`);
        await js(`const e=document.querySelector('.vo-editor');e.value='Dette er ikke vanskelig.';e.dispatchEvent(new Event('input',{bubbles:true}))`);
        await click('Done', "document.querySelector('.vo-script-bar')");
        await wait(`!!document.querySelector('.vo-rec.vo-ai')`);
        await js(`document.querySelector('.vo-rec.vo-ai').click()`);
        for (let i = 0; i < 180 && !saved.at(-1)?.voiceover?.takes?.length; i++) await sleep(50);
        assert.equal(saved.at(-1).voiceover.takes.length, 1, 'the generated audio is saved as a normal studio take');
        const stored = saved.at(-1).voiceover;
        const person = stored.people.find((p) => p.id === stored.person);
        assert.deepEqual(person.ai, { engine: 'voxcpm', voice: 'nb-test-woman', mood: 'sad', lang: 'nb' });
        assert.equal(generated.length, 1);
        assert.equal(generated[0].engine, 'voxcpm'); assert.equal(generated[0].mood, 'sad');
        assert.equal(generated[0].speed, undefined); assert.equal(generated[0].speaker, undefined);
        const audio = fs.readFileSync(stored.takes[0].file);
        assert.equal(audio.readUInt32LE(24), 48000);
        const oldFile = stored.takes[0].file;
        await select('.vo-sound select[title="Mood for new VoxCPM2 takes"]', 'neutral');
        assert.deepEqual(fs.readFileSync(oldFile), audio, 'changing mood does not modify an existing take');
        fs.writeFileSync(path.join(dir, 'voxcpm-person.png'), (await win.webContents.capturePage()).toPNG());
        // Select the male voice without losing mood, then switch to Piper and back.
        await select('.vo-sound label:nth-of-type(2) select', 'voxcpm:nb-test-man');
        assert.equal(await js(`document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]').value`), 'neutral');
        await select('.vo-sound label:first-of-type select', 'sv');
        assert.equal(await js(`!!document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]')`), false);
        assert.ok(await js(`document.querySelector('.vo-sound').innerText.includes('Generation speed')`));
        await select('.vo-sound label:first-of-type select', 'nb');
        await wait(`!!document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]')`);
        // English exposes every expression; selecting Warm and Sensual reaches
        // generation with the English voice, then survives a language change.
        await openVoices(); await select('.ai-pick-bar select', 'en-us');
        await wait(`document.querySelectorAll('.ai-voxcpm li').length===2`);
        assert.equal(await js(`document.querySelector('.ai-voxcpm li:first-child select').options.length`), 10);
        await select('.ai-voxcpm li:first-child select', 'warm');
        await sleep(250); // Let the compositor paint the English picker too.
        fs.writeFileSync(path.join(dir, 'voxcpm-english.png'), (await win.webContents.capturePage()).toPNG());
        await click('Add', "document.querySelector('.ai-voxcpm li:first-child')");
        await wait(`document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]')?.value==='warm'`);
        await click('Edit', "document.querySelector('.vo-script-bar')");
        await wait(`!!document.querySelector('.vo-editor')`);
        await js(`const e=document.querySelector('.vo-editor');e.value='We can find a way together.';e.dispatchEvent(new Event('input',{bubbles:true}))`);
        await click('Done', "document.querySelector('.vo-script-bar')");
        for (const mood of ['warm', 'sensual']) {
          await select('.vo-sound select[title="Mood for new VoxCPM2 takes"]', mood);
          const count = saved.at(-1).voiceover.takes.length;
          await js(`document.querySelector('.vo-rec.vo-ai').click()`);
          for (let i = 0; i < 180 && saved.at(-1)?.voiceover?.takes?.length <= count; i++) await sleep(50);
          assert.equal(saved.at(-1).voiceover.takes.length, count + 1);
          const { requestId, ...payload } = generated.at(-1);
          assert.ok(requestId, 'generation has a cancelable request identity');
          assert.deepEqual(payload, { text: 'We can find a way together.', engine: 'voxcpm', voice: 'en-us-test-woman', lang: 'en-us', mood });
          const vo = saved.at(-1).voiceover;
          assert.equal(vo.people.find((p) => p.id === vo.person).ai.mood, mood);
        }
        await select('.vo-sound label:first-of-type select', 'de');
        assert.equal(await js(`document.querySelector('.vo-sound select[title="Mood for new VoxCPM2 takes"]').value`), 'sensual');
        assert.deepEqual(fs.readFileSync(oldFile), audio, 'English and German selections leave the original Norwegian take intact');
        setReady(false);
        await sleep(100);
        await js(`document.querySelector('.vo-rec.vo-ai').click()`);
        await wait(`!!document.querySelector('[aria-label="Voice Packages"]')`);
        assert.equal(generated.length, 3, 'missing VoxCPM packages never fall back to Kokoro');
        assert.equal(downloads.length, 0);
        console.log(`PASS: VoxCPM group, samples before download, package handoff, 48 kHz takes, ten English expressions, Warm/Sensual generation and persistence, language switching, unchanged existing audio and missing-package handling. Fixtures/screenshots: ${dir}`);
        clearTimeout(timeout);
        // Tests use disposable profiles; never leave a passed GUI test running
        // if normal window/worker teardown stalls.
        setTimeout(() => app.exit(0), 5000).unref();
        app.quit();
      } catch (error) { console.error(error); console.error('Fixture profile:', dir); clearTimeout(timeout); app.exit(1); }
    });
  });
  require('../src/main/input').InputTracker.prototype.start = function () {};
  require('../src/main/main');
}
