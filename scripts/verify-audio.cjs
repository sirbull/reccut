// Real Chromium audio and UI regression checks; no hardware permissions needed.
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('child_process').spawnSync(electron, [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = electron;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { build } = require('esbuild');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-audio-'));
app.setPath('userData', path.join(dir, 'profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const timeout = setTimeout(() => { console.error('Audio verification timed out'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  try {
    await build({ entryPoints: [path.join(__dirname, '../test/audio-mixer.browser.jsx')], bundle: true, outfile: path.join(dir, 'verify.js'), format: 'iife', globalName: 'verification', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact' });
    fs.copyFileSync(path.join(__dirname, '../build/app.css'), path.join(dir, 'app.css'));
    fs.copyFileSync(path.join(__dirname, '../build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
    fs.writeFileSync(path.join(dir, 'mock.js'), `window.api = new Proxy({platform:'darwin',listTasks:async()=>[],setShortcuts:async()=>[],inputStatus:async()=>({started:false}),saveProject:async()=>'/verification.reccut'}, {get:(obj,key)=>obj[key] || (String(key).startsWith('on')?()=>()=>{}:async()=>null)});`);
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="mock.js"></script><script src="verify.js"></script></body></html>');
    const win = new BrowserWindow({ width: 1080, height: 940, show: false, webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (event) => console.error('Renderer:', event.message));
    await win.loadFile(path.join(dir, 'index.html'));
    for (const method of ['verifyAudio', 'verifyMixerUI', 'showMixer', 'verifyTimeline']) {
      const result = await win.webContents.executeJavaScript(`verification.${method}().catch(error=>({error:error.message,stack:error.stack}))`);
      if (result?.error) throw new Error(JSON.stringify(result));
      console.log(method, JSON.stringify(result));
      if (method === 'showMixer' || method === 'verifyTimeline') {
        const screenshot = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, `${method}.png`), screenshot.toPNG());
      }
    }
    console.log('Visual review:', dir);
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});
