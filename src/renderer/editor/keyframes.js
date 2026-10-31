import { setKeyframe as setModelKeyframe } from '../../shared/model.js';
import { prefs } from '../prefs.js';

// Alle manuelle nøkkelbilder bruker samme standard, også i inspektøren og visningen.
export function setKeyframe(clip, prop, time, value) {
  setModelKeyframe(clip, prop, time, value, prefs.value.keyframeEasing);
}
