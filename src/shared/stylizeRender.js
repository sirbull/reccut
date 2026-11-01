import { stylizePixels, stylizeSettings } from './stylize.js';
import { analogPixels } from './analog.js';
import { ANALOG_GLSL } from './analogShader.js';
const makeCanvas = () => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
const TYPES = ['noise', 'glitch', 'vhs', 'rgbSplit', 'scanlines', 'filmGrain', 'chromatic'];
export const isStylizeEffect = (type) => TYPES.includes(type);
let gpu, failed = false, fallback, tapeSource;
function setup() {
  if (gpu || failed) return gpu;
  try {
    const canvas = makeCanvas(), gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const shader = (type, source) => {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
      in vec2 pos; out vec2 uv;
      void main(){uv=vec2((pos.x+1.0)*0.5,(1.0-pos.y)*0.5);gl_Position=vec4(pos,0,1);}`));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; precision highp int;
      in vec2 uv; out vec4 outColor;
      uniform sampler2D image;
      uniform int kind, grainSize, bands, colored, spacing;
      uniform uint seed;
      uniform float amount, clock, splitAmount, noiseAmount, lineAmount;
      uniform vec2 offset;
      uint hash(uint n){n=(n^(n>>16u))*0x7feb352du;n=(n^(n>>15u))*0x846ca68bu;return n^(n>>16u);}
      float random(uint n){return float(hash(n)&65535u)/65535.0;}
      vec4 sampleAt(ivec2 p){return texelFetch(image,clamp(p,ivec2(0),textureSize(image,0)-1),0);}
      ${ANALOG_GLSL}
      void main(){
        if(kind==2||kind==5||kind==6){
          vec2 p=floor(uv*outputSize());
          vec3 c=kind==2?renderTape(p):kind==5?renderFilm(p):renderChromatic(p);
          outColor=vec4(clamp(c,0.0,1.0),texture(originalImage,uv).a);return;
        }
        ivec2 size=textureSize(image,0), p=clamp(ivec2(uv*vec2(size)),ivec2(0),size-1);
        int shift=0, split=0;
        if(kind==1){
          uint band=uint(floor(float(p.y)/float(size.y)*float(bands)));
          if(random(seed+band*1973u)<amount){
            shift=int(floor((random(seed+band*9277u+19u)-0.5)*amount*float(size.x)*0.18+0.5));
            split=int(floor(splitAmount*amount*float(size.x)*0.02+0.5));
          }
        }
        vec4 c=sampleAt(p);
        c.r=sampleAt(p+ivec2(shift+split,0)).r;
        c.g=sampleAt(p+ivec2(shift,0)).g;
        c.b=sampleAt(p+ivec2(shift-split,0)).b;
        if(kind==3){c.r=readImage(vec2(p)+offset).r;c.b=readImage(vec2(p)-offset).b;}
        uint n=seed+uint(p.x/grainSize)*374761393u+uint(p.y/grainSize)*668265263u;
        if(kind==0){
          float grain=(random(n)-0.5)*amount*(160.0/255.0);
          c.rgb+=colored==1?vec3(grain,(random(n+17u)-0.5)*amount*(160.0/255.0),(random(n+37u)-0.5)*amount*(160.0/255.0)):vec3(grain);
        }else if(kind==4){c.rgb*=1.0-amount*(p.y%spacing<(spacing+1)/2?1.0:0.0);}
        outColor=vec4(clamp(c.rgb,0.0,1.0),c.a);
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'pos'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const textures = [0, 1].map((i) => {
      const texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    });
    gpu = { canvas, gl, textures, u: Object.fromEntries(['image', 'originalImage', 'kind', 'grainSize', 'bands', 'colored', 'spacing', 'seed', 'baseSeed', 'amount', 'clock', 'splitAmount', 'noiseAmount', 'lineAmount', 'offset', 'tape', 'film', 'damage', 'opticalCenter', 'falloff'].map((n) => [n, gl.getUniformLocation(program, n)])) };
  } catch (err) { failed = true; console.warn('Stylize effects use CPU fallback:', err.message); }
  return gpu;
}
export function renderStylize(img, w, h, type, params, time, scale = 1) {
  const s = stylizeSettings(type, params, time, w, h, scale), g = setup();
  let signal = img;
  if (type === 'vhs') {
    tapeSource ||= makeCanvas();
    tapeSource.width = Math.min(720, w); tapeSource.height = Math.min(480, h);
    const tc = tapeSource.getContext('2d', { willReadFrequently: true });
    tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
    tc.drawImage(img, 0, 0, w, h, 0, 0, tapeSource.width, tapeSource.height);
    signal = tapeSource;
  }
  if (g && !g.gl.isContextLost() && w <= g.gl.getParameter(g.gl.MAX_TEXTURE_SIZE) && h <= g.gl.getParameter(g.gl.MAX_TEXTURE_SIZE)) {
    const { canvas, gl, textures, u } = g;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    for (const [i, source] of [signal, img].entries()) {
      gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, textures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    }
    gl.uniform1i(u.image, 0); gl.uniform1i(u.originalImage, 1); gl.uniform1i(u.kind, TYPES.indexOf(type)); gl.uniform1ui(u.seed, s.seed);
    gl.uniform1ui(u.baseSeed, s.baseSeed);
    for (const [key, value] of Object.entries({ grainSize: s.size, bands: s.bands, colored: s.colored ? 1 : 0, spacing: s.spacing })) gl.uniform1i(u[key], value);
    for (const [key, value] of Object.entries({ amount: s.amount, clock: s.time, splitAmount: s.split, noiseAmount: s.noise, lineAmount: s.scanlines })) gl.uniform1f(u[key], value);
    gl.uniform2f(u.offset, s.dx, s.dy);
    gl.uniform4f(u.tape, s.softness, s.bleed, s.tracking, s.fade);
    gl.uniform4f(u.film, s.filmSize, s.roughness, s.color, s.tonal);
    gl.uniform4f(u.damage, s.dust, s.scratches, s.weave, s.flicker);
    gl.uniform2f(u.opticalCenter, s.centerX, s.centerY); gl.uniform1f(u.falloff, s.falloff);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
  fallback ||= makeCanvas();
  fallback.width = w; fallback.height = h;
  const ctx = fallback.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const result = type === 'vhs'
    ? analogPixels(data.data, w, h, s, tapeSource.getContext('2d').getImageData(0, 0, tapeSource.width, tapeSource.height).data, tapeSource.width, tapeSource.height)
    : stylizePixels(data.data, w, h, s);
  ctx.putImageData(new ImageData(result, w, h), 0, 0);
  return fallback;
}
