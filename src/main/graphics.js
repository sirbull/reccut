// Animert grafikk som AI-agenten skriver (infografikk, intro, animerte tall og diagrammer), rendret til video.
// Koden er en tegnefunksjon for canvas. Den kjører i et skjult vindu i en egen, tom økt: ingen nettverk,
// ingen filer, ingen Node, ingen nye vinduer. Hvert bilde hentes som PNG og kodes med FFmpeg.
const fs = require('fs');
const path = require('path');
const { BrowserWindow, session } = require('electron');
const { randomUUID } = require('crypto');
const ff = require('./ffmpeg');

// Hjelpere agenten kan bruke i draw(ctx, t). Holdes korte og forklares i verktøybeskrivelsen.
const HELPERS = `
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = { linear: (k) => k, in: (k) => k * k * k, out: (k) => 1 - Math.pow(1 - k, 3), inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), back: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) };
const progress = (t, start, end, fn = ease.inOut) => fn(clamp((t - start) / Math.max(1e-6, end - start)));
function wrapText(ctx, text, maxWidth) {
  const lines = []; let line = '';
  for (const word of String(text).split(/\\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
`;

function page({ code, width, height, fps, duration, images }) {
  const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}">
<style>html,body{margin:0;background:transparent}</style></head><body><canvas id="c" width="${width}" height="${height}"></canvas>
<script>
const W = ${width}, H = ${height}, FPS = ${fps}, DURATION = ${duration};
const IMAGES = {};
${HELPERS}
window.__ready = Promise.all(Object.entries(${JSON.stringify(images)}).map(([k, src]) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = () => ok(); i.src = src; IMAGES[k] = i; })));
window.__error = null;
window.addEventListener('error', (e) => (window.__error = String(e.message)));
</script>
<script>
${code}
</script>
<script>
const __c = document.getElementById('c'), __ctx = __c.getContext('2d');
window.__frame = (t) => {
  try {
    if (typeof draw !== 'function') throw new Error('Define function draw(ctx, t).');
    __ctx.setTransform(1, 0, 0, 1, 0, 0);
    __ctx.clearRect(0, 0, W, H);
    __ctx.save();
    draw(__ctx, t);
    __ctx.restore();
    return __c.toDataURL('image/png');
  } catch (e) {
    return 'error:' + (e && e.message ? e.message : String(e));
  }
};
</script></body></html>`;
}

async function renderGraphic(req, ctx, outputDir) {
  const width = Math.round(req.width),
    height = Math.round(req.height);
  const fps = Math.round(req.fps) || 30,
    duration = Number(req.duration);
  if (!(width >= 16 && width <= 3840 && height >= 16 && height <= 3840) || width % 2 || height % 2) throw new Error('Size must be even, 16 to 3840 pixels.');
  if (!(fps >= 1 && fps <= 60) || !(duration > 0 && duration <= 120)) throw new Error('Use 1 to 60 fps and up to 120 seconds.');
  if (typeof req.code !== 'string' || !req.code.trim() || req.code.length > 200000) throw new Error('Give the drawing code, up to 200 kB.');
  const images = req.images && typeof req.images === 'object' ? req.images : {};
  for (const [k, v] of Object.entries(images))
    if (!/^[\w-]{1,40}$/.test(k) || !/^data:image\/(png|jpeg);base64,/.test(v)) throw new Error('Images must be PNG or JPEG data.');

  const ses = session.fromPartition(`reccut-graphics-${randomUUID()}`); // In memory, discarded afterwards.
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(data|about):/.test(d.url) }));
  ses.setPermissionRequestHandler((_w, _p, cb) => cb(false));
  const win = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const transparent = Boolean(req.transparent);
  fs.mkdirSync(outputDir, { recursive: true });
  const name = String(req.name || 'Graphic').replace(/[^\w ,.()-]+/g, '').slice(0, 60) || 'Graphic';
  const output = path.join(outputDir, `${name} ${randomUUID().slice(0, 4)}${transparent ? '.mov' : '.mp4'}`);
  const enc = transparent
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le']
    : ['-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  let job = null;
  // A frame that never finishes (an endless loop in the code) stops the render instead of hanging it.
  const timed = (p, ms, what) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(what)), ms))]);
  try {
    await timed(win.loadURL(`data:text/html;base64,${Buffer.from(page({ code: req.code, width, height, fps, duration, images })).toString('base64')}`), 15000, 'The page did not load.');
    await timed(win.webContents.executeJavaScript('window.__ready.then(() => window.__error)'), 15000, 'Images did not load.').then((err) => {
      if (err) throw new Error(`The code has an error: ${err}`);
    });
    job = ff.run(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-', ...enc, output], { input: true });
    ctx.setCancel(() => job.kill());
    const frames = Math.max(1, Math.round(duration * fps)),
      previews = [],
      at = new Set([0, 0.25, 0.5, 0.75].map((k) => Math.min(frames - 1, Math.round(frames * k + frames / 8))));
    for (let i = 0; i < frames; i++) {
      if (ctx.isCanceled()) throw new Error('Canceled');
      const url = await timed(
        win.webContents.executeJavaScript(`window.__frame(${i / fps})`),
        10000,
        `Drawing the frame at ${(i / fps).toFixed(2)} s took too long.`,
      );
      if (url.startsWith('error:')) throw new Error(`The code failed at ${(i / fps).toFixed(2)} s: ${url.slice(6)}`);
      if (at.has(i)) previews.push({ t: i / fps, url });
      const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      if (!job.proc.stdin.write(png)) await new Promise((r) => job.proc.stdin.once('drain', r));
      ctx.progress((i + 1) / frames, 'Rendering graphic');
    }
    job.proc.stdin.end();
    await job.promise;
    return { file: output, previews };
  } catch (err) {
    job?.promise.catch(() => {}); // It was stopped on purpose; the reason is the error below.
    job?.kill();
    fs.rmSync(output, { force: true });
    throw err;
  } finally {
    win.destroy();
    ses.clearStorageData().catch(() => {});
  }
}

module.exports = { renderGraphic };
