// Tilstand for redigeringen: prosjekt, utvalg, historikk og lagring.
import { signal, computed } from '@preact/signals';
import {
  CAPTION_LANE,
  makeClip,
  newProject,
  relayoutPrimary,
  updateDuration,
} from '../../shared/model.js';
import { addMediaClip, autoFormat } from '../../shared/ops.js';

const api = window.api;

export const room = signal('record');
export const project = signal(newProject());
export const projectPath = signal(null);
export const selection = signal([]);
export const selectedTransition = signal(null);
export const tool = signal('select');
export const snapping = signal(true);
export const skimming = signal(false);
export const pps = signal(40);
export const playing = signal(false);
export const timeSig = signal(0);
export const tasks = signal([]);
export const waveVersion = signal(0);
export const saveState = signal('saved');

export const selectedClips = computed(() => selection.value.map((id) => project.value.clips[id]).filter(Boolean));

/* Spillhodet oppdateres 60 ganger i sekundet uten å tegne hele grensesnittet på nytt. */
let time = 0;
const timeListeners = new Set();
let lastSig = 0;
export function getTime() {
  return time;
}
export function setTime(t, { force = false } = {}) {
  time = Math.max(0, t);
  for (const fn of timeListeners) fn(time);
  const now = performance.now();
  if (force || !playing.value || now - lastSig > 120) {
    lastSig = now;
    timeSig.value = time;
  }
}
export function onTime(fn) {
  timeListeners.add(fn);
  return () => timeListeners.delete(fn);
}

/* Historikk */

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 200;
export const historyVersion = signal(0);

function pushUndo(prev) {
  undoStack.push(prev);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0;
  historyVersion.value++;
}

export function commit(mutator) {
  const prev = project.value;
  const next = structuredClone(prev);
  const result = mutator(next);
  updateDuration(next);
  pushUndo(prev);
  project.value = next;
  pruneSelection();
  scheduleSave();
  return result;
}

let transientBase = null;
export function beginTransient() {
  transientBase = project.value;
}
export function updateTransient(mutator) {
  if (!transientBase) beginTransient();
  const next = structuredClone(transientBase);
  mutator(next);
  updateDuration(next);
  project.value = next;
}
export function endTransient(keep = true) {
  if (!transientBase) return;
  if (keep && project.value !== transientBase) {
    pushUndo(transientBase);
    scheduleSave();
  } else if (!keep) project.value = transientBase;
  transientBase = null;
  pruneSelection();
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(project.value);
  project.value = undoStack.pop();
  historyVersion.value++;
  pruneSelection();
  scheduleSave();
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(project.value);
  project.value = redoStack.pop();
  historyVersion.value++;
  pruneSelection();
  scheduleSave();
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function pruneSelection() {
  const clips = project.value.clips;
  if (selection.value.some((id) => !clips[id])) selection.value = selection.value.filter((id) => clips[id]);
  if (selectedTransition.value && !clips[selectedTransition.value]?.transition) selectedTransition.value = null;
}

/* Lagring */

let saveTimer = null;
export function scheduleSave() {
  saveState.value = 'dirty';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  saveState.value = 'saving';
  try {
    const p = { ...project.value, modified: Date.now() };
    projectPath.value = await api.saveProject(p, projectPath.value);
    localStorage.setItem('lastProject', projectPath.value);
    saveState.value = 'saved';
  } catch (err) {
    console.error(err);
    saveState.value = 'error';
  }
}

export function setProject(p, path = null) {
  undoStack.length = 0;
  redoStack.length = 0;
  historyVersion.value++;
  relayoutPrimary(p);
  project.value = p;
  projectPath.value = path;
  selection.value = [];
  selectedTransition.value = null;
  setTime(0, { force: true });
  if (path) localStorage.setItem('lastProject', path);
}

export async function openProjectFile(path) {
  const p = await api.loadProject(path);
  setProject(p, path);
  // Finn analyser som mangler (for eksempel etter at bufferen er tømt).
  const missing = [];
  for (const m of Object.values(p.media)) {
    const ok = await api.exists(m.path);
    if (!ok) continue;
    const needs = Object.values(m.streams).some((s) => (s.hasVideo && m.kind !== 'image' && !s.thumbs) || (s.hasAudio && !s.wave));
    if (needs) missing.push(m);
  }
  if (missing.length) api.reanalyze(missing);
}

export async function newProjectNamed(name) {
  if (saveState.value !== 'saved') await saveNow();
  setProject(newProject(name || defaultName()));
  await saveNow();
}

function defaultName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `Prosjekt ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

export async function loadInitialProject() {
  const last = localStorage.getItem('lastProject');
  if (last && (await api.exists(last))) {
    try {
      await openProjectFile(last);
      return;
    } catch (err) {
      console.error(err);
    }
  }
  setProject(newProject(defaultName()));
}

/* Media */

// Resultater fra bakgrunnsanalysen legges inn uten å lage et nytt angresteg.
api.onAnalyzed(({ mediaId, stream, patch }) => {
  const apply = (p) => {
    const m = p.media[mediaId];
    if (!m?.streams[stream]) return p;
    const next = { ...p, media: { ...p.media, [mediaId]: { ...m, streams: { ...m.streams, [stream]: { ...m.streams[stream], ...patch } } } } };
    return next;
  };
  project.value = apply(project.value);
  for (let i = 0; i < undoStack.length; i++) undoStack[i] = apply(undoStack[i]);
  for (let i = 0; i < redoStack.length; i++) redoStack[i] = apply(redoStack[i]);
  if (transientBase) transientBase = apply(transientBase);
  waveVersion.value++;
  scheduleSave();
});

const waveCache = new Map();
export function getWave(path) {
  if (!path) return null;
  const hit = waveCache.get(path);
  if (hit) return hit === 'loading' ? null : hit;
  waveCache.set(path, 'loading');
  api.readWave(path).then(
    (w) => {
      waveCache.set(path, w);
      waveVersion.value++;
    },
    () => waveCache.delete(path)
  );
  return null;
}

export async function importPaths(paths, placement) {
  if (!paths.length) return [];
  const items = await api.importMedia(paths);
  addMediaRecords(items, placement);
  return items;
}

export function addMediaRecords(items, placement) {
  if (!items.length) return;
  commit((p) => {
    for (const m of items) p.media[m.id] = m;
    if (placement) {
      let T = placement.T;
      for (const m of items) {
        autoFormat(p, m);
        const id = addMediaClip(p, m, placement.mode, T, placement.lane);
        if (placement.mode !== 'connect') T = p.clips[id].start + p.clips[id].dur;
        else T += p.clips[id].dur;
      }
    }
  });
}

// Lager og lagrer et prosjekt for et nytt opptak. Det åpnes først når brukeren vil redigere.
export async function createProjectFromRecording(dir) {
  const media = await api.importRecording(dir);
  const p = newProject(media.name);
  p.media[media.id] = media;
  autoFormat(p, media);
  addMediaClip(p, media, 'append');
  const path = await api.saveProject(p, null);
  return { project: p, path };
}

export function makeTitleClip(style, T) {
  const clip = makeClip('title', { start: T, dur: 4, lane: 1, name: 'Tittel' });
  clip.props.style = style;
  if (style === 'lower') {
    clip.props.text = 'Navn Navnesen';
    clip.props.subtext = 'Tittel eller beskrivelse';
    clip.props.size = 56;
  } else if (style === 'top') {
    clip.props.text = 'Overskrift';
    clip.props.size = 72;
  } else if (style === 'card') {
    clip.props.text = 'Kapittel 1';
    clip.props.subtext = 'Kom i gang';
    clip.props.bgColor = '#111114';
  }
  return clip;
}

export function makeCaptionClip(T, text = '', dur = 3) {
  return makeClip('caption', { start: T, dur, lane: CAPTION_LANE, props: { text }, name: 'Undertekst' });
}

api.onTasks((list) => (tasks.value = list));
api.listTasks().then((list) => (tasks.value = list));
