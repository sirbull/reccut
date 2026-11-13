// Multicam-vinduet: åpnes fra valgte klipp, fra et multicam-klipp på tidslinjen eller tomt.
// Vinduet redigerer en kopi. Ingenting endres på tidslinjen før brukeren trykker Add to Timeline.
import { computed, effect, signal } from '@preact/signals';
import { commit, project, projectEpoch, room, selection, editingGroup } from './store.js';
import { currentSequence } from '../../shared/model.js';
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
let draftTimer = null;
let pendingDraft = null;
const draftRevision = signal(0);
export const multicamDraftState = signal('saved');

function context() {
  const p = project.value;
  const sequenceId = currentSequence(p).id;
  return { projectId: p.id, sequenceId, epoch: projectEpoch.value, storageKey: `multicamDrafts:${p.id}:${sequenceId}` };
}

function sameContext(session) {
  const current = context();
  return session && session.projectId === current.projectId && session.sequenceId === current.sequenceId && session.epoch === current.epoch;
}

function readDrafts(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return {};
  const saved = JSON.parse(raw);
  if (saved.version !== 1 || !saved.drafts || typeof saved.drafts !== 'object') throw new Error('The saved multicam drafts could not be read.');
  return saved.drafts;
}

export const savedMulticamDrafts = computed(() => {
  draftRevision.value;
  try {
    return Object.values(readDrafts(context().storageKey)).sort((a, b) => b.updated - a.updated);
  } catch (error) {
    console.warn(error);
    return [];
  }
});

function timelineSignature(session) {
  const p = project.value;
  const ids = session.editing ? multicamClips(p, session.mc.id) : session.replace;
  return JSON.stringify([...ids].sort().map((id) => p.clips[id] || null));
}

export function multicamTimelineChanged() {
  const session = multicamSession.value;
  return Boolean(session && sameContext(session) && session.baseSignature !== timelineSignature(session));
}

export function recordMulticamDraft(mc, time) {
  const session = multicamSession.value;
  if (!sameContext(session)) return;
  pendingDraft = { ...session, key: undefined, restored: undefined, mc, time, dirty: true, updated: Date.now() };
  multicamDraftState.value = 'saving';
  // A fixed deadline also saves during uninterrupted playback.
  if (draftTimer == null) draftTimer = setTimeout(flushMulticamDraft, 1000);
}

export function flushMulticamDraft() {
  clearTimeout(draftTimer);
  draftTimer = null;
  if (!pendingDraft) return true;
  try {
    const draft = pendingDraft;
    const drafts = readDrafts(draft.storageKey);
    drafts[draft.mc.id] = draft;
    localStorage.setItem(draft.storageKey, JSON.stringify({ version: 1, drafts }));
    pendingDraft = null;
    multicamDraftState.value = 'saved';
    draftRevision.value++;
    return true;
  } catch (error) {
    if (multicamDraftState.value !== 'error') toast(`Could not save the multicam draft: ${error.message}`, { kind: 'error' });
    multicamDraftState.value = 'error';
    return false;
  }
}

function discardSavedDraft(session) {
  clearTimeout(draftTimer);
  draftTimer = null;
  pendingDraft = null;
  try {
    const drafts = readDrafts(session.storageKey);
    delete drafts[session.mc.id];
    localStorage.setItem(session.storageKey, JSON.stringify({ version: 1, drafts }));
    draftRevision.value++;
  } catch (error) {
    toast(`Could not clear the saved multicam draft: ${error.message}`, { kind: 'error' });
  }
}

export async function resumeMulticamDraft(id = null) {
  if (multicamSession.value) return false;
  const scope = context();
  const drafts = savedMulticamDrafts.value;
  if (!drafts.length) return false;
  if (!id && drafts.length > 1) {
    id = await window.api.popupMenu(drafts.map((draft) => ({ id: draft.mc.id, label: draft.mc.name })));
    if (!id) return false;
  }
  const draft = id ? drafts.find((item) => item.mc.id === id) : drafts[0];
  if (!draft || scope.storageKey !== context().storageKey || scope.epoch !== projectEpoch.value) return false;
  if (!open(draft.mc, { ...draft, restored: true })) return false;
  room.value = 'edit';
  return true;
}

// lossy: klippene på tidslinjen er endret på en måte multicam-klippet ikke kan ta vare på.
function open(mc, { replace = [], editing = false, errors = [], initialErrors = errors, lossy = false,
  restored = false, time, dirty = false, baseSignature } = {}) {
  if (!flushMulticamDraft()) return false;
  const session = { ...context(), key: sessionKey++, mc: structuredClone(mc), replace, editing, initialErrors, lossy, restored, time, dirty };
  session.baseSignature = baseSignature ?? timelineSignature(session);
  multicamDraftState.value = 'saved';
  multicamSession.value = session;
  return true;
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
  mc.rangeExplicit = false;
  mc.cuts = [];
  open(mc, { replace: ids.filter((id) => usable.includes(id)), errors, time: mc.range?.in });
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

export function closeMulticam({ discard = false } = {}) {
  const session = multicamSession.value;
  if (!session) return true;
  if (discard) discardSavedDraft(session);
  else if (!flushMulticamDraft()) return false;
  multicamSession.value = null;
  return true;
}

// Den blå knappen: legger resultatet på tidslinjen som en gruppe.
export function sendMulticamToTimeline(mc, { allowTimelineChanges = false } = {}) {
  const s = multicamSession.value;
  if (!sameContext(s)) return false;
  if (multicamTimelineChanged() && !allowTimelineChanges) {
    toast('The timeline changed after this multicam session started. Review the changes before applying the draft.', { kind: 'error' });
    return false;
  }
  if (!mc.angles.some((a) => project.value.media[a.mediaId]?.kind === 'video')) {
    toast('Add at least one video angle first.');
    return false;
  }
  if (mc.programMode === 'selected' && !programPieces(project.value, mc).length) {
    toast('Choose a camera in Angles before adding the multicam clip to the timeline.');
    return false;
  }
  const replace = (s.editing ? multicamClips(project.value, mc.id) : s.replace).filter((id) => project.value.clips[id]);
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
  discardSavedDraft(s);
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

// Drafts belong to one project and sequence. A changed document closes the old
// session after its pending draft has been saved under its original key.
let notifiedDrafts = '';
effect(() => {
  const scope = context();
  const session = multicamSession.value;
  const drafts = savedMulticamDrafts.value;
  Promise.resolve().then(() => {
    if (scope.storageKey !== context().storageKey || scope.epoch !== projectEpoch.value || session !== multicamSession.value) return;
    if (session && !sameContext(session)) {
      // A write failure keeps pendingDraft available for retry, but the old
      // editor must never operate on the newly opened document.
      flushMulticamDraft();
      multicamSession.value = null;
      return;
    }
    const notification = scope.storageKey + drafts.map((draft) => `${draft.mc.id}:${draft.updated}`).join(',');
    if (!session && drafts.length && notification !== notifiedDrafts) {
      notifiedDrafts = notification;
      toast(`${drafts.length === 1 ? 'An autosaved multicam draft is' : `${drafts.length} autosaved multicam drafts are`} available.`, {
        timeout: 0, actions: [{ label: 'Resume Multicam Draft', onClick: () => resumeMulticamDraft() }],
      });
    }
  });
});
window.addEventListener('beforeunload', flushMulticamDraft);
window.api.onFlush(flushMulticamDraft);
