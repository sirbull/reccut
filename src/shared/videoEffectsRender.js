import { activeVideoEffects, effectParams, keyPixels, rgb } from './videoEffects.js';
import { renderGradient } from './gradientRender.js';
import { isStylizeEffect, renderStylize } from './stylizeRender.js';
const makeCanvas = () =>
  typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
const surfaces = [];
function surface(i, w, h) {
  const cv = (surfaces[i] ||= makeCanvas());
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return cv;
}
const referenceCache = new Map();
function referenceCanvas(ref) {
  if (!ref?.pixels || !(ref.width > 0 && ref.height > 0) || ref.width * ref.height > 1048576) return null;
  if (referenceCache.has(ref.pixels)) return referenceCache.get(ref.pixels);
  const bytes = Uint8ClampedArray.from(atob(ref.pixels), (c) => c.charCodeAt(0));
  if (bytes.length !== ref.width * ref.height * 4) return null;
  const cv = makeCanvas();
  cv.width = ref.width;
  cv.height = ref.height;
  cv.getContext('2d').putImageData(new ImageData(bytes, ref.width, ref.height), 0, 0);
  if (referenceCache.size >= 8) referenceCache.delete(referenceCache.keys().next().value);
  referenceCache.set(ref.pixels, cv);
  return cv;
}
const VS = `#version 300 es
in vec2 pos; out vec2 uv;
void main(){uv=vec2((pos.x+1.0)*0.5,(1.0-pos.y)*0.5);gl_Position=vec4(pos,0,1);}`;
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 outColor;
uniform sampler2D image, referenceImage;
uniform int kind, mode, radius, invertKey;
uniform vec3 keyColor;
uniform float similarity, softness, despill, blackPoint, whitePoint, matteGamma, detail, shadows, shadowRange, edgeColor, motionBlur;
uniform vec2 texel;
vec2 chroma(vec3 c){return vec2(dot(c,vec3(-0.168736,-0.331264,0.5)),dot(c,vec3(0.5,-0.418688,-0.081312)));}
void main(){
 vec4 c=texture(image,uv);
 float shadowWeight=0.0;
 if(mode==0){
  float d=kind==0?length(chroma(c.rgb)-chroma(keyColor)):kind==1?dot(c.rgb,vec3(0.2126,0.7152,0.0722)):length(c.rgb-texture(referenceImage,uv).rgb)/sqrt(3.0);
  float a=smoothstep(similarity,similarity+max(0.0001,softness),d);
  if(kind==0){
   int channel=keyColor.r>=keyColor.g&&keyColor.r>=keyColor.b?0:keyColor.g>=keyColor.b?1:2;
   float excess=channel==0?c.r-max(c.g,c.b):channel==1?c.g-max(c.r,c.b):c.b-max(c.r,c.g);
   float keyExcess=channel==0?keyColor.r-max(keyColor.g,keyColor.b):channel==1?keyColor.g-max(keyColor.r,keyColor.b):keyColor.b-max(keyColor.r,keyColor.g);
   a=max(a,(keyExcess>0.001?clamp(1.0-max(0.0,excess)/keyExcess,0.0,1.0):0.0)*detail);
   if(keyExcess>0.001)a=mix(a,min(a,1.0-clamp(excess/keyExcess,0.0,1.0)),motionBlur);
   float brightness=max(c.r,max(c.g,c.b)), screenBrightness=max(keyColor.r,max(keyColor.g,keyColor.b));
   float hueDistance=length(c.rgb/max(0.001,brightness)-keyColor/max(0.001,screenBrightness))/sqrt(3.0);
   float affinity=1.0-smoothstep(shadowRange,shadowRange+0.1,hueDistance);
   shadowWeight=affinity*shadows;
   a=mix(a,clamp(1.0-brightness/max(0.001,screenBrightness),0.0,1.0),shadowWeight);
  }
  a=clamp((a-blackPoint)/max(0.001,whitePoint-blackPoint),0.0,1.0);
  a=pow(a,1.0/max(0.1,matteGamma));
  if(invertKey==1)a=1.0-a;
  if(kind==0){
   c.rgb=mix(c.rgb,clamp((c.rgb-(1.0-a)*keyColor)/max(0.01,a),0.0,1.0),max(max(edgeColor,motionBlur),shadowWeight));
   if(keyColor.g>=keyColor.r&&keyColor.g>=keyColor.b)c.g-=max(0.0,c.g-max(c.r,c.b))*despill;
   else if(keyColor.r>=keyColor.b)c.r-=max(0.0,c.r-max(c.g,c.b))*despill;
   else c.b-=max(0.0,c.b-max(c.r,c.g))*despill;
  }
  c.a*=a;
 }else if(mode==5){c=vec4(vec3(c.a),1.0);}
 else {
  float a=mode==1||mode==2?1.0:0.0;
  for(int i=-8;i<=8;i++){
   if(abs(i)>radius)continue;
   vec2 delta=mode==1||mode==3||mode==6?vec2(texel.x*float(i),0):vec2(0,texel.y*float(i));
   float v=texture(image,uv+delta).a;
   if(mode==1||mode==2)a=min(a,v);
   else if(mode==6||mode==7)a=max(a,v);
   else a+=v/float(2*radius+1);
  }
  c.a=a;
 }
 outColor=c;
}`;
let gpu,
  failed = false;
function setup() {
  if (gpu || failed) return gpu;
  try {
    const canvas = makeCanvas();
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    const shader = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const textures = [0, 1].map((i) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    });
    const uniforms = Object.fromEntries(
      [
        'image',
        'referenceImage',
        'kind',
        'mode',
        'radius',
        'invertKey',
        'keyColor',
        'similarity',
        'softness',
        'despill',
        'blackPoint',
        'whitePoint',
        'texel',
        'matteGamma',
        'detail',
        'shadows',
        'shadowRange',
        'edgeColor',
        'motionBlur',
      ].map((n) => [n, gl.getUniformLocation(program, n)]),
    );
    gpu = { gl, canvas, textures, u: uniforms };
  } catch (err) {
    failed = true;
    console.warn('Keyer uses CPU fallback:', err.message);
  }
  return gpu;
}
function gpuKey(img, w, h, effect, ref) {
  const g = setup();
  if (!g || g.gl.isContextLost()) return null;
  const { gl, canvas, textures, u } = g,
    p = effectParams(effect);
  if (w > gl.getParameter(gl.MAX_TEXTURE_SIZE) || h > gl.getParameter(gl.MAX_TEXTURE_SIZE)) return null;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  const upload = (i, source) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, textures[i]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  };
  upload(1, ref || img);
  gl.uniform1i(u.image, 0);
  gl.uniform1i(u.referenceImage, 1);
  gl.uniform1i(u.kind, effect.type === 'chroma' ? 0 : effect.type === 'luma' ? 1 : 2);
  gl.uniform3fv(u.keyColor, rgb(p.color));
  for (const [name, value] of Object.entries({
    similarity: p.similarity,
    softness: p.softness,
    despill: p.despill || 0,
    blackPoint: p.black,
    whitePoint: p.white,
    matteGamma: p.gamma,
    detail: p.detail || 0,
    shadows: p.shadows || 0,
    shadowRange: p.shadowRange ?? 0.25,
    edgeColor: p.edgeColor || 0,
    motionBlur: p.motionBlur || 0,
  }))
    gl.uniform1f(u[name], value);
  gl.uniform1i(u.invertKey, p.invert ? 1 : 0);
  gl.uniform2f(u.texel, 1 / w, 1 / h);
  let source = img;
  const pass = (mode, radius = 0) => {
    upload(0, source);
    gl.uniform1i(u.mode, mode);
    gl.uniform1i(u.radius, radius);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const cv = surface(2, w, h),
      cx = cv.getContext('2d');
    cx.clearRect(0, 0, w, h);
    cx.drawImage(canvas, 0, 0);
    source = cv;
  };
  pass(0);
  const choke = Math.min(8, Math.round(Math.abs(p.choke || 0))),
    feather = Math.min(8, Math.round(p.feather || 0));
  if (choke) {
    pass(p.choke > 0 ? 1 : 6, choke);
    pass(p.choke > 0 ? 2 : 7, choke);
  }
  if (feather) {
    pass(3, feather);
    pass(4, feather);
  }
  if (p.view === 'matte') pass(5);
  return source;
}
// Pikselbaserte radier skal ha samme synlige størrelse i redusert preview.
function scaledEffect(effect, scale) {
  if (scale === 1) return effect;
  const p = effectParams(effect);
  if (effect.type === 'blur') p.amount *= scale;
  if (effect.type === 'glow') p.radius *= scale;
  if (p.choke) p.choke *= scale;
  if (p.feather) p.feather *= scale;
  return { ...effect, p };
}

export function applyVideoEffects(src, clip, target = 'main', time = 0) {
  const effects = activeVideoEffects(clip, target);
  if (!effects.length) return src;
  const w = Math.max(1, Math.round(src.w)),
    h = Math.max(1, Math.round(src.h));
  let img = src.img;
  for (const original of effects) {
    const effect = scaledEffect(original, src.pixelScale ?? 1);
    const p = effectParams(effect),
      ref = effect.type === 'difference' ? referenceCanvas(p.reference) : null;
    if (effect.type === 'difference' && !ref) continue;
    const cv = surface(0, w, h),
      ctx = cv.getContext('2d', { willReadFrequently: true });
    if (isStylizeEffect(effect.type)) {
      if (effect.type !== 'vhs' && !(p.amount > 0) && !(effect.type === 'filmGrain' && (p.dust || p.scratches || p.weave || p.flicker))) continue;
      const result = renderStylize(img, w, h, effect.type, p, time, src.pixelScale ?? 1);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(result, 0, 0, w, h);
    } else if (effect.type === 'glow') {
      if (!(p.amount > 0)) continue;
      const copy = surface(1, w, h), cc = copy.getContext('2d');
      cc.clearRect(0, 0, w, h);
      cc.drawImage(img, 0, 0, w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.drawImage(copy, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.max(0, Math.min(1, p.amount));
      ctx.filter = `blur(${Math.max(0, Math.min(400, p.radius))}px)`;
      ctx.drawImage(copy, 0, 0);
      ctx.restore();
    } else if (effect.type === 'solid' || effect.type === 'gradient') {
      if (!(p.amount > 0)) continue;
      const copy = surface(1, w, h), cc = copy.getContext('2d');
      cc.clearRect(0, 0, w, h);
      cc.drawImage(img, 0, 0, w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (p.preserveAlpha) {
        ctx.drawImage(copy, 0, 0);
        ctx.globalCompositeOperation = 'source-atop';
      } else if (p.amount < 1) ctx.drawImage(copy, 0, 0);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.amount));
      if (effect.type === 'solid') {
        ctx.fillStyle = p.color;
        ctx.fillRect(0, 0, w, h);
      } else ctx.drawImage(renderGradient(p, w, h), 0, 0);
      ctx.restore();
    } else if (['chroma', 'luma', 'difference'].includes(effect.type)) {
      const keyed = gpuKey(img, w, h, effect, ref);
      if (keyed) {
        img = keyed;
        continue;
      }
      const snapshot = surface(3, w, h),
        sc = snapshot.getContext('2d');
      sc.clearRect(0, 0, w, h);
      sc.drawImage(img, 0, 0, w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapshot, 0, 0, w, h);
      const pixels = ctx.getImageData(0, 0, w, h);
      let reference = null;
      if (ref) {
        const r = surface(1, w, h),
          rc = r.getContext('2d', { willReadFrequently: true });
        rc.clearRect(0, 0, w, h);
        rc.drawImage(ref, 0, 0, w, h);
        reference = rc.getImageData(0, 0, w, h).data;
      }
      ctx.putImageData(new ImageData(keyPixels(pixels.data, w, h, effect, reference), w, h), 0, 0);
    } else {
      // Snapshot when two consecutive CPU/filter effects reuse the working canvas.
      const copy = surface(1, w, h),
        cc = copy.getContext('2d');
      cc.clearRect(0, 0, w, h);
      cc.drawImage(img, 0, 0, w, h);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      if (effect.type === 'opacity') ctx.globalAlpha = Math.max(0, Math.min(1, p.amount));
      else
        ctx.filter =
          effect.type === 'blur'
            ? `blur(${p.amount}px)`
            : effect.type === 'saturation'
              ? `saturate(${p.amount})`
              : `contrast(${p.amount})`;
      ctx.drawImage(copy, 0, 0);
      ctx.restore();
    }
    img = cv;
  }
  return { ...src, img, w, h };
}
