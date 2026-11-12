// Voice Over Studio: opptak av fortellerstemme og snakkende hode, linje for linje fra manus.
// Opptakene lagres i prosjektets Recordings-mappe og syes sammen på tidslinjen.
// Tilstanden (manus, posisjon, opptak) ligger i project.voiceover og angres ikke, som designene.
import { computed, effect, signal } from '@preact/signals';
import { produce } from 'immer';
import { project, projectFolders, scheduleSave, getTime, commit, selection, saveNow, withAnalysis, room, makeCaptionClip } from '../editor/store.js';
import { CAPTION_LANE, currentSequence, isVisual, timelines, uid } from '../../shared/model.js';
import { deleteClips, groupClips, overwritePrimary, mediaClip } from '../../shared/ops.js';
import {
  DEFAULT_PACING,
  chosenTake,
  detectSpeech,
  encodeWav,
  freeAudioLane,
  levelEnvelope,
  nextMissing,
  parseScript,
  peakInfo,
  roomToneFill,
  scriptCaptions,
  itemParts,
  takeFades,
  moveStudioClip,
  splitStudioClip,
  allStudioTakes,
  roomToneLevel,
  trimFor,
  FIRST_PERSON,
  personOf,
  pickKey,
  planStudio,
} from '../../shared/voiceover.js';
import { createChain, presetEffects } from '../../shared/audiofx.js';
import { styleById, styleEffects } from '../../shared/voiceStyles.js';
import { piperById, speakerName } from './piper.js';
import { voxcpmById, voxcpmMood } from './voxcpm.js';
import { aiVoiceInstalled, aiVoicePayload } from '../../shared/aiVoice.js';
import { DEFAULT_VOICE, PREVIEW_TEXT, detectLanguage, languageById, parseVoice, spokenText, voiceById, voiceLanguage, VOICES } from '../../shared/tts.js';
import { recordingPlan } from '../../shared/recordingFormats.cjs';
import { audioSink, prefs, setPrefs } from '../prefs.js';
import { boothOpen } from './state.js';
import * as preview from './preview.js';
import { createSpeechGeneration } from './speech.js';
import { refreshTts, tts, openVoicePackages } from '../voicePackages.js';
export { refreshTts, tts } from '../voicePackages.js';

export { boothOpen };
const fileUrl = (p) => `media://file/${encodeURIComponent(p)}`;
import { toast } from '../ui.jsx';

const api = window.api;
const sep = () => (api.platform === 'win32' ? '\\' : '/');

export const VO_DEFAULTS = {
  voMic: '',
  voCam: '',
  voVideo: false,
  voChannel: 0,
  voSplit: 'paragraph',
  voCountIn: 0,
  voCue: false,
  voAutoAdvance: true,
  voFont: 30,
  voMirror: false,
  voPrompter: false,
  voBrowserVisible: true,
  voInspectorVisible: true,
  voTemplatesOpen: true,
  voEffectsOpen: true,
  // Luft før og etter stemmen når opptaket trimmes. Pausene mellom klippene settes av Pauses.
  voPreRoll: 0.05,
  voPostRoll: 0.08,
  voPacing: DEFAULT_PACING,
  voRoomFill: true,
  voPlace: 'playhead',
  voSubtitles: false, // Send to Edit lager også undertekster fra manuset
  voTimelineH: 230,
  voToneH: 76, // høyden på romlydsporet // høyden på studioets tidslinje, dras i kanten over den
};
export const opt = (k) => prefs.value[k] ?? VO_DEFAULTS[k];

/* Tilstand */

export const status = signal('idle'); // idle | countin | cue | recording | saving | tone
export const countLeft = signal(0);
export const elapsed = signal(0);
export const level = signal({ peak: 0, rms: 0, hold: 0 });
export const inputError = signal(null);
export const devices = signal({ mics: [], cams: [] });
export const cameraStream = signal(null);
export const playingTake = signal(null);
export const recordingKey = signal(null);

const EMPTY = { script: null, pos: 0, takes: [], selected: {}, skip: {}, people: null, person: null, roomTone: null, roomTones: null, roomToneSkipped: false, placed: null };
export const vo = computed(() => ({ ...EMPTY, ...(project.value.voiceover || {}) }));
export const blocks = computed(() => parseScript(vo.value.script?.text || '', { split: opt('voSplit') }));
export const lines = computed(() => blocks.value.filter((b) => b.kind === 'line'));
export const current = computed(() => {
  const list = lines.value;
  return list.find((b) => b.index === vo.value.pos) || list.find((b) => b.index > vo.value.pos) || list.at(-1) || null;
});

// Studioet har sin egen angrehistorikk (Cmd/Ctrl Z), adskilt fra Edit, så det ene aldri angrer det andre.
// Å bytte linje eller person er ikke et steg. Mange endringer rett etter hverandre (et drag) blir ett steg.
// Innstillingene i sidepanelet (Recording, Stitch, Pauses) og inndelingen av manuset er også med.
const QUIET = new Set(['pos', 'person']);
const UNDOABLE_PREFS = ['voCountIn', 'voCue', 'voAutoAdvance', 'voPreRoll', 'voPostRoll', 'voPacing', 'voPlace', 'voRoomFill', 'voSubtitles', 'voSplit'];
const past = [];
const future = [];
let lastStep = -Infinity;
let editingGesture = false;
let historyFor = null;
export const voHistory = signal(0);
function forProject() {
  if (historyFor === project.value.id) return;
  historyFor = project.value.id;
  past.length = future.length = 0;
  lastStep = -Infinity;
  editingGesture = false;
}
const snapshot = () => ({ vo: project.value.voiceover || {}, prefs: Object.fromEntries(UNDOABLE_PREFS.map((k) => [k, prefs.value[k]])) });
function remember(force = false) {
  forProject();
  if (editingGesture) return;
  const now = performance.now();
  if (force || now - lastStep > 400) {
    past.push(snapshot());
    if (past.length > 100) past.shift();
    future.length = 0;
    voHistory.value++;
  }
  lastStep = now;
}
// Ett drag, også med en pause underveis, skal kunne angres med ett tastetrykk.
export function beginGesture() {
  remember(true);
  editingGesture = true;
}
export function endGesture() {
  editingGesture = false;
  lastStep = -Infinity;
}
export function setVo(mutator, separate = false) {
  forProject();
  const prev = { ...EMPTY, ...(project.value.voiceover || {}) };
  const next = produce(prev, mutator);
  if (next === prev) return;
  if (Object.keys(next).some((k) => !QUIET.has(k) && next[k] !== prev[k])) remember(separate);
  if (separate) lastStep = -Infinity;
  project.value = { ...project.value, voiceover: next };
  scheduleSave();
}
const clearHistory = () => {
  past.length = future.length = 0;
  lastStep = -Infinity;
  editingGesture = false;
  voHistory.value++;
};

/* Flere manus. Hvert har egne opptak, valg og sammensying. Det åpne ligger i project.voiceover,
   de andre i project.voiceovers. Personene (stemmer og lyd) og romlyden deles av alle. */
const SHARED = ['people', 'person', 'roomTone', 'roomTones', 'roomToneSkipped'];
const sessionId = (x) => x?.id || 'main';
const scriptName = (x) => x?.script?.name || x?.name || 'Untitled script';
export const scriptId = computed(() => sessionId(project.value.voiceover));
export const scripts = computed(() => {
  const p = project.value;
  return [p.voiceover || {}, ...Object.values(p.voiceovers || {})].map((x) => ({ id: sessionId(x), name: scriptName(x), takes: (x.takes || []).filter((t) => t.key !== 'free').length }));
});
const split = (x) => [Object.fromEntries(SHARED.filter((k) => k in x).map((k) => [k, x[k]])), Object.fromEntries(Object.entries(x).filter(([k]) => !SHARED.includes(k)))];
// Bytter til et annet manus (id), eller et nytt (next). Det som var åpent, legges bort uendret.
function swapTo(id, next = null) {
  const p = project.value;
  const cur = p.voiceover || {};
  const [shared, own] = split(cur);
  const rest = { ...(p.voiceovers || {}) };
  const target = next || rest[id];
  if (!target) return;
  delete rest[sessionId(target)];
  if (own.script || own.takes?.length || own.name) rest[sessionId(cur)] = { ...own, id: sessionId(cur) };
  project.value = { ...p, voiceover: { ...split(target)[1], ...shared }, voiceovers: rest };
  scriptDraft.value = null;
  clearHistory();
  scheduleSave();
}
export function openScript(id) {
  if (busy()) return toast('Stop the take first.');
  if (id !== scriptId.value) swapTo(id);
}
// Nytt manus: det forrige og opptakene dets blir liggende i listen. Skriv eller lim inn med en gang.
export function newScript() {
  if (busy()) return toast('Stop the take first.');
  const id = uid();
  swapTo(id, { id, name: `Script ${scripts.value.length + 1}`, script: null, pos: 0, takes: [], selected: {}, skip: {} });
  scriptDraft.value = '';
}
// Sletter manuset som er åpent, med opptakene. Filer som ikke er brukt i en tidslinje, går til papirkurven.
export async function deleteScript() {
  if (busy()) return toast('Stop the take first.');
  const v = vo.value;
  const takes = v.takes;
  const n = takes.length;
  if (!confirm(`Delete the script "${scriptName(v)}"${n ? ` and its ${n} ${n === 1 ? 'take' : 'takes'}` : ''}? Takes that are not used in a timeline are moved to the Trash. This cannot be undone.`)) return;
  const used = new Set();
  for (const tl of timelines(project.value)) for (const c of Object.values(tl.clips || {})) if (c.mediaId) used.add(c.mediaId);
  const gone = takes.filter((t) => !used.has(t.mediaId));
  const media = { ...project.value.media };
  for (const t of gone) delete media[t.mediaId];
  const others = Object.keys(project.value.voiceovers || {});
  project.value = { ...project.value, media };
  const [shared] = split(project.value.voiceover || {});
  if (others.length) {
    // Det slettede manuset legges ikke bort: det neste i listen åpnes i stedet.
    project.value = { ...project.value, voiceover: { ...shared } };
    swapTo(others[0]);
  } else {
    project.value = { ...project.value, voiceover: { ...shared, id: uid(), name: 'Script 1' } };
    clearHistory();
    scheduleSave();
  }
  if (gone.length) await api.trashVoiceTakes(gone.map((t) => t.file)).catch(() => 0);
  toast(`The script is deleted${gone.length ? `, and ${gone.length} ${gone.length === 1 ? 'take was' : 'takes were'} moved to the Trash` : ''}.`, { timeout: 5000 });
}

// Innstillinger i studioet som kan angres.
export function setVoPrefs(patch) {
  remember();
  setPrefs(patch);
}
function travel(from, to) {
  forProject();
  if (busy() || !from.length) return false;
  to.push(snapshot());
  const step = from.pop();
  project.value = { ...project.value, voiceover: step.vo };
  setPrefs(step.prefs);
  lastStep = -Infinity;
  voHistory.value++;
  scheduleSave();
  return true;
}
export const voUndo = () => travel(past, future);
export const voRedo = () => travel(future, past);

/* Personer: hvert sitt spor, egne opptak, effekter og volum */

const COLORS = ['#2f7a4d', '#2c5d99', '#8a4bb0', '#b0644b', '#4b9aa8', '#a8923b'];
export const DEFAULT_FX = () => presetEffects('studio-voice');
const firstPerson = () => ({ id: FIRST_PERSON, name: 'Voice 1', color: COLORS[0], fx: DEFAULT_FX(), gain: 0 });
export const people = computed(() => (vo.value.people?.length ? vo.value.people : [{ ...firstPerson(), fx: null }]));
export const personId = computed(() => (people.value.some((p) => p.id === vo.value.person) ? vo.value.person : people.value[0].id));
export const person = computed(() => people.value.find((p) => p.id === personId.value));

// Første gang studioet åpnes, får den første personen Studio Voice som standard lyd.
export function ensurePeople() {
  if (vo.value.people?.length) return;
  setVo((v) => {
    v.people = [firstPerson()];
    v.person = FIRST_PERSON;
  });
}
// Studioet åpner alltid på opptak med mikrofon, ikke på en AI-stemme.
export function startOnMic() {
  const mic = people.value.find((p) => !p.ai);
  if (person.value?.ai && mic) setVo((v) => void (v.person = mic.id));
}
const listOf = (v) => (v.people?.length ? v.people : [firstPerson()]);
function editPerson(id, fn) {
  setVo((v) => {
    v.people = listOf(v);
    const p = v.people.find((x) => x.id === id);
    if (p) fn(p, v);
  });
}
export function addPerson() {
  if (busy()) return toast('Stop the take first.');
  const list = people.value;
  const used = new Set(list.map((p) => p.name.toLowerCase()));
  // Navn fra rollene i manuset, ellers Voice 2, Voice 3 ...
  const speaker = [...new Set(lines.value.map((b) => b.speaker).filter(Boolean))].find((n) => !used.has(n.toLowerCase()));
  let n = list.length + 1;
  while (used.has(`voice ${n}`)) n++;
  const p = { id: uid(), name: speaker || `Voice ${n}`, color: COLORS[list.length % COLORS.length], fx: DEFAULT_FX(), gain: 0 };
  setVo((v) => {
    v.people = [...listOf(v), p];
    v.person = p.id;
  });
  toast(`${p.name} is added on a new track. New takes are recorded as ${p.name}.`, { timeout: 3500 });
}
export function choosePerson(id) {
  if (status.value === 'recording') return;
  setVo((v) => void (v.person = id));
}
export const renamePerson = (id, name) => editPerson(id, (p) => void (p.name = String(name).trim().slice(0, 40) || p.name));
export const setPersonFx = (id, fx) => editPerson(id, (p) => void (p.fx = fx));
export const setPersonGain = (id, gain) => editPerson(id, (p) => void (p.gain = gain));
// Clean Voice (AI-støyfjerning) for alle opptakene til personen: styrke 0 til 1, null er av.
export const setPersonClean = (id, amount) => editPerson(id, (p) => void (amount == null ? delete p.clean : (p.clean = amount)));
// Romlydsporet til en person: volum (toneGain), av/på (toneMuted) og høyde (toneHeight).
export const setPersonTone = (id, patch) => editPerson(id, (p) => void Object.assign(p, patch));
// Romlyden i pausene, per person: pausen etter en linje får romlyd fra den som snakket. Bare personer som
// tar opp med mikrofon; AI-stemmer har digital stillhet. all: ta med spor som er slått av (for visning).
export function tonePieces(plan, { all = false, includeMuted = false } = {}) {
  const tone = vo.value.roomTone;
  if (!tone || plan.video || !opt('voRoomFill')) return [];
  const byId = new Map(people.value.map((p) => [p.id, p]));
  return roomToneFill(plan.toneGaps, tone.duration)
    .filter((x) => {
      const p = byId.get(x.person);
      return p && !p.ai && (all || includeMuted || !p.muted) && (all || !p.toneMuted);
    })
    .map((x) => ({ ...x, gain: byId.get(x.person).toneGain || 0 }));
}
export const setPersonHeight = (id, h) => editPerson(id, (p) => void (p.height = h));
export const toggleMute = (id) => editPerson(id, (p) => void (p.muted = !p.muted));
export const toggleHidden = (id) => editPerson(id, (p) => void (p.hidden = !p.hidden));
// Solo: bare denne høres. Trykk igjen for å høre alle.
export function toggleSolo(id) {
  const others = people.value.filter((p) => p.id !== id);
  const alone = others.every((p) => p.muted) && !people.value.find((p) => p.id === id)?.muted;
  setVo((v) => {
    v.people = listOf(v).map((p) => ({ ...p, muted: alone ? false : p.id !== id }));
  });
}
// Fjerner personen fra studioet. Opptakene blir liggende i Media-biblioteket.
export function removePerson(id) {
  if (people.value.length < 2) return;
  setVo((v) => {
    v.people = listOf(v).filter((p) => p.id !== id);
    v.takes = v.takes.filter((t) => personOf(t) !== id);
    if (v.person === id) v.person = v.people[0].id;
  });
}

/* Manus */

export async function loadScriptFile(path) {
  const doc = await api.aiReadDocument(path);
  if (!doc.text?.trim()) throw new Error(`${doc.name} has no text.`);
  useScript(doc.name, doc.text);
}
// Manuset som skrives i redigeringen (null = ikke åpen). Record og Read lagrer det først,
// så man ikke må trykke Done før man tar opp.
export const scriptDraft = signal(null);
export function commitDraft() {
  const text = scriptDraft.value;
  if (text == null) return;
  scriptDraft.value = null;
  useScript(vo.value.script?.name || vo.value.name || 'Voiceover script', text);
}
export function useScript(name, text) {
  setVo((v) => {
    v.script = { name, text };
    const first = parseScript(text, { split: opt('voSplit') }).find((b) => b.kind === 'line');
    if (!v.takes.length || v.pos == null) v.pos = first?.index ?? 0;
  });
  // Manuset legges også i historien, så AI-agenten kan bruke det (match_script).
  const p = project.value;
  const docs = p.story?.documents || [];
  if (!docs.some((d) => d.name === name && d.text === text)) {
    project.value = { ...p, story: { ...(p.story || {}), documents: [...docs.filter((d) => d.name !== name), { name, text }] } };
    scheduleSave();
  }
}
export function setSplit(split) {
  const key = current.value?.key;
  setVoPrefs({ voSplit: split });
  const b = parseScript(vo.value.script?.text || '', { split }).find((x) => x.key === key);
  if (b) setVo((v) => void (v.pos = b.index));
}

export function goTo(index) {
  if (status.value === 'recording') return;
  // En linje med en rolle som heter det samme som en person, tas opp som den personen.
  const sp = blocks.value.find((b) => b.index === index)?.speaker?.toLowerCase();
  const match = sp && people.value.find((p) => p.name.toLowerCase() === sp);
  setVo((v) => {
    v.pos = index;
    if (match) v.person = match.id;
  });
}
export function step(dir) {
  const list = lines.value;
  const i = list.findIndex((b) => b.index === current.value?.index);
  const next = list[Math.max(0, Math.min(list.length - 1, i + dir))];
  if (next) goTo(next.index);
}
export function stepSection(dir) {
  const list = lines.value;
  const cur = current.value;
  if (!cur) return;
  const next = dir > 0 ? list.find((b) => b.section > cur.section) : [...list].reverse().find((b) => b.section < cur.section);
  const target = dir < 0 && next ? list.find((b) => b.section === next.section) : next;
  if (target) goTo(target.index);
}
export function goNextMissing() {
  const i = nextMissing(blocks.value, vo.value, current.value?.index ?? -1, personId.value);
  if (i == null) toast('Every line has a take.', { timeout: 2500 });
  else goTo(i);
}

/* Lydinngang */

let ctx = null,
  node = null,
  source = null,
  stream = null,
  chunks = [],
  stopWaiter = null,
  recorder = null,
  videoChunks = [],
  startedAt = 0,
  timer = null,
  holdTimer = 0;

export async function refreshDevices() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    devices.value = {
      mics: list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      cams: list.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })),
    };
  } catch {}
}

export async function openInput() {
  closeInput();
  inputError.value = null;
  const mic = opt('voMic');
  const cam = opt('voCam');
  const video = opt('voVideo');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // Ren lyd: ingen ekkodemping, støyfjerning eller automatisk nivå. Det gjøres i etterkant.
      audio: { ...(mic ? { deviceId: { exact: mic } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } },
      video: video ? { ...(cam ? { deviceId: { exact: cam } } : {}), width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } : false,
    });
  } catch (err) {
    inputError.value = err.name === 'NotAllowedError' ? 'Reccut has no access to the microphone or camera. Allow it in the system settings.' : `Could not open the input: ${err.message}`;
    return;
  }
  cameraStream.value = video ? stream : null;
  ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  try {
    await ctx.audioWorklet.addModule('vo-capture-worklet.js');
  } catch (err) {
    inputError.value = `Could not start the audio input: ${err.message}`;
    return;
  }
  source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  node = new AudioWorkletNode(ctx, 'reccut-vo-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
  node.port.postMessage({ channel: Number(opt('voChannel')) });
  node.port.onmessage = (e) => {
    const m = e.data;
    if (m.level) {
      const peak = m.level.peak;
      const now = performance.now();
      const hold = peak >= level.value.hold || now - holdTimer > 1500 ? ((holdTimer = now), peak) : level.value.hold;
      level.value = { peak, rms: m.level.rms, hold };
    } else if (m.samples) chunks.push(m.samples);
    else if (m.stopped) stopWaiter?.();
  };
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node).connect(mute).connect(ctx.destination);
  refreshDevices();
}

export function closeInput() {
  stopPlayback();
  try {
    recorder?.state !== 'inactive' && recorder?.stop();
  } catch {}
  recorder = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  cameraStream.value = null;
  ctx?.close().catch(() => {});
  ctx = node = source = null;
  clearInterval(timer);
  status.value = 'idle';
  recordingKey.value = null;
}

export function setChannel(ch) {
  setPrefs({ voChannel: ch });
  node?.port.postMessage({ channel: Number(ch) });
}

/* Opptak */

let cancelWait = null;
const wait = (ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    cancelWait = () => {
      clearTimeout(t);
      reject(new Error('canceled'));
    };
  });

function concat(list) {
  const n = list.reduce((a, c) => a + c.length, 0);
  const out = new Float32Array(n);
  let o = 0;
  for (const c of list) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

export const busy = () => status.value !== 'idle';

// Starter et opptak av linjen som er valgt. Mens det tas opp, er linjen låst.
export async function record({ quick = false } = {}) {
  if (!node) await openInput();
  if (!node) return;
  const line = current.value;
  // Uten manus blir det et fritt opptak.
  await begin(line ? line.key : 'free', { quick });
}

// Fritt opptak uten manus: blir en linje som heter "Free take".
export async function recordFree() {
  if (!node) await openInput();
  if (!node) return;
  await begin('free', { quick: false });
}

async function begin(key, { quick }) {
  if (status.value !== 'idle') return;
  preview.stop();
  recordingKey.value = key;
  try {
    const count = quick ? 0 : Number(opt('voCountIn')) || 0;
    if (count > 0) {
      status.value = 'countin';
      for (let n = count; n > 0; n--) {
        countLeft.value = n;
        await wait(1000);
      }
    }
    if (!quick && opt('voCue') && key !== 'free') {
      const prev = previousTake();
      if (prev) {
        status.value = 'cue';
        await playTake(prev, { tail: 2.5 });
      }
    }
  } catch {
    status.value = 'idle';
    recordingKey.value = null;
    return;
  }
  if (ctx.state === 'suspended') await ctx.resume();
  chunks = [];
  videoChunks = [];
  node.port.postMessage({ record: true });
  if (opt('voVideo') && stream?.getVideoTracks().length) {
    const plan = recordingPlan({ videoFormat: 'webm-vp9', audioFormat: 'opus', hasVideo: true, hasAudio: true }, (m) => MediaRecorder.isTypeSupported(m));
    recorder = new MediaRecorder(stream, { mimeType: plan.mimeType, videoBitsPerSecond: 12e6, audioBitsPerSecond: 256000 });
    recorder.ondataavailable = (e) => e.data.size && videoChunks.push(e.data);
    recorder.start(1000);
  }
  startedAt = performance.now();
  elapsed.value = 0;
  clearInterval(timer);
  timer = setInterval(() => (elapsed.value = (performance.now() - startedAt) / 1000), 100);
  status.value = 'recording';
}

function previousTake() {
  const list = lines.value;
  const i = list.findIndex((b) => b.index === current.value?.index);
  for (let j = i - 1; j >= 0; j--) {
    const t = chosenTake(vo.value, list[j].key, personId.value);
    if (t) return t;
  }
  return null;
}

async function halt() {
  clearInterval(timer);
  const stopped = new Promise((r) => (stopWaiter = r));
  node.port.postMessage({ record: false });
  await Promise.race([stopped, wait(800).catch(() => {})]);
  stopWaiter = null;
  let blob = null;
  if (recorder) {
    const rec = recorder;
    recorder = null;
    if (rec.state !== 'inactive') {
      const done = new Promise((r) => (rec.onstop = r));
      rec.stop();
      await done;
    }
    blob = new Blob(videoChunks, { type: rec.mimeType || 'video/webm' });
  }
  return { samples: concat(chunks), blob };
}

// Avbryter: forkaster det som ble tatt opp, eller stopper nedtellingen.
export async function cancel() {
  if (status.value === 'generating') return cancelGenerate();
  if (generating.value) stopAll = true;
  if (status.value === 'countin' || status.value === 'cue' || status.value === 'tone') {
    cancelWait?.();
    stopPlayback();
    return;
  }
  if (status.value !== 'recording') return;
  await halt();
  status.value = 'idle';
  recordingKey.value = null;
}

// Retake: forkaster opptaket som pågår og starter på nytt med en gang, på samme linje.
export async function retake() {
  if (person.value?.ai) return status.value === 'idle' ? generate() : undefined;
  if (status.value === 'recording') {
    await cancel();
    return record({ quick: true });
  }
  if (status.value !== 'idle') return;
  return record();
}

// Stopper og beholder opptaket.
export async function stop() {
  if (status.value !== 'recording') return;
  const key = recordingKey.value;
  const { samples, blob } = await halt();
  status.value = 'saving';
  try {
    await saveTake(key, samples, blob);
  } catch (err) {
    toast(`Could not save the take: ${err.message}`, { kind: 'error' });
  } finally {
    status.value = 'idle';
    recordingKey.value = null;
  }
}

export async function toggle() {
  commitDraft();
  if (person.value?.ai) return generating.value || status.value === 'generating' ? cancelGenerate() : generate();
  if (status.value === 'recording') return stop();
  if (status.value === 'countin' || status.value === 'cue') return cancel();
  if (status.value === 'idle') return record();
}

async function folder() {
  const f = projectFolders.value || (await api.projectFolders(null).catch(() => null));
  const base = f?.recordings || (await api.baseDir());
  return `${base}${sep()}Voiceover`;
}

const pad = (n, w = 3) => String(n).padStart(w, '0');
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);

// Mikrofonopptak: finn hvor stemmen starter og slutter. Klikket fra Record og stopp (mus, styreflate,
// mellomrom) ligger i kantene, så der letes det ikke etter tale, og litt av hver ende fjernes alltid.
const EDGE_START = 0.1;
const EDGE_END = 0.15;
function micTrim(env, duration) {
  const speech = detectSpeech(env, { floorDb: vo.value.roomTone?.floor ?? null, skipStart: 0.3, skipEnd: 0.4 });
  const t = trimFor(speech, duration, { preRoll: opt('voPreRoll'), postRoll: opt('voPostRoll') });
  const a = Math.max(t.in, EDGE_START);
  const b = Math.min(t.out, duration - EDGE_END);
  return b - a > 0.1 ? { ...t, in: Math.round(a * 1000) / 1000, out: Math.round(b * 1000) / 1000 } : t;
}

// Finner stemmen på nytt i opptak som allerede er tatt (for eksempel tatt før denne analysen fantes).
export async function trimToVoice(takes) {
  let n = 0;
  for (const t of takes) {
    if (people.value.find((p) => p.id === personOf(t))?.ai) continue;
    const buf = await preview.load(t.file).catch(() => null);
    if (!buf) continue;
    const from = t.sourceTakeId ? t.in : 0;
    const to = t.sourceTakeId ? t.out : Math.min(buf.duration, t.duration || buf.duration);
    const samples = buf.getChannelData(0).subarray(Math.floor(from * buf.sampleRate), Math.floor(to * buf.sampleRate));
    const env = levelEnvelope(samples, buf.sampleRate);
    const trim = t.sourceTakeId
      ? trimFor(detectSpeech(env, { floorDb: vo.value.roomTone?.floor ?? null }), to - from, { preRoll: opt('voPreRoll'), postRoll: opt('voPostRoll') })
      : micTrim(env, to - from);
    if (!trim.found && trim.in === 0) continue;
    setTake(t.id, { in: from + trim.in, out: from + trim.out });
    n++;
  }
  toast(n ? `${n} ${n === 1 ? 'take is' : 'takes are'} trimmed to the voice.` : 'No voice was found to trim to.', { kind: n ? 'success' : 'info', timeout: 4000 });
}

async function saveTake(key, samples, blob, { rate = ctx?.sampleRate || 48000, ai = false, advance = true } = {}) {
  if (samples.length < rate * 0.15) throw new Error('The take is too short.');
  const duration = samples.length / rate;
  const isTone = key === 'roomtone';
  const env = levelEnvelope(samples, rate);
  // AI-stemmer har ingen romlyd og ingen klikk: stillheten rundt stemmen er digital.
  const trim = isTone ? { in: 0, out: duration, found: true } : ai ? trimFor(detectSpeech(env), duration, { preRoll: opt('voPreRoll'), postRoll: opt('voPostRoll') }) : micTrim(env, duration);
  const { peakDb, clipped } = peakInfo(samples);
  const line = blocks.value.find((b) => b.key === key);
  const who = person.value;
  const n = vo.value.takes.filter((t) => t.key === key && personOf(t) === who.id).length + 1;
  const toneN = (vo.value.roomTones || (vo.value.roomTone ? [vo.value.roomTone] : [])).reduce((m, t) => Math.max(m, t.n || 1), 0) + 1;
  const label = isTone ? `Room tone ${toneN}` : `${people.value.length > 1 ? `${who.name} ` : ''}${key === 'free' ? `free take ${n}` : `line ${lineNumber(line)} take ${n}`}`.replace(/^./, (c) => c.toUpperCase());
  const dir = await folder();
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const name = `${safe(project.value.name)} VO ${stamp} ${safe(label)}`;
  const video = Boolean(blob);
  const file = `${dir}${sep()}${name}.${video ? 'webm' : 'wav'}`;
  const data = video ? await blob.arrayBuffer() : encodeWav([samples], rate, 24);
  await api.writeBinary(file, data);
  const { items, failed } = await api.importMedia([file]);
  if (!items?.length) throw new Error(failed?.[0] || 'The file could not be imported.');
  const media = { ...withAnalysis(items[0]), name: label, voiceover: true };
  // Lydsporet i en video kan starte litt etter bildet. Lengden fra filen er fasit.
  const fileDur = media.duration || duration;
  const take = {
    id: uid(),
    key,
    person: who.id,
    mediaId: media.id,
    file,
    video,
    in: Math.min(trim.in, fileDur),
    out: Math.min(trim.out, fileDur),
    duration: fileDur,
    found: trim.found,
    peakDb: Math.round(peakDb * 10) / 10,
    clipped,
    star: false,
    bad: false,
    at: Date.now(),
    n,
    media,
  };
  project.value = { ...project.value, media: { ...project.value.media, [media.id]: media } };
  setVo((v) => {
    if (isTone) {
      const { floor, quiet } = roomToneLevel(env);
      const tone = { id: take.id, n: toneN, name: label, at: take.at, mediaId: media.id, file, duration: fileDur, floor: Math.max(-100, floor), quiet, media };
      // Alle romlyder beholdes i en liste, og den nye blir den som brukes.
      v.roomTones = [...(v.roomTones || (v.roomTone ? [v.roomTone] : [])), tone];
      v.roomTone = tone;
      return;
    }
    v.takes.push(take);
    const pk = pickKey(take.person, key);
    if (v.skip?.[pk]) delete v.skip[pk];
    if (key !== 'free') v.selected[pk] = take.id;
    if (advance && opt('voAutoAdvance') && key !== 'free' && line) {
      const list = lines.value;
      const i = list.findIndex((b) => b.key === key);
      if (list[i + 1]) v.pos = list[i + 1].index;
    }
  });
  if (isTone && vo.value.roomTone.quiet) toast(`Room tone saved. Noise floor ${vo.value.roomTone.floor} dB.`, { kind: 'success', timeout: 4000 });
  else if (clipped) toast(`Take ${n} clipped (peak ${take.peakDb} dB). Turn the input gain down and record it again.`, { kind: 'error', timeout: 8000 });
  else if (!trim.found) toast(`No voice was found in take ${n}. It is kept untrimmed.`, { timeout: 6000 });
  return take;
}

export const lineNumber = (b) => (b ? lines.value.findIndex((x) => x.key === b.key) + 1 : 0);

// Romlyd: fem sekunder stillhet i rommet, brukt til å fylle pausene og som støygulv for deteksjonen.
// Nedtelling fra 3, så tar den opp av seg selv og stopper. Esc avbryter.
export const toneLeft = signal(0);
export const roomSetup = signal(false); // romlydkortet vises på nytt (Record Again, eller romlyden hadde lyd i seg)
export async function recordRoomTone(seconds = 5) {
  if (!node) await openInput();
  if (!node || status.value !== 'idle') return;
  recordingKey.value = 'roomtone';
  try {
    status.value = 'countin';
    for (let n = 3; n > 0; n--) {
      countLeft.value = n;
      await wait(1000);
    }
  } catch {
    status.value = 'idle';
    recordingKey.value = null;
    return;
  }
  status.value = 'idle';
  await begin('roomtone', { quick: true });
  status.value = 'tone';
  const t0 = performance.now();
  const tick = setInterval(() => (toneLeft.value = Math.max(0, seconds - (performance.now() - t0) / 1000)), 100);
  toneLeft.value = seconds;
  try {
    await wait(seconds * 1000);
  } catch {
    clearInterval(tick);
    await halt();
    status.value = 'idle';
    recordingKey.value = null;
    return;
  }
  clearInterval(tick);
  toneLeft.value = 0;
  const { samples } = await halt();
  status.value = 'saving';
  try {
    await saveTake('roomtone', samples, null);
    roomSetup.value = !vo.value.roomTone?.quiet;
  } catch (err) {
    toast(`Could not save the room tone: ${err.message}`, { kind: 'error' });
  } finally {
    status.value = 'idle';
    recordingKey.value = null;
  }
}
// Romlydene i prosjektet. Eldre prosjekter har bare én (roomTone).
export const roomTones = computed(() => vo.value.roomTones || (vo.value.roomTone ? [vo.value.roomTone] : []));
// Bytter romlyd underveis. Gjelder nye opptak (støygulvet) og neste sammensying (pausene).
export function useRoomTone(id) {
  const t = roomTones.value.find((x) => x.id === id);
  if (!t) return;
  setVo((v) => {
    v.roomTones = roomTones.value;
    v.roomTone = t;
  });
  roomSetup.value = false;
}
// Fjerner en romlyd fra listen (filen blir liggende i prosjektet). Var den i bruk, tas den nyeste av de andre.
export function deleteRoomTone(id) {
  setVo((v) => {
    const list = roomTones.value.filter((x) => x.id !== id);
    v.roomTones = list;
    if (v.roomTone?.id === id) v.roomTone = list.at(-1) || null;
    if (!list.length) v.roomToneSkipped = true;
  });
}
export function newRoomTone() {
  if (busy()) return toast('Stop the take first.');
  roomSetup.value = true;
}
// Navn og tid, kort: klokkeslett i dag, ellers dato og klokkeslett.
export function toneLabel(t) {
  if (!t.at) return t.name || 'Room tone';
  const d = new Date(t.at);
  const today = d.toDateString() === new Date().toDateString();
  const when = d.toLocaleString([], { ...(today ? {} : { day: 'numeric', month: 'short' }), hour: '2-digit', minute: '2-digit', hour12: false });
  return `${t.name || 'Room tone'} · ${when}`;
}

// Hopper over romlyden. Den kan tas opp senere fra panelet.
export function skipRoomTone() {
  roomSetup.value = false;
  setVo((v) => void (v.roomToneSkipped = true));
}
// Romlydkortet vises når studioet åpnes første gang i prosjektet, og når romlyden tas opp på nytt.
export const needsRoomTone = computed(() => roomSetup.value || (!vo.value.roomTone && !vo.value.roomToneSkipped));

/* AI-stemmer (Kokoro): genereres i stedet for å tas opp, og blir vanlige opptak */

export const generating = signal(null); // { done, total } under Generate All
export const speechGeneration = createSpeechGeneration(api);
export const speechAudition = createSpeechGeneration(api);

// Teksten AI-stemmen leser: "Say it as" for linjen, ellers linjen uten [regi].
export const spokenFor = (key, who = personId.value) => vo.value.spoken?.[pickKey(who, key)] ?? spokenText(blocks.value.find((b) => b.key === key)?.text || '');
export function setSpoken(key, text, who = personId.value) {
  setVo((v) => {
    v.spoken ||= {};
    const k = pickKey(who, key);
    const def = spokenText(blocks.value.find((b) => b.key === key)?.text || '');
    if (!text || text.trim() === def) delete v.spoken[k];
    else v.spoken[k] = text;
  });
}

// Språket manuset ser ut til å være skrevet på (forslag til AI-stemmen).
export const scriptLanguage = computed(() => detectLanguage(vo.value.script?.text || ''));
export const aiLanguage = (p) => languageById(p?.ai?.lang) ||
  languageById(p?.ai?.engine === 'voxcpm' ? voxcpmById(p.ai.voice)?.lang : p?.ai?.engine === 'piper' ? piperById(p.ai.voice)?.lang : null) || voiceLanguage(p?.ai?.voice);

export function addAiPerson(voice = DEFAULT_VOICE, speed = 1, lang = voiceLanguage(voice).id, { name: base = null, fx = [], style = null } = {}) {
  if (busy()) return toast('Stop the take first.');
  const list = people.value;
  const v = voiceById(voice);
  const used = new Set(list.map((p) => p.name.toLowerCase()));
  const stem = base || v.name;
  let name = `${stem} (AI)`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} ${n} (AI)`;
  // En vanlig AI-stemme er ren fra før og får ingen effekter. En stil har sine egne.
  const p = { id: uid(), name, color: COLORS[list.length % COLORS.length], fx, gain: 0, ai: { voice: parseVoice(voice) ? voice : v.id, speed, lang, ...(style ? { style } : {}) } };
  setVo((x) => {
    x.people = [...listOf(x), p];
    x.person = p.id;
  });
  toast(`${p.name} is added on a new track. Press R to read a line, or Read All Missing Lines.`, { timeout: 4500 });
  return p;
}
export const setAiVoice = (id, patch) => editPerson(id, (p) => void (p.ai = { ...p.ai, ...patch }));

// En Piper-stemme som person: laget for ett språk, med egen uttale. speaker for stemmesett med flere stemmer.
export function addPiperPerson(voiceId, speaker = '', speed = 1) {
  const v = piperById(voiceId);
  if (!v) return;
  if (busy()) return toast('Stop the take first.');
  const list = people.value;
  const used = new Set(list.map((p) => p.name.toLowerCase()));
  const stem = speaker ? speakerName(v, speaker) : v.name;
  let name = `${stem} (AI)`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${stem} ${n} (AI)`;
  const p = { id: uid(), name, color: COLORS[list.length % COLORS.length], fx: [], gain: 0, ai: { engine: 'piper', voice: v.id, speaker, speed, lang: v.lang } };
  setVo((x) => {
    x.people = [...listOf(x), p];
    x.person = p.id;
  });
  toast(`${p.name} is added on a new track. Press R to read a line, or Read All Missing Lines.`, { timeout: 4500 });
  return p;
}

export function addVoxcpmPerson(voiceId, mood = 'neutral') {
  const voice = voxcpmById(voiceId);
  if (!voice || !voxcpmMood(mood)) return;
  if (busy()) return toast('Stop the take first.');
  const ai = { engine: 'voxcpm', voice: voice.id, mood, lang: voice.lang };
  if (!aiVoiceInstalled(ai, tts.value)) return openVoicePackages({ lang: voice.lang, reason: 'Download this voice package to add the voice.' });
  const list = people.value, used = new Set(list.map((p) => p.name.toLowerCase()));
  let name = `${voice.name} (AI)`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${voice.name} ${n} (AI)`;
  const p = { id: uid(), name, color: COLORS[list.length % COLORS.length], fx: [], gain: 0, ai };
  setVo((x) => { x.people = [...listOf(x), p]; x.person = p.id; });
  toast(`${p.name} is added on a new track. Press R to read a line, or Read All Missing Lines.`, { timeout: 4500 });
  return p;
}

// Legger til en ferdig stemmestil som en person: stemme eller blanding, fart og effekter.
export function addAiStyle(styleId, lang = null) {
  const st = styleById(styleId);
  if (!st) return;
  return addAiPerson(st.voice, st.speed, lang || st.lang, { name: st.name, fx: styleEffects(st), style: st.id });
}

let stopAll = false;
// Leser linjen som er valgt, med AI-stemmen til personen som er valgt.
export async function generate(key = current.value?.key, { advance = true } = {}) {
  const who = person.value;
  if (!who?.ai || !key || status.value !== 'idle') return;
  if (!aiVoiceInstalled({ ...who.ai, lang: aiLanguage(who).id }, tts.value)) {
    stopAll = true;
    return openVoicePackages({ lang: aiLanguage(who).id, reason: 'Download a voice package to read this script.' });
  }
  const text = spokenFor(key, who.id);
  if (!text) return toast('This line has nothing to read.');
  preview.stop();
  status.value = 'generating';
  recordingKey.value = key;
  try {
    const { samples, rate } = await speechGeneration.run(aiVoicePayload({ ...who.ai, lang: aiLanguage(who).id }, text));
    status.value = 'saving';
    await saveTake(key, samples instanceof Float32Array ? samples : new Float32Array(samples), null, { rate, ai: true, advance });
  } catch (err) {
    if (/MODEL_MISSING:voices/.test(err.message)) openVoicePackages({ lang: aiLanguage(who).id, reason: 'Download a voice package to read this script.' });
    else if (err.name !== 'AbortError') toast(`Could not read the line: ${err.message}`, { kind: 'error', timeout: 9000 });
    stopAll = true;
  } finally {
    status.value = 'idle';
    recordingKey.value = null;
  }
}
// Leser alle linjene som mangler opptak for AI-stemmen, i rekkefølge. Mellomrom eller Esc stopper.
export async function generateAll() {
  commitDraft();
  const who = person.value;
  if (!who?.ai || status.value !== 'idle') return;
  const todo = lines.value.filter((b) => !chosenTake(vo.value, b.key, who.id));
  if (!todo.length) return toast(`${who.name} has read every line. Select a line and press R to read it again.`, { timeout: 4000 });
  stopAll = false;
  const startedAt = Date.now();
  generating.value = { done: 0, total: todo.length, startedAt };
  for (const b of todo) {
    if (stopAll) break;
    goTo(b.index);
    await generate(b.key, { advance: false });
    if (!stopAll) generating.value = { done: generating.value.done + 1, total: todo.length, startedAt };
  }
  generating.value = null;
}
export function cancelGenerate() {
  stopAll = true;
  speechGeneration.cancel();
}

// Prøvelytt en stemme før den legges til.
let sampleCtx = null,
  sampleSrc = null;
let sampleSequence = 0;
export const sampling = signal(null);
export function stopVoicePreview() {
  sampleSequence++;
  speechAudition.cancel();
  sampling.value = null;
  sampleSrc?.stop();
  sampleSrc?.disconnect();
  sampleSrc = null;
}
// Ferdige lydprøver som følger med appen, for stemmer som ikke er lastet ned ennå.
// ponytail: bare de engelske har prøve ennå. Kjør scripts/voice-samples.mjs med det nye tillegget, og ta med alle her.
const SAMPLED = new Set(VOICES.filter((v) => languageById(voiceLanguage(v.id).id).english).map((v) => v.id));
// Siden er en file://-side, så prøvene hentes gjennom media://, som fetch kan lese.
const bundled = (rel) => {
  const p = decodeURIComponent(new URL(rel, location.href).pathname);
  return fileUrl(api.platform === 'win32' ? p.slice(1) : p);
};
export const kokoroSample = (id) => (SAMPLED.has(id) ? bundled(`voice-samples/kokoro/${id}.ogg`) : null);
export const piperSample = (v, speaker) => bundled(`voice-samples/piper/${v.id}-${Math.max(0, v.speakers.indexOf(speaker))}.ogg`);
export const voxcpmSample = (id, mood = 'neutral') => voxcpmById(id) && voxcpmMood(mood) ? bundled(`voice-samples/voxcpm/${encodeURIComponent(id)}-${encodeURIComponent(mood)}.ogg`) : null;

// sample: spill av en ferdig lydprøve i stedet for å lage lyden (stemmen er ikke lastet ned).
export async function previewVoice(voice, speed = 1, lang = voiceLanguage(voice).id, { fx = null, key = voice, engine = 'kokoro', speaker = '', mood = 'neutral', sample = null } = {}) {
  const previous = sampling.value;
  stopVoicePreview();
  if (previous === key) return;
  const sequence = sampleSequence;
  sampling.value = key;
  try {
    sampleCtx ||= new AudioContext();
    sampleCtx.setSinkId?.(audioSink.value).catch(() => {});
    let buf;
    if (sample) {
      buf = await sampleCtx.decodeAudioData(await (await fetch(sample)).arrayBuffer());
    } else {
      const { samples, rate } = await speechAudition.run(aiVoicePayload({ voice, speed, lang, engine, speaker, mood }, PREVIEW_TEXT[lang] || PREVIEW_TEXT['en-us']));
      buf = sampleCtx.createBuffer(1, samples.length, rate);
      buf.copyToChannel(samples instanceof Float32Array ? samples : new Float32Array(samples), 0);
    }
    if (sequence !== sampleSequence) return;
    if (fx?.length) buf = await voiceWithEffects(buf, fx);
    if (sequence !== sampleSequence) return;
    await sampleCtx.resume();
    if (sequence !== sampleSequence) return;
    sampleSrc = sampleCtx.createBufferSource();
    sampleSrc.buffer = buf;
    sampleSrc.connect(sampleCtx.destination);
    if (sequence !== sampleSequence) return;
    sampleSrc.onended = () => sequence === sampleSequence && (sampling.value = null);
    sampleSrc.start();
  } catch (err) {
    if (sequence !== sampleSequence) return;
    sampling.value = null;
    if (/MODEL_MISSING:voices/.test(err.message)) openVoicePackages({ lang, reason: 'Download a voice package to preview this voice.' });
    else if (err.name !== 'AbortError') toast(`Could not play the voice: ${err.message}`, { kind: 'error' });
  }
}

// Render auditions with the same chain as export, including delay compensation
// and the final samples. A short voice sample must not lose its ending to pitch.
async function voiceWithEffects(buf, list) {
  const chain = createChain(buf.sampleRate);
  chain.update(list);
  const latency = chain.latency;
  const L = new Float32Array(buf.length + latency);
  const R = new Float32Array(L.length);
  L.set(buf.getChannelData(0));
  R.set(buf.getChannelData(Math.min(1, buf.numberOfChannels - 1)));
  chain.process(L, R, L.length);
  const out = sampleCtx.createBuffer(2, buf.length, buf.sampleRate);
  out.copyToChannel(L.subarray(latency), 0);
  out.copyToChannel(R.subarray(latency), 1);
  return out;
}

/* Valg av opptak */

export function selectTake(take) {
  setVo((v) => {
    const pk = pickKey(personOf(take), take.key);
    if (v.skip?.[pk]) delete v.skip[pk];
    v.selected[pk] = take.id;
    const t = v.takes.find((x) => x.id === take.id);
    if (t) t.bad = false;
  });
}
export function toggleStar(take) {
  setVo((v) => {
    const t = v.takes.find((x) => x.id === take.id);
    if (t) t.star = !t.star;
  });
}
export function markBad(take) {
  setVo((v) => {
    const t = v.takes.find((x) => x.id === take.id);
    if (!t) return;
    t.bad = !t.bad;
    if (t.bad && v.selected[pickKey(personOf(t), t.key)] === t.id) delete v.selected[pickKey(personOf(t), t.key)];
  });
}
export function deleteTake(take) {
  setVo((v) => {
    v.takes = v.takes.filter((x) => x.id !== take.id);
    if (v.selected[pickKey(personOf(take), take.key)] === take.id) delete v.selected[pickKey(personOf(take), take.key)];
  });
}
/* Studioets tidslinje */

// Planen slik den blir sydd sammen, med ett spor per person. Deaktiverte spor beholder plassen.
// Én person med bare video legges tett, uavhengig av om sporet er aktivt.
export function studioPlan(start = 0, from = 0) {
  const v = vo.value;
  const list = people.value.map((p) => ({ id: p.id, active: !p.muted }));
  const pacing = { ...DEFAULT_PACING, ...opt('voPacing') };
  // Med romlyd slutter klippet der stemmen slutter, og pausen er romlyd. Uten romlyd fylles pausen
  // med opptakets egen stillhet etter stemmen, så langt den rekker, i stedet for digital stillhet.
  const tone = Boolean(v.roomTone && opt('voRoomFill'));
  const fill = planStudio(blocks.value, v, { start, pacing, room: tone ? false : 'fill', from, people: list });
  const live = fill.items;
  const speakers = new Set(live.map((it) => it.person));
  const video = live.length > 0 && speakers.size === 1 && live.every((it) => it.take.video);
  const result = video ? { ...planStudio(blocks.value, v, { start, pacing, room: 'tight', from, people: list }), video } : { ...fill, video };
  // Pausene som får romlyd. Romlyd som er slettet i studioet (toneOff, etter linjen) blir stille.
  result.toneGaps = result.gaps.filter((g) => !v.toneOff?.[g.after ?? 'start']);
  return result;
}
export const plan = computed(() => studioPlan(0));

export function splitTake(plan, id, time) {
  let split = null;
  setVo((v) => { split = splitStudioClip(v, plan, id, time, [uid(), uid()]); }, true);
  return split;
}

export function moveTake(plan, id, delta) {
  setVo((v) => moveStudioClip(v, plan, id, delta));
}

// Endrer volum, fades, pause eller trim på et opptak. Brukes også mens det dras, så det lagres i bakgrunnen.
export const setTake = (id, patch) => setTakes([id], patch);
export function setTakes(ids, patch) {
  const wanted = new Set(ids);
  setVo((v) => {
    for (const t of allStudioTakes(v)) {
      if (!wanted.has(t.id)) continue;
      for (const [k, val] of Object.entries(patch)) {
        if (val == null) delete t[k];
        else t[k] = val;
      }
      if ('in' in patch || 'out' in patch) {
        t.in = Math.max(0, Math.min(t.in, 'out' in patch ? t.duration - 0.05 : t.out - 0.05));
        t.out = Math.min(t.duration, Math.max(t.out, t.in + 0.05));
      }
      const fades = takeFades(t);
      if (t.fadeIn != null) t.fadeIn = fades.fadeIn;
      if (t.fadeOut != null) t.fadeOut = fades.fadeOut;
    }
  });
}
// Sletter et klipp fra tidslinjen: linjen hoppes over, men opptakene beholdes og kan hentes tilbake.
export function skipLine(key, on = true, who = personId.value) {
  setVo((v) => {
    v.skip ||= {};
    if (on) v.skip[pickKey(who, key)] = true;
    else delete v.skip[pickKey(who, key)];
  });
}

export function setTrim(take, edge, value) {
  setVo((v) => {
    const t = v.takes.find((x) => x.id === take.id);
    if (!t) return;
    if (edge === 'in') t.in = Math.max(0, Math.min(value, t.out - 0.05));
    else t.out = Math.min(t.duration, Math.max(value, t.in + 0.05));
  });
}
// Siste opptak av linjen markeres som dårlig, og linjen blir valgt, klar for et nytt forsøk.
export function scrapLast() {
  const v = vo.value;
  const last = [...v.takes].filter((t) => t.key !== 'free' && !t.bad && personOf(t) === personId.value).sort((a, b) => b.at - a.at)[0];
  if (!last) return;
  markBad(last);
  const b = blocks.value.find((x) => x.key === last.key);
  if (b) goTo(b.index);
  toast(`Take ${last.n} of line ${lineNumber(b)} is marked as not used. Press R to record it again.`, { timeout: 3500 });
}

export const takesFor = (key, who = personId.value) => vo.value.takes.filter((t) => t.key === key && personOf(t) === who);

/* Avspilling */

let audio = null,
  stopAt = 0,
  playResolve = null;
let takeCtx = null, takeFx = null, takeGain = null, takeFxReady = null;
let takeRun = 0, takeEndTimer = 0, takeLatency = 0, auditionTake = null;

// The take-list Listen button uses the person's sound too, just like the studio
// timeline. Keep the media element graph so pitch and volume can change live.
effect(() => {
  const id = playingTake.value;
  const take = auditionTake;
  const who = id && take && people.value.find((p) => p.id === personOf(take));
  if (!takeGain) return;
  takeGain.gain.value = who ? 10 ** (((who.gain || 0) + (take.gain || 0)) / 20) : 1;
  takeFx?.port.postMessage(who?.fx || []);
  const chain = createChain(takeCtx.sampleRate);
  chain.update(who?.fx || []);
  takeLatency = chain.latency / takeCtx.sampleRate;
});

export function stopPlayback() {
  takeRun++;
  clearTimeout(takeEndTimer);
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  playingTake.value = null;
  auditionTake = null;
  takeFx?.port.postMessage([]);
  playResolve?.();
  playResolve = null;
}
export async function playTake(take, { tail = 0 } = {}) {
  stopPlayback();
  const run = takeRun;
  audio ||= new Audio();
  if (!takeCtx) {
    takeCtx = new AudioContext({ latencyHint: 'interactive' });
    takeGain = takeCtx.createGain();
    takeCtx.createMediaElementSource(audio).connect(takeGain);
    takeFxReady = takeCtx.audioWorklet.addModule('audiofx-worklet.js').then(() => {
      takeFx = new AudioWorkletNode(takeCtx, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      takeGain.connect(takeFx).connect(takeCtx.destination);
    }, () => takeGain.connect(takeCtx.destination));
  }
  try {
    await takeFxReady;
    await takeCtx.resume();
  } catch { return; }
  if (run !== takeRun) return;
  takeCtx.setSinkId?.(audioSink.value).catch(() => {});
  audio.src = fileUrl(take.file);
  const from = tail ? Math.max(take.in, take.out - tail) : take.in;
  stopAt = take.out;
  auditionTake = take;
  playingTake.value = take.id;
  const finish = () => {
    audio.pause();
    clearTimeout(takeEndTimer);
    takeEndTimer = setTimeout(() => { if (run === takeRun) stopPlayback(); }, takeLatency * 1000);
  };
  return new Promise((resolve) => {
    playResolve = resolve;
    audio.onloadedmetadata = () => {
      audio.currentTime = from;
      audio.play().catch(() => stopPlayback());
    };
    audio.ontimeupdate = () => { if (!audio.paused && audio.currentTime >= stopAt) finish(); };
    audio.onended = finish;
    audio.onerror = () => stopPlayback();
  });
}
export function playCurrent() {
  if (playingTake.value) return stopPlayback();
  const t = current.value && chosenTake(vo.value, current.value.key, personId.value);
  if (t) playTake(t);
}

/* Sammensying på tidslinjen */

// Syr valgte opptak sammen i manusrekkefølge, ett spor per person som høres, med personens
// effekter og volum. En tidligere sammensying i samme sekvens erstattes, så nye retakes kan syes
// inn igjen. Video legges i et ledig hovedspor eller over alle andre videospor, og lyd under.
/* Media fra studioet */

// Hvert opptak i Media-nettleseren får innstillingene fra studioet (trim, volum, nøkkelbilder, fades og
// personens effekter), så et klipp som dras ut derfra, er likt de som ble sydd sammen.
export function syncVoiceoverMedia() {
  const v = vo.value;
  const byId = new Map(people.value.map((p) => [p.id, p]));
  const media = { ...project.value.media };
  let changed = false;
  const round1 = (x) => Math.round(x * 10) / 10;
  for (const t of v.takes) {
    const m = media[t.mediaId];
    if (!m) continue;
    const who = byId.get(personOf(t));
    const gain = who?.gain || 0;
    const fx = who?.fx ?? DEFAULT_FX();
    const clipDefaults = {
      in: t.in,
      dur: Math.max(0.05, t.out - t.in),
      props: { volume: round1((t.gain || 0) + gain), aFadeIn: t.fadeIn ?? 0.02, aFadeOut: t.fadeOut ?? 0.04, ...(fx.length ? { afx: fx } : {}) },
      ...(t.volKf?.length ? { kf: { volume: t.volKf.map(([s, db, ease]) => [s, round1(db + gain), ...(ease ? [ease] : [])]) } } : {}),
    };
    if (JSON.stringify(m.clipDefaults) === JSON.stringify(clipDefaults)) continue;
    media[t.mediaId] = { ...m, clipDefaults };
    changed = true;
  }
  if (changed) {
    project.value = { ...project.value, media };
    scheduleSave();
  }
}

// open: gå til Edit etterpå, med det som ble sydd sammen valgt.
export function stitch({ from = 0, open = false } = {}) {
  syncVoiceoverMedia();
  const v = vo.value;
  const p = project.value;
  const seq = currentSequence(p).id;
  const first = studioPlan(0, from);
  if (!first.items.length) return toast('There are no takes to put on the timeline yet.');
  const video = first.video;
  const previous = v.placed?.seq === seq ? v.placed.ids.filter((id) => p.clips[id]) : [];
  const prevStart = previous.length ? Math.min(...previous.map((id) => p.clips[id].start)) : null;
  const start = prevStart ?? (opt('voPlace') === 'end' ? (video ? p.clips[p.primary.at(-1)]?.start + p.clips[p.primary.at(-1)]?.dur || 0 : p.duration) : getTime());
  const plan = studioPlan(start, from);
  const byId = new Map(people.value.map((x) => [x.id, x]));
  const live = plan.items;
  let placed = [];
  commit((d) => {
    if (previous.length) deleteClips(d, previous, { ripple: false });
    const mediaFor = (t) => {
      if (!d.media[t.mediaId] && t.media) d.media[t.mediaId] = t.media;
      return d.media[t.mediaId];
    };
    const all = [];
    const spoken = new Map(); // Én undertekst per manuslinje, også når stemmen er delt i klipp.
    // Et opptak med kutt blir ett klipp per del, rett etter hverandre, med korte fades ved kuttene.
    const makeClips = (items) =>
      items.flatMap((it) => {
        const m = mediaFor(it.take);
        if (!m) return [];
        const parts = itemParts(it);
        const clips = parts.map((part, k) => {
          const who = byId.get(it.person);
          const c = mediaClip(m, { in: part.in, dur: part.dur });
          const role = who && people.value.length > 1 ? who.name : it.block.speaker;
          c.name = `${role ? `${role}: ` : ''}${it.block.text}`.slice(0, 80);
          // Justeringer fra studioet: volum per klipp pluss personens volum, fades og personens effekter.
          c.props.volume = Math.round(((it.take.gain || 0) + (who?.gain || 0)) * 10) / 10;
          // Nøkkelbildene fra studioet blir volumnøkkelbilder i Edit (samme kildetid, pluss personens volum).
          if (it.take.volKf?.length) c.kf = { ...(c.kf || {}), volume: it.take.volKf.map(([t, db, ease]) => [t, Math.round((db + (who?.gain || 0)) * 10) / 10, ...(ease ? [ease] : [])]) };
          else if (c.kf?.volume) delete c.kf.volume;
          const fades = takeFades(it.take);
          c.props.aFadeIn = k === 0 ? fades.fadeIn : Math.min(0.006, part.dur / 2);
          c.props.aFadeOut = k === parts.length - 1 ? fades.fadeOut : Math.min(0.006, part.dur / 2);
          const fx = who?.fx ?? DEFAULT_FX();
          if (fx.length) c.props.afx = fx.map((e) => ({ ...e, id: Math.random().toString(36).slice(2, 8), p: { ...e.p } }));
          if (who?.clean != null) c.props.cleanVoice = { [c.stream || 'main']: who.clean };
          c.start = part.at;
          c.enabled = it.active !== false;
          return c;
        });
        const key = pickKey(it.person, it.block.key);
        const line = spoken.get(key);
        if (line) line.last = clips.at(-1);
        else spoken.set(key, { first: clips[0], last: clips.at(-1), text: it.block.text });
        return clips;
      });
    {
      const from0 = start;
      // Romlyd: hver person sitt eget spor rett under stemmen, med personens romlydvolum.
      const tone = v.roomTone && opt('voRoomFill') ? v.roomTone : null;
      const tm = tone && (d.media[tone.mediaId] || (tone.media && (d.media[tone.mediaId] = tone.media)));
      const pieces = tm ? tonePieces(plan, { all: true }) : [];
      const busy = (lane) => Object.values(d.clips).some((c) => c.lane === lane && c.start < plan.end - 1e-6 && from0 < c.start + c.dur - 1e-6);
      for (const who of people.value) {
        const clips = makeClips(live.filter((it) => it.person === who.id));
        if (!clips.length) continue;
        // En person kan ha både lyd og video. Bare lydklipp skal havne på lydsporet.
        const pictures = clips.filter((c) => c.type !== 'audio');
        const audio = clips.filter((c) => c.type === 'audio');
        placeStudioVideo(d, pictures);
        const lane = freeAudioLane(d.clips, from0, plan.end);
        for (const c of audio) {
          c.lane = lane;
          d.clips[c.id] = c;
        }
        all.push(...clips);
        const mine = audio.length ? pieces.filter((x) => x.person === who.id) : [];
        if (!mine.length) continue;
        const toneLane = busy(lane - 1) ? freeAudioLane(d.clips, from0, plan.end) : lane - 1;
        for (const piece of mine) {
          const c = mediaClip(tm, { in: piece.in, dur: piece.dur });
          c.name = people.value.length > 1 ? `Room tone (${who.name})` : 'Room tone';
          // Samme behandling som stemmen over: volum, AI Clean Voice og effekter, pluss romlydens eget volum.
          c.props.volume = Math.round(((who.gain || 0) + piece.gain) * 10) / 10;
          const fx = who.fx ?? DEFAULT_FX();
          if (fx.length) c.props.afx = fx.map((e) => ({ ...e, id: Math.random().toString(36).slice(2, 8), p: { ...e.p } }));
          if (who.clean != null) c.props.cleanVoice = { [c.stream || 'main']: who.clean };
          c.props.aFadeIn = 0.04;
          c.props.aFadeOut = 0.04;
          c.start = piece.at;
          c.lane = toneLane;
          c.enabled = !who.muted && !who.toneMuted;
          d.clips[c.id] = c;
          all.push(c);
        }
      }
    }
    // Undertekster fra manuset, over hvert klipp der det havnet. Erstattes sammen med resten neste gang.
    if (opt('voSubtitles')) {
      for (const { first, last, text } of spoken.values()) {
        for (const s of scriptCaptions([{ text, start: first.start, dur: last.start + last.dur - first.start }])) {
          const cc = makeCaptionClip(s.start, s.text, Math.max(0.3, s.end - s.start));
          cc.enabled = first.enabled;
          d.clips[cc.id] = cc;
          all.push(cc);
        }
      }
    }
    // Alt som ble sydd sammen er én gruppe, på tvers av sporene: flyttes samlet, og kan åpnes for justering.
    if (!video && all.length > 1) groupClips(d, all.map((c) => c.id));
    placed = all.map((c) => c.id);
  });
  setVo((x) => void (x.placed = { seq, ids: placed, start }));
  selection.value = placed;
  saveNow();
  const tracks = new Set(live.map((it) => it.person)).size;
  if (open) {
    closeBooth();
    room.value = 'edit';
  }
  toast(`${live.length} ${live.length === 1 ? 'take is' : 'takes are'} on the timeline${tracks > 1 ? ` on ${tracks} tracks` : ''}${opt('voSubtitles') ? ', with subtitles from the script' : ''}. Send to Edit again after retakes to replace them.`, { kind: 'success', timeout: 6000 });
}

// Bruk V1 når hele strekningen er tom, ellers et spor over alle andre videospor.
// Overskriv bare tomrom i V1, så senere klipp og tilkoblet lyd beholder tidene sine.
function placeStudioVideo(project, clips) {
  if (!clips.length) return;
  const from = Math.min(...clips.map((c) => c.start));
  const to = Math.max(...clips.map((c) => c.start + c.dur));
  const existing = Object.values(project.clips);
  const busy = existing.some((c) => c.lane >= 0 && c.lane < CAPTION_LANE && isVisual(c) && c.type !== 'gap' && c.start < to - 1e-6 && from < c.start + c.dur - 1e-6);
  if (!busy && !project.lanes?.[0]?.locked && !project.lanes?.[0]?.hidden) {
    for (const c of clips) overwritePrimary(project, c, c.start);
    return;
  }
  let lane = Math.max(0, ...existing.filter((c) => c.lane > 0 && c.lane < CAPTION_LANE).map((c) => c.lane)) + 1;
  while (project.lanes?.[lane]?.locked || project.lanes?.[lane]?.hidden) lane++;
  for (const c of clips) {
    c.lane = lane;
    project.clips[c.id] = c;
  }
}

export function placedCount() {
  const v = vo.value;
  const p = project.value;
  return v.placed?.seq === currentSequence(p).id ? v.placed.ids.filter((id) => p.clips[id]).length : 0;
}

export function closeBooth() {
  if (status.value === 'recording') return toast('Stop the take first (R), or press Esc to discard it.');
  syncVoiceoverMedia();
  closeInput();
  roomSetup.value = false;
  boothOpen.value = false;
}
