// Vis samlet volum i studioet, men behold klippnivå og sporvolum som separate innstillinger.
import { valueAt } from '../../shared/model.js';
import { itemParts } from '../../shared/voiceover.js';
import { shiftVolume } from '../editor/volume.js';

export function studioVolumeClip(it, trackGain = 0) {
  return {
    in: it.in, start: it.at, dur: it.dur,
    props: { volume: (it.take.gain || 0) + trackGain },
    kf: it.take.volKf?.length ? { volume: it.take.volKf.map(([t, db, ...rest]) => [t, db + trackGain, ...rest]) } : {},
  };
}

export function studioVolumeAt(it, trackGain = 0, time = it.at) {
  const t = Math.max(it.at, Math.min(it.at + it.dur, time));
  const parts = itemParts(it);
  const part = parts.find((p) => t < p.at + p.dur) || parts.at(-1);
  return valueAt(studioVolumeClip({ ...it, ...part }, trackGain), 'volume', t) ?? 0;
}

export function studioVolumePatch(it, trackGain, value, time = it.at) {
  const clip = studioVolumeClip(it);
  // Ved nøkkelbilder forskyves hele kurven med samme beløp. Sporvolumet legges bare til i visningen.
  const indices = (clip.kf.volume || []).map((_, i) => i);
  shiftVolume(clip, 'volume', value - studioVolumeAt(it, trackGain, time), indices);
  return clip.kf.volume?.length ? { volKf: clip.kf.volume } : { gain: clip.props.volume, volKf: null };
}
