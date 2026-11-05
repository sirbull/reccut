// Layer colour corrections. Legacy image filter values retain their original units.
export const CURVE_CHANNELS = ['rgb', 'red', 'green', 'blue'];
export const MAX_CURVE_POINTS = 16;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const bounded = (v, lo, hi) => Number.isFinite(v) ? clamp(v, lo, hi) : 0;
export function normalizeDesignCurve(value) {
  const points = (Array.isArray(value) ? value : []).slice(0, MAX_CURVE_POINTS)
    .filter(p => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite))
    .map(([x, y]) => [clamp(x), clamp(y)]).sort((a, b) => a[0] - b[0]);
  const unique = points.filter((p, i) => !i || p[0] - points[i - 1][0] >= 1 / 255);
  if (unique.length < 2) return [[0, 0], [1, 1]];
  unique[0][0] = 0; unique.at(-1)[0] = 1;
  return unique;
}
export function normalizeDesignAdjustments(value = {}) {
  const a = value && typeof value === 'object' ? value : {};
  return {
    enabled: a.enabled !== false,
    exposure: bounded(a.exposure, -4, 4), brightness: bounded(a.brightness, -1, 1),
    contrast: bounded(a.contrast, -1, 1), highlights: bounded(a.highlights, -1, 1), shadows: bounded(a.shadows, -1, 1),
    saturation: bounded(a.saturation, -1, 2), hue: bounded(a.hue, -180, 180),
    temperature: bounded(a.temperature, -1, 1), tint: bounded(a.tint, -1, 1),
    blur: bounded(a.blur, 0, 500), grayscale: bounded(a.grayscale, 0, 1),
    curves: Object.fromEntries(CURVE_CHANNELS.map(c => [c, normalizeDesignCurve(a.curves?.[c])])),
  };
}
export const isIdentityCurve = points => points.every(([x, y]) => x === y);
export function hasPixelAdjustments(a) {
  return !!a && a.enabled !== false && (['exposure', 'highlights', 'shadows', 'temperature', 'tint'].some(k => a[k]) ||
    CURVE_CHANNELS.some(c => a.curves?.[c] && !isIdentityCurve(a.curves[c])));
}
// Shape-preserving cubic Hermite interpolation avoids overshoot around control points.
export function designCurveLUT(value, size = 256) {
  const p = normalizeDesignCurve(value), n = p.length;
  const dx = p.slice(1).map((v, i) => v[0] - p[i][0]);
  const slope = dx.map((d, i) => (p[i + 1][1] - p[i][1]) / d);
  const tangent = p.map((_, i) => {
    if (!i) return slope[0];
    if (i === n - 1) return slope.at(-1);
    if (slope[i - 1] * slope[i] <= 0) return 0;
    const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
    return (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  });
  let segment = 0;
  return Float32Array.from({ length: size }, (_, i) => {
    const x = i / (size - 1);
    while (segment < n - 2 && x > p[segment + 1][0]) segment++;
    const t = (x - p[segment][0]) / dx[segment], t2 = t * t, t3 = t2 * t;
    return clamp((2*t3 - 3*t2 + 1)*p[segment][1] + (t3 - 2*t2 + t)*dx[segment]*tangent[segment] +
      (-2*t3 + 3*t2)*p[segment + 1][1] + (t3 - t2)*dx[segment]*tangent[segment + 1]);
  });
}
const toLinear = v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const toSRGB = v => v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055;
function sample(table, v) {
  const x = clamp(v) * (table.length - 1), i = Math.floor(x), t = x - i;
  return table[i] * (1 - t) + table[Math.min(i + 1, table.length - 1)] * t;
}
// Work on straight RGBA bytes; transparency and masks must remain unchanged.
// Exposure is measured in stops and applied to linear light, not display gamma.
export function applyDesignPixelAdjustments(data, value) {
  if (!hasPixelAdjustments(value)) return data;
  const a = normalizeDesignAdjustments(value), exposure = 2 ** a.exposure;
  const gains = [Math.exp(a.temperature * .3 + a.tint * .15), Math.exp(-a.tint * .3), Math.exp(-a.temperature * .3 + a.tint * .15)];
  const light = gains.map(g => Float32Array.from({ length: 256 }, (_, i) => clamp(toSRGB(toLinear(i / 255) * exposure * g))));
  const curves = CURVE_CHANNELS.map(c => designCurveLUT(a.curves[c], 1024));
  const output = curves.slice(1).map(c => Float32Array.from(curves[0], y => sample(c, y)));
  // Exposure, white balance and curves can be collapsed to three byte lookups.
  // Only luminance-dependent highlights/shadows need work per pixel.
  if (!a.shadows && !a.highlights) {
    const tables = light.map((c, channel) => Uint8ClampedArray.from(c, v => sample(output[channel], v) * 255));
    for (let i = 0; i < data.length; i += 4) {
      if (!data[i + 3]) continue;
      data[i] = tables[0][data[i]]; data[i + 1] = tables[1][data[i + 1]]; data[i + 2] = tables[2][data[i + 2]];
    }
    return data;
  }
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = light[0][data[i]], g = light[1][data[i + 1]], b = light[2][data[i + 2]];
    const luma = .2126 * r + .7152 * g + .0722 * b;
    const offset = .5 * (a.shadows * (1 - luma) ** 2 + a.highlights * luma ** 2);
    data[i] = sample(output[0], r + offset) * 255;
    data[i + 1] = sample(output[1], g + offset) * 255;
    data[i + 2] = sample(output[2], b + offset) * 255;
  }
  return data;
}
