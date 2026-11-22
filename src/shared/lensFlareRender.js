// Tegner Lens Flare på skjermkortet (WebGL2) i lineært lys:
// 1. Hvert element er en sprite. PNG-ene er sRGB med rett alfa; som SRGB8_ALPHA8-tekstur dekodes RGB til lineært
//    lys før filtreringen, og shaderen ganger med alfa én gang (lyset = RGB · A · styrke · farge).
// 2. Lyset legges sammen i en flyttallsbuffer (Add, eller Screen per element).
// 3. Bufferen legges over bildet i lineært lys og kodes tilbake til sRGB. Appen har ingen tonemapping ennå,
//    så Add klipper ved hvitt som ellers i bildet. ponytail: tonemapping legges her når HDR-eksporten kommer.
// Kit-elementene som er laget med formler (glød, stjerner, striper, buer, glints, diffraksjon), regnes ut med de
// samme formlene i SPRITE_FS i stedet for å strekke PNG-en, så de er skarpe i 4K.
// Okklusjon: flareVisibility måler hvor mye av lyskilden som synes i bildet, og demper flaren tilsvarende.
// Prosedyriske elementer (iris ghosts, ringer, halos) har ingen tekstur: SHAPE_FS regner ut form, farge og
// styrke hver for seg per piksel, så de er skarpe i alle oppløsninger.
// Uten WebGL2 tegnes spritene med Canvas 2D (gammakodet, uten Flare color, elementfarge og smuss), og de
// prosedyriske elementene som enkle radielle gradienter.
import { assetOf, flareDraws } from './lensFlare.js';

const makeCanvas = () => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas'));

/* Teksturene lastes ved behov. Siden er en file://-side, så filene hentes gjennom media:// (som i stemmeprøvene). */
const bitmaps = new Map(); // id → ImageBitmap | Promise | null (feilet)
const listeners = new Set();
export function onFlareSprites(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function spriteUrl(file) {
  const u = new URL(`lensflare/${file}`, location.href);
  if (u.protocol !== 'file:') return u.href;
  let path = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return `media://file/${encodeURIComponent(path)}`;
}
// Egne teksturer er data-URL-er i prosjektet.
function dataBlob(url) {
  const [head, body] = url.split(',');
  return new Blob([Uint8Array.from(atob(body), (c) => c.charCodeAt(0))], { type: head.slice(5).split(';')[0] });
}
function load(asset) {
  if (bitmaps.has(asset.id)) return bitmaps.get(asset.id);
  const job = (asset.url ? Promise.resolve().then(() => dataBlob(asset.url)) : fetch(spriteUrl(asset.file))
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`)))))
    // Rett alfa og ingen fargekonvertering: pikslene skal nå shaderen slik de ligger i filen.
    .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
    .then(
      (img) => {
        bitmaps.set(asset.id, img);
        for (const fn of listeners) fn();
        return img;
      },
      (err) => {
        console.warn(`Lens flare texture ${asset.id} could not be loaded:`, err.message);
        bitmaps.set(asset.id, null);
        return null;
      },
    );
  bitmaps.set(asset.id, job);
  return job;
}
const loaded = (asset) => {
  const b = load(asset);
  return b instanceof Promise ? null : b;
};
// Eksporten venter på teksturene til alle lens flares i prosjektet før første bilde.
// Kit-elementer som regnes ut med formler, trenger PNG-en bare uten skjermkort.
export function loadFlareSprites(project) {
  const assets = new Map();
  for (const clip of Object.values(project.clips || {}))
    for (const e of clip.props?.vfx || []) if (e.type === 'lensFlare' && e.on !== false)
      for (const el of e.p?.elements || []) {
        const a = assetOf(e.p, el.asset);
        if (a && (a.file || a.url) && !(a.kit && flareOptions.analytic && setup())) assets.set(a.id, a);
      }
  return Promise.all([...assets.values()].map(load));
}
// analytic: false tegner kit-elementene fra PNG-ene også på skjermkortet (bare for sammenligning i testene).
export const flareOptions = { analytic: true };

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 pos;
uniform vec2 center, halfSize, frame; uniform float angle;
out vec2 uv;
void main(){
 uv=pos*0.5+0.5;
 vec2 q=pos*halfSize; float c=cos(angle), s=sin(angle);
 vec2 p=center+vec2(c*q.x-s*q.y, s*q.x+c*q.y);
 gl_Position=vec4(p.x/frame.x*2.0-1.0, 1.0-p.y/frame.y*2.0, 0.0, 1.0);
}`;
const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 outColor;
uniform sampler2D sprite; uniform vec3 gain, hue, kitColor; uniform int mode, kit, variant; uniform vec2 maskCenter, frame; uniform float maskRadius, colorize;
const float PI = 3.14159265359;
float g(float v, float s){ return exp(-0.5*v*v/(s*s)); }
// Smal gauss: smalere enn omtrent en halv piksel blir den bredere med samme energi, så tynne stråler ikke flimrer.
float ga(float v, float s){ float px = fwidth(v), s2 = s*s + 0.25*px*px; return exp(-0.5*v*v/s2)*s/sqrt(s2); }
vec3 hsv(float h, float s, float v){ vec3 p = abs(fract(h + vec3(1.0, 2.0/3.0, 1.0/3.0))*6.0 - 3.0); return v*mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s); }
vec3 decode(vec3 c){ return mix(c/12.92, pow((c + 0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
// Kit-teksturen i punktet uv, regnet ut som i generate_assets.py: x og y går fra −1 til 1 over teksturen.
// RGB er sRGB (dekodes til lineært lys som i en SRGB8_ALPHA8-tekstur), alfa er lysmasken.
vec4 kitTexel(vec2 uv){
  float x = uv.x*2.0 - 1.0, y = uv.y*2.0 - 1.0, radius = length(vec2(x, y)), theta = atan(y, x);
  float mask = 0.0, core = 0.0; bool rainbow = false;
  if (kit == 0) {
    float r = radius*(variant == 1 ? 1.1 : 0.95);
    core = g(r, 0.08);
    mask = (0.65*g(r, 0.26) + 0.28*g(r, 0.48) + 0.4*ga(r, 0.052))*sqrt(clamp(1.0 - radius/0.95, 0.0, 1.0));
  } else if (kit <= 3) {
    // 1 starburst, 2 diffraction, 3 glint
    int rays = kit == 1 ? variant : kit == 2 ? (variant == 0 ? 8 : 12) : (variant == 1 ? 8 : 4), pairs = rays/2;
    core = g(radius, kit == 3 ? 0.06 : 0.075);
    mask = 0.30*g(radius, 0.25) + 0.66*ga(radius, 0.055);
    float rot = kit == 1 ? 0.02 : 0.12;
    for (int k = 0; k < 6; k++) {
      if (k >= pairs) break;
      float a = PI*float(k)/float(pairs) + rot;
      float perp = -sin(a)*x + cos(a)*y, along = cos(a)*x + sin(a)*y;
      float width = (kit == 1 ? 0.007 : 0.009) + 0.008*abs(along);
      float len = (kit == 3 ? 0.52 : 0.78)*(k == 0 ? 1.25 : k % 2 == 1 ? 0.72 : 1.0);
      mask += ga(perp, width)*exp(-pow(abs(along)/len, 1.35))*(kit == 1 ? 0.43 : kit == 2 ? 0.33 : 0.28);
    }
    if (kit == 2) mask += 0.22*ga(radius - 0.22, 0.012) + 0.07*ga(radius - 0.34, 0.014);
    float f = clamp((0.96 - radius)/0.14, 0.0, 1.0);
    mask *= f*f;
  } else if (kit == 4) {
    core = g(x, 0.085)*g(y, 0.065);
    float sp = variant == 4 ? 0.020 : variant == 3 ? 0.043 : 0.035;
    float beams = (0.64*ga(y, sp) + 0.18*ga(y, sp*3.6) + 0.11*ga(y, sp*0.35))*exp(-pow(abs(x)/0.55, 1.45));
    if (variant == 3) beams += 0.34*ga(y - 0.11, 0.018)*g(x, 0.55);
    if (variant == 2) beams += 0.18*ga(y + 0.06, 0.02)*g(x, 0.38);
    float fx = clamp((1.0 - abs(x))/0.12, 0.0, 1.0), fy = clamp((1.0 - abs(y))/0.16, 0.0, 1.0);
    mask = (beams + 0.32*core)*fx*fx*fy*fy;
  } else {
    float c = variant == 0 ? 0.5*PI : variant == 1 ? 0.0 : variant == 2 ? -0.5*PI : PI;
    float sector = g(atan(sin(theta - c), cos(theta - c)), variant == 0 ? 0.85 : 0.6);
    mask = 0.79*sector*ga(radius - 0.66, variant != 2 ? 0.030 : 0.018) + 0.10*sector*g(radius - 0.66, 0.08);
    rainbow = variant == 0;
    float f = clamp((0.96 - radius)/0.1, 0.0, 1.0);
    mask *= f*f;
  }
  float ex = clamp((1.0 - abs(x))/0.055, 0.0, 1.0), ey = clamp((1.0 - abs(y))/0.055, 0.0, 1.0);
  core = clamp(core, 0.0, 1.0);
  vec3 rgb = rainbow ? hsv(theta/(2.0*PI) + 0.45, 0.86, 1.0) : kitColor*(1.0 - core*0.52) + core*0.52;
  return vec4(decode(clamp(rgb, 0.0, 1.0)), clamp(mask*ex*ex*ey*ey, 0.0, 1.0));
}
void main(){
 vec4 t=kit >= 0 ? kitTexel(uv) : texture(sprite, uv);
 // Flare color: ny fargetone med samme lysstyrke (største kanal). Nesten hvite partier, som en het kjerne,
 // beholder litt av hvitheten sin.
 float v=max(t.r, max(t.g, t.b)), s=v>0.0 ? (v-min(t.r, min(t.g, t.b)))/v : 0.0;
 vec3 recolored=mix(vec3(v), hue*v, max(s, 0.75));
 vec3 e=mix(t.rgb, recolored, colorize)*t.a*gain;
 if(mode==1){
  // Smuss på linsen synes bare der sterkt lys treffer den: en myk maske rundt elementets punkt på aksen.
  vec2 px=vec2(gl_FragCoord.x, frame.y-gl_FragCoord.y);
  float d=length(px-maskCenter)/max(1.0, maskRadius);
  e*=exp(-2.0*d*d);
 }
 if(mode==2) e=min(e, vec3(1.0));
 outColor=vec4(e, 0.0);
}`;
// Prosedyriske elementer. q er punktet i radier (omrisset ligger på 1). Tre ting regnes ut hver for seg:
// - Form: avstand til omrisset (sirkel eller regulær N-kant). Kantene glattes med fwidth, altså omtrent én
//   piksel uansett oppløsning. Kromatisk aberrasjon gir hver fargekanal sin egen skala.
// - Farge: et periodisk cosinusspektrum. Vinkelen kommer fra retningsvektoren, ikke atan, så det finnes ingen
//   søm ved 0°/360°, og spekteret glir over i grunnfargen mot sentrum, der retningen er udefinert.
// - Styrke: gain (farge · styrke · opasitet), som for teksturene.
const SHAPE_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 outColor;
uniform vec3 gain, hue; uniform int kind, mode;
uniform float extent, blades, edge, softness, thickness, chroma, spectrum, phase, colorize, radial;
const float TAU = 6.28318530718;
float gauss(float x, float s){ return exp(-0.5*x*x/(s*s)); }
// Avstand til omrisset i radier: 0 på kanten, negativ inne. N-kanten brettes inn i én sektor; 2π/N går opp
// i hele sirkelen, så brettet er sammenhengende over ±180°. I sentrum er vinkelen ubrukt (r = 0).
float outline(vec2 q){
  float r = length(q);
  if (blades < 3.0) return r - 1.0;
  float s = TAU/blades;
  float a = mod(atan(q.y, q.x + (r < 1e-7 ? 1.0 : 0.0)) + 0.5*s, s) - 0.5*s;
  return r*cos(a)/cos(0.5*s) - 1.0;
}
float profile(float d){
  float aa = max(fwidth(d), 1e-5);
  float soft = softness*0.5;
  if (kind == 0) {
    // Iris ghost: flat kropp, lysere kant innenfor omrisset, myk ytterkant.
    float cover = 1.0 - smoothstep(-soft - aa, aa, d);
    float rs = max(0.038, aa);
    return cover*(0.22 + 0.28*edge*gauss(d + 0.08, rs)*(0.038/rs));
  }
  if (kind == 1) {
    // Ring: smal topp og bred glød. Smalere enn en piksel blir den bredere, med samme energi (ingen flimring).
    float s1 = max(thickness, aa), s2 = max(2.6*thickness + 0.3*softness, aa);
    return 0.42*gauss(d, s1)*(thickness/s1) + 0.11*gauss(d, s2)*(2.6*thickness + 0.3*softness)/s2;
  }
  // Halo: lyset bygger seg opp innover mot omrisset og faller mykt av utenfor.
  float inner = smoothstep(-thickness - aa, aa, d);
  return 0.4*inner*inner*(1.0 - smoothstep(-aa, soft + aa, d));
}
void main(){
  vec2 q = (uv*2.0 - 1.0)*extent;
  vec3 shape = vec3(profile(outline(q/(1.0 + chroma))), profile(outline(q)), profile(outline(q/(1.0 - chroma))));
  float r = length(q);
  vec2 dir = q/max(r, 1e-7);
  vec3 psi = TAU*(phase - vec3(0.0, 1.0, 2.0)/3.0);
  // cos(θ + ψ) = dir.x·cos ψ − dir.y·sin ψ, og cos(2π·r + ψ) for gradient fra sentrum til kant.
  vec3 wave = radial > 0.5 ? cos(TAU*r + psi) : dir.x*cos(psi) - dir.y*sin(psi);
  // Spekteret har samme sum i alle vinkler (2 · (0,5 + 0,5 cos) summerer til 3), så lysstyrken er jevn.
  vec3 col = mix(vec3(1.0), 1.0 + wave, spectrum*smoothstep(0.0, 0.3, r));
  // Flare color gir den hvite delen ny farge; spekteret beholder sine farger.
  float v = max(col.r, max(col.g, col.b)), sat = v > 0.0 ? (v - min(col.r, min(col.g, col.b)))/v : 0.0;
  col = mix(col, mix(vec3(v), hue*v, max(sat, 0.75)), colorize*(1.0 - spectrum));
  vec3 e = max(col*shape*gain, 0.0);
  if (mode == 2) e = min(e, vec3(1.0));
  outColor = vec4(e, 0.0);
}`;
const COMPOSITE_VS = `#version 300 es
layout(location=0) in vec2 pos; out vec2 uv;
void main(){uv=vec2((pos.x+1.0)*0.5,(1.0-pos.y)*0.5);gl_Position=vec4(pos,0,1);}`;
const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 outColor;
uniform sampler2D video, emission; uniform int screen;
vec3 encode(vec3 c){return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c));}
void main(){
 vec4 v=texture(video, uv);
 vec3 E=texture(emission, vec2(uv.x, 1.0-uv.y)).rgb;
 vec3 o=screen==1 ? 1.0-(1.0-v.rgb)*(1.0-min(E, vec3(1.0))) : v.rgb+E;
 outColor=vec4(encode(clamp(o, 0.0, 1.0)), v.a);
}`;

let g = null, failed = false;
const textures = new Map(); // id → WebGLTexture
function setup() {
  if (g?.gl.isContextLost()) {
    g = null;
    textures.clear();
  }
  if (g || failed) return g;
  try {
    const canvas = makeCanvas();
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const program = (vs, fs, names) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return { p, u: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)])) };
    };
    const sprite = program(SPRITE_VS, SPRITE_FS, ['center', 'halfSize', 'frame', 'angle', 'sprite', 'gain', 'hue', 'colorize', 'mode', 'maskCenter', 'maskRadius', 'kit', 'variant', 'kitColor']);
    const shape = program(SPRITE_VS, SHAPE_FS, ['center', 'halfSize', 'frame', 'angle', 'gain', 'hue', 'kind', 'mode', 'extent', 'blades', 'edge', 'softness', 'thickness', 'chroma', 'spectrum', 'phase', 'colorize', 'radial']);
    const composite = program(COMPOSITE_VS, COMPOSITE_FS, ['video', 'emission', 'screen']);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const texture = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    // Halvflyt-buffer, så lys over 1,0 summeres riktig. Uten utvidelsen klipper lyset i bufferen.
    const half = Boolean(gl.getExtension('EXT_color_buffer_float'));
    g = { gl, canvas, sprite, shape, composite, texture, half, video: texture(), emission: texture(), fbo: gl.createFramebuffer(), size: '', max: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
  } catch (err) {
    failed = true;
    console.warn('Lens flare uses the 2D fallback:', err.message);
  }
  return g;
}

function spriteTexture(asset) {
  if (textures.has(asset.id)) return textures.get(asset.id);
  const img = loaded(asset);
  if (!img) return null;
  const { gl, texture } = g;
  const t = texture();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  textures.set(asset.id, t);
  // Teksturen holder bildet nå. Bitmapen lastes på nytt bare om skjermkortet mister konteksten.
  img.close?.();
  bitmaps.delete(asset.id);
  return t;
}

function gpuFlare(img, w, h, draws, screen) {
  const { gl, canvas, sprite, shape, composite } = g;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.activeTexture(gl.TEXTURE0);
  if (g.size !== `${w}x${h}`) {
    gl.bindTexture(gl.TEXTURE_2D, g.emission);
    gl.texImage2D(gl.TEXTURE_2D, 0, g.half ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, g.half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.emission, 0);
    g.size = `${w}x${h}`;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(sprite.p);
  gl.uniform2f(sprite.u.frame, w, h);
  gl.uniform1i(sprite.u.sprite, 0);
  gl.enable(gl.BLEND);
  for (const d of draws) {
    // Add: E + e. Screen: E + e − E·e (= E·(1 − e) + e).
    gl.blendFunc(gl.ONE, d.blend === 'screen' ? gl.ONE_MINUS_SRC_COLOR : gl.ONE);
    if (d.shape) {
      const q = d.shape, u = shape.u;
      gl.useProgram(shape.p);
      gl.uniform2f(u.frame, w, h);
      gl.uniform2f(u.center, d.x, d.y);
      gl.uniform2f(u.halfSize, d.w / 2, d.h / 2);
      gl.uniform1f(u.angle, d.angle);
      gl.uniform3fv(u.gain, d.gain);
      gl.uniform3fv(u.hue, d.hue);
      gl.uniform1i(u.kind, q.kind === 'iris' ? 0 : q.kind === 'ring' ? 1 : 2);
      gl.uniform1i(u.mode, d.blend === 'screen' ? 2 : 0);
      for (const k of ['extent', 'blades', 'edge', 'softness', 'thickness', 'chroma', 'spectrum', 'phase', 'colorize'])
        gl.uniform1f(u[k], k === 'extent' ? d.extent : k === 'colorize' ? d.colorize : q[k]);
      gl.uniform1f(u.radial, q.gradient === 'radial' ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(sprite.p);
      continue;
    }
    const dirt = d.blend === 'dirt', kit = !dirt && flareOptions.analytic ? d.asset.kit : null;
    const t = kit ? null : spriteTexture(d.asset);
    if (!kit && !t) continue;
    // Formel-elementene leser ingen tekstur, men enhet 0 må ikke peke på lysbufferen vi tegner i
    // (det er en lese/skrive-løkke, og WebGL hopper over tegningen).
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(sprite.u.kit, kit ? kit.kind : -1);
    if (kit) {
      gl.uniform1i(sprite.u.variant, kit.variant);
      gl.uniform3fv(sprite.u.kitColor, kit.color);
    }
    // Smusset dekker hele bildet med fast sideforhold, låst til linsen.
    const cover = Math.max(w, h) / 2;
    gl.uniform2f(sprite.u.center, dirt ? w / 2 : d.x, dirt ? h / 2 : d.y);
    gl.uniform2f(sprite.u.halfSize, dirt ? cover : d.w / 2, dirt ? cover : d.h / 2);
    gl.uniform1f(sprite.u.angle, dirt ? 0 : d.angle);
    gl.uniform3fv(sprite.u.gain, d.gain);
    gl.uniform3fv(sprite.u.hue, d.hue);
    gl.uniform1f(sprite.u.colorize, d.colorize);
    gl.uniform1i(sprite.u.mode, dirt ? 1 : d.blend === 'screen' ? 2 : 0);
    gl.uniform2f(sprite.u.maskCenter, d.x, d.y);
    gl.uniform1f(sprite.u.maskRadius, d.w / 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gl.disable(gl.BLEND);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, w, h);
  gl.bindTexture(gl.TEXTURE_2D, g.video);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, g.emission);
  gl.useProgram(composite.p);
  gl.uniform1i(composite.u.video, 0);
  gl.uniform1i(composite.u.emission, 1);
  gl.uniform1i(composite.u.screen, screen ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.activeTexture(gl.TEXTURE0);
  return canvas;
}

// Okklusjon: hvor stor del av lyskilden som synes, 0–1. Bildet rundt lyskilden (en sirkel på 2 % av høyden)
// leses i 24 × 24 punkter; et punkt teller som lys når lysstyrken er over Threshold. Punkter utenfor bildet
// teller som lys, så en lyskilde utenfor rammen ikke slukkes. Occlusion bestemmer hvor mye flaren dempes.
// Samme bilde gir samme svar, så forhåndsvisning og eksport er like.
let probe = null;
const PROBE = 24;
export function flareVisibility(img, w, h, p) {
  const amount = clamp01(p.occlusion);
  if (!amount) return 1;
  const R = Math.max(2, 0.02 * h), x0 = p.x * w - R, y0 = p.y * h - R;
  if (x0 > w || y0 > h || x0 + 2 * R < 0 || y0 + 2 * R < 0) return 1;
  let px;
  try {
    probe ||= makeCanvas();
    probe.width = probe.height = PROBE;
    const c = probe.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, PROBE, PROBE);
    c.drawImage(img, (x0 / w) * img.width, (y0 / h) * img.height, ((2 * R) / w) * img.width, ((2 * R) / h) * img.height, 0, 0, PROBE, PROBE);
    px = c.getImageData(0, 0, PROBE, PROBE).data;
  } catch {
    return 1;
  }
  const th = clamp01(p.threshold ?? 0.6);
  let lit = 0, n = 0;
  for (let j = 0; j < PROBE; j++)
    for (let i = 0; i < PROBE; i++) {
      const u = (i + 0.5) / PROBE * 2 - 1, v = (j + 0.5) / PROBE * 2 - 1;
      if (u * u + v * v > 1) continue;
      n++;
      const X = x0 + ((i + 0.5) / PROBE) * 2 * R, Y = y0 + ((j + 0.5) / PROBE) * 2 * R;
      if (X < 0 || Y < 0 || X >= w || Y >= h) { lit++; continue; }
      const k = (j * PROBE + i) * 4, luma = ((0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]) / 255) * (px[k + 3] / 255);
      const s = clamp01((luma - th + 0.1) / 0.2);
      lit += s * s * (3 - 2 * s);
    }
  return 1 - amount * (1 - lit / n);
}
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * Tegner bildet med lens flare på ctx (w×h). p er effektens parametere med verdiene fra nøkkelbildene.
 * Lyset følger bildets alfa, som de andre lyseffektene: nøklede eller gjennomsiktige områder forblir gjennomsiktige.
 * Teksturer som ikke er lastet ennå, hoppes over; onFlareSprites sier fra når de er klare.
 */
export function drawLensFlare(ctx, img, w, h, p, only = null) {
  const draws = flareDraws(p, w, h, only, flareVisibility(img, w, h, p));
  // Skjermkortet leser bildet før ctx tømmes, i tilfelle de er samme lerret.
  const gpu = draws.length && setup() && w <= g.max && h <= g.max ? gpuFlare(img, w, h, draws, p.blend === 'screen') : null;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (gpu || !draws.length) {
    ctx.drawImage(gpu || img, 0, 0, w, h);
  } else {
    ctx.drawImage(img, 0, 0, w, h);
    for (const d of draws) {
      ctx.globalCompositeOperation = d.blend === 'screen' || p.blend === 'screen' ? 'screen' : 'lighter';
      ctx.globalAlpha = Math.min(1, Math.max(...d.gain));
      if (d.shape) {
        // ponytail: bare en tilnærming når skjermkortet mangler; formen og spekteret krever shaderen.
        const R = d.w / 2 / d.extent, c = d.gain.map((v) => Math.round(255 * Math.min(1, v / Math.max(...d.gain)))).join(',');
        const grad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, R * 1.05);
        const ring = d.shape.kind !== 'iris';
        grad.addColorStop(0, `rgba(${c},${ring ? 0 : 0.22})`);
        grad.addColorStop(ring ? 0.85 : 0.9, `rgba(${c},${ring ? 0 : 0.4})`);
        grad.addColorStop(0.95, `rgba(${c},0.4)`);
        grad.addColorStop(1, `rgba(${c},0)`);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = grad;
        ctx.fillRect(d.x - R * 1.05, d.y - R * 1.05, R * 2.1, R * 2.1);
        continue;
      }
      const bmp = d.blend !== 'dirt' && loaded(d.asset);
      if (!bmp) continue;
      ctx.setTransform(1, 0, 0, 1, d.x, d.y);
      ctx.rotate(d.angle);
      ctx.drawImage(bmp, -d.w / 2, -d.h / 2, d.w, d.h);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, 0, 0, w, h);
  }
  ctx.restore();
}
