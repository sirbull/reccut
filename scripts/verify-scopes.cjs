const electron = require('electron');
const fs = require('fs'),
  path = require('path'),
  os = require('os');
if (!electron.app) {
  // Build in Node, then exercise Chromium in a separate Electron process and profile.
  (async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-scopes-'));
    try {
      await require('esbuild').build({
        entryPoints: [path.join(__dirname, '../test/scopes.browser.jsx')],
        outfile: path.join(dir, 'scopes.js'),
        bundle: true,
        format: 'iife',
        globalName: 'scopesTest',
        platform: 'browser',
        jsx: 'automatic',
        jsxImportSource: 'preact',
      });
      fs.copyFileSync(path.join(__dirname, '../src/renderer/styles/app.css'), path.join(dir, 'app.css'));
      fs.writeFileSync(
        path.join(dir, 'index.html'),
        `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="scopes.js"></script></body></html>`,
      );
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      const result = require('child_process').spawnSync(electron, [__filename, dir], {
        env,
        stdio: 'inherit',
        timeout: 45000,
      });
      if (result.error) console.error(result.error.message);
      process.exitCode = result.status ?? 1;
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  })();
} else {
  const { app, BrowserWindow } = electron;
  const dir = process.argv[2];
  app.setPath('userData', path.join(dir, 'profile'));
  app.on('window-all-closed', () => {});
  const timeout = setTimeout(() => {
    console.error('Scope verification timed out');
    app.exit(1);
  }, 30000);
  app.whenReady().then(async () => {
    try {
      const win = new BrowserWindow({
        width: 1160,
        height: 930,
        show: false,
        webPreferences: { backgroundThrottling: false },
      });
      win.webContents.on('console-message', (event) => console.error(event.message));
      await win.loadFile(path.join(dir, 'index.html'));
      const result = await win.webContents.executeJavaScript(
        'scopesTest.verify().catch(e=>({error:e.message,stack:e.stack}))',
      );
      if (result.error) throw new Error(JSON.stringify(result));
      console.log(JSON.stringify(result));
      const screenshot = path.join(os.tmpdir(), 'reccut-video-scopes.png');
      fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
      console.log(`Screenshot: ${screenshot}`);
      clearTimeout(timeout);
      app.exit(0);
    } catch (e) {
      console.error(e);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
}
