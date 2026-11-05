// Levende kobling til et spor: et klipp med props.follow følger et objekt som er sporet i et
// video- eller opptaksklipp (se src/renderer/editor/track.js). Klippets egne verdier (posisjon,
// rotasjon, skala, form) er plassen i forhold til objektet slik det var da klippet ble festet,
// og flyttes, roteres og skaleres med objektet når det tegnes. Brukes likt i visning og eksport.
import { sourceTime, valueAt } from './model.js';
import { clipMatrix } from './shapes.js';
import { stabilizeAt } from './stabilize.js';

export function containRect(sw, sh, W, H) {
  const s = Math.min(W / sw, H / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function streamOf(p, v) {
  const media = p.media[v.mediaId];
  const stream = v.type === 'recording' ? media?.streams?.screen : media?.streams?.main;
  if (!stream) return null;
  return { stream, st: { ...stream, width: stream.width || media.width, height: stream.height || media.height }, off: v.type === 'recording' ? stream.offset || 0 : 0 };
}

// Fra kildebildet (brøkdeler av bredden) til prosjektets bilde ved tid T, slik render.js tegner klippet.
export function videoMatrix(p, v, st, T) {
  const full = containRect(st.width, st.height, p.width, p.height);
  let m = clipMatrix(v, T, p.width, p.height);
  const stab = v.type === 'video' ? stabilizeAt(v, st.motion, sourceTime(v, T)) : null;
  if (stab) {
    const mx = full.x + full.w / 2;
    const my = full.y + full.h / 2;
    m = m.translate(mx, my).scale(stab.zoom).rotate((stab.a * 180) / Math.PI).translate(stab.x * full.w - mx, stab.y * full.w - my);
  }
  return m.translate(full.x, full.y).scale(full.w);
}

/**
 * Objektet i sporet tr (på klippet v) ved tid T, i prosjektets bilde: { T, x, y, a, s }.
 * Med clamp holdes første og siste punkt utenfor sporet, ellers gir det null der.
 */
export function trackSample(p, v, tr, st, off, T, clamp = false) {
  const n = tr.frames.length;
  let f = (sourceTime(v, T) - off - tr.start) * tr.fps;
  if (clamp) f = Math.max(0, Math.min(n - 1, f));
  else if (f < -1e-6 || f > n - 1 + 1e-6) return null;
  const j = Math.max(0, Math.min(n - 1, Math.floor(f)));
  const A = tr.frames[j];
  const B = tr.frames[Math.min(n - 1, j + 1)];
  if (!clamp && (!A[4] || !B[4])) return null;
  const u = Math.max(0, Math.min(1, f - j));
  const [cx, cy, a, s] = [0, 1, 2, 3].map((k) => A[k] + (B[k] - A[k]) * u);
  const M = videoMatrix(p, v, st, T);
  const q = M.transformPoint(new DOMPoint(cx, cy));
  return { T, x: q.x, y: q.y, a: a + Math.atan2(M.b, M.a), s: s * Math.hypot(M.a, M.b) };
}

// Bevegelsen fra der objektet var da klippet ble festet, til der det er ved tid T. null uten kobling.
export function followMatrix(p, clip, T) {
  const f = clip.props?.follow;
  const v = f && p.clips?.[f.clipId];
  const tr = v?.props.tracks?.find((t) => t.id === f.trackId);
  const info = tr && streamOf(p, v);
  if (!info) return null;
  const r = trackSample(p, v, tr, info.st, info.off, T, true);
  return new DOMMatrix()
    .translate(r.x, r.y)
    .rotate(f.rotation ? ((r.a - f.a) * 180) / Math.PI : 0)
    .scale(f.scale ? r.s / f.s : 1)
    .translate(-f.x, -f.y);
}

/** Klippet slik det tegnes ved tid T: med levende kobling er posisjon, rotasjon og størrelse flyttet med objektet. */
export function followed(p, clip, T) {
  const F = clip.props?.follow ? followMatrix(p, clip, T) : null;
  if (!F) return clip;
  const W = p.width;
  const H = p.height;
  const q = F.transformPoint(new DOMPoint(W / 2 + (valueAt(clip, 'x', T) || 0), H / 2 + (valueAt(clip, 'y', T) || 0)));
  const s = Math.hypot(F.a, F.b);
  const props = { ...clip.props, x: q.x - W / 2, y: q.y - H / 2, rotation: (valueAt(clip, 'rotation', T) || 0) + (Math.atan2(F.b, F.a) * 180) / Math.PI };
  delete props.follow;
  const kf = { ...clip.kf }, expressions = { ...clip.expressions };
  for (const prop of ['x', 'y', 'rotation']) delete expressions[prop];
  delete kf.x;
  delete kf.y;
  delete kf.rotation;
  const scaled = (prop, d) => {
    const v = valueAt(clip, prop, T) ?? d;
    props[prop] = Array.isArray(v) ? v.map((x) => x * s) : v * s;
    delete kf[prop];
    delete expressions[prop];
  };
  if (Math.abs(s - 1) > 1e-6) {
    if (clip.type !== 'redact') scaled('scale', 1);
    else if (valueAt(clip, 'points', T)) scaled('points', null), scaled('w', 480), scaled('h', 120);
    else scaled('w', 480), scaled('h', 120);
  }
  return { ...clip, props, kf, expressions };
}
