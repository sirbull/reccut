// Stabilisering: fra bevegelsen mellom bildene (se src/main/motion.js) til en korreksjon per bilde.
// Kameraets bane (forflytning og rotasjon) glattes, og bildet flyttes og roteres fra den rystede
// banen til den glatte. Bildet zoomes akkurat nok til at kantene ikke synes.
//
// Metoder, som i Final Cut Pro:
//   auto    velger selv: står kameraet nesten stille, låses det (tripod), ellers glattes det
//   smooth  glatter banen; skyverne for X, Y og rotasjon sier hvor mye
//   tripod  låser bildet, som om kameraet sto på stativ
//
// Analysen brukes både i forhåndsvisningen og i eksporten, så resultatet blir likt.

const motionData = new Map(); // filsti -> analyse

export function setMotion(path, data) {
  motionData.set(path, prepare(data));
}

export function getMotion(path) {
  return motionData.get(path) || null;
}

export function hasMotion(path) {
  return motionData.has(path);
}

// Banen: summen av bevegelsene fram til hvert bilde.
function prepare(data) {
  const n = data.motions.length;
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  const A = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const m = data.motions[i];
    X[i] = X[i - 1] + m[0];
    Y[i] = Y[i - 1] + m[1];
    A[i] = A[i - 1] + m[2];
  }
  return { ...data, X, Y, A, aspect: data.height ? data.width / data.height : 16 / 9, cache: new Map() };
}

export const STAB_DEFAULTS = { stabMethod: 'auto', stabX: 0.6, stabY: 0.6, stabRot: 0.6, stabZoom: 0 };

function gaussian(src, sigma) {
  const n = src.length;
  if (sigma < 0.5) return Float64Array.from(src);
  const r = Math.ceil(sigma * 3);
  const k = new Float64Array(r * 2 + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let j = -r; j <= r; j++) {
      // Ved kantene speiles banen, så den glatte banen ikke trekkes mot null.
      let t = i + j;
      if (t < 0) t = -t;
      if (t >= n) t = 2 * (n - 1) - t;
      t = Math.max(0, Math.min(n - 1, t));
      v += src[t] * k[j + r];
    }
    out[i] = v;
  }
  return out;
}

// Glattingen i bilder: skyveren 0 til 1 gir opptil to sekunder.
const sigmaFor = (amount, fps) => Math.pow(Math.max(0, Math.min(1, amount)), 1.5) * 2 * fps;

function rangeOf(d, clip) {
  const i0 = Math.max(0, Math.floor((clip.in || 0) * d.fps));
  const i1 = Math.min(d.X.length - 1, Math.ceil(((clip.in || 0) + clip.dur * (clip.speed || 1)) * d.fps));
  return [i0, Math.max(i0, i1)];
}

// Hvor mye kameraet beveger seg i klippet, i brøkdeler av bredden.
function spread(d, i0, i1) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = i0; i <= i1; i++) {
    minX = Math.min(minX, d.X[i]);
    maxX = Math.max(maxX, d.X[i]);
    minY = Math.min(minY, d.Y[i]);
    maxY = Math.max(maxY, d.Y[i]);
  }
  return Math.max(maxX - minX, maxY - minY);
}

export function resolvedMethod(d, clip) {
  const method = clip.props?.stabMethod || 'auto';
  if (method !== 'auto') return method;
  const [i0, i1] = rangeOf(d, clip);
  // Et kamera som nesten står stille (under 4 % av bredden) låses; ellers glattes bevegelsen.
  return spread(d, i0, i1) < 0.04 ? 'tripod' : 'smooth';
}

/**
 * Korreksjonen for hele analysen, for disse innstillingene. Gir { cx, cy, ca, zoom } som tabeller
 * (cx og cy i brøkdeler av bredden, ca i radianer) og den automatiske zoomen for klippet.
 */
export function corrections(d, clip) {
  const p = { ...STAB_DEFAULTS, ...clip.props };
  const method = resolvedMethod(d, clip);
  const [i0, i1] = rangeOf(d, clip);
  const key = `${method}|${p.stabX}|${p.stabY}|${p.stabRot}|${i0}-${i1}`;
  const hit = d.cache.get(key);
  if (hit) return hit;
  const n = d.X.length;
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  const ca = new Float64Array(n);
  if (method === 'tripod') {
    // Låst til midten av klippet: all bevegelse i klippet fjernes.
    const mid = Math.round((i0 + i1) / 2);
    for (let i = 0; i < n; i++) {
      cx[i] = d.X[mid] - d.X[i];
      cy[i] = d.Y[mid] - d.Y[i];
      ca[i] = d.A[mid] - d.A[i];
    }
  } else {
    const sx = gaussian(d.X, sigmaFor(p.stabX, d.fps));
    const sy = gaussian(d.Y, sigmaFor(p.stabY, d.fps));
    const sa = gaussian(d.A, sigmaFor(p.stabRot, d.fps));
    for (let i = 0; i < n; i++) {
      cx[i] = p.stabX > 0 ? sx[i] - d.X[i] : 0;
      cy[i] = p.stabY > 0 ? sy[i] - d.Y[i] : 0;
      ca[i] = p.stabRot > 0 ? sa[i] - d.A[i] : 0;
    }
  }
  // Zoom som dekker hele bildet gjennom klippet: rotasjon krever litt, forflytning resten.
  const ratio = Math.max(d.aspect, 1 / d.aspect);
  let zoom = 1;
  for (let i = i0; i <= i1; i++) {
    const a = Math.abs(ca[i]);
    const z = Math.cos(a) + Math.sin(a) * ratio + 2 * Math.max(Math.abs(cx[i]), Math.abs(cy[i]) * d.aspect);
    if (z > zoom) zoom = z;
  }
  // Litt ekstra, fordi rotasjon og forflytning påvirker hverandre ved kantene.
  const res = { cx, cy, ca, zoom: Math.min(2, zoom > 1.0001 ? zoom * 1.015 : 1), method };
  if (d.cache.size > 24) d.cache.delete(d.cache.keys().next().value);
  d.cache.set(key, res);
  return res;
}

/**
 * Korreksjonen ved kildetiden s, med glidende overgang mellom bildene.
 * Gir { x, y, a, zoom } (x og y i brøkdeler av bredden) eller null når klippet ikke stabiliseres.
 */
export function stabilizeAt(clip, path, s) {
  if (!clip.props?.stabilize) return null;
  const d = motionData.get(path);
  if (!d) return null;
  const c = corrections(d, clip);
  const f = Math.max(0, Math.min(d.X.length - 1, s * d.fps));
  const i = Math.floor(f);
  const j = Math.min(d.X.length - 1, i + 1);
  const k = f - i;
  const lerp = (arr) => arr[i] * (1 - k) + arr[j] * k;
  const manual = clip.props.stabZoom || 0;
  return { x: lerp(c.cx), y: lerp(c.cy), a: lerp(c.ca), zoom: manual > 0 ? 1 + manual : c.zoom, auto: c.zoom, method: c.method };
}

// Hvor mye bildet rister: gjennomsnittlig forskjell mellom bevegelsen og den glatte banen (til tester og visning).
export function shakiness(data) {
  const d = prepare(data);
  const sx = gaussian(d.X, d.fps * 0.5);
  const sy = gaussian(d.Y, d.fps * 0.5);
  let sum = 0;
  for (let i = 0; i < d.X.length; i++) sum += Math.hypot(d.X[i] - sx[i], d.Y[i] - sy[i]);
  return sum / Math.max(1, d.X.length);
}
