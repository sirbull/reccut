// Avspilling av studioets tidslinje: opptakene spilles etter hverandre slik de blir sydd sammen,
// med volum, fades og romlyd i pausene. Lyden dekodes én gang per fil og holdes i minnet.
import { signal } from '@preact/signals';
import { audioSink } from '../prefs.js';
import { itemParts, peaks, takeFades } from '../../shared/voiceover.js';
import { createChain } from '../../shared/audiofx.js';

const fileUrl = (p) => `media://file/${encodeURIComponent(p)}`;

export const playing = signal(false);
export const time = signal(0);
export const peaksVersion = signal(0);
// Nivået på det som spilles av, til måleren nederst i studioet.
export const level = signal({ peak: 0, rms: 0, hold: 0 });

let ctx = null;
let master = null; // all avspilling går hit, og videre til høyttalerne og måleren
let analyser = null;
let fxReady = null;
const routes = new Map(); // person -> { gain, fx }
const trackLevels = new Map(); // siste volum og av/på, også mens lyden dekodes
const buffers = new Map(); // fil -> Promise<AudioBuffer>
const peakCache = new Map(); // fil -> Float32Array
let sources = [];
let raf = 0;
let playbackRun = 0;

function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    ctx.setSinkId?.(audioSink.value).catch(() => {});
    // Samme effektkode som avspillingen i redigeringen og eksporten.
    fxReady = ctx.audioWorklet.addModule('audiofx-worklet.js').then(() => true, () => false);
    master = ctx.createGain();
    master.connect(ctx.destination);
    // ponytail: analysatoren mikser stereo til mono. Holder for stemmer, eget nivå per kanal om det trengs.
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser);
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
// Bølgeformen. Med person: slik den høres, med AI Clean Voice, personens volum og effekter, regnet ut
// offline med samme effektkode som avspillingen. Til den er klar, vises den forrige (eller originalen).
const processed = new Map(); // fil + lydinnstillinger -> peaks
const wanted = new Map();
const rendering = new Set();
let renderTimer = 0;
export function peaksFor(file, person = null) {
  const raw = peakCache.get(file) || null;
  if (!person || (!(person.clean > 0) && !person.fx?.length && !person.gain)) return raw;
  const key = JSON.stringify([file, person.clean || 0, person.gain || 0, person.fx || []]);
  const got = processed.get(key);
  if (!got && !wanted.has(key) && !rendering.has(key)) {
    // Under et drag trengs bare den nyeste innstillingen for hver fil og person.
    for (const [old, w] of wanted) if (w.file === file && w.person.id === person.id) wanted.delete(old);
    wanted.set(key, { file, person });
    clearTimeout(renderTimer);
    renderTimer = setTimeout(renderWanted, 250);
  }
  return got || raw;
}
async function renderWanted() {
  for (const [key, w] of [...wanted]) {
    if (rendering.has(key) || processed.has(key)) continue;
    wanted.delete(key);
    rendering.add(key);
    const pk = await renderPeaks(w.file, w.person).catch(() => null);
    rendering.delete(key);
    if (pk) {
      processed.set(key, pk);
      if (processed.size > 32) processed.delete(processed.keys().next().value);
      peaksVersion.value++;
    }
  }
}
// Samme kjede som et personspor i avspillingen: Clean Voice-blanding, volum, effekter.
async function renderPeaks(file, p) {
  const src = p.clean > 0 ? cleaned.get(file) : file;
  if (!src) {
    cleanFile(file);
    return null;
  }
  const buf = await load(src);
  const chain = createChain(buf.sampleRate);
  chain.update(p.fx || []);
  const latency = chain.latency;
  const off = new OfflineAudioContext(2, buf.length + latency, buf.sampleRate);
  await off.audioWorklet.addModule('audiofx-worklet.js');
  const fxNode = (channels, init) => new AudioWorkletNode(off, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: channels, channelCountMode: 'explicit', processorOptions: { init } });
  const s = off.createBufferSource();
  s.buffer = buf;
  const g = off.createGain();
  g.gain.value = lin(p.gain);
  if (buf.numberOfChannels === 4) s.connect(fxNode(4, { list: [], clean: p.clean || 0 })).connect(g);
  else s.connect(g);
  g.connect(fxNode(2, p.fx || [])).connect(off.destination);
  s.start();
  const out = await off.startRendering();
  return peaks(out.getChannelData(0).subarray(latency, latency + buf.length), out.sampleRate);
}

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
  dur = Math.min(dur, buf.duration - inPoint);
  if (offset >= dur || inPoint < 0) return;
  fadeIn = Math.min(fadeIn, dur / 2);
  fadeOut = Math.min(fadeOut, dur / 2);
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
    vg.gain.linearRampToValueAtTime(lin(dbAt(kf, inPoint + dur)), end);
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
  src.connect(vg).connect(g).connect(out || master);
  src.start(when, inPoint + offset, dur - offset);
  sources.push(src);
  src.onended = () => {
    sources = sources.filter((s) => s !== src);
    src.disconnect();
    vg.disconnect();
    g.disconnect();
  };
}

// Ett spor per person: volum og effektkjede. Endres mens det spilles.
async function route(person, run = playbackRun) {
  const c = audio();
  const ready = await fxReady;
  if (run !== playbackRun) return null;
  let r = routes.get(person.id);
  if (!r) {
    const gain = c.createGain();
    r = { gain, fx: null, clean: null };
    if (ready) {
      r.fx = new AudioWorkletNode(c, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      gain.connect(r.fx).connect(master);
      // Clean Voice-filer har fire kanaler (original og renset), som blandes med styrken her.
      r.clean = new AudioWorkletNode(c, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 4, channelCountMode: 'explicit' });
      r.clean.connect(gain);
    } else gain.connect(master);
    routes.set(person.id, r);
  }
  const level = trackLevels.get(person.id) || person;
  r.gain.gain.value = level.muted ? 0 : lin(level.gain);
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
    window.api.cleanAudio({ file }).then(
      (out) => {
        cleaned.set(file, out);
        peaksVersion.value++; // bølgeformen tegnes på nytt med den rensede lyden
      },
      (err) => {
        cleaning.delete(file);
        console.warn('Clean Voice failed', file, err);
      }
    );
  }
  return file;
}
export function setFx(id, list) {
  routes.get(id)?.fx?.port.postMessage(list || []);
}
export function setGain(id, db, muted = false) {
  const previous = trackLevels.get(id);
  trackLevels.set(id, { gain: db, muted });
  if (muted && !previous?.muted) stopScrub();
  const r = routes.get(id);
  if (r) r.gain.gain.value = muted ? 0 : lin(db);
}

export function stop() {
  stopScrub();
  playbackRun++;
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
  level.value = { peak: 0, rms: 0, hold: 0 };
}

const samples = new Float32Array(2048);
let holdAt = 0;
function measure() {
  analyser.getFloatTimeDomainData(samples);
  let peak = 0;
  let sum = 0;
  for (const v of samples) {
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  const now = performance.now();
  const hold = peak >= level.value.hold || now - holdAt > 1500 ? ((holdAt = now), peak) : level.value.hold;
  level.value = { peak, rms: Math.sqrt(sum / samples.length), hold };
}

/**
 * Spiller planen fra et tidspunkt. tone: romlyden ({ file, pieces }) i pausene, eller null.
 * onEnd kalles når slutten er nådd.
 */
export async function play(plan, from = 0, { tone = null, onEnd, people = [] } = {}) {
  stop();
  if (!plan.items.length) return;
  if (from >= plan.end - 0.01) from = 0;
  const c = audio();
  const run = playbackRun;
  playing.value = true;
  try { if (c.state === 'suspended') await c.resume(); }
  catch { if (run === playbackRun) playing.value = false; return; }
  if (run !== playbackRun) return;
  let bufs;
  const byPerson = new Map(people.map((p) => [p.id, p]));
  try {
    const cleanOn = new Set(people.filter((p) => p.clean > 0).map((p) => p.id));
    // Deaktiverte spor planlegges gjennom en dempet lydrute, slik at de kan slås på mens vi spiller.
    bufs = await Promise.all(plan.items.map((it) => (it.take.disabled || (it.active === false && !byPerson.has(it.person)) ? null : load(cleanOn.has(it.person) ? cleanFile(it.take.file) : it.take.file))));
  } catch {
    if (run === playbackRun) playing.value = false;
    return;
  }
  if (run !== playbackRun) return;
  // Romlyden går gjennom samme spor som stemmen den hører til: AI Clean Voice, volum og effekter.
  const toneBufs = new Map();
  if (tone) {
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const piece of tone.pieces || []) {
      const p = byId.get(piece.person);
      const f = p?.clean > 0 ? cleanFile(tone.file) : tone.file;
      if (!toneBufs.has(f)) toneBufs.set(f, await load(f).catch(() => null));
      piece.buf = toneBufs.get(f);
    }
  }
  if (run !== playbackRun) return;
  const outs = new Map();
  for (const p of people) {
    const own = plan.items.filter((it) => it.person === p.id);
    outs.set(p.id, await route({ ...p, muted: p.muted || (own.length > 0 && own.every((it) => it.active === false)) }, run));
  }
  if (run !== playbackRun) return;
  const t0 = c.currentTime + 0.06;
  plan.items.forEach((it, i) => {
    if (!bufs[i]) return;
    const out = bufs[i].numberOfChannels === 4 ? outs.get(it.person)?.clean || outs.get(it.person)?.gain : outs.get(it.person)?.gain;
    // Et klipp med kutt spilles del for del, med korte fades ved hvert kutt så det ikke klikker.
    const parts = itemParts(it);
    parts.forEach((part, k) => {
      const fades = takeFades(it.take);
      const fadeIn = k === 0 ? fades.fadeIn : 0.006;
      const fadeOut = k === parts.length - 1 ? fades.fadeOut : 0.006;
      schedule(bufs[i], { ...part, gain: it.take.gain, kf: it.take.volKf, fadeIn, fadeOut }, from, t0, out);
    });
  });
  for (const piece of tone?.pieces || []) {
    if (!piece.buf) continue;
    const r = outs.get(piece.person);
    schedule(piece.buf, { ...piece, fadeIn: 0.04, fadeOut: 0.04 }, from, t0, piece.buf.numberOfChannels === 4 ? r?.clean || r?.gain : r?.gain);
  }
  const tick = () => {
    const t = from + Math.max(0, c.currentTime - t0);
    time.value = Math.min(t, plan.end);
    measure();
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
let lastScrub = -Infinity;
let scrubRun = 0;
const scrubSources = new Set();
export function stopScrub() {
  scrubRun++;
  for (const src of scrubSources) {
    try { src.stop(); } catch {}
  }
  scrubSources.clear();
}

export async function scrub(plan, t, people = []) {
  const now = performance.now();
  if (playing.value || now - lastScrub < 70) return;
  lastScrub = now;
  stopScrub();
  const run = scrubRun;
  const it = plan.items.find((x) => x.active !== false && t >= x.at && t < x.at + x.dur);
  const p = it && people.find((x) => x.id === it.person);
  if (!it || p?.muted) return;
  const buf = await load(it.take.file).catch(() => null);
  if (!buf || run !== scrubRun || playing.value || trackLevels.get(it.person)?.muted) return;
  const c = audio();
  if (c.state === 'suspended') await c.resume();
  if (run !== scrubRun || playing.value || trackLevels.get(it.person)?.muted) return;
  const part = itemParts(it).find((x) => t < x.at + x.dur) || itemParts(it).at(-1);
  const s = part.in + (t - part.at);
  const db = (it.take.volKf?.length ? dbAt(it.take.volKf, s) : it.take.gain || 0) + (p?.gain || 0);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(lin(db), c.currentTime);
  g.gain.linearRampToValueAtTime(0, c.currentTime + 0.09);
  src.connect(g).connect(master);
  const duration = Math.min(0.09, part.in + part.dur - s, buf.duration - s);
  if (duration <= 0) { src.disconnect(); g.disconnect(); return; }
  scrubSources.add(src);
  src.onended = () => { scrubSources.delete(src); src.disconnect(); g.disconnect(); };
  src.start(c.currentTime, s, duration);
}

export function close() {
  stop();
  ctx?.close().catch(() => {});
  ctx = null;
  master = null;
  analyser = null;
  fxReady = null;
  buffers.clear();
  peakCache.clear();
  clearTimeout(renderTimer);
  wanted.clear();
  processed.clear();
  trackLevels.clear();
}
