export function designFileName(name) {
  const safe = String(name || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').replace(/[. ]+$/g, '').trim();
  const cut = Array.from(safe).slice(0, 200).join('');
  return cut && cut !== '.' && cut !== '..' ? cut : 'Design';
}
export function uniqueDesignName(name, ext, exists) {
  const stem = designFileName(name);
  let n = 1, file = `${stem}.${ext}`;
  while (exists(file)) file = `${stem} ${++n}.${ext}`;
  return file;
}
const byteLength = (v) => v.size ?? v.byteLength;
export async function fitToSize(encode, maxBytes, { min = 0.4, max = 0.95, steps = 7 } = {}) {
  if (!(maxBytes > 0) || min < 0 || max > 1 || min > max || !Number.isInteger(steps) || steps < 1) throw new Error('Invalid file size or quality limit.');
  const low = await encode(min);
  if (byteLength(low) > maxBytes) return { data: low, quality: min, over: true };
  let best = { data: low, quality: min, over: false }, lo = min, hi = max;
  for (let i = 0; i < steps; i++) {
    const q = i === 0 ? max : (lo + hi) / 2, data = await encode(q);
    if (byteLength(data) <= maxBytes) { best = { data, quality: q, over: false }; lo = q; if (q === max) break; }
    else hi = q;
  }
  return best;
}
