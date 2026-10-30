// Kommandoer som brukes av snarveier, menyer og knapper.
import { signal } from '@preact/signals';
import { CAPTION_LANE, EFFECTS, editPoints, isVisual, primaryAt, setKeyframe, sourceTime, valueAt } from '../../shared/model.js';
import {
  addMediaClip,
  autoFormat,
  bladeAt,
  copyClips,
  deleteClips,
  pasteClips,
  placeFree,
  removeTransition,
  setTransition,
  splitClip,
  trimClip,
} from '../../shared/ops.js';
import {
  commit,
  getTime,
  importPaths,
  makeCaptionClip,
  makeTitleClip,
  project,
  selectedTransition,
  selection,
} from './store.js';
import { seek } from './playback.js';
import { toast } from '../ui.jsx';

const api = window.api;

export const browserSelection = signal(null);
export const exportOpen = signal(false);
export const projectsOpen = signal(false);
export const inspectorTab = signal(null);
export const newProjectOpen = signal(false);

let timelineView = null;
export function registerTimelineView(v) {
  timelineView = v;
}
export const zoom = (f) => timelineView?.zoom(f);
export const zoomFit = () => timelineView?.fit();

const frame = () => 1 / project.value.fps;

export function addTitle(style = 'center', T = getTime()) {
  const clip = makeTitleClip(style, T);
  commit((p) => placeFree(p, clip, T, 1));
  selection.value = [clip.id];
  inspectorTab.value = 'text';
}

// Effekt fra effektbiblioteket: legges på valgte klipp, eller klippet den slippes på.
export function addEffect(id, clipId = null) {
  const fx = EFFECTS.find((x) => x.id === id);
  const p = project.value;
  const ids = clipId ? [clipId] : selection.value.filter((cid) => ['video', 'image', 'recording', 'title'].includes(p.clips[cid]?.type));
  if (!ids.length) {
    toast('Select a video, image or title clip first, or drag the effect onto a clip.');
    return;
  }
  commit((q) => {
    for (const cid of ids) {
      const c = q.clips[cid];
      c.props.fx = [...new Set([...(c.props.fx || []), id])];
      if (!c.props[fx.prop]) c.props[fx.prop] = fx.def;
    }
  });
  selection.value = ids;
  inspectorTab.value = 'effects';
}

function hitClipAt(lane, T) {
  const c = Object.values(project.value.clips).find((x) => x.lane === lane && T >= x.start && T < x.start + x.dur && ['video', 'image', 'recording', 'title'].includes(x.type));
  return c?.id || null;
}

export function addCaption(T = getTime(), text = '') {
  const p = project.value;
  // Fyll ut til neste undertekst, men maks tre sekunder.
  const next = Object.values(p.clips)
    .filter((c) => c.lane === CAPTION_LANE && c.start > T)
    .sort((a, b) => a.start - b.start)[0];
  const dur = Math.max(0.5, Math.min(3, next ? next.start - T : 3));
  const clip = makeCaptionClip(T, text, dur);
  commit((p) => {
    p.clips[clip.id] = clip;
  });
  selection.value = [clip.id];
  inspectorTab.value = 'caption';
  return clip.id;
}

function targetClipsAtPlayhead() {
  const T = getTime();
  const sel = selection.value.filter((id) => {
    const c = project.value.clips[id];
    return c && T > c.start && T < c.start + c.dur;
  });
  if (sel.length) return sel;
  const p = primaryAt(project.value, T);
  return p?.clip ? [p.clip.id] : [];
}

export function blade() {
  const ids = targetClipsAtPlayhead();
  if (!ids.length) return;
  commit((p) => bladeAt(p, getTime(), ids));
}

export function bladeAll() {
  commit((p) => bladeAt(p, getTime()));
}

export function deleteSelection(ripple = true) {
  if (selectedTransition.value) {
    const id = selectedTransition.value;
    commit((p) => removeTransition(p, id));
    selectedTransition.value = null;
    return;
  }
  const ids = selection.value;
  if (!ids.length) return;
  commit((p) => deleteClips(p, ids, { ripple }));
  selection.value = [];
}

export function toggleEnabled() {
  const ids = selection.value.length ? selection.value : targetClipsAtPlayhead();
  if (!ids.length) return;
  commit((p) => {
    const on = !ids.every((id) => p.clips[id]?.enabled);
    for (const id of ids) if (p.clips[id]) p.clips[id].enabled = on;
  });
}

export function addTransition(type = 'dissolve') {
  const p = project.value;
  let ids = selection.value.filter((id) => p.clips[id]?.lane === 0);
  if (!ids.length) {
    // Uten utvalg: bruk kuttet nærmest spillhodet.
    const T = getTime();
    let best = null;
    for (const id of p.primary.slice(1)) {
      const c = p.clips[id];
      if (!best || Math.abs(c.start - T) < Math.abs(p.clips[best].start - T)) best = id;
    }
    if (!best) {
      if (p.primary[0]) best = p.primary[0];
      else return;
    }
    commit((q) => setTransition(q, best, type));
    selectedTransition.value = best;
    return;
  }
  commit((q) => {
    for (const id of ids) {
      setTransition(q, id, type);
      const next = q.primary[q.primary.indexOf(id) + 1];
      if (next) setTransition(q, next, type);
    }
  });
}

export function trimToPlayhead(edge) {
  const T = getTime();
  const ids = targetClipsAtPlayhead();
  if (!ids.length) return;
  commit((p) => {
    for (const id of ids) {
      const c = p.clips[id];
      if (!c) continue;
      if (edge === 'start') trimClip(p, id, 'start', T - c.start);
      else trimClip(p, id, 'end', T - (c.start + c.dur));
    }
  });
  if (edge === 'start') {
    const c = project.value.clips[ids[0]];
    if (c) seek(c.start);
  }
}

export function selectAll() {
  selection.value = Object.keys(project.value.clips);
}

let clipboard = null;
export function copySelection() {
  clipboard = copyClips(project.value, selection.value);
}
export function cutSelection() {
  copySelection();
  deleteSelection(true);
}
export function paste() {
  if (!clipboard) return;
  const items = clipboard;
  let ids = [];
  commit((p) => {
    ids = pasteClips(p, items, getTime());
  });
  selection.value = ids;
}

export function addMarker() {
  const T = getTime();
  commit((p) => p.markers.push({ id: Math.random().toString(36).slice(2), t: T, label: '' }));
}

export function setRange(which) {
  const T = getTime();
  commit((p) => {
    const r = p.range || { in: 0, out: p.duration };
    if (which === 'in') r.in = Math.min(T, r.out - frame());
    else r.out = Math.max(T, r.in + frame());
    p.range = { in: Math.max(0, r.in), out: r.out };
  });
}

export function clearRange() {
  commit((p) => (p.range = null));
}

export function stepFrames(n) {
  seek(Math.max(0, getTime() + n * frame()));
}

export function jumpEdit(dir) {
  const T = getTime();
  const pts = editPoints(project.value);
  const target = dir > 0 ? pts.find((t) => t > T + 1e-4) : [...pts].reverse().find((t) => t < T - 1e-4);
  if (target != null) seek(target);
}

export function goHome() {
  seek(0);
}

export function goEnd() {
  seek(project.value.duration);
}

export function nudge(dir) {
  const ids = selection.value.filter((id) => project.value.clips[id]?.lane !== 0);
  if (!ids.length) return stepFrames(dir);
  commit((p) => {
    for (const id of ids) p.clips[id].start = Math.max(0, p.clips[id].start + dir * frame());
  });
}

export function adjustVolume(db) {
  const ids = selection.value.length ? selection.value : targetClipsAtPlayhead();
  commit((p) => {
    for (const id of ids) {
      const c = p.clips[id];
      if (!c) continue;
      const key = c.type === 'recording' ? 'micVolume' : 'volume';
      if (c.props[key] == null) continue;
      c.props[key] = Math.max(-60, Math.min(12, Math.round((c.props[key] + db) * 10) / 10));
    }
  });
}

export function addVolumeKeyframe(clipId, T) {
  commit((p) => {
    const c = p.clips[clipId];
    if (!c) return;
    setKeyframe(c, 'volume', sourceTime(c, T), valueAt(c, 'volume', T) ?? 0);
  });
}

/* Media inn på tidslinjen */

export async function importDialog(placement) {
  const paths = await api.openMediaDialog();
  if (paths.length) await importPaths(paths, placement);
}

export function addBrowserSelection(mode) {
  const id = browserSelection.value;
  const m = id && project.value.media[id];
  if (!m) {
    toast('Select a clip in the browser first.');
    return;
  }
  let clipId = null;
  commit((p) => {
    autoFormat(p, m);
    clipId = addMediaClip(p, m, mode, getTime());
  });
  if (clipId) selection.value = [clipId];
}

export async function handleDrop(dt, lane, T) {
  const raw = dt.getData('application/x-obslite');
  if (raw) {
    const item = JSON.parse(raw);
    if (item.kind === 'media') {
      const m = project.value.media[item.id];
      if (!m) return;
      let clipId = null;
      commit((p) => {
        autoFormat(p, m);
        const audio = m.kind === 'audio';
        const mode = lane === 0 && !audio ? 'insert' : 'connect';
        let l = lane;
        if (audio && l >= 0) l = -1;
        if (!audio && (l < 0 || l === CAPTION_LANE)) l = 1;
        clipId = addMediaClip(p, m, mode, T, l);
      });
      if (clipId) selection.value = [clipId];
    } else if (item.kind === 'title') {
      addTitle(item.id, T);
    } else if (item.kind === 'effect') {
      addEffect(item.id, hitClipAt(lane, T));
    } else if (item.kind === 'transition') {
      const p = project.value;
      let best = null;
      for (const id of p.primary) {
        const c = p.clips[id];
        if (!best || Math.abs(c.start - T) < Math.abs(p.clips[best].start - T)) best = id;
      }
      if (best) {
        commit((q) => setTransition(q, best, item.id));
        selectedTransition.value = best;
      }
    }
    return;
  }
  const files = [...(dt.files || [])].map((f) => api.pathForFile(f)).filter(Boolean);
  if (files.length) {
    const mode = lane === 0 ? 'insert' : 'connect';
    await importPaths(files, { mode, T, lane: lane === 0 ? undefined : lane });
  }
}

/* Hurtigmenyer */

const isMac = api.platform === 'darwin';
const k = (mac, win) => (isMac ? mac : win);

export async function clipContextMenu(clipId, T) {
  const c = project.value.clips[clipId];
  if (!c) return;
  const items = [
    { id: 'blade', label: 'Blade at Playhead', accelerator: 'CmdOrCtrl+B', enabled: T > c.start && T < c.start + c.dur },
    { id: 'toggle', label: c.enabled ? 'Disable Clip' : 'Enable Clip', accelerator: 'V' },
    { separator: true },
    { id: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C' },
    { id: 'cut', label: 'Cut', accelerator: 'CmdOrCtrl+X' },
    { separator: true },
  ];
  if (c.lane === 0 && isVisual(c)) {
    items.push({ id: 'transition', label: 'Add Cross Dissolve', accelerator: 'CmdOrCtrl+T' });
    if (c.transition) items.push({ id: 'removeTransition', label: 'Remove Transition' });
    items.push({ separator: true });
  }
  if (c.mediaId) items.push({ id: 'reveal', label: k('Reveal in Finder', 'Show in Explorer') }, { separator: true });
  items.push({ id: 'delete', label: c.lane === 0 ? 'Delete' : 'Delete', accelerator: 'Backspace' });
  if (c.lane === 0) items.push({ id: 'deleteGap', label: 'Delete and Leave Gap', accelerator: 'Shift+Backspace' });
  const id = await api.popupMenu(items);
  switch (id) {
    case 'blade':
      commit((p) => splitClip(p, clipId, T));
      break;
    case 'toggle':
      toggleEnabled();
      break;
    case 'copy':
      copySelection();
      break;
    case 'cut':
      cutSelection();
      break;
    case 'transition':
      addTransition('dissolve');
      break;
    case 'removeTransition':
      commit((p) => removeTransition(p, clipId));
      break;
    case 'reveal':
      api.reveal(project.value.media[c.mediaId].path);
      break;
    case 'delete':
      deleteSelection(true);
      break;
    case 'deleteGap':
      deleteSelection(false);
      break;
  }
}

export async function laneContextMenu(lane, T) {
  const l = project.value.lanes?.[lane] || {};
  const isAudio = lane < 0;
  const items = [
    { id: 'hide', label: 'Hide Lane', checked: Boolean(l.hidden), enabled: !isAudio },
    { id: 'mute', label: 'Mute Lane', checked: Boolean(l.muted) },
    { separator: true },
    { id: 'paste', label: 'Paste at Playhead', enabled: Boolean(clipboard) },
    { id: 'title', label: 'Add Title Here', enabled: lane > 0 && lane !== CAPTION_LANE },
    { id: 'caption', label: 'Add Caption Here', enabled: lane === CAPTION_LANE },
  ];
  const id = await api.popupMenu(items);
  if (id === 'hide' || id === 'mute') {
    commit((p) => {
      p.lanes = p.lanes || {};
      const cur = p.lanes[lane] || {};
      p.lanes[lane] = { ...cur, [id === 'hide' ? 'hidden' : 'muted']: !cur[id === 'hide' ? 'hidden' : 'muted'] };
    });
  } else if (id === 'paste') paste();
  else if (id === 'title') addTitle('center', T);
  else if (id === 'caption') addCaption(T);
}
