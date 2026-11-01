import { valueAt } from './model.js';

// Shared by the inspector and renderer. Position is in project pixels; softness
// scales the amount's blur, while opacity and position can be set independently.
export function shadowStyle(clip, T, height) {
  const amount = Math.max(0, valueAt(clip, 'shadow', T) || 0);
  const color = clip.props.shadowColor;
  return {
    color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#000000',
    opacity: Math.max(0, Math.min(1, valueAt(clip, 'shadowOpacity', T) ?? 0.75 * amount)),
    blur: height * 0.045 * amount * Math.max(0, valueAt(clip, 'shadowSoftness', T) ?? 1),
    offsetX: valueAt(clip, 'shadowOffsetX', T) ?? 0,
    offsetY: valueAt(clip, 'shadowOffsetY', T) ?? height * 0.012 * amount,
  };
}
