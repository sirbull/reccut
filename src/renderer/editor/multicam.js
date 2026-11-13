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
  absorbTimeline,
  newMulticam,
  switchClipAngle,
  tidy,
  nextMulticamName,
  placeMulticam,
  programPieces,
} from '../../shared/multicam.js';

// { key, mc, replace: [clipId], editing: bool, initialErrors: [] }
export const multicamSession = signal(null);
// Menyvalg (Angre og Gjør om) går til vinduet mens det er åpent. Vinduet setter handle.
export const multicamMenu = { handle: null };
let sessionKey = 1;

// lossy: klippene på tidslinjen er endret på en måte multicam-klippet ikke kan ta vare på.
function open(mc, { replace = [], editing = false, errors = [], lossy = false } = {}) {
  multicamSession.value = { key: sessionKey++, mc: structuredClone(mc), replace, editing, initialErrors: errors, lossy };
}

// Tekst når noe på tidslinjen ikke kan tas med (en bit midt i er slettet, eller farten er endret).
export const LOSSY_TEXT = 'Parts of this multicam clip were removed or changed speed on the timeline. Cuts, trims and effects are kept, but if you update the timeline from this window, the removed parts come back and speed changes are lost.';

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
  // Import the camera positions, then let the user choose the new program.
  mc.programMode = 'selected';
  mc.cuts = [];
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
  // Kutt, trimming og lydnivå gjort i redigeringen leses inn først, så vinduet viser det som er på tidslinjen.
  const { mc: current, ok } = absorbTimeline(p, mc);
  open(current, { replace: multicamClips(p, mc.id), editing: true, lossy: !ok, errors: ok ? [] : [LOSSY_TEXT] });
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
  if (mc.programMode === 'selected' && !programPieces(project.value, mc).length) {
    toast('Choose a camera in Angles before adding the multicam clip to the timeline.');
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
  // Det som er gjort på tidslinjen, leses inn først, så trimming og kutt ikke går tapt.
  const { mc: current, ok } = absorbTimeline(p, mc);
  if (!ok) {
    toast('Parts of this multicam clip were removed or changed speed on the timeline, so the sound cannot be switched here without losing that. Use Edit Multicam Clip instead.', { kind: 'error', timeout: 8000 });
    return false;
  }
  const next = structuredClone(current);
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

// Bytter kamera i selve klippet. Trimming, effekter, nøkkelbilder og overganger blir som de var.
export function setActiveVideoAngle(clipId, angleId) {
  let result = { ok: false };
  commit((q) => {
    result = switchClipAngle(q, clipId, angleId);
  });
  if (!result.ok && result.reason) toast(result.reason, { timeout: 6000 });
  return result.ok;
}

export function setActiveAudioAngle(clipId, value) {
  return rebuildMulticam(clipId, (mc) => {
    if (mc.audio === value) return false;
    mc.audio = value;
  });
}
