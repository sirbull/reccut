// Preset expressions are data, never executable project code. The same pure
// evaluator is used when seeking, playing and exporting.
export const EXPRESSION_PRESETS = [
  { value: 'wiggle', label: 'Wiggle', description: 'Smooth random movement around the property value.' },
  { value: 'sine', label: 'Oscillate', description: 'Move smoothly back and forth.' },
  { value: 'pulse', label: 'Pulse', description: 'Repeatedly grow above the property value and return.' },
  { value: 'rotate', label: 'Rotation', description: 'Continuous rotation. Amount is degrees per second at speed 1.' },
  { value: 'drift', label: 'Drift', description: 'Add a steady change over time. Amount is units per second at speed 1.' },
  { value: 'bounce', label: 'Bounce', description: 'A repeating bounce above the property value.' },
  { value: 'saw', label: 'Ramp', description: 'Repeatedly rise and reset.' },
  { value: 'flicker', label: 'Flicker', description: 'Jump to a new random value at each interval.' },
];
const finite = (v, fallback, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
export function normalizeExpression(value) {
  if (!value || !EXPRESSION_PRESETS.some(p => p.value === value.preset)) return null;
  return {
    preset: value.preset, enabled: value.enabled !== false,
    amount: finite(value.amount, 10, -1e6, 1e6), frequency: finite(value.frequency, 1, 0, 100),
    phase: finite(value.phase, 0, -36000, 36000), timeOffset: finite(value.timeOffset, 0, -1e9, 1e9), seed: Math.round(finite(value.seed, 1, 0, 99999)),
    min: Number.isFinite(value.min) ? value.min : null, max: Number.isFinite(value.max) ? value.max : null,
  };
}
function noise(i, seed) {
  let n = Math.imul(i | 0, 374761393) ^ Math.imul(seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (((n ^ (n >>> 16)) >>> 0) / 4294967295) * 2 - 1;
}
export function expressionValue(base, expression, time) {
  const e = normalizeExpression(expression);
  if (!e || !e.enabled || typeof base !== 'number' || !Number.isFinite(base) || !Number.isFinite(time)) return base;
  const t = (time + e.timeOffset) * e.frequency + e.phase / 360, cycle = t - Math.floor(t);
  let wave = 0;
  switch (e.preset) {
    case 'wiggle': { const i = Math.floor(t), u = cycle * cycle * (3 - 2 * cycle); wave = noise(i, e.seed) * (1 - u) + noise(i + 1, e.seed) * u; break; }
    case 'sine': wave = Math.sin(t * Math.PI * 2); break;
    case 'pulse': wave = (1 - Math.cos(t * Math.PI * 2)) / 2; break;
    case 'rotate': case 'drift': wave = t; break;
    case 'bounce': wave = 4 * cycle * (1 - cycle); break;
    case 'saw': wave = cycle; break;
    case 'flicker': wave = noise(Math.floor(t), e.seed); break;
  }
  const result = base + wave * e.amount;
  return Math.min(e.max ?? Infinity, Math.max(e.min ?? -Infinity, result));
}
