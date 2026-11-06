import { DEFAULT_GRADIENT } from './gradient.js';
const TAPE_DEFAULTS = { amount: 0.55, softness: 0.65, bleed: 0.55, noise: 0.18, tracking: 0.28, split: 0.2, scanlines: 0.08, fade: 0.25, speed: 1, seed: 1 };
const FILM_DEFAULTS = { amount: 0.28, size: 1.3, roughness: 0.65, color: 0.12, tonal: 0.7, dust: 0, scratches: 0, weave: 0, flicker: 0, speed: 1, seed: 1 };

// Ordered source effects, shared by preview and export. Existing clip effects follow this stack.
export const VIDEO_EFFECTS = [
  { type: 'solid', label: 'Solid color', category: 'Color fills', defaults: { color: '#487cff', amount: 1, preserveAlpha: false } },
  { type: 'gradient', label: 'Gradient ramp', category: 'Color fills', defaults: { ...DEFAULT_GRADIENT, amount: 1, preserveAlpha: false } },
  { type: 'noise', label: 'Digital noise', category: 'Stylize', defaults: { amount: 0.2, size: 1, speed: 1, seed: 1, colored: false }, controls: [
    ['amount', 'Amount', 0, 1], ['size', 'Noise size (px)', 1, 12, 1], ['speed', 'Speed', 0, 5], ['seed', 'Seed', 0, 9999, 1], ['colored', 'Color noise'],
  ] },
  { type: 'filmGrain', label: 'Film grain', category: 'Stylize', defaults: FILM_DEFAULTS, presets: [
    { id: '35mm', label: '35mm · fine grain', p: { ...FILM_DEFAULTS, amount: 0.22, size: 1 } },
    { id: '16mm', label: '16mm · textured', p: { ...FILM_DEFAULTS, amount: 0.42, size: 1.8, roughness: 0.8 } },
    { id: '8mm', label: '8mm · aged film', p: { ...FILM_DEFAULTS, amount: 0.6, size: 2.5, roughness: 0.8, dust: 0.12, scratches: 0.08, weave: 0.25, flicker: 0.15 } },
  ], controls: [
    ['amount', 'Amount', 0, 1], ['size', 'Grain size', 0.5, 5, 0.1], ['roughness', 'Roughness', 0, 1], ['color', 'Color grain', 0, 1], ['tonal', 'Tonal response', 0, 1],
  ], advancedControls: [
    ['dust', 'Dust', 0, 1], ['scratches', 'Scratches', 0, 1], ['weave', 'Gate weave', 0, 1], ['flicker', 'Exposure flicker', 0, 1], ['speed', 'Speed', 0, 5], ['seed', 'Seed', 0, 9999, 1],
  ] },
  { type: 'glitch', label: 'Digital glitch', category: 'Stylize', defaults: { amount: 0.35, bands: 24, split: 0.5, speed: 1, seed: 1 }, controls: [
    ['amount', 'Amount', 0, 1], ['bands', 'Bands', 2, 80, 1], ['split', 'RGB split', 0, 1], ['speed', 'Speed', 0, 5], ['seed', 'Seed', 0, 9999, 1],
  ] },
  { type: 'vhs', label: 'VHS / analog tape', category: 'Stylize', defaults: TAPE_DEFAULTS, presets: [
    { id: 'sp', label: 'SP · clean tape', p: { ...TAPE_DEFAULTS, amount: 0.25, softness: 0.45, bleed: 0.35, noise: 0.08, tracking: 0.1, split: 0.1, fade: 0.15 } },
    { id: 'lp', label: 'LP · home video', p: { ...TAPE_DEFAULTS } },
    { id: 'ep', label: 'EP · worn tape', p: { ...TAPE_DEFAULTS, amount: 0.85, softness: 0.9, bleed: 0.85, noise: 0.4, tracking: 0.65, split: 0.4, fade: 0.4 } },
  ], controls: [
    ['amount', 'Tape wear', 0, 1], ['softness', 'Picture softness', 0, 1], ['bleed', 'Color bleed', 0, 1], ['noise', 'Static noise', 0, 1], ['tracking', 'Tracking faults', 0, 1],
  ], advancedControls: [
    ['split', 'Chroma delay', 0, 1], ['scanlines', 'Scanlines', 0, 1], ['fade', 'Faded color', 0, 1], ['speed', 'Speed', 0, 5], ['seed', 'Seed', 0, 9999, 1],
  ] },
  { type: 'rgbSplit', label: 'RGB split', category: 'Stylize', defaults: { amount: 0.12, angle: 0 }, controls: [
    ['amount', 'Separation', 0, 1], ['angle', 'Angle (°)', -180, 180, 1],
  ] },
  { type: 'chromatic', label: 'Chromatic aberration', category: 'Stylize', defaults: { amount: 0.3, falloff: 2.2, centerX: 0.5, centerY: 0.5 }, controls: [
    ['amount', 'Amount', 0, 1], ['falloff', 'Edge falloff', 0.5, 5, 0.1],
  ], advancedControls: [['centerX', 'Lens center X', 0, 1], ['centerY', 'Lens center Y', 0, 1]] },
  { type: 'scanlines', label: 'Scanlines', category: 'Stylize', defaults: { amount: 0.3, spacing: 4 }, controls: [
    ['amount', 'Amount', 0, 1], ['spacing', 'Spacing (px)', 2, 24, 1],
  ] },
  { type: 'glow', label: 'Glow / bloom', category: 'Stylize', defaults: { amount: 0.35, radius: 12 }, controls: [
    ['amount', 'Amount', 0, 1], ['radius', 'Radius (px)', 1, 100, 1],
  ] },
  {
    type: 'chroma',
    label: 'Color key',
    defaults: {
      color: '#00b140',
      similarity: 0.12,
      softness: 0.12,
      despill: 0.7,
      motionBlur: 0,
      detail: 0,
      shadows: 0,
      shadowRange: 0.25,
      edgeColor: 0,
      gamma: 1,
      black: 0,
      white: 1,
      choke: 0,
      feather: 0,
      invert: false,
      view: 'result',
    },
  },
  {
    type: 'difference',
    adjustment: false,
    label: 'Background reference key',
    defaults: {
      similarity: 0.08,
      softness: 0.12,
      gamma: 1,
      black: 0,
      white: 1,
      choke: 0,
      feather: 0,
      invert: false,
      view: 'result',
    },
  },
  {
    type: 'luma',
    label: 'Luma key',
    defaults: {
      similarity: 0.08,
      softness: 0.12,
      gamma: 1,
      black: 0,
      white: 1,
      choke: 0,
      feather: 0,
      invert: false,
      view: 'result',
    },
  },
  { type: 'blur', label: 'Blur', defaults: { amount: 4 } },
  { type: 'saturation', label: 'Saturation', defaults: { amount: 1 } },
  { type: 'contrast', label: 'Contrast', defaults: { amount: 1 } },
  { type: 'opacity', label: 'Opacity', defaults: { amount: 1 } },
];
export const BROWSER_VIDEO_EFFECTS = VIDEO_EFFECTS.filter((e) => e.category);
export function makeVideoEffect(type) {
  const def = VIDEO_EFFECTS.find((e) => e.type === type);
  if (!def) throw new Error(`Unknown video effect: ${type}`);
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    type,
    on: true,
    p: structuredClone(def.defaults),
  };
}
export function effectParams(effect) {
  return { ...VIDEO_EFFECTS.find((d) => d.type === effect.type)?.defaults, ...effect.p };
}
export const activeVideoEffects = (clip, target = 'main') =>
  (clip.props?.vfx || []).filter(
    (e) => e.on !== false && (!e.target || e.target === target) && VIDEO_EFFECTS.some((d) => d.type === e.type),
  );
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const rgb = (hex) =>
  /^#[0-9a-f]{6}$/i.test(hex || '') ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) : [0, 1, 0];
const smooth = (a, b, x) => {
  const t = clamp((x - a) / Math.max(0.0001, b - a));
  return t * t * (3 - 2 * t);
};
const chroma = (c) => [-0.168736 * c[0] - 0.331264 * c[1] + 0.5 * c[2], 0.5 * c[0] - 0.418688 * c[1] - 0.081312 * c[2]];
function screenShadow(c, p) {
  const key = rgb(p.color), brightness = Math.max(...c), screenBrightness = Math.max(...key);
  const hueDistance = Math.hypot(...c.map((v, i) => v / Math.max(0.001, brightness) - key[i] / Math.max(0.001, screenBrightness))) / Math.sqrt(3);
  return {
    coverage: clamp(1 - brightness / Math.max(0.001, screenBrightness)),
    weight: (1 - smooth(p.shadowRange, p.shadowRange + 0.1, hueDistance)) * clamp(p.shadows),
  };
}
export function keyAlpha(c, effect, reference = null) {
  const p = effectParams(effect);
  if (effect.type === 'difference' && !reference) return 1;
  let distance;
  if (effect.type === 'luma') distance = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  else if (effect.type === 'difference') distance = Math.hypot(...c.map((v, i) => v - reference[i])) / Math.sqrt(3);
  else {
    const a = chroma(c),
      b = chroma(rgb(p.color));
    distance = Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
  let a = smooth(p.similarity, p.similarity + Math.max(0.0001, p.softness), distance);
  if (effect.type === 'chroma' && (p.detail > 0 || p.shadows > 0 || p.motionBlur > 0)) {
    const key = rgb(p.color);
    const channel = key.indexOf(Math.max(...key));
    const others = [0, 1, 2].filter((i) => i !== channel);
    const excess = (v) => Math.max(0, v[channel] - Math.max(v[others[0]], v[others[1]]));
    // Recover fractional coverage in dark hair mixed with the screen color.
    const detail = excess(key) > 0.001 ? clamp(1 - excess(c) / excess(key)) : 0;
    a = Math.max(a, detail * clamp(p.detail));
    // Motion blur: a blurred edge is a linear mix of subject and screen. The colour difference matte
    // follows that mix, so the edge stays translucent instead of turning opaque too early.
    if (excess(key) > 0.001) a -= (a - Math.min(a, 1 - clamp(excess(c) / excess(key)))) * clamp(p.motionBlur);
    // Darker screen-colored pixels become translucent shadows rather than opaque screen patches.
    const shadow = p.shadows > 0 ? screenShadow(c, p) : { coverage: 0, weight: 0 };
    a += (shadow.coverage - a) * shadow.weight;
  }
  a = clamp((a - p.black) / Math.max(0.001, p.white - p.black));
  a = Math.pow(a, 1 / Math.max(0.1, p.gamma));
  return p.invert ? 1 - a : a;
}
export function removeSpill(c, effect) {
  const p = effectParams(effect),
    key = rgb(p.color);
  const channel = key.indexOf(Math.max(...key));
  const other = [0, 1, 2].filter((i) => i !== channel);
  const neutral = Math.max(c[other[0]], c[other[1]]);
  const out = [...c];
  out[channel] -= Math.max(0, c[channel] - neutral) * clamp(p.despill || 0);
  return out;
}
// Dominant border color: robust against an actor in the middle and isolated noisy pixels.
export function sampleScreenColor(data, width, height) {
  const bins = new Map();
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 64)))
    for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) {
      if (x > width * 0.12 && x < width * 0.88 && y > height * 0.12 && y < height * 0.88) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 128) continue;
      const c = [data[i], data[i + 1], data[i + 2]];
      const bin = c.map((v) => v >> 5).join(',');
      const b = bins.get(bin) || { n: 0, sum: [0, 0, 0] };
      b.n++;
      c.forEach((v, j) => (b.sum[j] += v));
      bins.set(bin, b);
    }
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0];
  if (!best) throw new Error('No opaque background pixels to sample.');
  return (
    '#' +
    best.sum
      .map((s) =>
        Math.round(s / best.n)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

// CPU reference and fallback. Spatial filtering only; no temporal history or trailing ghosts.
export function keyPixels(data, width, height, effect, reference = null) {
  const p = effectParams(effect),
    n = width * height;
  const alpha = new Float32Array(n);
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < n; i++) {
    const c = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]].map((v) => v / 255);
    const ref = reference && [reference[i * 4], reference[i * 4 + 1], reference[i * 4 + 2]].map((v) => v / 255);
    const coverage = keyAlpha(c, effect, ref);
    alpha[i] = (coverage * data[i * 4 + 3]) / 255;
    if (effect.type === 'chroma') {
      const key = rgb(p.color);
      const shadow = p.shadows > 0 ? screenShadow(c, p) : { weight: 0 };
      const amount = Math.max(clamp(p.edgeColor), clamp(p.motionBlur), shadow.weight);
      const restored = c.map((v, j) => v + (clamp((v - (1 - coverage) * key[j]) / Math.max(0.01, coverage)) - v) * amount);
      removeSpill(restored, effect).forEach((v, j) => (out[i * 4 + j] = v * 255));
    }
  }
  let matte = alpha;
  const spatial = (src, radius, kind) => {
    if (!radius) return src;
    // Separable square erosion/dilation/box feather: bounded work at CPU fallback resolutions.
    let a = src;
    for (const horizontal of [true, false]) {
      const b = new Float32Array(n);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          let v = kind === 'min' ? 1 : 0;
          for (let k = -radius; k <= radius; k++) {
            const xx = horizontal ? clamp(x + k, 0, width - 1) : x;
            const yy = horizontal ? y : clamp(y + k, 0, height - 1);
            const q = a[yy * width + xx];
            v = kind === 'min' ? Math.min(v, q) : kind === 'max' ? Math.max(v, q) : v + q / (2 * radius + 1);
          }
          b[y * width + x] = v;
        }
      a = b;
    }
    return a;
  };
  matte = spatial(matte, Math.min(8, Math.round(Math.abs(p.choke || 0))), p.choke > 0 ? 'min' : 'max');
  matte = spatial(matte, Math.min(8, Math.round(p.feather || 0)), 'mean');
  for (let i = 0; i < n; i++) {
    const a = matte[i];
    if (p.view === 'matte') {
      out.fill(Math.round(a * 255), i * 4, i * 4 + 3);
      out[i * 4 + 3] = 255;
    } else out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}

// A temporal median estimates a clean plate where the subject moves out of each pixel
// in most samples. This is background estimation for a locked camera, not person segmentation.
export function estimateBackground(frames) {
  const first = frames[0];
  if (frames.length < 3 || !first || frames.some((f) => f.width !== first.width || f.height !== first.height))
    throw new Error('Background analysis needs matching source frames.');
  const out = new Uint8ClampedArray(first.width * first.height * 4);
  const values = new Uint8Array(frames.length);
  for (let i = 0; i < out.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      for (let k = 0; k < frames.length; k++) values[k] = frames[k].data[i + channel];
      values.sort();
      out[i + channel] = values[Math.floor(values.length / 2)];
    }
    out[i + 3] = 255;
  }
  return { width: first.width, height: first.height, data: out };
}
