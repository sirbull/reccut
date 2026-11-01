const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = require('child_process').spawnSync(electron, [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = electron;
const fs = require('fs'), path = require('path'), os = require('os');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-analog-'));
const output = path.join(root, 'build/analog-quality');
app.setPath('userData', path.join(dir, 'profile'));
const timeout = setTimeout(() => app.exit(1), 120000);
app.whenReady().then(async () => {
  try {
    fs.mkdirSync(output, { recursive: true });
    await build({ entryPoints: [path.join(root, 'test/analog-quality.browser.mjs')], bundle: true,
      outfile: path.join(dir, 'review.js'), format: 'iife', globalName: 'review', platform: 'browser' });
    fs.copyFileSync(path.join(root, 'docs/media/ba-before.jpg'), path.join(dir, 'photo.jpg'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; img-src \'self\' data:"></head><body><script src="review.js"></script></body></html>');
    const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    win.webContents.on('console-message', (event) => console.error('Analog:', event.message));
    await win.loadFile(path.join(dir, 'index.html'));
    const result = await win.webContents.executeJavaScript('review.review()');
    for (const [id, data] of Object.entries(result.images)) fs.writeFileSync(path.join(output, `${id}.png`), Buffer.from(data, 'base64'));
    console.log(JSON.stringify({ photographicReview: result.status, images: Object.keys(result.images), output }));
    const tracking = await win.webContents.executeJavaScript('review.trackingFrames()');
    if (!tracking.length || tracking.length > 50) throw new Error('Worn tape must have occasional tracking events, not continuous distortion');
    for (let frame = 0; frame < 120; frame++) {
      const data = await win.webContents.executeJavaScript(`review.animationFrame(${frame})`);
      fs.writeFileSync(path.join(dir, `frame-${String(frame).padStart(3, '0')}.png`), Buffer.from(data, 'base64'));
    }
    require('child_process').execFileSync(require('../src/main/ffmpeg-path.js'), [
      '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '24', '-i', path.join(dir, 'frame-%03d.png'),
      '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'vhs-motion.mp4'),
    ]);
    console.log(JSON.stringify({ animation: 'passed', frames: 120, trackingFrames: tracking, file: path.join(output, 'vhs-motion.mp4') }));
    clearTimeout(timeout); app.exit(0);
  } catch (error) { console.error(error); clearTimeout(timeout); app.exit(1); }
}).finally(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });
