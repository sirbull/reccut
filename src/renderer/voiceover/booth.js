// Voice Over Studio: opptak av fortellerstemme og snakkende hode, linje for linje fra manus.
// Opptakene lagres i prosjektets Recordings-mappe og syes sammen på tidslinjen.
// Tilstanden (manus, posisjon, opptak) ligger i project.voiceover og angres ikke, som designene.
import { computed, signal } from '@preact/signals';
import { produce } from 'immer';
import { project, projectFolders, scheduleSave, getTime, commit, selection, saveNow, withAnalysis } from '../editor/store.js';
import { currentSequence, uid } from '../../shared/model.js';
import { deleteClips, groupClips, insertIntoPrimary, mediaClip } from '../../shared/ops.js';
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
  planAssembly,
  roomToneFill,
  roomToneLevel,
  trimFor,
  FIRST_PERSON,
  personOf,
  pickKey,
  planStudio,
} from '../../shared/voiceover.js';
import { presetEffects } from '../../shared/audiofx.js';
import { DEFAULT_VOICE, PREVIEW_TEXT, spokenText, voiceById } from '../../shared/tts.js';
import { recordingPlan } from '../../shared/recordingFormats.cjs';
import { audioSink, prefs, setPrefs } from '../prefs.js';
import { boothOpen } from './state.js';
import * as preview from './preview.js';

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
  voPreRoll: 0.12,
  voPostRoll: 0.3,
  voPacing: DEFAULT_PACING,
  voRoomFill: true,
  voPlace: 'playhead',
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

// Uten angresteg: endringer i manus og opptak skal ikke forsvinne når redigeringen angres.
export function setVo(mutator) {
  const next = produce({ ...EMPTY, ...(project.value.voiceover || {}) }, mutator);
  project.value = { ...project.value, voiceover: next };
  scheduleSave();
}

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
  setPrefs({ voSplit: split });
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
  if (!line) return toast('Load or write a script first, or record freely with Free Take.');
  await begin(line?.key ?? null, { quick });
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

async function saveTake(key, samples, blob, { rate = ctx?.sampleRate || 48000, ai = false, advance = true } = {}) {
  if (samples.length < rate * 0.15) throw new Error('The take is too short.');
  const duration = samples.length / rate;
  const isTone = key === 'roomtone';
  const env = levelEnvelope(samples, rate);
  // AI-stemmer har ingen romlyd: stillheten rundt stemmen er digital og finnes uten støygulv.
  const speech = isTone ? null : detectSpeech(env, { floorDb: ai ? null : vo.value.roomTone?.floor ?? null });
  const trim = isTone ? { in: 0, out: duration, found: true } : trimFor(speech, duration, { preRoll: opt('voPreRoll'), postRoll: opt('voPostRoll') });
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

export const tts = signal({ installed: false, downloading: false, progress: 0, sizeBytes: 0 });
export const generating = signal(null); // { done, total } under Generate All
export const refreshTts = () => api.ttsStatus().then((s) => (tts.value = s)).catch(() => {});
api.onTtsChanged?.((s) => (tts.value = s));

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

export function addAiPerson(voice = DEFAULT_VOICE, speed = 1) {
  if (busy()) return toast('Stop the take first.');
  const list = people.value;
  const v = voiceById(voice);
  const used = new Set(list.map((p) => p.name.toLowerCase()));
  let name = `${v.name} (AI)`;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${v.name} ${n} (AI)`;
  // AI-stemmen er ren fra før, så den får ingen effekter som standard.
  const p = { id: uid(), name, color: COLORS[list.length % COLORS.length], fx: [], gain: 0, ai: { voice: v.id, speed } };
  setVo((x) => {
    x.people = [...listOf(x), p];
    x.person = p.id;
  });
  toast(`${p.name} is added on a new track. Press Space to read a line, or Generate All.`, { timeout: 4500 });
  return p;
}
export const setAiVoice = (id, patch) => editPerson(id, (p) => void (p.ai = { ...p.ai, ...patch }));

let stopAll = false;
// Leser linjen som er valgt, med AI-stemmen til personen som er valgt.
export async function generate(key = current.value?.key, { advance = true } = {}) {
  const who = person.value;
  if (!who?.ai || !key || status.value !== 'idle') return;
  if (!tts.value.installed) return toast('Download the AI voices first (Add AI Voice).');
  const text = spokenFor(key, who.id);
  if (!text) return toast('This line has nothing to read.');
  preview.stop();
  status.value = 'generating';
  recordingKey.value = key;
  try {
    const { samples, rate } = await api.ttsGenerate({ text, voice: who.ai.voice, speed: who.ai.speed || 1 });
    status.value = 'saving';
    await saveTake(key, samples instanceof Float32Array ? samples : new Float32Array(samples), null, { rate, ai: true, advance });
  } catch (err) {
    toast(`Could not read the line: ${err.message}`, { kind: 'error', timeout: 9000 });
    stopAll = true;
  } finally {
    status.value = 'idle';
    recordingKey.value = null;
  }
}
// Leser alle linjene som mangler opptak for AI-stemmen, i rekkefølge. Mellomrom eller Esc stopper.
export async function generateAll() {
  const who = person.value;
  if (!who?.ai || status.value !== 'idle') return;
  const todo = lines.value.filter((b) => !chosenTake(vo.value, b.key, who.id));
  if (!todo.length) return toast(`${who.name} has read every line. Select a line and press R to read it again.`, { timeout: 4000 });
  stopAll = false;
  generating.value = { done: 0, total: todo.length };
  for (const b of todo) {
    if (stopAll) break;
    goTo(b.index);
    await generate(b.key, { advance: false });
    generating.value = { done: generating.value.done + 1, total: todo.length };
  }
  generating.value = null;
}
export function cancelGenerate() {
  stopAll = true;
}

// Prøvelytt en stemme før den legges til.
let sampleCtx = null,
  sampleSrc = null;
export const sampling = signal(null);
export async function previewVoice(voice, speed = 1) {
  sampleSrc?.stop();
  sampleSrc = null;
  if (sampling.value === voice) return (sampling.value = null);
  sampling.value = voice;
  try {
    const { samples, rate } = await api.ttsGenerate({ text: PREVIEW_TEXT[voice[0]] || PREVIEW_TEXT.a, voice, speed });
    if (sampling.value !== voice) return;
    sampleCtx ||= new AudioContext();
    sampleCtx.setSinkId?.(audioSink.value).catch(() => {});
    const buf = sampleCtx.createBuffer(1, samples.length, rate);
    buf.copyToChannel(samples instanceof Float32Array ? samples : new Float32Array(samples), 0);
    sampleSrc = sampleCtx.createBufferSource();
    sampleSrc.buffer = buf;
    sampleSrc.connect(sampleCtx.destination);
    sampleSrc.onended = () => sampling.value === voice && (sampling.value = null);
    sampleSrc.start();
  } catch (err) {
    sampling.value = null;
    toast(`Could not play the voice: ${err.message}`, { kind: 'error' });
  }
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

// Planen slik den blir sydd sammen, med ett spor per person. Personer som er dempet, høres ikke,
// tar ikke plass og syes ikke inn. Én person med bare video legges tett (hovedsporet).
export function studioPlan(start = 0, from = 0) {
  const v = vo.value;
  const list = people.value.map((p) => ({ id: p.id, active: !p.muted }));
  const pacing = { ...DEFAULT_PACING, ...opt('voPacing') };
  const fill = planStudio(blocks.value, v, { start, pacing, room: 'fill', from, people: list });
  const live = fill.items.filter((it) => it.active);
  const speakers = new Set(live.map((it) => it.person));
  const video = live.length > 0 && speakers.size === 1 && live.every((it) => it.take.video);
  return video ? { ...planStudio(blocks.value, v, { start, pacing, room: 'tight', from, people: list }), video } : { ...fill, video };
}
export const plan = computed(() => studioPlan(0));

// Endrer volum, fades, pause eller trim på et opptak. Brukes også mens det dras, så det lagres i bakgrunnen.
export function setTake(id, patch) {
  setVo((v) => {
    const t = v.takes.find((x) => x.id === id);
    if (!t) return;
    for (const [k, val] of Object.entries(patch)) {
      if (val == null) delete t[k];
      else t[k] = val;
    }
    if ('in' in patch || 'out' in patch) {
      t.in = Math.max(0, Math.min(t.in, t.duration - 0.05));
      t.out = Math.min(t.duration, Math.max(t.out, t.in + 0.05));
    }
    const len = t.out - t.in;
    if (t.fadeIn != null) t.fadeIn = Math.max(0, Math.min(t.fadeIn, len / 2));
    if (t.fadeOut != null) t.fadeOut = Math.max(0, Math.min(t.fadeOut, len / 2));
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
export function stopPlayback() {
  if (audio) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  }
  playingTake.value = null;
  playResolve?.();
  playResolve = null;
}
export function playTake(take, { tail = 0 } = {}) {
  stopPlayback();
  audio ||= new Audio();
  audio.setSinkId?.(audioSink.value).catch(() => {});
  audio.src = fileUrl(take.file);
  const from = tail ? Math.max(take.in, take.out - tail) : take.in;
  stopAt = take.out;
  playingTake.value = take.id;
  return new Promise((resolve) => {
    playResolve = resolve;
    audio.onloadedmetadata = () => {
      audio.currentTime = from;
      audio.play().catch(() => stopPlayback());
    };
    audio.ontimeupdate = () => audio.currentTime >= stopAt && stopPlayback();
    audio.onended = () => stopPlayback();
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
// inn igjen. Én person med video havner i hovedsporet, ellers ligger lyd under og video over.
export function stitch({ from = 0 } = {}) {
  const v = vo.value;
  const p = project.value;
  const seq = currentSequence(p).id;
  const first = studioPlan(0, from);
  if (!first.items.some((it) => it.active)) return toast('There are no takes to put on the timeline yet.');
  const video = first.video;
  const previous = v.placed?.seq === seq ? v.placed.ids.filter((id) => p.clips[id]) : [];
  const prevStart = previous.length ? Math.min(...previous.map((id) => p.clips[id].start)) : null;
  const start = prevStart ?? (opt('voPlace') === 'end' ? (video ? p.clips[p.primary.at(-1)]?.start + p.clips[p.primary.at(-1)]?.dur || 0 : p.duration) : getTime());
  const plan = studioPlan(start, from);
  const byId = new Map(people.value.map((x) => [x.id, x]));
  const live = plan.items.filter((it) => it.active);
  let placed = [];
  commit((d) => {
    if (previous.length) deleteClips(d, previous, { ripple: true });
    const mediaFor = (t) => {
      if (!d.media[t.mediaId] && t.media) d.media[t.mediaId] = t.media;
      return d.media[t.mediaId];
    };
    const all = [];
    const makeClips = (items) =>
      items
        .map((it) => {
          const m = mediaFor(it.take);
          if (!m) return null;
          const who = byId.get(it.person);
          const c = mediaClip(m, { in: it.in, dur: it.dur });
          const role = who && people.value.length > 1 ? who.name : it.block.speaker;
          c.name = `${role ? `${role}: ` : ''}${it.block.text}`.slice(0, 80);
          // Justeringer fra studioet: volum per klipp pluss personens volum, fades og personens effekter.
          c.props.volume = Math.round(((it.take.gain || 0) + (who?.gain || 0)) * 10) / 10;
          c.props.aFadeIn = it.take.fadeIn ?? 0.02;
          c.props.aFadeOut = it.take.fadeOut ?? 0.04;
          const fx = who?.fx ?? DEFAULT_FX();
          if (fx.length) c.props.afx = fx.map((e) => ({ ...e, id: Math.random().toString(36).slice(2, 8), p: { ...e.p } }));
          c.start = it.at;
          return c;
        })
        .filter(Boolean);
    if (video) {
      // Hovedsporet: klippene settes inn der sammensyingen begynner, og resten skyves til høyre.
      const clips = makeClips(live);
      const T = previous.length ? start : opt('voPlace') === 'end' ? null : start;
      insertIntoPrimary(d, clips, T, { split: true });
      all.push(...clips);
    } else {
      const from0 = live[0]?.at ?? start;
      for (const who of people.value.filter((x) => !x.muted)) {
        const clips = makeClips(live.filter((it) => it.person === who.id));
        if (!clips.length) continue;
        // Video legges over hovedsporet og lyd under, hver person på sitt eget spor.
        const pic = clips.every((c) => c.type !== 'audio');
        const lane = pic ? freeVideoLane(d.clips, from0, plan.end) : freeAudioLane(d.clips, from0, plan.end);
        for (const c of clips) {
          c.lane = lane;
          d.clips[c.id] = c;
        }
        if (clips.length > 1) groupClips(d, clips.map((c) => c.id));
        all.push(...clips);
      }
      // Romlyd i pausene, på sporet under stemmene.
      const tone = v.roomTone && opt('voRoomFill') ? v.roomTone : null;
      const tm = tone && (d.media[tone.mediaId] || (tone.media && (d.media[tone.mediaId] = tone.media)));
      if (tm) {
        const pieces = roomToneFill(plan.gaps, tone.duration);
        const toneLane = freeAudioLane(d.clips, start, plan.end);
        const toneClips = [];
        for (const piece of pieces) {
          const c = mediaClip(tm, { in: piece.in, dur: piece.dur });
          c.name = 'Room tone';
          c.props.aFadeIn = 0.04;
          c.props.aFadeOut = 0.04;
          c.start = piece.at;
          c.lane = toneLane;
          d.clips[c.id] = c;
          toneClips.push(c);
        }
        if (toneClips.length > 1) groupClips(d, toneClips.map((c) => c.id));
        all.push(...toneClips);
      }
    }
    placed = all.map((c) => c.id);
  });
  setVo((x) => void (x.placed = { seq, ids: placed, start }));
  selection.value = placed;
  saveNow();
  const tracks = new Set(live.map((it) => it.person)).size;
  toast(`${live.length} ${live.length === 1 ? 'take is' : 'takes are'} on the timeline${video ? ' in the storyline' : tracks > 1 ? ` on ${tracks} tracks` : ''}. Stitch again after retakes to replace them.`, { kind: 'success', timeout: 6000 });
}

// Første ledige spor over hovedsporet for hele strekningen.
function freeVideoLane(clips, from, to) {
  for (let lane = 1; lane < 50; lane++) {
    if (!Object.values(clips).some((c) => c.lane === lane && c.start < to - 1e-6 && from < c.start + c.dur - 1e-6)) return lane;
  }
  return 50;
}

export function placedCount() {
  const v = vo.value;
  const p = project.value;
  return v.placed?.seq === currentSequence(p).id ? v.placed.ids.filter((id) => p.clips[id]).length : 0;
}

export function closeBooth() {
  if (status.value === 'recording') return toast('Stop the take first (Space), or press Esc to discard it.');
  closeInput();
  roomSetup.value = false;
  boothOpen.value = false;
}
