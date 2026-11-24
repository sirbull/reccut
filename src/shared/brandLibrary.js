// Brand: saved titles, lower thirds and effect presets the user styled earlier, kept across projects
// (prefs.brandItems). Design keeps its own saved layer sets (prefs.designBrandLayers).
import { deepClone, makeClip, uid } from './model.js';
import { ATTRIBUTE_GROUPS, groupsWithContent, pasteAttributes } from './attributes.js';
import { findTemplate } from './titletemplates.js';

export const BRAND_LIMIT = 500;
export const BRAND_SECTIONS = [
  { id: 'title', label: 'Titles' },
  { id: 'lowerThird', label: 'Lower Thirds' },
  { id: 'effects', label: 'Effects' },
];
// Effect presets default to the look of a clip, not where it sits or how loud it is.
export const BRAND_DEFAULT_GROUPS = ['effects', 'color', 'cameraColor', 'compositing', 'masks', 'afx'];
const GROUP_IDS = new Set(ATTRIBUTE_GROUPS.map((g) => g.id));
const EFFECT_TYPES = ['video', 'image', 'recording', 'title', 'adjustment', 'audio'];
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const cleanName = (name, fallback) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;

export function isLowerThird(props = {}, templates = {}) {
  if (props.style === 'lower') return true;
  const tpl = props.template ? findTemplate(props.template, templates) : null;
  return tpl?.category === 'Lower Thirds' || /bottom/.test(tpl?.anchor || '');
}

function validItem(item) {
  if (!plain(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !plain(item.clip) || !plain(item.clip.props)) return false;
  if (item.kind === 'title') return ['title', 'lowerThird'].includes(item.section);
  if (item.kind === 'effects') return item.section === 'effects' && EFFECT_TYPES.includes(item.clip.type) && Array.isArray(item.groups) && item.groups.length > 0 && item.groups.every((g) => GROUP_IDS.has(g));
  return false;
}
export function brandItems(raw) {
  return (Array.isArray(raw) ? raw : []).filter(validItem).slice(0, BRAND_LIMIT);
}
export function brandSection(items, section) {
  return items.filter((i) => i.section === section);
}

function clipCore(clip, keep = () => true) {
  const pick = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keep(k)).map(([k, v]) => [k, deepClone(v)]));
  return {
    type: clip.type,
    ...(clip.recordingPart ? { recordingPart: clip.recordingPart } : {}),
    in: Number(clip.in) || 0,
    dur: Math.max(0.1, Number(clip.dur) || 3),
    props: pick(clip.props),
    kf: pick(clip.kf),
    ...(clip.expressions && Object.keys(clip.expressions).length ? { expressions: pick(clip.expressions) } : {}),
  };
}

// A title or lower third with its text, font, colors, animation, keyframes and length.
// A custom template from the project travels with it, so it works in other projects.
export function brandTitleItem(clip, { name, templates = {} } = {}) {
  if (clip?.type !== 'title') throw new Error('Select a title or lower third first.');
  const custom = clip.props.template && templates[clip.props.template];
  return {
    id: uid(),
    kind: 'title',
    section: isLowerThird(clip.props, templates) ? 'lowerThird' : 'title',
    name: cleanName(name, clip.name || clip.props.text || 'Title'),
    created: Date.now(),
    clip: clipCore(clip),
    ...(custom ? { template: deepClone(custom) } : {}),
  };
}

// Which attribute groups a clip has something to save in, and which of them to tick by default.
export function brandEffectGroups(clip) {
  const available = groupsWithContent(clip);
  return { available, preferred: available.filter((g) => BRAND_DEFAULT_GROUPS.includes(g)) };
}

// An effect preset: the chosen attribute groups of a clip, with their keyframes and expressions.
export function brandEffectsItem(clip, { name, groups } = {}) {
  if (!clip || !EFFECT_TYPES.includes(clip.type)) throw new Error('Select a video, image, recording, title, adjustment layer or audio clip first.');
  const { available, preferred } = brandEffectGroups(clip);
  const chosen = (Array.isArray(groups) ? groups : preferred).filter((g) => available.includes(g));
  if (!chosen.length) throw new Error('The clip has no effects to save. Add effects, color or audio effects first.');
  const rules = ATTRIBUTE_GROUPS.filter((g) => chosen.includes(g.id));
  const keep = (k) => rules.some((g) => g.keys(k));
  return {
    id: uid(),
    kind: 'effects',
    section: 'effects',
    name: cleanName(name, `${clip.name || 'Clip'} Effects`),
    created: Date.now(),
    groups: chosen,
    clip: clipCore(clip, keep),
  };
}

// A new title clip at T from a saved title. Returns { clip, template } (template to add to the project, if any).
export function brandTitleClip(item, T, lane = 1) {
  const saved = item.clip;
  const clip = makeClip('title', { start: T, dur: saved.dur, lane, name: item.name });
  clip.in = saved.in || 0;
  Object.assign(clip.props, deepClone(saved.props));
  clip.kf = deepClone(saved.kf || {});
  if (saved.expressions) clip.expressions = deepClone(saved.expressions);
  return { clip, template: item.template ? deepClone(item.template) : null };
}

// Applies a saved effect preset to a clip. Gives the number of attribute groups applied.
export function applyBrandEffects(item, dst) {
  const src = { ...item.clip, props: item.clip.props || {}, kf: item.clip.kf || {} };
  return pasteAttributes(src, dst, item.groups, { stretch: false });
}

export function canApplyBrandEffects(item, dst) {
  if (!dst || ['gap', 'caption'].includes(dst.type)) return false;
  const probe = deepClone(dst);
  return applyBrandEffects(item, probe) > 0;
}

export function renameBrandItem(items, id, name) {
  return items.map((i) => (i.id === id ? { ...i, name: cleanName(name, i.name) } : i));
}

/* Design: saved layer sets in the same format as copied Design layers. */
export function designBrandLayers(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((s) => plain(s) && typeof s.id === 'string' && typeof s.name === 'string' && s.width > 0 && s.height > 0 && Array.isArray(s.layers) && s.layers.length > 0 && s.layers.length <= 2000)
    .slice(0, BRAND_LIMIT);
}
