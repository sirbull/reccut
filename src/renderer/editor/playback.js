// Spilleren i redigeringen, koblet til prosjektet og spillhodet i tilstanden.
// Mens du skummer (tidslinjen eller biblioteket), viser den det pekeren står over.
import { computed, effect } from '@preact/signals';
import { makeClip, mediaClipType, newProject, primaryAt } from '../../shared/model.js';
import { createPlayer, fileUrl } from '../player.js';
import { browserPlayhead, getSourceTime, getTime, loadLut, loadMotion, motionVersion, playing, project, setSourceTime, setTime, skim, skimming, sourceMediaId } from './store.js';
import { prefs } from '../prefs.js';

export { fileUrl };

const previewProjects = new WeakMap();
export function mediaPreviewProject(m) {
  const main = project.value;
  const dur = m.kind === 'image' ? prefs.value.stillDur : m.duration || 0.04;
  const cached = previewProjects.get(m);
  if (cached && cached.width === main.width && cached.height === main.height && cached.fps === main.fps && cached.duration === dur) return cached;
  const clip = makeClip(mediaClipType(m), { media: m, start: 0, in: 0, dur });
  clip.id = `source-${m.id}`;
  clip.lane = 0;
  const p = { ...newProject(m.name), id: `source-${main.id}-${m.id}`, width: main.width, height: main.height, fps: main.fps, media: { [m.id]: m }, clips: { [clip.id]: clip }, primary: [clip.id], duration: dur };
  previewProjects.set(m, p);
  return p;
}

export const sourceProject = computed(() => {
  const m = project.value.media[sourceMediaId.value];
  return m ? mediaPreviewProject(m) : null;
});

function activeSkim() {
  const preview = skim.value;
  return sourceProject.value && preview?.mediaId !== sourceMediaId.value ? null : preview;
}

export function getViewerTime() {
  return !playing.value && activeSkim() ? activeSkim().T : sourceProject.value ? getSourceTime() : getTime();
}

const player = createPlayer({
  getProject: () => sourceProject.value || skim.value?.project || project.value,
  playing,
  getTime: getViewerTime,
  setTime: (T, opts) => sourceProject.value ? setSourceTime(T, opts) : setTime(T, opts),
});

export const { attachCanvas, resizeCanvas, start, stopLoop, getRate, invalidate, scrubAudio, snapshot } = player;

function preparePlayback() {
  const preview = activeSkim();
  const fromSource = sourceProject.value && !playing.value && preview;
  const fromPointer = !playing.value && prefs.value.playbackFromSkimmer && skimming.value &&
    preview && !preview.project && !preview.mediaId && Number.isFinite(preview.T);
  skim.value = null;
  if (fromSource || fromPointer) player.seek(preview.T);
}

export function openSource(mediaId, T) {
  if (!project.value.media[mediaId]) return;
  player.pause();
  skim.value = null;
  const saved = browserPlayhead.value;
  sourceMediaId.value = mediaId;
  seekViewer(T ?? (saved?.mediaId === mediaId ? saved.t : 0));
}

export function showTimeline() {
  if (sourceMediaId.value) player.pause();
  sourceMediaId.value = null;
  skim.value = null;
}

// Transporten og piltastene søker i klippet som vises, uten å flytte tidslinjen.
export function seekViewer(T) {
  skim.value = null;
  const source = sourceProject.value;
  player.seek(source ? Math.max(0, Math.min(source.duration, T)) : T);
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
  showTimeline();
  player.seek(T);
}

effect(() => {
  project.value;
  sourceProject.value;
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
  for (const m of Object.values(p.media)) if (m.cameraLut) loadLut(m.cameraLut);
});

export function currentClipAtPlayhead() {
  const p = primaryAt(project.value, getTime());
  return p?.clip || p?.b || null;
}
