import { effectHash } from './stylizeNoise.js';
import { analogPixels } from './analog.js';
export { effectHash } from './stylizeNoise.js';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const number = (v, fallback, a = 0, b = 1) => clamp(Number.isFinite(v) ? v : fallback, a, b);
export function stylizeSettings(type, p, time, w, h, scale = 1) {
  const speed = number(p.speed, 1, 0, 5);
  const clock = Math.max(0, Number.isFinite(time) ? time : 0) * speed;
  const frame = Math.floor(clock * 30 + 1e-6);
  const seed = effectHash((frame + Math.imul(Math.round(number(p.seed, 1, 0, 9999)), 1013)) >>> 0);
  const angle = number(p.angle, 0, -180, 180) * Math.PI / 180;
  const amount = number(p.amount, 0);
  const distance = amount * Math.min(w, h) * 0.04;
  return { type, amount, seed, time: clock, size: Math.max(1, Math.round(number(p.size, 1, 1, 12) * scale)),
    bands: Math.round(number(p.bands, 24, 2, 80)), split: number(p.split, 0.5), colored: Boolean(p.colored),
    noise: number(p.noise, 0.25), scanlines: number(p.scanlines, 0.3), spacing: Math.max(2, Math.round(number(p.spacing, 4, 2, 24) * scale)),
    dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance,
    baseSeed: effectHash(Math.round(number(p.seed, 1, 0, 9999)) * 1013),
    softness: number(p.softness, 0.65), bleed: number(p.bleed, 0.55), tracking: number(p.tracking, 0.28), fade: number(p.fade, 0.25),
    filmSize: number(p.size, 1.3, 0.5, 5), roughness: number(p.roughness, 0.65), color: number(p.color, 0.12), tonal: number(p.tonal, 0.7),
    dust: number(p.dust, 0), scratches: number(p.scratches, 0), weave: number(p.weave, 0), flicker: number(p.flicker, 0),
    falloff: number(p.falloff, 2.2, 0.5, 5), centerX: number(p.centerX, 0.5), centerY: number(p.centerY, 0.5) };
}
const random = (n) => (effectHash(n >>> 0) & 65535) / 65535;
// CPU fallback and render reference. All sampling clamps to the source edges.
export function stylizePixels(data, w, h, s) {
  if (['vhs', 'filmGrain', 'chromatic'].includes(s.type)) return analogPixels(data, w, h, s);
  const out = new Uint8ClampedArray(data.length);
  const sample = (x, y, channel) => data[(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4 + channel];
  for (let y = 0; y < h; y++) {
    let shift = 0, split = 0;
    if (s.type === 'glitch') {
      const band = Math.floor(y / h * s.bands);
      if (random(s.seed + band * 1973) < s.amount) {
        shift = Math.round((random(s.seed + band * 9277 + 19) - 0.5) * s.amount * w * 0.18);
        split = Math.round(s.split * s.amount * w * 0.02);
      }
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = sample(x + shift + split, y, 0), g = sample(x + shift, y, 1), b = sample(x + shift - split, y, 2);
      if (s.type === 'rgbSplit') {
        const bilinear = (xx, yy, channel) => {
          const ix = Math.floor(xx), iy = Math.floor(yy), fx = xx - ix, fy = yy - iy;
          return (sample(ix, iy, channel) * (1 - fx) + sample(ix + 1, iy, channel) * fx) * (1 - fy) +
            (sample(ix, iy + 1, channel) * (1 - fx) + sample(ix + 1, iy + 1, channel) * fx) * fy;
        };
        r = bilinear(x + s.dx, y + s.dy, 0); b = bilinear(x - s.dx, y - s.dy, 2);
      }
      const n = (s.seed + Math.imul(Math.floor(x / s.size), 374761393) + Math.imul(Math.floor(y / s.size), 668265263)) >>> 0;
      if (s.type === 'noise') {
        const grain = (random(n) - 0.5) * s.amount * 160;
        r += grain;
        g += s.colored ? (random(n + 17) - 0.5) * s.amount * 160 : grain;
        b += s.colored ? (random(n + 37) - 0.5) * s.amount * 160 : grain;
      } else if (s.type === 'scanlines') {
        const brightness = 1 - s.amount * (y % s.spacing < Math.ceil(s.spacing / 2) ? 1 : 0);
        r *= brightness; g *= brightness; b *= brightness;
      }
      out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = data[i + 3];
    }
  }
  return out;
}
