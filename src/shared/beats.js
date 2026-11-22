// Beat Detection: finds the beats and bars in a music clip, for the beat grid in the timeline.
// Onsets by spectral flux (each frequency on its own, so drums are heard under a loud bass),
// tempo from autocorrelation, and beats by dynamic programming (Ellis 2007),
// so the grid follows small tempo drift.
export const BEAT_RATE = 11025;
export const BEATS_VERSION = 2; // Raise when the analysis changes, so saved grids are made again.
const HOP = 256;
const N = 1024;

// In-place radix-2 FFT of length N.
function fft(re, im) {
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < N; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti;
        re[p] += tr; im[p] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function envelope(pcm, rate) {
  const fps = rate / HOP;
  const n = Math.max(0, Math.floor((pcm.length - N) / HOP));
  const bins = N / 2, lowBins = Math.ceil((150 * N) / rate);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(bins), cur = new Float32Array(bins);
  const flux = new Float32Array(n), low = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < N; j++) { re[j] = pcm[i * HOP + j] * win[j]; im[j] = 0; }
    fft(re, im);
    let f = 0, l = 0;
    for (let k = 1; k < bins; k++) {
      cur[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
      const d = Math.max(0, cur[k] - prev[k]);
      f += d;
      if (k <= lowBins) l += d;
    }
    // The flux peaks one hop before the new sound reaches the middle of the window (measured on a click track).
    const at = Math.min(n - 1, i + N / 2 / HOP + 1);
    flux[at] = f;
    low[at] = l;
    [prev, cur] = [cur, prev];
  }
  // Only what stands out from the last second counts as an onset.
  const onset = new Float32Array(n);
  const w = Math.round(fps);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += flux[i] - (i >= w ? flux[i - w] : 0);
    onset[i] = Math.max(0, flux[i] - sum / Math.min(i + 1, w));
  }
  return { onset, low, fps };
}

function normalize(x) {
  let s = 0;
  for (const v of x) s += v * v;
  const sd = Math.sqrt(s / x.length) || 1;
  return x.map((v) => v / sd);
}

// Beat period in frames. Tempos near 120 BPM are preferred, as most music is counted that way.
function period(onset, fps) {
  const lo = Math.floor((fps * 60) / 200), hi = Math.ceil((fps * 60) / 60);
  // Smoothed first: a beat seldom lands on a whole frame, so spikes alternate between two lags.
  const x = onset.map((v, i) => 0.25 * (onset[i - 1] || 0) + 0.5 * v + 0.25 * (onset[i + 1] || 0));
  const ac = new Float64Array(hi + 2);
  for (let L = lo - 1; L <= hi + 1; L++) for (let i = L; i < x.length; i++) ac[L] += x[i] * x[i - L];
  let best = lo, bestScore = -Infinity;
  for (let L = lo; L <= hi; L++) {
    const s = ac[L] * Math.exp(-0.5 * Math.log2((fps * 60) / L / 120) ** 2);
    if (s > bestScore) [best, bestScore] = [L, s];
  }
  const [y0, y1, y2] = [ac[best - 1], ac[best], ac[best + 1]];
  const d = y0 - 2 * y1 + y2;
  return best + (d < 0 ? (0.5 * (y0 - y2)) / d : 0);
}

// ponytail: 4/4 is assumed; the downbeat is the beat in the bar with the most bass.
// Other time signatures need a meter choice in the UI.
export function detectBeats(pcm, rate = BEAT_RATE) {
  const env = envelope(pcm, rate);
  const onset = normalize(env.onset), low = normalize(env.low), fps = env.fps;
  const n = onset.length;
  if (n < fps * 4) return null;
  const P = period(onset, fps);
  const score = new Float64Array(n), back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    for (let prev = Math.max(0, i - Math.round(2 * P)); prev <= i - Math.round(P / 2); prev++) {
      const s = score[prev] - 100 * Math.log((i - prev) / P) ** 2;
      if (s > best) [best, back[i]] = [s, prev];
    }
    score[i] = onset[i] + (back[i] >= 0 ? best : 0);
  }
  let i = n - 1;
  for (let j = Math.max(0, n - Math.round(P)); j < n; j++) if (score[j] > score[i]) i = j;
  const frames = [];
  for (; i >= 0; i = back[i]) frames.unshift(i);
  const strength = [0, 1, 2, 3].map((k) => frames.reduce((s, f, j) => (j % 4 === k ? s + low[f] : s), 0) / Math.ceil(frames.length / 4));
  const downbeat = strength.indexOf(Math.max(...strength));
  return {
    version: BEATS_VERSION,
    bpm: Math.round((600 * fps) / P) / 10,
    downbeat,
    beats: frames.map((f) => Math.round(((f * HOP) / rate) * 1000) / 1000),
  };
}

// Timeline lines for one clip: { t, bar } inside the clip. Only plain-speed clips get a grid.
export function clipBeatLines(clip, beats) {
  if (!beats?.beats?.length || clip.ramp || clip.reverse) return [];
  const speed = clip.speed ?? 1;
  if (!(speed > 0)) return [];
  const out = [];
  beats.beats.forEach((b, i) => {
    const t = clip.start + (b - clip.in) / speed;
    if (t >= clip.start - 1e-6 && t <= clip.start + clip.dur + 1e-6) out.push({ t, bar: (i - beats.downbeat) % 4 === 0 });
  });
  return out;
}
