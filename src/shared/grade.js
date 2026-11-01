// Fargekorrigering på skjermkortet (WebGL2). Bildet lastes opp som 16-bit flyttall, så 10-bit
// opptak beholder presisjonen gjennom hele korrigeringen, og alt regnes i flyttall før resultatet
// tegnes. Brukes likt i forhåndsvisningen og eksporten.
import { CAMERA_COLOR_PROPS, valueAt } from './model.js';
import { bakeFilm } from './filmLooks.js';

// Parametre og standardverdier. Alle kan ha nøkkelbilder.
export const GRADE_PROPS = {
  exposure: 0, // blendertrinn delt på to: 1 er +2 trinn
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  // Fargehjul: x og y er fargen (punkt i hjulet), l er lysstyrken for området.
  liftX: 0,
  liftY: 0,
  liftL: 0,
  gammaX: 0,
  gammaY: 0,
  gammaL: 0,
  gainX: 0,
  gainY: 0,
  gainL: 0,
  filmMix: 0, // styrken på filmlooken i clip.props.film, 0 til 1 (se filmLooks.js)
};

export function gradeParams(clip, T, target = 'main') {
  const out = {};
  let active = false;
  for (const [k, def] of Object.entries(GRADE_PROPS)) {
    const v = valueAt(clip, k, T) ?? def;
    out[k] = v || 0;
    if (out[k]) active = true;
  }
  // Opptakets kamerakorrigering kommer i tillegg til den felles korrigeringen.
  // Gamle prosjekter uten disse egenskapene beholder det samme bildet.
  if (clip.type === 'recording' && target === 'camera') {
    for (const key of Object.keys(CAMERA_COLOR_PROPS)) {
      const prop = key[6].toLowerCase() + key.slice(7);
      const v = valueAt(clip, key, T) || 0;
      if (prop === 'contrast' || prop === 'saturation') out[prop] = (1 + out[prop]) * (1 + v) - 1;
      else out[prop] += v;
      if (v) active = true;
    }
  }
  // Uten styrke satt (for eksempel fra AI-agenten) gjelder looken fullt.
  if (bakeFilm(clip.props.film)) {
    out.film = clip.props.film;
    out.filmMix = valueAt(clip, 'filmMix', T) ?? 1;
    active ||= out.filmMix > 0;
  }
  return active ? out : null;
}

// Kamera-LUT per mediefil (media.cameraLut): en innebygd LOG-kurve eller stien til en .cube-fil.
// LOG-kurvene gjøres om til lineært lys, fargeskalaen til Rec. 709, og høylysene rulles mykt av.
// Kurvene er fra produsentenes egne dokumenter. Primærfargene er xy for rød, grønn og blå (hvitpunkt D65).
const REC2020 = [0.708, 0.292, 0.17, 0.797, 0.131, 0.046];
export const CAMERA_LOGS = [
  { id: 'apple-log', label: 'Apple Log', mode: 1, primaries: REC2020 },
  { id: 'slog3', label: 'Sony S-Log3 / S-Gamut3.Cine', mode: 2, primaries: [0.766, 0.275, 0.225, 0.8, 0.089, -0.087] },
  { id: 'vlog', label: 'Panasonic V-Log / V-Gamut', mode: 3, primaries: [0.73, 0.28, 0.165, 0.84, 0.1, -0.03] },
  { id: 'flog', label: 'Fujifilm F-Log / F-Gamut', mode: 4, primaries: REC2020 },
  { id: 'logc3', label: 'ARRI LogC3 / AWG3', mode: 5, primaries: [0.684, 0.313, 0.221, 0.848, 0.0861, -0.102] },
];

// RGB til XYZ fra primærfargene (standard utledning), og videre til lineær Rec. 709.
function rgbToXyz([rx, ry, gx, gy, bx, by]) {
  const W = [0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329];
  const P = [
    [rx / ry, gx / gy, bx / by],
    [1, 1, 1],
    [(1 - rx - ry) / ry, (1 - gx - gy) / gy, (1 - bx - by) / by],
  ];
  const S = mul3(inv3(P), W.map((v) => [v])).map((r) => r[0]);
  return P.map((row) => row.map((v, j) => v * S[j]));
}
function inv3(m) {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = f * g - d * i, C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, (c * h - b * i) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, (c * d - a * f) / det],
    [C / det, (b * g - a * h) / det, (a * e - b * d) / det],
  ];
}
function mul3(a, b) {
  return a.map((row) => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
}
const REC709 = [0.64, 0.33, 0.3, 0.6, 0.15, 0.06];
export function gamutToRec709(primaries) {
  return mul3(inv3(rgbToXyz(REC709)), rgbToXyz(primaries));
}

// .cube-filer (3D). Holdes i minnet etter stien, som bevegelsesanalysene i stabilize.js.
const luts = new Map();
export function parseCube(text) {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const data = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === 'LUT_3D_SIZE') size = Number(rest[0]);
    else if (key === 'LUT_1D_SIZE') throw new Error('Only 3D LUTs are supported.');
    else if (key === 'DOMAIN_MIN') min = rest.map(Number);
    else if (key === 'DOMAIN_MAX') max = rest.map(Number);
    else if (/^[-+.\d]/.test(key)) data.push(Number(key), ...rest.slice(0, 2).map(Number));
  }
  if (!size || data.length !== size ** 3 * 3) throw new Error('This is not a valid .cube LUT.');
  return { size, min, max, data: new Float32Array(data) };
}
export function setLut(path, text) {
  luts.set(path, { ...parseCube(text), tex: null });
}
export function hasLut(path) {
  return luts.has(path);
}

// Fargen i hjulet som RGB-forskyvning med samme lysstyrke (summen påvirker bare fargen).
export function wheelOffset(x, y) {
  const amt = Math.min(1, Math.hypot(x, y));
  if (!amt) return [0, 0, 0];
  const a = Math.atan2(y, x);
  // Rød øverst til høyre, grønn nede, blå til venstre, som i fargehjul i Final Cut Pro.
  const r = Math.cos(a - Math.PI / 6);
  const g = Math.cos(a - (Math.PI / 6 + (2 * Math.PI) / 3));
  const b = Math.cos(a - (Math.PI / 6 + (4 * Math.PI) / 3));
  const m = (r + g + b) / 3;
  return [(r - m) * amt, (g - m) * amt, (b - m) * amt];
}

const VS = `#version 300 es
in vec2 p;
out vec2 uv;
void main() {
  uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 o;
uniform sampler2D img;
uniform highp sampler3D lut;
uniform int camMode;
uniform mat3 camGamut;
uniform vec3 lutMin, lutMax;
uniform float lutSize;
uniform highp sampler3D film;
uniform float filmMix;
uniform float exposure, contrast, highlights, shadows, saturation;
uniform vec3 wb, lift, gammaV, gain;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toGam(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
// LOG-kode (0 til 1, kodeverdi delt på 1023) til lineært lys.
float decodeLog(float x) {
  if (camMode == 1) { // Apple Log
    float pt = 47.28711236 * pow(0.01 + 0.05641088, 2.0);
    return x >= pt ? exp2((x - 0.69336945) / 0.08550479) - 0.00964052 : sqrt(max(x, 0.0) / 47.28711236) - 0.05641088;
  }
  if (camMode == 2) { // S-Log3
    float cv = x * 1023.0;
    return cv >= 171.2102946929 ? pow(10.0, (cv - 420.0) / 261.5) * 0.19 - 0.01 : (cv - 95.0) * 0.01125 / (171.2102946929 - 95.0);
  }
  if (camMode == 3) return x < 0.181 ? (x - 0.125) / 5.6 : pow(10.0, (x - 0.598206) / 0.241514) - 0.00873; // V-Log
  if (camMode == 4) return x >= 0.100537775223865 ? (pow(10.0, (x - 0.790453) / 0.344676) - 0.009468) / 0.555556 : (x - 0.092864) / 8.735631; // F-Log
  return x > 0.149658 ? (pow(10.0, (x - 0.385537) / 0.24719) - 0.052272) / 5.555556 : (x - 0.092809) / 5.367655; // LogC3 (EI 800)
}
// Myk skulder: lik inn til 0.6, deretter mot 1 uten knekk.
vec3 shoulder(vec3 x) { return mix(x, 0.6 + 0.4 * (1.0 - exp(-(x - 0.6) / 0.4)), step(0.6, x)); }
vec3 camera(vec3 c) {
  if (camMode == 6) return texture(lut, ((c - lutMin) / (lutMax - lutMin)) * ((lutSize - 1.0) / lutSize) + 0.5 / lutSize).rgb;
  // ponytail: tar for gitt videonivåer (64 til 940), som kameraene tar opp med. Filer i fullt nivå blir litt for lyse i sortene; bruk LUT-en fra produsenten da.
  vec3 x = (c * 876.0 + 64.0) / 1023.0;
  vec3 l = camGamut * vec3(decodeLog(x.r), decodeLog(x.g), decodeLog(x.b));
  return toGam(shoulder(max(l, 0.0)));
}
void main() {
  vec4 t = texture(img, uv);
  vec3 c = t.rgb;
  if (camMode > 0) c = camera(c);
  // Lineært lys: eksponering og hvitbalanse.
  vec3 l = toLin(c) * exp2(exposure * 2.0) * wb;
  c = toGam(l);
  // Høylys og skygger: myke vekter etter lysstyrken.
  float y = dot(c, LUMA);
  float wS = 1.0 - smoothstep(0.0, 0.55, y);
  float wH = smoothstep(0.45, 1.0, y);
  c += c * shadows * 0.6 * wS;
  c -= c * highlights * -0.45 * wH;
  // Fargehjul: lift (skygger), gamma (mellomtoner), gain (høylys).
  c = c + lift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / max(gammaV, vec3(0.05)));
  c = c * gain;
  // Kontrast rundt midtgrått, og metning som bevarer lysstyrken.
  c = (c - 0.5) * (1.0 + contrast) + 0.5;
  y = dot(c, LUMA);
  c = mix(vec3(y), c, max(0.0, 1.0 + saturation));
  c = clamp(c, 0.0, 1.0);
  // Filmlooken til slutt, som en kreativ LUT (33 punkter per kanal).
  if (filmMix > 0.0) c = mix(c, texture(film, c * (32.0 / 33.0) + 0.5 / 33.0).rgb, filmMix);
  o = vec4(c, t.a);
}`;

let gl = null;
let canvas = null;
let prog = null;
let tex = null;
let failed = false;
const loc = {};

function upload3D(lut) {
  lut.tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, lut.tex);
  for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, k, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Rødt varierer raskest i .cube-filer, som x i teksturen.
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, lut.data);
}

function setup() {
  if (gl || failed) return gl;
  try {
    canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : document.createElement('canvas');
    gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 is not available');
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['img', 'lut', 'camMode', 'camGamut', 'lutMin', 'lutMax', 'lutSize', 'film', 'filmMix', 'exposure', 'contrast', 'highlights', 'shadows', 'saturation', 'wb', 'lift', 'gammaV', 'gain']) loc[n] = gl.getUniformLocation(prog, n);
    // LUT-en på enhet 1: to samplere av ulik type kan ikke dele enhet i WebGL.
    gl.uniform1i(loc.lut, 1);
    gl.uniform1i(loc.film, 2);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  } catch (err) {
    console.warn('Color correction falls back to 2D filters:', err.message);
    failed = true;
    gl = null;
  }
  return gl;
}

export function gpuGradeAvailable() {
  return Boolean(setup());
}

const MAX = 4096;

/**
 * Korrigerer bildet og gir et lerret med resultatet, eller null hvis WebGL2 mangler.
 * Lerretet gjenbrukes, så det må tegnes med en gang. cameraLut: se CAMERA_LOGS og setLut.
 */
export function gradeImage(img, w, h, g, cameraLut = null) {
  if (!setup()) return null;
  g = g || Object.fromEntries(Object.keys(GRADE_PROPS).map((k) => [k, 0]));
  const s = Math.min(1, MAX / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s));
  const ch = Math.max(1, Math.round(h * s));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  gl.viewport(0, 0, cw, ch);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  try {
    // 16-bit flyttall: 10-bit kilder mister ikke presisjon før korrigeringen.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, img);
  } catch {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }
  const lift = wheelOffset(g.liftX, g.liftY).map((v) => v * 0.25 + g.liftL * 0.25);
  const gam = wheelOffset(g.gammaX, g.gammaY).map((v) => 1 + v * 0.5 + g.gammaL * 0.5);
  const gain = wheelOffset(g.gainX, g.gainY).map((v) => 1 + v * 0.5 + g.gainL * 0.5);
  // Temperatur: varmere gir mer rødt og mindre blått. Tint: grønt eller magenta.
  const wb = [1 + 0.3 * g.temperature, 1 - 0.25 * g.tint, 1 - 0.3 * g.temperature];
  gl.uniform1i(loc.img, 0);
  gl.uniform1f(loc.exposure, g.exposure);
  gl.uniform1f(loc.contrast, g.contrast);
  gl.uniform1f(loc.highlights, g.highlights);
  gl.uniform1f(loc.shadows, g.shadows);
  gl.uniform1f(loc.saturation, g.saturation);
  gl.uniform3fv(loc.wb, wb);
  gl.uniform3fv(loc.lift, lift);
  gl.uniform3fv(loc.gammaV, gam);
  gl.uniform3fv(loc.gain, gain);
  const log = CAMERA_LOGS.find((x) => x.id === cameraLut);
  const lut = !log && luts.get(cameraLut);
  gl.uniform1i(loc.camMode, log ? log.mode : lut ? 6 : 0);
  if (log) gl.uniformMatrix3fv(loc.camGamut, true, (log.gamut ||= gamutToRec709(log.primaries)).flat());
  if (lut) {
    gl.activeTexture(gl.TEXTURE1);
    if (!lut.tex) upload3D(lut);
    gl.bindTexture(gl.TEXTURE_3D, lut.tex);
    gl.uniform3fv(loc.lutMin, lut.min);
    gl.uniform3fv(loc.lutMax, lut.max);
    gl.uniform1f(loc.lutSize, lut.size);
    gl.activeTexture(gl.TEXTURE0);
  }
  const film = g.film && bakeFilm(g.film);
  gl.uniform1f(loc.filmMix, film ? g.filmMix : 0);
  if (film) {
    gl.activeTexture(gl.TEXTURE2);
    if (!film.tex) upload3D(film);
    gl.bindTexture(gl.TEXTURE_3D, film.tex);
    gl.activeTexture(gl.TEXTURE0);
  }
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
