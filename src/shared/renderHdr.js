// HDR compositor: linear BT.2020, RGBA16F accumulation, float readback.
// Never pass HDR frames through Canvas 2D or the SDR grading shader.
import { HDR_WHITE } from './hdr.js';
import { clipMatrix } from './shapes.js';
import { valueAt, visualOpacity } from './model.js';

const VERTEX = `#version 300 es
in vec2 pos; in vec2 uv; out vec2 vUV;
void main(){ gl_Position=vec4(pos,0.,1.); vUV=uv; }`;
const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray planes; uniform sampler2D raster;
uniform int mode; uniform bool hlg;
uniform float opacity; uniform float exposure;
in vec2 vUV; out vec4 outColor;
vec3 fetchRGB(ivec2 p){
  p=clamp(p,ivec2(0),textureSize(planes,0).xy-1);
  vec3 c=vec3(texelFetch(planes,ivec3(p,2),0).r,texelFetch(planes,ivec3(p,0),0).r,texelFetch(planes,ivec3(p,1),0).r);
  if(hlg){
    vec3 scene=pow(max(c*${HDR_WHITE.toFixed(1)}/1000.,vec3(0.)),vec3(1./1.2));
    c=scene*pow(dot(scene,vec3(.2627,.678,.0593)),.2)*1000./${HDR_WHITE.toFixed(1)};
  }
  return c;
}
vec3 sampleRGB(vec2 uv){
  vec2 p=uv*vec2(textureSize(planes,0).xy)-.5;
  ivec2 a=ivec2(floor(p)); vec2 f=fract(p);
  return mix(mix(fetchRGB(a),fetchRGB(a+ivec2(1,0)),f.x),mix(fetchRGB(a+ivec2(0,1)),fetchRGB(a+ivec2(1,1)),f.x),f.y);
}
vec3 srgbLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
void main(){
  vec3 c; float a=1.;
  if(mode==0){
    c=sampleRGB(vUV);
  }else{
    vec4 r=texture(raster,vUV); a=r.a;
    vec3 s=srgbLinear(r.rgb);
    c=vec3(dot(s,vec3(.627403896,.329283038,.043313066)),dot(s,vec3(.069097289,.919540395,.011362316)),dot(s,vec3(.016391439,.088013308,.895595253)));
  }
  outColor=vec4(min(c*exp2(exposure),vec3(10000./${HDR_WHITE.toFixed(1)})),a*opacity);
}`;

export class HdrCompositor {
  constructor(w, h) {
    try { this.init(w, h); }
    catch (error) { this.close(); throw error; }
  }

  init(w, h) {
    this.w = w; this.h = h;
    this.canvas = new OffscreenCanvas(w, h);
    const gl = this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('HDR export needs WebGL 2 with floating-point color buffers. Try another graphics driver or export SDR.');
    const shader = (type, text) => {
      const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`HDR shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`HDR compositor: ${gl.getProgramInfoLog(this.program)}`);
    gl.useProgram(this.program);
    this.uniform = Object.fromEntries(['planes', 'raster', 'mode', 'hlg', 'opacity', 'exposure'].map(k => [k, gl.getUniformLocation(this.program, k)]));
    gl.uniform1i(this.uniform.planes, 0); gl.uniform1i(this.uniform.raster, 1);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, offset] of [['pos', 0], ['uv', 8]]) {
      const at = gl.getAttribLocation(this.program, name); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 16, offset);
    }
    const texture = (unit, target) => {
      gl.activeTexture(gl.TEXTURE0 + unit); const t = gl.createTexture(); gl.bindTexture(target, t);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.planes = texture(0, gl.TEXTURE_2D_ARRAY);
    // Both sampler types must be complete even when their shader branch is unused.
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R32F, 1, 1, 3, 0, gl.RED, gl.FLOAT, new Float32Array(3));
    this.raster = texture(1, gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.target = texture(2, gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    this.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not allocate the HDR image. Try a smaller export size.');
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.readback = new Float32Array(w * h * 4);
    this.planar = new Float32Array(w * h * 3);
    this.vertices = new Float32Array(24);
    this.check();
  }

  check() {
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('The graphics device was lost during HDR export.');
    const err = gl.getError();
    if (err !== gl.NO_ERROR) throw new Error(`HDR graphics operation failed (${err}). Try a smaller export size.`);
  }

  clear(project, matrix) {
    const gl = this.gl; gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (project && matrix) {
      const [sx, sy, tx, ty] = matrix;
      const x = Math.max(0, Math.ceil(tx)), y = Math.max(0, Math.ceil(ty));
      const right = Math.min(this.w, Math.ceil(tx + project.width * sx)), bottom = Math.min(this.h, Math.ceil(ty + project.height * sy));
      gl.enable(gl.SCISSOR_TEST); gl.scissor(x, this.h - bottom, Math.max(0, right - x), Math.max(0, bottom - y));
    }
  }

  draw({ pixels, w, h, displayW = w, hlg = false, canvas = null }, project, clip, T, matrix) {
    const gl = this.gl;
    let opacity = clip ? visualOpacity(clip, T) : 1;
    if (opacity <= 0) return;
    let rect = { x: 0, y: 0, w: project.width, h: project.height }, uv = [0, 0, 1, 1];
    const transform = clip && !canvas ? clipMatrix(clip, T, project.width, project.height, project) : new DOMMatrix();
    if (!canvas) {
      const sc = Math.min(project.width / displayW, project.height / h);
      rect = { x: (project.width - displayW * sc) / 2, y: (project.height - h * sc) / 2, w: displayW * sc, h: h * sc };
      const crop = key => Math.min(.49, Math.max(0, valueAt(clip, key, T) || 0));
      uv = [crop('cropL'), crop('cropT'), 1 - crop('cropR'), 1 - crop('cropB')];
      rect = { x: rect.x + uv[0] * rect.w, y: rect.y + uv[1] * rect.h, w: rect.w * (uv[2] - uv[0]), h: rect.h * (uv[3] - uv[1]) };
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.planes);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R32F, w, h, 3, 0, gl.RED, gl.FLOAT, pixels);
    } else {
      // Canvas layers already contain their own clip geometry and alpha.
      opacity = 1;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.raster);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
    const [sx, sy, tx, ty] = matrix;
    const corners = [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]];
    corners.forEach(([x, y], i) => {
      const p = transform.transformPoint({ x: rect.x + x * rect.w, y: rect.y + y * rect.h });
      this.vertices.set([(p.x * sx + tx) / this.w * 2 - 1, 1 - (p.y * sy + ty) / this.h * 2, uv[x ? 2 : 0], uv[y ? 3 : 1]], i * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STREAM_DRAW);
    gl.uniform1i(this.uniform.mode, canvas ? 1 : 0); gl.uniform1i(this.uniform.hlg, hlg ? 1 : 0);
    gl.uniform1f(this.uniform.opacity, opacity); gl.uniform1f(this.uniform.exposure, canvas ? 0 : valueAt(clip, 'exposure', T) || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.check();
  }

  read() {
    const gl = this.gl, { w, h, readback: rgba, planar: out } = this;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, rgba); this.check();
    const n = w * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = ((h - 1 - y) * w + x) * 4;
      out[i] = rgba[j + 1]; out[n + i] = rgba[j + 2]; out[2 * n + i] = rgba[j];
    }
    return out;
  }

  close() {
    const gl = this.gl;
    if (!gl) return;
    for (const t of [this.target, this.planes, this.raster]) if (t) gl.deleteTexture(t);
    gl.deleteFramebuffer(this.fbo); gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.readback = this.planar = null;
    this.gl = null;
  }
}
