// Prosjektmodell og rene funksjoner for å regne ut hva som vises og høres
// på et gitt tidspunkt. Brukes av forhåndsvisning, eksport og tester.

import { BUILTIN_TEMPLATES, templateDefaults } from './titletemplates.js';

export const LAYOUT_ANIM = 0.32;
export const PIP_SIZES = { small: 0.17, medium: 0.23, large: 0.31 };
export const CAPTION_LANE = 1000;

export const TRANSITIONS = [
  { id: 'dissolve', label: 'Cross Dissolve' },
  { id: 'dip', label: 'Fade to Black' },
  { id: 'dipWhite', label: 'Fade to White' },
  { id: 'slideLeft', label: 'Push Left' },
  { id: 'slideRight', label: 'Push Right' },
  { id: 'slideUp', label: 'Push Up' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'circle', label: 'Circle Reveal' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'blur', label: 'Blur' },
];

export const TITLE_STYLES = [
  { id: 'center', label: 'Title' },
  { id: 'lower', label: 'Lower Third' },
  { id: 'top', label: 'Headline' },
  { id: 'card', label: 'Title Card' },
];

// Ferdige titler. Hver mal setter stil og tekst på en tittel.
export const TITLE_TEMPLATES = [
  { id: 'center', label: 'Title', props: { style: 'center', text: 'Title', size: 96, anim: 'fade' } },
  { id: 'lower', label: 'Simple Lower Third', category: 'Lower Thirds', props: { style: 'lower', text: 'Jane Doe', subtext: 'Product Designer', size: 56, anim: 'slide' } },
  { id: 'top', label: 'Headline', props: { style: 'top', text: 'Headline', size: 72, anim: 'slide' } },
  { id: 'card', label: 'Title Card', props: { style: 'card', text: 'Chapter 1', subtext: 'Getting started', bgColor: '#111114', anim: 'fade' } },
  { id: 'boxed', label: 'Boxed', props: { style: 'center', text: 'Key point', size: 80, bg: true, bgColor: '#0a84ff', anim: 'pop' } },
  { id: 'typewriter', label: 'Typewriter', props: { style: 'center', text: 'Hello, world', font: 'mono', size: 80, weight: 600, anim: 'type' } },
  { id: 'callout', label: 'Callout', category: 'Lower Thirds', props: { style: 'lower', text: 'Tip', subtext: 'Press Cmd K to search', size: 52, accent: '#ffd60a', anim: 'slide' } },
  { id: 'end', label: 'End Card', props: { style: 'card', text: 'Thanks for watching', subtext: 'Subscribe for more', bgColor: '#0b1a33', anim: 'fade' } },
];

// Supringer og titler laget som malfiler (se titletemplates.js). De vises i samme bibliotek.
export const TEMPLATE_TITLES = BUILTIN_TEMPLATES.map((t) => ({ id: t.id, label: t.name, category: t.category, props: { template: t.id, ...templateDefaults(t) } }));
TITLE_TEMPLATES.push(...TEMPLATE_TITLES);

// Fargekoder for klipp. Turkis er holdt av til klipp som analyseres, så den finnes ikke her.
export const CLIP_COLORS = [
  { id: 'red', label: 'Red', color: '#ff453a' },
  { id: 'orange', label: 'Orange', color: '#ff9f0a' },
  { id: 'yellow', label: 'Yellow', color: '#ffd60a' },
  { id: 'green', label: 'Green', color: '#30d158' },
  { id: 'blue', label: 'Blue', color: '#0a84ff' },
  { id: 'purple', label: 'Purple', color: '#bf5af2' },
  { id: 'pink', label: 'Pink', color: '#ff6fae' },
  { id: 'brown', label: 'Brown', color: '#a2845e' },
  { id: 'gray', label: 'Gray', color: '#98989d' },
];

export const FONTS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Menlo, Consolas, "Courier New", monospace',
  rounded: '"SF Pro Rounded", ui-rounded, "Arial Rounded MT Bold", "Segoe UI", sans-serif',
};

export const COLOR_LOOKS = [
  { id: 'none', label: 'None', v: { exposure: 0, contrast: 0, saturation: 0, temperature: 0 } },
  { id: 'warm', label: 'Warm', v: { exposure: 0.02, contrast: 0.05, saturation: 0.08, temperature: 0.45 } },
  { id: 'cool', label: 'Cool', v: { exposure: 0, contrast: 0.05, saturation: -0.05, temperature: -0.45 } },
  { id: 'vivid', label: 'Vivid', v: { exposure: 0.03, contrast: 0.15, saturation: 0.35, temperature: 0 } },
  { id: 'muted', label: 'Muted', v: { exposure: 0, contrast: -0.1, saturation: -0.35, temperature: 0.1 } },
  { id: 'bw', label: 'Black & White', v: { exposure: 0, contrast: 0.2, saturation: -1, temperature: 0 } },
];

export const DEFAULT_CAPTION_STYLE = {
  font: 'sans',
  size: 44,
  weight: 600,
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 0,
  bg: true,
  bgColor: '#000000',
  bgOpacity: 0.72,
  shadow: false,
  align: 'center',
  position: 'bottom',
  x: 50,
  y: 90,
  maxLines: 3,
};

// Effekter som kan legges på visuelle klipp. "prop" er egenskapen, med verdiområde.
export const EFFECTS = [
  { id: 'blur', label: 'Blur', prop: 'blur', min: 0, max: 40, def: 8, unit: 'px', css: (v) => `blur(${v / 4}px)` },
  { id: 'vignette', label: 'Vignette', prop: 'vignette', min: 0, max: 1, def: 0.5, scale: 100, unit: '%', css: () => 'none' },
  { id: 'sepia', label: 'Sepia', prop: 'sepia', min: 0, max: 1, def: 0.8, scale: 100, unit: '%', css: (v) => `sepia(${v})` },
  { id: 'grayscale', label: 'Black & White', prop: 'grayscale', min: 0, max: 1, def: 1, scale: 100, unit: '%', css: (v) => `grayscale(${v})` },
  { id: 'invert', label: 'Invert', prop: 'invert', min: 0, max: 1, def: 1, scale: 100, unit: '%', css: (v) => `invert(${v})` },
  { id: 'hue', label: 'Hue Shift', prop: 'hue', min: -180, max: 180, def: 90, unit: '°', css: (v) => `hue-rotate(${v}deg)` },
  { id: 'radius', label: 'Rounded Corners', prop: 'radius', min: 0, max: 50, def: 6, unit: '%', css: () => 'none' },
  { id: 'shadow', label: 'Drop Shadow', prop: 'shadow', min: 0, max: 1, def: 0.6, scale: 100, unit: '%', css: () => 'none' },
  { id: 'border', label: 'Border', prop: 'border', min: 0, max: 40, def: 6, unit: 'px', css: () => 'none' },
];

export const EFFECT_DEFAULTS = { blur: 0, vignette: 0, sepia: 0, grayscale: 0, invert: 0, hue: 0, radius: 0, shadow: 0, border: 0, borderColor: '#ffffff' };

export const EASINGS = [
  { id: 'linear', label: 'Linear' },
  { id: 'easeIn', label: 'Ease In' },
  { id: 'easeOut', label: 'Ease Out' },
  { id: 'easeInOut', label: 'Ease In and Out' },
  { id: 'hold', label: 'Hold' },
];

const EASE_FN = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  hold: () => 0,
};

// Prosjektmaler for nye prosjekter.
export const PROJECT_TEMPLATES = [
  { id: 'auto', label: 'Automatic', desc: 'Matches the first video you add', w: 1920, h: 1080, fps: 30, auto: true },
  { id: 'yt1080', label: 'YouTube 1080p', desc: '1920 × 1080, 30 fps', w: 1920, h: 1080, fps: 30 },
  { id: 'yt4k', label: 'YouTube 4K', desc: '3840 × 2160, 30 fps', w: 3840, h: 2160, fps: 30 },
  { id: 'vertical', label: 'Shorts, Reels, TikTok', desc: '1080 × 1920, 30 fps', w: 1080, h: 1920, fps: 30 },
  { id: 'square', label: 'Square', desc: '1080 × 1080, 30 fps', w: 1080, h: 1080, fps: 30 },
  { id: 'portrait45', label: 'Instagram Feed', desc: '1080 × 1350, 30 fps', w: 1080, h: 1350, fps: 30 },
  { id: 'tutorial', label: 'Tutorial', desc: '1080p with intro card and lower third', w: 1920, h: 1080, fps: 30, tutorial: true },
  { id: 'cinema', label: 'Cinematic', desc: '1920 × 1080, 24 fps', w: 1920, h: 1080, fps: 24 },
];

// Animasjonsmaler som legger inn nøkkelbilder med myke overganger.
export const ANIMATION_PRESETS = [
  { id: 'fadeIn', label: 'Fade In' },
  { id: 'fadeOut', label: 'Fade Out' },
  { id: 'zoomIn', label: 'Slow Zoom In' },
  { id: 'zoomOut', label: 'Slow Zoom Out' },
  { id: 'slideLeft', label: 'Slide In From Left' },
  { id: 'slideRight', label: 'Slide In From Right' },
  { id: 'slideUp', label: 'Slide In From Bottom' },
  { id: 'pop', label: 'Pop In' },
  { id: 'spin', label: 'Spin In' },
];

export function applyAnimationPreset(clip, id, W, H) {
  const a = clip.in;
  const b = kfEnd(clip);
  const d = Math.min(0.6, clip.dur / 3);
  const set = (prop, list) => (clip.kf[prop] = list);
  switch (id) {
    case 'fadeIn':
      set('opacity', [[a, 0, 'easeOut'], [a + d, 1]]);
      break;
    case 'fadeOut':
      set('opacity', [[b - d, 1, 'easeIn'], [b, 0]]);
      break;
    case 'zoomIn':
      set('scale', [[a, 1, 'easeInOut'], [b, 1.15]]);
      break;
    case 'zoomOut':
      set('scale', [[a, 1.15, 'easeInOut'], [b, 1]]);
      break;
    case 'slideLeft':
      set('x', [[a, -W, 'easeOut'], [a + d, 0]]);
      break;
    case 'slideRight':
      set('x', [[a, W, 'easeOut'], [a + d, 0]]);
      break;
    case 'slideUp':
      set('y', [[a, H, 'easeOut'], [a + d, 0]]);
      break;
    case 'pop':
      set('scale', [[a, 0.6, 'easeOut'], [a + d, 1]]);
      set('opacity', [[a, 0, 'easeOut'], [a + d * 0.6, 1]]);
      break;
    case 'spin':
      set('rotation', [[a, -90, 'easeOut'], [a + d, 0]]);
      set('scale', [[a, 0.4, 'easeOut'], [a + d, 1]]);
      break;
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dbToGain = (db) => (db <= -60 ? 0 : Math.pow(10, db / 20));

// Filen som brukes til avspilling og eksport: optimalisert media, arbeidskopi eller originalen.
export function workPath(stream) {
  return stream ? stream.optimized || stream.proxy || stream.path : null;
}

// Teksten som vises som navn på en tittel: navnet i en supring, ellers tittelteksten.
export function titleText(clip) {
  if (clip.props?.template) {
    const f = clip.props.fields || {};
    return f.name || Object.values(f).find(Boolean) || clip.name || 'Title';
  }
  return clip.props?.text || 'Title';
}

export function isVisual(clip) {
  return clip.type === 'video' || clip.type === 'image' || clip.type === 'recording' || clip.type === 'title' || clip.type === 'gap';
}

export function clipHasAudio(clip, media) {
  if (clip.props?.audioDetached || (clip.speed === 0 && !clip.ramp)) return false;
  if (clip.type === 'audio') return true;
  if (clip.type === 'video' || clip.type === 'recording') return Object.values(media?.streams || {}).some((s) => s.hasAudio);
  return false;
}

/* Lydkomponenter: lydsporene i et klipp, som kameralyd og lyd synket fra en ekstern opptaker.
   En komponent kan slås av (clip.props.audioOff[key]) uten å forsvinne, og kan slås på igjen. */

export function componentLabel(media, key, stream) {
  if (stream?.label) return stream.label;
  if (media?.kind === 'recording') return key === 'camera' ? 'Microphone' : key === 'screen' ? 'System audio' : key;
  return media?.kind === 'audio' ? 'Audio' : 'Camera audio';
}

export function audioComponents(clip, media) {
  if (!media || !clip) return [];
  const off = clip.props?.audioOff || {};
  if (clip.type === 'audio') {
    const key = clip.stream || 'main';
    const st = media.streams[key];
    return st?.hasAudio ? [{ key, stream: st, label: componentLabel(media, key, st), off: Boolean(off[key]) }] : [];
  }
  if (clip.type !== 'video' && clip.type !== 'recording') return [];
  return Object.entries(media.streams)
    .filter(([, st]) => st.hasAudio)
    .map(([key, st]) => ({ key, stream: st, label: componentLabel(media, key, st), off: Boolean(off[key]) }));
}

// Volumet for en komponent: opptak har eget nivå for mikrofon og systemlyd.
export function componentVolumeProp(clip, key) {
  if (clip.type === 'recording') return key === 'camera' ? 'micVolume' : key === 'screen' ? 'sysVolume' : 'volume';
  return 'volume';
}

// Komponenten som vises som lydbølge på klippet: den første som er på.
export function primaryComponent(clip, media) {
  const list = audioComponents(clip, media);
  return list.find((c) => !c.off) || list[0] || null;
}

// Klipp som kan forlenges uten grense (de har ingen kildefil med fast lengde).
export function isElastic(clip) {
  return (clip.speed === 0 && !clip.ramp) || clip.type === 'image' || clip.type === 'title' || clip.type === 'gap' || clip.type === 'caption';
}

export function newProject(name = 'Untitled Project') {
  return {
    version: 1,
    id: uid(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    autoFormat: true,
    media: {},
    clips: {},
    primary: [],
    markers: [],
    range: null,
    lanes: {},
    captionStyle: { ...DEFAULT_CAPTION_STYLE },
    duration: 0,
  };
}

export function defaultProps(type, media) {
  const visual = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, exposure: 0, contrast: 0, saturation: 0, temperature: 0, vFadeIn: 0, vFadeOut: 0, ...EFFECT_DEFAULTS, fx: [] };
  const audio = { volume: 0, aFadeIn: 0, aFadeOut: 0 };
  switch (type) {
    case 'video':
      return { ...visual, ...audio };
    case 'image':
      return { ...visual };
    case 'audio':
      return { ...audio };
    case 'recording': {
      const rec = media?.rec || {};
      return {
        ...visual,
        aFadeIn: 0,
        aFadeOut: 0,
        volume: 0,
        micVolume: 0,
        sysVolume: 0,
        showCamera: true,
        pipSize: rec.pip?.size || 'medium',
        pipShape: rec.pip?.shape || 'rect',
        mirror: Boolean(rec.pip?.mirror),
        showKeys: rec.overlays?.keys ?? true,
        cursorZoom: rec.overlays?.cursorZoom ?? true,
        showClicks: rec.overlays?.clicks ?? false,
      };
    }
    case 'title':
      return {
        ...visual,
        text: 'Title',
        subtext: '',
        style: 'center',
        font: 'sans',
        size: 96,
        weight: 700,
        color: '#ffffff',
        accent: '#0a84ff',
        bg: false,
        bgColor: '#000000',
        anim: 'fade',
      };
    case 'caption':
      return { text: '', align: null, pos: null };
    default:
      return {};
  }
}

export function makeClip(type, opts = {}) {
  const media = opts.media;
  const clip = {
    id: uid(),
    type,
    mediaId: media?.id ?? null,
    lane: opts.lane ?? 0,
    start: opts.start ?? 0,
    in: opts.in ?? 0,
    dur: opts.dur ?? (media && media.kind !== 'image' ? media.duration : 4),
    enabled: true,
    props: { ...defaultProps(type, media), ...(media?.audioOff && type !== 'audio' ? { audioOff: { ...media.audioOff } } : {}), ...(opts.props || {}) },
    kf: {},
    name: opts.name ?? media?.name ?? null,
  };
  if (type === 'recording' && media?.rec?.layouts) clip.kf.layout = media.rec.layouts.map(([t, v]) => [t, v]);
  return clip;
}

export function mediaClipType(media) {
  return media.kind === 'recording' ? 'recording' : media.kind;
}

/* Nøkkelbilder. Tider lagres i kildetid, slik at de følger innholdet når klippet trimmes. */

// Hastighet: 1 er normal, 0.5 er halv fart, 0 er frosset bilde.
export const speedOf = (clip) => (clip.speed ?? 1);

/* Fartsramper: clip.ramp = [[u, fart], ...] der u går fra 0 til 1 over klippets lengde.
   Farten endres jevnt mellom punktene. Baklengs: clip.reverse = true. */

// Hvor langt i kilden (i andeler av lengden) klippet har kommet ved u.
export function rampOffset(ramp, u) {
  let sum = 0;
  for (let i = 0; i < ramp.length - 1; i++) {
    const [u0, s0] = ramp[i];
    const [u1, s1] = ramp[i + 1];
    if (u <= u0) break;
    const e = Math.min(u, u1);
    const se = s0 + ((s1 - s0) * (e - u0)) / (u1 - u0 || 1);
    sum += ((s0 + se) / 2) * (e - u0);
    if (u <= u1) break;
  }
  return sum;
}

export function instSpeed(clip, local) {
  if (!clip.ramp) return speedOf(clip);
  const u = clamp(local / (clip.dur || 1), 0, 1);
  const r = clip.ramp;
  for (let i = 0; i < r.length - 1; i++) {
    if (u <= r[i + 1][0]) return r[i][1] + ((r[i + 1][1] - r[i][1]) * (u - r[i][0])) / (r[i + 1][0] - r[i][0] || 1);
  }
  return r[r.length - 1][1];
}

// Kildeavstand etter "local" sekunder på tidslinjen. Utenfor klippet fortsetter farten i endene.
export function srcOffset(clip, local) {
  if (!clip.ramp) return local * speedOf(clip);
  const d = clip.dur || 1;
  if (local <= 0) return local * clip.ramp[0][1];
  if (local >= d) return d * rampOffset(clip.ramp, 1) + (local - d) * clip.ramp[clip.ramp.length - 1][1];
  return d * rampOffset(clip.ramp, local / d);
}

export function srcLen(clip) {
  return srcOffset(clip, clip.dur);
}

export function avgSpeed(clip) {
  if (!clip.ramp) return speedOf(clip);
  return rampOffset(clip.ramp, 1);
}

// Nøkkelbilder bruker samme tidsakse som kilden. Frosne, baklengs og rampede klipp animeres i vanlig tempo.
export const kfRate = (clip) => (clip.ramp || clip.reverse ? 1 : speedOf(clip) || 1);

export function sourceTime(clip, T) {
  const sp = speedOf(clip);
  if (sp === 0 && !clip.ramp) return clip.freezeAt ?? clip.in;
  const off = srcOffset(clip, T - clip.start);
  return clip.reverse ? clip.in + srcLen(clip) - off : clip.in + off;
}

export function kfTime(clip, T) {
  return clip.in + (T - clip.start) * kfRate(clip);
}

export function kfToTimeline(clip, t) {
  return clip.start + (t - clip.in) / kfRate(clip);
}

export function kfEnd(clip) {
  return clip.in + clip.dur * kfRate(clip);
}

// Hvor i kildefilen klippet slutter.
export function srcEnd(clip) {
  return clip.in + srcLen(clip);
}

// Ferdige fartsramper som i Final Cut Pro.
export const RAMP_PRESETS = [
  { id: 'to0', label: 'Ramp to 0%', ramp: [[0, 1], [1, 0.05]] },
  { id: 'from0', label: 'Ramp from 0%', ramp: [[0, 0.05], [1, 1]] },
  { id: 'slowIn', label: 'Slow down in the middle', ramp: [[0, 1], [0.35, 0.25], [0.65, 0.25], [1, 1]] },
  { id: 'speedUp', label: 'Speed up', ramp: [[0, 1], [1, 4]] },
  { id: 'slowDown', label: 'Slow down', ramp: [[0, 4], [1, 1]] },
  { id: 'burst', label: 'Speed burst', ramp: [[0, 1], [0.4, 6], [0.6, 6], [1, 1]] },
];

export function valueAt(clip, prop, T) {
  const list = clip.kf?.[prop];
  if (!list || !list.length) return clip.props[prop];
  if (prop === 'layout') return stepValue(list, sourceTime(clip, T));
  const s = kfTime(clip, T);
  if (typeof list[0][1] !== 'number') return stepValue(list, s);
  if (s <= list[0][0]) return list[0][1];
  const last = list[list.length - 1];
  if (s >= last[0]) return last[1];
  let lo = 0;
  let hi = list.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const [t0, v0, ease] = list[lo];
  const [t1, v1] = list[hi];
  const k = t1 === t0 ? 0 : (s - t0) / (t1 - t0);
  return v0 + (v1 - v0) * (EASE_FN[ease] || EASE_FN.linear)(k);
}

function stepValue(list, s) {
  let v = list[0][1];
  for (const [t, val] of list) {
    if (t <= s) v = val;
    else break;
  }
  return v;
}

export function keyframeIndexAt(clip, prop, s, tol = 1 / 60) {
  const list = clip.kf?.[prop];
  if (!list) return -1;
  return list.findIndex(([t]) => Math.abs(t - s) <= tol);
}

export function setKeyframe(clip, prop, s, value) {
  const list = (clip.kf[prop] = clip.kf[prop] || []);
  const i = keyframeIndexAt(clip, prop, s);
  if (i >= 0) list[i][1] = value;
  else {
    // Nye nøkkelbilder arver myk overgang fra forrige, ellers lineær.
    const prev = list.filter(([t]) => t < s).at(-1);
    list.push(prev?.[2] ? [s, value, prev[2]] : [s, value]);
    list.sort((a, b) => a[0] - b[0]);
  }
}

export function setKeyframeEase(clip, prop, s, ease) {
  const i = keyframeIndexAt(clip, prop, s);
  if (i < 0) return;
  const k = clip.kf[prop][i];
  clip.kf[prop][i] = ease && ease !== 'linear' ? [k[0], k[1], ease] : [k[0], k[1]];
}

// Flytter alle nøkkelbilder i et klipp fra ett tidspunkt til et annet (dra i tidslinjen).
export function moveKeyframes(clip, from, to) {
  const lo = clip.in;
  const hi = kfEnd(clip);
  const t = Math.max(lo, Math.min(hi, to));
  for (const [prop, list] of Object.entries(clip.kf)) {
    if (prop === 'layout') continue;
    for (const k of list) if (Math.abs(k[0] - from) < 1e-4) k[0] = t;
    list.sort((a, b) => a[0] - b[0]);
  }
}

export function removeKeyframe(clip, prop, s) {
  const list = clip.kf?.[prop];
  if (!list) return;
  const i = keyframeIndexAt(clip, prop, s);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) delete clip.kf[prop];
}

/* Oppsett for bilde i bilde, felles for opptak og redigering. */

export function pipRect(layout, lastCorner, W, H, size, shape) {
  if (layout === 1) return { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };
  const base = W * (PIP_SIZES[size] || PIP_SIZES.medium);
  const w = shape === 'rect' || !shape ? base : base * 0.7;
  const h = shape === 'rect' || !shape ? (w * 9) / 16 : w;
  const r = shape === 'circle' ? w / 2 : w * 0.06;
  const m = Math.min(W, H) * 0.025;
  const corner = layout === 2 ? lastCorner : layout;
  const x = corner === 3 || corner === 5 ? m : W - m - w;
  const y = corner === 3 || corner === 4 ? m : H - m - h;
  return { x, y, w, h, r, a: layout === 2 ? 0 : 1 };
}

export function lerpRect(a, b, t) {
  const l = (p, q) => p + (q - p) * t;
  return { x: l(a.x, b.x), y: l(a.y, b.y), w: l(a.w, b.w), h: l(a.h, b.h), r: l(a.r, b.r), a: l(a.a, b.a) };
}

// Kamerarammen ved kildetid s, med myk overgang rett etter hvert oppsettsbytte.
export function cameraRectAt(clip, s, W, H) {
  const list = clip.kf?.layout?.length ? clip.kf.layout : [[0, 6]];
  let idx = 0;
  for (let i = 0; i < list.length; i++) if (list[i][0] <= s) idx = i;
  const cur = list[idx][1];
  const prev = idx > 0 ? list[idx - 1][1] : cur;
  const cornerBefore = (i) => {
    for (let j = i; j >= 0; j--) if (list[j][1] >= 3) return list[j][1];
    return 6;
  };
  const { pipSize, pipShape } = clip.props;
  const to = pipRect(cur, cornerBefore(idx), W, H, pipSize, pipShape);
  const t = idx > 0 || list[0][0] > 0 ? clamp((s - list[idx][0]) / LAYOUT_ANIM, 0, 1) : 1;
  if (t >= 1 || prev === cur) return to;
  const from = pipRect(prev, cornerBefore(idx - 1), W, H, pipSize, pipShape);
  return lerpRect(from, to, easeOutCubic(t));
}

/* Hendelser fra opptaket: musepeker, forstørring, klikk og taster. */

export function cursorAt(list, s) {
  if (!list?.length) return null;
  if (s <= list[0][0]) return [list[0][1], list[0][2]];
  let lo = 0;
  let hi = list.length - 1;
  if (s >= list[hi][0]) return [list[hi][1], list[hi][2]];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const a = list[lo];
  const b = list[hi];
  // Lange pauser mellom punkter betyr at pekeren sto stille.
  if (b[0] - a[0] > 0.1) return [a[1], a[2]];
  const k = (s - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export const ZOOM_RAMP = 0.18;

export function zoomAmountAt(zooms, s) {
  let p = 0;
  for (const [a, b] of zooms || []) {
    if (s < a || s > b + ZOOM_RAMP) continue;
    const up = clamp((s - a) / ZOOM_RAMP, 0, 1);
    const down = s > b ? 1 - clamp((s - b) / ZOOM_RAMP, 0, 1) : 1;
    p = Math.max(p, easeOutCubic(Math.min(up, down)));
  }
  return p;
}

export const KEY_LIFE = 1.6;

export function keysAt(keys, s) {
  const out = [];
  for (const [t, label] of keys || []) {
    if (t > s) break;
    if (s - t < KEY_LIFE) out.push({ label, age: s - t });
  }
  return out.slice(-3);
}

export function clicksAt(clicks, s) {
  const out = [];
  for (const [t, x, y] of clicks || []) {
    if (t > s) break;
    if (s - t < 0.5) out.push({ x, y, age: s - t });
  }
  return out;
}

/* Tidslinjen */

export function primaryClips(project) {
  return project.primary.map((id) => project.clips[id]).filter(Boolean);
}

export function relayoutPrimary(project) {
  let t = 0;
  for (const id of project.primary) {
    const c = project.clips[id];
    if (!c) continue;
    c.start = t;
    c.lane = 0;
    t += c.dur;
  }
  updateDuration(project);
}

export function updateDuration(project) {
  let end = 0;
  for (const c of Object.values(project.clips)) end = Math.max(end, c.start + c.dur);
  project.duration = end;
}

export function laneHidden(project, lane) {
  return Boolean(project.lanes?.[lane]?.hidden);
}

export function laneMuted(project, lane) {
  return Boolean(project.lanes?.[lane]?.muted);
}

// En overgang ligger midt over kuttet. Første klipp tones inn fra svart.
export function transitionWindow(clip, hasPrev = true, prev = null) {
  const d = Math.min(clip.transition.dur, clip.dur, prev ? prev.dur : Infinity);
  return hasPrev ? [clip.start - d / 2, clip.start + d / 2] : [clip.start, clip.start + d];
}

// Hvilke klipp i hovedsporet som er aktive, med eventuell overgang.
export function primaryAt(project, T) {
  const list = project.primary;
  for (let i = 0; i < list.length; i++) {
    const c = project.clips[list[i]];
    if (!c?.transition) continue;
    const prev = i > 0 ? project.clips[list[i - 1]] : null;
    const [a, b] = transitionWindow(c, Boolean(prev), prev);
    if (T >= a && T < b) {
      const p = clamp((T - a) / (b - a), 0, 1);
      return { transition: { type: c.transition.type, p }, a: prev, b: c };
    }
  }
  for (const id of list) {
    const c = project.clips[id];
    if (c && T >= c.start && T < c.start + c.dur) return { clip: c };
  }
  return null;
}

function fadeEnvelope(clip, T, fin, fout) {
  const local = T - clip.start;
  let g = 1;
  if (fin > 0) g *= clamp(local / fin, 0, 1);
  if (fout > 0) g *= clamp((clip.dur - local) / fout, 0, 1);
  return g;
}

export function visualOpacity(clip, T) {
  const o = valueAt(clip, 'opacity', T) ?? 1;
  return o * fadeEnvelope(clip, T, clip.props.vFadeIn || 0, clip.props.vFadeOut || 0);
}

// Lagene som skal tegnes ved tid T, nederst først.
export function computeFrame(project, T, { captions = true } = {}) {
  const layers = [];
  if (!laneHidden(project, 0)) {
    const p = primaryAt(project, T);
    if (p?.transition) {
      layers.push({
        transition: p.transition,
        a: p.a && p.a.enabled ? { clip: p.a, T } : null,
        b: p.b.enabled ? { clip: p.b, T } : null,
      });
    } else if (p?.clip && p.clip.enabled && p.clip.type !== 'gap') {
      layers.push({ clip: p.clip, T });
    }
  }
  const free = [];
  for (const c of Object.values(project.clips)) {
    if (c.lane > 0 && c.lane < CAPTION_LANE && c.enabled && isVisual(c) && T >= c.start && T < c.start + c.dur && !laneHidden(project, c.lane)) {
      free.push(c);
    }
  }
  free.sort((a, b) => a.lane - b.lane || a.start - b.start);
  for (const c of free) layers.push({ clip: c, T });

  const caps = [];
  if (captions && !laneHidden(project, CAPTION_LANE)) {
    for (const c of Object.values(project.clips)) {
      if (c.type === 'caption' && c.enabled && T >= c.start && T < c.start + c.dur) caps.push(c);
    }
  }
  return { layers, captions: caps };
}

// Lydvinduet til et klipp: kan forlenges eller kortes inn i hver ende (utvidet lyd, J- og L-kutt).
export function audioWindow(clip) {
  const lead = clip.props?.aLead || 0;
  const tail = clip.props?.aTail || 0;
  return [clip.start - lead, clip.start + clip.dur + tail];
}

function audioEnvelope(clip, T) {
  const [a, b] = audioWindow(clip);
  if (T < a || T >= b) return 0;
  let g = 1;
  const fin = clip.props.aFadeIn || 0;
  const fout = clip.props.aFadeOut || 0;
  if (fin > 0) g *= clamp((T - a) / fin, 0, 1);
  if (fout > 0) g *= clamp((b - T) / fout, 0, 1);
  return g;
}

// Kryssfade mellom to lydklipp som ligger inntil hverandre i samme spor.
export function audioXfadePartner(project, clip) {
  if (!clip.axfade) return null;
  return Object.values(project.clips).find((o) => o.id !== clip.id && o.lane === clip.lane && o.enabled && Math.abs(o.start + o.dur - clip.start) < 1 / 60) || null;
}

export function audioXfadeWindow(project, clip) {
  const prev = audioXfadePartner(project, clip);
  if (!prev) return null;
  const d = Math.min(clip.axfade, clip.dur, prev.dur);
  return { prev, a: clip.start - d / 2, b: clip.start + d / 2 };
}

// Lik effekt gjennom hele overgangen (equal power), slik at lyden ikke dupper i midten.
const fadeOutGain = (p) => Math.cos((p * Math.PI) / 2);
const fadeInGain = (p) => Math.sin((p * Math.PI) / 2);

// Lydkilder ved tid T: hvilken fil, hvor i filen og hvor høyt.
// "over" betyr at klippet høres utenfor sitt eget område fordi en overgang bruker ekstra lyd.
export function computeAudio(project, T) {
  const out = [];
  const factors = new Map();
  const set = (clip, f, over = false) => factors.set(clip.id, { clip, f, over });
  const solo = Object.values(project.clips).some((c) => c.solo);

  if (!laneMuted(project, 0)) {
    const p = primaryAt(project, T);
    if (p?.transition) {
      if (p.a) set(p.a, fadeOutGain(p.transition.p), true);
      set(p.b, fadeInGain(p.transition.p), true);
    } else if (p?.clip) set(p.clip, 1);
  }
  for (const c of Object.values(project.clips)) {
    if (c.lane === CAPTION_LANE || factors.has(c.id)) continue;
    const [a, b] = audioWindow(c);
    const inside = T >= c.start && T < c.start + c.dur;
    if ((c.lane !== 0 && inside) || (!inside && T >= a && T < b)) set(c, 1);
  }
  for (const c of Object.values(project.clips)) {
    if (c.lane === 0 || c.lane === CAPTION_LANE) continue;
    const xf = audioXfadeWindow(project, c);
    if (xf && T >= xf.a && T < xf.b) {
      const p = clamp((T - xf.a) / (xf.b - xf.a), 0, 1);
      set(c, fadeInGain(p), true);
      set(xf.prev, fadeOutGain(p), true);
    }
  }

  for (const { clip, f, over } of factors.values()) {
    if (!clip.enabled || laneMuted(project, clip.lane) || (solo && !clip.solo)) continue;
    const media = project.media[clip.mediaId];
    if (!media || media.offline || !clipHasAudio(clip, media)) continue;
    const [aw, bw] = audioWindow(clip);
    // Utenfor lydvinduet høres klippet bare under en overgang.
    if ((T < aw || T >= bw) && !over) continue;
    const env = (T < aw || T >= bw ? 1 : audioEnvelope(clip, T)) * f;
    if (env <= 0) continue;
    const s = sourceTime(clip, T);
    const speed = instSpeed(clip, T - clip.start) * (clip.reverse ? -1 : 1);
    // Hver lydkomponent som er på, med sitt eget volum. Lydklipp kan peke på lyden i en video (frakoblet lyd).
    for (const comp of audioComponents(clip, media)) {
      if (comp.off) continue;
      const db = valueAt(clip, componentVolumeProp(clip, comp.key), T) ?? 0;
      out.push({ clip, stream: comp.key, src: s - (comp.stream.offset || 0), gain: dbToGain(db) * env, speed });
    }
  }
  return out;
}

// Alle tidspunkt der noe begynner eller slutter, for navigering og festing.
export function editPoints(project) {
  const set = new Set([0]);
  for (const c of Object.values(project.clips)) {
    set.add(round(c.start));
    set.add(round(c.start + c.dur));
  }
  return [...set].sort((a, b) => a - b);
}

export function round(v, d = 6) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function formatTimecode(t, fps = 30) {
  fps = Math.round(fps) || 30;
  const sign = t < 0 ? '-' : '';
  t = Math.abs(t);
  const totalFrames = Math.round(t * fps);
  const f = totalFrames % fps;
  const s = Math.floor(totalFrames / fps);
  const p = (n) => String(n).padStart(2, '0');
  return `${sign}${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}

export function formatDuration(t) {
  const s = Math.round(t);
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h ? `${h}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`;
}
