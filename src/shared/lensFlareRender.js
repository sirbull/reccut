// Tegner Lens Flare på skjermkortet (WebGL2) i lineært lys:
// 1. Hvert element er en sprite. PNG-ene er sRGB med rett alfa; som SRGB8_ALPHA8-tekstur dekodes RGB til lineært
//    lys før filtreringen, og shaderen ganger med alfa én gang (lyset = RGB · A · styrke · farge).
// 2. Lyset legges sammen i en flyttallsbuffer (Add, eller Screen per element).
// 3. Bufferen legges over bildet i lineært lys og kodes tilbake til sRGB. Appen har ingen tonemapping ennå,
//    så Add klipper ved hvitt som ellers i bildet. ponytail: tonemapping legges her når HDR-eksporten kommer.
// Uten WebGL2 tegnes spritene med Canvas 2D (gammakodet, uten Flare color, elementfarge og smuss).
import { FLARE_ASSETS, flareDraws } from './lensFlare.js';

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
function load(asset) {
  if (bitmaps.has(asset.id)) return bitmaps.get(asset.id);
  const job = fetch(spriteUrl(asset.file))
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
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
export function loadFlareSprites(project) {
  const ids = new Set();
  for (const clip of Object.values(project.clips || {}))
    for (const e of clip.props?.vfx || []) if (e.type === 'lensFlare' && e.on !== false) for (const el of e.p?.elements || []) ids.add(el.asset);
  return Promise.all(FLARE_ASSETS.filter((a) => ids.has(a.id)).map(load));
}

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
uniform sampler2D sprite; uniform vec3 gain, hue; uniform int mode; uniform vec2 maskCenter, frame; uniform float maskRadius, colorize;
void main(){
 vec4 t=texture(sprite, uv);
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
    const sprite = program(SPRITE_VS, SPRITE_FS, ['center', 'halfSize', 'frame', 'angle', 'sprite', 'gain', 'hue', 'colorize', 'mode', 'maskCenter', 'maskRadius']);
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
    g = { gl, canvas, sprite, composite, texture, half, video: texture(), emission: texture(), fbo: gl.createFramebuffer(), size: '', max: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
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
  const { gl, canvas, sprite, composite } = g;
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
    const t = spriteTexture(d.asset);
    if (!t) continue;
    gl.bindTexture(gl.TEXTURE_2D, t);
    const dirt = d.blend === 'dirt';
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
    // Add: E + e. Screen: E + e − E·e (= E·(1 − e) + e).
    gl.blendFunc(gl.ONE, d.blend === 'screen' ? gl.ONE_MINUS_SRC_COLOR : gl.ONE);
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

/**
 * Tegner bildet med lens flare på ctx (w×h). p er effektens parametere med verdiene fra nøkkelbildene.
 * Lyset følger bildets alfa, som de andre lyseffektene: nøklede eller gjennomsiktige områder forblir gjennomsiktige.
 * Teksturer som ikke er lastet ennå, hoppes over; onFlareSprites sier fra når de er klare.
 */
export function drawLensFlare(ctx, img, w, h, p, only = null) {
  const draws = flareDraws(p, w, h, only);
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
      const bmp = d.blend !== 'dirt' && loaded(d.asset);
      if (!bmp) continue;
      ctx.globalCompositeOperation = d.blend === 'screen' || p.blend === 'screen' ? 'screen' : 'lighter';
      ctx.globalAlpha = Math.min(1, Math.max(...d.gain));
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
