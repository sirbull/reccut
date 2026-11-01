// Analog-inspired image formation, shared reference for the GPU and CPU paths.
// Luma/chroma filtering is intentionally separate: tape color is much softer
// than luminance. Film grain is spatially correlated and exposure-dependent.
import { effectHash } from './stylizeNoise.js';
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a + (b - a) * t;
const fract = (v) => v - Math.floor(v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const random = (v) => (effectHash(v >>> 0) & 65535) / 65535;
const fieldHash = (x, y, seed) => (seed + Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
const gaussian = (x, y, seed) => {
  const n = fieldHash(x, y, seed);
  return (random(n) + random(n + 7919) + random(n + 15401) - 1.5) * 1.6;
};
function grainField(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fract(x), fy = fract(y), tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
  return mix(mix(gaussian(ix, iy, seed), gaussian(ix + 1, iy, seed), tx),
    mix(gaussian(ix, iy + 1, seed), gaussian(ix + 1, iy + 1, seed), tx), ty);
}
export function filmTexture(x, y, s, salt = 0) {
  const seed = (s.seed + salt) >>> 0;
  // Two irregular scales keep enlarged grains rounded rather than square.
  return grainField(x / s.filmSize, y / s.filmSize, seed) * (1 - s.roughness * 0.35) +
    grainField(x / (s.filmSize * 0.57) + 73.2, y / (s.filmSize * 0.57) + 19.7, seed + 101) * s.roughness * 0.65;
}
export function tapeLine(y, h, s) {
  const v = (y + 0.5) / h, row = Math.floor((2 * y + 1) * 240 / h);
  const event = Math.floor(s.time * 1.2), phase = fract(s.time * 1.2);
  const eventSeed = effectHash((s.baseSeed + Math.imul(event, 92821)) >>> 0);
  const envelope = random(eventSeed) < s.tracking * 0.85
    ? smooth(0, 0.025, phase) * (1 - smooth(0.12, 0.32, phase)) : 0;
  const center = 0.12 + random(eventSeed + 17) * 0.74;
  const band = Math.exp(-(((v - center) / 0.045) ** 2)) * envelope;
  const head = smooth(0.965, 0.995, v);
  const lineNoise = random(s.seed + row * 1973) - 0.5;
  const shift = s.amount * (Math.sin(v * 5.7 + s.time * 1.9) * 0.00045 + lineNoise * 0.00045) +
    band * s.tracking * (0.008 + Math.sin(v * 143 + s.time * 9) * 0.014) +
    head * s.amount * (0.0015 + lineNoise * 0.005);
  return { shift, band, head, row, lineNoise };
}
function dropoutRows(y) {
  const row = Math.floor(y), rows = [];
  let total = 0;
  for (let k = -2; k <= 2; k++) {
    const weight = Math.exp(-0.5 * ((y - (row + k + 0.5)) / 0.65) ** 2);
    rows.push([row + k, weight]); total += weight;
  }
  return rows.map(([r, weight]) => [r, weight / total]);
}
// Blur only the white dropout mask in tape-signal coordinates. The footage and
// other noise keep their existing softness, and the blur scales with resolution.
export function tapeDropout(x, y, s, head = 0, band = 0, rows = dropoutRows(y)) {
  const threshold = 1 - s.amount * (0.0005 + head * 0.025 + band * 0.012);
  let value = 0;
  for (const [row, vertical] of rows) for (let k = -1; k <= 1; k++) {
    const at = (x + k * 0.8) / 14, cell = Math.floor(at), within = fract(at);
    if (random(fieldHash(cell, row, s.seed + 461)) > threshold) {
      const profile = smooth(0, 0.15, within) * (1 - smooth(0.55, 1, within));
      value += profile * vertical * (k === 0 ? 0.6 : 0.2);
    }
  }
  return value;
}
// Bilinear, subpixel sampling is needed for optics and the small drift of tape.
export function pixelSampler(data, w, h) {
  return (x, y, channel) => {
    x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1);
    const xx = Math.floor(x), yy = Math.floor(y), fx = x - xx, fy = y - yy;
    const right = Math.min(xx + 1, w - 1), bottom = Math.min(yy + 1, h - 1);
    return mix(mix(data[(yy * w + xx) * 4 + channel], data[(yy * w + right) * 4 + channel], fx),
      mix(data[(bottom * w + xx) * 4 + channel], data[(bottom * w + right) * 4 + channel], fx), fy) / 255;
  };
}
export function analogPixels(data, w, h, s, signal = data, sw = w, sh = h) {
  const out = new Uint8ClampedArray(data.length), sample = pixelSampler(signal, sw, sh);
  const read = (x, y) => [0, 1, 2].map((c) => sample((x + 0.5) * sw / w - 0.5, (y + 0.5) * sh / h - 0.5, c));
  let readTape;
  if (s.type === 'vhs') {
    // Transform once, then filter scalar signal planes. This avoids allocating
    // RGB/YIQ arrays and recalculating three channels for every low-pass tap.
    const planes = new Float32Array(signal.length);
    for (let i = 0; i < signal.length; i += 4) {
      const r = signal[i], g = signal[i + 1], b = signal[i + 2];
      planes[i] = r * 0.299 + g * 0.587 + b * 0.114;
      planes[i + 1] = r * 0.596 - g * 0.274 - b * 0.322;
      planes[i + 2] = r * 0.211 - g * 0.523 + b * 0.312;
    }
    const planeSample = pixelSampler(planes, sw, sh);
    readTape = (x, y, channel) => planeSample((x + 0.5) * sw / w - 0.5, (y + 0.5) * sh / h - 0.5, channel);
  }
  const lumaRadius = (0.4 + s.softness * 1.7) * w / 720;
  const chromaRadius = (1.5 + s.bleed * 8) * w / 720;
  const lumaWeights = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136];
  for (let y = 0; y < h; y++) {
    const line = s.type === 'vhs' ? tapeLine(y, h, s) : null;
    const dropRows = line ? dropoutRows((y + 0.5) * 480 / h) : null;
    for (let x = 0; x < w; x++) {
      const offset = (y * w + x) * 4;
      let c;
      if (s.type === 'vhs') {
        const px = x + line.shift * w;
        // Field sampling and a small vertical low-pass soften HD footage globally.
        const py = y + (random(s.seed + line.row * 13) - 0.5) * s.amount * h / 480 * 0.15;
        const original = [readTape(px, py, 0), readTape(px, py, 1), readTape(px, py, 2)];
        let luma = 0, ci = 0, cq = 0;
        for (let k = -2; k <= 2; k++) luma += readTape(px + k * lumaRadius, py, 0) * lumaWeights[k + 2];
        luma = mix(original[0], luma, s.softness);
        const vertical = (readTape(px, py - h / 480, 0) + readTape(px, py + h / 480, 0)) * 0.5;
        luma = mix(luma, vertical, s.softness * 0.12);
        for (let k = -3; k <= 3; k++) {
          const sampleX = px - (1 + s.split * 4) * w / 720 + k * chromaRadius;
          const weight = k === 0 ? 0.28 : Math.abs(k) === 1 ? 0.22 : Math.abs(k) === 2 ? 0.11 : 0.03;
          ci += readTape(sampleX, py, 1) * weight; cq += readTape(sampleX, py, 2) * weight;
        }
        ci = mix(original[1], ci, s.bleed); cq = mix(original[2], cq, s.bleed);
        const n = fieldHash(Math.floor((2 * x + 1) * 360 / w), line.row, s.seed);
        const grain = (random(n) + random(n + 7919) - 1) * s.noise * 0.065;
        const chromaNoise = (random(fieldHash(Math.floor(x * 120 / w), Math.floor(line.row / 2), s.seed)) - 0.5) * s.noise * 0.035;
        ci += chromaNoise; cq -= chromaNoise * 0.6;
        const streak = tapeDropout((x + 0.5) * 720 / w, (y + 0.5) * 480 / h, s, line.head, line.band, dropRows);
        luma = luma * (1 - s.fade * 0.1) + s.fade * 0.025 + grain + streak * 0.5;
        luma *= 1 - s.scanlines * (0.5 + 0.5 * Math.cos((y + 0.5) / h * 480 * Math.PI)) * 0.12;
        const sat = 1 - s.fade * 0.25;
        c = [luma + (0.956 * ci + 0.621 * cq) * sat,
          luma + (-0.272 * ci - 0.647 * cq) * sat, luma + (-1.106 * ci + 1.703 * cq) * sat];
      } else if (s.type === 'chromatic') {
        const ux = (x + 0.5) / w - s.centerX, uy = (y + 0.5) / h - s.centerY;
        const radius = Math.hypot(ux, uy) * Math.SQRT2;
        const factor = s.amount * 0.012 * Math.pow(radius, s.falloff);
        c = [read(x + ux * factor * w, y + uy * factor * h)[0], read(x, y)[1], read(x - ux * factor * w, y - uy * factor * h)[2]];
      } else {
        const weaveX = (random(s.seed + 31) - 0.5) * s.weave * w / 640;
        const weaveY = (random(s.seed + 47) - 0.5) * s.weave * h / 360;
        c = read(x + weaveX, y + weaveY);
        const luminance = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
        const tone = mix(1, 0.1 + 0.9 * Math.sqrt(Math.max(0, 4 * luminance * (1 - luminance))), s.tonal);
        const gx = (x + 0.5) * 1080 / h, gy = (y + 0.5) * 1080 / h;
        const grain = filmTexture(gx, gy, s), amp = s.amount * 0.12 * tone;
        for (let j = 0; j < 3; j++) c[j] = c[j] * (1 + (random(s.seed + 91) - 0.5) * s.flicker * 0.1) +
          mix(grain, s.color > 0 ? filmTexture(gx, gy, s, j * 1931 + 937) : grain, s.color * 0.65) * amp;
        // Damage is optional and independent of grain. Clean 35mm has no overlay scratches.
        for (let k = 0; k < 3 && (s.dust > 0 || s.scratches > 0); k++) {
          const n = (s.seed + k * 2939) >>> 0;
          const ux = (x + 0.5) / w, uy = (y + 0.5) / h;
          const cx = random(n + 17), cy = random(n + 37);
          const dx = (ux - cx) / (0.0007 + random(n + 51) * 0.0025) * w / h;
          const dy = (uy - cy) / (0.001 + random(n + 67) * 0.003);
          const dirt = random(n + 79) < s.dust ? Math.exp(-(dx * dx + dy * dy) * 1.6) * 0.65 : 0;
          const scratch = random(n + 111) < s.scratches * 0.25
            ? Math.max(0, 1 - Math.abs(ux - cx - Math.sin(uy * 14 + s.time) * 0.0002) * w / 0.7) * 0.4 : 0;
          c = c.map((v) => v * (1 - dirt) + scratch);
        }
      }
      for (let j = 0; j < 3; j++) out[offset + j] = clamp(c[j]) * 255;
      out[offset + 3] = data[offset + 3];
    }
  }
  return out;
}
