// Tilstand for redigeringen: prosjekt, utvalg, historikk og lagring.
import { signal, computed } from '@preact/signals';
import {
  CAPTION_LANE,
  TITLE_TEMPLATES,
  makeClip,
  newProject,
  relayoutPrimary,
  updateDuration,
} from '../../shared/model.js';
import { addMediaClip, autoFormat } from '../../shared/ops.js';
import { templateDefaults } from '../../shared/titletemplates.js';
import { hasMotion, setMotion } from '../../shared/stabilize.js';
import { prefs } from '../prefs.js';

const api = window.api;

export const room = signal('record');
export const project = signal(newProject());
export const projectPath = signal(null);
export const selection = signal([]);
export const selectedTransition = signal(null);
// Valgt lydkomponent i utvidet lyd: { clipId, key }. V slår den av og på.
export const selectedComponent = signal(null);
export const tool = signal('select');
export const snapping = signal(prefs.value.snapping);
// Skumming som i Final Cut Pro: S slår av og på, N slår lyden av og på.
export const skimming = signal(prefs.value.skimming);
export const audioSkimming = signal(prefs.value.audioSkimming);
// Når pekeren skummer, viser visningen dette i stedet for spillhodet: { project, T, mediaId? }.
export const skim = signal(null);
export const pps = signal(40);
export const playing = signal(false);
export const timeSig = signal(0);
export const tasks = signal([]);
export const waveVersion = signal(0);
export const saveState = signal('saved');
// Mappene til det åpne prosjektet: { root, media, recordings, optimized, exports, own }.
export const projectFolders = signal(null);
// Første oppstart uten prosjekt: brukeren må lage eller åpne et prosjekt først.
export const needsProject = signal(false);

// Medier som en bakgrunnsjobb arbeider med (analyse, optimalisering, baklengs kopi), med fremdrift.
export const busyMedia = computed(() => {
  const out = new Map();
  for (const t of tasks.value) {
    if (!t.mediaId || (t.state !== 'running' && t.state !== 'queued')) continue;
    const prev = out.get(t.mediaId);
    const next = { progress: t.state === 'running' ? t.progress || 0 : 0, title: t.stage || t.title, queued: t.state === 'queued' };
    if (!prev || (prev.queued && !next.queued)) out.set(t.mediaId, next);
  }
  return out;
});

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
  if (!projectPath.value) {
    saveState.value = 'saved';
    return;
  }
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
  if (path) {
    localStorage.setItem('lastProject', path);
    needsProject.value = false;
    api.projectFolders(path).then((f) => projectPath.value === path && (projectFolders.value = f));
  } else projectFolders.value = null;
}

export async function openProjectFile(path) {
  const p = await api.loadProject(path);
  setProject(p, path);
  const offline = await checkOffline();
  if (offline.length) {
    import('../ui.jsx').then(({ toast }) =>
      toast(`${offline.length} media file${offline.length > 1 ? 's are' : ' is'} missing and shown as Media Offline. Right click a clip in the browser and choose Relink File to find it.`, { kind: 'error', timeout: 10000 })
    );
  }
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

// Lagre som: ny prosjektmappe med nytt navn og sted. Det nye prosjektet blir det åpne.
export async function saveProjectAs(location, name) {
  await saveNow();
  const r = await api.saveProjectAs({ project: { ...project.value, modified: Date.now() }, location, name });
  const p = await api.loadProject(r.file);
  const keepUndo = [...undoStack];
  setProject(p, r.file);
  undoStack.push(...keepUndo);
  return r;
}

// Nytt prosjekt: lager en egen mappe med navnet på valgt plassering.
export async function newProjectNamed(name, template = null, location = null) {
  if (saveState.value !== 'saved') await saveNow();
  const created = await api.createProject({ location, name: name || defaultName() });
  const p = newProject(created.name);
  if (template && !template.auto) {
    p.width = template.w;
    p.height = template.h;
    p.fps = template.fps;
    p.autoFormat = false;
  }
  if (template?.tutorial) {
    // Opplæringsmal: tittelkort først og en nedre tredjedel klar til bruk.
    const intro = makeTitleClip('card', 0);
    intro.lane = 0;
    p.clips[intro.id] = intro;
    p.primary.push(intro.id);
    const lower = makeTitleClip('lower', 4.5);
    p.clips[lower.id] = lower;
    relayoutPrimary(p);
  }
  setProject(p, created.file);
  await saveNow();
}

function defaultName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `Project ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

// Prosjekt åpnet fra Finder eller Utforsker.
async function openFromOS(file) {
  if (saveState.value !== 'saved') await saveNow();
  await openProjectFile(file);
}
api.onOpenProject?.((file) => openFromOS(file).catch((err) => console.error(err)));

export async function loadInitialProject() {
  const pending = await api.pendingOpen?.();
  if (pending && (await api.exists(pending))) {
    try {
      await openProjectFile(pending);
      return;
    } catch (err) {
      console.error(err);
    }
  }
  const last = localStorage.getItem('lastProject');
  if (prefs.value.reopenLast && last && (await api.exists(last))) {
    try {
      await openProjectFile(last);
      return;
    } catch (err) {
      console.error(err);
    }
  }
  // Ingen prosjekt ennå: be om navn og plassering.
  setProject(newProject(defaultName()));
  needsProject.value = true;
}

export function defaultProjectName() {
  return defaultName();
}

/* Media */

// Resultater fra bakgrunnsanalysen legges inn uten å lage et nytt angresteg.
// Analyser kan bli ferdige før mediet er lagt i prosjektet (bufrede resultater kommer svært raskt).
// Derfor huskes alle resultater, og legges på når mediet legges til.
const analysisResults = new Map();
export function withAnalysis(m) {
  const res = analysisResults.get(m.id);
  if (!res) return m;
  const streams = { ...m.streams };
  for (const [key, patch] of Object.entries(res)) if (streams[key]) streams[key] = { ...streams[key], ...patch };
  return { ...m, streams };
}

api.onAnalyzed(({ mediaId, stream, patch }) => {
  analysisResults.set(mediaId, { ...(analysisResults.get(mediaId) || {}), [stream]: { ...(analysisResults.get(mediaId)?.[stream] || {}), ...patch } });
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

/* Media som mangler (Media Offline). Sjekkes når prosjektet åpnes og når vinduet får fokus,
   så en disk som kobles til igjen blir oppdaget. Endringen lagres uten eget angresteg. */
function patchMedia(fn) {
  const apply = (p) => {
    const media = fn(p.media);
    return media === p.media ? p : { ...p, media };
  };
  project.value = apply(project.value);
  for (let i = 0; i < undoStack.length; i++) undoStack[i] = apply(undoStack[i]);
  for (let i = 0; i < redoStack.length; i++) redoStack[i] = apply(redoStack[i]);
  if (transientBase) transientBase = apply(transientBase);
}

export async function checkOffline() {
  const list = Object.values(project.value.media);
  if (!list.length) return [];
  const off = new Set(await api.offlineMedia(list));
  const changed = list.some((m) => Boolean(m.offline) !== off.has(m.id));
  if (changed) {
    patchMedia((media) => {
      const next = { ...media };
      for (const m of Object.values(media)) {
        if (Boolean(m.offline) === off.has(m.id)) continue;
        next[m.id] = { ...m, offline: off.has(m.id) || undefined };
      }
      return next;
    });
  }
  return [...off];
}

let focusTimer = null;
window.addEventListener('focus', () => {
  if (!prefs.value.checkOfflineOnFocus) return;
  clearTimeout(focusTimer);
  focusTimer = setTimeout(checkOffline, 400);
});

// Relink File: pek mediet til en ny fil. Klippene på tidslinjen beholdes.
export async function relinkMedia(id, file) {
  const m = project.value.media[id];
  if (!m) return;
  const fresh = withAnalysis(await api.relinkMedia(m, file));
  commit((p) => {
    p.media[id] = { ...fresh, offline: undefined };
  });
}

// Bevegelsesanalyser for stabilisering (se shared/stabilize.js).
export const motionVersion = signal(0);
const motionLoading = new Set();
export function loadMotion(path) {
  if (!path || hasMotion(path) || motionLoading.has(path)) return;
  motionLoading.add(path);
  api
    .readText(path)
    .then((t) => {
      setMotion(path, JSON.parse(t));
      motionVersion.value++;
    })
    .catch(() => {})
    .finally(() => motionLoading.delete(path));
}

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

function reportFailed(failed) {
  if (!failed?.length) return;
  import('../ui.jsx').then(({ toast }) =>
    toast(`Could not read ${failed.join(', ')}. The file may be damaged or in an unsupported format.`, { kind: 'error', timeout: 9000 })
  );
}

// Import: filene kopieres til prosjektmappen eller blir liggende der de er (valg i Import Options).
export async function importPaths(paths, placement, opts = {}) {
  // Titelmaler og lagdelte filer (PSD, SVG) har egne veier inn.
  const templates = paths.filter((p) => /\.reccut-title$/i.test(p));
  if (templates.length) import('./commands.js').then((m) => m.importTitleTemplate(templates));
  paths = paths.filter((p) => !/\.reccut-title$/i.test(p));
  const layered = paths.filter((p) => /\.(psd|psb|svg)$/i.test(p));
  if (layered.length) import('./layers.js').then((m) => m.importLayered(layered, placement));
  paths = paths.filter((p) => !/\.(psd|psb|svg)$/i.test(p));
  if (!paths.length) return [];
  const copy = opts.copy ?? prefs.value.importCopy;
  const folders = projectFolders.value;
  if (copy && folders?.own) {
    try {
      paths = await api.copyIntoProject(paths, folders.media);
    } catch (err) {
      reportFailed([`the files (${err.message})`]);
      return [];
    }
  }
  const { items, failed } = await api.importMedia(paths);
  reportFailed(failed);
  addMediaRecords(items, placement);
  if (opts.optimize ?? prefs.value.importOptimize) import('./commands.js').then((m) => m.optimizeMedia(items.map((x) => x.id)));
  // Analyse for stabilisering i bakgrunnen, så Stabilize Clip virker med en gang.
  if (prefs.value.importAnalyzeStab) for (const m of items) if (m.kind === 'video') api.analyzeMotion(m);
  return items;
}

export function addMediaRecords(items, placement) {
  if (!items.length) return;
  items = items.map(withAnalysis);
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

// Et nytt opptak legges i det åpne prosjektet. Er tidslinjen tom, legges det også på tidslinjen.
export async function addRecordingToProject(dir) {
  const media = withAnalysis(await api.importRecording(dir));
  const empty = project.value.primary.length === 0;
  commit((p) => {
    p.media[media.id] = media;
    autoFormat(p, media);
    if (empty) addMediaClip(p, media, 'append');
  });
  await saveNow();
  return media;
}

// Titler lages fra maler (se TITLE_TEMPLATES).
export function makeTitleClip(templateId, T) {
  const custom = project.value.templates?.[templateId];
  const tpl = custom
    ? { label: custom.name, props: { template: custom.id, ...templateDefaults(custom) } }
    : TITLE_TEMPLATES.find((t) => t.id === templateId) || TITLE_TEMPLATES[0];
  const clip = makeClip('title', { start: T, dur: prefs.value.titleDur, lane: 1, name: tpl.label });
  Object.assign(clip.props, structuredClone(tpl.props));
  return clip;
}

export function makeCaptionClip(T, text = '', dur = 3) {
  return makeClip('caption', { start: T, dur, lane: CAPTION_LANE, props: { text, align: null, pos: null }, name: 'Caption' });
}

api.onTasks((list) => (tasks.value = list));
api.onFlush(async () => {
  try {
    if (saveState.value !== 'saved') await saveNow();
  } finally {
    api.flushed();
  }
});
api.listTasks().then((list) => (tasks.value = list));
