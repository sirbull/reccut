// Ordered source effects, shared by preview and export. Existing clip effects follow this stack.
export const VIDEO_EFFECTS = [
  {
    type: 'chroma',
    label: 'Color key',
    defaults: {
      color: '#00b140',
      similarity: 0.12,
      softness: 0.12,
      despill: 0.7,
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
    label: 'Background reference key',
    defaults: {
      similarity: 0.08,
      softness: 0.12,
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
export function makeVideoEffect(type) {
  const def = VIDEO_EFFECTS.find((e) => e.type === type);
  if (!def) throw new Error(`Unknown video effect: ${type}`);
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
    type,
    on: true,
    p: { ...def.defaults },
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
  a = clamp((a - p.black) / Math.max(0.001, p.white - p.black));
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
    alpha[i] = (keyAlpha(c, effect, ref) * data[i * 4 + 3]) / 255;
    if (effect.type === 'chroma') removeSpill(c, effect).forEach((v, j) => (out[i * 4 + j] = v * 255));
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
