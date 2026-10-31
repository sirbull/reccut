import { clamp, kfRate, kfTime } from '../../shared/model.js';

export const clampDb = (db) => Math.round(clamp(db, -60, 12) * 10) / 10;
export const volumeY = (db, h) => 2 + (12 - clamp(db, -60, 12)) / 72 * Math.max(1, h - 4);
export const volumeDelta = (dy, h) => dy * 72 / Math.max(1, h - 4);

// Dra et segment: endre bare de to punktene på hver side av pekeren.
export function volumeSegment(clip, prop, T) {
  const list = clip.kf?.[prop] || [];
  if (!list.length) return [];
  const s = kfTime(clip, T);
  const next = list.findIndex(([t]) => t > s);
  if (next === 0) return [0];
  if (next < 0) return [list.length - 1];
  return [next - 1, next];
}

export function shiftVolume(clip, prop, delta, indices) {
  const list = clip.kf?.[prop];
  if (!list?.length) {
    clip.props[prop] = clampDb((clip.props[prop] ?? 0) + delta);
    return;
  }
  // Samme forskyvning for begge punktene, også når ett av dem når volumgrensen.
  const values = indices.map((i) => list[i][1]);
  const shift = clamp(delta, -60 - Math.min(...values), 12 - Math.max(...values));
  for (const i of indices) list[i][1] = clampDb(list[i][1] + shift);
}

// Eksakte Bézier-kurver for de samme easing-funksjonene som avspilling og eksport.
// Linjen forlenges til begge klippkantene, også når alle punktene ligger utenfor utsnittet.
export function volumePath(clip, prop, w, h, z, lead = 0) {
  const list = clip.kf?.[prop];
  if (!list?.length) {
    const y = volumeY(clip.props[prop] ?? 0, h);
    return `M0 ${y} H${w}`;
  }
  const x = (t) => ((t - clip.in) / kfRate(clip) + lead) * z;
  let path = `M${Math.min(0, x(list[0][0]))} ${volumeY(list[0][1], h)} H${x(list[0][0])}`;
  for (let i = 1; i < list.length; i++) {
    const [t0, v0, ease] = list[i - 1];
    const [t1, v1] = list[i];
    const a = x(t0), b = x(t1), dx = b - a;
    const y0 = volumeY(v0, h), y1 = volumeY(v1, h);
    if (ease === 'hold') path += ` H${b} V${y1}`;
    else if (ease === 'easeIn') path += ` C${a + dx / 3} ${y0} ${a + dx * 2 / 3} ${y0} ${b} ${y1}`;
    else if (ease === 'easeOut') path += ` C${a + dx / 3} ${y1} ${a + dx * 2 / 3} ${y1} ${b} ${y1}`;
    else if (ease === 'easeInOut') {
      path += ` C${a + dx / 6} ${y0} ${a + dx / 3} ${y0} ${a + dx / 2} ${(y0 + y1) / 2}`;
      path += ` C${a + dx * 2 / 3} ${y1} ${a + dx * 5 / 6} ${y1} ${b} ${y1}`;
    } else path += ` L${b} ${y1}`;
  }
  return path + ` H${Math.max(w, x(list.at(-1)[0]))}`;
}
