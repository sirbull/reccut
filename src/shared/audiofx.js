// Lydeffekter. Samme kode brukes i avspillingen (AudioWorklet) og i eksporten, så det du hører
// er det som havner i filen. Hver effekt behandler stereo i blokker og husker sin egen tilstand.
// clip.props.afx = [{ id, type, on, p: { parametre } }]

const TAU = Math.PI * 2;
const dbToLin = (db) => Math.pow(10, db / 20);
const linToDb = (v) => 20 * Math.log10(Math.max(1e-9, v));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* Biquad (RBJ Audio EQ Cookbook) */

export function biquadCoefs(type, f, q, gainDb, sr) {
  const w = (TAU * clamp(f, 10, sr * 0.49)) / sr;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sw / (2 * Math.max(0.05, q));
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lowpass':
      [b0, b1, b2, a0, a1, a2] = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
      break;
    case 'highpass':
      [b0, b1, b2, a0, a1, a2] = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
      break;
    case 'bandpass':
      [b0, b1, b2, a0, a1, a2] = [alpha, 0, -alpha, 1 + alpha, -2 * cw, 1 - alpha];
      break;
    case 'notch':
      [b0, b1, b2, a0, a1, a2] = [1, -2 * cw, 1, 1 + alpha, -2 * cw, 1 - alpha];
      break;
    case 'lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      [b0, b1, b2] = [A * (A + 1 - (A - 1) * cw + s), 2 * A * (A - 1 - (A + 1) * cw), A * (A + 1 - (A - 1) * cw - s)];
      [a0, a1, a2] = [A + 1 + (A - 1) * cw + s, -2 * (A - 1 + (A + 1) * cw), A + 1 + (A - 1) * cw - s];
      break;
    }
    case 'highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      [b0, b1, b2] = [A * (A + 1 + (A - 1) * cw + s), -2 * A * (A - 1 + (A + 1) * cw), A * (A + 1 + (A - 1) * cw - s)];
      [a0, a1, a2] = [A + 1 - (A - 1) * cw + s, 2 * (A - 1 - (A + 1) * cw), A + 1 - (A - 1) * cw - s];
      break;
    }
    default: // peaking
      [b0, b1, b2, a0, a1, a2] = [1 + alpha * A, -2 * cw, 1 - alpha * A, 1 + alpha / A, -2 * cw, 1 - alpha / A];
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

// Forsterkning i dB for en biquad ved frekvensen f (til kurven i equalizeren).
export function biquadResponse(c, f, sr) {
  const w = (TAU * f) / sr;
  const re = (k) => Math.cos(k * w);
  const im = (k) => -Math.sin(k * w);
  const nr = c[0] + c[1] * re(1) + c[2] * re(2);
  const ni = c[1] * im(1) + c[2] * im(2);
  const dr = 1 + c[3] * re(1) + c[4] * re(2);
  const di = c[3] * im(1) + c[4] * im(2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

class Biquad {
  constructor(c) {
    this.c = c;
    this.z = new Float64Array(4); // x1, x2, y1, y2 for venstre; høyre i egen instans
  }
  run(x) {
    const [b0, b1, b2, a1, a2] = this.c;
    const z = this.z;
    const y = b0 * x + b1 * z[0] + b2 * z[1] - a1 * z[2] - a2 * z[3];
    z[1] = z[0];
    z[0] = x;
    z[3] = z[2];
    z[2] = y;
    return y;
  }
}

// Et sett filtre i serie, for begge kanaler.
class FilterBank {
  constructor() {
    this.L = [];
    this.R = [];
  }
  setCoefs(list) {
    if (list.length !== this.L.length) {
      this.L = list.map((c) => new Biquad(c));
      this.R = list.map((c) => new Biquad(c));
    } else
      list.forEach((c, i) => {
        this.L[i].c = c;
        this.R[i].c = c;
      });
  }
  process(L, R, n) {
    const fl = this.L;
    const fr = this.R;
    for (let i = 0; i < n; i++) {
      let l = L[i];
      let r = R[i];
      for (let k = 0; k < fl.length; k++) {
        l = fl[k].run(l);
        r = fr[k].run(r);
      }
      L[i] = l;
      R[i] = r;
    }
  }
}

// Følger nivået med egen tid for opp og ned (millisekunder).
const coefFor = (ms, sr) => Math.exp(-1 / (Math.max(0.05, ms) * 0.001 * sr));

// Deterministisk tilfeldighet, så støy og knitter blir likt hver gang.
function rng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* FFT for støyfjerning */

function fft(re, im, inverse) {
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
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const ai = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j + len / 2] = re[i + j] - ar;
        im[i + j + len / 2] = im[i + j] - ai;
        re[i + j] += ar;
        im[i + j] += ai;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) (re[i] /= n), (im[i] /= n);
}

/* Effektene */

const P = (id, label, min, max, def, step = 0.01, unit = '', extra = {}) => ({ id, label, min, max, def, step, unit, ...extra });
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const AUDIO_EFFECTS = {
  eq: {
    label: 'Equalizer',
    category: 'EQ',
    desc: '10 band graphic equalizer.',
    params: EQ_BANDS.map((f, i) => P(`b${i}`, f >= 1000 ? `${f / 1000}k` : String(f), -18, 18, 0, 0.5, 'dB')),
    create(p, sr) {
      const bank = new FilterBank();
      return {
        set(q) {
          bank.setCoefs(eqCoefs(q, sr));
        },
        process: (L, R, n) => bank.process(L, R, n),
      };
    },
  },
  highpass: {
    label: 'High Pass',
    category: 'Repair',
    desc: 'Removes rumble, wind and handling noise below the frequency.',
    params: [P('freq', 'Frequency', 20, 1000, 80, 1, 'Hz', { log: true })],
    create(p, sr) {
      const bank = new FilterBank();
      return {
        set: (q) => bank.setCoefs([biquadCoefs('highpass', q.freq, 0.707, 0, sr), biquadCoefs('highpass', q.freq, 0.707, 0, sr)]),
        process: (L, R, n) => bank.process(L, R, n),
      };
    },
  },
  lowpass: {
    label: 'Low Pass',
    category: 'EQ',
    desc: 'Removes everything above the frequency. Makes the sound darker or muffled.',
    params: [P('freq', 'Frequency', 200, 20000, 8000, 1, 'Hz', { log: true }), P('q', 'Resonance', 0.3, 8, 0.707, 0.01)],
    create(p, sr) {
      const bank = new FilterBank();
      return {
        set: (q) => bank.setCoefs([biquadCoefs('lowpass', q.freq, q.q, 0, sr)]),
        process: (L, R, n) => bank.process(L, R, n),
      };
    },
  },
  bandpass: {
    label: 'Band Pass',
    category: 'Creative',
    desc: 'Keeps only a band of frequencies, like a phone or a small speaker.',
    params: [P('low', 'Low cut', 50, 2000, 300, 1, 'Hz', { log: true }), P('high', 'High cut', 800, 16000, 3400, 1, 'Hz', { log: true })],
    create(p, sr) {
      const bank = new FilterBank();
      return {
        set: (q) => bank.setCoefs([biquadCoefs('highpass', q.low, 0.707, 0, sr), biquadCoefs('highpass', q.low, 0.707, 0, sr), biquadCoefs('lowpass', q.high, 0.707, 0, sr), biquadCoefs('lowpass', q.high, 0.707, 0, sr)]),
        process: (L, R, n) => bank.process(L, R, n),
      };
    },
  },
  hum: {
    label: 'Hum Removal',
    category: 'Repair',
    desc: 'Removes electrical hum at 50 Hz (Europe) or 60 Hz (America) and its overtones.',
    params: [P('freq', 'Frequency', 50, 60, 50, 10, 'Hz', { choices: [50, 60] }), P('harmonics', 'Overtones', 1, 8, 4, 1)],
    create(p, sr) {
      const bank = new FilterBank();
      return {
        set: (q) => {
          const list = [];
          for (let k = 1; k <= q.harmonics; k++) if (q.freq * k < sr * 0.45) list.push(biquadCoefs('notch', q.freq * k, 25, 0, sr));
          bank.setCoefs(list);
        },
        process: (L, R, n) => bank.process(L, R, n),
      };
    },
  },
  denoise: {
    label: 'Noise Reduction',
    category: 'Repair',
    desc: 'Learns the steady background noise (fans, air conditioning, hiss) and removes it.',
    params: [P('amount', 'Amount', 0, 1, 0.7, 0.01, '%', { scale: 100 }), P('floor', 'Keep', -40, 0, -24, 0.5, 'dB')],
    create(p, sr) {
      return spectralDenoiser(sr);
    },
  },
  gate: {
    label: 'Noise Gate',
    category: 'Repair',
    desc: 'Turns the sound down in the pauses, when it is below the threshold.',
    params: [P('threshold', 'Threshold', -80, 0, -45, 0.5, 'dB'), P('range', 'Reduction', 0, 80, 30, 0.5, 'dB'), P('attack', 'Attack', 0.1, 50, 2, 0.1, 'ms'), P('release', 'Release', 10, 1000, 150, 1, 'ms')],
    create(p, sr) {
      let env = 0;
      let g = 1;
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const thr = dbToLin(q.threshold);
          const floor = dbToLin(-q.range);
          const att = coefFor(q.attack, sr);
          const rel = coefFor(q.release, sr);
          const ea = coefFor(1, sr);
          const er = coefFor(40, sr);
          for (let i = 0; i < n; i++) {
            const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
            env = x > env ? ea * env + (1 - ea) * x : er * env + (1 - er) * x;
            const target = env >= thr ? 1 : floor;
            g = target > g ? att * g + (1 - att) * target : rel * g + (1 - rel) * target;
            L[i] *= g;
            R[i] *= g;
          }
        },
      };
    },
  },
  compressor: {
    label: 'Compressor',
    category: 'Dynamics',
    desc: 'Evens out loud and quiet parts so the voice sits steady.',
    params: [P('threshold', 'Threshold', -60, 0, -20, 0.5, 'dB'), P('ratio', 'Ratio', 1, 20, 3, 0.1, ':1'), P('attack', 'Attack', 0.1, 100, 8, 0.1, 'ms'), P('release', 'Release', 10, 1000, 120, 1, 'ms'), P('makeup', 'Makeup', 0, 24, 4, 0.5, 'dB')],
    create(p, sr) {
      let env = 0;
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const att = coefFor(q.attack, sr);
          const rel = coefFor(q.release, sr);
          const mk = dbToLin(q.makeup);
          for (let i = 0; i < n; i++) {
            const x = Math.max(Math.abs(L[i]), Math.abs(R[i]));
            env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
            const over = linToDb(env) - q.threshold;
            const g = over > 0 ? dbToLin(-over * (1 - 1 / q.ratio)) * mk : mk;
            L[i] *= g;
            R[i] *= g;
          }
        },
      };
    },
  },
  limiter: {
    label: 'Limiter',
    category: 'Dynamics',
    desc: 'Stops peaks from going over the ceiling, so nothing distorts.',
    params: [P('ceiling', 'Ceiling', -12, 0, -1, 0.1, 'dB'), P('release', 'Release', 10, 500, 60, 1, 'ms'), P('gain', 'Input gain', 0, 18, 0, 0.5, 'dB')],
    create(p, sr) {
      let g = 1;
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const ceil = dbToLin(q.ceiling);
          const pre = dbToLin(q.gain);
          const rel = coefFor(q.release, sr);
          for (let i = 0; i < n; i++) {
            const l = L[i] * pre;
            const r = R[i] * pre;
            const x = Math.max(Math.abs(l), Math.abs(r));
            const need = x * g > ceil ? ceil / x : 1;
            g = need < g ? need : rel * g + (1 - rel) * Math.min(1, need);
            L[i] = clamp(l * g, -ceil, ceil);
            R[i] = clamp(r * g, -ceil, ceil);
          }
        },
      };
    },
  },
  deesser: {
    label: 'De-esser',
    category: 'Repair',
    desc: 'Softens sharp S and T sounds.',
    params: [P('freq', 'Frequency', 3000, 10000, 6000, 10, 'Hz', { log: true }), P('threshold', 'Threshold', -50, 0, -28, 0.5, 'dB'), P('amount', 'Max reduction', 0, 24, 10, 0.5, 'dB')],
    create(p, sr) {
      const hpL = new Biquad(biquadCoefs('highpass', p.freq, 0.707, 0, sr));
      const hpR = new Biquad(biquadCoefs('highpass', p.freq, 0.707, 0, sr));
      let env = 0;
      let q = p;
      return {
        set(x) {
          q = x;
          hpL.c = hpR.c = biquadCoefs('highpass', x.freq, 0.707, 0, sr);
        },
        process(L, R, n) {
          const a = coefFor(1, sr);
          const r = coefFor(60, sr);
          const thr = q.threshold;
          for (let i = 0; i < n; i++) {
            const hl = hpL.run(L[i]);
            const hr = hpR.run(R[i]);
            const x = Math.max(Math.abs(hl), Math.abs(hr));
            env = x > env ? a * env + (1 - a) * x : r * env + (1 - r) * x;
            const over = linToDb(env) - thr;
            const red = over > 0 ? dbToLin(-Math.min(q.amount, over * 0.7)) : 1;
            L[i] -= hl * (1 - red);
            R[i] -= hr * (1 - red);
          }
        },
      };
    },
  },
  autolevel: {
    label: 'Auto Level',
    category: 'Repair',
    desc: 'Turns quiet speech up and loud speech down to an even level.',
    params: [P('target', 'Target level', -36, -6, -18, 0.5, 'dB'), P('maxGain', 'Max boost', 0, 30, 15, 0.5, 'dB'), P('speed', 'Speed', 0.1, 1, 0.5, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      let rms = dbToLin(-30) ** 2;
      let g = 1;
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const win = coefFor(300, sr);
          const sp = coefFor(1500 / q.speed, sr);
          const gate = dbToLin(-50) ** 2;
          for (let i = 0; i < n; i++) {
            const e = (L[i] * L[i] + R[i] * R[i]) / 2;
            rms = win * rms + (1 - win) * e;
            // I pausene står forsterkningen stille, så støyen ikke dras opp.
            if (rms > gate) {
              const want = clamp(q.target - 10 * Math.log10(rms), -24, q.maxGain);
              g = sp * g + (1 - sp) * dbToLin(want);
            }
            L[i] *= g;
            R[i] *= g;
          }
        },
      };
    },
  },
  gain: {
    label: 'Gain',
    category: 'Dynamics',
    desc: 'Turns the clip up or down before the other effects.',
    params: [P('db', 'Gain', -30, 30, 6, 0.5, 'dB')],
    create(p) {
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const g = dbToLin(q.db);
          for (let i = 0; i < n; i++) (L[i] *= g), (R[i] *= g);
        },
      };
    },
  },
  stereo: {
    label: 'Pan and Width',
    category: 'Dynamics',
    desc: 'Pan left or right, make the stereo wider or narrower, or turn it into mono.',
    params: [P('pan', 'Pan', -1, 1, 0, 0.01, '', { center: 0 }), P('width', 'Width', 0, 2, 1, 0.01, '%', { scale: 100 })],
    create(p) {
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const a = ((q.pan + 1) * Math.PI) / 4;
          const gl = Math.cos(a) * Math.SQRT2;
          const gr = Math.sin(a) * Math.SQRT2;
          for (let i = 0; i < n; i++) {
            const m = (L[i] + R[i]) / 2;
            const s = ((L[i] - R[i]) / 2) * q.width;
            L[i] = (m + s) * gl;
            R[i] = (m - s) * gr;
          }
        },
      };
    },
  },
  echo: {
    label: 'Echo',
    category: 'Space',
    desc: 'Repeats the sound, like an echo in a canyon.',
    params: [P('time', 'Time', 20, 1500, 320, 1, 'ms'), P('feedback', 'Feedback', 0, 0.95, 0.4, 0.01, '%', { scale: 100 }), P('mix', 'Mix', 0, 1, 0.35, 0.01, '%', { scale: 100 }), P('tone', 'Tone', 500, 16000, 5000, 1, 'Hz', { log: true }), P('pingpong', 'Ping pong', 0, 1, 0, 1, '', { toggle: true })],
    create(p, sr) {
      const max = Math.ceil(sr * 1.6);
      const bl = new Float32Array(max);
      const br = new Float32Array(max);
      let w = 0;
      let q = p;
      const lp = [new Biquad(biquadCoefs('lowpass', p.tone, 0.707, 0, sr)), new Biquad(biquadCoefs('lowpass', p.tone, 0.707, 0, sr))];
      return {
        set(x) {
          q = x;
          lp[0].c = lp[1].c = biquadCoefs('lowpass', x.tone, 0.707, 0, sr);
        },
        process(L, R, n) {
          const d = clamp(Math.round((q.time / 1000) * sr), 1, max - 1);
          for (let i = 0; i < n; i++) {
            const r = (w - d + max) % max;
            const dl = lp[0].run(bl[r]);
            const dr = lp[1].run(br[r]);
            const inL = L[i];
            const inR = R[i];
            if (q.pingpong) {
              bl[w] = (inL + inR) * 0.5 + dr * q.feedback;
              br[w] = dl * q.feedback;
            } else {
              bl[w] = inL + dl * q.feedback;
              br[w] = inR + dr * q.feedback;
            }
            L[i] = inL + dl * q.mix;
            R[i] = inR + dr * q.mix;
            w = (w + 1) % max;
          }
        },
      };
    },
  },
  reverb: {
    label: 'Reverb',
    category: 'Space',
    desc: 'Puts the sound in a room, from a small room to a cathedral.',
    params: [P('size', 'Room size', 0, 1, 0.6, 0.01, '%', { scale: 100 }), P('damping', 'Damping', 0, 1, 0.4, 0.01, '%', { scale: 100 }), P('width', 'Width', 0, 1, 1, 0.01, '%', { scale: 100 }), P('mix', 'Mix', 0, 1, 0.3, 0.01, '%', { scale: 100 }), P('predelay', 'Pre-delay', 0, 200, 15, 1, 'ms')],
    create(p, sr) {
      return freeverb(p, sr);
    },
  },
  chorus: {
    label: 'Chorus',
    category: 'Creative',
    desc: 'Thickens the sound with slightly detuned copies.',
    params: [P('rate', 'Rate', 0.05, 5, 0.8, 0.01, 'Hz'), P('depth', 'Depth', 0, 1, 0.5, 0.01, '%', { scale: 100 }), P('mix', 'Mix', 0, 1, 0.5, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      return modDelay(p, sr, 0.012, 0.008);
    },
  },
  flanger: {
    label: 'Flanger',
    category: 'Creative',
    desc: 'A sweeping jet plane sound.',
    params: [P('rate', 'Rate', 0.05, 5, 0.25, 0.01, 'Hz'), P('depth', 'Depth', 0, 1, 0.7, 0.01, '%', { scale: 100 }), P('mix', 'Mix', 0, 1, 0.5, 0.01, '%', { scale: 100 }), P('feedback', 'Feedback', 0, 0.9, 0.5, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      return modDelay(p, sr, 0.002, 0.0025);
    },
  },
  tremolo: {
    label: 'Tremolo',
    category: 'Creative',
    desc: 'The volume pulses up and down.',
    params: [P('rate', 'Rate', 0.5, 20, 6, 0.1, 'Hz'), P('depth', 'Depth', 0, 1, 0.6, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      let ph = 0;
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const inc = (TAU * q.rate) / sr;
          for (let i = 0; i < n; i++) {
            const g = 1 - q.depth * (0.5 + 0.5 * Math.sin(ph));
            ph += inc;
            L[i] *= g;
            R[i] *= g;
          }
          ph %= TAU;
        },
      };
    },
  },
  distortion: {
    label: 'Distortion',
    category: 'Creative',
    desc: 'Overdrive, fuzz or a broken speaker.',
    params: [P('drive', 'Drive', 0, 48, 18, 0.5, 'dB'), P('mode', 'Character', 0, 2, 0, 1, '', { choices: [0, 1, 2], labels: ['Warm', 'Hard', 'Fuzz'] }), P('tone', 'Tone', 500, 16000, 6000, 1, 'Hz', { log: true }), P('mix', 'Mix', 0, 1, 1, 0.01, '%', { scale: 100 }), P('output', 'Output', -30, 6, -6, 0.5, 'dB')],
    create(p, sr) {
      let q = p;
      const lp = [new Biquad(biquadCoefs('lowpass', p.tone, 0.707, 0, sr)), new Biquad(biquadCoefs('lowpass', p.tone, 0.707, 0, sr))];
      const shape = (x, m) => (m === 2 ? Math.sign(x) * (1 - Math.exp(-Math.abs(x) * 1.5)) : m === 1 ? clamp(x, -0.7, 0.7) / 0.7 : Math.tanh(x));
      return {
        set(x) {
          q = x;
          lp[0].c = lp[1].c = biquadCoefs('lowpass', x.tone, 0.707, 0, sr);
        },
        process(L, R, n) {
          const d = dbToLin(q.drive);
          const out = dbToLin(q.output);
          const m = Math.round(q.mode);
          for (let i = 0; i < n; i++) {
            const l = lp[0].run(shape(L[i] * d, m));
            const r = lp[1].run(shape(R[i] * d, m));
            L[i] = (L[i] * (1 - q.mix) + l * q.mix) * out;
            R[i] = (R[i] * (1 - q.mix) + r * q.mix) * out;
          }
        },
      };
    },
  },
  bitcrush: {
    label: 'Bitcrusher',
    category: 'Lo-fi',
    desc: 'Fewer bits and a lower sample rate, like old games and samplers.',
    params: [P('bits', 'Bits', 2, 16, 8, 1), P('rate', 'Sample rate', 1000, 48000, 11025, 1, 'Hz', { log: true }), P('mix', 'Mix', 0, 1, 1, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      let q = p;
      let hold = 0;
      let hl = 0;
      let hr = 0;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const step = Math.max(1, sr / q.rate);
          const lv = Math.pow(2, q.bits - 1);
          for (let i = 0; i < n; i++) {
            hold += 1;
            if (hold >= step) {
              hold -= step;
              hl = Math.round(L[i] * lv) / lv;
              hr = Math.round(R[i] * lv) / lv;
            }
            L[i] = L[i] * (1 - q.mix) + hl * q.mix;
            R[i] = R[i] * (1 - q.mix) + hr * q.mix;
          }
        },
      };
    },
  },
  lofi: {
    label: 'Lo-fi Tape',
    category: 'Lo-fi',
    desc: 'Old tape or vinyl: wobble, hiss, crackle and a dull top end.',
    params: [P('wobble', 'Wobble', 0, 1, 0.4, 0.01, '%', { scale: 100 }), P('hiss', 'Hiss', 0, 1, 0.25, 0.01, '%', { scale: 100 }), P('crackle', 'Crackle', 0, 1, 0.2, 0.01, '%', { scale: 100 }), P('tone', 'Tone', 1000, 16000, 5000, 1, 'Hz', { log: true }), P('saturation', 'Saturation', 0, 1, 0.3, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      const max = Math.ceil(sr * 0.05);
      const bl = new Float32Array(max);
      const br = new Float32Array(max);
      let w = 0;
      let ph1 = 0;
      let ph2 = 0;
      let q = p;
      const rand = rng(777);
      let crackleEnv = 0;
      const lp = [new Biquad(biquadCoefs('lowpass', p.tone, 0.6, 0, sr)), new Biquad(biquadCoefs('lowpass', p.tone, 0.6, 0, sr))];
      const hp = [new Biquad(biquadCoefs('highpass', 60, 0.7, 0, sr)), new Biquad(biquadCoefs('highpass', 60, 0.7, 0, sr))];
      return {
        set(x) {
          q = x;
          lp[0].c = lp[1].c = biquadCoefs('lowpass', x.tone, 0.6, 0, sr);
        },
        process(L, R, n) {
          const sat = 1 + q.saturation * 4;
          for (let i = 0; i < n; i++) {
            bl[w] = L[i];
            br[w] = R[i];
            // Langsom svaj og rask flagring i båndhastigheten.
            const mod = (Math.sin(ph1) * 0.6 + Math.sin(ph2) * 0.15) * q.wobble;
            ph1 += (TAU * 0.6) / sr;
            ph2 += (TAU * 7) / sr;
            const d = 0.012 * sr + mod * 0.008 * sr;
            const pos = (w - d + max * 2) % max;
            const i0 = Math.floor(pos);
            const fr = pos - i0;
            const i1 = (i0 + 1) % max;
            let l = bl[i0] * (1 - fr) + bl[i1] * fr;
            let r = br[i0] * (1 - fr) + br[i1] * fr;
            l = Math.tanh(l * sat) / Math.tanh(sat);
            r = Math.tanh(r * sat) / Math.tanh(sat);
            const hiss = (rand() * 2 - 1) * q.hiss * 0.02;
            if (rand() < q.crackle * 0.0006) crackleEnv = (rand() * 0.6 + 0.2) * q.crackle;
            const ck = crackleEnv * (rand() * 2 - 1);
            crackleEnv *= 0.82;
            L[i] = hp[0].run(lp[0].run(l + hiss + ck));
            R[i] = hp[1].run(lp[1].run(r + hiss + ck));
            w = (w + 1) % max;
          }
          ph1 %= TAU;
          ph2 %= TAU;
        },
      };
    },
  },
  ringmod: {
    label: 'Robot',
    category: 'Creative',
    desc: 'Ring modulation for robot and sci-fi voices.',
    params: [P('freq', 'Frequency', 20, 2000, 90, 1, 'Hz', { log: true }), P('mix', 'Mix', 0, 1, 0.8, 0.01, '%', { scale: 100 })],
    create(p, sr) {
      let ph = 0;
      let q = p;
      return {
        set: (x) => (q = x),
        process(L, R, n) {
          const inc = (TAU * q.freq) / sr;
          for (let i = 0; i < n; i++) {
            const m = Math.sin(ph);
            ph += inc;
            L[i] = L[i] * (1 - q.mix) + L[i] * m * q.mix;
            R[i] = R[i] * (1 - q.mix) + R[i] * m * q.mix;
          }
          ph %= TAU;
        },
      };
    },
  },
};

export const AUDIO_FX_CATEGORIES = ['Repair', 'EQ', 'Dynamics', 'Space', 'Creative', 'Lo-fi'];

// Koeffisientene for equalizeren: skuldre i endene, topper i midten.
export function eqCoefs(q, sr) {
  return EQ_BANDS.map((f, i) => biquadCoefs(i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking', f, i === 0 || i === EQ_BANDS.length - 1 ? 0.8 : 1.1, q[`b${i}`] || 0, sr));
}

export const EQ_PRESETS = [
  { id: 'flat', label: 'Flat', g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'voice', label: 'Voice Boost', g: [-6, -4, -1, 0, 0, 1, 3, 4, 2, 1] },
  { id: 'podcast', label: 'Podcast', g: [-8, -3, 1, 0, -1, 0, 2, 3, 2, 0] },
  { id: 'bass', label: 'Bass Boost', g: [6, 5, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: 'bassCut', label: 'Bass Cut', g: [-12, -8, -4, -1, 0, 0, 0, 0, 0, 0] },
  { id: 'treble', label: 'Treble Boost', g: [0, 0, 0, 0, 0, 0, 1, 3, 5, 6] },
  { id: 'trebleCut', label: 'Treble Cut', g: [0, 0, 0, 0, 0, 0, -1, -4, -8, -12] },
  { id: 'loudness', label: 'Loudness', g: [5, 4, 1, 0, -1, 0, 0, 1, 3, 4] },
  { id: 'muddy', label: 'Clear Up Muddy', g: [-2, -2, -4, -5, -2, 0, 1, 2, 2, 1] },
  { id: 'telephone', label: 'Telephone', g: [-18, -18, -12, -2, 2, 4, 2, -6, -18, -18] },
];

// Modulert forsinkelse (chorus og flanger).
function modDelay(p, sr, base, depthSec) {
  const max = Math.ceil(sr * (base + depthSec + 0.01));
  const bl = new Float32Array(max);
  const br = new Float32Array(max);
  let w = 0;
  let ph = 0;
  let q = p;
  const read = (buf, pos) => {
    const i0 = Math.floor(pos);
    const fr = pos - i0;
    return buf[i0 % max] * (1 - fr) + buf[(i0 + 1) % max] * fr;
  };
  return {
    set: (x) => (q = x),
    process(L, R, n) {
      const inc = (TAU * q.rate) / sr;
      const fb = q.feedback || 0;
      for (let i = 0; i < n; i++) {
        const dl = (base + depthSec * q.depth * (0.5 + 0.5 * Math.sin(ph))) * sr;
        const dr = (base + depthSec * q.depth * (0.5 + 0.5 * Math.sin(ph + Math.PI / 2))) * sr;
        const yl = read(bl, w - dl + max * 2);
        const yr = read(br, w - dr + max * 2);
        bl[w] = L[i] + yl * fb;
        br[w] = R[i] + yr * fb;
        L[i] = L[i] * (1 - q.mix * 0.5) + yl * q.mix;
        R[i] = R[i] * (1 - q.mix * 0.5) + yr * q.mix;
        ph += inc;
        w = (w + 1) % max;
      }
      ph %= TAU;
    },
  };
}

// Freeverb: åtte kamfiltre og fire allpass per kanal.
function freeverb(p, sr) {
  const k = sr / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => Math.round(t * k));
  const apT = [556, 441, 341, 225].map((t) => Math.round(t * k));
  const spread = Math.round(23 * k);
  const mk = (ts, off) => ts.map((t) => ({ buf: new Float32Array(t + off), i: 0, store: 0 }));
  const cl = mk(combT, 0);
  const cr = mk(combT, spread);
  const al = mk(apT, 0);
  const ar = mk(apT, spread);
  const preMax = Math.ceil(sr * 0.25);
  const pl = new Float32Array(preMax);
  const pr = new Float32Array(preMax);
  let pw = 0;
  let q = p;
  const comb = (c, x, fb, damp) => {
    const y = c.buf[c.i];
    c.store = y * (1 - damp) + c.store * damp;
    c.buf[c.i] = x + c.store * fb;
    c.i = (c.i + 1) % c.buf.length;
    return y;
  };
  const allpass = (a, x) => {
    const b = a.buf[a.i];
    a.buf[a.i] = x + b * 0.5;
    a.i = (a.i + 1) % a.buf.length;
    return b - x;
  };
  return {
    set: (x) => (q = x),
    process(L, R, n) {
      const fb = 0.7 + q.size * 0.28;
      const damp = q.damping * 0.4;
      const wet1 = q.mix * (q.width / 2 + 0.5);
      const wet2 = q.mix * ((1 - q.width) / 2);
      const dry = 1 - q.mix * 0.5;
      const pd = clamp(Math.round((q.predelay / 1000) * sr), 0, preMax - 1);
      for (let i = 0; i < n; i++) {
        pl[pw] = L[i];
        pr[pw] = R[i];
        const ri = (pw - pd + preMax) % preMax;
        const input = (pl[ri] + pr[ri]) * 0.015;
        pw = (pw + 1) % preMax;
        let ol = 0;
        let or = 0;
        for (let c = 0; c < 8; c++) {
          ol += comb(cl[c], input, fb, damp);
          or += comb(cr[c], input, fb, damp);
        }
        for (let a = 0; a < 4; a++) {
          ol = allpass(al[a], ol);
          or = allpass(ar[a], or);
        }
        const l = L[i];
        const r = R[i];
        L[i] = l * dry + ol * wet1 + or * wet2;
        R[i] = r * dry + or * wet1 + ol * wet2;
      }
    },
  };
}

// Støyfjerning med spektral porting. Støygulvet læres underveis fra de stilleste delene
// (minimumssporing), og hver frekvens dempes etter hvor mye den ligger over gulvet.
// Gir en forsinkelse på én blokk (latency), som eksporten trekker fra.
function spectralDenoiser(sr) {
  const N = 1024;
  const H = N / 4;
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((TAU * i) / N);
  // Normalisering for Hann i både analyse og syntese med 75 % overlapp.
  const norm = 1 / 1.5;
  const bins = N / 2 + 1;
  const ch = [0, 1].map(() => ({
    inBuf: new Float32Array(N),
    outBuf: new Float32Array(N + H),
    fill: 0,
    noise: new Float32Array(bins).fill(-1),
    ps: new Float32Array(bins).fill(-1),
    minE: -1,
    gain: new Float32Array(bins).fill(1),
    re: new Float64Array(N),
    im: new Float64Array(N),
    outQ: new Float32Array(N * 4),
    qr: 0,
    qw: N,
  }));
  let q = { amount: 0.6, floor: -24 };
  let frames = 0;
  const frame = (c) => {
    const { inBuf, re, im, noise, gain } = c;
    for (let i = 0; i < N; i++) {
      re[i] = inBuf[i] * win[i];
      im[i] = 0;
    }
    fft(re, im, false);
    const floor = dbToLin(q.floor);
    const { ps } = c;
    // Støygulvet får bare krype opp i de stilleste blokkene (pausene), så tale ikke læres som støy.
    let E = 0;
    for (let k = 0; k < bins; k++) E += re[k] * re[k] + im[k] * im[k];
    c.minE = c.minE < 0 ? E : E < c.minE ? E : c.minE * 1.003;
    const quiet = E < c.minE * 4;
    for (let k = 0; k < bins; k++) {
      const pw = re[k] * re[k] + im[k] * im[k] + 1e-12;
      // Jevnet effekt per frekvens, og støygulvet som minimum av den: følger raskt ned og kryper
      // sakte opp. Minimum ligger under snittet av støyen, så det justeres opp (bias).
      ps[k] = ps[k] < 0 ? pw : ps[k] * 0.75 + pw * 0.25;
      noise[k] = noise[k] < 0 || ps[k] < noise[k] ? ps[k] : quiet ? noise[k] * 1.0025 : noise[k];
      const est = noise[k] * 2.2;
      // Spektral subtraksjon med litt overtrekk, og et gulv så det ikke blir helt dødt.
      // Mer styrke gir mer overtrekk, så også tilfeldige topper i støyen tas.
      const over = 1.5 + 3.5 * q.amount;
      const g0 = Math.sqrt(Math.max(floor * floor, 1 - (over * est) / pw));
      const g = 1 - Math.min(1, q.amount * 1.1) * (1 - g0);
      // Jevnes ut i tid, så det ikke blir "musikalsk" støy.
      gain[k] = g > gain[k] ? gain[k] * 0.45 + g * 0.55 : gain[k] * 0.6 + g * 0.4;
      re[k] *= gain[k];
      im[k] *= gain[k];
      if (k > 0 && k < N / 2) {
        re[N - k] = re[k];
        im[N - k] = -im[k];
      }
    }
    fft(re, im, true);
    const out = c.outBuf;
    for (let i = 0; i < N; i++) out[i] += re[i] * win[i] * norm;
    // De første H prøvene er ferdige.
    for (let i = 0; i < H; i++) {
      c.outQ[c.qw % c.outQ.length] = out[i];
      c.qw++;
    }
    out.copyWithin(0, H);
    out.fill(0, N);
    inBuf.copyWithin(0, H);
    c.fill = N - H;
  };
  return {
    latency: N,
    set: (x) => (q = x),
    process(L, R, n) {
      [L, R].forEach((buf, ci) => {
        const c = ch[ci];
        for (let i = 0; i < n; i++) {
          c.inBuf[c.fill++] = buf[i];
          if (c.fill === N) frame(c);
          buf[i] = c.outQ[c.qr % c.outQ.length];
          c.outQ[c.qr % c.outQ.length] = 0;
          c.qr++;
        }
      });
      frames += n;
    },
  };
}

/* Kjeden for et klipp */

export function defaultParams(type) {
  const def = AUDIO_EFFECTS[type];
  return Object.fromEntries((def?.params || []).map((x) => [x.id, x.def]));
}

export function makeEffect(type, params = {}) {
  return { id: Math.random().toString(36).slice(2, 8), type, on: true, p: { ...defaultParams(type), ...params } };
}

export function activeEffects(clip) {
  return (clip?.props?.afx || []).filter((e) => e.on !== false && AUDIO_EFFECTS[e.type]);
}

// Mono is Pan and Width at zero width, first in the chain, so playback and export
// share the same code and later effects see the mono signal.
const MONO = { id: 'mono', type: 'stereo', p: { pan: 0, width: 0 } };
export function componentEffects(clip, key) {
  const list = activeEffects(clip);
  return clip?.props?.audioMono?.[key] ? [MONO, ...list] : list;
}

/**
 * En kjede av effekter som kan behandle lyd i blokker. update() tar ny liste og beholder
 * tilstanden til effekter som fortsatt er der (bare parametrene byttes), så det ikke klikker.
 */
export function createChain(sr) {
  let nodes = [];
  return {
    update(list) {
      const next = [];
      for (const e of list) {
        const def = AUDIO_EFFECTS[e.type];
        if (!def || e.on === false) continue;
        const p = { ...defaultParams(e.type), ...e.p };
        let node = nodes.find((x) => x.id === e.id && x.type === e.type);
        if (!node) {
          const inst = def.create(p, sr);
          node = { id: e.id, type: e.type, inst };
        }
        node.inst.set?.(p);
        next.push(node);
      }
      nodes = next;
    },
    get latency() {
      return nodes.reduce((s, x) => s + (x.inst.latency || 0), 0);
    },
    get empty() {
      return nodes.length === 0;
    },
    process(L, R, n) {
      for (const x of nodes) x.inst.process(L, R, n);
      // Sikkerhet: aldri NaN eller uendelig ut.
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(L[i])) L[i] = 0;
        if (!Number.isFinite(R[i])) R[i] = 0;
      }
    },
  };
}

/* Maler: ferdige kjeder for vanlige behov */

const fx = (type, p = {}) => ({ type, p });
export const AUDIO_PRESETS = [
  // Reparasjon
  // Standard i Voice Over Studio: ren, varm og jevn stemme rett ut av boksen.
  { id: 'studio-voice', label: 'Studio Voice', category: 'Repair', desc: 'A clean, warm and even voice over sound: rumble and light noise removed, presence, soft S sounds and steady level.', chain: [fx('highpass', { freq: 80 }), fx('denoise', { amount: 0.35 }), fx('eq', eqParams('podcast')), fx('deesser'), fx('compressor', { threshold: -20, ratio: 3, makeup: 4 }), fx('limiter', { ceiling: -1 })] },
  { id: 'voice-cleanup', label: 'Voice Clean Up', category: 'Repair', desc: 'Removes rumble and background noise, softens S sounds and evens out the level.', chain: [fx('highpass', { freq: 80 }), fx('denoise', { amount: 0.55 }), fx('deesser'), fx('compressor', { threshold: -22, ratio: 2.5, makeup: 3 }), fx('limiter', { ceiling: -1 })] },
  { id: 'podcast', label: 'Podcast Voice', category: 'Repair', desc: 'Warm, clear and present, with steady level.', chain: [fx('highpass', { freq: 90 }), fx('eq', eqParams('podcast')), fx('compressor', { threshold: -24, ratio: 3, makeup: 5 }), fx('deesser'), fx('limiter', { ceiling: -1 })] },
  { id: 'reduce-noise', label: 'Reduce Noise', category: 'Repair', desc: 'Removes steady hiss, fans and air conditioning.', chain: [fx('denoise', { amount: 0.85 })] },
  { id: 'hum50', label: 'Remove Hum (50 Hz)', category: 'Repair', desc: 'Electrical hum in Europe and most of the world.', chain: [fx('hum', { freq: 50 })] },
  { id: 'hum60', label: 'Remove Hum (60 Hz)', category: 'Repair', desc: 'Electrical hum in America and parts of Asia.', chain: [fx('hum', { freq: 60 })] },
  { id: 'rumble', label: 'Remove Rumble', category: 'Repair', desc: 'Removes wind, traffic and handling noise.', chain: [fx('highpass', { freq: 120 })] },
  { id: 'even', label: 'Even Out Levels', category: 'Repair', desc: 'Quiet and loud speech end up at the same level.', chain: [fx('autolevel'), fx('limiter', { ceiling: -1 })] },
  { id: 'loud', label: 'Broadcast Loud', category: 'Repair', desc: 'Dense and loud, without distortion.', chain: [fx('compressor', { threshold: -26, ratio: 4, makeup: 8 }), fx('limiter', { ceiling: -1, gain: 3 })] },
  { id: 'gate', label: 'Quiet Pauses', category: 'Repair', desc: 'Turns down noise between sentences.', chain: [fx('gate', { threshold: -48, range: 20 })] },
  // Rom
  { id: 'room', label: 'Small Room', category: 'Space', desc: 'A natural small room.', chain: [fx('reverb', { size: 0.3, damping: 0.6, mix: 0.18, predelay: 5 })] },
  { id: 'hall', label: 'Concert Hall', category: 'Space', desc: 'A big, warm hall.', chain: [fx('reverb', { size: 0.8, damping: 0.4, mix: 0.3, predelay: 25 })] },
  { id: 'cathedral', label: 'Cathedral', category: 'Space', desc: 'Huge and long.', chain: [fx('reverb', { size: 0.97, damping: 0.25, mix: 0.45, predelay: 40 })] },
  { id: 'canyon', label: 'Canyon Echo', category: 'Space', desc: 'Long echoes that fade out.', chain: [fx('echo', { time: 520, feedback: 0.45, mix: 0.4, tone: 3500 }), fx('reverb', { size: 0.6, mix: 0.15 })] },
  { id: 'slapback', label: 'Slapback', category: 'Space', desc: 'One short, rockabilly style echo.', chain: [fx('echo', { time: 110, feedback: 0.05, mix: 0.4 })] },
  { id: 'faraway', label: 'Far Away', category: 'Space', desc: 'Like someone talking from another room.', chain: [fx('lowpass', { freq: 2200 }), fx('gain', { db: -6 }), fx('reverb', { size: 0.7, damping: 0.7, mix: 0.5 })] },
  // Kreativt og lo-fi
  { id: 'telephone', label: 'Telephone', category: 'Creative', desc: 'A voice on the phone.', chain: [fx('bandpass', { low: 400, high: 3200 }), fx('distortion', { drive: 8, mode: 0, tone: 4000, mix: 0.5, output: -2 }), fx('compressor', { threshold: -20, ratio: 4, makeup: 4 })] },
  { id: 'walkie', label: 'Walkie-Talkie', category: 'Creative', desc: 'Crunchy two way radio.', chain: [fx('bandpass', { low: 600, high: 2600 }), fx('distortion', { drive: 22, mode: 1, tone: 3000, mix: 0.8, output: -8 }), fx('bitcrush', { bits: 10, rate: 16000, mix: 0.5 })] },
  { id: 'radio', label: 'Old Radio', category: 'Lo-fi', desc: 'An AM radio from the forties.', chain: [fx('bandpass', { low: 300, high: 4000 }), fx('lofi', { wobble: 0.2, hiss: 0.4, crackle: 0.15, tone: 4000, saturation: 0.5 })] },
  { id: 'megaphone', label: 'Megaphone', category: 'Creative', desc: 'Shouting through a megaphone.', chain: [fx('bandpass', { low: 700, high: 4500 }), fx('distortion', { drive: 26, mode: 0, tone: 5000, mix: 0.9, output: -10 }), fx('reverb', { size: 0.4, mix: 0.12 })] },
  { id: 'tape', label: 'Lo-fi Tape', category: 'Lo-fi', desc: 'A worn cassette.', chain: [fx('lofi', { wobble: 0.5, hiss: 0.3, crackle: 0, tone: 6000, saturation: 0.4 })] },
  { id: 'vinyl', label: 'Vinyl Record', category: 'Lo-fi', desc: 'Crackle and warmth from an old record.', chain: [fx('lofi', { wobble: 0.15, hiss: 0.1, crackle: 0.6, tone: 7000, saturation: 0.25 })] },
  { id: '8bit', label: '8-bit', category: 'Lo-fi', desc: 'Like an old game console.', chain: [fx('bitcrush', { bits: 5, rate: 8000, mix: 1 })] },
  { id: 'distorted', label: 'Distorted', category: 'Creative', desc: 'Heavy overdrive.', chain: [fx('distortion', { drive: 30, mode: 2, tone: 7000, mix: 1, output: -12 })] },
  { id: 'blown', label: 'Blown Speaker', category: 'Creative', desc: 'A broken, rattling speaker.', chain: [fx('highpass', { freq: 250 }), fx('distortion', { drive: 36, mode: 1, tone: 3000, mix: 1, output: -14 })] },
  { id: 'robot', label: 'Robot', category: 'Creative', desc: 'A metallic robot voice.', chain: [fx('ringmod', { freq: 80, mix: 0.7 }), fx('flanger', { rate: 0.1, depth: 0.3, mix: 0.4, feedback: 0.6 })] },
  { id: 'alien', label: 'Alien', category: 'Creative', desc: 'Strange and wobbly.', chain: [fx('ringmod', { freq: 420, mix: 0.6 }), fx('chorus', { rate: 3, depth: 0.8, mix: 0.6 })] },
  { id: 'underwater', label: 'Underwater', category: 'Creative', desc: 'Muffled, as if under water.', chain: [fx('lowpass', { freq: 600, q: 2 }), fx('chorus', { rate: 0.4, depth: 0.7, mix: 0.5 }), fx('reverb', { size: 0.5, damping: 0.8, mix: 0.3 })] },
  { id: 'dream', label: 'Dreamy', category: 'Creative', desc: 'Wide, soft and floating.', chain: [fx('chorus', { rate: 0.5, depth: 0.6, mix: 0.5 }), fx('reverb', { size: 0.85, mix: 0.4, predelay: 30 })] },
  { id: 'jet', label: 'Jet Flanger', category: 'Creative', desc: 'A sweeping jet sound.', chain: [fx('flanger', { rate: 0.2, depth: 0.9, mix: 0.6, feedback: 0.7 })] },
  { id: 'pulse', label: 'Pulse', category: 'Creative', desc: 'The volume pulses in rhythm.', chain: [fx('tremolo', { rate: 5, depth: 0.8 })] },
];

function eqParams(id) {
  const pr = EQ_PRESETS.find((x) => x.id === id);
  return Object.fromEntries(pr.g.map((g, i) => [`b${i}`, g]));
}
export { eqParams };

export function presetEffects(id) {
  const pr = AUDIO_PRESETS.find((x) => x.id === id);
  return pr ? pr.chain.map((e) => makeEffect(e.type, e.p)) : [];
}
