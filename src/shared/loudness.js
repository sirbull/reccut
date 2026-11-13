// Lydstyrke etter ITU-R BS.1770-4 / EBU R128: K-veiing, blokker på 400 ms med 75 % overlapp,
// absolutt port på -70 LUFS og relativ port 10 LU under. Brukes ved eksport til å treffe et mål
// (for eksempel -14 LUFS for YouTube) og i testene.

export const LOUDNESS_TARGETS = [
  { value: 0, label: 'Off' },
  { value: -14, label: 'Streaming, −14 LUFS (YouTube, TikTok, Spotify)' },
  { value: -16, label: 'Podcast, −16 LUFS (Apple Podcasts)' },
  { value: -23, label: 'Broadcast, −23 LUFS (EBU R128)' },
  { value: -24, label: 'US broadcast, −24 LKFS (ATSC A/85)' },
];

// Taket for toppene etter normalisering. -1 dBFS gir plass til kodingen i AAC og MP3.
export const LOUDNESS_CEILING = -1;

// K-filteret i to trinn (høyfrekvent hylle og høypass), med koeffisienter for vilkårlig samplingsrate
// som i libebur128.
function kFilters(rate) {
  let K = Math.tan((Math.PI * 1681.974450955533) / rate);
  const Vh = 10 ** (3.999843853973347 / 20);
  const Vb = Vh ** 0.4996667741545416;
  let Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const shelf = {
    b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0],
    a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0],
  };
  K = Math.tan((Math.PI * 38.13547087602444) / rate);
  Q = 0.5003270373238773;
  a0 = 1 + K / Q + K * K;
  const high = { b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  return [shelf, high];
}

// Måler lyd som kommer i biter: push(L, R, n) for stereo (R kan være null for mono).
export class LoudnessMeter {
  constructor(rate) {
    this.rate = rate;
    this.filters = kFilters(rate);
    // Tilstand per kanal og filter: [x1, x2, y1, y2].
    this.state = [0, 1].map(() => this.filters.map(() => [0, 0, 0, 0]));
    this.step = Math.round(rate * 0.1);
    this.acc = 0;
    this.n = 0;
    this.segments = [];
    this.peak = 0;
  }

  filter(ch, x) {
    let v = x;
    this.filters.forEach((f, i) => {
      const s = this.state[ch][i];
      const y = f.b[0] * v + f.b[1] * s[0] + f.b[2] * s[1] - f.a[0] * s[2] - f.a[1] * s[3];
      s[1] = s[0];
      s[0] = v;
      s[3] = s[2];
      s[2] = y;
      v = y;
    });
    return v;
  }

  push(L, R, n = L.length) {
    for (let i = 0; i < n; i++) {
      const l = L[i];
      const r = R ? R[i] : 0;
      const p = Math.max(Math.abs(l), Math.abs(r));
      if (p > this.peak) this.peak = p;
      const yl = this.filter(0, l);
      const yr = R ? this.filter(1, r) : 0;
      this.acc += yl * yl + yr * yr;
      if (++this.n === this.step) {
        this.segments.push(this.acc / this.step);
        this.acc = 0;
        this.n = 0;
      }
    }
  }

  // Integrert lydstyrke i LUFS, eller -Infinity for stillhet.
  integrated() {
    const blocks = [];
    for (let i = 3; i < this.segments.length; i++) blocks.push((this.segments[i] + this.segments[i - 1] + this.segments[i - 2] + this.segments[i - 3]) / 4);
    const lufs = (z) => -0.691 + 10 * Math.log10(z);
    const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const abs = blocks.filter((z) => z > 0 && lufs(z) > -70);
    if (!abs.length) return -Infinity;
    const rel = lufs(mean(abs)) - 10;
    const gated = abs.filter((z) => lufs(z) > rel);
    return lufs(mean(gated));
  }

  peakDb() {
    return this.peak > 0 ? 20 * Math.log10(this.peak) : -Infinity;
  }
}

// Normaliseringen: mål, forsterk med limiter, mål igjen. Korte topper (et klikk, en dør) teller med i
// første måling, men tas av limiteren, så miksen kan havne under målet. Da rettes det opp, høyst to ganger.
// measure() gir LUFS for miksen slik den er nå, apply(dB) forsterker den med limiteren.
export function normalizeTo(target, measure, apply) {
  const before = measure();
  let after = before;
  let total = 0;
  for (let pass = 0; pass < 3; pass++) {
    // Grensen gjelder summen av rundene, ikke hver runde for seg.
    const gain = Math.max(-MAX_GAIN - total, Math.min(MAX_GAIN - total, loudnessGain(after, target)));
    if (Math.abs(gain) < (pass ? 0.3 : 0.05)) break;
    apply(gain);
    total += gain;
    after = measure();
  }
  return { before, after, gain: total };
}

// Forsterkningen som trengs for å nå målet. Ingen endring for stillhet (alt under -70 LUFS er
// portet bort i målingen), og høyst 40 dB opp eller ned som en sikkerhetsgrense.
const MAX_GAIN = 40;
export function loudnessGain(measured, target) {
  if (!target || !Number.isFinite(measured)) return 0;
  return Math.max(-MAX_GAIN, Math.min(MAX_GAIN, target - measured));
}
