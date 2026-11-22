import { sourceTime, valueAt, vfxProp } from './model.js';

export const MOTION_BLUR_DEFAULTS = { amount: 40, mode: 'directional', angle: 0, centerX: 0.5, centerY: 0.5, bias: 0 };
export const NATURAL_MOTION_BLUR_DEFAULTS = { amount: 0.5, rollingShutter: false };
export const MOTION_BLUR_MODES = [
  { value: 'directional', label: 'Directional' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'spin', label: 'Spin' },
];
export const isMotionEffect = type => type === 'motionBlur' || type === 'naturalMotionBlur';
export const unit = (v, fallback = 0) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;

export function needsNaturalMotion(clip, target = 'main', T = null) {
  if(clip.speed===0&&!clip.ramp)return false;
  return (clip.props?.vfx || []).some(e => e.type === 'naturalMotionBlur' && e.on !== false &&
    (!e.target || e.target === target) && (T == null ? e.p?.amount ?? 0.5 : valueAt(clip, vfxProp(e.id, 'amount'), T) ?? 0.5) > 0);
}

// Sample source time, never playback history. This also works when seeking,
// reversing or rendering a single frame. Neighbours stay inside this edit.
export function motionFramePlan(clip, stream, T, projectFps = 30) {
  const fps = Math.max(1, Math.min(240, stream.fps || projectFps || 30));
  const outputFps = Math.max(1, projectFps || 30);
  const offset = stream.offset || 0;
  const t = Math.max(0,Math.min(sourceTime(clip, T) - offset,(stream.duration||Infinity)-1e-5));
  // Transition handles can legitimately request the same source outside its
  // edit. Keep the centre frame correct there, with one-sided neighbours.
  const lo = Math.max(0, Math.min(t,sourceTime(clip, clip.start)-offset,sourceTime(clip, clip.start + clip.dur)-offset));
  const hi = Math.min(stream.duration || Infinity, Math.max(t+1e-5,sourceTime(clip, clip.start)-offset,sourceTime(clip, clip.start + clip.dur)-offset));
  const delta = sourceTime(clip, T + 0.5 / outputFps) - sourceTime(clip, T - 0.5 / outputFps);
  const exposure = Math.abs(delta);
  const step = Math.max(1, Math.ceil(exposure * fps - 1e-6)) / fps;
  const times = [t - step, t, t + step].map(v => Math.max(lo, Math.min(v, Math.max(lo, hi - 1e-5))));
  return { times, exposure, direction: delta < 0 ? -1 : 1, fps, lo, hi };
}

// A small histogram test catches hard cuts without interpreting a fast pan as a
// cut solely because pixels moved. Local flow confidence handles other changes.
export function motionSceneCut(a, b) {
  const binsA = new Float32Array(24), binsB = new Float32Array(24);
  let diff = 0;
  const n = Math.min(a.length, b.length) / 4;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
    const x = a[i * 4 + k] / 255, y = b[i * 4 + k] / 255;
    binsA[k * 8 + Math.min(7, Math.floor(x * 8))]++;
    binsB[k * 8 + Math.min(7, Math.floor(y * 8))]++;
    diff += Math.abs(x - y);
  }
  let distance = 0;
  for (let i = 0; i < 24; i++) distance += Math.abs(binsA[i] - binsB[i]);
  return n > 0 && diff / (n * 3) > 0.22 && distance / (n * 6) > 0.32;
}
