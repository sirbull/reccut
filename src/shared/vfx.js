// Effektstabel for bilde: effektene behandles ovenfra og ned, og samme effekt kan brukes flere
// ganger (for eksempel to keyere etter hverandre). Brukes likt i visningen og eksporten.
// clip.props.vfx = [{ id, type, on, p: { parametre } }]
//
// Keyeren fjerner en ensfarget bakgrunn (grønn, blå eller hvilken som helst farge). Den bruker
// fargeforskjell for grønne og blå skjermer, som gir rene kanter i hår og bevegelse, og avstand
// i fargerommet for andre farger. Etterpå kan matten strammes, gjøres myk og ryddes, og fargesøl
// (grønt skjær på kantene) fjernes.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const VIDEO_FX = {
  keyer: {
    label: 'Keyer',
    category: 'Keying',
    desc: 'Removes a green, blue or other solid color background.',
    params: [
      { id: 'color', label: 'Key color', type: 'color', def: '#00b140' },
      { id: 'strength', label: 'Strength', min: 0, max: 1, def: 0.55, step: 0.01, unit: '%', scale: 100 },
      { id: 'softness', label: 'Edge softness', min: 0, max: 1, def: 0.35, step: 0.01, unit: '%', scale: 100 },
      { id: 'despill', label: 'Spill removal', min: 0, max: 1, def: 0.75, step: 0.01, unit: '%', scale: 100 },
      // Avansert
      { id: 'balance', label: 'Screen balance', min: 0, max: 1, def: 0.5, step: 0.01, unit: '%', scale: 100, advanced: true },
      { id: 'clipBlack', label: 'Clip black', min: 0, max: 0.6, def: 0.05, step: 0.01, unit: '%', scale: 100, advanced: true },
      { id: 'clipWhite', label: 'Clip white', min: 0.4, max: 1, def: 0.95, step: 0.01, unit: '%', scale: 100, advanced: true },
      { id: 'choke', label: 'Shrink or grow', min: -10, max: 10, def: 0, step: 0.1, unit: 'px', advanced: true, center: 0 },
      { id: 'feather', label: 'Feather', min: 0, max: 20, def: 0.5, step: 0.1, unit: 'px', advanced: true },
      { id: 'spillLuma', label: 'Keep spill brightness', min: 0, max: 1, def: 0.5, step: 0.01, unit: '%', scale: 100, advanced: true },
      { id: 'shadows', label: 'Keep dark areas', min: 0, max: 1, def: 0.2, step: 0.01, unit: '%', scale: 100, advanced: true },
      { id: 'view', label: 'View', type: 'choice', def: 'final', choices: ['final', 'matte', 'source'], labels: ['Final', 'Matte', 'Source'], advanced: true },
    ],
  },
  lumaKey: {
    label: 'Luma Key',
    category: 'Keying',
    desc: 'Removes dark or bright areas, for example a black background.',
    params: [
      { id: 'mode', label: 'Remove', type: 'choice', def: 'dark', choices: ['dark', 'bright'], labels: ['Dark', 'Bright'] },
      { id: 'threshold', label: 'Threshold', min: 0, max: 1, def: 0.15, step: 0.01, unit: '%', scale: 100 },
      { id: 'softness', label: 'Softness', min: 0, max: 1, def: 0.15, step: 0.01, unit: '%', scale: 100 },
      { id: 'view', label: 'View', type: 'choice', def: 'final', choices: ['final', 'matte'], labels: ['Final', 'Matte'], advanced: true },
    ],
  },
  despill: {
    label: 'Despill',
    category: 'Keying',
    desc: 'Removes green or blue spill from hair and edges.',
    params: [
      { id: 'screen', label: 'Screen', type: 'choice', def: 'green', choices: ['green', 'blue'], labels: ['Green', 'Blue'] },
      { id: 'amount', label: 'Amount', min: 0, max: 1, def: 0.8, step: 0.01, unit: '%', scale: 100 },
      { id: 'spillLuma', label: 'Keep brightness', min: 0, max: 1, def: 0.5, step: 0.01, unit: '%', scale: 100 },
    ],
  },
  matte: {
    label: 'Matte Cleanup',
    category: 'Keying',
    desc: 'Shrink, grow, soften and clean the transparency from a key.',
    params: [
      { id: 'clipBlack', label: 'Clip black', min: 0, max: 0.6, def: 0.05, step: 0.01, unit: '%', scale: 100 },
      { id: 'clipWhite', label: 'Clip white', min: 0.4, max: 1, def: 0.95, step: 0.01, unit: '%', scale: 100 },
      { id: 'choke', label: 'Shrink or grow', min: -10, max: 10, def: 0, step: 0.1, unit: 'px', center: 0 },
      { id: 'feather', label: 'Feather', min: 0, max: 20, def: 1, step: 0.1, unit: 'px' },
      { id: 'invert', label: 'Invert', type: 'toggle', def: false },
    ],
  },
  bgRemove: {
    label: 'Remove Background',
    category: 'Keying',
    desc: 'For a camera that stands still: removes everything that matches the empty background.',
    params: [
      { id: 'threshold', label: 'Sensitivity', min: 0, max: 1, def: 0.5, step: 0.01, unit: '%', scale: 100 },
      { id: 'softness', label: 'Edge softness', min: 0, max: 1, def: 0.4, step: 0.01, unit: '%', scale: 100 },
      { id: 'shadows', label: 'Ignore shadows', min: 0, max: 1, def: 0.6, step: 0.01, unit: '%', scale: 100 },
      { id: 'choke', label: 'Shrink or grow', min: -10, max: 10, def: 0.5, step: 0.1, unit: 'px', center: 0, advanced: true },
      { id: 'feather', label: 'Feather', min: 0, max: 20, def: 1.5, step: 0.1, unit: 'px', advanced: true },
      { id: 'fill', label: 'Fill holes', min: 0, max: 1, def: 0.5, step: 0.01, unit: '%', scale: 100, advanced: true },
      { id: 'view', label: 'View', type: 'choice', def: 'final', choices: ['final', 'matte', 'plate'], labels: ['Final', 'Matte', 'Background'], advanced: true },
    ],
  },
};

export function vfxDefaults(type) {
  return Object.fromEntries((VIDEO_FX[type]?.params || []).map((p) => [p.id, p.def]));
}

export function makeVfx(type, p = {}) {
  return { id: Math.random().toString(36).slice(2, 8), type, on: true, p: { ...vfxDefaults(type), ...p } };
}

export function activeVfx(clip) {
  return (clip?.props?.vfx || []).filter((e) => e.on !== false && VIDEO_FX[e.type]);
}

export function hexToRgb(hex) {
  const n = parseInt(String(hex || '#00b140').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

/* Matte-verktøy på en alfakanal (Float32Array, 0 til 1) */

// Rask boksuskarphet i to retninger, tre ganger (nesten gaussisk).
function boxBlur(a, w, h, r) {
  r = Math.round(r);
  if (r < 1) return a;
  const tmp = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[o + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = sum / (2 * r + 1);
        sum += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / (2 * r + 1);
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

// Klipp, krymp eller utvid, og myk kant. px er antall piksler i bildet som behandles.
function cleanMatte(a, w, h, { clipBlack = 0, clipWhite = 1, choke = 0, feather = 0, scale = 1 }) {
  if (clipBlack > 0 || clipWhite < 1) {
    const lo = clipBlack;
    const hi = Math.max(lo + 0.01, clipWhite);
    for (let i = 0; i < a.length; i++) a[i] = clamp((a[i] - lo) / (hi - lo), 0, 1);
  }
  const ck = choke * scale;
  if (Math.abs(ck) >= 0.5) {
    const b = boxBlur(Float32Array.from(a), w, h, Math.abs(ck) / 1.5);
    if (ck > 0) for (let i = 0; i < a.length; i++) a[i] = Math.min(a[i], smooth(0.62, 1, b[i]));
    else for (let i = 0; i < a.length; i++) a[i] = Math.max(a[i], smooth(0, 0.38, b[i]));
  }
  const f = feather * scale;
  if (f >= 0.5) boxBlur(a, w, h, f / 1.7);
  return a;
}

/* Keyeren */

function keyerMatte(d, w, h, p) {
  const K = hexToRgb(p.color).map((v) => v / 255);
  const dom = K[1] >= K[0] && K[1] >= K[2] ? 1 : K[2] >= K[0] ? 2 : 0;
  const o1 = (dom + 1) % 3;
  const o2 = (dom + 2) % 3;
  const other = (c, i) => {
    const a = c[i + o1];
    const b = c[i + o2];
    // Skjermbalanse: mellom det største og snittet av de to andre kanalene.
    return Math.max(a, b) * (1 - p.balance) + ((a + b) / 2) * p.balance;
  };
  const kArr = [K[0], K[1], K[2]];
  const keyDiff = kArr[dom] - other(kArr, 0);
  // Er nøkkelfargen lite mettet (for eksempel grå), brukes avstand i fargeplanet i stedet.
  const useDiff = keyDiff > 0.12;
  const kCb = -0.1687 * K[0] - 0.3313 * K[1] + 0.5 * K[2];
  const kCr = 0.5 * K[0] - 0.4187 * K[1] - 0.0813 * K[2];
  const kY = 0.299 * K[0] + 0.587 * K[1] + 0.114 * K[2];
  const hi = 1.15 - p.strength * 0.75;
  const lo = hi - (0.04 + p.softness * 0.55);
  const a = new Float32Array(w * h);
  const px = [0, 0, 0];
  for (let i = 0, j = 0; j < a.length; i += 4, j++) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    let s;
    if (useDiff) {
      px[0] = r;
      px[1] = g;
      px[2] = b;
      const diff = px[dom] - other(px, 0);
      // Forholdet til lysstyrken, så skygger i skjermen også fjernes. Helt mørke piksler
      // bruker den vanlige forskjellen, som er stabil (svart hår blir ikke borte).
      const sAbs = diff / keyDiff;
      const sRatio = diff / Math.max(px[dom], 1e-3) / (keyDiff / K[dom]);
      const wgt = smooth(0.05, 0.22, px[dom]);
      s = sAbs + (sRatio - sAbs) * wgt;
    } else {
      const cb = -0.1687 * r - 0.3313 * g + 0.5 * b;
      const cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      s = 1 - Math.hypot(cb - kCb, cr - kCr, (y - kY) * 0.35) * 3;
    }
    let al = 1 - smooth(lo, hi, s);
    // Mørke områder (skygger i skjermen telles ikke, men svarte klær beholdes).
    if (p.shadows > 0) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const dark = smooth(0.18, 0.02, y) * p.shadows;
      al = Math.max(al, dark * (useDiff ? clamp(1 - s, 0, 1) : 1));
    }
    a[j] = al * (d[i + 3] / 255);
  }
  return { a, K, dom, o1, o2 };
}

function despill(d, n, dom, o1, o2, amount, keepLuma) {
  if (amount <= 0) return;
  for (let i = 0; i < n * 4; i += 4) {
    const lim = Math.max(d[i + o1], d[i + o2]) * 0.5 + ((d[i + o1] + d[i + o2]) / 2) * 0.5;
    const ex = d[i + dom] - lim;
    if (ex <= 0) continue;
    const take = ex * amount;
    d[i + dom] -= take;
    // Litt av lysstyrken legges tilbake jevnt, så kantene ikke blir mørke.
    const back = take * keepLuma * 0.5;
    d[i] += back;
    d[i + 1] += back;
    d[i + 2] += back;
    d[i + dom] -= back;
  }
}

function applyAlpha(d, a, view) {
  if (view === 'matte') {
    for (let i = 0, j = 0; j < a.length; i += 4, j++) {
      const v = a[j] * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    return;
  }
  for (let i = 3, j = 0; j < a.length; i += 4, j++) d[i] = a[j] * 255;
}

const alphaOf = (d, n) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3] / 255;
  return a;
};

/**
 * Kjører stabelen på et bilde (ImageData). scale: hvor mange piksler én piksel i et 1080p-bilde
 * tilsvarer, så kantinnstillingene ser like ut i visningen og eksporten.
 * ctx gir tilgang til bakgrunnsbildet for Remove Background: { plate: ImageData eller null }.
 */
export function processVfx(img, list, { scale = 1, plate = null } = {}) {
  const { data: d, width: w, height: h } = img;
  const n = w * h;
  for (const e of list) {
    const p = { ...vfxDefaults(e.type), ...e.p };
    if (e.type === 'keyer') {
      if (p.view === 'source') continue;
      const { a, dom, o1, o2 } = keyerMatte(d, w, h, p);
      cleanMatte(a, w, h, { ...p, scale });
      despill(d, n, dom, o1, o2, p.despill, p.spillLuma);
      applyAlpha(d, a, p.view);
    } else if (e.type === 'lumaKey') {
      const a = new Float32Array(n);
      const t = p.threshold;
      const s = Math.max(0.01, p.softness);
      for (let i = 0, j = 0; j < n; i += 4, j++) {
        const y = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const v = p.mode === 'dark' ? smooth(t, t + s, y) : 1 - smooth(1 - t - s, 1 - t, y);
        a[j] = v * (d[i + 3] / 255);
      }
      applyAlpha(d, a, p.view);
    } else if (e.type === 'despill') {
      const dom = p.screen === 'blue' ? 2 : 1;
      despill(d, n, dom, (dom + 1) % 3, (dom + 2) % 3, p.amount, p.spillLuma);
    } else if (e.type === 'matte') {
      const a = alphaOf(d, n);
      if (p.invert) for (let i = 0; i < n; i++) a[i] = 1 - a[i];
      cleanMatte(a, w, h, { ...p, scale });
      applyAlpha(d, a, 'final');
    } else if (e.type === 'bgRemove') {
      if (!plate || plate.width !== w || plate.height !== h) continue;
      const pd = plate.data;
      if (p.view === 'plate') {
        d.set(pd);
        continue;
      }
      const a = new Float32Array(n);
      const t = 0.02 + (1 - p.threshold) * 0.25;
      const soft = 0.01 + p.softness * 0.15;
      // Forskjellen mot bakgrunnen, og mot nabopunktene i den: små forskyvninger ved skarpe
      // kanter (skalering og komprimering) gir da ikke tynne linjer.
      const diffAt = (i, k) => {
        const r = d[i] / 255;
        const g = d[i + 1] / 255;
        const b = d[i + 2] / 255;
        const pr = pd[k] / 255;
        const pg = pd[k + 1] / 255;
        const pb = pd[k + 2] / 255;
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        const py = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        // Forskjell i farge teller fullt. Forskjell i bare lysstyrke (skygger) teller mindre.
        const dc = Math.hypot(r - y - (pr - py), g - y - (pg - py), b - y - (pb - py));
        let dl = y - py;
        if (dl < 0) dl *= 1 - p.shadows * 0.85;
        return Math.hypot(dc * 1.6, dl);
      };
      for (let y = 0, j = 0; y < h; y++) {
        for (let x = 0; x < w; x++, j++) {
          const i = j * 4;
          let diff = diffAt(i, i);
          if (diff > t) {
            if (x > 0) diff = Math.min(diff, diffAt(i, i - 4));
            if (x < w - 1) diff = Math.min(diff, diffAt(i, i + 4));
            if (y > 0) diff = Math.min(diff, diffAt(i, i - w * 4));
            if (y < h - 1) diff = Math.min(diff, diffAt(i, i + w * 4));
          }
          a[j] = smooth(t, t + soft, diff);
        }
      }
      // Fyll små hull i personen, og fjern små flekker i bakgrunnen.
      if (p.fill > 0) {
        const r = Math.max(1, 3 * scale * (0.5 + p.fill));
        const b = boxBlur(Float32Array.from(a), w, h, r);
        for (let i = 0; i < n; i++) a[i] = clamp(a[i] * 0.4 + smooth(0.35, 0.65, b[i]) * 0.6 + (b[i] > 0.6 ? 0.3 * p.fill : 0), 0, 1);
      }
      cleanMatte(a, w, h, { choke: p.choke, feather: p.feather, scale });
      for (let i = 0; i < n; i++) a[i] *= d[i * 4 + 3] / 255;
      applyAlpha(d, a, p.view);
    }
  }
  return img;
}

/* Ett klikk: finn bakgrunnsfargen fra kantene av bildet. Gir hex eller null. */
export function guessKeyColor(img) {
  const { data: d, width: w, height: h } = img;
  const bins = new Map();
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.12));
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (x > band && x < w - band && y > band && y < h - band) continue;
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      if (mx < 40 || mx - mn < mx * 0.25) continue;
      let hue;
      if (mx === r) hue = ((g - b) / (mx - mn)) % 6;
      else if (mx === g) hue = (b - r) / (mx - mn) + 2;
      else hue = (r - g) / (mx - mn) + 4;
      const k = Math.round(((hue * 60 + 360) % 360) / 15);
      const e = bins.get(k) || [];
      e.push([r, g, b, mx]);
      bins.set(k, e);
    }
  }
  const best = [...bins.values()].sort((a, b) => b.length - a.length)[0];
  if (!best || best.length < 20) return null;
  // Den lyseste halvdelen: selve skjermen, ikke skyggene i den.
  best.sort((a, b) => b[3] - a[3]);
  const top = best.slice(0, Math.max(1, Math.ceil(best.length / 2)));
  const avg = [0, 1, 2].map((c) => top.reduce((s2, v) => s2 + v[c], 0) / top.length);
  return rgbToHex(avg);
}
