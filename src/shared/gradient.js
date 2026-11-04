// Coordinates are fractions of the source; point radius uses the shorter source edge.
export const MAX_GRADIENT_POINTS = 32;
export const DEFAULT_GRADIENT = {
  mode: 'linear',
  start: { x: 0, y: 0.5 },
  end: { x: 1, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  radius: 0.5,
  stops: [
    { id: 'start', position: 0, color: '#487cff' },
    { id: 'end', position: 1, color: '#ff70b5' },
  ],
  points: [
    { id: 'blue', x: 0.2, y: 0.25, radius: 0.45, color: '#487cff' },
    { id: 'pink', x: 0.8, y: 0.3, radius: 0.45, color: '#ff70b5' },
    { id: 'gold', x: 0.5, y: 0.85, radius: 0.45, color: '#ffc766' },
  ],
};
export const clampGradient = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const finite = (v, fallback, min = 0, max = 1) => clampGradient(Number.isFinite(v) ? v : fallback, min, max);
const color = (v) => /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#487cff';
export const gradientRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export function gradientParams(params = {}) {
  const p = { ...DEFAULT_GRADIENT, ...params };
  const xy = (v, fallback) => ({ x: finite(v?.x, fallback.x), y: finite(v?.y, fallback.y) });
  const items = (value, fallback) => Array.isArray(value) && value.length ? value.slice(0, MAX_GRADIENT_POINTS) : fallback;
  return {
    mode: ['linear', 'radial', 'freeform'].includes(p.mode) ? p.mode : 'linear',
    start: xy(p.start, DEFAULT_GRADIENT.start),
    end: xy(p.end, DEFAULT_GRADIENT.end),
    center: xy(p.center, DEFAULT_GRADIENT.center),
    radius: finite(p.radius, 0.5, 0.01, 2),
    stops: items(p.stops, DEFAULT_GRADIENT.stops).map((s, i) => ({
      id: s?.id || `stop-${i}`, position: finite(s?.position, 0), color: color(s?.color),
    })).sort((a, b) => a.position - b.position),
    points: items(p.points, DEFAULT_GRADIENT.points).map((s, i) => ({
      id: s?.id || `point-${i}`, ...xy(s, { x: 0.5, y: 0.5 }),
      radius: finite(s?.radius, 0.45, 0.01, 2), color: color(s?.color),
    })),
  };
}
export function gradientStopColor(stops, t) {
  if (t < stops[0].position) return gradientRGB(stops[0].color);
  for (let i = 1; i < stops.length; i++) {
    if (t >= stops[i].position) continue;
    const a = stops[i - 1], b = stops[i];
    const f = (t - a.position) / Math.max(1e-8, b.position - a.position);
    const ca = gradientRGB(a.color), cb = gradientRGB(b.color);
    return ca.map((c, j) => c + (cb[j] - c) * f);
  }
  return gradientRGB(stops.at(-1).color);
}
// Clockwise from left-to-right (0°). Account for the actual source aspect ratio.
export function gradientAngle(params, aspect = 1) {
  const p = gradientParams(params), ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  return (Math.atan2(p.end.y - p.start.y, (p.end.x - p.start.x) * ratio) * 180 / Math.PI + 360) % 360;
}
export function gradientAtAngle(params, angle, aspect = 1) {
  const p = gradientParams(params), ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const radians = ((Number.isFinite(angle) ? angle : 0) % 360) * Math.PI / 180;
  const length = Math.hypot((p.end.x - p.start.x) * ratio, p.end.y - p.start.y) || Math.min(ratio, 1);
  let dx = Math.cos(radians) * length / ratio / 2, dy = Math.sin(radians) * length / 2;
  // Keep the length and midpoint where possible; fit/shift only when an edge requires it.
  const fit = Math.min(1, .5 / Math.max(Math.abs(dx), 1e-12), .5 / Math.max(Math.abs(dy), 1e-12));
  dx *= fit; dy *= fit;
  const x = clampGradient((p.start.x + p.end.x) / 2, Math.abs(dx), 1 - Math.abs(dx));
  const y = clampGradient((p.start.y + p.end.y) / 2, Math.abs(dy), 1 - Math.abs(dy));
  return { start: { x: x - dx, y: y - dy }, end: { x: x + dx, y: y + dy } };
}
// Shared reference math for the CPU fallback and new-point color sampling.
export function gradientColorAt(p, x, y, aspect = 1) {
  const ax = Math.max(1, aspect), ay = Math.max(1, 1 / aspect);
  if (p.mode === 'freeform') {
    let total = 0;
    const out = [0, 0, 0];
    for (const point of p.points) {
      const distance2 = ((x - point.x) * ax) ** 2 + ((y - point.y) * ay) ** 2;
      const weight = (point.radius ** 2 / Math.max(1e-8, distance2)) ** 2;
      const c = gradientRGB(point.color);
      total += weight;
      for (let j = 0; j < 3; j++) out[j] += c[j] * weight;
    }
    return out.map((c) => c / total);
  }
  let t;
  if (p.mode === 'radial') t = Math.hypot((x - p.center.x) * ax, (y - p.center.y) * ay) / p.radius;
  else {
    const dx = (p.end.x - p.start.x) * ax, dy = (p.end.y - p.start.y) * ay;
    const length2 = dx * dx + dy * dy;
    t = length2 < 1e-16 ? 1 : ((x - p.start.x) * ax * dx + (y - p.start.y) * ay * dy) / length2;
  }
  return gradientStopColor(p.stops, clampGradient(t));
}
export const gradientHex = (rgb) => '#' + rgb.map((c) => Math.round(clampGradient(c, 0, 255)).toString(16).padStart(2, '0')).join('');
