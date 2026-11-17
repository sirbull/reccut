// Procedural light leaks. Several soft, warped light bands sweep through the frame; their
// colors are mixed in OKLab. Everything is a pure function of clip time and seed, so a frame
// is identical after seeking, in preview and in export, at any frame rate.
import { hexToOklab, oklabToLinear, toSrgb } from './oklab.js';
import { effectHash } from './stylizeNoise.js';

export const LEAK_DEFAULTS = {
  preset: 'classic', startColor: '#ff6a1a', endColor: '#ff2a3d', transition: 0.3, saturation: 1, variation: 0.15,
  angle: 0, speed: 1, size: 1, softness: 0.75, spread: 0.5, x: 0.5, y: 0.5, organic: 0.5, flicker: 0.05,
  intensity: 0.8, opacity: 1, blend: 'screen', bloom: 0.35, edgeBias: 0.3, seed: 1,
};
const preset = (id, label, p) => ({ id, label, p: { ...LEAK_DEFAULTS, ...p, preset: id } });
export const LEAK_PRESETS = [
  preset('classic', 'Classic Film', {}),
  preset('pastel', 'Pastel Dream', { startColor: '#ff9fd0', endColor: '#8fc8ff', transition: 0.4, saturation: 0.8, variation: 0.35, angle: 20, speed: 0.6, size: 1.3, softness: 0.95, spread: 0.7, organic: 0.6, flicker: 0, intensity: 0.65, blend: 'softLight', bloom: 0.5, edgeBias: 0.1 }),
  preset('golden', 'Golden Hour', { startColor: '#ffb340', endColor: '#ff7a1f', transition: 0.15, variation: 0.08, angle: -25, speed: 0.4, size: 1.25, softness: 0.85, spread: 0.3, organic: 0.35, flicker: 0, intensity: 0.75, bloom: 0.6, edgeBias: 0.15 }),
  preset('neon', 'Neon Nights', { startColor: '#ff2fb4', endColor: '#21e6ff', transition: 0.6, saturation: 1.3, variation: 0.3, angle: 180, speed: 1.4, size: 0.8, softness: 0.55, spread: 0.6, organic: 0.55, flicker: 0.1, intensity: 1.3, blend: 'add', bloom: 0.45, edgeBias: 0.4 }),
  preset('8mm', 'Vintage 8mm', { startColor: '#ff7b2e', endColor: '#ffd36b', transition: 0.5, saturation: 0.85, variation: 0.25, angle: 90, speed: 1.6, size: 0.9, softness: 0.6, spread: 0.45, organic: 0.85, flicker: 0.6, intensity: 1, bloom: 0.25, edgeBias: 0.7 }),
  preset('prism', 'Prism', { startColor: '#ff3b3b', endColor: '#3b6bff', transition: 0.5, saturation: 1.15, variation: 1, angle: 35, speed: 0.8, size: 0.7, softness: 0.65, spread: 0.8, organic: 0.4, flicker: 0, intensity: 1, bloom: 0.4, edgeBias: 0.2 }),
  preset('custom', 'Custom', { startColor: '#ffffff', endColor: '#ffffff', transition: 0, variation: 0, organic: 0, flicker: 0, bloom: 0, edgeBias: 0 }),
];
export const LEAK_BLENDS = [{ value: 'screen', label: 'Screen' }, { value: 'add', label: 'Add' }, { value: 'softLight', label: 'Soft Light' }];
export const LEAK_COMPOSITE = { screen: 'screen', add: 'lighter', softLight: 'soft-light' };
// Light leaks are low-frequency light; the field is computed small and scaled up smoothly.
export const LEAK_FIELD_SIZE = 128;
export const LEAK_TRAVEL = 0.12; // passes per second at Speed 1

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (seed, ...k) => {
  let h = seed >>> 0;
  for (const v of k) h = effectHash((h ^ Math.imul(v | 0, 0x9e3779b1)) >>> 0);
  return (h & 0xffffff) / 0xffffff;
};
// Hot path: one hash per lattice point, no allocation.
const lattice = (x, y, seed) => (effectHash((seed + Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0) & 0xffff) / 0xffff;
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i, t = f * f * (3 - 2 * f), a = lattice(i, 0, seed);
  return a + (lattice(i + 1, 0, seed) - a) * t;
}
function noise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const tx = fx * fx * (3 - 2 * fx), ty = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed), c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a + (d - c - b + a) * tx) * ty;
}
const fbm = (x, y, seed) => noise2(x, y, seed) * 0.65 + noise2(x * 2.1 + 5.3, y * 2.1 + 1.7, seed + 7) * 0.35;

const BLOBS = 5, HOT = [1, 0.95, 0.86];
const SRGB = Uint8ClampedArray.from({ length: 1025 }, (_, i) => toSrgb(i / 1024) * 255 + 0.5);
// p: resolved parameters. t: clip time (s). phase/colorPhase: time integrals of Speed and Color Transition.
// Returns straight (non-premultiplied) RGBA: color is the light, alpha its strength.
export function lightLeakField(p, t, phase, colorPhase, fw, fh) {
  const out = new Uint8ClampedArray(fw * fh * 4);
  const seed = effectHash(Math.round(clamp(p.seed, 0, 9999)) * 7919 + 13);
  const ar = fw / fh, angle = (p.angle * Math.PI) / 180, cos = Math.cos(angle), sin = -Math.sin(angle); // 90° = up
  const extAlong = 0.5 * (Math.abs(cos) * ar + Math.abs(sin)), extAcross = 0.5 * (Math.abs(sin) * ar + Math.abs(cos));
  const size = clamp(p.size, 0.1, 3), spread = clamp(p.spread), organic = clamp(p.organic), soft = 0.08 + 0.92 * clamp(p.softness);
  const bloom = clamp(p.bloom), edge = clamp(p.edgeBias), variation = clamp(p.variation), flicker = clamp(p.flicker);
  const A = hexToOklab(p.startColor), B = hexToOklab(p.endColor), sat = clamp(p.saturation, 0, 2);
  const glow = 1 - flicker * 0.45 * noise1(t * 11, seed + 3);
  // Per-band state for this frame. Each pass gets a new random layout; the envelope hides the respawn.
  const blobs = Array.from({ length: BLOBS }, (_, i) => {
    const cycle = phase * (0.65 + 0.7 * rand(seed, i, 1)) + rand(seed, i, 2), gen = Math.floor(cycle), f = cycle - gen;
    const g = (k) => rand(seed, i, gen, k);
    const ra = size * 0.32 * (0.7 + 0.6 * g(3)), rc = size * (0.45 + 0.8 * spread) * (0.7 + 0.6 * g(4));
    const wander = (k) => (noise1(t * 0.13 + phase * 0.35 + i * 17.3 + k, seed + 11) - 0.5) * 2 * organic;
    let across = (g(1) - 0.5) * (0.3 + 1.5 * spread) * extAcross;
    across += ((across < 0 ? -1 : 1) * extAcross * 0.92 - across) * edge;
    const hue = variation * (Math.PI * 0.9 * (i / (BLOBS - 1) - 0.5) * 2 + (g(6) - 0.5) * 0.8);
    return {
      along: -(extAlong + ra) + f * 2 * (extAlong + ra) + wander(0) * 0.12, across: across + wander(5) * 0.22,
      ra: ra * (1 + wander(9) * 0.2), rc: rc * (1 + wander(13) * 0.25),
      weight: Math.sin(Math.PI * f) ** 0.7 * (0.5 + 0.5 * g(5)) * glow * (1 - flicker * 0.35 * noise1(t * 7.3 + i * 31.7, seed + 5)),
      cosH: Math.cos(hue), sinH: Math.sin(hue), shift: g(7),
    };
  });
  const colorCore = colorPhase * 0.25, warpAmount = 0.06 + organic * 0.32, wt = t * 0.05 + phase * 0.25;
  const intensity = Math.max(0, p.intensity);
  const reach = bloom > 0 ? 30 : 6;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const px = (x + 0.5) / fw, py = (y + 0.5) / fh;
    let qx = (px - p.x) * ar, qy = py - p.y;
    const n1 = fbm(qx * 1.4 + 11, qy * 1.4 + wt, seed + 21), n2 = fbm(qx * 1.4 + wt, qy * 1.4 + 47, seed + 31);
    qx += (n1 - 0.5) * warpAmount; qy += (n2 - 0.5) * warpAmount;
    const along = qx * cos + qy * sin, across = -qx * sin + qy * cos;
    const edgeMask = 1 - edge * 0.85 * (1 - smooth(0.2, 0.95, Math.max(Math.abs(px - 0.5), Math.abs(py - 0.5)) * 2));
    let S = 0, L = 0, a = 0, b = 0;
    for (const o of blobs) {
      if (o.weight <= 0.001) continue;
      const da = (along - o.along) / o.ra, dc = (across - o.across) / o.rc, d2 = da * da + dc * dc;
      if (d2 > reach) continue;
      const d = Math.sqrt(d2);
      const core = 1 - smooth(1 - soft, 1, d), diffuse = Math.exp(-1.8 * d2);
      const st = ((core + (diffuse - core) * soft * 0.6) + Math.exp(-d2 / 4.8) * bloom * 0.35) * o.weight * edgeMask;
      if (st <= 1e-4) continue;
      // Core in the current color; the gradient runs across each band, so bands overlap in several tones.
      const ct = 0.5 - 0.5 * Math.cos(Math.PI * (colorCore + o.shift * variation) + da * 0.9 + (n1 - 0.5) * variation * 2);
      const l = A[0] + (B[0] - A[0]) * ct, ca = A[1] + (B[1] - A[1]) * ct, cb = A[2] + (B[2] - A[2]) * ct;
      S += st; L += l * st; a += (ca * o.cosH - cb * o.sinH) * st; b += (ca * o.sinH + cb * o.cosH) * st;
    }
    const i = (y * fw + x) * 4;
    if (S <= 1e-4) continue;
    const k = S * intensity;
    const c = oklabToLinear(Math.max(0.35, L / S), (a / S) * sat, (b / S) * sat);
    const max = Math.max(c[0], c[1], c[2], 1e-4), hot = smooth(0.7, 2.4, k) * 0.55; // hot cores burn toward warm white
    for (let j = 0; j < 3; j++) { const v = Math.max(0, c[j]) / max; out[i + j] = SRGB[((v + (HOT[j] - v) * hot) * 1024) | 0]; }
    out[i + 3] = (1 - Math.exp(-k * 1.4)) * 255;
  }
  return out;
}

export function leakFieldSize(w, h) {
  const k = LEAK_FIELD_SIZE / Math.max(w, h);
  return [Math.max(8, Math.round(w * k)), Math.max(8, Math.round(h * k))];
}

// Values that differ from the chosen preset turn it into a custom variant; the preset itself never changes.
export const leakModified = (p, presets = LEAK_PRESETS) => {
  const base = presets.find((x) => x.id === p.preset);
  return !base || Object.keys(LEAK_DEFAULTS).some((key) => key !== 'preset' && p[key] !== base.p[key]);
};
