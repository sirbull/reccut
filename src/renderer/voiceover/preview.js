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
let fxReady = null;
const routes = new Map(); // person -> { gain, fx }
const buffers = new Map(); // fil -> Promise<AudioBuffer>
const peakCache = new Map(); // fil -> Float32Array
let sources = [];
let raf = 0;

function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    ctx.setSinkId?.(audioSink.value).catch(() => {});
    // Samme effektkode som avspillingen i redigeringen og eksporten.
    fxReady = ctx.audioWorklet.addModule('audiofx-worklet.js').then(() => true, () => false);
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

// Volum (dB) i kildetid s fra nøkkelbildene [[tid, dB], ...]: rett linje mellom punktene, flatt utenfor.
export function dbAt(kf, s) {
  if (s <= kf[0][0]) return kf[0][1];
  for (let i = 1; i < kf.length; i++) {
    const [t0, v0] = kf[i - 1];
    const [t1, v1] = kf[i];
    if (s <= t1) return v0 + ((v1 - v0) * (s - t0)) / Math.max(1e-6, t1 - t0);
  }
  return kf.at(-1)[1];
}

// Ett klipp med volum og fades, med start midt i klippet når avspillingen starter senere.
// kf: volumets nøkkelbilder i kildetid (som i Edit). Da gjelder de i stedet for gain.
function schedule(buf, { at, in: inPoint, dur, gain = 0, kf = null, fadeIn = 0, fadeOut = 0 }, from, t0, out = null) {
  const c = audio();
  const offset = Math.max(0, from - at);
  if (offset >= dur) return;
  const when = t0 + Math.max(0, at - from);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  const level = kf?.length ? 1 : lin(gain);
  const start = when - offset; // der klippet ville startet
  const end = start + dur;
  // ponytail: rampene går lineært i forsterkning mellom punktene, Edit går i dB. Hørbart likt for korte rampene.
  const vg = c.createGain();
  if (kf?.length) {
    vg.gain.setValueAtTime(lin(dbAt(kf, inPoint + offset)), when);
    for (const [t, db] of kf) {
      const tt = start + (t - inPoint);
      if (tt > when && tt < end) vg.gain.linearRampToValueAtTime(lin(db), tt);
    }
  }
  if (fadeIn > 0 && offset < fadeIn) {
    g.gain.setValueAtTime((level * offset) / fadeIn, when);
    g.gain.linearRampToValueAtTime(level, start + fadeIn);
  } else g.gain.setValueAtTime(level, when);
  if (fadeOut > 0) {
    const fo = Math.max(when, end - fadeOut);
    g.gain.setValueAtTime(fo === when && offset > dur - fadeOut ? (level * (dur - offset)) / fadeOut : level, fo);
    g.gain.linearRampToValueAtTime(0, end);
  }
  src.connect(vg).connect(g).connect(out || c.destination);
  src.start(when, inPoint + offset, dur - offset);
  sources.push(src);
}

// Ett spor per person: volum og effektkjede. Endres mens det spilles.
async function route(person) {
  const c = audio();
  let r = routes.get(person.id);
  if (!r) {
    const gain = c.createGain();
    r = { gain, fx: null, clean: null };
    if (await fxReady) {
      r.fx = new AudioWorkletNode(c, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      gain.connect(r.fx).connect(c.destination);
      // Clean Voice-filer har fire kanaler (original og renset), som blandes med styrken her.
      r.clean = new AudioWorkletNode(c, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 4, channelCountMode: 'explicit' });
      r.clean.connect(gain);
    } else gain.connect(c.destination);
    routes.set(person.id, r);
  }
  r.gain.gain.value = lin(person.gain);
  r.fx?.port.postMessage(person.fx || []);
  r.clean?.port.postMessage({ list: [], clean: person.clean || 0 });
  return r;
}
export function setClean(id, amount) {
  routes.get(id)?.clean?.port.postMessage({ list: [], clean: amount || 0 });
}

// Clean Voice i studioet: opptakene renses i bakgrunnen første gang de spilles med det på.
// ponytail: til den rensede filen er klar, høres originalen. Neste avspilling bruker den.
const cleaned = new Map(); // fil -> renset fil
const cleaning = new Set();
function cleanFile(file) {
  if (cleaned.has(file)) return cleaned.get(file);
  if (!cleaning.has(file)) {
    cleaning.add(file);
    window.api.cleanAudio({ file }).then((out) => cleaned.set(file, out), (err) => console.warn('Clean Voice failed', file, err));
  }
  return file;
}
export function setFx(id, list) {
  routes.get(id)?.fx?.port.postMessage(list || []);
}
export function setGain(id, db) {
  const r = routes.get(id);
  if (r) r.gain.gain.value = lin(db);
}

export function stop() {
  for (const s of sources) {
    try {
      s.stop();
    } catch {}
  }
  sources = [];
  for (const r of routes.values()) {
    r.gain.disconnect();
    r.fx?.disconnect();
    r.clean?.disconnect();
  }
  routes.clear();
  cancelAnimationFrame(raf);
  playing.value = false;
}

/**
 * Spiller planen fra et tidspunkt. tone: romlyden ({ file, duration }) som fyller pausene, eller null.
 * onEnd kalles når slutten er nådd.
 */
export async function play(plan, from = 0, { tone = null, onEnd, people = [] } = {}) {
  stop();
  if (!plan.items.length) return;
  if (from >= plan.end - 0.01) from = 0;
  const c = audio();
  if (c.state === 'suspended') await c.resume();
  playing.value = true;
  let bufs;
  try {
    const cleanOn = new Set(people.filter((p) => p.clean > 0).map((p) => p.id));
    bufs = await Promise.all(plan.items.map((it) => (it.active === false ? null : load(cleanOn.has(it.person) ? cleanFile(it.take.file) : it.take.file))));
  } catch {
    playing.value = false;
    return;
  }
  const toneBuf = tone ? await load(tone.file).catch(() => null) : null;
  if (!playing.value) return;
  const outs = new Map();
  for (const p of people) outs.set(p.id, await route(p));
  if (!playing.value) return;
  const t0 = c.currentTime + 0.06;
  plan.items.forEach((it, i) => {
    if (it.active === false) return;
    schedule(bufs[i], { at: it.at, in: it.in, dur: it.dur, gain: it.take.gain, kf: it.take.volKf, fadeIn: it.take.fadeIn ?? 0.02, fadeOut: it.take.fadeOut ?? 0.04 }, from, t0, bufs[i].numberOfChannels === 4 ? outs.get(it.person)?.clean || outs.get(it.person)?.gain : outs.get(it.person)?.gain);
  });
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

// Skrubbing: en kort lydbit der spillehodet er mens det dras, som i Edit.
let lastScrub = 0;
export async function scrub(plan, t, people = []) {
  const now = performance.now();
  if (playing.value || now - lastScrub < 70) return;
  lastScrub = now;
  const it = plan.items.find((x) => x.active !== false && t >= x.at && t < x.at + x.dur);
  const p = it && people.find((x) => x.id === it.person);
  if (!it || p?.muted) return;
  const buf = await load(it.take.file).catch(() => null);
  if (!buf) return;
  const c = audio();
  if (c.state === 'suspended') await c.resume();
  const s = it.in + (t - it.at);
  const db = (it.take.volKf?.length ? dbAt(it.take.volKf, s) : it.take.gain || 0) + (p?.gain || 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(lin(db), c.currentTime);
  g.gain.linearRampToValueAtTime(0, c.currentTime + 0.09);
  src.connect(g).connect(c.destination);
  src.start(c.currentTime, s, 0.09);
}

export function close() {
  stop();
  ctx?.close().catch(() => {});
  ctx = null;
  fxReady = null;
  buffers.clear();
  peakCache.clear();
}
