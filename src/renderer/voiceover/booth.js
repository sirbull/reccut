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
} from '../../shared/voiceover.js';
import { recordingPlan } from '../../shared/recordingFormats.cjs';
import { audioSink, prefs, setPrefs } from '../prefs.js';
import { boothOpen } from './state.js';

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

const EMPTY = { script: null, pos: 0, takes: [], selected: {}, roomTone: null, roomToneSkipped: false, placed: null };
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
  setVo((v) => void (v.pos = index));
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
  const i = nextMissing(blocks.value, vo.value, current.value?.index ?? -1);
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
    const t = chosenTake(vo.value, list[j].key);
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

async function saveTake(key, samples, blob) {
  const rate = ctx.sampleRate;
  if (samples.length < rate * 0.15) throw new Error('The take is too short.');
  const duration = samples.length / rate;
  const isTone = key === 'roomtone';
  const env = levelEnvelope(samples, rate);
  const speech = isTone ? null : detectSpeech(env, { floorDb: vo.value.roomTone?.floor ?? null });
  const trim = isTone ? { in: 0, out: duration, found: true } : trimFor(speech, duration, { preRoll: opt('voPreRoll'), postRoll: opt('voPostRoll') });
  const { peakDb, clipped } = peakInfo(samples);
  const line = blocks.value.find((b) => b.key === key);
  const n = vo.value.takes.filter((t) => t.key === key).length + 1;
  const label = isTone ? 'Room tone' : key === 'free' ? `Free take ${n}` : `Line ${lineNumber(line)} take ${n}`;
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
      v.roomTone = { id: take.id, mediaId: media.id, file, duration: fileDur, floor: Math.max(-100, floor), quiet, media };
      return;
    }
    v.takes.push(take);
    if (key !== 'free') v.selected[key] = take.id;
    if (opt('voAutoAdvance') && key !== 'free' && line) {
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
// Hopper over romlyden. Den kan tas opp senere fra panelet.
export function skipRoomTone() {
  roomSetup.value = false;
  setVo((v) => void (v.roomToneSkipped = true));
}
// Romlydkortet vises når studioet åpnes første gang i prosjektet, og når romlyden tas opp på nytt.
export const needsRoomTone = computed(() => roomSetup.value || (!vo.value.roomTone && !vo.value.roomToneSkipped));

/* Valg av opptak */

export function selectTake(take) {
  setVo((v) => {
    v.selected[take.key] = take.id;
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
    if (t.bad && v.selected[t.key] === t.id) delete v.selected[t.key];
  });
}
export function deleteTake(take) {
  setVo((v) => {
    v.takes = v.takes.filter((x) => x.id !== take.id);
    if (v.selected[take.key] === take.id) delete v.selected[take.key];
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
  const last = [...v.takes].filter((t) => t.key !== 'free' && !t.bad).sort((a, b) => b.at - a.at)[0];
  if (!last) return;
  markBad(last);
  const b = blocks.value.find((x) => x.key === last.key);
  if (b) goTo(b.index);
  toast(`Take ${last.n} of line ${lineNumber(b)} is marked as not used. Press R to record it again.`, { timeout: 3500 });
}

export const takesFor = (key) => vo.value.takes.filter((t) => t.key === key);

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
  const t = current.value && chosenTake(vo.value, current.value.key);
  if (t) playTake(t);
}

/* Sammensying på tidslinjen */

// Syr valgte opptak sammen i manusrekkefølge. En tidligere sammensying i samme sekvens erstattes,
// så nye retakes kan syes inn igjen. Video havner i hovedsporet, ren lyd på et eget lydspor.
export function stitch({ from = 0 } = {}) {
  const v = vo.value;
  const p = project.value;
  const seq = currentSequence(p).id;
  const takes = blocks.value.filter((b) => b.kind === 'line' && b.index >= from).map((b) => chosenTake(v, b.key)).filter(Boolean);
  if (!takes.length) return toast('There are no takes to put on the timeline yet.');
  const video = takes.every((t) => t.video);
  const previous = v.placed?.seq === seq ? v.placed.ids.filter((id) => p.clips[id]) : [];
  const prevStart = previous.length ? Math.min(...previous.map((id) => p.clips[id].start)) : null;
  const start = prevStart ?? (opt('voPlace') === 'end' ? (video ? p.clips[p.primary.at(-1)]?.start + p.clips[p.primary.at(-1)]?.dur || 0 : p.duration) : getTime());
  const plan = planAssembly(blocks.value, v, { start, pacing: { ...DEFAULT_PACING, ...opt('voPacing') }, room: video ? 'tight' : 'fill', from });
  let placed = [];
  let lane = 0;
  commit((d) => {
    if (previous.length) deleteClips(d, previous, { ripple: true });
    const mediaFor = (t) => {
      if (!d.media[t.mediaId] && t.media) d.media[t.mediaId] = t.media;
      return d.media[t.mediaId];
    };
    const clips = [];
    for (const it of plan.items) {
      const m = mediaFor(it.take);
      if (!m) continue;
      const c = mediaClip(m, { in: it.in, dur: it.dur });
      c.name = `${it.block.speaker ? `${it.block.speaker}: ` : ''}${it.block.text}`.slice(0, 80);
      c.props.aFadeIn = 0.02;
      c.props.aFadeOut = 0.04;
      c.start = it.at;
      clips.push(c);
    }
    if (video) {
      // Hovedsporet: klippene settes inn der sammensyingen begynner, og resten skyves til høyre.
      const T = previous.length ? start : opt('voPlace') === 'end' ? null : start;
      insertIntoPrimary(d, clips, T, { split: true });
    } else {
      lane = freeAudioLane(d.clips, plan.items[0]?.at ?? start, plan.end);
      for (const c of clips) {
        c.lane = lane;
        d.clips[c.id] = c;
      }
      // Romlyd i pausene, på sporet under stemmen.
      const tone = v.roomTone && opt('voRoomFill') ? v.roomTone : null;
      const tm = tone && (d.media[tone.mediaId] || (tone.media && (d.media[tone.mediaId] = tone.media)));
      if (tm) {
        const pieces = roomToneFill(plan.gaps, tone.duration);
        const toneLane = freeAudioLane(d.clips, start, plan.end);
        for (const piece of pieces) {
          const c = mediaClip(tm, { in: piece.in, dur: piece.dur });
          c.name = 'Room tone';
          c.props.aFadeIn = 0.04;
          c.props.aFadeOut = 0.04;
          c.start = piece.at;
          c.lane = toneLane;
          d.clips[c.id] = c;
          clips.push(c);
        }
      }
      if (clips.length > 1) groupClips(d, clips.map((c) => c.id));
    }
    placed = clips.map((c) => c.id);
  });
  setVo((x) => void (x.placed = { seq, ids: placed, start }));
  selection.value = placed;
  saveNow();
  toast(`${plan.items.length} ${plan.items.length === 1 ? 'take is' : 'takes are'} on the timeline${video ? ' in the storyline' : ''}. Stitch again after retakes to replace them.`, { kind: 'success', timeout: 6000 });
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
