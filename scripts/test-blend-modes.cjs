// Real Chromium canvas checks for preview/export compositing. No user profile or media is used.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename], { env, stdio: 'inherit' });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = electron;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-blend-test-'));
  app.setPath('userData', path.join(dir, 'profile'));
  app.whenReady().then(async () => {
    let win;
    try {
      const bundle = await require('esbuild').build({ entryPoints: [path.join(__dirname, '../test/fixtures/blend-render.js')], bundle: true, write: false, format: 'iife', globalName: 'blendTests' });
      win = new BrowserWindow({ show: false });
      await win.loadURL('about:blank');
      await win.webContents.executeJavaScript(bundle.outputFiles[0].text);
      console.log(await win.webContents.executeJavaScript('blendTests.run()'));
      app.exit(0);
    } catch (error) {
      console.error(error); app.exit(1);
    } finally {
      win?.destroy();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
