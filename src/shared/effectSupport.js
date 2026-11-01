import { EFFECTS } from './model.js';
import { VIDEO_EFFECTS } from './videoEffects.js';

export function effectWarning(clip, id, kind = 'effect') {
  if (clip?.type !== 'adjustment') return null;
  if (kind === 'afx' || kind === 'apreset')
    return 'Audio effects do not work on adjustment layers. Apply them to a clip with sound.';
  const effect = EFFECTS.find((e) => e.id === id) || VIDEO_EFFECTS.find((e) => e.type === id);
  return effect?.adjustment === false
    ? `${effect.label} does not work on adjustment layers. Apply it directly to a source clip.`
    : null;
}
