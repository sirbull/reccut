// Spilleren i redigeringen, koblet til prosjektet og spillhodet i tilstanden.
// Mens du skummer (tidslinjen eller biblioteket), viser den det pekeren står over.
import { effect } from '@preact/signals';
import { primaryAt } from '../../shared/model.js';
import { createPlayer, fileUrl } from '../player.js';
import { getTime, loadMotion, motionVersion, playing, project, setTime, skim, skimming } from './store.js';
import { prefs } from '../prefs.js';

export { fileUrl };

const player = createPlayer({
  getProject: () => skim.value?.project || project.value,
  playing,
  getTime: () => (skim.value && !playing.value ? skim.value.T : getTime()),
  setTime,
});

export const { attachCanvas, resizeCanvas, start, stopLoop, getRate, invalidate, scrubAudio } = player;

function preparePlayback() {
  const preview = skim.value;
  const fromPointer = !playing.value && prefs.value.playbackFromSkimmer && skimming.value &&
    preview && !preview.project && !preview.mediaId && Number.isFinite(preview.T);
  skim.value = null;
  if (fromPointer) player.seek(preview.T);
}

export function play(r = 1) {
  preparePlayback();
  player.play(r);
}
export function pause() {
  player.pause();
}
export function toggle() {
  preparePlayback();
  player.toggle();
}
// Shift mellomrom: spill bakover, eller stopp om det allerede spiller.
export function playReverse() {
  preparePlayback();
  if (playing.value) player.pause();
  else player.play(-1);
}
export function shuttle(dir) {
  if (dir) preparePlayback();
  player.shuttle(dir);
}
export function seek(T) {
  skim.value = null;
  player.seek(T);
}

effect(() => {
  project.value;
  skim.value;
  motionVersion.value;
  player.invalidate();
});

// Analysene for stabiliserte klipp lastes når de trengs.
effect(() => {
  const p = project.value;
  for (const c of Object.values(p.clips)) {
    if (!c.props?.stabilize) continue;
    const path = p.media[c.mediaId]?.streams?.main?.motion;
    if (path) loadMotion(path);
  }
});

export function currentClipAtPlayhead() {
  const p = primaryAt(project.value, getTime());
  return p?.clip || p?.b || null;
}
