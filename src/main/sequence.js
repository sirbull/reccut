// Bildesekvenser (render_0001.png, render_0002.png …) blir én videofil, som så importeres som vanlig video.
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');

// Finner den sammenhengende rekken av nummererte bilder som filen hører til, blant navnene i mappen.
// Returnerer { pattern, start, count } (pattern er FFmpeg sitt %04d-mønster), eller null.
function findSequence(file, names) {
  const base = path.basename(file);
  const m = /^(.*?)(\d+)(\D*)$/.exec(base);
  if (!m) return null;
  const [, prefix, digits, suffix] = m;
  const padded = digits.length > 1 && digits.startsWith('0');
  const numbers = new Set();
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    const mid = name.slice(prefix.length, name.length - suffix.length);
    if (!/^\d+$/.test(mid) || (padded && mid.length !== digits.length)) continue;
    numbers.add(Number(mid));
  }
  let start = Number(digits);
  let end = start;
  while (numbers.has(start - 1)) start--;
  while (numbers.has(end + 1)) end++;
  if (end === start) return null;
  const esc = (s) => s.replace(/%/g, '%%');
  return { pattern: path.join(path.dirname(file), `${esc(prefix)}${padded ? `%0${digits.length}d` : '%d'}${esc(suffix)}`), start, count: end - start + 1, prefix, suffix };
}

// Lager videoen i den første mappen i dirs som er skrivbar.
// Gjennomsiktighet blir ProRes 4444, over 8 bit ProRes 422 HQ, ellers H.264 nesten tapsfritt.
async function render(file, fps, dirs, ctx) {
  const seq = findSequence(file, await fs.promises.readdir(path.dirname(file)));
  if (!seq) throw new Error(`${path.basename(file)} is not part of a numbered image sequence.`);
  const info = await ff.probe(file);
  const deep = (info.color?.bits || 8) > 8 || /exr|dpx|cin/i.test(info.videoCodec || '');
  const spec = info.alpha
    ? { ext: '.mov', args: ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le'] }
    : deep
      ? { ext: '.mov', args: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le'] }
      : { ext: '.mp4', args: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '12', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] };
  const stem = `${(seq.prefix.replace(/[\s._-]+$/, '') || 'Image Sequence')} ${seq.start}-${seq.start + seq.count - 1}`;
  const args = [
    // EXR er lineært lys: gjør det om til vanlig sRGB før kodingen.
    ...(/exr/i.test(info.videoCodec || '') ? ['-apply_trc', 'iec61966_2_1'] : []),
    '-framerate', String(fps), '-start_number', String(seq.start), '-i', seq.pattern,
    '-frames:v', String(seq.count), '-vf', "scale='trunc(iw/2)*2':'trunc(ih/2)*2'",
    ...spec.args, '-r', String(fps),
  ];
  const duration = seq.count / fps;
  for (const [i, dir] of dirs.entries()) {
    const out = path.join(dir, `${stem}${spec.ext}`);
    try {
      await fs.promises.mkdir(dir, { recursive: true });
      const job = ff.run([...args, out], { onProgress: (t) => ctx.progress(Math.min(1, t / duration), `${seq.count} frames`) });
      ctx.setCancel(job.kill);
      await job.promise;
      return out;
    } catch (err) {
      if (ctx.isCanceled() || i === dirs.length - 1) throw err;
    }
  }
}

module.exports = { findSequence, render };
