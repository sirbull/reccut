// Former for masker og sladding: rektangel, avrundet, ellipse og fri form (punkter).
// Alle mål kan ha nøkkelbilder, også punktene i en fri form, så formene kan animeres.
// En form ligger i klippets eget rom: den følger klippet når det flyttes, skaleres eller roteres.
import { uid, valueAt } from './model.js';

export const MASK_SHAPES = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'path', label: 'Freeform' },
];

export const MASK_MODES = [
  { id: 'add', label: 'Add', desc: 'Show what is inside the shape' },
  { id: 'subtract', label: 'Subtract', desc: 'Cut the shape out' },
  { id: 'intersect', label: 'Intersect', desc: 'Keep only where it overlaps the masks above' },
];

// Egenskapene til en maske lagres flatt i clip.props med navn som "mask.<id>.x",
// så de kan bruke de samme nøkkelbildene som alt annet.
export const maskKey = (id, prop) => `mask.${id}.${prop}`;

// Matrisen fra klippets rom til bildet, samme som drawClip bruker.
export function clipMatrix(clip, T, W, H) {
  const m = new DOMMatrix();
  if (clip.type === 'redact') return m;
  const x = valueAt(clip, 'x', T) || 0;
  const y = valueAt(clip, 'y', T) || 0;
  const sc = valueAt(clip, 'scale', T) ?? 1;
  const rot = valueAt(clip, 'rotation', T) || 0;
  if (!(x || y || sc !== 1 || rot)) return m;
  return m.translate(W / 2 + x, H / 2 + y).rotate(rot).scale(sc, sc).translate(-W / 2, -H / 2);
}

/**
 * Formen ved tid T. prefix er '' for sladding (klippets egne mål) eller "mask.<id>." for en maske.
 * Gir { shape, cx, cy, w, h, rot, pts } der pts er punktene i klippets rom (bare for fri form).
 */
export function shapeAt(clip, prefix, shape, T, W, H) {
  const v = (p, d) => {
    const r = valueAt(clip, prefix + p, T);
    return r ?? d;
  };
  const cx = W / 2 + (v('x', 0) || 0);
  const cy = H / 2 + (v('y', 0) || 0);
  const w = Math.max(4, v('w', W * 0.25));
  const h = Math.max(4, v('h', H * 0.1));
  const rot = ((v('rotation', 0) || 0) * Math.PI) / 180;
  let pts = null;
  if (shape === 'path') {
    const flat = v('points', null) || defaultPoints(w, h);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    pts = [];
    for (let i = 0; i + 1 < flat.length; i += 2) pts.push([cx + flat[i] * c - flat[i + 1] * s, cy + flat[i] * s + flat[i + 1] * c]);
  }
  return { shape, cx, cy, w, h, rot, pts };
}

// Punktene i en ny fri form: et rektangel med punkter på hjørnene og midt på sidene.
export function defaultPoints(w, h) {
  const a = w / 2;
  const b = h / 2;
  return [-a, -b, 0, -b * 1.08, a, -b, a * 1.04, 0, a, b, 0, b * 1.08, -a, b, -a * 1.04, 0];
}

// Lukket kurve gjennom punktene (Catmull-Rom som Bézier), eller rette linjer.
function tracePath(path, pts, smooth) {
  const n = pts.length;
  if (n < 2) return;
  path.moveTo(pts[0][0], pts[0][1]);
  if (!smooth || n < 3) {
    for (let i = 1; i < n; i++) path.lineTo(pts[i][0], pts[i][1]);
    path.closePath();
    return;
  }
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    path.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  path.closePath();
}

// Path2D for formen, i klippets rom.
export function shapePath(g, smooth) {
  const path = new Path2D();
  if (g.shape === 'path') {
    tracePath(path, g.pts, smooth);
    return path;
  }
  const local = new Path2D();
  if (g.shape === 'ellipse') local.ellipse(0, 0, g.w / 2, g.h / 2, 0, 0, Math.PI * 2);
  else if (g.shape === 'rounded' && local.roundRect) local.roundRect(-g.w / 2, -g.h / 2, g.w, g.h, Math.min(g.w, g.h) * 0.22);
  else local.rect(-g.w / 2, -g.h / 2, g.w, g.h);
  path.addPath(local, new DOMMatrix().translate(g.cx, g.cy).rotate((g.rot * 180) / Math.PI));
  return path;
}

// Hjørnene til formens ramme i klippets rom (for å finne området som må tegnes).
export function shapeCorners(g) {
  if (g.shape === 'path') return g.pts;
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([u, v]) => [g.cx + (u * g.w * c) / 2 - (v * g.h * s) / 2, g.cy + (u * g.w * s) / 2 + (v * g.h * c) / 2]);
}

/* Masker på klipp */

export function maskList(clip) {
  return Array.isArray(clip.props?.masks) ? clip.props.masks : [];
}

// Klipp som kan ha masker: alt som tegnes, unntatt sladding (den har sin egen form) og mellomrom.
export function canMask(clip) {
  return ['video', 'image', 'recording', 'title'].includes(clip?.type);
}

// Ny maske midt i bildet. Gir id-en.
export function addMask(clip, shape, W, H) {
  const id = uid().slice(0, 6);
  const n = maskList(clip).length + 1;
  const m = { id, shape, mode: 'add', invert: false, smooth: shape === 'path', name: `Mask ${n}` };
  clip.props.masks = [...maskList(clip), m];
  const w = Math.round(W * 0.5);
  const h = Math.round(H * 0.5);
  Object.assign(clip.props, {
    [maskKey(id, 'x')]: 0,
    [maskKey(id, 'y')]: 0,
    [maskKey(id, 'w')]: w,
    [maskKey(id, 'h')]: h,
    [maskKey(id, 'rotation')]: 0,
    [maskKey(id, 'feather')]: 0,
    [maskKey(id, 'opacity')]: 1,
  });
  if (shape === 'path') clip.props[maskKey(id, 'points')] = defaultPoints(w, h);
  return id;
}

export function removeMask(clip, id) {
  clip.props.masks = maskList(clip).filter((m) => m.id !== id);
  const pre = `mask.${id}.`;
  for (const k of Object.keys(clip.props)) if (k.startsWith(pre)) delete clip.props[k];
  for (const k of Object.keys(clip.kf || {})) if (k.startsWith(pre)) delete clip.kf[k];
}

// Bytter form. Til fri form lages punktene fra formen slik den er nå, så den ikke hopper.
export function setMaskShape(clip, id, shape, T, W, H) {
  const m = maskList(clip).find((x) => x.id === id);
  if (!m || m.shape === shape) return;
  if (shape === 'path') {
    const pre = `mask.${id}.`;
    const g = shapeAt(clip, pre, m.shape, T, W, H);
    clip.props[pre + 'points'] = m.shape === 'ellipse' ? ellipsePoints(g.w, g.h) : defaultPoints(g.w, g.h);
    m.smooth = m.shape !== 'rect';
  }
  m.shape = shape;
}

export function ellipsePoints(w, h, n = 8) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push(Math.round((Math.cos(a) * w) / 2), Math.round((Math.sin(a) * h) / 2));
  }
  return out;
}

/**
 * Lager masken i et lerret (alfakanal) i lerretets piksler. base er transformen til lerretet
 * (forhåndsvisningens skala eller eksportens matrise). Gir false om ingen maske er aktiv.
 */
export function paintMask(g, clip, T, W, H, base, cw, ch) {
  const masks = maskList(clip);
  if (!masks.length) return false;
  const M = base.multiply(clipMatrix(clip, T, W, H));
  const k = Math.hypot(M.a, M.b) || 1;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, ch);
  // Starter masken med å trekke fra, vises først alt.
  if (masks[0].mode === 'subtract') {
    g.fillStyle = '#000';
    g.fillRect(0, 0, cw, ch);
  }
  for (const [i, m] of masks.entries()) {
    const pre = `mask.${m.id}.`;
    const geom = shapeAt(clip, pre, m.shape, T, W, H);
    const path = new Path2D();
    path.addPath(shapePath(geom, m.smooth), M);
    if (m.invert) path.rect(-cw, -ch, cw * 3, ch * 3);
    const feather = Math.max(0, valueAt(clip, pre + 'feather', T) || 0) * k;
    const opacity = Math.max(0, Math.min(1, valueAt(clip, pre + 'opacity', T) ?? 1));
    g.filter = feather > 0.5 ? `blur(${(feather / 2).toFixed(1)}px)` : 'none';
    g.globalAlpha = opacity;
    g.globalCompositeOperation = m.mode === 'subtract' ? 'destination-out' : m.mode === 'intersect' && i > 0 ? 'destination-in' : 'source-over';
    g.fillStyle = '#000';
    g.fill(path, m.invert ? 'evenodd' : 'nonzero');
  }
  g.filter = 'none';
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return true;
}
