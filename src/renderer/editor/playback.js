// Spilleren i redigeringen, koblet til prosjektet og spillhodet i tilstanden.
// Mens du skummer (tidslinjen eller biblioteket), viser den det pekeren står over.
import { effect } from '@preact/signals';
import { primaryAt } from '../../shared/model.js';
import { createPlayer, fileUrl } from '../player.js';
import { getTime, playing, project, setTime, skim } from './store.js';

export { fileUrl };

const player = createPlayer({
  getProject: () => skim.value?.project || project.value,
  playing,
  getTime: () => (skim.value && !playing.value ? skim.value.T : getTime()),
  setTime,
});

export const { attachCanvas, resizeCanvas, start, stopLoop, getRate, invalidate, scrubAudio } = player;

export function play(r = 1) {
  skim.value = null;
  player.play(r);
}
export function pause() {
  player.pause();
}
export function toggle() {
  skim.value = null;
  player.toggle();
}
// Shift mellomrom: spill bakover, eller stopp om det allerede spiller.
export function playReverse() {
  skim.value = null;
  if (playing.value) player.pause();
  else player.play(-1);
}
export function shuttle(dir) {
  skim.value = null;
  player.shuttle(dir);
}
export function seek(T) {
  player.seek(T);
}

effect(() => {
  project.value;
  skim.value;
  player.invalidate();
});

export function currentClipAtPlayhead() {
  const p = primaryAt(project.value, getTime());
  return p?.clip || p?.b || null;
}
