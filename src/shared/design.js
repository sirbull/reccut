import { uid, sourceTime } from './model.js';
export { dilateAlpha, erodeAlpha, designClipGroups, layerToSourcePoint, sourceToLayerPoint } from './designMasks.js';
import { normalizeTextStyles } from './designRichText.js';
import { normalizeDesignPattern } from './designPattern.js';
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
  const spread = Math.max(0, l.box?.padding || 0) + (l.box?.border?.width || 0) + (l.outline?.width || 0) + (l.box?.shape==='ellipse'?Math.max(l.w,l.h)*(Math.SQRT2-1)/2:0);
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
// Pen paths: nodes are fractions of the layer box, see designPath.js.
export function normalizeDesignPath(p) {
  const keys = ['x', 'y', 'ix', 'iy', 'ox', 'oy'];
  const nodes = (Array.isArray(p?.nodes) ? p.nodes : []).slice(0, 2000).filter((n) => n && keys.every((k) => Number.isFinite(n[k])))
    .map((n) => Object.fromEntries(keys.map((k) => [k, number(n[k], 0, -1000, 1000)])));
  return nodes.length >= 2 ? { closed: Boolean(p.closed) && nodes.length > 2, nodes } : null;
}
export function normalizeLayer(input) {
  const l = object(input);
  if (!['text', 'image', 'shape'].includes(l.type)) return null;
  const result = {
    ...l, id: string(l.id, uid()), type: l.type, name: string(l.name, l.type === 'text' ? 'Title' : l.type === 'shape' ? DESIGN_SHAPES.find((s) => s.value === l.shape)?.label || (l.shape === 'path' ? 'Path' : 'Rectangle') : 'Image'),
    x: number(l.x, 0), y: number(l.y, 0), w: number(l.w, 400, 1, 65536), h: number(l.h, l.type === 'text' ? 150 : 300, 1, 65536),
    rotation: number(l.rotation, 0, -36000, 36000), flipX: Boolean(l.flipX), flipY: Boolean(l.flipY),
    opacity: number(l.opacity, 1, 0, 1), blend: BLEND_MODES.includes(l.blend) ? l.blend : 'source-over',
    hidden: Boolean(l.hidden), locked: Boolean(l.locked), group: l.group || null,
    fill: fill(l.fill, l.fill === null ? null : solidFill()), stroke: normalizeStroke(l.stroke, l.type), shadows: Array.isArray(l.shadows) ? l.shadows.filter(Boolean).slice(0, 32).map(normalizeShadow) : [],
    mask: normalizeDesignMask(l.mask), clip: Boolean(l.clip), style: l.style || null,
    outline: l.outline ? { color: /^#[\da-f]{6}$/i.test(l.outline.color) ? l.outline.color : '#ffffff', width: number(l.outline.width, 0, 0, 500) } : null,
  };
  if (l.type === 'text') Object.assign(result, {
    text: string(l.text, 'Title'), textStyles: normalizeTextStyles(l.textStyles,string(l.text,'Title')), font: string(l.font, 'sans'), weight: number(l.weight, 800, 100, 900), size: number(l.size, 96, 6, 4096),
    tracking: number(l.tracking, 0, -100, 500), lineHeight: number(l.lineHeight, 1.1, 0.5, 5),
    align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'center', valign: ['top', 'middle', 'bottom'].includes(l.valign) ? l.valign : 'middle',
    uppercase: Boolean(l.uppercase), autofit: l.autofit !== false, highlight: fill(l.highlight, l.highlight === null ? null : solidFill('#ff453a')),
    box: l.box ? {
      fill: fill(l.box.fill, l.box.fill === null ? null : solidFill('#000000')), padding: number(l.box.padding, 8, 0, 500), radius: number(l.box.radius, 8, 0, 500),
      ...(l.box.block ? {block:true} : {}), ...(l.box.autoSize ? {autoSize:true} : {}),
      ...(l.box.shape ? {shape:['rounded','cut','ribbon','ellipse','ticket'].includes(l.box.shape)?l.box.shape:'rounded'} : {}),
      ...(l.box.border ? {border:{color:/^#[\da-f]{6}$/i.test(l.box.border.color)?l.box.border.color:'#000000',width:number(l.box.border.width,2,0,100),dash:l.box.border.dash==='dashed'?'dashed':'solid'}} : {}),
    } : null,
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
    const path = l.shape === 'path' ? normalizeDesignPath(l.path) : null;
    if (path) result.path = path; else delete result.path;
    Object.assign(result, { pattern: normalizeDesignPattern(l.pattern), shape: path ? 'path' : DESIGN_SHAPES.some((s) => s.value === l.shape) ? l.shape : 'rect', radius: number(l.radius, 0, 0, Math.min(result.w, result.h) / 2), sides: Math.round(number(l.sides, 6, 3, 12)), points: Math.round(number(l.points, 5, 3, 24)), inner: number(l.inner, 0.5, 0.05, 1), head: number(l.head, 1, 0.1, 10) });
    if (['line', 'arrow'].includes(result.shape)) {
      result.fill = null;
      if (l.stroke === undefined) result.stroke = normalizeStroke({ fill: solidFill(), width: 8 });
    }
  }
  if((l.type!=='text'||l.text===l.emoji?.text)&&l.emoji&&typeof l.emoji.text==='string'&&l.emoji.text.length<=100&&['system','flat','outline'].includes(l.emoji.style))result.emoji={text:l.emoji.text,style:l.emoji.style};else delete result.emoji;
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
export function resizeDesign(d, width, height, anchor = { x: 0.5, y: 0.5 }) {
  if (!validDesignSize(width, height)) throw new Error('Width and height must be whole numbers from 1 to 8192 pixels.');
  return { ...d, width, height, size: 'custom', layers: d.layers.map((l) => ({ ...l, x: l.x + (width - d.width) * number(anchor.x,0.5,0,1), y: l.y + (height - d.height) * number(anchor.y,0.5,0,1) })) };
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

// Generic overlay areas for preview, not platform upload specifications.
const badgeZone = { x: 0.8, y: 0.84, w: 0.2, h: 0.16, label: 'Duration badge' };
for (const preset of DESIGN_SIZES) preset.safe = preset.group === 'Video' ? [badgeZone] : preset.id === 'reels' ? [{ x: 0.88, y: 0.12, w: 0.12, h: 0.76, label: 'Side controls' }, { x: 0, y: 0.82, w: 1, h: 0.18, label: 'Caption area' }] : [];
export function designSafeZones(d) {
  return (DESIGN_SIZES.find(s => s.id === d.size)?.safe || []).map(z => ({ ...z, x: z.x*d.width, y: z.y*d.height, w: z.w*d.width, h: z.h*d.height }));
}
// https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
export function contrastRatio(a,b) {
  const luminance = color => {
    const rgb = typeof color === 'string' ? (color.match(/[a-f\d]{2}/gi)||[]).map(v=>parseInt(v,16)) : color;
    const values = [0,1,2].map(i=>{const s=Math.max(0,Math.min(255,rgb?.[i]||0))/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4;});
    return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;
  };
  const x=luminance(a),y=luminance(b);return(Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
}
export function readabilityWarnings(d,{textSizes={},contrasts={}}={}) {
  const warnings=[],zones=designSafeZones(d);
  for(const l of d.layers.filter(l=>l.type==='text'&&!l.hidden&&l.opacity>0&&l.text.trim())) {
    const size=(textSizes[l.id]??l.size)*Math.min(168/d.width,94.5/d.height),b=layerBounds(l);
    if(size<12)warnings.push({layerId:l.id,kind:'small',message:`Text is about ${Math.max(0,Math.round(size))} px at small preview size.`});
    if(Number.isFinite(contrasts[l.id])&&contrasts[l.id]<3)warnings.push({layerId:l.id,kind:'contrast',message:`Text fill contrast is about ${contrasts[l.id].toFixed(1)}:1. Aim for 3:1 or more.`});
    for(const z of zones)if(b.x<z.x+z.w&&b.x+b.w>z.x&&b.y<z.y+z.h&&b.y+b.h>z.y)warnings.push({layerId:l.id,kind:'safe',message:`Text overlaps the ${z.label.toLowerCase()}.`});
  }
  return warnings;
}
export function duplicateDesign(d,{variant=false}={}) {
  const copy=structuredClone(d),groups=new Map();copy.id=uid();copy.created=Date.now();copy.name=`${d.name} ${variant?'variant':'copy'}`;copy.favorite=false;
  if(variant)copy.variantOf=d.variantOf||d.id;
  copy.layers=copy.layers.map(l=>{if(l.group&&!groups.has(l.group))groups.set(l.group,uid());return{...l,id:uid(),group:l.group?groups.get(l.group):null};});return copy;
}
export function designVariants(designs,d) {const group=d?.variantOf||d?.id;return Object.values(designs||{}).filter(v=>v.id===group||v.variantOf===group);}
export function resizeDesignContent(d,width,height) {
  if(!validDesignSize(width,height))throw new Error('Width and height must be whole numbers from 1 to 8192 pixels.');
  const k=Math.min(width/d.width,height/d.height);
  const axis=(pos,len,total,target,anchor)=>anchor==='stretch'?{pos:pos*k,len:Math.max(1,target-(total-len)*k)}:{len:len*k,pos:anchor==='left'||anchor==='top'?pos*k:anchor==='right'||anchor==='bottom'?target-(total-pos)*k:(pos+len/2)/total*target-len*k/2};
  const scaleAppearance=(l,s)=>({...l,...(l.type==='text'?{size:Math.max(6,l.size*s),tracking:l.tracking*s}:{}),radius:(l.radius||0)*s,stroke:l.stroke?{...l.stroke,width:l.stroke.width*s}:null,outline:l.outline?{...l.outline,width:l.outline.width*s}:null,box:l.box?{...l.box,padding:l.box.padding*s,radius:l.box.radius*s,...(l.box.border?{border:{...l.box.border,width:l.box.border.width*s}}:{})}:null,shadows:l.shadows.map(sh=>({...sh,x:sh.x*s,y:sh.y*s,blur:sh.blur*s,spread:sh.spread*s}))});
  const layers=d.layers.map(original=>{
    const x=axis(original.x,original.w,d.width,width,original.anchor?.x),y=axis(original.y,original.h,d.height,height,original.anchor?.y);
    let l=scaleAppearance({...structuredClone(original),x:x.pos,y:y.pos,w:x.len,h:y.len},k),b=layerBounds(l),fit=Math.min(1,width/b.w,height/b.h);
    if(fit<1){l=scaleAppearance({...l,w:l.w*fit,h:l.h*fit},fit);b=layerBounds(l);}
    l.x+=Math.max(0,-b.x)-Math.max(0,b.x+b.w-width);l.y+=Math.max(0,-b.y)-Math.max(0,b.y+b.h-height);return l;
  });return{...d,width,height,size:'custom',layers};
}
export function cropDesignCanvas(d,rect) {
  const x=Math.max(0,Math.min(d.width-1,Math.round(rect.x))),y=Math.max(0,Math.min(d.height-1,Math.round(rect.y))),width=Math.min(d.width-x,Math.round(rect.w)),height=Math.min(d.height-y,Math.round(rect.h));
  if(!validDesignSize(width,height))throw new Error('Crop must contain at least one pixel.');
  return{...d,width,height,size:'custom',layers:d.layers.map(l=>({...l,x:l.x-x,y:l.y-y}))};
}
function transformBackground(fill,point) {
  if(fill?.type!=='gradient')return fill;
  const g=gradientParams(fill.gradient);return{...fill,gradient:{...g,start:point(g.start),end:point(g.end),center:point(g.center),points:g.points.map(p=>({...p,...point(p)}))}};
}
export function rotateDesignCanvas(d,direction=1) {
  const clockwise=direction>0,point=p=>clockwise?{x:1-p.y,y:p.x}:{x:p.y,y:1-p.x};
  return{...d,width:d.height,height:d.width,size:'custom',background:transformBackground(d.background,point),layers:d.layers.map(l=>{
    const cx=l.x+l.w/2,cy=l.y+l.h/2;return{...l,x:(clockwise?d.height-cy:cy)-l.w/2,y:(clockwise?cx:d.width-cx)-l.h/2,rotation:((l.rotation+(clockwise?90:-90))%360+360)%360,...(l.anchor?{anchor:{x:(clockwise?{top:'right',middle:'center',bottom:'left',stretch:'stretch'}:{top:'left',middle:'center',bottom:'right',stretch:'stretch'})[l.anchor.y],y:(clockwise?{left:'top',center:'middle',right:'bottom',stretch:'stretch'}:{left:'bottom',center:'middle',right:'top',stretch:'stretch'})[l.anchor.x]}}:{})};
  })};
}
export function flipDesignCanvas(d,axis='x') {
  return{...d,background:transformBackground(d.background,p=>axis==='x'?{x:1-p.x,y:p.y}:{x:p.x,y:1-p.y}),layers:d.layers.map(l=>({...l,x:axis==='x'?d.width-l.x-l.w:l.x,y:axis==='y'?d.height-l.y-l.h:l.y,rotation:-l.rotation,...(axis==='x'?{flipX:!l.flipX}:{flipY:!l.flipY}),...(l.anchor?{anchor:{...l.anchor,...(axis==='x'?{x:({left:'right',right:'left'})[l.anchor.x]||l.anchor.x}:{y:({top:'bottom',bottom:'top'})[l.anchor.y]||l.anchor.y})}}:{})}))};
}
