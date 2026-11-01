// Real Electron dialog + background-worker image exports. Run after npm run build.
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('child_process').spawnSync(electron, [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow, ipcMain } = electron;
const fs = require('fs');
const path = require('path');
const os = require('os');
const { build } = require('esbuild');
const assert = require('node:assert/strict');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-frame-'));
app.setPath('userData', path.join(dir, 'profile'));
app.on('window-all-closed', () => {});
const timeout = setTimeout(() => { console.error('Frame export verification timed out'); app.exit(1); }, 90000);

app.whenReady().then(async () => {
  try {
    await build({ entryPoints: [path.join(__dirname, '../test/frame-export.browser.jsx')], bundle: true, outfile: path.join(dir, 'test.js'), format: 'iife', globalName: 'testFrame', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact' });
    fs.copyFileSync(path.join(__dirname, '../build/app.css'), path.join(dir, 'app.css'));
    fs.copyFileSync(path.join(__dirname, '../build/audiofx-worklet.js'), path.join(dir, 'audiofx-worklet.js'));
    fs.writeFileSync(path.join(dir, 'mock.js'), `window.api = new Proxy({ platform:'darwin', listTasks:async()=>[], baseDir:async()=>'/exports' }, {get:(o,k)=>o[k] || (String(k).startsWith('on')?()=>()=>{}:async()=>null)});`);
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="mock.js"></script><script src="test.js"></script></body></html>');
    const ui = new BrowserWindow({ show: false, width: 1000, height: 850 });
    ui.webContents.on('console-message', (event) => console.error('UI:', event.message));
    await ui.loadFile(path.join(dir, 'index.html'));
    console.log(JSON.stringify({ ui: await ui.webContents.executeJavaScript('testFrame.verifyUI()') }));
    await ui.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 250))');
    fs.writeFileSync(path.join(os.tmpdir(), 'reccut-frame-export.png'), (await ui.webContents.capturePage()).toPNG());
    const source = path.join(dir, 'source.png');
    const dataURL = await ui.webContents.executeJavaScript('testFrame.sourceImage()');
    fs.writeFileSync(source, Buffer.from(dataURL.split(',')[1], 'base64'));
    const worker = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, sandbox: false, backgroundThrottling: false } });
    worker.webContents.on('console-message', (event) => console.error('Worker:', event.message));
    await worker.loadFile(path.join(__dirname, '../build/export.html'));
    let jobId = 0;
    const run = (payload) => new Promise((resolve, reject) => {
      const id = ++jobId;
      const cleanup = () => { ipcMain.off('worker:done', done); ipcMain.off('worker:error', error); };
      const done = (_e, msg) => { if (msg.jobId === id) { cleanup(); resolve(msg.result); } };
      const error = (_e, msg) => { if (msg.jobId === id) { cleanup(); reject(new Error(msg.error)); } };
      ipcMain.on('worker:done', done);
      ipcMain.on('worker:error', error);
      worker.webContents.send('worker:job', { jobId: id, payload });
    });
    for (const [mode, format, alpha] of [
      ['key', 'png', true], ['key', 'webp', true], ['key', 'png', false], ['key', 'jpeg', true], ['mask', 'png', true],
    ]) {
      const project = await ui.webContents.executeJavaScript(`testFrame.fixture(${JSON.stringify(source)}, ${JSON.stringify(mode)})`);
      const output = path.join(dir, `${mode}-${format}-${alpha}.${format === 'jpeg' ? 'jpg' : format}`);
      const file = await run({ project, settings: { frame: { time: 0.74, width: 101, height: 51, format, alpha }, sourceMedia: 'original', output }, tmpDir: dir });
      assert.equal(file, output);
      assert.ok(fs.statSync(output).size > 0);
      const url = `data:image/${format};base64,${fs.readFileSync(output).toString('base64')}`;
      const image = await ui.webContents.executeJavaScript(`testFrame.inspectImage(${JSON.stringify(url)})`);
      assert.equal(image.width, 101, 'exact odd width');
      assert.equal(image.height, 51, 'exact odd height');
      assert.ok(image.center[0] > 220 && image.center[3] === 255, 'opaque red foreground');
      if (alpha && format !== 'jpeg') assert.equal(image.corner[3], 0, 'removed areas must remain transparent in the encoded file');
      else { assert.equal(image.corner[3], 255); assert.ok(image.corner.slice(0, 3).every((n) => n < 10), 'opaque background must be black'); }
      if (mode === 'mask') assert.ok(image.partialAlpha, 'feathered masks must retain partial alpha');
      console.log(JSON.stringify({ mode, format, alpha, ...image }));
    }
    // Matte view is an exportable image: black/white/gray RGB, rather than transparent keyed footage.
    const matte = await ui.webContents.executeJavaScript(`testFrame.fixture(${JSON.stringify(source)}, 'matte')`);
    const inspect = async (file) => ui.webContents.executeJavaScript(`testFrame.inspectImage('data:image/png;base64,${fs.readFileSync(file).toString('base64')}')`);
    const checkMatte = (image) => {
      assert.ok(image.corner.slice(0, 3).every((v) => v < 5) && image.corner[3] === 255, 'matte background must export as opaque black');
      assert.ok(image.center.slice(0, 3).every((v) => v > 250) && image.center[3] === 255, 'matte foreground must export as opaque white');
      assert.ok(image.hasGray, 'feathered edges must export as gray coverage');
    };
    for (const alpha of [false, true]) {
      const output = path.join(dir, `matte-${alpha}.png`);
      await run({ project: matte, settings: { frame: { time: 0.74, width: 128, height: 64, format: 'png', alpha }, output }, tmpDir: dir });
      checkMatte(await inspect(output));
    }
    const ffmpeg = require('../src/main/ffmpeg-path.js');
    for (const forceFfmpeg of [false, true]) {
      const output = path.join(dir, `matte-video-${forceFfmpeg}.mp4`);
      await run({ project: matte, settings: { format: 'mp4-h264', quality: 'high', fps: 10, range: { in: 0, out: 0.2 }, forceFfmpeg, output }, ffmpeg, tmpDir: dir });
      const decoded = path.join(dir, `decoded-matte-${forceFfmpeg}.png`);
      require('child_process').execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', output, '-frames:v', '1', decoded]);
      checkMatte(await inspect(decoded));
    }
    console.log(JSON.stringify({ matteExports: 'passed', checks: 4 }));
    // Decode an actual video and export a later frame, independently of preview resolution.
    const video = path.join(dir, 'changing.webm');
    require('child_process').execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=64x32:r=10:d=1', '-f', 'lavfi', '-i', 'color=blue:s=64x32:r=10:d=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0', '-c:v', 'libvpx-vp9', video]);
    const project = await ui.webContents.executeJavaScript(`testFrame.fixture(${JSON.stringify(video)}, 'plain')`);
    project.media.m.kind = 'video';
    project.clips.subject.type = 'video';
    for (const time of [0.3, 1.3, 2]) {
      const output = path.join(dir, `video-${time}.png`);
      await run({ project, settings: { frame: { time, width: 64, height: 32, format: 'png', alpha: false }, output }, tmpDir: dir });
      const image = await ui.webContents.executeJavaScript(`testFrame.inspectImage('data:image/png;base64,${fs.readFileSync(output).toString('base64')}')`);
      assert.ok(time < 1 ? image.center[0] > 220 && image.center[2] < 20 : image.center[2] > 220 && image.center[0] < 20, 'must export the chosen video frame, also at timeline end');
    }
    console.log(JSON.stringify({ videoFrames: 'passed', checks: 3 }));
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
}).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
