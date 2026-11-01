// Bakgrunnsbilde for Remove Background: medianen av mange bilder fra klippet. Når kameraet står
// stille og personen beveger seg litt, er hvert punkt bakgrunn i de fleste bildene, og medianen
// gir et rent bilde av bakgrunnen uten personen (ingen "spøkelser" der personen har vært).
const { nativeImage } = require('electron');
const ff = require('./ffmpeg');

const WIDTH = 960;
const tick = () => new Promise((r) => setImmediate(r));

async function analyzePlate({ path, from = 0, to, count = 48, width = 1920, height = 1080 }, ctx) {
  const dur = Math.max(0.5, (to ?? from + 10) - from);
  const rate = Math.min(10, count / dur);
  const h = Math.max(2, Math.round((WIDTH * height) / width / 2) * 2);
  ctx.progress(0.02, 'Reading frames');
  const out = await ff.run(['-ss', String(from), '-t', String(dur), '-i', path, '-map', '0:v:0', '-an', '-vf', `fps=${rate.toFixed(4)},scale=${WIDTH}:${h}:flags=area`, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], {
    onProgress: (t) => ctx.progress(0.02 + 0.48 * Math.min(1, t / dur)),
  }).promise;
  const n = Math.floor(out.length / (WIDTH * h * 3));
  if (n < 3) throw new Error('The clip is too short to find the background. Use the frame at the playhead instead.');
  const px = WIDTH * h;
  const frameBytes = px * 3;
  const bgra = Buffer.alloc(px * 4);
  const vals = new Uint8Array(n);
  for (let p = 0; p < px; p++) {
    for (let c = 0; c < 3; c++) {
      for (let f = 0; f < n; f++) vals[f] = out[f * frameBytes + p * 3 + c];
      vals.sort();
      bgra[p * 4 + (2 - c)] = vals[n >> 1];
    }
    bgra[p * 4 + 3] = 255;
    if (p % 20000 === 0) {
      ctx.progress(0.5 + 0.5 * (p / px), 'Finding the background');
      await tick();
      if (ctx.isCanceled()) throw new Error('Canceled');
    }
  }
  const img = nativeImage.createFromBitmap(bgra, { width: WIDTH, height: h });
  return `data:image/jpeg;base64,${img.toJPEG(90).toString('base64')}`;
}

module.exports = { analyzePlate };
