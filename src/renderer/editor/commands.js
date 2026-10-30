// Kommandoer som brukes av snarveier, menyer og knapper.
import { signal } from '@preact/signals';
import { CAPTION_LANE, EFFECTS, audioComponents, RAMP_PRESETS, clipHasAudio, editPoints, isVisual, primaryAt, setKeyframe, sourceTime, valueAt } from '../../shared/model.js';
import { applyMediaSync, applySync, clipAudioSource, mediaReference, planMediaSync, planSync, removeMediaSync } from '../../shared/sync.js';
import {
  adjacentAudioPairs,
  groupClips,
  groupMembers,
  ungroupClips,
  detachAudio,
  freezeFrame,
  insertGap,
  liftFromStoryline,
  overwritePrimary,
  setAudioCrossfade,
  setSpeed,
  setRamp,
  setReverse,
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
  projectFolders,
  selectedComponent,
  selectedTransition,
  selection,
} from './store.js';
import { seek } from './playback.js';
import { toast } from '../ui.jsx';
import { prefs } from '../prefs.js';

const api = window.api;

// Fanen i biblioteket: media, titles, transitions, effects eller captions.
export const browserTab = signal('media');
export const browserSelection = signal(null);
// Alle medier som er valgt i biblioteket, og om biblioteket sist ble brukt (for Cmd A og synk).
export const browserPicked = signal([]);
export const browserFocus = signal(false);
export const exportOpen = signal(false);
export const projectsOpen = signal(false);
export const inspectorTab = signal(null);
export const newProjectOpen = signal(false);
export const prefsOpen = signal(false);
// Valg når et lydklipp passer under flere videoklipp: { audioId, matches }.
export const syncDialog = signal(null);

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
  if (selectedTransition.value?.startsWith('ax:')) {
    const id = selectedTransition.value.slice(3);
    commit((p) => p.clips[id] && delete p.clips[id].axfade);
    selectedTransition.value = null;
    return;
  }
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

// V: slår valgt klipp av og på. Klippet blir liggende, men grått. Er en lydkomponent valgt, gjelder det bare den.
export function toggleEnabled() {
  const sc = selectedComponent.value;
  if (sc && selection.value.includes(sc.clipId)) return toggleComponent(sc.clipId, sc.key);
  const ids = selection.value.length ? selection.value : targetClipsAtPlayhead();
  if (!ids.length) return;
  commit((p) => {
    const on = !ids.every((id) => p.clips[id]?.enabled);
    for (const id of ids) if (p.clips[id]) p.clips[id].enabled = on;
  });
}

export function toggleComponent(clipId, key, on = null) {
  const c = project.value.clips[clipId];
  if (!c) return;
  const value = on ?? Boolean(c.props.audioOff?.[key]);
  commit((p) => {
    const q = p.clips[clipId];
    q.props.audioOff = { ...(q.props.audioOff || {}), [key]: !value };
    if (!q.props.audioOff[key]) delete q.props.audioOff[key];
  });
}

export function addTransition(type = 'dissolve') {
  const p = project.value;
  const dur = prefs.value.transitionDur;
  // To lydklipp inntil hverandre gir kryssfade (Cmd T i Final Cut Pro).
  const pairs = adjacentAudioPairs(p, selection.value);
  if (pairs.length) {
    commit((q) => pairs.forEach(([a, b]) => setAudioCrossfade(q, a, b, prefs.value.audioCrossfadeDur)));
    toast(`Added ${pairs.length === 1 ? 'an audio crossfade' : `${pairs.length} audio crossfades`} of ${prefs.value.audioCrossfadeDur} s.`, { timeout: 2500 });
    return;
  }
  const audioOnly = selection.value.length && selection.value.every((id) => p.clips[id]?.lane < 0);
  if (audioOnly) {
    // Ett lydklipp: kryssfade mot naboene på samme spor, eller toning inn og ut.
    commit((q) => {
      for (const id of selection.value) {
        const c = q.clips[id];
        const prev = Object.values(q.clips).find((o) => o.lane === c.lane && Math.abs(o.start + o.dur - c.start) < 1 / 60);
        const next = Object.values(q.clips).find((o) => o.lane === c.lane && Math.abs(c.start + c.dur - o.start) < 1 / 60);
        if (prev) setAudioCrossfade(q, prev.id, c.id, prefs.value.audioCrossfadeDur);
        else c.props.aFadeIn = prefs.value.audioCrossfadeDur;
        if (next) setAudioCrossfade(q, c.id, next.id, prefs.value.audioCrossfadeDur);
        else c.props.aFadeOut = prefs.value.audioCrossfadeDur;
      }
    });
    return;
  }
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
    commit((q) => setTransition(q, best, type, dur));
    selectedTransition.value = best;
    return;
  }
  commit((q) => {
    for (const id of ids) {
      setTransition(q, id, type, dur);
      const next = q.primary[q.primary.indexOf(id) + 1];
      if (next) setTransition(q, next, type, dur);
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
  if (browserFocus.value) {
    browserPicked.value = Object.keys(project.value.media);
    return;
  }
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

export function deleteMarkerAt(id) {
  commit((p) => (p.markers = (p.markers || []).filter((m) => m.id !== id)));
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

// Import (Cmd I): velg filer, deretter importvalg som i Final Cut Pro.
export const importOptions = signal(null); // { paths, placement }
export async function importDialog(placement) {
  const paths = await api.openMediaDialog();
  if (paths.length) importOptions.value = { paths, placement };
}

export async function confirmImport(opts) {
  const req = importOptions.value;
  importOptions.value = null;
  if (!req) return;
  const items = await importPaths(req.paths, req.placement, opts);
  if (opts.sync && items.length > 1) syncMediaAudio(items.map((m) => m.id));
}

// Utvalg i biblioteket: et helt klipp eller et område valgt i filmstripen.
export const browserRange = signal(null); // { mediaId, in, out }

export function browserClipOpts(m) {
  const r = browserRange.value;
  if (r && r.mediaId === m.id && r.out - r.in > 0.05) return { in: r.in, dur: r.out - r.in };
  return m.kind === 'image' ? { dur: prefs.value.stillDur } : {};
}

export function addBrowserSelection(mode) {
  const picked = browserPicked.value.filter((id) => project.value.media[id]);
  const ids = picked.length > 1 ? mediaOrderOf(picked) : [browserSelection.value].filter((id) => project.value.media[id]);
  if (!ids.length) {
    toast('Select a clip in the browser first.');
    return;
  }
  const added = [];
  commit((p) => {
    let T = getTime();
    for (const id of ids) {
      const m = p.media[id];
      autoFormat(p, m);
      const clipId = addMediaClip(p, m, mode, T, undefined, ids.length === 1 ? browserClipOpts(m) : m.kind === 'image' ? { dur: prefs.value.stillDur } : {});
      if (!clipId) continue;
      added.push(clipId);
      // Neste klipp legges etter dette (append legger alltid til på slutten).
      if (mode !== 'append') T = p.clips[clipId].start + p.clips[clipId].dur;
    }
  });
  if (added.length) selection.value = added;
}

// Medier i samme rekkefølge som i biblioteket.
function mediaOrderOf(ids) {
  const keys = Object.keys(project.value.media);
  return [...ids].sort((a, b) => keys.indexOf(a) - keys.indexOf(b));
}

/* Fart, frosset bilde og lyd */

function speedTargets() {
  const p = project.value;
  const ids = selection.value.length ? selection.value : targetClipsAtPlayhead();
  return ids.filter((id) => ['video', 'recording', 'audio'].includes(p.clips[id]?.type) && !(p.clips[id].speed === 0 && !p.clips[id].ramp));
}

export function setSpeedSelected(speed) {
  const ids = speedTargets();
  if (!ids.length) return toast('Select a video, recording or audio clip to change its speed.');
  commit((q) => ids.forEach((id) => setSpeed(q, id, speed)));
}

export function addFreezeFrame() {
  let id = null;
  commit((q) => (id = freezeFrame(q, getTime(), prefs.value.freezeDur)));
  if (id) selection.value = [id];
  else toast('Move the playhead over a video clip to add a freeze frame.');
}

export function toggleExpandAudio() {
  const p = project.value;
  const ids = (selection.value.length ? selection.value : targetClipsAtPlayhead()).filter((id) => {
    const c = p.clips[id];
    return c && c.type !== 'audio' && clipHasAudio(c, p.media[c.mediaId]);
  });
  if (!ids.length) return;
  commit((q) => {
    const on = !ids.every((id) => q.clips[id].expanded);
    ids.forEach((id) => (q.clips[id].expanded = on));
  });
}

export function detachSelectedAudio() {
  const ids = selection.value.length ? selection.value : targetClipsAtPlayhead();
  let added = [];
  commit((q) => ids.forEach((id) => (added = added.concat(detachAudio(q, id)))));
  if (added.length) selection.value = added;
  else toast('Select a clip with audio to detach it.');
}

export function toggleSolo() {
  const ids = selection.value;
  if (!ids.length) return;
  commit((q) => {
    const on = !ids.every((id) => q.clips[id]?.solo);
    for (const id of ids) if (q.clips[id]) q.clips[id].solo = on || undefined;
  });
}

export function clearSolo() {
  commit((q) => Object.values(q.clips).forEach((c) => delete c.solo));
}

export function liftSelected() {
  const ids = selection.value.filter((id) => project.value.clips[id]?.lane === 0);
  if (ids.length) commit((q) => liftFromStoryline(q, ids));
}

export function overwriteSelectedToPrimary() {
  const ids = selection.value.filter((id) => {
    const c = project.value.clips[id];
    return c && c.lane > 0 && c.lane !== CAPTION_LANE && isVisual(c);
  });
  if (!ids.length) return;
  commit((q) => {
    for (const id of ids) {
      const c = q.clips[id];
      delete q.clips[id];
      overwritePrimary(q, c, c.start);
    }
  });
}

export function insertGapAtPlayhead() {
  commit((q) => insertGap(q, getTime(), 3));
}

export function selectClipAtPlayhead() {
  const T = getTime();
  const p = project.value;
  const c = Object.values(p.clips)
    .filter((x) => x.lane !== CAPTION_LANE && T >= x.start && T < x.start + x.dur)
    .sort((a, b) => b.lane - a.lane)[0];
  if (c) selection.value = [c.id];
}

// Baklengs: lag en baklengs kopi i bakgrunnen første gang, så forhåndsvisningen blir jevn.
export function toggleReverse(on) {
  const ids = speedTargets();
  if (!ids.length) return toast('Select a video, recording or audio clip to reverse it.');
  const p = project.value;
  const value = on ?? !ids.every((id) => p.clips[id].reverse);
  commit((q) => ids.forEach((id) => setReverse(q, id, value)));
  if (value) {
    const done = new Set();
    for (const id of ids) {
      const m = p.media[p.clips[id].mediaId];
      if (!m || done.has(m.id) || Object.values(m.streams).every((st) => st.reversed)) continue;
      done.add(m.id);
      api.reverseMedia(m);
    }
    if (done.size) toast('Preparing the reversed clip in the background. Playback is smooth when it is done.', { timeout: 4000 });
  }
}

export function applyRamp(rampOrPreset) {
  const ids = speedTargets();
  if (!ids.length) return toast('Select a video, recording or audio clip to add a speed ramp.');
  const ramp = typeof rampOrPreset === 'string' ? RAMP_PRESETS.find((r) => r.id === rampOrPreset)?.ramp : rampOrPreset;
  commit((q) => ids.forEach((id) => setRamp(q, id, ramp || null)));
}

export function openRetime() {
  const ids = speedTargets();
  if (!ids.length) return toast('Select a clip to change its speed.');
  selection.value = ids;
  inspectorTab.value = 'speed';
}

/* Automatisk synk av lyd: legg lydklippet under videoen det hører til. */

const waveCache = new Map();
async function loadWavePaths(paths) {
  const need = [...new Set(paths.filter((x) => x && !waveCache.has(x)))];
  await Promise.all(need.map(async (path) => waveCache.set(path, await api.readWave(path).catch(() => null))));
  return (path) => waveCache.get(path) || null;
}
function loadWaves(project, ids) {
  return loadWavePaths(ids.map((id) => clipAudioSource(project, project.clips[id])?.stream.wave));
}

/**
 * Automatisk synk på tidslinjen. Ett eller flere lydklipp kan være valgt. Hvert videoklipp
 * sammenlignes med hele lydklippet, så hver bit finner sitt eget sted i lyden, også om
 * klippene er tatt opp i en annen rekkefølge enn de ligger på tidslinjen. Passer et
 * videoklipp i flere lydklipp, brukes det beste treffet.
 */
export async function autoSyncAudio(audioId = null) {
  if (!audioId && browserFocus.value && browserPicked.value.length) return syncMediaAudio();
  const p = project.value;
  const sel = selection.value.map((id) => p.clips[id]).filter(Boolean);
  const audios = audioId ? [p.clips[audioId]] : sel.filter((c) => c.type === 'audio');
  if (!audios.length || audios.some((c) => c?.type !== 'audio')) return toast('Select one or more audio clips to synchronize them with the video.');
  if (audios.some((a) => (a.speed ?? 1) !== 1 || a.ramp || a.reverse)) return toast('Set the audio clips back to normal speed before synchronizing them.');
  if (audios.some((a) => !clipAudioSource(p, a))) return toast('The audio is still being analyzed. Try again in a moment.');
  // Er det også valgt videoklipp, synkes det bare mot dem.
  const videos = sel.filter((c) => c.type === 'video' || c.type === 'recording').map((c) => c.id);
  const candidates = Object.values(p.clips).filter((c) => (c.type === 'video' || c.type === 'recording') && (!videos.length || videos.includes(c.id)));
  const waveFor = await loadWaves(p, [...audios.map((a) => a.id), ...candidates.map((c) => c.id)]);
  const best = new Map();
  for (const a of audios) {
    for (const m of planSync(project.value, a.id, waveFor, { only: videos.length ? videos : null })) {
      const prev = best.get(m.videoId);
      if (!prev || m.score > prev.score) best.set(m.videoId, { ...m, audioId: a.id });
    }
  }
  const jobs = audios
    .map((a) => ({ audioId: a.id, matches: [...best.values()].filter((m) => m.audioId === a.id).sort((x, y) => p.clips[x.videoId].start - p.clips[y.videoId].start) }))
    .filter((j) => j.matches.length);
  if (!jobs.length) return toast('Could not find matching audio in the video clips on the timeline.', { kind: 'error', timeout: 6000 });
  if (jobs.some((j) => j.matches.length > 1)) {
    syncDialog.value = { jobs };
    return;
  }
  finishSync(jobs, 'first');
}

export function finishSync(jobs, mode) {
  const opts = { mode, muteCamera: prefs.value.syncMuteCamera, group: prefs.value.syncGroup };
  let placed = [];
  commit((q) => {
    for (const j of jobs) placed = placed.concat(applySync(q, j.audioId, j.matches, opts));
  });
  syncDialog.value = null;
  if (!placed.length) return toast('The audio did not overlap the matching video.');
  // Velg den første gruppen (video og lyd), så den kan flyttes med en gang.
  selection.value = groupMembers(project.value, placed[0]);
  const n = placed.length;
  toast(n > 1 ? `Audio synchronized and placed under ${n} clips.` : 'Audio synchronized with the video.', { timeout: 3500 });
}

/* Synk i biblioteket: lyden flettes inn i videoen som en ekstra lydkomponent. */
export async function syncMediaAudio(ids = null) {
  const p = project.value;
  ids = ids || browserTargets();
  const media = ids.map((id) => p.media[id]).filter(Boolean);
  const videos = media.filter((m) => m.kind === 'video' || m.kind === 'recording');
  const audios = media.filter((m) => m.kind === 'audio');
  if (!videos.length || !audios.length) return toast('Select video clips and the audio files that belong to them in the browser, then choose Synchronize Audio.');
  if ([...videos.map(mediaReference), ...audios.map((a) => a.streams.main?.wave)].some((x) => !x)) {
    if (videos.some((v) => !Object.values(v.streams).some((s) => s.hasAudio))) return toast('Some of the video clips have no audio to compare with.');
    return toast('The media is still being analyzed. Try again in a moment.');
  }
  const waveFor = await loadWavePaths([...videos.map((v) => mediaReference(v).stream.wave), ...audios.map((a) => a.streams.main.wave)]);
  const plan = planMediaSync(project.value, ids, waveFor);
  if (!plan.length) return toast('Could not find audio that matches the selected video clips.', { kind: 'error', timeout: 6000 });
  commit((q) => applyMediaSync(q, plan, { muteCamera: true }));
  const synced = new Set(plan.map((x) => x.videoId)).size;
  const missing = videos.length - synced;
  toast(`Synchronized ${synced} of ${videos.length} video clip${videos.length > 1 ? 's' : ''}. The camera audio is switched off but kept.${missing ? ` ${missing} clip${missing > 1 ? 's' : ''} had no matching audio.` : ''}`, { kind: 'success', timeout: 7000 });
}

export function removeSyncedAudio(ids = null) {
  const list = (ids || browserTargets()).filter((id) => Object.values(project.value.media[id]?.streams || {}).some((s) => s.syncedFrom));
  if (!list.length) return toast('The selected clips have no synchronized audio.');
  commit((q) => list.forEach((id) => removeMediaSync(q, id)));
}

/* Optimalisert media: omkoding i bakgrunnen til prosjektets mappe for optimalisert media. */
export async function optimizeMedia(ids = null) {
  const p = project.value;
  const list = (ids || browserTargets()).map((id) => p.media[id]).filter((m) => m && m.kind !== 'image' && Object.values(m.streams).some((s) => s.hasVideo && !s.optimized));
  if (!list.length) return toast(ids ? 'These clips are already optimized.' : 'Select video clips in the browser to optimize them.');
  const folders = projectFolders.value || (await api.projectFolders(null));
  await api.optimizeMedia(list, folders.optimized);
  toast(`Optimizing ${list.length === 1 ? list[0].name : `${list.length} clips`} in the background. Progress is shown at the top.`, { timeout: 4000 });
}

// Medier valgt i biblioteket, eller medier til klippene som er valgt på tidslinjen.
export function browserTargets() {
  if (browserFocus.value && browserPicked.value.length) return browserPicked.value;
  const p = project.value;
  const fromTimeline = [...new Set(selection.value.map((id) => p.clips[id]?.mediaId).filter(Boolean))];
  return fromTimeline.length ? fromTimeline : browserPicked.value;
}

// Flervalg i biblioteket: Cmd/Ctrl klikk legger til, Shift klikk velger et område.
export function pickMedia(e, id, order) {
  const cur = browserPicked.value;
  if (e?.metaKey || e?.ctrlKey) browserPicked.value = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  else if (e?.shiftKey && browserSelection.value && order.includes(browserSelection.value)) {
    const [a, b] = [order.indexOf(browserSelection.value), order.indexOf(id)].sort((x, y) => x - y);
    browserPicked.value = order.slice(a, b + 1);
  } else browserPicked.value = [id];
  if (!e?.shiftKey) browserSelection.value = id;
  browserFocus.value = true;
}

/* Grupper (Cmd/Ctrl G): lyden følger videoen når den flyttes. */

export function groupSelected() {
  const ids = selection.value;
  if (ids.length < 2) return toast('Select two or more clips to group them.');
  commit((q) => groupClips(q, ids));
  toast('Clips grouped. They now move together.', { timeout: 2500 });
}

export function ungroupSelected() {
  const ids = selection.value;
  if (!ids.some((id) => project.value.clips[id]?.group)) return toast('The selection has no grouped clips.');
  commit((q) => ungroupClips(q, ids));
}

// Klikk på et gruppert klipp velger hele gruppen.
export function selectWithGroup(id) {
  selection.value = groupMembers(project.value, id);
}

export function zoomAt(factor, T, offsetPx) {
  timelineView?.zoomAt?.(factor, T, offsetPx);
}

export async function handleDrop(dt, lane, T) {
  const raw = dt.getData('application/x-obslite');
  if (raw) {
    const item = JSON.parse(raw);
    if (item.kind === 'media') {
      // Flere valgte medier legges etter hverandre.
      const list = (item.ids || [item.id]).map((id) => project.value.media[id]).filter(Boolean);
      if (!list.length) return;
      const added = [];
      commit((p) => {
        let t = T;
        for (const m of list) {
          autoFormat(p, m);
          const audio = m.kind === 'audio';
          const mode = lane === 0 && !audio ? 'insert' : 'connect';
          let l = lane;
          if (audio && l >= 0) l = -1;
          if (!audio && (l < 0 || l === CAPTION_LANE)) l = 1;
          const id = addMediaClip(p, m, mode, t, l, list.length === 1 ? browserClipOpts(m) : m.kind === 'image' ? { dur: prefs.value.stillDur } : {});
          if (id) {
            added.push(id);
            t = p.clips[id].start + p.clips[id].dur;
          }
        }
      });
      if (added.length) selection.value = added;
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
  const media = project.value.media[c.mediaId];
  const hasAudio = clipHasAudio(c, media);
  if (['video', 'recording', 'audio'].includes(c.type) && !(c.speed === 0 && !c.ramp)) {
    const sp = c.ramp ? null : c.speed ?? 1;
    items.push({
      label: 'Speed',
      submenu: [
        ...[0.1, 0.25, 0.5].map((v) => ({ id: `speed:${v}`, label: `Slow ${v * 100}%`, checked: sp === v })),
        { id: 'speed:1', label: 'Normal (100%)', checked: sp === 1, accelerator: isMac ? 'Alt+Cmd+R' : 'Ctrl+Alt+R' },
        ...[2, 4, 8, 20].map((v) => ({ id: `speed:${v}`, label: `Fast ${v}x`, checked: sp === v })),
        { separator: true },
        { id: 'reverse', label: 'Reverse Clip', checked: Boolean(c.reverse) },
        { label: 'Speed Ramp', submenu: [...RAMP_PRESETS.map((r) => ({ id: `ramp:${r.id}`, label: r.label })), { separator: true }, { id: 'ramp:none', label: 'Remove Ramp', enabled: Boolean(c.ramp) }] },
      ],
    });
  }
  if (c.type === 'video' || c.type === 'recording') items.push({ id: 'freeze', label: 'Add Freeze Frame', accelerator: 'Alt+F' });
  if (hasAudio && c.type !== 'audio') {
    items.push({ id: 'expand', label: c.expanded ? 'Collapse Audio' : 'Expand Audio', accelerator: isMac ? 'Ctrl+S' : 'Alt+E' });
    items.push({ id: 'detach', label: 'Detach Audio', accelerator: isMac ? 'Ctrl+Shift+S' : 'Alt+Shift+E' });
  }
  const comps = audioComponents(c, media);
  if (c.type !== 'audio' && comps.length > 1) items.push({ label: 'Audio Components', submenu: comps.map((x) => ({ id: `comp:${x.key}`, label: x.label, checked: !x.off })) });
  if (hasAudio || c.type === 'audio') items.push({ id: 'solo', label: c.solo ? 'Unsolo' : 'Solo', accelerator: 'Alt+S' });
  if (c.type === 'audio') items.push({ id: 'sync', label: 'Auto Sync Audio', accelerator: isMac ? 'Alt+Cmd+G' : 'Ctrl+Alt+G' });
  items.push({ separator: true });
  if (selection.value.length > 1) items.push({ id: 'group', label: 'Group Clips', accelerator: 'CmdOrCtrl+G' });
  if (c.group) items.push({ id: 'ungroup', label: 'Ungroup', accelerator: 'Shift+CmdOrCtrl+G' });
  if (c.lane === 0 && c.type !== 'gap') items.push({ id: 'lift', label: 'Lift from Storyline', accelerator: isMac ? 'Alt+Cmd+Up' : 'Ctrl+Alt+Up' });
  if (c.lane > 0 && c.lane !== CAPTION_LANE && isVisual(c)) items.push({ id: 'overwriteDown', label: 'Overwrite to Storyline', accelerator: isMac ? 'Alt+Cmd+Down' : 'Ctrl+Alt+Down' });
  items.push({ separator: true });
  if (c.mediaId) items.push({ id: 'reveal', label: k('Reveal in Finder', 'Show in Explorer') }, { separator: true });
  items.push({ id: 'delete', label: c.lane === 0 ? 'Delete' : 'Delete', accelerator: 'Backspace' });
  if (c.lane === 0) items.push({ id: 'deleteGap', label: 'Delete and Leave Gap', accelerator: 'Shift+Backspace' });
  const id = await api.popupMenu(items);
  if (id?.startsWith('speed:')) return setSpeedSelected(Number(id.slice(6)));
  if (id?.startsWith('ramp:')) return applyRamp(id === 'ramp:none' ? null : id.slice(5));
  if (id === 'reverse') return toggleReverse();
  if (id?.startsWith('comp:')) return toggleComponent(clipId, id.slice(5));
  switch (id) {
    case 'freeze':
      seek(Math.min(Math.max(T, c.start), c.start + c.dur - 1e-3));
      addFreezeFrame();
      break;
    case 'expand':
      toggleExpandAudio();
      break;
    case 'detach':
      detachSelectedAudio();
      break;
    case 'solo':
      toggleSolo();
      break;
    case 'sync':
      autoSyncAudio(clipId);
      break;
    case 'group':
      groupSelected();
      break;
    case 'ungroup':
      ungroupSelected();
      break;
    case 'lift':
      liftSelected();
      break;
    case 'overwriteDown':
      overwriteSelectedToPrimary();
      break;
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
