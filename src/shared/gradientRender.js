import { gradientParams, gradientRGB } from './gradient.js';

const makeCanvas = (w, h) => {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
};
const cache = new Map();
let gpu, failed = false;
function freeformGPU(p, w, h) {
  if (failed) return null;
  try {
    if (!gpu) {
      const canvas = makeCanvas(1, 1);
      const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL2 unavailable');
      const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const program = gl.createProgram();
      gl.attachShader(program, shader(gl.VERTEX_SHADER, `#version 300 es
        in vec2 pos; out vec2 uv;
        void main(){uv=vec2((pos.x+1.0)*0.5,(1.0-pos.y)*0.5);gl_Position=vec4(pos,0,1);}`));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float;
        in vec2 uv; out vec4 outColor;
        uniform int count;
        uniform vec2 aspect;
        uniform vec3 points[32], colors[32];
        void main(){
          vec3 color=vec3(0); float total=0.0;
          for(int i=0;i<32;i++){
            if(i>=count)break;
            vec2 delta=(uv-points[i].xy)*aspect;
            float weight=pow(points[i].z*points[i].z/max(1e-8,dot(delta,delta)),2.0);
            color+=colors[i]*weight; total+=weight;
          }
          outColor=vec4(color/total,1);
        }`));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const pos = gl.getAttribLocation(program, 'pos');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
      gpu = { canvas, gl, u: Object.fromEntries(['count', 'aspect', 'points[0]', 'colors[0]'].map((n) => [n, gl.getUniformLocation(program, n)])) };
    }
    const { canvas, gl, u } = gpu;
    if (gl.isContextLost() || w > gl.getParameter(gl.MAX_VIEWPORT_DIMS)[0] || h > gl.getParameter(gl.MAX_VIEWPORT_DIMS)[1]) return null;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform1i(u.count, p.points.length);
    gl.uniform2f(u.aspect, w / Math.min(w, h), h / Math.min(w, h));
    gl.uniform3fv(u['points[0]'], new Float32Array(p.points.flatMap((s) => [s.x, s.y, s.radius])));
    gl.uniform3fv(u['colors[0]'], new Float32Array(p.points.flatMap((s) => gradientRGB(s.color).map((c) => c / 255))));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return canvas;
  } catch {
    failed = true;
    return null;
  }
}
function freeformCPU(ctx, p, w, h) {
  const image = ctx.createImageData(w, h), data = image.data;
  const edge = Math.min(w, h), ax = w / edge, ay = h / edge;
  const points = p.points.map((s) => ({ ...s, rgb: gradientRGB(s.color), r4: s.radius ** 4 }));
  for (let y = 0; y < h; y++) {
    const yy = (y + 0.5) / h;
    for (const s of points) s.dy2 = ((yy - s.y) * ay) ** 2;
    for (let x = 0; x < w; x++) {
      const xx = (x + 0.5) / w;
      let r = 0, g = 0, b = 0, total = 0;
      for (const s of points) {
        const d2 = Math.max(1e-8, ((xx - s.x) * ax) ** 2 + s.dy2);
        const weight = s.r4 / (d2 * d2);
        total += weight;
        r += s.rgb[0] * weight; g += s.rgb[1] * weight; b += s.rgb[2] * weight;
      }
      const i = (y * w + x) * 4;
      data[i] = r / total; data[i + 1] = g / total; data[i + 2] = b / total; data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}
// Static fills are cached independently of the changing video frames. Preview and
// export use the same full-resolution field, including when WebGL is unavailable.
export function renderGradient(params, w, h) {
  const p = gradientParams(params);
  const key = JSON.stringify([w, h, p]);
  if (cache.has(key)) {
    const cv = cache.get(key);
    cache.delete(key);
    cache.set(key, cv);
    return cv;
  }
  const cv = makeCanvas(w, h), ctx = cv.getContext('2d');
  if (p.mode === 'freeform') {
    const result = freeformGPU(p, w, h);
    if (result) ctx.drawImage(result, 0, 0);
    else freeformCPU(ctx, p, w, h);
  } else {
    const coincident = p.mode === 'linear' && Math.hypot((p.end.x - p.start.x) * w, (p.end.y - p.start.y) * h) < 1e-8;
    const g = p.mode === 'radial'
      ? ctx.createRadialGradient(p.center.x * w, p.center.y * h, 0, p.center.x * w, p.center.y * h, p.radius * Math.min(w, h))
      : ctx.createLinearGradient(p.start.x * w, p.start.y * h, p.end.x * w, p.end.y * h);
    for (const s of p.stops) g.addColorStop(s.position, s.color);
    ctx.fillStyle = coincident ? p.stops.at(-1).color : g;
    ctx.fillRect(0, 0, w, h);
  }
  cache.set(key, cv);
  let area = [...cache.values()].reduce((sum, item) => sum + item.width * item.height, 0);
  while (cache.size > 1 && (cache.size > 4 || area > 16777216)) {
    const oldest = cache.keys().next().value, item = cache.get(oldest);
    area -= item.width * item.height;
    cache.delete(oldest);
  }
  return cv;
}
