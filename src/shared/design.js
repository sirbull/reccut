import { uid } from './model.js';

// Starting sizes, not upload requirements. YouTube's 2 MB is a conservative mobile limit.
// https://support.google.com/youtube/answer/72431
// https://podcasters.apple.com/support/5514-show-cover-template
// https://help.vimeo.com/hc/en-us/articles/12426471350289
export const DESIGN_SIZES = [
  { id: 'youtube', label: 'YouTube Thumbnail', group: 'Video', width: 1280, height: 720, maxBytes: 2_000_000 },
  { id: 'shorts', label: 'YouTube Shorts', group: 'Video', width: 1080, height: 1920 },
  { id: 'vimeo', label: 'Vimeo', group: 'Video', width: 1920, height: 1080 },
  { id: 'twitch', label: 'Twitch Offline Screen', group: 'Video', width: 1920, height: 1080 },
  { id: 'instagram-square', label: 'Instagram Post', group: 'Social', width: 1080, height: 1080 },
  { id: 'instagram-portrait', label: 'Instagram Portrait', group: 'Social', width: 1080, height: 1350 },
  { id: 'reels', label: 'Reels / TikTok / Story', group: 'Social', width: 1080, height: 1920 },
  { id: 'facebook', label: 'Facebook Link / Video', group: 'Social', width: 1200, height: 630 },
  { id: 'linkedin', label: 'LinkedIn', group: 'Social', width: 1200, height: 627 },
  { id: 'x', label: 'X Post', group: 'Social', width: 1600, height: 900 },
  { id: 'podcast', label: 'Podcast Cover', group: 'Other', width: 3000, height: 3000 },
];
export const BLEND_MODES = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
const number = (v, fallback, min = -1e6, max = 1e6) => Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const string = (v, fallback) => typeof v === 'string' ? v : fallback;
export const solidFill = (color = '#ffffff') => ({ type: 'solid', color, alpha: 1 });
function fill(v, fallback = null) {
  if (!v || typeof v !== 'object') return fallback;
  if (v.type === 'gradient' && v.gradient) return { ...v, alpha: number(v.alpha, 1, 0, 1) };
  return { type: 'solid', color: /^#[\da-f]{6}$/i.test(v.color) ? v.color : '#ffffff', alpha: number(v.alpha, 1, 0, 1) };
}
export function validDesignSize(width, height) {
  return [width, height].every((v) => Number.isInteger(v) && v >= 1 && v <= 8192);
}
export function newDesign({ name = 'Thumbnail', width = 1280, height = 720, size = 'youtube' } = {}) {
  if (!validDesignSize(width, height)) throw new Error('Width and height must be whole numbers from 1 to 8192 pixels.');
  return { id: uid(), name, created: Date.now(), width, height, size, background: solidFill('#18181b'), layers: [] };
}
export function newLayer(type, props = {}) {
  if (!['text', 'image', 'shape'].includes(type)) throw new Error('Unknown layer type.');
  return normalizeLayer({ ...props, type, id: props.id || uid() });
}
export function normalizeLayer(input) {
  const l = object(input);
  if (!['text', 'image', 'shape'].includes(l.type)) return null;
  const result = {
    ...l, id: string(l.id, uid()), type: l.type, name: string(l.name, l.type === 'text' ? 'Title' : l.type === 'shape' ? 'Rectangle' : 'Image'),
    x: number(l.x, 0), y: number(l.y, 0), w: number(l.w, 400, 1, 65536), h: number(l.h, l.type === 'text' ? 150 : 300, 1, 65536),
    rotation: number(l.rotation, 0, -36000, 36000), flipX: Boolean(l.flipX), flipY: Boolean(l.flipY),
    opacity: number(l.opacity, 1, 0, 1), blend: BLEND_MODES.includes(l.blend) ? l.blend : 'source-over',
    hidden: Boolean(l.hidden), locked: Boolean(l.locked), group: l.group || null,
    fill: fill(l.fill, l.fill === null ? null : solidFill()), stroke: l.stroke || null, shadows: Array.isArray(l.shadows) ? l.shadows.filter(Boolean) : [],
    mask: l.mask || null, clip: Boolean(l.clip), style: l.style || null,
  };
  if (l.type === 'text') Object.assign(result, {
    text: string(l.text, 'Title'), font: string(l.font, 'sans'), weight: number(l.weight, 800, 100, 900), size: number(l.size, 96, 6, 4096),
    tracking: number(l.tracking, 0, -100, 500), lineHeight: number(l.lineHeight, 1.1, 0.5, 5),
    align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'center', valign: ['top', 'middle', 'bottom'].includes(l.valign) ? l.valign : 'middle',
    uppercase: Boolean(l.uppercase), autofit: l.autofit !== false, highlight: fill(l.highlight, solidFill('#ff453a')), box: l.box || null,
  });
  if (l.type === 'image') {
    const c = object(l.crop), a = object(l.adjust);
    const x = number(c.x, 0, 0, 0.9999), y = number(c.y, 0, 0, 0.9999);
    Object.assign(result, {
      asset: string(l.asset, null), media: l.asset ? null : string(l.media, null),
      crop: { x, y, w: number(c.w, 1 - x, 0.0001, 1 - x), h: number(c.h, 1 - y, 0.0001, 1 - y) },
      fit: ['cover', 'contain', 'stretch'].includes(l.fit) ? l.fit : 'cover',
      adjust: { brightness: number(a.brightness, 0, -1, 1), contrast: number(a.contrast, 0, -1, 1), saturation: number(a.saturation, 0, -1, 1), hue: number(a.hue, 0, -180, 180), blur: number(a.blur, 0, 0, 500), grayscale: number(a.grayscale, 0, 0, 1) },
      cutout: l.cutout || null, outline: l.outline || null,
    });
  }
  if (l.type === 'shape') Object.assign(result, { shape: 'rect', radius: number(l.radius, 0, 0, Math.min(result.w, result.h) / 2), sides: 6, points: 5, inner: 0.5, head: 1 });
  return result;
}
export function normalizeDesign(input) {
  const d = object(input);
  const ids = new Set();
  const layers = (Array.isArray(d.layers) ? d.layers : []).map(normalizeLayer).filter(Boolean).map((l) => {
    if (ids.has(l.id)) l.id = uid();
    ids.add(l.id);
    return l;
  });
  return {
    ...d, id: string(d.id, uid()), name: string(d.name, 'Thumbnail'), created: number(d.created, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    width: Math.round(number(d.width, 1280, 1, 8192)), height: Math.round(number(d.height, 720, 1, 8192)),
    size: string(d.size, 'custom'), background: fill(d.background, d.background === null ? null : solidFill('#18181b')), layers,
  };
}
export function normalizeDesignProject(p) {
  const designs = {};
  for (const [id, d] of Object.entries(object(p.designs))) designs[id] = { ...normalizeDesign(d), id };
  return { ...p, designs, designAssets: object(p.designAssets) };
}
export function designList(p) {
  return Object.values(p?.designs || {}).sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
}
export function rotatePoint(x, y, degrees) {
  const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return { x: x * c - y * s, y: x * s + y * c };
}
export function layerPoint(l, x, y) {
  const p = rotatePoint(x - l.w / 2, y - l.h / 2, l.rotation);
  return { x: l.x + l.w / 2 + p.x, y: l.y + l.h / 2 + p.y };
}
export function layerBounds(l) {
  const pts = [[0, 0], [l.w, 0], [l.w, l.h], [0, l.h]].map(([x, y]) => layerPoint(l, x, y));
  const x = Math.min(...pts.map((p) => p.x)), y = Math.min(...pts.map((p) => p.y));
  return { x, y, w: Math.max(...pts.map((p) => p.x)) - x, h: Math.max(...pts.map((p) => p.y)) - y };
}
export function selectionBounds(layers) {
  if (!layers.length) return null;
  const boxes = layers.map(layerBounds);
  const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}
export function hitTest(d, x, y) {
  for (const l of [...d.layers].reverse()) {
    if (l.hidden || l.locked) continue;
    const p = rotatePoint(x - l.x - l.w / 2, y - l.y - l.h / 2, -l.rotation);
    if (Math.abs(p.x) <= l.w / 2 && Math.abs(p.y) <= l.h / 2) return l;
  }
  return null;
}
export function fitBox(sw, sh, bw, bh, mode = 'contain') {
  if (mode === 'stretch') return { x: 0, y: 0, w: bw, h: bh };
  const k = (mode === 'cover' ? Math.max : Math.min)(bw / sw, bh / sh);
  return { x: (bw - sw * k) / 2, y: (bh - sh * k) / 2, w: sw * k, h: sh * k };
}
export function resizeLayer(l, handle, dx, dy, { keepAspect = false, fromCenter = false } = {}) {
  const delta = rotatePoint(dx, dy, -l.rotation);
  const hx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0;
  const hy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0;
  const k = fromCenter ? 2 : 1;
  let w = Math.max(1, l.w + hx * delta.x * k), h = Math.max(1, l.h + hy * delta.y * k);
  if (keepAspect) {
    const ratio = !hy || (hx && Math.abs(w / l.w - 1) >= Math.abs(h / l.h - 1)) ? w / l.w : h / l.h;
    const r = Math.max(ratio, 1 / Math.min(l.w, l.h));
    w = l.w * r; h = l.h * r;
  }
  const offset = fromCenter ? { x: 0, y: 0 } : rotatePoint(hx * (w - l.w) / 2, hy * (h - l.h) / 2, l.rotation);
  return { ...l, x: l.x + l.w / 2 + offset.x - w / 2, y: l.y + l.h / 2 + offset.y - h / 2, w, h };
}
export function snapRotation(degrees, snap = false) {
  return snap ? Math.round(degrees / 15) * 15 : degrees;
}
export function snapMove(box, dx, dy, candidates, threshold) {
  const guides = [];
  const axis = (key, length, delta) => {
    let correction = 0, nearest = threshold + 1, guide;
    for (const target of candidates[key] || []) for (const edge of [box[key], box[key] + box[length] / 2, box[key] + box[length]]) {
      const diff = target - edge - delta;
      if (Math.abs(diff) <= threshold && Math.abs(diff) < nearest) { nearest = Math.abs(diff); correction = diff; guide = target; }
    }
    if (guide !== undefined) guides.push({ axis: key, value: guide });
    return delta + correction;
  };
  return { dx: axis('x', 'w', dx), dy: axis('y', 'h', dy), guides };
}
export function resizeDesign(d, width, height) {
  if (!validDesignSize(width, height)) throw new Error('Width and height must be whole numbers from 1 to 8192 pixels.');
  return { ...d, width, height, size: 'custom', layers: d.layers.map((l) => ({ ...l, x: l.x + (width - d.width) / 2, y: l.y + (height - d.height) / 2 })) };
}
export function reorderLayers(layers, ids, direction) {
  const picked = new Set(ids), out = [...layers];
  if (direction === 'front' || direction === 'back') {
    const selected = out.filter((l) => picked.has(l.id)), rest = out.filter((l) => !picked.has(l.id));
    return direction === 'front' ? [...rest, ...selected] : [...selected, ...rest];
  }
  if (direction === 'up') {
    for (let i = out.length - 2; i >= 0; i--) if (picked.has(out[i].id) && !picked.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  } else for (let i = 1; i < out.length; i++) if (picked.has(out[i].id) && !picked.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  return out;
}
