// Real export-worker encoding and Chromium playback, using generated media and an isolated profile.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require('node:child_process').spawn(electron, [__filename], { env, stdio: 'inherit' });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow, ipcMain, protocol } = electron;
  const { pathToFileURL } = require('node:url');
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-preview-integration-'));
  app.setPath('userData', path.join(dir, 'profile'));
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  protocol.registerSchemesAsPrivileged([{ scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
  app.whenReady().then(async () => {
    const jobs = require('../src/main/jobs');
    let win;
    const timeout = setTimeout(() => { console.error('Preview integration timed out'); app.exit(1); }, 90000);
    try {
      const ff = require('../src/main/ffmpeg');
      const file = path.join(dir, 'source.mp4');
      await ff.run(['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file]).promise;
      protocol.handle('media', request => {
        const data = fs.readFileSync(decodeURIComponent(new URL(request.url).pathname.slice(1)));
        const range = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '');
        const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) };
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${data.length}`;
        return new Response(data.subarray(start, end + 1), { status: range ? 206 : 200, headers });
      });
      const previews = require('../src/main/previews').createPreviewRenderer({ root: path.join(dir, 'previews'), jobs, render: (payload, ctx) => jobs.runInWorker('export', { ...payload, ffmpeg: ff.getFfmpegPath(), tmpDir: path.join(dir, 'tmp') }, ctx) });
      ipcMain.handle('preview:start', (_e, { project, ranges }) => previews.start(project, ranges));
      ipcMain.handle('preview:release', (_e, files) => previews.release(files));
      ipcMain.handle('tasks:list', () => []);
      const result = await require('esbuild').build({ entryPoints: [path.join(root, 'test/fixtures/preview-render.js')], bundle: true, write: false, format: 'iife', globalName: 'previewTest' });
      const html = path.join(dir, 'test.html');
      fs.writeFileSync(html, `<!doctype html><base href="${pathToFileURL(path.join(root, 'build/')).href}"><body></body>`);
      win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, preload: path.join(root, 'src/main/preload.js'), backgroundThrottling: false } });
      win.webContents.setAudioMuted(true);
      win.webContents.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
      await win.loadFile(html);
      await win.webContents.executeJavaScript(result.outputFiles[0].text);
      const checks = await win.webContents.executeJavaScript(`previewTest.run(${JSON.stringify(file)})`);
      console.log(JSON.stringify(checks));
      console.log('Preview worker, effects, overlays, transition, Select All, playback and invalidation passed.');
      clearTimeout(timeout); jobs.destroyWorkers(); win.destroy();
      fs.rmSync(dir, { recursive: true, force: true }); app.exit(0);
    } catch (error) {
      console.error(error); clearTimeout(timeout); jobs.destroyWorkers(); win?.destroy();
      fs.rmSync(dir, { recursive: true, force: true }); app.exit(1);
    }
  });
}
