// Felles egenskaper for en valgt gruppe. Gruppens medlemmer beholder sine egne verdier.
import { isVisual, valueAt } from './model.js';

export function groupVisuals(project, ids) {
  return ids.map((id) => project.clips[id]).filter((c) => c && isVisual(c) && typeof c.props.opacity === 'number');
}

export function groupPositionClips(project, ids) {
  return groupVisuals(project, ids).filter((c) => !['adjustment', 'gap'].includes(c.type) && !(c.type === 'redact' && c.props.shape === 'full'));
}

// Flytt hele bevegelsesbanen like langt, også når medlemmene har ulike nøkkelbildetider.
export function setGroupPosition(project, ids, prop, value, T) {
  if (!['x', 'y'].includes(prop) || !Number.isFinite(value)) return;
  const clips = groupPositionClips(project, ids);
  if (!clips.length) return;
  const delta = value - (valueAt(clips[0], prop, T) ?? 0);
  for (const c of clips) {
    c.props[prop] = (c.props[prop] ?? 0) + delta;
    for (const k of c.kf?.[prop] || []) k[1] += delta;
  }
}

export function setGroupOpacity(project, ids, value, T) {
  if (!Number.isFinite(value)) return;
  const clamp = (v) => Math.max(0, Math.min(1, v));
  for (const c of groupVisuals(project, ids)) {
    const delta = clamp(value) - (valueAt(c, 'opacity', T) ?? 1);
    c.props.opacity = clamp(c.props.opacity + delta);
    for (const k of c.kf?.opacity || []) k[1] = clamp(k[1] + delta);
  }
}
