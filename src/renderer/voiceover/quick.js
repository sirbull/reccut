// Rask lydopptak: velg mikrofon, trykk Rec, stopp. Klippet havner i Media-biblioteket.
// Ingen manus, nedtelling eller trimming. Lyden lagres som 24-bit WAV i Recordings/Audio.
import { signal } from '@preact/signals';
import { addMediaRecords, project, projectFolders } from '../editor/store.js';
import { encodeWav, peakInfo } from '../../shared/voiceover.js';
import { prefs, setPrefs } from '../prefs.js';
import { toast } from '../ui.jsx';
import { inputErrorText, missingDevice, resolveDevice } from '../../shared/mediaInput.js';

const api = window.api;
const sep = () => (api.platform === 'win32' ? '\\' : '/');

export const quickOpen = signal(false);
export const quickState = signal('idle'); // idle | recording | saving
export const quickMics = signal([]);
export const quickLevel = signal(0);
export const quickElapsed = signal(0);
export const quickError = signal(null);
export const quickLast = signal(null); // { name, duration }
export const quickAnchor = signal(null); // knappen vinduet åpnes fra (DOMRect)

let ctx = null,
  node = null,
  stream = null,
  chunks = [],
  timer = null,
  started = 0,
  stopWaiter = null;

export const quickMic = () => prefs.value.quickMic ?? '';

async function listMics() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices();
    quickMics.value = list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId === 'default' ? '' : d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  } catch {}
}

export async function openQuick(anchor = null) {
  if (quickOpen.value) return closeQuick();
  quickAnchor.value = anchor;
  quickOpen.value = true;
  quickLast.value = null;
  await openMic();
}

const micConstraints = (id) => ({
  audio: { ...(id ? { deviceId: { exact: id } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 } },
});

async function openMic() {
  closeMic();
  quickError.value = null;
  await listMics();
  // Lagret ID som ikke finnes lenger (Windows gir enhetene nye ID-er): finn mikrofonen på navnet.
  const id = resolveDevice(quickMic(), prefs.value.quickMicLabel, quickMics.value.filter((m) => m.id));
  if (quickMics.value.length && (id || '') !== quickMic()) setPrefs({ quickMic: id || '' });
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia(micConstraints(id));
    } catch (err) {
      if (!missingDevice(err) || !id) throw err;
      stream = await navigator.mediaDevices.getUserMedia(micConstraints(null));
      setPrefs({ quickMic: '' });
      toast('The chosen microphone did not respond. Using the system default.', { timeout: 5000 });
    }
    ctx = new AudioContext({ sampleRate: 48000 });
    await ctx.audioWorklet.addModule('vo-capture-worklet.js');
    node = new AudioWorkletNode(ctx, 'reccut-vo-capture', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
    node.port.postMessage({ channel: Number(prefs.value.voChannel ?? 0) });
    node.port.onmessage = (e) => {
      const m = e.data;
      if (m.level) quickLevel.value = m.level.peak;
      else if (m.samples) chunks.push(m.samples);
      else if (m.stopped) stopWaiter?.();
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    ctx.createMediaStreamSource(stream).connect(node).connect(mute).connect(ctx.destination);
  } catch (err) {
    quickError.value = inputErrorText(err, 'the microphone');
    closeMic();
  }
  listMics();
}

function closeMic() {
  clearInterval(timer);
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close().catch(() => {});
  stream = ctx = node = null;
  quickLevel.value = 0;
}

export function closeQuick() {
  if (quickState.value !== 'idle') return;
  closeMic();
  quickOpen.value = false;
}

export async function chooseQuickMic(id) {
  if (quickState.value !== 'idle') return;
  setPrefs({ quickMic: id, quickMicLabel: quickMics.value.find((m) => m.id === id)?.label || '' });
  await openMic();
}

export async function startQuick() {
  if (quickState.value !== 'idle') return;
  if (!node) await openMic();
  if (!node) return;
  if (ctx.state === 'suspended') await ctx.resume();
  chunks = [];
  node.port.postMessage({ record: true });
  started = performance.now();
  quickElapsed.value = 0;
  timer = setInterval(() => (quickElapsed.value = (performance.now() - started) / 1000), 100);
  quickState.value = 'recording';
}

export async function stopQuick() {
  if (quickState.value !== 'recording') return;
  clearInterval(timer);
  quickState.value = 'saving';
  const stopped = new Promise((r) => (stopWaiter = r));
  node.port.postMessage({ record: false });
  await Promise.race([stopped, new Promise((r) => setTimeout(r, 800))]);
  stopWaiter = null;
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const samples = new Float32Array(n);
  let o = 0;
  for (const c of chunks) {
    samples.set(c, o);
    o += c.length;
  }
  chunks = [];
  try {
    if (n < ctx.sampleRate * 0.2) throw new Error('The recording is too short.');
    const f = projectFolders.value || (await api.projectFolders(null).catch(() => null));
    const dir = `${f?.recordings || (await api.baseDir())}${sep()}Audio`;
    const count = Object.values(project.value.media).filter((m) => m.quickAudio).length + 1;
    const name = `Audio ${count}`;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const file = `${dir}${sep()}${name} ${stamp}.wav`;
    await api.writeBinary(file, encodeWav([samples], ctx.sampleRate, 24));
    const { items, failed } = await api.importMedia([file]);
    if (!items?.length) throw new Error(failed?.[0] || 'The file could not be imported.');
    addMediaRecords([{ ...items[0], name, quickAudio: true }]);
    const { clipped, peakDb } = peakInfo(samples);
    quickLast.value = { name, duration: n / ctx.sampleRate };
    if (clipped) toast(`${name} clipped (peak ${peakDb.toFixed(1)} dB). Turn the input gain down for the next one.`, { kind: 'error', timeout: 7000 });
  } catch (err) {
    toast(`Could not save the recording: ${err.message}`, { kind: 'error' });
  } finally {
    quickState.value = 'idle';
  }
}

export const toggleQuick = () => (quickState.value === 'recording' ? stopQuick() : startQuick());
