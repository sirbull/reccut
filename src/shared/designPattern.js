const number = (v, fallback, min, max) => Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export const PATTERN_SHAPES = [
  ['circle', 'Circle'], ['square', 'Square'], ['diamond', 'Diamond'],
  ['triangle', 'Triangle'], ['star', 'Star'], ['hexagon', 'Hexagon'],
].map(([value, label]) => ({ value, label }));
export const PATTERN_DISTRIBUTIONS = [
  ['uniform', 'Uniform'], ['center', 'Larger in the center'], ['edges', 'Larger at the edges'],
  ['left', 'Larger on the left'], ['right', 'Larger on the right'],
  ['top', 'Larger at the top'], ['bottom', 'Larger at the bottom'],
].map(([value, label]) => ({ value, label }));
export function normalizeDesignPattern(value) {
  if (!value || !['dots', 'grid'].includes(value.kind)) return null;
  const spacingX = number(value.spacingX, 48, 4, 1024), spacingY = number(value.spacingY, 48, 4, 1024);
  const limit = Math.min(spacingX, spacingY) / (value.kind === 'dots' ? 2 : 1);
  return {
    kind: value.kind, color: /^#[0-9a-f]{6}$/i.test(value.color) ? value.color : '#52607a',
    size: number(value.size, Math.min(value.kind === 'dots' ? 4 : 2, limit), .5, Math.min(256, limit)),
    spacingX, spacingY,
    shape: PATTERN_SHAPES.some(s => s.value === value.shape) ? value.shape : 'circle',
    random: number(value.random, 0, 0, 1), seed: Math.round(number(value.seed, 1, 0, 99999)),
    distribution: PATTERN_DISTRIBUTIONS.some(d => d.value === value.distribution) ? value.distribution : 'uniform',
    strength: number(value.strength, 1, 0, 1), rotation: number(value.rotation, 0, -36000, 36000),
    offsetX: number(value.offsetX, 0, -65536, 65536), offsetY: number(value.offsetY, 0, -65536, 65536),
  };
}
// Stable coordinate noise: seeking and export reproduce exactly the same sizes.
export function patternNoise(x, y, seed) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function patternScaleAt(pattern, x, y, w, h, col = 0, row = 0) {
  const nx = Math.min(1, Math.max(0, x / w)), ny = Math.min(1, Math.max(0, y / h));
  const edge = Math.min(1, Math.hypot(nx * 2 - 1, ny * 2 - 1));
  const field = { uniform: 1, center: 1 - edge, edges: edge, left: 1 - nx, right: nx, top: 1 - ny, bottom: ny }[pattern.distribution] ?? 1;
  return (1 - pattern.strength * .9 * (1 - field)) * (1 - pattern.random * .9 * patternNoise(col, row, pattern.seed));
}
function drawSymbol(ctx, p, x, y, r) {
  if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); return; }
  if (p.shape === 'square' && !p.rotation) { ctx.fillRect(x - r, y - r, r * 2, r * 2); return; }
  const sides = { square: 4, diamond: 4, triangle: 3, star: 10, hexagon: 6 }[p.shape];
  const start = -Math.PI / 2 + p.rotation * Math.PI / 180 + (p.shape === 'square' ? Math.PI / 4 : 0);
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const radius = p.shape === 'star' && i % 2 ? r * .45 : p.shape === 'square' ? r * Math.SQRT2 : r;
    const a = start + i * Math.PI * 2 / sides, px = x + Math.cos(a) * radius, py = y + Math.sin(a) * radius;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill();
}
export function patternTile(pattern, create) {
  const p = normalizeDesignPattern(pattern), cv = create(p.spacingX, p.spacingY), ctx = cv.getContext('2d');
  ctx.fillStyle = p.color;
  if (p.kind === 'dots') drawSymbol(ctx, p, p.spacingX / 2, p.spacingY / 2, p.size);
  else { ctx.fillRect(0, 0, p.size, p.spacingY); ctx.fillRect(0, 0, p.spacingX, p.size); }
  return cv;
}
// Shared by Design, the editing viewer and the export worker. Variable grid
// strokes join at matching widths, so thickness can change along each line.
export function paintPattern(ctx, pattern, w, h, create = (w, h) => new OffscreenCanvas(w, h)) {
  const p = normalizeDesignPattern(pattern);
  if (!p || !(w > 0 && h > 0)) return;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.fillStyle = p.color;
  if (!p.random && (p.distribution === 'uniform' || !p.strength) && !p.offsetX && !p.offsetY && Number.isInteger(p.spacingX) && Number.isInteger(p.spacingY) && (p.shape !== 'square' || p.rotation % 90 === 0)) {
    const tile = patternTile(p, create);
    ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore(); return;
  }
  // Bound work for exceptionally large imported designs with tiny spacing.
  const density = Math.max(1, Math.sqrt((w / p.spacingX + 3) * (h / p.spacingY + 3) / 120000));
  const sx = p.spacingX * density, sy = p.spacingY * density;
  const ox = ((p.offsetX % sx) + sx) % sx, oy = ((p.offsetY % sy) + sy) % sy;
  const size = (x, y, c, r) => p.size * patternScaleAt(p, x, y, w, h, c, r);
  const quad = (points) => { ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
  for (let row = -1; row <= Math.ceil(h / sy); row++) {
    const y = row * sy + oy + (p.kind === 'dots' ? sy / 2 : p.size / 2);
    for (let col = -1; col <= Math.ceil(w / sx); col++) {
      const x = col * sx + ox + (p.kind === 'dots' ? sx / 2 : p.size / 2);
      const a = size(x, y, col, row);
      if (p.kind === 'dots') drawSymbol(ctx, p, x, y, a);
      else {
        const b = size(x + sx, y, col + 1, row), c = size(x, y + sy, col, row + 1);
        quad([[x - a / 2, y - a / 2], [x + sx + b / 2, y - b / 2], [x + sx + b / 2, y + b / 2], [x - a / 2, y + a / 2]]);
        quad([[x - a / 2, y - a / 2], [x + a / 2, y - a / 2], [x + c / 2, y + sy + c / 2], [x - c / 2, y + sy + c / 2]]);
      }
    }
  }
  ctx.restore();
}
export const PATTERN_NUMBERS = ['size', 'spacingX', 'spacingY', 'random', 'strength', 'seed', 'rotation', 'offsetX', 'offsetY'];
export function patternFromClip(clip, T, valueAt) {
  const p = { kind: valueAt(clip, 'patternKind', T), color: valueAt(clip, 'patternColor', T), shape: valueAt(clip, 'patternShape', T), distribution: valueAt(clip, 'patternDistribution', T) };
  for (const k of PATTERN_NUMBERS) p[k] = valueAt(clip, `pattern.${k}`, T);
  return normalizeDesignPattern(p);
}
export function patternClipProps(kind = 'dots') {
  const p = normalizeDesignPattern({ kind });
  return { patternKind: kind, patternColor: p.color, patternShape: p.shape, patternDistribution: p.distribution, patternBackground: '#182133', ...Object.fromEntries(PATTERN_NUMBERS.map(k => [`pattern.${k}`, p[k]])) };
}
