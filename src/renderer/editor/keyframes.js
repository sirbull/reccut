import { baseValueAt, keyframeIndexAt, kfToTimeline, removeKeyframe, setKeyframe as setModelKeyframe } from '../../shared/model.js';
import { prefs } from '../prefs.js';

// Posisjon og ankerpunkt er ett punkt hver: får X et nøkkelbilde, får Y et på samme tid, og omvendt.
// Da går det alltid en bane mellom nøkkelbildene i visningen.
const PAIRS = { x: 'y', y: 'x', anchorX: 'anchorY', anchorY: 'anchorX' };
export const pairOf = (prop) => PAIRS[prop];

// Har egenskapen (eller paret dens) nøkkelbilder, skal en endring i visningen bli et nøkkelbilde.
export const keyframed = (clip, prop) => Boolean(clip.kf?.[prop]?.length || clip.kf?.[PAIRS[prop]]?.length);

function matchPair(clip, prop) {
  const other = PAIRS[prop];
  if (!other) return;
  const times = [...(clip.kf[prop] || []), ...(clip.kf[other] || [])].map((k) => k[0]);
  // Verdiene leses før noe settes inn, så kurvene ikke endres underveis.
  const missing = [];
  for (const key of [prop, other]) for (const t of times) if (keyframeIndexAt(clip, key, t, 1e-4) < 0) missing.push([key, t, baseValueAt(clip, key, kfToTimeline(clip, t))]);
  for (const [key, t, v] of missing) setModelKeyframe(clip, key, t, v, prefs.value.keyframeEasing);
}

// Alle manuelle nøkkelbilder bruker samme standard, også i inspektøren og visningen.
export function setKeyframe(clip, prop, time, value) {
  setModelKeyframe(clip, prop, time, value, prefs.value.keyframeEasing);
  matchPair(clip, prop);
}

export function removeKeyframePair(clip, prop, time) {
  removeKeyframe(clip, prop, time);
  if (PAIRS[prop]) removeKeyframe(clip, PAIRS[prop], time);
}
