// Shared by design layers and timeline clips. Blend the completed clip, including
// its effects and masks, with the visible picture on lower video tracks.
export const BLEND_MODES = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];
export const BLEND_MODE_OPTIONS = BLEND_MODES.map(value => ({
  value,
  label: value === 'source-over' ? 'Normal' : value.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '),
}));

export function canBlend(clip) {
  return ['video', 'image', 'recording', 'title'].includes(clip.type);
}

export function clipBlendMode(clip) {
  return canBlend(clip) && BLEND_MODES.includes(clip.props.blendMode) ? clip.props.blendMode : 'source-over';
}
