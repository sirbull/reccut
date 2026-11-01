const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const IMAGE_FITS = [
  { value: 'contain', label: 'Fit entire image' }, { value: 'cover', label: 'Fill frame (crop)' },
  { value: 'height', label: 'Fill height' }, { value: 'width', label: 'Fill width' }, { value: 'stretch', label: 'Stretch' },
];
export const KEN_BURNS_MODES = [
  { value: 'in', label: 'Zoom in' }, { value: 'out', label: 'Zoom out' },
  { value: 'left', label: 'Pan left' }, { value: 'right', label: 'Pan right' },
  { value: 'up', label: 'Pan up' }, { value: 'down', label: 'Pan down' },
];
export function imageFitRect(sw, sh, W, H, fit = 'contain') {
  const scale = fit === 'cover' ? Math.max(W / sw, H / sh) : fit === 'height' ? H / sh : fit === 'width' ? W / sw : Math.min(W / sw, H / sh);
  const w = fit === 'stretch' ? W : sw * scale, h = fit === 'stretch' ? H : sh * scale;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
export function imageRectAt(clip, T, sw, sh, W, H) {
  const p = clip.props, base = imageFitRect(sw, sh, W, H, p.imageFit);
  if (!p.kenBurns) return base;
  const start = Number.isFinite(p.kenBurnsStart) ? p.kenBurnsStart : clip.in;
  const end = Number.isFinite(p.kenBurnsEnd) ? p.kenBurnsEnd : clip.in + clip.dur;
  const t = clamp((clip.in + T - clip.start - start) / Math.max(0.001, end - start));
  const u = t * t * (3 - 2 * t), amount = clamp(p.kenBurnsAmount ?? 0.12, 0, 0.6);
  const mode = p.kenBurnsMode || 'in';
  const zoom = mode === 'in' ? 1 + amount * u : mode === 'out' ? 1 + amount * (1 - u) : 1 + amount * 0.6;
  const w = base.w * zoom, h = base.h * zoom;
  const pan = clamp(p.kenBurnsPan ?? 0.04, 0, 0.3);
  const dx = Math.min(Math.abs(w - W) / 2, W * pan), dy = Math.min(Math.abs(h - H) / 2, H * pan);
  const axisX = mode === 'left' ? -1 : mode === 'right' ? 1 : mode === 'up' || mode === 'down' ? 0 : (p.kenBurnsAxisX ?? 0.6);
  const axisY = mode === 'up' ? -1 : mode === 'down' ? 1 : mode === 'left' || mode === 'right' ? 0 : (p.kenBurnsAxisY ?? -0.4);
  return { x: (W - w) / 2 + (2 * u - 1) * axisX * dx, y: (H - h) / 2 + (2 * u - 1) * axisY * dy, w, h };
}
export function enableKenBurns(clip, mode = 'in', amount = 0.12, handles = 0) {
  Object.assign(clip.props, { kenBurns: true, kenBurnsMode: mode, kenBurnsAmount: amount, kenBurnsPan: 0.04,
    kenBurnsStart: clip.in - handles, kenBurnsEnd: clip.in + clip.dur + handles });
}
