// Fargekorrigering på skjermkortet (WebGL2). Bildet lastes opp som 16-bit flyttall, så 10-bit
// opptak beholder presisjonen gjennom hele korrigeringen, og alt regnes i flyttall før resultatet
// tegnes. Brukes likt i forhåndsvisningen og eksporten.
import { valueAt } from './model.js';

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
};

export function gradeParams(clip, T) {
  const out = {};
  let active = false;
  for (const [k, def] of Object.entries(GRADE_PROPS)) {
    const v = valueAt(clip, k, T) ?? def;
    out[k] = v || 0;
    if (out[k]) active = true;
  }
  return active ? out : null;
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
uniform float exposure, contrast, highlights, shadows, saturation;
uniform vec3 wb, lift, gammaV, gain;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 toLin(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 toGam(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
void main() {
  vec4 t = texture(img, uv);
  vec3 c = t.rgb;
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
  o = vec4(clamp(c, 0.0, 1.0), t.a);
}`;

let gl = null;
let canvas = null;
let prog = null;
let tex = null;
let failed = false;
const loc = {};

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
    for (const n of ['img', 'exposure', 'contrast', 'highlights', 'shadows', 'saturation', 'wb', 'lift', 'gammaV', 'gain']) loc[n] = gl.getUniformLocation(prog, n);
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
 * Lerretet gjenbrukes, så det må tegnes med en gang.
 */
export function gradeImage(img, w, h, g) {
  if (!setup()) return null;
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
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
