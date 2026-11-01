// Sjekker at forhåndsvisningen (Chromium spiller proxyen) og eksporten (FFmpeg dekoder originalen)
// gir samme farger, for kilder i ulike fargerom. Kjør: npm run test:colors
const electron = require('electron');
if (!electron.app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = require('child_process').spawnSync(electron, [__filename], { env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
const { app, BrowserWindow } = electron;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ff = require('../src/main/ffmpeg.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-colors-'));
const HD = ['-f', 'lavfi', '-i', 'smptehdbars=size=1920x1080:rate=25', '-t', '2'];
const SD = ['-f', 'lavfi', '-i', 'smptebars=size=720x576:rate=25', '-t', '2', '-vf', 'format=yuv420p', '-c:v', 'mpeg2video', '-q:v', '2'];
const tag = (s, p, t) => ['-colorspace', s, '-color_primaries', p, '-color_trc', t];
const CASES = {
  'ProRes, untagged': [...HD, '-c:v', 'prores_ks', '-profile:v', '2', 'mov'],
  'ProRes, BT.709': [...HD, '-c:v', 'prores_ks', '-profile:v', '2', ...tag('bt709', 'bt709', 'bt709'), 'mov'],
  'DNxHD 8-bit': [...HD, '-vf', 'format=yuv422p', '-c:v', 'dnxhd', '-b:v', '120M', 'mov'],
  'MPEG-2 PAL, BT.601': [...SD, ...tag('bt470bg', 'bt470bg', 'gamma28'), 'mpg'],
  'MPEG-2 PAL, untagged': [...SD, 'mpg'],
  'MJPEG, full range': [...HD, '-c:v', 'mjpeg', '-q:v', '2', 'avi'],
  'ProRes HLG (HDR)': [...HD, '-vf', 'format=yuv422p10le', '-c:v', 'prores_ks', '-profile:v', '2', ...tag('bt2020nc', 'bt2020', 'arib-std-b67'), 'mov'],
};
// Gjennomsnitt i felt, så komprimering og skalering ikke teller. Over dette er forskjellen synlig.
const LIMIT = 6;

async function prepare(name, args, i) {
  const bin = ff.getFfmpegPath();
  const file = path.join(dir, `${i}.${args.at(-1)}`);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args.slice(0, -1), file]);
  const info = await ff.probe(file);
  const proxy = path.join(dir, `${i}_proxy${ff.transcodeExt(info.color, info.alpha)}`);
  await ff.transcode(file, proxy, { color: info.color, alpha: info.alpha, interlaced: info.interlaced, duration: info.duration, quality: 'proxy', maxSide: 1920, audio: false }).promise;
  const { width: w, height: h } = await ff.probe(proxy);
  const raw = path.join(dir, `${i}.rgba`);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', file, '-frames:v', '1', '-vf', `${ff.decodeFilters(info)},format=rgba,scale=${w}:${h}`, '-f', 'rawvideo', raw]);
  return { name, proxy, raw, w, h };
}

function compare(c) {
  return `(async () => {
    const c = ${JSON.stringify(c)};
    const v = document.createElement('video');
    v.muted = true;
    v.src = 'file://' + c.proxy;
    await new Promise((ok, no) => ((v.onloadeddata = ok), (v.onerror = () => no(new Error(v.error?.message)))));
    v.currentTime = 1;
    await new Promise((ok) => (v.onseeked = ok));
    await new Promise((ok) => setTimeout(ok, 300));
    const cv = document.createElement('canvas');
    cv.width = c.w;
    cv.height = c.h;
    const g = cv.getContext('2d');
    g.drawImage(v, 0, 0, c.w, c.h);
    const a = g.getImageData(0, 0, c.w, c.h).data;
    const b = require('fs').readFileSync(c.raw);
    let max = 0;
    for (let gy = 0; gy < 16; gy++)
      for (let gx = 0; gx < 24; gx++) {
        const [x0, x1] = [0.3, 0.7].map((f) => Math.floor(((gx + f) * c.w) / 24));
        const [y0, y1] = [0.3, 0.7].map((f) => Math.floor(((gy + f) * c.h) / 16));
        const m = [0, 0, 0, 0, 0, 0];
        let k = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++, k++) for (let ch = 0; ch < 3; ch++) (m[ch] += a[(y * c.w + x) * 4 + ch]), (m[ch + 3] += b[(y * c.w + x) * 4 + ch]);
        for (let ch = 0; ch < 3; ch++) max = Math.max(max, Math.abs(m[ch] - m[ch + 3]) / k);
      }
    return Math.round(max * 10) / 10;
  })()`;
}

app.whenReady().then(async () => {
  let failed = 0;
  try {
    fs.writeFileSync(path.join(dir, 'blank.html'), '<!doctype html><title>colors</title>');
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false } });
    await win.loadFile(path.join(dir, 'blank.html'));
    let i = 0;
    for (const [name, args] of Object.entries(CASES)) {
      const c = await prepare(name, args, i++);
      const diff = await win.webContents.executeJavaScript(compare(c));
      if (diff > LIMIT) failed++;
      console.log(`${diff > LIMIT ? 'FAIL' : 'ok  '} ${name}: largest difference ${diff} of 255`);
    }
  } catch (err) {
    console.error(err);
    failed++;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    app.exit(failed ? 1 : 0);
  }
});
