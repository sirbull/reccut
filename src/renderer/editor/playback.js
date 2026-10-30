// Spilleren i redigeringen, koblet til prosjektet og spillhodet i tilstanden.
import { effect } from '@preact/signals';
import { primaryAt } from '../../shared/model.js';
import { createPlayer, fileUrl } from '../player.js';
import { getTime, playing, project, setTime } from './store.js';

export { fileUrl };

const player = createPlayer({ getProject: () => project.value, playing, getTime, setTime });

export const { attachCanvas, resizeCanvas, start, stopLoop, play, pause, toggle, getRate, shuttle, seek, invalidate } = player;

effect(() => {
  project.value;
  player.invalidate();
});

export function currentClipAtPlayhead() {
  const p = primaryAt(project.value, getTime());
  return p?.clip || p?.b || null;
}
