// Kommandoer som brukes av snarveier, menyer og knapper.
import { signal } from '@preact/signals';
import { addSequence, currentSequence, deleteSequence, sequenceList, hasFreeTransitions, CAPTION_LANE, CLIP_COLORS, EFFECTS, parseTransitionSelection, transitionSelection, nearestEdit, audioComponents, RAMP_PRESETS, clipHasAudio, editPoints, isVisual, makeClip, primaryAt, componentVolumeProp, kfTime, valueAt } from '../../shared/model.js';
import { BUILTIN_TEMPLATES, validateTemplate } from '../../shared/titletemplates.js';
import { STAB_DEFAULTS } from '../../shared/stabilize.js';
import { addMask, canMask, removeMask } from '../../shared/shapes.js';
import { AUDIO_EFFECTS, AUDIO_PRESETS, makeEffect, presetEffects } from '../../shared/audiofx.js';
import { effectWarning } from '../../shared/effectSupport.js';
import { BROWSER_VIDEO_EFFECTS, makeVideoEffect } from '../../shared/videoEffects.js';
import { ALL_GROUPS, groupsWithContent, pasteAttributes, removeAttributes } from '../../shared/attributes.js';
import { applyMediaSync, applySync, clipAudioSource, mediaReference, planMediaSync, planSync, removeMediaSync } from '../../shared/sync.js';
import {
  adjacentAudioPairs,
  attachRecordingCamera,
  detachRecordingCamera,
  recordingChildren,
  separateRecordingCamera,
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
  addMediaRecords,
  reportFailed,
  commit,
  commitClipEdit,
  commitSequence,
  previewEdit,
  endPreview,
  mirror,
  endTransient,
  updateTransient,
  browserPlayhead,
  getTime,
  importPaths,
  makeCaptionClip,
  makeTitleClip,
  project,
  projectFolders,
  relinkMedia,
  room,
  selectedComponent,
  selectedTransition,
  selection,
  clipSelection,
  editingGroup,
  inEditingGroup,
  sourceMediaId,
} from './store.js';
import { getViewerTime, openSource, pause, seek, seekViewer, sourceProject } from './playback.js';
import { applyMediaDrop, frameEffectPlacement, libraryDropTarget } from '../../shared/libraryDrop.js';
import { toast } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { droppedPaths } from '../fileDrop.js';
import { setKeyframe } from './keyframes.js';
import { enableKenBurns } from '../../shared/imageMotion.js';
import { addSlideshow, slideshowOptions } from '../../shared/slideshow.js';

const api = window.api;

// Fanen i biblioteket: media, titles, transitions, effects eller captions.
export const browserTab = signal('media');
export const browserSelection = signal(null);
// Alle medier som er valgt i biblioteket, og om biblioteket sist ble brukt (for Cmd A og synk).
export const browserPicked = signal([]);
export const browserFocus = signal(false);
export const slideshowDialog = signal(null);
export function openSlideshow(order = null) {
  const ordered = [...(order || []), ...mediaOrderOf(browserPicked.value)];
  const ids = [...new Set(ordered)].filter((id) => browserPicked.value.includes(id));
  if (!ids.length || ids.some((id) => project.value.media[id]?.kind !== 'image' || project.value.media[id]?.offline)) {
    toast('Select available still images in the media browser first.'); return;
  }
  pause();
  slideshowDialog.value = { ids, projectId: project.value.id, sequenceId: currentSequence(project.value).id };
}
export function confirmSlideshow(options, remember = true) {
  const request = slideshowDialog.value;
  if (!request || request.projectId !== project.value.id || request.sequenceId !== currentSequence(project.value).id) throw new Error('The sequence changed. Open Add as Slideshow again.');
  let result;
  commit((p) => { result = addSlideshow(p, request.ids, options); });
  if (remember) setPrefs({ slideshow: slideshowOptions(options, project.value.fps) });
  slideshowDialog.value = null;
  selection.value = result.foregrounds;
  browserFocus.value = false; sourceMediaId.value = null; selectedTransition.value = null;
  inspectorTab.value = 'video'; room.value = 'edit'; seek(result.start);
  return result;
}
export const exportOpen = signal(false);
export const frameExportOpen = signal(null);

export function openFrameExport() {
  pause();
  const p = project.value;
  if (!(p.duration > 0)) return toast('The timeline is empty. Add some clips first.');
  // Freeze the sequence and playhead so edits while choosing a destination cannot change the image.
  frameExportOpen.value = { project: structuredClone(p), time: getTime() };
}
export const projectsOpen = signal(false);
export const inspectorTab = signal(null);
export const captionEditRequest = signal(null);
export const newProjectOpen = signal(false);
export const prefsOpen = signal(false);
export const saveAsOpen = signal(false);
export const packageOpen = signal(false);
export const historyOpen = signal(false);
// Sekvensen som får nytt navn i biblioteket (id).
export const renamingSequence = signal(null);

/* Sekvenser: flere tidslinjer i samme prosjekt (se model.js) */

export function newSequence() {
  room.value = 'edit';
  browserTab.value = 'media';
  const id = commitSequence((p) => addSequence(p));
  renamingSequence.value = id;
}

export function duplicateSequence(id = currentSequence(project.value).id) {
  room.value = 'edit';
  browserTab.value = 'media';
  commitSequence((p) => addSequence(p, { from: id }));
  toast(`Duplicated. You are now editing ${currentSequence(project.value).name}.`, { timeout: 3000 });
}

export function removeSequence(id) {
  const s = sequenceList(project.value).find((x) => x.id === id);
  if (!s || !confirm(`Delete the sequence "${s.name}"? Media stays in the project. You can undo this.`)) return;
  commitSequence((p) => deleteSequence(p, id));
}
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
  inspectorTab.value = clip.props.patternKind ? 'video' : 'text';
}

// Masker: formen som er valgt for redigering i visningen ({ clipId, id }).
export const selectedMask = signal(null);

export function addMaskToSelected(shape = 'rect') {
  const p = project.value;
  const ids = selection.value.filter((id) => canMask(p.clips[id]));
  if (!ids.length) {
    toast('Select a video, image, recording or title clip first.');
    return;
  }
  let made = null;
  commit((q) => {
    for (const id of ids) made = { clipId: id, id: addMask(q.clips[id], shape, q.width, q.height) };
  });
  selection.value = [made.clipId];
  selectedMask.value = made;
  inspectorTab.value = 'masks';
}

export function deleteMask(clipId, id) {
  commit((q) => q.clips[clipId] && removeMask(q.clips[clipId], id));
  if (selectedMask.value?.id === id) selectedMask.value = null;
}

// Sladding (Redact): legges over alt annet der spillhodet står, eller over området (I og O).
// Lengden følger området, ellers klippet under spillhodet, ellers 5 sekunder.
export function addRedact(mode = 'pixelate', T = getTime(), laneHint = null, extra = {}) {
  const p = project.value;
  const { start, dur, lane } = frameEffectPlacement(p, T, laneHint);
  const W = p.width;
  const H = p.height;
  const clip = makeClip('redact', { start, dur, lane, props: { mode, w: Math.round(W * 0.3), h: Math.round(H * 0.12), ...extra } });
  commit((q) => placeFree(q, clip, start, lane));
  selection.value = [clip.id];
  inspectorTab.value = extra.shape === 'full' ? 'masks' : 'redact';
  return clip.id;
}

// Effekter som dekker hele bildet (Blur, Pixelate og så videre), som et justeringslag.
// Tegn en maske med pennen for å begrense hvor effekten virker.
export function addFrameEffect(mode = 'blur', T = getTime(), laneHint = null) {
  const id = addRedact(mode, T, laneHint, { shape: 'full', name: null });
  return id;
}

export function addAdjustmentLayer(effectType = null, T = getTime(), laneHint = null) {
  const warning = effectType && effectWarning({ type: 'adjustment' }, effectType);
  if (warning) return toast(warning, { timeout: 4000 });
  const { start, dur, lane } = frameEffectPlacement(project.value, T, laneHint);
  const clip = makeClip('adjustment', { start, dur, lane, name: 'Adjustment layer',
    props: { vfx: effectType ? [makeVideoEffect(effectType)] : [] } });
  commit((q) => placeFree(q, clip, start, lane));
  selection.value = [clip.id];
  inspectorTab.value = 'effects';
  return clip.id;
}

/* Pennen: tegn en fri maske punkt for punkt i visningen, som i Premiere Pro. */
export const penMode = signal(null); // { clipId }

export function startPen(clipId = null) {
  const id = clipId || selection.value.find((x) => canMask(project.value.clips[x]));
  if (!id) {
    toast('Select a clip or an effect first, then draw the mask with the pen.');
    return;
  }
  selection.value = [id];
  selectedMask.value = null;
  penMode.value = { clipId: id };
  inspectorTab.value = 'masks';
}

// Pennen er ferdig: punktene (i klippets rom) blir en ny fri maske.
export function finishPen(points, smooth) {
  const pm = penMode.value;
  penMode.value = null;
  if (!pm || points.length < 3) return;
  let made = null;
  commit((q) => {
    const c = q.clips[pm.clipId];
    if (!c) return;
    const id = addMask(c, 'path', q.width, q.height);
    const cx = q.width / 2;
    const cy = q.height / 2;
    c.props[`mask.${id}.points`] = points.flatMap(([x, y]) => [Math.round(x - cx), Math.round(y - cy)]);
    c.props.masks.find((m) => m.id === id).smooth = smooth;
    made = { clipId: pm.clipId, id };
  });
  if (made) selectedMask.value = made;
}

// Effekt fra effektbiblioteket: legges på valgte klipp, eller klippet den slippes på.
const selectedOf = (types) => selection.value.filter((cid) => types.includes(project.value.clips[cid]?.type));
const stackEffect = (id) => BROWSER_VIDEO_EFFECTS.some((e) => e.type === id);
const effectEdit = (id, ids) => (q) => {
  const fx = EFFECTS.find((x) => x.id === id);
  if (!fx && !stackEffect(id) && id !== 'kenBurns') return;
  for (const cid of ids) {
    const c = q.clips[cid];
    if (!c || effectWarning(c, id)) continue;
    if (id === 'kenBurns') { if (c.type === 'image') enableKenBurns(c); continue; }
    if (stackEffect(id)) {
      if (!['video', 'image', 'recording', 'adjustment'].includes(c.type)) continue;
      const effect = makeVideoEffect(id);
      effect.target = c.type === 'recording' ? (c.recordingPart || (q.media[c.mediaId]?.streams?.camera?.hasVideo ? 'camera' : 'screen')) : 'main';
      c.props.vfx = [...(c.props.vfx || []), effect];
      continue;
    }
    c.props.fx = [...new Set([...(c.props.fx || []), id])];
    if (!c.props[fx.prop]) c.props[fx.prop] = fx.def;
  }
};
export function addEffect(id, clipId = null) {
  const types = id === 'kenBurns' ? ['image'] : stackEffect(id) ? ['video', 'image', 'recording', 'adjustment'] : ['video', 'image', 'recording', 'title', 'adjustment'];
  const ids = clipId ? [clipId].filter((cid) => types.includes(project.value.clips[cid]?.type)) : selectedOf(types);
  if (!ids.length) {
    toast(stackEffect(id) ? 'Select a video, image, recording or adjustment layer first, or drag the effect onto a clip.' : 'Select a video, image, title or adjustment layer first, or drag the effect onto a clip.');
    return;
  }
  endPreview();
  const warning = ids.map((cid) => effectWarning(project.value.clips[cid], id)).find(Boolean);
  if (warning) toast(warning, { timeout: 4000 });
  const supported = ids.filter((cid) => !effectWarning(project.value.clips[cid], id));
  if (!supported.length) return;
  editTargets(commit, effectEdit(id, supported));
  selection.value = ids;
  inspectorTab.value = id === 'kenBurns' ? 'video' : 'effects';
}
// Each target is edited explicitly. Inspector mirroring would copy the effect
// back onto unsupported layers in a mixed selection.
function editTargets(edit, mutator) {
  const paused = mirror.paused;
  mirror.paused = true;
  try { edit(mutator); }
  finally { mirror.paused = paused; }
}
// Viser effekten på de valgte klippene i seeren mens musa er over den (se previewEdit).
export const previewEffect = (id) => {
  const ids = selectedOf(id === 'kenBurns' ? ['image'] : stackEffect(id) ? ['video', 'image', 'recording', 'adjustment'] : ['video', 'image', 'recording', 'title', 'adjustment']);
  const supported = ids.filter((cid) => !effectWarning(project.value.clips[cid], id));
  if (supported.length) editTargets(previewEdit, effectEdit(id, supported));
  else endPreview();
};

// Filmlook (filmLooks.js) på klipp. Ny look får full styrke, ellers beholdes styrken.
export function setFilm(c, id) {
  if (!id) {
    delete c.props.film;
    c.props.filmMix = 0;
    delete c.kf.filmMix;
  } else {
    if (!c.props.film) c.props.filmMix = 1;
    c.props.film = id;
  }
}
const filmEdit = (id, ids) => (q) => ids.forEach((cid) => setFilm(q.clips[cid], id));
export function applyFilm(id, ids = selectedOf(['video', 'image', 'recording', 'adjustment'])) {
  if (!ids.length) return toast('Select a video or image clip first.');
  commit(filmEdit(id, ids));
}
export const previewFilm = (id, ids = selectedOf(['video', 'image', 'recording', 'adjustment'])) => ids.length && previewEdit(filmEdit(id, ids));

export function addCaption(T = getTime(), text = '') {
  // Avslutt eventuell pågående tekstredigering før det nye klippet opprettes.
  if (document.activeElement?.matches('input, textarea, [contenteditable="true"]')) document.activeElement.blur();
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
  browserFocus.value = false;
  selectedTransition.value = null;
  selectedComponent.value = null;
  seek(T);
  if (!prefs.value.editorInspectorVisible) setPrefs({ editorInspectorVisible: true });
  inspectorTab.value = 'caption';
  captionEditRequest.value = clip.id;
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
  return p?.clip && inEditingGroup(p.clip) ? [p.clip.id] : [];
}

export function blade() {
  const ids = targetClipsAtPlayhead();
  if (!ids.length) return;
  commitClipEdit((p) => bladeAt(p, getTime(), ids));
}

export function bladeAll() {
  const ids = editingGroup.value ? Object.values(project.value.clips).filter(inEditingGroup).map((c) => c.id) : null;
  commitClipEdit((p) => bladeAt(p, getTime(), ids));
}

export function deleteSelection(ripple = true) {
  if (selectedTransition.value?.startsWith('ax:')) {
    const id = selectedTransition.value.slice(3);
    commit((p) => p.clips[id] && delete p.clips[id].axfade);
    selectedTransition.value = null;
    return;
  }
  if (selectedTransition.value) {
    const { id, edge } = parseTransitionSelection(selectedTransition.value);
    commit((p) => removeTransition(p, id, edge));
    selectedTransition.value = null;
    return;
  }
  const ids = selection.value;
  if (!ids.length) return;
  commitClipEdit((p) => deleteClips(p, ids, { ripple }));
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

export function setComponentMono(clipId, key, mono) {
  commit((p) => {
    const q = p.clips[clipId];
    q.props.audioMono = { ...q.props.audioMono, [key]: mono };
    if (!mono) delete q.props.audioMono[key];
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
  // Klipp over hovedsporet tones inn og ut.
  const free = selection.value.filter((id) => p.clips[id] && hasFreeTransitions(p.clips[id]) && !p.lanes?.[p.clips[id].lane]?.locked);
  if (free.length) {
    commit((q) => {
      for (const id of free) for (const edge of ['start', 'end']) setTransition(q, id, type, dur, edge, prefs.value.transitionAudio);
    });
    selectedTransition.value = transitionSelection(free[0]);
    return;
  }
  let ids = selection.value.filter((id) => p.clips[id]?.lane === 0);
  if (!ids.length) {
    // Uten utvalg: bruk kuttet nærmest spillhodet, også slutten av siste klipp.
    const edit = nearestEdit(p, getTime());
    if (!edit) return;
    commit((q) => setTransition(q, edit.id, type, dur, edit.edge, prefs.value.transitionAudio));
    selectedTransition.value = transitionSelection(edit.id, edit.edge);
    return;
  }
  commit((q) => {
    for (const id of ids) {
      setTransition(q, id, type, dur, 'start', prefs.value.transitionAudio);
      const next = q.clips[q.primary[q.primary.indexOf(id) + 1]];
      if (next && next.type !== 'gap') setTransition(q, next.id, type, dur, 'start', prefs.value.transitionAudio);
      else setTransition(q, id, type, dur, 'end', prefs.value.transitionAudio);
    }
  });
}

export function trimToPlayhead(edge) {
  const T = getTime();
  const ids = targetClipsAtPlayhead();
  if (!ids.length) return;
  commitClipEdit((p) => {
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
  selection.value = Object.values(project.value.clips).filter(inEditingGroup).map((c) => c.id);
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

/* Lim inn effekter og egenskaper (Paste Effects og Paste Attributes, som i Final Cut Pro) */

// Dialogen for Paste Attributes og Remove Attributes: { mode: 'paste' | 'remove', available }.
export const attributesDialog = signal(null);

function attributeSource() {
  const src = clipboard?.[0];
  if (!src) toast('Copy a clip first (Cmd C), then select the clips to paste into.');
  return src || null;
}

function attributeTargets() {
  const ids = selection.value.filter((id) => project.value.clips[id] && project.value.clips[id].type !== 'gap' && project.value.clips[id].type !== 'caption');
  if (!ids.length) toast('Select the clips you want to change.');
  return ids;
}

export function pasteEffects() {
  const src = attributeSource();
  const ids = src ? attributeTargets() : [];
  if (!ids.length) return;
  let n = 0;
  commit((q) => {
    for (const id of ids) n += pasteAttributes(src, q.clips[id], ALL_GROUPS, { stretch: false }) ? 1 : 0;
  });
  toast(n ? `Effects pasted into ${n} clip${n > 1 ? 's' : ''}.` : 'Nothing to paste into the selected clips.', { timeout: 2500 });
}

export function openPasteAttributes() {
  const src = attributeSource();
  if (!src || !attributeTargets().length) return;
  attributesDialog.value = { mode: 'paste', available: groupsWithContent(src), source: src.name || src.type };
}

export function openRemoveAttributes() {
  if (!attributeTargets().length) return;
  attributesDialog.value = { mode: 'remove', available: ALL_GROUPS };
}

export function confirmAttributes(groups, stretch) {
  const d = attributesDialog.value;
  attributesDialog.value = null;
  if (!d || !groups.length) return;
  const ids = attributeTargets();
  const src = d.mode === 'paste' ? clipboard?.[0] : null;
  commit((q) => {
    for (const id of ids) {
      if (d.mode === 'paste' && src) pasteAttributes(src, q.clips[id], groups, { stretch });
      else removeAttributes(q.clips[id], groups);
    }
  });
}

export function removeEffects() {
  const ids = attributeTargets();
  if (!ids.length) return;
  commit((q) => ids.forEach((id) => removeAttributes(q.clips[id], ['effects', 'afx', 'masks'])));
}

/* Lydeffekter */

function audioTargets(clipId) {
  const p = project.value;
  const targets = clipId ? [clipId] : selection.value;
  const warning = targets.map((id) => effectWarning(p.clips[id], null, 'afx')).find(Boolean);
  if (warning) toast(warning, { timeout: 4000 });
  const ok = (c) => c && clipHasAudio(c, p.media[c.mediaId]);
  const ids = clipId ? [clipId].filter((id) => ok(p.clips[id])) : selection.value.filter((id) => ok(p.clips[id]));
  if (!ids.length && !warning) toast('Select a clip with sound first, or drag the effect onto a clip.');
  return ids;
}

export function addAudioEffect(type, clipId = null) {
  if (!AUDIO_EFFECTS[type]) return;
  const ids = audioTargets(clipId);
  if (!ids.length) return;
  editTargets(commit, (q) => ids.forEach((id) => (q.clips[id].props.afx = [...(q.clips[id].props.afx || []), makeEffect(type)])));
  selection.value = ids;
  inspectorTab.value = 'audio';
}

export function applyAudioPreset(presetId, clipId = null) {
  const pr = AUDIO_PRESETS.find((x) => x.id === presetId);
  if (!pr) return;
  const ids = audioTargets(clipId);
  if (!ids.length) return;
  editTargets(commit, (q) => ids.forEach((id) => (q.clips[id].props.afx = [...(q.clips[id].props.afx || []), ...presetEffects(presetId)])));
  selection.value = ids;
  inspectorTab.value = 'audio';
  toast(`${pr.label} added to ${ids.length} clip${ids.length > 1 ? 's' : ''}.`, { timeout: 2000 });
}

export function addMarker() {
  const T = getTime();
  commit((p) => p.markers.push({ id: Math.random().toString(36).slice(2), t: T, label: '' }));
}

export function deleteMarkerAt(id) {
  commit((p) => (p.markers = (p.markers || []).filter((m) => m.id !== id)));
}

export function setRange(which) {
  // I og O i biblioteket markerer i klippet under skummeren (eller ved bibliotekets spillhode).
  if (browserFocus.value && browserMark(which)) return;
  const T = getTime();
  // I og O på samme sted fjerner området.
  const other = project.value.range?.[which === 'in' ? 'out' : 'in'];
  if (other != null && Math.abs(T - other) < frame() / 2) return clearRange();
  commit((p) => {
    const r = p.range || { in: 0, out: p.duration };
    if (which === 'in') r.in = Math.min(T, r.out - frame());
    else r.out = Math.max(T, r.in + frame());
    p.range = { in: Math.max(0, r.in), out: r.out };
  });
}

export function clearRange() {
  if (browserFocus.value && browserRange.value) {
    browserRange.value = null;
    return;
  }
  commit((p) => (p.range = null));
}

// X: området blir hele klippet (i biblioteket eller under spillhodet).
export function rangeClip() {
  if (browserFocus.value && browserMarkClip()) return;
  const ids = targetClipsAtPlayhead();
  if (!ids.length) return;
  const cs = ids.map((id) => project.value.clips[id]);
  const a = Math.min(...cs.map((c) => c.start));
  const b = Math.max(...cs.map((c) => c.start + c.dur));
  commit((p) => (p.range = { in: a, out: b }));
}

// Sporhøyde. 'live' brukes mens man drar (ett angre-steg til slutt), true for rullehjulet.
let heightTimer = null;
export function setTrackHeight(lanes, h, mode) {
  const apply = (q) => {
    q.lanes = q.lanes || {};
    for (const lane of lanes) {
      const cur = { ...(q.lanes[lane] || {}) };
      if (h == null) delete cur.h;
      else cur.h = h;
      q.lanes[lane] = cur;
    }
  };
  if (!mode) return commit(apply);
  updateTransient(apply);
  if (mode !== 'live') {
    clearTimeout(heightTimer);
    heightTimer = setTimeout(endTrackHeight, 400);
  }
}
export function endTrackHeight() {
  clearTimeout(heightTimer);
  endTransient(true);
}

export function stepFrames(n) {
  seekViewer(Math.max(0, getViewerTime() + n * frame()));
}

export function jumpEdit(dir) {
  if (sourceProject.value) return seekViewer(dir > 0 ? sourceProject.value.duration : 0);
  const T = getTime();
  const pts = editPoints(project.value);
  const target = dir > 0 ? pts.find((t) => t > T + 1e-4) : [...pts].reverse().find((t) => t < T - 1e-4);
  if (target != null) seek(target);
}

export function goHome() {
  seekViewer(0);
}

export function goEnd() {
  seekViewer(sourceProject.value?.duration ?? project.value.duration);
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
  const T = getTime();
  commit((p) => {
    for (const id of ids) {
      const c = p.clips[id];
      if (!c) continue;
      const comp = selectedComponent.value;
      const key = comp?.clipId === id ? componentVolumeProp(c, comp.key) : c.type === 'recording' ? 'micVolume' : 'volume';
      if (c.props[key] == null) continue;
      const value = Math.max(-60, Math.min(12, Math.round(((valueAt(c, key, T) ?? 0) + db) * 10) / 10));
      if (c.kf?.[key]?.length) setKeyframe(c, key, kfTime(c, T), value);
      else c.props[key] = value;
    }
  });
}

export function addVolumeKeyframe(clipId, T, prop = 'volume') {
  commit((p) => {
    const c = p.clips[clipId];
    if (!c) return;
    setKeyframe(c, prop, kfTime(c, T), valueAt(c, prop, T) ?? 0);
  });
}

/* Media inn på tidslinjen */

// Import (Cmd I): importvinduet kommer først, og filene velges inne i det, som i Final Cut Pro.
// Vinduet bor i Edit-rommet, så vi bytter dit (også fra +-knappen i tittellinjen).
export const importOptions = signal(null); // { paths, placement }
export function importDialog(placement) {
  room.value = 'edit';
  importOptions.value = { paths: [], placement };
}

export function addImportPaths(paths) {
  const req = importOptions.value;
  if (req) importOptions.value = { ...req, paths: [...new Set([...req.paths, ...paths])] };
}

export function importDroppedFiles(paths, placement) {
  if (!paths.length) return;
  room.value = 'edit';
  browserTab.value = 'media';
  if (!prefs.value.editorBrowserVisible) setPrefs({ editorBrowserVisible: true });
  // Further drops add to the open request, including its original destination.
  if (!importOptions.value) importOptions.value = { paths: [], placement };
  addImportPaths(paths);
}

// Nummererte bilder (render_0001.png) kan importeres som én video. Valgt i importvinduet.
export const FPS_PRESETS = [12, 15, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
export const isNumberedImage = (p) => /\d+\.(png|jpe?g|tiff?|exr|dpx|cin|tga|bmp|webp|jp2|j2k|sgi|rgb|pcx|ppm|pgm|hdr|qoi|avif|heic|jxl)$/i.test(p);

// Én video per sekvens, også når flere bilder fra samme sekvens er valgt.
async function importSequences(paths, fps, placement, copy) {
  const firsts = new Map(paths.map((p) => [p.replace(/\d+(\.[^.\\/]+)$/, '#$1'), p]));
  const folders = projectFolders.value;
  const items = [];
  for (const file of firsts.values()) {
    try {
      const r = await api.importSequence(file, fps, copy && folders?.own ? folders.media : null);
      reportFailed(r.failed, r.missing);
      items.push(...r.items);
    } catch (err) {
      toast(err.message, { kind: 'error', timeout: 9000 });
    }
  }
  addMediaRecords(items, placement);
  return items;
}

export async function confirmImport(opts) {
  const req = importOptions.value;
  importOptions.value = null;
  if (!req?.paths.length) return;
  const frames = opts.sequenceFps ? req.paths.filter(isNumberedImage) : [];
  const copy = opts.copy ?? prefs.value.importCopy;
  const items = [
    ...(frames.length ? await importSequences(frames, opts.sequenceFps, req.placement, copy) : []),
    ...(await importPaths(req.paths.filter((p) => !frames.includes(p)), req.placement, opts)),
  ];
  if (opts.sync && items.length > 1) syncMediaAudio(items.map((m) => m.id));
}

// Utvalg i biblioteket: et helt klipp eller et område valgt i filmstripen.
export const browserRange = signal(null); // { mediaId, in, out }

// Hvor skummeren står i biblioteket nå, og bibliotekets eget spillhode (satt med klikk).
export const browserSkimPos = { mediaId: null, t: 0 };
export { browserPlayhead };

function mediaDuration(m) {
  return m.kind === 'image' ? prefs.value.stillDur : m.duration;
}

// Setter start eller slutt på området i et bibliotekklipp. Gir false om ingen klipp er aktuelt.
export function browserMark(which) {
  let pos = sourceProject.value
    ? { mediaId: sourceMediaId.value, t: getViewerTime() }
    : browserSkimPos.mediaId ? browserSkimPos : browserPlayhead.value;
  if (!pos || !project.value.media[pos.mediaId]) {
    const id = browserSelection.value;
    if (!id || !project.value.media[id]) return false;
    pos = { mediaId: id, t: which === 'in' ? 0 : mediaDuration(project.value.media[id]) };
  }
  const m = project.value.media[pos.mediaId];
  const dur = mediaDuration(m);
  const f = frame();
  const t = Math.max(0, Math.min(dur, pos.t));
  if (browserSelection.value !== m.id || !browserPicked.value.includes(m.id)) pickMedia(null, m.id, []);
  const cur = browserRange.value?.mediaId === m.id ? browserRange.value : null;
  let r;
  if (which === 'in') r = { in: t, out: cur && cur.out > t + f ? cur.out : dur };
  else r = { in: cur && cur.in < t - f ? cur.in : 0, out: t };
  if (r.out - r.in < f) r.out = Math.min(dur, r.in + f);
  browserRange.value = { mediaId: m.id, ...r };
  openSource(m.id, t);
  return true;
}

// X i biblioteket: hele klippet blir området.
export function browserMarkClip() {
  const id = browserSelection.value;
  const m = id && project.value.media[id];
  if (!m) return false;
  browserRange.value = { mediaId: id, in: 0, out: mediaDuration(m) };
  return true;
}

export function browserClipOpts(m, useRange = true) {
  const r = browserRange.value;
  const opts = { includeAudio: m.includeAudio !== false };
  if (useRange && r && r.mediaId === m.id && r.out > r.in) return { ...opts, in: r.in, dur: r.out - r.in };
  return m.kind === 'image' ? { ...opts, dur: prefs.value.stillDur } : opts;
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
      const clipId = addMediaClip(p, m, mode, T, undefined, browserClipOpts(m, ids.length === 1));
      if (!clipId) continue;
      added.push(clipId);
      // Neste klipp legges etter dette (append legger alltid til på slutten).
      if (mode !== 'append') T = p.clips[clipId].start + p.clips[clipId].dur;
    }
  });
  if (added.length) selection.value = added;
  // Innstilling: spillhodet til slutten av det som ble lagt til.
  if (added.length && prefs.value.playheadAfterEdit) {
    const last = project.value.clips[added[added.length - 1]];
    if (last) seek(last.start + last.dur);
  }
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

export function separatePipTrack(clipId) {
  let id;
  commit((q) => { id = separateRecordingCamera(q, clipId); });
  if (id) {
    selection.value = [id];
    inspectorTab.value = 'color';
  }
}

export function detachPip(clipId) {
  const c = project.value.clips[clipId];
  const id = c?.recordingPart === 'camera' ? clipId : recordingChildren(project.value, clipId)[0]?.id;
  if (id) commit((q) => detachRecordingCamera(q, id));
}

export function attachPip(clipId, parentId) {
  commit((q) => attachRecordingCamera(q, clipId, parentId));
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
    return c && c.lane > 0 && c.lane !== CAPTION_LANE && isVisual(c) && !['redact', 'adjustment'].includes(c.type);
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
    .filter((x) => inEditingGroup(x) && x.lane !== CAPTION_LANE && T >= x.start && T < x.start + x.dur)
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
  openSource(id);
}

// Relink File: velg filen på nytt for et medium som mangler (eller er flyttet).
export async function relinkDialog(id) {
  const m = project.value.media[id];
  if (!m) return;
  const file = await api.openFileDialog({ title: `Find ${m.name}`, filters: [{ name: 'Media', extensions: ['*'] }] });
  if (!file) return;
  try {
    await relinkMedia(id, file);
    toast(`${m.name} is linked to ${file.split(/[\\/]/).pop()}.`, { kind: 'success', timeout: 4000 });
  } catch (err) {
    toast(`Could not relink: ${err.message}`, { kind: 'error' });
  }
}

/* Fargekoder: marker ett eller flere klipp og velg en farge. null fjerner fargen. */
export function setClipColor(color, ids = null) {
  const p = project.value;
  ids = (ids || selection.value).filter((id) => p.clips[id]);
  if (!ids.length) ids = targetClipsAtPlayhead();
  if (!ids.length) return toast('Select one or more clips to color them.');
  commit((q) => {
    for (const id of ids) {
      if (color) q.clips[id].colorLabel = color;
      else delete q.clips[id].colorLabel;
    }
  });
}

/* Stabilisering: analyserer kamerabevegelsen i bakgrunnen og glatter den ut. */
export function stabilizeSelected(on = null) {
  const p = project.value;
  let ids = selection.value.filter((id) => p.clips[id]?.type === 'video');
  if (!ids.length) ids = targetClipsAtPlayhead().filter((id) => p.clips[id]?.type === 'video');
  if (!ids.length) return toast('Select a video clip to stabilize it.');
  const value = on ?? !ids.every((id) => p.clips[id].props.stabilize);
  commit((q) => {
    for (const id of ids) {
      const c = q.clips[id];
      c.props.stabilize = value;
      for (const [k, v] of Object.entries(STAB_DEFAULTS)) if (c.props[k] === undefined) c.props[k] = v;
    }
  });
  if (!value) return;
  const need = [...new Set(ids.map((id) => p.clips[id].mediaId))].map((mid) => p.media[mid]).filter((m) => m && !m.streams.main?.motion);
  for (const m of need) api.analyzeMotion(m);
  inspectorTab.value = 'video';
  if (need.length) toast(`Analyzing the camera motion in ${need.length === 1 ? need[0].name : `${need.length} clips`}. The clip is stabilized as soon as it is done.`, { timeout: 5000 });
}

export function reanalyzeMotion(clipId) {
  const p = project.value;
  const m = p.media[p.clips[clipId]?.mediaId];
  if (!m) return;
  commit((q) => {
    const st = q.media[m.id].streams.main;
    if (st) delete st.motion;
  });
  api.analyzeMotion({ ...m, streams: { ...m.streams, main: { ...m.streams.main, motion: undefined } } });
}

/* Titelmaler (.reccut-title): import av egne maler og nedlasting av malpakken for After Effects. */

export async function importTitleTemplate(paths = null) {
  if (!paths) {
    const file = await api.openFileDialog({ title: 'Import Title Template', filters: [{ name: 'Reccut title template', extensions: ['reccut-title', 'json'] }] });
    if (!file) return;
    paths = [file];
  }
  const added = [];
  for (const file of paths) {
    try {
      const tpl = validateTemplate(JSON.parse(await api.readText(file)));
      added.push(tpl);
    } catch (err) {
      toast(`${file.split(/[\\/]/).pop()}: ${err.message}`, { kind: 'error', timeout: 8000 });
    }
  }
  if (!added.length) return;
  commit((p) => {
    p.templates = { ...(p.templates || {}) };
    for (const t of added) p.templates[t.id] = t;
  });
  browserTab.value = 'titles';
  toast(`Imported ${added.map((t) => t.name).join(', ')}. ${added.length > 1 ? 'They are' : 'It is'} under Custom in the Titles browser.`, { kind: 'success', timeout: 5000 });
}

export async function downloadTemplateKit() {
  const example = { ...BUILTIN_TEMPLATES.find((t) => t.id === 'lt-bar'), id: 'example-bar', name: 'Example Bar', category: 'Custom', version: 1 };
  const dir = await api.saveTemplateKit(JSON.stringify(example, null, 2));
  if (dir) toast('Saved the Reccut Template Kit. Open README.txt to get started.', { kind: 'success', timeout: 6000 });
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
  selection.value = clipSelection(id);
}

export function zoomAt(factor, T, offsetPx) {
  timelineView?.zoomAt?.(factor, T, offsetPx);
}

export async function handleDrop(dt, lane, T, options = {}) {
  const raw = dt.getData('application/x-reccut');
  if (raw) {
    const item = JSON.parse(raw);
    const targeted = ['effect', 'afx', 'apreset', 'transition', 'frameFx', 'redact', 'adjustment'].includes(item.kind);
    const target = targeted ? libraryDropTarget(project.value, item, lane, T, { transitionDur: prefs.value.transitionDur, ...options }) : null;
    if (targeted && !target) {
      if (!project.value.lanes?.[lane]?.locked && ['effect', 'afx', 'apreset'].includes(item.kind)) {
        const clip = Object.values(project.value.clips).find((c) => c.lane === lane && T >= c.start && T < c.start + c.dur);
        const warning = effectWarning(clip, item.id, item.kind);
        if (warning) toast(warning, { timeout: 4000 });
      }
      return;
    }
    if (item.kind === 'media') {
      if (!item.clips) {
        const ids = item.ids || [item.id];
        item.clips = ids.filter((id) => project.value.media[id]).map((id) => ({ id, opts: browserClipOpts(project.value.media[id], ids.length === 1) }));
      }
      let added = [];
      commit((p) => {
        added = applyMediaDrop(p, item, lane, T, options.replace);
      });
      if (added.length) {
        selection.value = added;
        browserFocus.value = false;
      }
    } else if (item.kind === 'afx' || item.kind === 'apreset') {
      if (item.kind === 'afx') addAudioEffect(item.id, target.id);
      else applyAudioPreset(item.id, target.id);
    } else if (item.kind === 'redact') {
      addRedact(item.id, T, lane > 0 && lane !== CAPTION_LANE ? lane : null);
    } else if (item.kind === 'frameFx') {
      addFrameEffect(item.id, T, lane > 0 && lane !== CAPTION_LANE ? lane : null);
    } else if (item.kind === 'adjustment') {
      addAdjustmentLayer(item.id === 'empty' ? null : item.id, T, lane > 0 && lane !== CAPTION_LANE ? lane : null);
    } else if (item.kind === 'title') {
      addTitle(item.id, T);
    } else if (item.kind === 'effect') {
      if (target.kind === 'layer') addAdjustmentLayer(item.id, T, lane > 0 && lane !== CAPTION_LANE ? lane : null);
      else addEffect(item.id, target.id);
    } else if (item.kind === 'transition') {
      commit((q) => setTransition(q, target.id, item.id, target.dur, target.edge, prefs.value.transitionAudio));
      selection.value = [];
      selectedTransition.value = transitionSelection(target.id, target.edge);
    }
    return;
  }
  const files = droppedPaths(dt, api.pathForFile);
  if (files.length) {
    const mode = lane === 0 ? 'insert' : 'connect';
    importDroppedFiles(files, { mode, T, lane: lane === 0 ? undefined : lane });
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
  if ((c.lane === 0 && isVisual(c)) || hasFreeTransitions(c)) {
    items.push({ id: 'transition', label: 'Add Cross Dissolve', accelerator: 'CmdOrCtrl+T' });
    if (c.transition) items.push({ id: 'removeTransition', label: 'Remove Transition' });
    if (c.transitionOut) items.push({ id: 'removeTransitionOut', label: 'Remove End Transition' });
    items.push({ separator: true });
  }
  const media = project.value.media[c.mediaId];
  if (c.linkedTo || recordingChildren(project.value, clipId).length) items.push({ id: 'detachPip', label: 'Detach PiP' });
  if (c.type === 'recording' && !c.recordingPart && media?.streams?.screen?.hasVideo && media.streams.camera?.hasVideo) items.push({ id: 'separatePip', label: 'Show PiP on Separate Track' });
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
  if (c.lane > 0 && c.lane !== CAPTION_LANE && isVisual(c) && c.type !== 'adjustment') items.push({ id: 'overwriteDown', label: 'Overwrite to Storyline', accelerator: isMac ? 'Alt+Cmd+Down' : 'Ctrl+Alt+Down' });
  items.push({ separator: true });
  // Effekter og egenskaper fra et kopiert klipp, som i Final Cut Pro.
  if (c.type !== 'gap' && c.type !== 'caption') {
    items.push(
      { id: 'copy', label: 'Copy', accelerator: 'CmdOrCtrl+C' },
      { id: 'pasteEffects', label: 'Paste Effects', accelerator: 'Alt+CmdOrCtrl+V', enabled: Boolean(clipboard?.length) },
      { id: 'pasteAttributes', label: 'Paste Attributes…', accelerator: 'Shift+CmdOrCtrl+V', enabled: Boolean(clipboard?.length) },
      { id: 'removeEffects', label: 'Remove Effects', accelerator: 'Alt+CmdOrCtrl+X' },
      { id: 'removeAttributes', label: 'Remove Attributes…', accelerator: 'Shift+CmdOrCtrl+X' },
      { separator: true }
    );
  }
  if (c.mediaId) items.push({ id: 'reveal', label: k('Reveal in Finder', 'Show in Explorer') }, { separator: true });
  items.push({ id: 'delete', label: c.lane === 0 ? 'Delete' : 'Delete', accelerator: 'Backspace' });
  if (c.lane === 0) items.push({ id: 'deleteGap', label: 'Delete and Leave Gap', accelerator: 'Shift+Backspace' });
  // Fargekode for alle valgte klipp. Haken viser fargen alle de valgte har.
  const sel = selection.value.includes(clipId) ? selection.value : [clipId];
  const colors = new Set(sel.map((cid) => project.value.clips[cid]?.colorLabel || ''));
  const same = colors.size === 1 ? [...colors][0] : null;
  items.splice(items.findIndex((it) => it.separator) + 1, 0, {
    label: sel.length > 1 ? `Color ${sel.length} Clips` : 'Color',
    submenu: [
      ...CLIP_COLORS.map((c, i) => ({ id: `color:${c.id}`, label: c.label, checked: same === c.id, accelerator: isMac ? `Ctrl+Alt+${i + 1}` : `Ctrl+Shift+Alt+${i + 1}` })),
      { separator: true },
      { id: 'color:none', label: 'No Color', enabled: [...colors].some(Boolean), accelerator: isMac ? 'Ctrl+Alt+0' : 'Ctrl+Shift+Alt+0' },
    ],
  }, { separator: true });
  const id = await api.popupMenu(items);
  if (id?.startsWith('color:')) return setClipColor(id === 'color:none' ? null : id.slice(6), sel);
  if (id?.startsWith('speed:')) return setSpeedSelected(Number(id.slice(6)));
  if (id?.startsWith('ramp:')) return applyRamp(id === 'ramp:none' ? null : id.slice(5));
  if (id === 'reverse') return toggleReverse();
  if (id?.startsWith('comp:')) return toggleComponent(clipId, id.slice(5));
  switch (id) {
    case 'copy':
      copySelection();
      break;
    case 'pasteEffects':
      pasteEffects();
      break;
    case 'pasteAttributes':
      openPasteAttributes();
      break;
    case 'removeEffects':
      removeEffects();
      break;
    case 'removeAttributes':
      openRemoveAttributes();
      break;
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
    case 'detachPip':
      detachPip(clipId);
      break;
    case 'separatePip':
      separatePipTrack(clipId);
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
      commitClipEdit((p) => splitClip(p, clipId, T));
      break;
    case 'toggle':
      toggleEnabled();
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
    case 'removeTransitionOut':
      commit((p) => removeTransition(p, clipId, 'end'));
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
