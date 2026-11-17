import { HUE_SATURATION_GLSL, hueSaturationPixels, hueSaturationSettings } from './hueSaturation.js';
const makeCanvas = () => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
let gpu, failed = false, fallback;
function setup() {
  if (gpu || failed) return gpu;
  try {
    const canvas = makeCanvas();
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    const shader = (type, source) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
      in vec2 pos; out vec2 uv;
      void main(){uv=vec2((pos.x+1.0)*0.5,(1.0-pos.y)*0.5);gl_Position=vec4(pos,0,1);}`));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es\n${HUE_SATURATION_GLSL}`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'pos');
    gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gpu = { canvas, gl, texture, u: Object.fromEntries(['image', 'ranges[0]', 'adjustments[0]', 'amount'].map((n) => [n, gl.getUniformLocation(program, n)])) };
  } catch (err) {
    failed = true;
    console.warn('Advanced Hue / Saturation uses CPU fallback:', err.message);
  }
  return gpu;
}

// Used by the shared source-effect stack in both the viewer and export worker.
export function renderHueSaturation(img, w, h, params) {
  const s = hueSaturationSettings(params);
  if (!s.active || s.amount === 0) return img;
  const g = setup();
  if (g && !g.gl.isContextLost() && w <= g.gl.getParameter(g.gl.MAX_TEXTURE_SIZE) && h <= g.gl.getParameter(g.gl.MAX_TEXTURE_SIZE)) {
    const { canvas, gl, texture, u } = g;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.uniform1i(u.image, 0);
    gl.uniform3fv(u['ranges[0]'], s.bands.flatMap((b) => [b.center, b.left, b.right]));
    gl.uniform2fv(u['adjustments[0]'], s.bands.flatMap((b) => [b.hue, b.saturation]));
    gl.uniform1f(u.amount, s.amount);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  }
  fallback ||= makeCanvas();
  if (fallback.width !== w || fallback.height !== h) { fallback.width = w; fallback.height = h; }
  const ctx = fallback.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  ctx.putImageData(new ImageData(hueSaturationPixels(data.data, s), w, h), 0, 0);
  return fallback;
}
