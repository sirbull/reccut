const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('child_process').spawnSync(electron, [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow, protocol, net } = electron;
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);
const fs = require('fs');
const path = require('path');
const os = require('os');
const { build } = require('esbuild');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-render-'));
app.on('window-all-closed', () => {});
app.setPath('userData', path.join(dir, 'profile'));
const timeout = setTimeout(() => {
  console.error('Render verification timed out');
  app.exit(1);
}, 45000);
app
  .whenReady()
  .then(async () => {
    try {
      protocol.handle('media', (request) =>
        net.fetch(require('url').pathToFileURL(decodeURIComponent(new URL(request.url).pathname.slice(1))).href),
      );
      await build({
        entryPoints: [path.join(__dirname, '../test/video-effects.browser.mjs')],
        bundle: true,
        outfile: path.join(dir, 'verify.js'),
        format: 'iife',
        globalName: 'verification',
        platform: 'browser',
      });
      fs.writeFileSync(
        path.join(dir, 'index.html'),
        `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'"></head><body><script src="verify.js"></script></body></html>`,
      );
      const windows = [];
      for (const cpu of [false, true]) {
        const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
        win.webContents.on('console-message', (event) => console.error('Renderer:', event.message));
        await win.loadFile(path.join(dir, 'index.html'));
        const result = await win.webContents.executeJavaScript(
          `(() => { try { return verification.verify(${cpu}); } catch (error) { return { error: error.message, stack: error.stack }; } })()`,
        );
        if (result.error) throw new Error(JSON.stringify(result));
        console.log(JSON.stringify(result));
        windows.push(win);
      }
      await build({
        entryPoints: [path.join(__dirname, '../test/extensions.browser.jsx')],
        bundle: true,
        outfile: path.join(dir, 'ui.js'),
        format: 'iife',
        globalName: 'uiVerification',
        platform: 'browser',
        jsx: 'automatic',
        jsxImportSource: 'preact',
      });
      fs.copyFileSync(path.join(__dirname, '../build/app.css'), path.join(dir, 'app.css'));
      fs.copyFileSync(path.join(__dirname, '../build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
      fs.writeFileSync(
        path.join(dir, 'mock.js'),
        `window.api = new Proxy({ platform: 'darwin', listTasks: async()=>[], saveProject: async()=>'/verification.reccut', pluginsList: async()=>[], aiConfig: async()=>({provider:'compatible',endpoint:'https://api.openai.com/v1',model:'user-model',hasKey:true,encryptedStorage:true}), aiChat: async()=>JSON.stringify({reply:'I propose reducing opacity on the selected clip.',actions:[{type:'setProperty',clipId:'subject',property:'opacity',value:0.5}]}) }, {get: (obj,key)=>obj[key] || (String(key).startsWith('on')?()=>()=>{}:async()=>null)});`,
      );
      fs.writeFileSync(
        path.join(dir, 'ui.html'),
        `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' media:; img-src 'self' data:; connect-src 'self' media:"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="mock.js"></script><script src="ui.js"></script></body></html>`,
      );
      const ui = new BrowserWindow({ width: 1080, height: 900, show: false });
      ui.webContents.on('console-message', (event) => console.error('UI:', event.message));
      await ui.loadFile(path.join(dir, 'ui.html'));
      const sourceFile = path.join(dir, 'source.webm');
      require('child_process').execFileSync(require('ffmpeg-static'), [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=64x48:rate=10:duration=2',
        '-c:v',
        'libvpx-vp9',
        '-pix_fmt',
        'yuv420p',
        sourceFile,
      ]);
      await ui.webContents.executeJavaScript(`window.sourceFile = ${JSON.stringify(sourceFile)}`);
      for (const name of ['verifyUI', 'verifySource', 'showSettings', 'verifyChat', 'verifyProcessor']) {
        const result = await ui.webContents.executeJavaScript(
          `uiVerification.${name}().catch(error=>({error:error.message,stack:error.stack}))`,
        );
        if (result.error) throw new Error(JSON.stringify(result));
        console.log(JSON.stringify({ ui: name, ...result }));
        if (name === 'verifyUI')
          fs.writeFileSync(path.join(os.tmpdir(), 'reccut-keyer-ui.png'), (await ui.webContents.capturePage()).toPNG());
        if (name === 'showSettings')
          fs.writeFileSync(
            path.join(os.tmpdir(), 'reccut-extensions-ui.png'),
            (await ui.webContents.capturePage()).toPNG(),
          );
      }
      clearTimeout(timeout);
      app.exit(0);
    } catch (err) {
      console.error(err);
      clearTimeout(timeout);
      app.exit(1);
    }
  })
  .finally(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });
