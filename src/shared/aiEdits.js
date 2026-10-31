import { makeVideoEffect } from './videoEffects.js';
const PROPERTY_RANGES = {
  exposure: [-1, 1],
  contrast: [-1, 1],
  saturation: [-1, 1],
  temperature: [-1, 1],
  opacity: [0, 1],
  volume: [-60, 12],
  micVolume: [-60, 12],
  sysVolume: [-60, 12],
  blur: [0, 100],
  vFadeIn: [0, 30],
  vFadeOut: [0, 30],
  aFadeIn: [0, 30],
  aFadeOut: [0, 30],
};
const VISUAL = ['video', 'image', 'recording', 'title'];
export function parseAIReply(text) {
  try {
    const data = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    if (typeof data.reply !== 'string' || !Array.isArray(data.actions)) throw new Error();
    return { reply: data.reply, actions: data.actions };
  } catch {
    return { reply: text, actions: [] };
  }
}
export function validateAIActions(p, actions) {
  if (!Array.isArray(actions) || actions.length > 100) throw new Error('Too many proposed edits.');
  return actions.map((a) => {
    const c = typeof a?.clipId === 'string' && Object.hasOwn(p.clips, a.clipId) && p.clips[a.clipId];
    if (!c) throw new Error('A proposed edit refers to a clip that no longer exists.');
    if (a.type === 'rename') {
      if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 200) throw new Error('Invalid clip name.');
      return { type: a.type, clipId: c.id, name: a.name.trim() };
    }
    if (a.type === 'setProperty') {
      const range = Object.hasOwn(PROPERTY_RANGES, a.property) && PROPERTY_RANGES[a.property];
      if (
        !range ||
        typeof a.value !== 'number' ||
        !Number.isFinite(a.value) ||
        a.value < range[0] ||
        a.value > range[1]
      )
        throw new Error('Unsupported property or value in proposed edit.');
      const audio = ['volume', 'micVolume', 'sysVolume'].includes(a.property) || a.property.startsWith('aFade');
      if (['micVolume', 'sysVolume'].includes(a.property) && c.type !== 'recording')
        throw new Error('Component volume applies only to recordings.');
      if (!(audio ? ['video', 'audio', 'recording'] : VISUAL).includes(c.type))
        throw new Error('This property does not apply to the clip.');
      if (c.kf?.[a.property]?.length)
        throw new Error('This property has keyframes. Edit those in the inspector first.');
      if (a.property.includes('Fade') && a.value > c.dur) throw new Error('A fade cannot be longer than its clip.');
      return { type: a.type, clipId: c.id, property: a.property, value: a.value };
    }
    if (a.type === 'addEffect') {
      if (
        !['video', 'image', 'recording'].includes(c.type) ||
        !['chroma', 'luma', 'blur', 'saturation', 'contrast', 'opacity'].includes(a.effect)
      )
        throw new Error('Unsupported effect proposal.');
      return { type: a.type, clipId: c.id, effect: a.effect };
    }
    throw new Error('Unsupported AI action.');
  });
}
export function applyAIActions(p, actions) {
  const valid = validateAIActions(p, actions); // Validate the whole batch before any mutation.
  for (const a of valid) {
    const c = p.clips[a.clipId];
    if (a.type === 'rename') c.name = a.name;
    else if (a.type === 'setProperty') c.props[a.property] = a.value;
    else {
      const e = makeVideoEffect(a.effect);
      if (c.type === 'recording') e.target = p.media[c.mediaId]?.streams?.camera?.hasVideo ? 'camera' : 'screen';
      c.props.vfx = [...(c.props.vfx || []), e];
    }
  }
}
export function aiContext(p, selection, time) {
  const all = Object.values(p.clips),
    ids = new Set(selection);
  const clips = [...all.filter((c) => ids.has(c.id)), ...all.filter((c) => !ids.has(c.id))].slice(0, 100);
  return {
    name: p.name,
    width: p.width,
    height: p.height,
    fps: p.fps,
    duration: p.duration,
    playhead: time,
    selected: selection,
    omittedClips: Math.max(0, all.length - clips.length),
    clips: clips.map((c) => ({
      id: c.id,
      name: c.name || p.media[c.mediaId]?.name || c.type,
      type: c.type,
      start: c.start,
      duration: c.dur,
      sourceIn: c.in,
      lane: c.lane,
      properties: Object.fromEntries(Object.entries(c.props || {}).filter(([k]) => Object.hasOwn(PROPERTY_RANGES, k))),
      effectTypes: (c.props?.vfx || []).map((e) => e.type),
      ...(c.type === 'caption' ? { text: String(c.props.text).slice(0, 1000) } : {}),
    })),
  };
}
