import { makeClip, newProject, TRANSITIONS, uid, updateDuration, relayoutPrimary, CAPTION_LANE } from './model.js';
import { insertIntoPrimary } from './ops.js';
import { IMAGE_FITS, enableKenBurns } from './imageMotion.js';

export const SLIDESHOW_DEFAULTS = { duration: 5, transitionMode: 'dissolve', transitionDuration: 1, transitions: ['dissolve'],
  fit: 'contain', motion: 'kenBurns', amount: 0.12, background: true, backgroundBlur: 28, backgroundDarken: 0.55, order: 'browser' };
const bound = (v, fallback, a, b) => Math.max(a, Math.min(b, Number.isFinite(Number(v)) ? Number(v) : fallback));
export function slideshowOptions(input = {}, fps = 30) {
  const p = { ...SLIDESHOW_DEFAULTS, ...input };
  const duration = Math.round(bound(p.duration, 5, 2 / fps, 3600) * fps) / fps;
  return { duration, transitionMode: ['none', 'dissolve', 'random'].includes(p.transitionMode) ? p.transitionMode : 'dissolve',
    transitionDuration: Math.max(1 / fps, Math.round(bound(p.transitionDuration, 1, 1 / fps, Math.min(4, duration * 0.45)) * fps) / fps),
    transitions: [...new Set((Array.isArray(p.transitions) ? p.transitions : []).filter((id) => TRANSITIONS.some((t) => t.id === id)))],
    fit: IMAGE_FITS.some((f) => f.value === p.fit) ? p.fit : 'contain', motion: ['none', 'kenBurns', 'pan'].includes(p.motion) ? p.motion : 'kenBurns',
    amount: bound(p.amount, 0.12, 0.01, 0.6), background: Boolean(p.background),
    backgroundBlur: bound(p.backgroundBlur, 28, 0, 80), backgroundDarken: bound(p.backgroundDarken, 0.55, 0, 1),
    order: ['browser', 'name', 'shuffle'].includes(p.order) ? p.order : 'browser' };
}
const randomSource = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let v = Math.imul(seed ^ (seed >>> 15), 1 | seed); v ^= v + Math.imul(v ^ (v >>> 7), 61 | v); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
export function addSlideshow(project, mediaIds, options = {}, { seed = Math.floor(Math.random() * 4294967296) } = {}) {
  const p = slideshowOptions(options, project.fps);
  const media = [...new Set(mediaIds)].map((id) => project.media[id]);
  if (!media.length || media.some((m) => !m || m.kind !== 'image' || m.offline)) throw new Error('Select available still images to create a slideshow.');
  if (project.lanes?.[0]?.locked) throw new Error('Unlock the storyline before adding a slideshow.');
  if (p.transitionMode === 'random' && !p.transitions.length) throw new Error('Choose at least one transition, or turn transitions off.');
  const random = randomSource(seed);
  if (p.order === 'name') media.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }));
  if (p.order === 'shuffle') for (let i = media.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [media[i], media[j]] = [media[j], media[i]]; }
  const slideshowId = uid(), primaries = [], foregrounds = [];
  const handles = p.transitionMode === 'none' ? 0 : p.transitionDuration / 2;
  let previousTransition;
  for (const [i, m] of media.entries()) {
    const fg = makeClip('image', { media: m, dur: p.duration, name: m.name, props: { imageFit: p.fit } });
    fg.slideshowId = slideshowId;
    if (p.motion !== 'none') {
      const modes = p.motion === 'pan' ? ['left', 'right', 'up', 'down'] : ['in', 'out'];
      enableKenBurns(fg, modes[Math.floor(random() * modes.length)], p.amount, handles);
      fg.props.kenBurnsAxisX = random() > 0.5 ? 0.65 : -0.65;
      fg.props.kenBurnsAxisY = random() > 0.5 ? 0.45 : -0.45;
    }
    let primary = fg;
    if (p.background) {
      const bg = makeClip('image', { media: m, dur: p.duration, name: `${m.name || 'Image'} · background`,
        props: { imageFit: 'cover', scale: 1.12, blur: p.backgroundBlur, exposure: -p.backgroundDarken * 0.9, fx: p.backgroundBlur ? ['blur'] : [] } });
      bg.slideshowId = slideshowId; bg.slideshowForeground = fg.id; fg.slideshowParent = bg.id;
      bg.group = fg.group = uid(); fg.lane = 1; primary = bg;
    }
    if (i > 0 && p.transitionMode !== 'none') {
      const pool = p.transitionMode === 'dissolve' ? ['dissolve'] : p.transitions;
      const choices = pool.length > 1 ? pool.filter((id) => id !== previousTransition) : pool;
      const type = choices[Math.floor(random() * choices.length)]; previousTransition = type;
      primary.transition = { type, dur: p.transitionDuration, audio: false };
    }
    primaries.push(primary); foregrounds.push(fg);
  }
  // Leave existing connected layers intact, even if they extend past the storyline.
  relayoutPrimary(project);
  const primaryEnd = project.primary.reduce((sum, id) => sum + project.clips[id].dur, 0);
  const end = Math.max(primaryEnd, ...Object.values(project.clips).map((c) => c.start + c.dur), 0);
  if (end > primaryEnd + 1 / project.fps) primaries.unshift(makeClip('gap', { dur: end - primaryEnd, name: 'Gap' }));
  insertIntoPrimary(project, primaries);
  for (const fg of foregrounds) if (fg.slideshowParent) {
    fg.start = project.clips[fg.slideshowParent].start;
    project.clips[fg.slideshowParent].group = fg.group;
    while (project.lanes?.[fg.lane]?.locked) fg.lane++;
    if (fg.lane >= CAPTION_LANE) throw new Error('No available video track for the slideshow.');
    project.clips[fg.id] = fg;
  }
  project.autoFormat = false;
  updateDuration(project);
  return { id: slideshowId, foregrounds: foregrounds.map((c) => c.id), backgrounds: foregrounds.filter((c) => c.slideshowParent).map((c) => c.slideshowParent),
    start: foregrounds[0].start, end: foregrounds.at(-1).start + p.duration, options: p };
}
export function slideshowPreviewProject(source, ids, options) {
  const p = newProject('Slideshow preview');
  Object.assign(p, { width: source.width, height: source.height, fps: source.fps, media: source.media, autoFormat: false });
  addSlideshow(p, ids.slice(0, 3), options, { seed: 1729 });
  return p;
}
