import { uid, sourceTime } from './model.js';
export { dilateAlpha, erodeAlpha, designClipGroups, layerToSourcePoint, sourceToLayerPoint } from './designMasks.js';
import { gradientParams } from './gradient.js';

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
export function normalizeFill(v, fallback = null) {
  if (!v || typeof v !== 'object') return fallback;
  if (v.type === 'gradient') return { type: 'gradient', gradient: gradientParams(v.gradient), alpha: number(v.alpha, 1, 0, 1) };
  return { type: 'solid', color: /^#[\da-f]{6}$/i.test(v.color) ? v.color : '#ffffff', alpha: number(v.alpha, 1, 0, 1) };
}
const fill = normalizeFill;
export const DESIGN_SHAPES = [
  { value: 'rect', label: 'Rectangle' }, { value: 'ellipse', label: 'Ellipse' },
  { value: 'polygon', label: 'Polygon' }, { value: 'star', label: 'Star' },
  { value: 'line', label: 'Line' }, { value: 'arrow', label: 'Arrow' },
];
export function normalizeStroke(s, type = 'shape') {
  if (!s) return null;
  return { fill: fill(s.fill, solidFill('#000000')), width: number(s.width, 4, 0, 500),
    align: ['inside', 'center', 'outside'].includes(s.align) ? s.align : type === 'text' ? 'outside' : 'center',
    dash: ['solid', 'dashed', 'dotted'].includes(s.dash) ? s.dash : 'solid',
    join: ['round', 'bevel', 'miter'].includes(s.join) ? s.join : 'round' };
}
export function normalizeShadow(s) {
  return { color: /^#[\da-f]{6}$/i.test(s.color) ? s.color : '#000000', alpha: number(s.alpha, 0.5, 0, 1),
    blur: number(s.blur, 16, 0, 500), x: number(s.x, 8, -2000, 2000), y: number(s.y, 8, -2000, 2000), spread: number(s.spread, 0, 0, 500), inner: false };
}
export const SHADOW_PRESETS = {
  'Soft Drop Shadow': { color: '#000000', alpha: 0.6, blur: 20, x: 8, y: 12, spread: 0 },
  'Hard Shadow': { color: '#000000', alpha: 0.8, blur: 0, x: 8, y: 8, spread: 0 },
  'Outer Glow': { color: '#ffffff', alpha: 0.8, blur: 24, x: 0, y: 0, spread: 4 },
  'Long Shadow': { color: '#000000', alpha: 0.6, blur: 0, x: 48, y: 48, spread: 0 },
};
export function strokeMargin(l) {
  return !l.stroke || l.stroke.align === 'inside' ? 0 : l.stroke.width * (l.stroke.align === 'outside' ? 1 : 0.5);
}
export function effectMargin(l) {
  const spread = Math.max(0, l.box?.padding || 0) + (l.outline?.width || 0);
  return Math.ceil(strokeMargin(l) + Math.max(spread, (l.adjust?.blur || 0) * 2,
    ...(l.shadows || []).map((s) => s.blur * 2 + Math.max(Math.abs(s.x), Math.abs(s.y)) + s.spread + spread)));
}
// Geometry remains separate from effect bounds so transform handles do not move
// when a stroke or shadow is edited.
export function visualBounds(l) {
  const m = effectMargin(l);
  return layerBounds({ ...l, x: l.x - m, y: l.y - m, w: l.w + m * 2, h: l.h + m * 2 });
}
// Fractional local points. Mask paths use centered, pixel coordinates, so they
// cannot share these polygon/star paths without losing their local box contract.
export function designShapePoints(l) {
  if (l.shape === 'line') return [[0, 0.5], [1, 0.5]];
  if (l.shape === 'arrow') {
    const head = Math.min(0.45, Math.max(0.08, (l.stroke?.width || 4) * 4 * (l.head || 1) / l.w));
    const half = Math.min(0.5, Math.max(0.08, head * l.w / l.h * 0.6));
    return [[0, 0.5], [1, 0.5], [1 - head, 0.5 - half], [1, 0.5], [1 - head, 0.5 + half]];
  }
  const n = l.shape === 'star' ? Math.round(number(l.points, 5, 3, 24)) * 2 : Math.round(number(l.sides, 6, 3, 12));
  return Array.from({ length: n }, (_, i) => {
    const a = i / n * Math.PI * 2 - Math.PI / 2, r = l.shape === 'star' && i % 2 ? number(l.inner, 0.5, 0.05, 1) : 1;
    return [0.5 + Math.cos(a) * r / 2, 0.5 + Math.sin(a) * r / 2];
  });
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
export function normalizeDesignMask(mask) {
  if (!mask || !['rect','ellipse','polygon'].includes(mask.shape)) return null;
  const points = Array.isArray(mask.points) ? mask.points.filter((p) => Array.isArray(p) && p.length >= 2 && p.slice(0,2).every(Number.isFinite)).slice(0,64).map(([x,y]) => [number(x,0,0,1),number(y,0,0,1)]) : [];
  return { shape: mask.shape, points: points.length >= 3 ? points : [[0,0],[1,0],[1,1],[0,1]], smooth: Boolean(mask.smooth), feather: number(mask.feather,0,0,100), invert: Boolean(mask.invert) };
}
export function normalizeLayer(input) {
  const l = object(input);
  if (!['text', 'image', 'shape'].includes(l.type)) return null;
  const result = {
    ...l, id: string(l.id, uid()), type: l.type, name: string(l.name, l.type === 'text' ? 'Title' : l.type === 'shape' ? DESIGN_SHAPES.find((s) => s.value === l.shape)?.label || 'Rectangle' : 'Image'),
    x: number(l.x, 0), y: number(l.y, 0), w: number(l.w, 400, 1, 65536), h: number(l.h, l.type === 'text' ? 150 : 300, 1, 65536),
    rotation: number(l.rotation, 0, -36000, 36000), flipX: Boolean(l.flipX), flipY: Boolean(l.flipY),
    opacity: number(l.opacity, 1, 0, 1), blend: BLEND_MODES.includes(l.blend) ? l.blend : 'source-over',
    hidden: Boolean(l.hidden), locked: Boolean(l.locked), group: l.group || null,
    fill: fill(l.fill, l.fill === null ? null : solidFill()), stroke: normalizeStroke(l.stroke, l.type), shadows: Array.isArray(l.shadows) ? l.shadows.filter(Boolean).slice(0, 32).map(normalizeShadow) : [],
    mask: normalizeDesignMask(l.mask), clip: Boolean(l.clip), style: l.style || null,
    outline: l.outline ? { color: /^#[\da-f]{6}$/i.test(l.outline.color) ? l.outline.color : '#ffffff', width: number(l.outline.width, 0, 0, 500) } : null,
  };
  if (l.type === 'text') Object.assign(result, {
    text: string(l.text, 'Title'), font: string(l.font, 'sans'), weight: number(l.weight, 800, 100, 900), size: number(l.size, 96, 6, 4096),
    tracking: number(l.tracking, 0, -100, 500), lineHeight: number(l.lineHeight, 1.1, 0.5, 5),
    align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'center', valign: ['top', 'middle', 'bottom'].includes(l.valign) ? l.valign : 'middle',
    uppercase: Boolean(l.uppercase), autofit: l.autofit !== false, highlight: fill(l.highlight, l.highlight === null ? null : solidFill('#ff453a')),
    box: l.box ? { fill: fill(l.box.fill, l.box.fill === null ? null : solidFill('#000000')), padding: number(l.box.padding, 8, 0, 500), radius: number(l.box.radius, 8, 0, 500) } : null,
  });
  if (l.type === 'image') {
    const c = object(l.crop), a = object(l.adjust);
    const x = number(c.x, 0, 0, 0.9999), y = number(c.y, 0, 0, 0.9999);
    Object.assign(result, {
      asset: string(l.asset, null), media: l.asset ? null : string(l.media, null),
      crop: { x, y, w: number(c.w, 1 - x, 0.0001, 1 - x), h: number(c.h, 1 - y, 0.0001, 1 - y) },
      fit: ['cover', 'contain', 'stretch'].includes(l.fit) ? l.fit : 'cover',
      adjust: { brightness: number(a.brightness, 0, -1, 1), contrast: number(a.contrast, 0, -1, 1), saturation: number(a.saturation, 0, -1, 1), hue: number(a.hue, 0, -180, 180), blur: number(a.blur, 0, 0, 500), grayscale: number(a.grayscale, 0, 0, 1) },
      cutout: l.cutout && typeof l.cutout.asset === 'string' ? { asset: l.cutout.asset, enabled: l.cutout.enabled !== false, feather: number(l.cutout.feather, 0, 0, 50), shift: number(l.cutout.shift, 0, -20, 20) } : null,
    });
  }
  if (l.type === 'shape') {
    Object.assign(result, { shape: DESIGN_SHAPES.some((s) => s.value === l.shape) ? l.shape : 'rect', radius: number(l.radius, 0, 0, Math.min(result.w, result.h) / 2), sides: Math.round(number(l.sides, 6, 3, 12)), points: Math.round(number(l.points, 5, 3, 24)), inner: number(l.inner, 0.5, 0.05, 1), head: number(l.head, 1, 0.1, 10) });
    if (['line', 'arrow'].includes(result.shape)) {
      result.fill = null;
      if (l.stroke === undefined) result.stroke = normalizeStroke({ fill: solidFill(), width: 8 });
    }
  }
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

// The source picker keeps a video's native aspect, independent of the timeline.
export function frameSourceProject(preview, media) {
  const stream = media?.streams?.main;
  if (media?.kind !== 'video' || !(stream?.width > 0 && stream?.height > 0)) return preview;
  const scale = Math.min(1, 8192 / Math.max(stream.width, stream.height));
  return { ...preview, width: Math.max(1, Math.round(stream.width * scale)), height: Math.max(1, Math.round(stream.height * scale)), fps: stream.fps > 0 ? stream.fps : preview.fps };
}

export function frameThumbnails(project, count = 6) {
  if (!(project?.duration > 0) || count < 1) return [];
  const clips = Object.values(project.clips || {}).filter((c) => c.enabled !== false && ['video', 'recording', 'image'].includes(c.type));
  return Array.from({ length: count }, (_, i) => {
    const time = project.duration * (i + 0.5) / count;
    const clip = clips.find((c) => c.lane === 0 && c.start <= time && c.start + c.dur > time) || clips.find((c) => c.start <= time && c.start + c.dur > time);
    const media = clip && project.media?.[clip.mediaId];
    const stream = media?.streams?.main || media?.streams?.screen;
    const thumbs = stream?.thumbs;
    if (!thumbs?.files?.length) return null;
    const at = sourceTime(clip, time) - (stream.offset || 0);
    const index = Math.max(0, Math.min(thumbs.files.length - 1, Math.floor(at / (thumbs.interval || 1))));
    return { time, path: thumbs.files[index] };
  }).filter(Boolean);
}

export function groupSelectionIds(layers, ids) {
  const picked = new Set(ids), groups = new Set(layers.filter((l) => picked.has(l.id) && l.group).map((l) => l.group));
  return layers.filter((l) => picked.has(l.id) || groups.has(l.group)).map((l) => l.id);
}
export function groupDesignLayers(layers, ids, group = uid(), name = 'Group') {
  const picked = new Set(groupSelectionIds(layers, ids));
  const members = layers.filter((l) => picked.has(l.id));
  if (members.length < 2) return layers;
  if (members.some((l) => l.locked)) throw new Error('Unlock the layers before grouping.');
  const top = layers.findLastIndex((l) => picked.has(l.id));
  const grouped = members.map((l, i) => ({ ...l, group, groupName: i === 0 ? name : undefined }));
  return [...layers.slice(0, top + 1).filter((l) => !picked.has(l.id)), ...grouped, ...layers.slice(top + 1)];
}
export function ungroupDesignLayers(layers, ids) {
  const groups = new Set(layers.filter((l) => ids.includes(l.id) && l.group).map((l) => l.group));
  if (layers.some((l) => groups.has(l.group) && l.locked)) throw new Error('Unlock the layers before ungrouping.');
  return layers.map((l) => groups.has(l.group) ? { ...l, group: null, groupName: undefined } : l);
}
export function rotateDesignLayers(layers, bounds, degrees) {
  const cx = bounds.x + bounds.w / 2, cy = bounds.y + bounds.h / 2;
  return layers.map((l) => {
    const c = rotatePoint(l.x + l.w / 2 - cx, l.y + l.h / 2 - cy, degrees);
    return { ...l, rotation: l.rotation + degrees, x: cx + c.x - l.w / 2, y: cy + c.y - l.h / 2 };
  });
}
export function scaleDesignLayers(layers, from, to) {
  // Non-uniform group scaling changes each member's box and center, preserving
  // rotation. It does not introduce skew into rotated members.
  const sx = to.w / from.w, sy = to.h / from.h;
  return layers.map((l) => ({ ...l, x: to.x + (l.x - from.x) * sx, y: to.y + (l.y - from.y) * sy, w: Math.max(1, l.w * sx), h: Math.max(1, l.h * sy) }));
}
export function alignDesignLayers(layers, design, mode) {
  if (!layers.length) return layers;
  const target = layers.length === 1 ? { x: 0, y: 0, w: design.width, h: design.height } : selectionBounds(layers);
  const horizontal = ['left','center','right'].includes(mode), key = horizontal ? 'x' : 'y', size = horizontal ? 'w' : 'h';
  const factor = ['left','top'].includes(mode) ? 0 : ['right','bottom'].includes(mode) ? 1 : 0.5;
  return layers.map((l) => { const b = layerBounds(l); return { ...l, [key]: l[key] + target[key] + target[size] * factor - b[key] - b[size] * factor }; });
}
export function distributeDesignLayers(layers, axis = 'x') {
  if (layers.length < 3) return layers;
  const size = axis === 'x' ? 'w' : 'h', sorted = layers.map((l) => ({ l, b: layerBounds(l) })).sort((a,b) => a.b[axis] - b.b[axis]);
  const start = sorted[0].b[axis], end = sorted.at(-1).b[axis] + sorted.at(-1).b[size];
  const gap = (end - start - sorted.reduce((sum, { b }) => sum + b[size], 0)) / (sorted.length - 1);
  let cursor = start; const offsets = new Map();
  for (const { l, b } of sorted) { offsets.set(l.id, cursor - b[axis]); cursor += b[size] + gap; }
  return layers.map((l) => ({ ...l, [axis]: l[axis] + offsets.get(l.id) }));
}

export function transformDesignLayers(layers, key, value) {
  if (!layers.length) return layers;
  const box = selectionBounds(layers);
  if (key === 'rotation') return rotateDesignLayers(layers, box, value - layers[0].rotation);
  if (key === 'w' || key === 'h') return scaleDesignLayers(layers, box, { ...box, [key]: Math.max(1, value) });
  if (key === 'x' || key === 'y') return layers.map((l) => ({ ...l, [key]: l[key] + value - box[key] }));
  if (key === 'flipX' || key === 'flipY') {
    const axis = key === 'flipX' ? 'x' : 'y', size = axis === 'x' ? 'w' : 'h';
    return layers.map((l) => ({ ...l, [axis]: box[axis] * 2 + box[size] - l[axis] - l[size], [key]: !l[key], rotation: -l.rotation }));
  }
  return layers;
}

// A private export snapshot isolates the native camera frame without changing
// the sequence, camera layout, recording media or the video export settings.
export function cameraFrameProject(project, time) {
  const clip = Object.values(project.clips || {}).filter(c=>c.enabled!==false&&c.type==='recording'&&c.recordingPart!=='screen'&&c.start<=time&&c.start+c.dur>time&&project.media?.[c.mediaId]?.streams?.camera?.hasVideo).sort((a,b)=>(b.lane||0)-(a.lane||0))[0];
  if (!clip) return null;
  const media=project.media[clip.mediaId],camera=media.streams.camera,k=Math.min(1,8192/Math.max(camera.width||1920,camera.height||1080));
  return {...project,width:Math.max(1,Math.round((camera.width||1920)*k)),height:Math.max(1,Math.round((camera.height||1080)*k)),clips:{[clip.id]:{...clip,recordingPart:'camera',props:{...clip.props,showCamera:true,showKeys:false}}},primary:[clip.id],media:{[media.id]:{...media,streams:{camera}}}};
}
