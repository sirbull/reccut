// Tilstand for eksportfanen: kilder (prosjektet eller importerte filer) og innstillinger.
import { computed, signal } from '@preact/signals';
import { CAPTION_LANE, newProject } from '../../shared/model.js';
import { addMediaClip, autoFormat } from '../../shared/ops.js';
import { PRESETS } from '../../shared/formats.js';
import { project as editorProject } from '../editor/store.js';

const api = window.api;

export const PROJECT_SOURCE = 'project';

// Importerte filer pakkes inn i et eget lite prosjekt, så de går gjennom samme eksport.
export const files = signal([]);
export const selectedId = signal(PROJECT_SOURCE);

export const sources = computed(() => [{ id: PROJECT_SOURCE, kind: 'project', name: editorProject.value.name }, ...files.value]);

export function sourceProject(id) {
  if (id === PROJECT_SOURCE) return editorProject.value;
  return files.value.find((f) => f.id === id)?.project || null;
}

export const selectedProject = computed(() => sourceProject(selectedId.value) || editorProject.value);

export async function addFiles(paths) {
  if (!paths.length) return;
  const items = await api.importMedia(paths);
  const added = items.map((m) => {
    const p = newProject(m.name.replace(/\.[^.]+$/, ''));
    p.media[m.id] = m;
    autoFormat(p, m);
    addMediaClip(p, m, 'append');
    return { id: m.id, kind: 'file', name: m.name, path: m.path, media: m, project: p };
  });
  files.value = [...files.value, ...added];
  if (added.length) selectedId.value = added[0].id;
}

export function removeFile(id) {
  files.value = files.value.filter((f) => f.id !== id);
  if (selectedId.value === id) selectedId.value = PROJECT_SOURCE;
}

// Optimalisert media og analyser for importerte filer.
api.onAnalyzed(({ mediaId, stream, patch }) => {
  if (!files.value.some((f) => f.id === mediaId)) return;
  files.value = files.value.map((f) => {
    if (f.id !== mediaId) return f;
    const m = f.project.media[mediaId];
    const media = { ...m, streams: { ...m.streams, [stream]: { ...m.streams[stream], ...patch } } };
    return { ...f, media, project: { ...f.project, media: { ...f.project.media, [mediaId]: media } } };
  });
});

/* Innstillinger */

const DEFAULTS = {
  preset: 'standard',
  format: 'mp4-h264',
  audioOnly: false,
  audioFormat: 'mp3',
  quality: 'high',
  bitrate: 0,
  audioKbps: 0,
  size: { preset: 0, w: 1920, h: 1080 },
  lockAspect: true,
  fit: 'contain',
  cropAspect: null,
  fpsMode: 'source',
  fps: 30,
  captions: 'burn',
  dir: null,
};

function load() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('exportRoom') || '{}') };
    s.size = { ...DEFAULTS.size, ...s.size };
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = signal(load());

export function setSettings(patch) {
  settings.value = { ...settings.value, ...patch };
  try {
    const { ...persist } = settings.value;
    localStorage.setItem('exportRoom', JSON.stringify(persist));
  } catch {}
}

export function applyPreset(id) {
  const pr = PRESETS.find((x) => x.id === id);
  if (!pr) return;
  setSettings({
    preset: id,
    audioOnly: Boolean(pr.audioOnly),
    format: pr.format || settings.value.format,
    audioFormat: pr.audioFormat || settings.value.audioFormat,
    quality: pr.quality,
    bitrate: 0,
    size: { ...settings.value.size, preset: pr.res || 0 },
    fpsMode: pr.fps ? 'custom' : 'source',
    fps: pr.fps || settings.value.fps,
  });
}

// Beskjæring og område gjelder per kilde, siden filene har ulike formater og lengder.
export const perSource = signal({});

export function sourceOptions(id) {
  return perSource.value[id] || { crop: null, range: null };
}

export function setSourceOptions(id, patch) {
  perSource.value = { ...perSource.value, [id]: { ...sourceOptions(id), ...patch } };
}

export function hasCaptions(p) {
  return Object.values(p.clips).some((c) => c.lane === CAPTION_LANE);
}
