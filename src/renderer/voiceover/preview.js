// Avspilling av studioets tidslinje: opptakene spilles etter hverandre slik de blir sydd sammen,
// med volum, fades og romlyd i pausene. Lyden dekodes én gang per fil og holdes i minnet.
import { signal } from '@preact/signals';
import { audioSink } from '../prefs.js';
import { peaks, roomToneFill } from '../../shared/voiceover.js';

const fileUrl = (p) => `media://file/${encodeURIComponent(p)}`;

export const playing = signal(false);
export const time = signal(0);
export const peaksVersion = signal(0);

let ctx = null;
const buffers = new Map(); // fil -> Promise<AudioBuffer>
const peakCache = new Map(); // fil -> Float32Array
let sources = [];
let raf = 0;

function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    ctx.setSinkId?.(audioSink.value).catch(() => {});
  }
  return ctx;
}

export function load(file) {
  if (!buffers.has(file)) {
    const p = fetch(fileUrl(file))
      .then((r) => r.arrayBuffer())
      .then((data) => audio().decodeAudioData(data))
      .then((buf) => {
        peakCache.set(file, peaks(buf.getChannelData(0), buf.sampleRate));
        peaksVersion.value++;
        return buf;
      })
      .catch((err) => {
        buffers.delete(file);
        throw err;
      });
    buffers.set(file, p);
  }
  return buffers.get(file);
}
export const peaksFor = (file) => peakCache.get(file) || null;

const lin = (db) => Math.pow(10, (db || 0) / 20);

// Ett klipp med volum og fades, med start midt i klippet når avspillingen starter senere.
function schedule(buf, { at, in: inPoint, dur, gain = 0, fadeIn = 0, fadeOut = 0 }, from, t0) {
  const c = audio();
  const offset = Math.max(0, from - at);
  if (offset >= dur) return;
  const when = t0 + Math.max(0, at - from);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const level = lin(gain);
  const start = when - offset; // der klippet ville startet
  const end = start + dur;
  if (fadeIn > 0 && offset < fadeIn) {
    g.gain.setValueAtTime((level * offset) / fadeIn, when);
    g.gain.linearRampToValueAtTime(level, start + fadeIn);
  } else g.gain.setValueAtTime(level, when);
  if (fadeOut > 0) {
    const fo = Math.max(when, end - fadeOut);
    g.gain.setValueAtTime(fo === when && offset > dur - fadeOut ? (level * (dur - offset)) / fadeOut : level, fo);
    g.gain.linearRampToValueAtTime(0, end);
  }
  src.connect(g).connect(c.destination);
  src.start(when, inPoint + offset, dur - offset);
  sources.push(src);
}

export function stop() {
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
  }
  sources = [];
  cancelAnimationFrame(raf);
  playing.value = false;
}

/**
 * Spiller planen fra et tidspunkt. tone: romlyden ({ file, duration }) som fyller pausene, eller null.
 * onEnd kalles når slutten er nådd.
 */
export async function play(plan, from = 0, { tone = null, onEnd } = {}) {
  stop();
  if (!plan.items.length) return;
  if (from >= plan.end - 0.01) from = 0;
  const c = audio();
  if (c.state === 'suspended') await c.resume();
  playing.value = true;
  let bufs;
  try {
    bufs = await Promise.all(plan.items.map((it) => load(it.take.file)));
  } catch {
    playing.value = false;
    return;
  }
  const toneBuf = tone ? await load(tone.file).catch(() => null) : null;
  if (!playing.value) return;
  const t0 = c.currentTime + 0.06;
  plan.items.forEach((it, i) =>
    schedule(bufs[i], { at: it.at, in: it.in, dur: it.dur, gain: it.take.gain, fadeIn: it.take.fadeIn ?? 0.02, fadeOut: it.take.fadeOut ?? 0.04 }, from, t0)
  );
  if (toneBuf) for (const piece of roomToneFill(plan.gaps, tone.duration)) schedule(toneBuf, { ...piece, fadeIn: 0.04, fadeOut: 0.04 }, from, t0);
  const tick = () => {
    const t = from + Math.max(0, c.currentTime - t0);
    time.value = Math.min(t, plan.end);
    if (t >= plan.end) {
      stop();
      onEnd?.();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

export function close() {
  stop();
  ctx?.close().catch(() => {});
  ctx = null;
  buffers.clear();
  peakCache.clear();
}
