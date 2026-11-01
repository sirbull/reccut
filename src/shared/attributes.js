// Lim inn og fjern egenskaper, som Paste Effects og Paste Attributes i Final Cut Pro.
// Egenskapene er delt i grupper. Nøkkelbilder følger med, enten med samme timing eller
// strukket til lengden på klippet de limes inn i.
import { EFFECT_DEFAULTS, deepClone, defaultProps, kfRate } from './model.js';
import { GRADE_PROPS } from './grade.js';
import { STAB_DEFAULTS } from './stabilize.js';

const isMask = (k) => k.startsWith('mask.') || k === 'masks';

export const ATTRIBUTE_GROUPS = [
  { id: 'effects', kind: 'video', label: 'Effects', desc: 'Blur, vignette, shadow, keying and the other video effects', keys: (k) => k === 'fx' || k === 'vfx' || k in EFFECT_DEFAULTS },
  { id: 'color', kind: 'video', label: 'Color', desc: 'Color correction and looks', keys: (k) => k in GRADE_PROPS },
  { id: 'transform', kind: 'video', label: 'Transform', desc: 'Position, scale and rotation', keys: (k) => ['x', 'y', 'scale', 'rotation'].includes(k) },
  { id: 'crop', kind: 'video', label: 'Crop', desc: 'Crop edges', keys: (k) => ['cropL', 'cropR', 'cropT', 'cropB'].includes(k) },
  { id: 'compositing', kind: 'video', label: 'Compositing', desc: 'Opacity', keys: (k) => k === 'opacity' },
  { id: 'masks', kind: 'video', label: 'Masks', desc: 'Shape masks', keys: isMask },
  { id: 'stabilization', kind: 'video', label: 'Stabilization', desc: 'Stabilization settings', keys: (k) => k === 'stabilize' || k in STAB_DEFAULTS },
  { id: 'vfades', kind: 'video', label: 'Video Fades', desc: 'Fade in and out', keys: (k) => k === 'vFadeIn' || k === 'vFadeOut' },
  { id: 'volume', kind: 'audio', label: 'Volume', desc: 'Volume and its keyframes', keys: (k) => ['volume', 'micVolume', 'sysVolume'].includes(k) },
  { id: 'afx', kind: 'audio', label: 'Audio Effects', desc: 'Equalizer, noise reduction, reverb and the other audio effects', keys: (k) => k === 'afx' },
  { id: 'afades', kind: 'audio', label: 'Audio Fades', desc: 'Fade in and out', keys: (k) => k === 'aFadeIn' || k === 'aFadeOut' },
];

// Grupper som Paste Effects tar med (alt som kan endres på et klipp, som i Final Cut Pro).
export const ALL_GROUPS = ATTRIBUTE_GROUPS.map((g) => g.id);

const VISUAL = ['video', 'image', 'recording', 'title'];
const AUDIBLE = ['video', 'recording', 'audio'];

function groupApplies(group, clip) {
  if (group.kind === 'video') return VISUAL.includes(clip.type) && (group.id !== 'stabilization' || clip.type === 'video');
  return AUDIBLE.includes(clip.type);
}

// Hvilke grupper som faktisk har noe å lime inn fra kildeklippet (brukes til avkrysningsboksene).
export function groupsWithContent(src) {
  const defs = defaultProps(src.type);
  return ATTRIBUTE_GROUPS.filter((g) => {
    if (!groupApplies(g, src)) return false;
    const changed = Object.keys(src.props).some((k) => g.keys(k) && JSON.stringify(src.props[k]) !== JSON.stringify(defs[k] ?? (k === 'fx' || k === 'vfx' || k === 'afx' || k === 'masks' ? [] : undefined)));
    const animated = Object.keys(src.kf || {}).some((k) => g.keys(k) && src.kf[k].length);
    return changed || animated;
  }).map((g) => g.id);
}

// Flytter nøkkelbildene fra kilden til målet. Tider er i kildetid for hvert klipp.
function mapKeyframes(list, src, dst, stretch) {
  const srcLen = src.dur * kfRate(src);
  const dstLen = dst.dur * kfRate(dst);
  return list.map((k) => {
    const rel = k[0] - src.in;
    const t = stretch && srcLen > 0 ? dst.in + (rel / srcLen) * dstLen : dst.in + rel;
    return [Math.round(t * 1e6) / 1e6, deepClone(k[1]), ...k.slice(2)];
  });
}

/**
 * Limer inn egenskapene i gruppene fra src til dst. stretch: nøkkelbildene strekkes til
 * lengden på målet (Stretch to Fit), ellers beholdes timingen (Maintain Timing).
 * Gir antall grupper som ble limt inn.
 */
export function pasteAttributes(src, dst, groupIds, { stretch = false } = {}) {
  let n = 0;
  for (const g of ATTRIBUTE_GROUPS) {
    if (!groupIds.includes(g.id) || !groupApplies(g, dst) || !groupApplies(g, src)) continue;
    // Gruppen erstattes helt: det som var der fra før forsvinner, som i Final Cut Pro.
    removeGroup(dst, g);
    for (const [k, v] of Object.entries(src.props)) if (g.keys(k)) dst.props[k] = deepClone(v);
    for (const [k, list] of Object.entries(src.kf || {})) if (g.keys(k) && list.length) dst.kf[k] = mapKeyframes(list, src, dst, stretch);
    // Opptak har eget volum for mikrofon og systemlyd; andre klipp bruker bare volume.
    if (g.id === 'volume' && dst.type !== 'recording') {
      for (const k of ['micVolume', 'sysVolume']) {
        delete dst.props[k];
        delete dst.kf[k];
      }
    }
    // Nye id-er på lydeffektene, så avspillingen behandler dem som egne.
    if (g.id === 'afx' && Array.isArray(dst.props.afx)) dst.props.afx = dst.props.afx.map((e) => ({ ...e, id: Math.random().toString(36).slice(2, 8) }));
    n++;
  }
  return n;
}

function removeGroup(clip, g) {
  const defs = defaultProps(clip.type);
  for (const k of Object.keys(clip.props)) {
    if (!g.keys(k)) continue;
    if (k in defs) clip.props[k] = deepClone(defs[k]);
    else delete clip.props[k];
  }
  if (g.id === 'afx') clip.props.afx = [];
  if (g.id === 'effects') clip.props.vfx = [];
  if (g.id === 'masks') clip.props.masks = [];
  if (g.id === 'stabilization') clip.props.stabilize = false;
  for (const k of Object.keys(clip.kf || {})) if (g.keys(k)) delete clip.kf[k];
}

// Fjerner egenskapene i gruppene (Remove Attributes). Gir antall grupper.
export function removeAttributes(clip, groupIds) {
  let n = 0;
  for (const g of ATTRIBUTE_GROUPS) {
    if (!groupIds.includes(g.id) || !groupApplies(g, clip)) continue;
    removeGroup(clip, g);
    n++;
  }
  return n;
}
