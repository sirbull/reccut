// Multicam-vinduet: åpnes fra valgte klipp, fra et multicam-klipp på tidslinjen eller tomt.
// Vinduet redigerer en kopi. Ingenting endres på tidslinjen før brukeren trykker Add to Timeline.
import { signal } from '@preact/signals';
import { commit, project, selection, editingGroup } from './store.js';
import { toast } from '../ui.jsx';
import {
  addAngles,
  angleRejectReason,
  multicamClips,
  multicamFromClips,
  multicamOfClip,
  multicamTimeOfClip,
  newMulticam,
  switchSegment,
  tidy,
  nextMulticamName,
  placeMulticam,
} from '../../shared/multicam.js';

// { key, mc, replace: [clipId], editing: bool, initialErrors: [] }
export const multicamSession = signal(null);
// Menyvalg (Angre og Gjør om) går til vinduet mens det er åpent. Vinduet setter handle.
export const multicamMenu = { handle: null };
let sessionKey = 1;

function open(mc, { replace = [], editing = false, errors = [] } = {}) {
  multicamSession.value = { key: sessionKey++, mc: structuredClone(mc), replace, editing, initialErrors: errors };
}

// Høyreklikk på valgte klipp over hverandre: Create Multicam Clip.
export function createMulticamFromSelection() {
  const p = project.value;
  const ids = selection.value.filter((id) => p.clips[id]);
  const existing = ids.map((id) => multicamOfClip(p, id)).find(Boolean);
  if (existing && ids.every((id) => p.clips[id].multicam?.id === existing.id)) return editMulticam(ids[0]);
  const usable = ids.filter((id) => ['video', 'audio'].includes(p.clips[id].type));
  const errors = [...new Set(ids.filter((id) => !usable.includes(id) && p.clips[id].mediaId).map((id) => angleRejectReason(p.media[p.clips[id].mediaId])).filter(Boolean))];
  if (!usable.some((id) => p.clips[id].type === 'video')) {
    if (!ids.length) return newMulticamClip();
    return toast(errors[0] || 'Select video clips that lie on top of each other, then choose Create Multicam Clip.', { timeout: 6000 });
  }
  const mc = multicamFromClips(p, usable);
  open(mc, { replace: ids.filter((id) => usable.includes(id)), errors });
}

// Uten utvalg: et tomt vindu der man velger filene selv. Valgte filer i biblioteket blir med.
export function newMulticamClip(mediaIds = []) {
  const p = project.value;
  const mc = newMulticam(nextMulticamName(p));
  const { errors } = addAngles(p, mc, mediaIds);
  open(mc, { errors });
}

// Cmd/Ctrl + dobbeltklikk, eller Edit Multicam Clip i menyen.
export function editMulticam(clipId) {
  const p = project.value;
  const mc = multicamOfClip(p, clipId);
  if (!mc) return toast('This clip is not part of a multicam clip.');
  open(mc, { replace: multicamClips(p, mc.id), editing: true });
}

export function closeMulticam() {
  multicamSession.value = null;
}

// Den blå knappen: legger resultatet på tidslinjen som en gruppe.
export function sendMulticamToTimeline(mc) {
  const s = multicamSession.value;
  if (!mc.angles.some((a) => project.value.media[a.mediaId]?.kind === 'video')) {
    toast('Add at least one video angle first.');
    return false;
  }
  const replace = (s?.replace || []).filter((id) => project.value.clips[id]);
  let placed = [];
  commit((p) => {
    placed = placeMulticam(p, mc, { replace });
  });
  if (!placed.length) {
    toast('Nothing to add. The range is empty.');
    return false;
  }
  editingGroup.value = null;
  selection.value = placed;
  multicamSession.value = null;
  toast(s?.editing ? `${mc.name} was updated on the timeline.` : `${mc.name} was added to the timeline. Double click it to edit the clips inside, or ${window.api.platform === 'darwin' ? 'Cmd' : 'Ctrl'} double click to switch angles again.`, { kind: 'success', timeout: 6000 });
  return true;
}

// Høyreklikk på et multicam-klipp i tidslinjen: Active Video Angle og Active Audio Angle, som i Final Cut Pro.
// Klippet bytter vinkel uten nytt kutt, og gruppen bygges på nytt fra definisjonen.
function rebuildMulticam(clipId, change, message) {
  const p = project.value;
  const mc = multicamOfClip(p, clipId);
  if (!mc) return false;
  const next = structuredClone(mc);
  if (change(next, p) === false) return false;
  tidy(p, next);
  let placed = [];
  commit((q) => {
    placed = placeMulticam(q, next, { replace: multicamClips(q, mc.id) });
  });
  if (placed.length) selection.value = placed;
  if (message) toast(message, { timeout: 2200 });
  return true;
}

export function setActiveVideoAngle(clipId, angleId) {
  const clip = project.value.clips[clipId];
  return rebuildMulticam(clipId, (mc, p) => switchSegment(p, mc, multicamTimeOfClip(p, mc, clip), angleId));
}

export function setActiveAudioAngle(clipId, value) {
  return rebuildMulticam(clipId, (mc) => {
    if (mc.audio === value) return false;
    mc.audio = value;
  });
}
