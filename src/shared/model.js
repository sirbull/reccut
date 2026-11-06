// Prosjektmodell og rene funksjoner for å regne ut hva som vises og høres
// på et gitt tidspunkt. Brukes av forhåndsvisning, eksport og tester.

import { current, isDraft } from 'immer';
import { expressionValue } from './expressions.js';
import { patternClipProps } from './designPattern.js';
import { BUILTIN_TEMPLATES, templateDefaults } from './titletemplates.js';

export const LAYOUT_ANIM = 0.32;
export const PIP_SIZES = { small: 0.17, medium: 0.23, large: 0.31 };
// Kamera ved siden av skjermen (oppsett 7 og 8). Størrelsen er prosent av bildets bredde.
export const SIDE_LAYOUT = { size: 30, min: 15, max: 50, shape: 'square' };
export const CAMERA_COLOR_PROPS = { cameraExposure: 0, cameraContrast: 0, cameraSaturation: 0, cameraTemperature: 0 };
export const CAPTION_LANE = 1000;

export const TRANSITIONS = [
  { id: 'dissolve', label: 'Cross Dissolve' },
  { id: 'dip', label: 'Fade to Black' },
  { id: 'dipWhite', label: 'Fade to White' },
  { id: 'slideLeft', label: 'Push Left', motion: true },
  { id: 'slideRight', label: 'Push Right', motion: true },
  { id: 'slideUp', label: 'Push Up', motion: true },
  { id: 'wipe', label: 'Wipe', motion: true },
  { id: 'circle', label: 'Circle Reveal', motion: true },
  { id: 'zoom', label: 'Zoom', motion: true },
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
TITLE_TEMPLATES.push(...TEMPLATE_TITLES, ...['dots', 'grid'].map(kind => ({ id: `pattern-${kind}`, label: kind === 'dots' ? 'Shape Background' : 'Grid Background', category: 'Backgrounds', props: { ...patternClipProps(kind), text: kind === 'dots' ? 'Shape Background' : 'Grid Background', anim: 'none' } })));

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
  { id: 'shadow', label: 'Drop Shadow', adjustment: false, prop: 'shadow', min: 0, max: 5, def: 0.6, scale: 100, unit: '%', css: () => 'none' },
  { id: 'border', label: 'Border', prop: 'border', min: 0, max: 40, def: 6, unit: 'px', css: () => 'none' },
];

// Null keeps the amount-dependent appearance of projects saved before shadow controls.
export const SHADOW_DEFAULTS = { shadowColor: '#000000', shadowSoftness: 1, shadowOpacity: null, shadowOffsetX: 0, shadowOffsetY: null };

export const EFFECT_DEFAULTS = { ...SHADOW_DEFAULTS, blur: 0, vignette: 0, sepia: 0, grayscale: 0, invert: 0, hue: 0, radius: 0, shadow: 0, border: 0, borderColor: '#ffffff' };

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

// Bildefrekvensene en sekvens kan velge mellom (andre kan skrives inn).
export const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];

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

// Dyp kopi som også virker midt i en endring (der objektene er utkast fra immer).
export function deepClone(x) {
  return structuredClone(isDraft(x) ? current(x) : x);
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
  return clip.type === 'video' || clip.type === 'image' || clip.type === 'recording' || clip.type === 'title' || clip.type === 'gap' || clip.type === 'redact' || clip.type === 'adjustment';
}

/* Sladding: et eget klipp over bildet som gjør et område ugjenkjennelig (passord, ansikter, skilt).
   Det virker på alt som ligger under, også flere lag, som et justeringslag. */
export const REDACT_MODES = [
  { id: 'pixelate', label: 'Pixelate', desc: 'Large blocks. Good for text and faces.' },
  { id: 'blur', label: 'Blur', desc: 'Soft blur. Use a high amount for text.' },
  { id: 'solid', label: 'Solid', desc: 'A solid color box. The safest for passwords.' },
  { id: 'frosted', label: 'Frosted', desc: 'Blur and pixelate together, like frosted glass.' },
];
export const REDACT_SHAPES = [
  { id: 'full', label: 'Whole Frame' },
  { id: 'rect', label: 'Rectangle' },
  { id: 'rounded', label: 'Rounded' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'path', label: 'Freeform' },
];
export function redactLabel(clip) {
  const m = REDACT_MODES.find((x) => x.id === clip.props?.mode);
  return clip.name || (m ? m.label : 'Redact');
}
// Størrelsen på blokkene og uskarpheten, ut fra styrken (0 til 1) og bildehøyden.
export function redactStrength(amount, H) {
  const a = clamp(amount ?? 0.5, 0, 1);
  return { block: Math.max(3, (0.008 + a * 0.06) * H), blur: Math.max(1, (0.003 + a * 0.03) * H) };
}

export function clipHasAudio(clip, media) {
  if (clip.recordingPart === 'camera' || clip.recordingPart === 'keys') return false;
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
  if (clip.recordingPart === 'camera' || clip.recordingPart === 'keys') return [];
  const off = clip.props?.audioOff || {};
  const mono = clip.props?.audioMono || {};
  if (clip.type === 'audio') {
    const key = clip.stream || 'main';
    const st = media.streams[key];
    return st?.hasAudio ? [{ key, stream: st, label: componentLabel(media, key, st), off: Boolean(off[key]), mono: Boolean(mono[key]) }] : [];
  }
  if (clip.type !== 'video' && clip.type !== 'recording') return [];
  return Object.entries(media.streams)
    .filter(([, st]) => st.hasAudio)
    .map(([key, st]) => ({ key, stream: st, label: componentLabel(media, key, st), off: Boolean(off[key]), mono: Boolean(mono[key]) }));
}

// Kamera og skjerm kan være egne klipp, men peker fortsatt på samme opptaksmedia.
export function visualStreams(clip, media) {
  return Object.entries(media?.streams || {}).filter(([key, stream]) => stream.hasVideo && (!clip.recordingPart || key === clip.recordingPart));
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
  return (clip.speed === 0 && !clip.ramp) || clip.type === 'image' || clip.type === 'title' || clip.type === 'gap' || clip.type === 'caption' || clip.type === 'redact' || clip.type === 'adjustment';
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
    designs: {},
    designAssets: {},
    clips: {},
    primary: [],
    markers: [],
    range: null,
    lanes: {},
    captionStyle: { ...DEFAULT_CAPTION_STYLE },
    duration: 0,
  };
}

/* Sekvenser: flere tidslinjer i samme prosjekt, med felles media.
   Den åpne sekvensen ligger øverst i prosjektet (p.clips, p.primary ...), så all kode som leser
   tidslinjen viser den åpne. De andre ligger med feltene sine i p.sequences[id]. */
export const SEQUENCE_FIELDS = ['clips', 'primary', 'markers', 'range', 'lanes', 'tracks', 'captionStyle', 'width', 'height', 'fps', 'autoFormat', 'customFormat', 'duration'];

export function currentSequence(p) {
  return p.sequence || { id: 'main', name: 'Sequence 1', created: 0 };
}

// Alle sekvensene sortert etter når de ble laget. Den åpne har active: true.
export function sequenceList(p) {
  const cur = { ...currentSequence(p), duration: p.duration, width: p.width, height: p.height, fps: p.fps, clipCount: Object.keys(p.clips).length, active: true };
  const rest = Object.values(p.sequences || {}).map((s) => ({ id: s.id, name: s.name, created: s.created || 0, duration: s.duration, width: s.width, height: s.height, fps: s.fps, clipCount: Object.keys(s.clips || {}).length }));
  return [cur, ...rest].sort((a, b) => (a.created || 0) - (b.created || 0));
}

// Tidslinjene i prosjektet, den åpne først. Hver har clips, primary og lanes.
export function timelines(p) {
  return [p, ...Object.values(p.sequences || {})];
}

// Legger den åpne sekvensen bort i p.sequences. Virker på immer-utkast.
function stashSequence(p) {
  const cur = { ...currentSequence(p) };
  for (const k of SEQUENCE_FIELDS) if (p[k] !== undefined) cur[k] = p[k];
  for (const k of SEQUENCE_FIELDS) delete p[k];
  p.sequences ||= {};
  p.sequences[cur.id] = cur;
}

function showSequence(p, seq) {
  const { id, name, created, ...data } = seq;
  Object.assign(p, data);
  p.sequence = { id, name, created: created || 0 };
}

// Åpner en annen sekvens. Gir false hvis den ikke finnes.
export function openSequence(p, id) {
  if (currentSequence(p).id === id) return true;
  const next = p.sequences?.[id];
  if (!next) return false;
  delete p.sequences[id];
  stashSequence(p);
  showSequence(p, next);
  return true;
}

// Ny sekvens (tom, eller en kopi av en annen), som blir den åpne. Gir id-en.
export function addSequence(p, { name, from } = {}) {
  const base = from ? sequenceData(p, from) : null;
  const created = Date.now();
  const copy = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deepClone(v)]));
  const seq = base
    ? { ...copy(base), id: uid(), name: name || `${base.name} copy`, created }
    : { id: uid(), name: name || `Sequence ${sequenceList(p).length + 1}`, created, clips: {}, primary: [], markers: [], range: null, lanes: {}, captionStyle: deepClone(p.captionStyle || DEFAULT_CAPTION_STYLE), width: p.width, height: p.height, fps: p.fps, autoFormat: false, duration: 0 };
  // Den første sekvensen får et fast tidspunkt, så den blir stående først.
  if (!p.sequence) p.sequence = { ...currentSequence(p) };
  stashSequence(p);
  showSequence(p, seq);
  return seq.id;
}

// Feltene til en sekvens, enten den er åpen eller ikke.
function sequenceData(p, id) {
  if (currentSequence(p).id !== id) return p.sequences?.[id];
  const out = { ...currentSequence(p) };
  for (const k of SEQUENCE_FIELDS) if (p[k] !== undefined) out[k] = p[k];
  return out;
}

export function renameSequence(p, id, name) {
  if (currentSequence(p).id === id) p.sequence = { ...currentSequence(p), name };
  else if (p.sequences?.[id]) p.sequences[id].name = name;
}

// Sletter en sekvens. Er den åpen, åpnes den neste først. Den siste kan ikke slettes.
export function deleteSequence(p, id) {
  const list = sequenceList(p);
  if (list.length < 2) return false;
  if (currentSequence(p).id === id) {
    const i = list.findIndex((s) => s.id === id);
    openSequence(p, (list[i + 1] || list[i - 1]).id);
  }
  delete p.sequences[id];
  return true;
}

export function defaultProps(type, media) {
  const visual = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, anchorX: 0, anchorY: 0, exposure: 0, contrast: 0, saturation: 0, temperature: 0, vFadeIn: 0, vFadeOut: 0, ...EFFECT_DEFAULTS, fx: [] };
  const audio = { volume: 0, aFadeIn: 0, aFadeOut: 0 };
  switch (type) {
    case 'video':
      return { ...visual, ...audio };
    case 'image':
      return { ...visual, imageFit: 'contain', kenBurns: false, kenBurnsMode: 'in', kenBurnsAmount: 0.12, kenBurnsPan: 0.04 };
    case 'adjustment':
      return { ...visual, vfx: [] };
    case 'audio':
      return { ...audio };
    case 'recording': {
      const rec = media?.rec || {};
      return {
        ...visual,
        ...CAMERA_COLOR_PROPS,
        aFadeIn: 0,
        aFadeOut: 0,
        volume: 0,
        micVolume: 0,
        sysVolume: 0,
        showCamera: true,
        pipSize: rec.pip?.size || 'medium',
        pipShape: rec.pip?.shape || 'rect',
        mirror: Boolean(rec.pip?.mirror),
        cameraOffsetX: 0,
        cameraOffsetY: 0,
        ...SIDE_DEFAULTS,
        ...(typeof rec.pip?.sideSize === 'number' ? { sideSize: rec.pip.sideSize, sideShape: rec.pip.sideShape || SIDE_LAYOUT.shape, sideBg: 'color', sideBgColor: '#000000', sideFrame: 'none' } : {}),
        showKeys: rec.overlays?.keys ?? true,
        showInputs: Boolean(rec.overlays?.inputs?.on),
        inputX: rec.overlays?.inputs?.x ?? INPUT_POSITION.x,
        inputY: rec.overlays?.inputs?.y ?? INPUT_POSITION.y,
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
    case 'redact':
      return { opacity: 1, vFadeIn: 0, vFadeOut: 0, x: 0, y: 0, w: 480, h: 120, rotation: 0, mode: 'pixelate', shape: 'rounded', amount: 0.5, color: '#000000', invert: false, feather: 0, wholeBlocks: true };
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
  const base = baseValueAt(clip, prop, T);
  const expression = clip.expressions?.[prop];
  return expression ? expressionValue(base, expression, kfTime(clip, T) / kfRate(clip)) : base;
}

export function baseValueAt(clip, prop, T) {
  const list = clip.kf?.[prop];
  if (!list || !list.length) return clip.props[prop];
  if (prop === 'layout') return stepValue(list, sourceTime(clip, T));
  const s = kfTime(clip, T);
  // Lister med tall (punktene i en fri form) glir punkt for punkt når de er like lange.
  if (Array.isArray(list[0][1])) return arrayValue(list, s);
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

function arrayValue(list, s) {
  if (s <= list[0][0]) return list[0][1];
  const last = list[list.length - 1];
  if (s >= last[0]) return last[1];
  let i = 0;
  while (i < list.length - 2 && list[i + 1][0] <= s) i++;
  const [t0, a, ease] = list[i];
  const [t1, b] = list[i + 1];
  if (!Array.isArray(b) || a.length !== b.length) return a;
  const k = (EASE_FN[ease] || EASE_FN.linear)(t1 === t0 ? 0 : (s - t0) / (t1 - t0));
  return a.map((v, j) => v + (b[j] - v) * k);
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

export function setKeyframe(clip, prop, s, value, ease = 'easeInOut') {
  const list = (clip.kf[prop] = clip.kf[prop] || []);
  const i = keyframeIndexAt(clip, prop, s);
  if (i >= 0) list[i][1] = value;
  else {
    // Valget lagres på punktet, så senere endringer i innstillinger ikke endrer animasjonen.
    list.push([s, value, ease]);
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

export const isCorner = (layout) => layout >= 3 && layout <= 6;
export const isSide = (layout) => layout === 7 || layout === 8;

// Kameraet står midt på høyden ved siden av skjermen, og skjermen får resten av bredden.
function legacySideRects(layout, W, H, { size = SIDE_LAYOUT.size, shape = SIDE_LAYOUT.shape } = {}) {
  const m = Math.min(W, H) * 0.025;
  const maxH = H - 2 * m;
  const aspect = SIDE_SHAPES[shape] || 1;
  const w = Math.min((W * size) / 100, maxH * aspect);
  const h = w / aspect;
  const left = layout === 7;
  return {
    camera: { x: left ? m : W - m - w, y: (H - h) / 2, w, h, r: shape === 'circle' ? w / 2 : w * 0.06, a: 1 },
    screen: { x: left ? w + 2 * m : m, y: m, w: W - w - 3 * m, h: maxH, r: 0, a: 1 },
  };
}

// Skjermens område: hele bildet, eller det kameraet lar stå igjen side om side (7, 8).
export function screenArea(layout, W, H, side) {
  if (isSide(layout)) return legacySideRects(layout, W, H, side).screen;
  return { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };
}

export function pipRect(layout, lastCorner, W, H, size, shape, side) {
  if (layout === 1) return { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };
  if (isSide(layout)) return legacySideRects(layout, W, H, side).camera;
  const base = W * (PIP_SIZES[size] || PIP_SIZES.medium);
  const portrait = shape === 'portrait';
  const w = shape === 'rect' || !shape ? base : portrait ? base * 0.5 : base * 0.7;
  const h = shape === 'rect' || !shape ? (w * 9) / 16 : portrait ? (w * 16) / 9 : w;
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

/* Side om side: skjermen og kameraet ved siden av hverandre over en bakgrunn.
   Oppsett 7 har kameraet til venstre, 8 til høyre. Velges i redigeringen. */

export const isSideLayout = (n) => n === 7 || n === 8;
export const SIDE_SHAPES = { portrait: 9 / 16, tall: 3 / 4, square: 1, rect: 16 / 9, circle: 1 };
export const SIDE_SIZES = { small: 0.55, medium: 0.75, large: 1 };
export const SIDE_DEFAULTS = {
  sideShape: 'portrait',
  sideSize: 'medium',
  sideBg: 'gradient',
  sideBgColor: '#1b2238',
  sideBgColor2: '#4a2550',
  sideBgImage: null,
  sideFrame: 'gradient',
  sideFrameColor: '#4c8dff',
  sideFrameColor2: '#d65db1',
};

export function sideProps(clip) {
  const out = { ...SIDE_DEFAULTS };
  for (const k of Object.keys(SIDE_DEFAULTS)) if (clip.props?.[k] != null) out[k] = clip.props[k];
  return out;
}

// Skjermen beholder formatet sitt. Kameraet er like høyt som skjermen ganger størrelsen,
// og begge midtstilles som én gruppe.
export function sideRects(layout, W, H, screenAspect, shape, size) {
  const camAspect = SIDE_SHAPES[shape] || SIDE_SHAPES.portrait;
  const camScale = SIDE_SIZES[size] || SIDE_SIZES.medium;
  const m = H * 0.07;
  const gap = W * 0.025;
  const h = Math.min(H - 2 * m, (W - 2 * m - gap) / (screenAspect + camScale * camAspect));
  const sw = h * screenAspect;
  const cw = h * camScale * camAspect;
  const ch = h * camScale;
  const x0 = (W - sw - gap - cw) / 2;
  const camLeft = layout === 7;
  const r = Math.min(W, H) * 0.018;
  return {
    screen: { x: camLeft ? x0 + cw + gap : x0, y: (H - h) / 2, w: sw, h, r, a: 1 },
    cam: { x: camLeft ? x0 : x0 + sw + gap, y: (H - ch) / 2, w: cw, h: ch, r: shape === 'circle' ? cw / 2 : r, a: 1 },
  };
}

function fullScreenRect(W, H, aspect) {
  const w = Math.min(W, H * aspect);
  const h = w / aspect;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, r: 0, a: 1 };
}

// Kamera og skjerm ved kildetid s, med myk overgang rett etter hvert oppsettsbytte.
// side er 1 når oppsettet er side om side, og glir mellom 0 og 1 i overgangen.
export function recordingRectsAt(clip, s, W, H, screenAspect = 16 / 9) {
  // Width-based layouts saved during recording retain their original geometry.
  // Relative camera sizes use the side-by-side editor with backgrounds/frames.
  if (typeof clip.props.sideSize !== 'string') {
    const area = legacyScreenAreaAt(clip, s, W, H);
    const full = fullScreenRect(area.w, area.h, screenAspect);
    const screen = { ...full, x: full.x + area.x, y: full.y + area.y };
    const cam = legacyCameraRectAt(clip, s, W, H);
    const side = Math.max(Math.abs(area.x), Math.abs(area.y), W - area.w, H - area.h) > 0.001 ? 1 : 0;
    return { screen, cam, side };
  }
  const list = clip.kf?.layout?.length ? clip.kf.layout : [[0, 6]];
  let idx = 0;
  for (let i = 0; i < list.length; i++) if (list[i][0] <= s) idx = i;
  const cur = list[idx][1];
  const prev = idx > 0 ? list[idx - 1][1] : cur;
  // Siste oppsett der kameraet vises, så Skjerm (2) toner ut kameraet der det sto.
  const shownBefore = (i, keep) => {
    for (let j = i; j >= 0; j--) if (keep(list[j][1])) return list[j][1];
    return 6;
  };
  const { pipSize, pipShape } = clip.props;
  const { sideShape, sideSize } = sideProps(clip);
  const full = fullScreenRect(W, H, screenAspect);
  const at = (i) => {
    const n = list[i][1];
    const shown = n === 2 ? shownBefore(i, (v) => v >= 3) : n;
    if (isSideLayout(shown)) {
      const r = sideRects(shown, W, H, screenAspect, sideShape, sideSize);
      return n === 2 ? { cam: { ...r.cam, a: 0 }, screen: full, side: 0 } : { ...r, side: 1 };
    }
    return { cam: pipRect(n, shownBefore(i, (v) => v >= 3 && v <= 6), W, H, pipSize, pipShape), screen: full, side: 0 };
  };
  const to = at(idx);
  const t = idx > 0 || list[0][0] > 0 ? clamp((s - list[idx][0]) / LAYOUT_ANIM, 0, 1) : 1;
  if (t >= 1 || prev === cur) return to;
  const from = at(idx - 1);
  const k = easeOutCubic(t);
  return { cam: lerpRect(from.cam, to.cam, k), screen: lerpRect(from.screen, to.screen, k), side: from.side + (to.side - from.side) * k };
}

export function cameraRectAt(clip, s, W, H, screenAspect) {
  return recordingRectsAt(clip, s, W, H, screenAspect).cam;
}

// Bakgrunnsbildet for side om side, når det er valgt og finnes i biblioteket.
// Ligger kameraet på eget spor, er valget lagret på PiP-klippet (se layoutClipFor).
export function sideBackgroundMedia(project, clip) {
  if (clip?.type !== 'recording') return null;
  const { sideBg, sideBgImage } = sideProps(clip);
  const m = sideBg === 'image' && sideBgImage ? project.media?.[sideBgImage] : null;
  return m?.kind === 'image' && !m.offline ? m : null;
}

// Klippet som bestemmer oppsettet. Er kameraet på eget spor, styrer PiP-klippet også
// skjermen, men bare når det faktisk vises. Ellers fyller skjermen bildet som før.
export function layoutClipFor(project, clip, T) {
  if (clip.recordingPart !== 'screen') return clip;
  const cam = Object.values(project.clips).find((c) => c.recordingPart === 'camera' && c.linkedTo === clip.id);
  if (!cam || !cam.enabled || laneHidden(project, cam.lane) || T < cam.start || T >= cam.start + cam.dur) return null;
  return valueAt(cam, 'showCamera', T) !== false ? cam : null;
}

function legacyLayoutRectAt(clip, s, rectFor) {
  const list = clip.kf?.layout?.length ? clip.kf.layout : [[0, 6]];
  let idx = 0;
  for (let i = 0; i < list.length; i++) if (list[i][0] <= s) idx = i;
  const cur = list[idx][1];
  const prev = idx > 0 ? list[idx - 1][1] : cur;
  const cornerBefore = (i) => {
    for (let j = i; j >= 0; j--) if (isCorner(list[j][1])) return list[j][1];
    return 6;
  };
  const to = rectFor(cur, cornerBefore(idx));
  const t = idx > 0 || list[0][0] > 0 ? clamp((s - list[idx][0]) / LAYOUT_ANIM, 0, 1) : 1;
  if (t >= 1 || prev === cur) return to;
  const from = rectFor(prev, cornerBefore(idx - 1));
  return lerpRect(from, to, easeOutCubic(t));
}

const sideOf = (clip) => ({ size: clip.props.sideSize, shape: clip.props.sideShape });

function legacyCameraRectAt(clip, s, W, H) {
  const { pipSize, pipShape } = clip.props;
  return legacyLayoutRectAt(clip, s, (layout, corner) => pipRect(layout, corner, W, H, pipSize, pipShape, sideOf(clip)));
}

function legacyScreenAreaAt(clip, s, W, H) {
  return legacyLayoutRectAt(clip, s, (layout) => screenArea(layout, W, H, sideOf(clip)));
}

export function screenAreaAt(clip, s, W, H, screenAspect) {
  return typeof clip.props.sideSize === 'string' ? recordingRectsAt(clip, s, W, H, screenAspect).screen : legacyScreenAreaAt(clip, s, W, H);
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

// Tastene i overlegget: [navn, etikett, bredde]. Hjelpeprogrammet slipper bare disse ut
// (native/keystrokes/filter.h), og test/keystrokes.test.mjs holder de to listene like.
export const KEYBOARD_ROWS = [
  { indent: 1.25, keys: [['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']] },
  { keys: [['Tab', 'Tab', 1.5], ['Q', 'Q'], ['W', 'W'], ['E', 'E'], ['R', 'R'], ['T', 'T']] },
  { indent: 1.75, keys: [['A', 'A'], ['S', 'S'], ['D', 'D'], ['F', 'F'], ['G', 'G']] },
  { keys: [['Shift', 'Shift', 2.25], ['Z', 'Z'], ['X', 'X'], ['C', 'C'], ['V', 'V'], ['B', 'B']] },
  { keys: [['Control', 'Ctrl', 1.25], ['Meta', 'Cmd', 1.25], ['Alt', 'Alt', 1.25], ['Space', 'Space', 3.5]] },
];
const letterKeys = (s) => [...s].map((k) => [k, k]);
export const FULL_KEYBOARD_ROWS = [
  { keys: [['Escape', 'Esc'], ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`]), ['Delete', 'Del', 2]] },
  { keys: [['Backquote', '`'], ...letterKeys('1234567890'), ['Minus', '-'], ['Equal', '='], ['Backspace', 'Backspace', 2]] },
  { keys: [['Tab', 'Tab', 1.5], ...letterKeys('QWERTYUIOP'), ['BracketLeft', '['], ['BracketRight', ']'], ['Backslash', '\\', 1.5]] },
  { indent: 1.75, keys: [...letterKeys('ASDFGHJKL'), ['Semicolon', ';'], ['Quote', "'"], ['Enter', 'Enter', 2.25]] },
  { keys: [['Shift', 'Shift', 2.25], ...letterKeys('ZXCVBNM'), ['Comma', ','], ['Period', '.'], ['Slash', '/'], ['Shift', 'Shift', 2.75]] },
  { keys: [['Control', 'Ctrl', 1.25], ['Meta', 'Cmd', 1.25], ['Alt', 'Alt', 1.25], ['Space', 'Space', 7.25], ['ArrowLeft', '←'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowRight', '→']] },
];
// Rekkefølgen er knappene i standardoppsettet til Gamepad API.
export const PAD_BUTTONS = ['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadBack', 'PadStart', 'PadLS', 'PadRS', 'PadUp', 'PadDown', 'PadLeft', 'PadRight'];
export const INPUT_POSITION = { x: 0.02, y: 0.96 };

const PRESS_LABELS = {
  ...Object.fromEntries(FULL_KEYBOARD_ROWS.flatMap((r) => r.keys.map(([name, label]) => [name, label]))),
  ...Object.fromEntries(PAD_BUTTONS.map((name) => [name, name.slice(3)])),
  MouseLeft: 'Left click', MouseRight: 'Right click', MouseMiddle: 'Middle click',
};
const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

// Teksten for ett trykk, eller null. Med Ctrl, Alt eller Cmd nede er det en snarvei, og den vises fra keys.
export function pressLabel(name, held) {
  if (MODIFIER_KEYS.includes(name)) return null;
  if (!/^(Mouse|Pad)/.test(name) && MODIFIER_KEYS.some((m) => m !== 'Shift' && held.has(m))) return null;
  return PRESS_LABELS[name] ?? null;
}

// Hvilke taster og knapper som er nede ved tid s.
export function heldAt(inputs, s) {
  const held = new Set();
  for (const [t, name, down] of inputs || []) {
    if (t > s) break;
    if (down) held.add(name);
    else held.delete(name);
  }
  return held;
}

export function stickAt(sticks, s) {
  let out = null;
  for (const row of sticks || []) {
    if (row[0] > s) break;
    out = row;
  }
  return out ? out.slice(1) : [0, 0, 0, 0];
}

// Snarveier og vanlige trykk sammen, de nyeste sist.
export function pillsAt(rec, s) {
  const out = keysAt(rec?.keys, s);
  const held = new Set();
  for (const [t, name, down] of rec?.inputs || []) {
    if (t > s) break;
    if (!down) {
      held.delete(name);
      continue;
    }
    const label = s - t < KEY_LIFE ? pressLabel(name, held) : null;
    held.add(name);
    if (label) out.push({ label, age: s - t });
  }
  return out.sort((a, b) => b.age - a.age).slice(-3);
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
export function transitionWindow(clip, hasPrev = true, prev = null, edge = 'start') {
  if (edge === 'end') {
    const d = Math.min(clip.transitionOut.dur, clip.dur);
    return [clip.start + clip.dur - d, clip.start + clip.dur];
  }
  const d = Math.min(clip.transition.dur, clip.dur, prev ? prev.dur : Infinity);
  return hasPrev ? [clip.start - d / 2, clip.start + d / 2] : [clip.start, clip.start + d];
}

// Tilstanden til en overgang ved tid T, innenfor vinduet [a, b].
const transitionState = (t, a, b, T) => ({ type: t.type, p: clamp((T - a) / (b - a), 0, 1), audio: t.audio !== false, motionBlur: Boolean(t.motionBlur), dur: b - a });

// Bevegelsesuskarphet gjelder overganger som flytter bildet. Effektklipp leser bildet under
// seg når de tegnes, så de kan ikke tegnes på forhånd og flyttes.
export function canMotionBlur(type, clip) {
  return Boolean(TRANSITIONS.find((t) => t.id === type)?.motion) && clip.type !== 'adjustment' && clip.type !== 'redact';
}

// Klipp over hovedsporet kan også ha overganger. De tones inn fra og ut til det som ligger under.
// Effekter (Pixelate, Blur, sladding) også: effekten toner, tørker eller glir inn over bildet.
export function hasFreeTransitions(clip) {
  return clip.lane > 0 && clip.lane < CAPTION_LANE && isVisual(clip);
}

export function freeTransitionAt(clip, T) {
  for (const edge of ['start', 'end']) {
    const t = clip[edge === 'end' ? 'transitionOut' : 'transition'];
    if (!t) continue;
    const [a, b] = transitionWindow(clip, false, null, edge);
    if (T >= a && T < b) return { ...transitionState(t, a, b, T), edge };
  }
  return null;
}

// Kuttet i hovedsporet nærmest T: starten av hvert klipp, og slutten av et klipp uten nabo etter seg (toning ut).
export function nearestEdit(project, T) {
  const clips = project.primary.map((id) => project.clips[id]).filter(Boolean);
  let best = null;
  clips.forEach((c, i) => {
    if (c.type === 'gap') return;
    const next = clips[i + 1];
    const edges = [['start', c.start]];
    if (!next || next.type === 'gap') edges.push(['end', c.start + c.dur]);
    for (const [edge, t] of edges) if (!best || Math.abs(t - T) < best.d) best = { id: c.id, edge, d: Math.abs(t - T) };
  });
  return best && { id: best.id, edge: best.edge };
}

export const transitionSelection = (id, edge = 'start') => edge === 'end' ? `out:${id}` : id;
export function parseTransitionSelection(value) {
  return value?.startsWith('out:') ? { id: value.slice(4), edge: 'end', key: 'transitionOut' } : { id: value, edge: 'start', key: 'transition' };
}

// Hvilke klipp i hovedsporet som er aktive, med eventuell overgang.
/* Tidsindeks for lange prosjekter: klippene sortert i bøtter på ti sekunder, så avspilling og
   eksport bare ser på klippene nær spillhodet, ikke alle. Bygges på nytt når klippene endres. */
const BUCKET = 10;
const timeIndexes = new WeakMap();

// Et raskt fingeravtrykk av tidene, så indeksen bygges på nytt om klipp endres midt i en redigering.
function fingerprint(project) {
  let f = project.primary.length * 7919;
  let n = 0;
  for (const id in project.clips) {
    const c = project.clips[id];
    n++;
    f += c.start * 1.31 + c.dur * 2.17 + c.lane * 3.7 + (c.props?.aLead || 0) * 5.3 + (c.props?.aTail || 0) * 7.1 + (c.solo ? 11 : 0) + (c.transition ? 13 : 0) + (c.transitionOut ? 17 : 0);
  }
  return f + n * 104729;
}

// Prosjektversjoner som aldri endres etterpå (redigeringen lager alltid nye versjoner, og
// eksporten endrer ikke prosjektet). For dem holder det å sammenligne identitet.
const sealedProjects = new WeakSet();
export function sealProject(project) {
  if (project && typeof project === 'object' && !isDraft(project)) sealedProjects.add(project);
}

function timeIndex(project) {
  let ix = timeIndexes.get(project.clips);
  const sealed = sealedProjects.has(project);
  if (ix && ix.primary === project.primary && ix.sealed && sealed) return ix;
  const fp = fingerprint(project);
  if (ix && ix.primary === project.primary && ix.fp === fp) {
    if (sealed) ix.sealed = true;
    return ix;
  }
  const buckets = new Map();
  let solo = false;
  for (const c of Object.values(project.clips)) {
    if (c.solo) solo = true;
    const lead = Math.max(0, c.props?.aLead || 0);
    const tail = Math.max(0, c.props?.aTail || 0);
    // Litt ekstra på hver side for J- og L-kutt, overganger og kryssfade i lyd.
    const a = c.start - Math.max(lead, c.dur) - 1;
    const b = c.start + c.dur + tail + 1;
    for (let k = Math.floor(a / BUCKET); k <= Math.floor(b / BUCKET); k++) {
      let list = buckets.get(k);
      if (!list) buckets.set(k, (list = []));
      list.push(c);
    }
  }
  // Starttidene i hovedsporet, for binærsøk.
  const starts = project.primary.map((id) => project.clips[id]?.start ?? 0);
  ix = { buckets, solo, primary: project.primary, starts, fp, sealed };
  timeIndexes.set(project.clips, ix);
  return ix;
}

// Klippene som kan høres eller synes ved tid T (et utvalg, filtreres videre av den som spør).
export function clipsNear(project, T) {
  return timeIndex(project).buckets.get(Math.floor(T / BUCKET)) || [];
}

export function primaryAt(project, T) {
  const list = project.primary;
  if (!list.length) return null;
  const { starts } = timeIndex(project);
  // Siste klipp som starter før eller ved T.
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= T) lo = mid;
    else hi = mid - 1;
  }
  // En overgang ligger rundt kuttet, så naboene sjekkes også (i samme rekkefølge som før).
  for (let i = Math.max(0, lo - 1); i <= Math.min(list.length - 1, lo + 2); i++) {
    const c = project.clips[list[i]];
    if (!c) continue;
    if (c.transition) {
      const prev = i > 0 ? project.clips[list[i - 1]] : null;
      const [a, b] = transitionWindow(c, Boolean(prev), prev);
      if (T >= a && T < b) return { transition: transitionState(c.transition, a, b, T), a: prev, b: c };
    }
    if (c.transitionOut) {
      const [a, b] = transitionWindow(c, false, null, 'end');
      if (T >= a && T < b) return { transition: transitionState(c.transitionOut, a, b, T), a: c, b: null };
    }
  }
  for (let i = Math.max(0, lo - 1); i <= Math.min(list.length - 1, lo + 1); i++) {
    const c = project.clips[list[i]];
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
  const inherited = new Set();
  const visualSide = (clip, handles = false) => {
    const side = { clip, T }, fg = project.clips[clip.slideshowForeground];
    if (clip.slideshowId) side.slideshowFrame = true;
    if (fg?.slideshowParent === clip.id && fg.enabled && !laneHidden(project, fg.lane) && !fg.transition && !fg.transitionOut &&
      (handles || (T >= fg.start && T < fg.start + fg.dur))) {
      side.companions = [fg]; inherited.add(fg.id);
    }
    return side;
  };
  const primary = primaryAt(project, T);
  if (!laneHidden(project, 0)) {
    const p = primary;
    if (p?.transition) {
      layers.push({
        transition: p.transition,
        a: p.a && p.a.enabled ? visualSide(p.a, true) : null,
        b: p.b?.enabled ? visualSide(p.b, true) : null,
      });
    } else if (p?.clip && p.clip.enabled && p.clip.type !== 'gap') {
      layers.push(visualSide(p.clip));
    }
  }
  const free = [];
  const upper = [];
  // PiP følger hovedklippets overgang, også i håndtakene utenfor selve kuttet.
  // En egen overgang på PiP-klippet kan fortsatt styres uavhengig.
  if (primary?.transition) {
    const byLane = new Map();
    for (const c of Object.values(project.clips)) {
      if (!c.linkedTo || !c.enabled || laneHidden(project, c.lane) || c.transition || c.transitionOut) continue;
      const side = c.linkedTo === primary.a?.id ? 'a' : c.linkedTo === primary.b?.id ? 'b' : null;
      if (!side) continue;
      let layer = byLane.get(c.lane);
      if (!layer) byLane.set(c.lane, layer = { transition: primary.transition, overlay: true, a: null, b: null });
      layer[side] = { clip: c, T };
      inherited.add(c.id);
    }
    for (const [lane, layer] of byLane) upper.push({ lane, start: 0, layer });
  }
  const near = clipsNear(project, T);
  for (const c of near) {
    if (!inherited.has(c.id) && c.lane > 0 && c.lane < CAPTION_LANE && c.enabled && isVisual(c) && T >= c.start && T < c.start + c.dur && !laneHidden(project, c.lane)) {
      free.push(c);
    }
  }
  for (const c of free) {
    const tr = hasFreeTransitions(c) ? freeTransitionAt(c, T) : null;
    // Utgangen er inngangen spilt baklengs, så alle overgangene tegner klippet som B.
    const layer = !tr ? { clip: c, T } : { transition: tr.edge === 'end' ? { ...tr, p: 1 - tr.p } : tr, overlay: true, a: null, b: { clip: c, T } };
    upper.push({ lane: c.lane, start: c.start, layer });
  }
  upper.sort((a, b) => a.lane - b.lane || a.start - b.start);
  layers.push(...upper.map(({ layer }) => layer));

  const caps = [];
  if (captions && !laneHidden(project, CAPTION_LANE)) {
    for (const c of near) {
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
  const solo = timeIndex(project).solo;
  const near = clipsNear(project, T);

  if (!laneMuted(project, 0)) {
    const p = primaryAt(project, T);
    if (p?.transition?.audio) {
      if (p.a) set(p.a, fadeOutGain(p.transition.p), true);
      if (p.b) set(p.b, fadeInGain(p.transition.p), true);
    } else if (p?.transition) {
      // Overgangen gjelder bare bildet: lyden kuttes hardt ved kuttet.
      const c = [p.a, p.b].find((c) => c && T >= c.start && T < c.start + c.dur);
      if (c) set(c, 1);
    } else if (p?.clip) set(p.clip, 1);
  }
  for (const c of near) {
    if (c.lane === CAPTION_LANE || factors.has(c.id)) continue;
    const [a, b] = audioWindow(c);
    const inside = T >= c.start && T < c.start + c.dur;
    if (c.lane !== 0 && inside) {
      const tr = hasFreeTransitions(c) ? freeTransitionAt(c, T) : null;
      set(c, tr?.audio ? (tr.edge === 'end' ? fadeOutGain(tr.p) : fadeInGain(tr.p)) : 1);
    } else if (!inside && T >= a && T < b) set(c, 1);
  }
  for (const c of near) {
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
