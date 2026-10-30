// Automatisk synkronisering av lyd: finner hvor et lydopptak passer mot lyden i et
// videoklipp ved å sammenligne lydstyrkekurvene (100 verdier per sekund).

import { CAPTION_LANE, uid } from './model.js';
import { resolveLane, shiftKeyframes } from './ops.js';

export const ENV_RATE = 100;

// Gjør toppverdiene om til en kurve som framhever lydhendelser (tale, klapp, lyder),
// slik at ulik mikrofon og ulikt nivå ikke betyr noe.
export function prepareEnvelope(peaks, from = 0, to = peaks.length) {
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(peaks.length, Math.ceil(to));
  const n = Math.max(0, b - a);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.log1p(peaks[a + i]);
  // Fjern langsomme endringer (bakgrunnsnivå) med et glidende snitt.
  const W = 25;
  const out = new Float64Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + v[i];
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - W);
    const hi = Math.min(n, i + W + 1);
    out[i] = v[i] - (pre[hi] - pre[lo]) / (hi - lo);
    mean += out[i];
  }
  mean /= n || 1;
  for (let i = 0; i < n; i++) out[i] -= mean;
  return out;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Enkel FFT (radix 2) på plass.
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar;
        im[i + k + len / 2] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

/**
 * Finner forskyvningen L (i prøver) slik at x[k] passer best mot y[k + L].
 * Returnerer { lag, score }, der score er normalisert korrelasjon (1 er perfekt).
 */
export function findOffset(x, y, { minOverlap = 300 } = {}) {
  const n = x.length;
  const m = y.length;
  if (n < 20 || m < 20) return null;
  const N = nextPow2(n + m);
  const xr = new Float64Array(N);
  const xi = new Float64Array(N);
  const yr = new Float64Array(N);
  const yi = new Float64Array(N);
  xr.set(x);
  yr.set(y);
  fft(xr, xi);
  fft(yr, yi);
  // Korrelasjon: konj(X) * Y
  for (let i = 0; i < N; i++) {
    const r = xr[i] * yr[i] + xi[i] * yi[i];
    const im = xr[i] * yi[i] - xi[i] * yr[i];
    xr[i] = r;
    xi[i] = im;
  }
  fft(xr, xi, true);
  const px = new Float64Array(n + 1);
  const py = new Float64Array(m + 1);
  for (let i = 0; i < n; i++) px[i + 1] = px[i] + x[i] * x[i];
  for (let i = 0; i < m; i++) py[i + 1] = py[i] + y[i] * y[i];
  // Minst halvparten av det korteste klippet må overlappe, ellers blir tilfeldige treff i kantene for gode.
  const need = Math.max(Math.min(minOverlap, Math.floor(Math.min(n, m) * 0.8)), Math.floor(Math.min(n, m) * 0.5));
  const score = (L) => {
    const k0 = Math.max(0, -L);
    const k1 = Math.min(n, m - L);
    if (k1 - k0 < need) return -1;
    const ex = px[k1] - px[k0];
    const ey = py[k1 + L] - py[k0 + L];
    if (ex <= 0 || ey <= 0) return -1;
    const r = xr[L >= 0 ? L : N + L];
    return r / Math.sqrt(ex * ey);
  };
  let best = -Infinity;
  let bestL = 0;
  let sum = 0;
  let sum2 = 0;
  let count = 0;
  for (let L = -(n - 1); L <= m - 1; L++) {
    const s = score(L);
    if (s < -0.5) continue;
    sum += s;
    sum2 += s * s;
    count++;
    if (s > best) {
      best = s;
      bestL = L;
    }
  }
  if (best <= 0 || !count) return null;
  // Hvor tydelig toppen skiller seg ut fra alle andre forskyvninger (i standardavvik).
  const mean = sum / count;
  const sd = Math.sqrt(Math.max(1e-12, sum2 / count - mean * mean));
  const peak = (best - mean) / sd;
  // Finjuster mellom prøvene med en parabel gjennom toppen.
  const s0 = score(bestL - 1);
  const s2 = score(bestL + 1);
  let frac = 0;
  if (s0 > 0 && s2 > 0) {
    const d = s0 - 2 * best + s2;
    if (d < 0) frac = Math.max(-0.5, Math.min(0.5, (0.5 * (s0 - s2)) / d));
  }
  return { lag: bestL + frac, score: best, peak };
}

// Godta bare tydelige treff: høy korrelasjon og en topp som skiller seg klart ut.
export function isConfident(r) {
  return Boolean(r && r.score >= 0.45 && r.peak >= 5);
}

/* Plassering: hvilke videoklipp et lydklipp passer under, og hvordan det legges der. */

const plain = (c) => (c.speed ?? 1) === 1 && !c.ramp && !c.reverse;

// Lydstrømmen et klipp bruker, og forskyvningen mellom klipptid og filtid.
export function clipAudioSource(project, clip) {
  const media = project.media[clip.mediaId];
  if (!media) return null;
  let key = clip.stream || 'main';
  if (clip.type === 'recording') key = media.streams.camera?.hasAudio ? 'camera' : 'screen';
  const stream = media.streams[key];
  if (!stream?.hasAudio || !stream.wave) return null;
  return { key, stream, offset: media.kind === 'recording' ? stream.offset || 0 : 0 };
}

export function syncCandidates(project, audioId) {
  const a = project.clips[audioId];
  if (!a) return [];
  return Object.values(project.clips)
    .filter((v) => (v.type === 'video' || v.type === 'recording') && v.lane >= 0 && v.lane !== CAPTION_LANE)
    .filter((v) => v.enabled && plain(v) && v.mediaId !== a.mediaId && clipAudioSource(project, v))
    .sort((x, y) => x.start - y.start);
}

/**
 * Finner videoklippene lydklippet passer under. waveFor(path) gir { rate, peaks } eller null.
 * only begrenser søket til bestemte videoklipp. Svar: [{ videoId, at, score }] der at er tiden i lydfilen som hører til starten av videoklippet.
 */
export function planSync(project, audioId, waveFor, { only = null } = {}) {
  const a = project.clips[audioId];
  if (!a || !plain(a)) return [];
  const src = clipAudioSource(project, a);
  const wa = src && waveFor(src.stream.wave);
  if (!wa) return [];
  const y0 = Math.max(0, a.in - src.offset);
  const y = prepareEnvelope(wa.peaks, y0 * ENV_RATE, (a.in - src.offset + a.dur) * ENV_RATE);
  const out = [];
  for (const v of syncCandidates(project, audioId)) {
    if (only && !only.includes(v.id)) continue;
    const vs = clipAudioSource(project, v);
    const wv = waveFor(vs.stream.wave);
    if (!wv) continue;
    const f0 = v.in - vs.offset;
    const x0 = Math.max(0, f0);
    const x = prepareEnvelope(wv.peaks, x0 * ENV_RATE, (f0 + v.dur) * ENV_RATE);
    const r = findOffset(x, y);
    if (!isConfident(r)) continue;
    // Lydfilens tid ved x0 er y0 + lag; trekk fra det som mangler før x0.
    const at = y0 + r.lag / ENV_RATE - (x0 - f0);
    out.push({ videoId: v.id, at, score: r.score });
  }
  return out;
}

const round3 = (v) => Math.round(v * 1e6) / 1e6;

/**
 * Legger lydklippet under treffene. mode 'first' bruker bare det første treffet,
 * 'split' deler lyden opp og legger en bit under hvert klipp.
 * Et lydklipp som er lengre enn videoklippet klippes til; et kortere legges bare riktig.
 */
export function applySync(project, audioId, matches, { mode = 'first', muteCamera = false, group = true } = {}) {
  const a = project.clips[audioId];
  if (!a || !matches.length) return [];
  const src = clipAudioSource(project, a);
  const fileStart = a.in - src.offset;
  const fileEnd = fileStart + a.dur;
  const list = mode === 'split' ? matches : matches.slice(0, 1);
  const original = structuredClone(a);
  const placed = [];
  for (const m of list) {
    const v = project.clips[m.videoId];
    if (!v) continue;
    const f0 = Math.max(fileStart, m.at);
    const f1 = Math.min(fileEnd, m.at + v.dur);
    if (f1 - f0 < 0.1) continue;
    const c = placed.length ? { ...structuredClone(original), id: uid() } : a;
    c.in = round3(f0 + src.offset);
    c.dur = round3(f1 - f0);
    c.start = round3(Math.max(0, v.start + (f0 - m.at)));
    shiftKeyframes(c, c.in - original.in);
    c.lane = c.lane < 0 ? c.lane : -1;
    delete c.axfade;
    project.clips[c.id] = c;
    resolveLane(project, c);
    if (group) {
      const g = v.group || uid();
      v.group = g;
      c.group = g;
    }
    if (muteCamera) {
      const prop = v.type === 'recording' ? 'micVolume' : 'volume';
      v.props[prop] = -60;
      if (v.kf) delete v.kf[prop];
    }
    placed.push(c.id);
  }
  return placed;
}
