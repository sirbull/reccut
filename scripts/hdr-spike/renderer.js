import { ALL_FORMATS, BufferSource, Input, VideoSampleSink } from 'mediabunny';
import { probeHdrGrade } from '../../src/shared/grade.js';
import { drawFrame } from '../../src/shared/render.js';
import { newProject, makeClip } from '../../src/shared/model.js';
const fs = window.require('node:fs'), { spawn } = window.require('node:child_process');
const make = (w, h, options = {}) => {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  return { canvas, ctx: canvas.getContext('2d', options) };
};
const read = ctx => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height, { pixelFormat: 'rgba-float16', colorSpace: ctx.getContextAttributes().colorSpace });
const at = (image, x, y) => Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));
const relativeError = (actual, expected) => Math.max(...actual.map((v, i) => Math.abs(v - expected[i]) / Math.max(1, Math.abs(expected[i]))));
function solid(w, h, value, colorSpace = 'srgb') {
  const result = make(w, h, { colorType: 'float16', colorSpace });
  const data = new Float16Array(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, 1], i);
  result.ctx.putImageData(new ImageData(data, w, h, { pixelFormat: 'rgba-float16', colorSpace }), 0, 0);
  return result;
}
async function canvasTest() {
  const results = [];
  for (const colorSpace of ['srgb', 'display-p3']) {
    const initial = make(64, 64, { colorType: 'float16', colorSpace });
    const attributes = initial.ctx.getContextAttributes();
    if (typeof Float16Array === 'undefined') { results.push({ colorSpace, attributes, error: 'Float16Array is unavailable', operations: [] }); continue; }
    for (const value of [0.1, 100 / 203, 1, 1000 / 203, 4000 / 203, 10000 / 203]) {
      const source = solid(64, 64, value, colorSpace), stored = at(read(source.ctx), 32, 32);
      const operations = [];
      for (const mode of ['drawImage', 'setTransform', 'smoothScale', 'globalAlpha', 'source-over', 'destination-in', 'destination-out', 'lighter', 'source-atop', 'clip', 'blur', 'brightness', 'contrast', 'saturate', 'shadow', 'text', 'imageBitmap']) {
        const { canvas, ctx } = make(64, 64, { colorType: 'float16', colorSpace });
        let expected = [value, value, value, 1], error = null;
        try {
          if (mode === 'setTransform') ctx.setTransform(1, 0, 0, 1, 2, 2);
          if (mode === 'clip') { ctx.beginPath(); ctx.rect(8, 8, 48, 48); ctx.clip(); }
          if (mode === 'globalAlpha') { ctx.globalAlpha = 0.5; expected[3] = 0.5; }
          if (mode === 'source-atop') { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 64, 64); ctx.globalCompositeOperation = 'source-atop'; }
          if (['blur', 'brightness', 'contrast', 'saturate'].includes(mode)) {
            ctx.filter = { blur: 'blur(2px)', brightness: 'brightness(1.2)', contrast: 'contrast(1.2)', saturate: 'saturate(2)' }[mode];
            if (mode === 'brightness') expected = [value * 1.2, value * 1.2, value * 1.2, 1];
            if (mode === 'contrast') { const x = Math.max(0, (value - 0.5) * 1.2 + 0.5); expected = [x, x, x, 1]; }
          }
          if (mode === 'shadow') { ctx.shadowColor = 'white'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 8; }
          if (mode === 'imageBitmap') { const bitmap = await createImageBitmap(source.canvas); ctx.drawImage(bitmap, 0, 0); bitmap.close(); }
          else ctx.drawImage(source.canvas, 0, 0, mode === 'smoothScale' ? 128 : 64, mode === 'smoothScale' ? 128 : 64);
          if (mode === 'text') { ctx.font = '12px sans-serif'; ctx.fillStyle = 'white'; ctx.fillText('HDR', 2, 12); }
          if (mode === 'source-over') { ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(source.canvas, 0, 0); }
          if (mode === 'lighter') { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(source.canvas, 0, 0); expected = [value * 2, value * 2, value * 2, 1]; }
          if (mode === 'destination-in' || mode === 'destination-out') { ctx.globalCompositeOperation = mode; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(0, 0, 64, 64); expected[3] = 0.5; }
          const image = read(ctx), actual = at(image, 32, 32), deviation = relativeError(actual, expected);
          operations.push({ mode, actual, expected, maxError: deviation, pass: deviation < 0.005, readback: image.data.constructor.name });
        } catch (e) { error = e.message; operations.push({ mode, error, pass: false }); }
        canvas.width = canvas.height = 1;
      }
      results.push({ colorSpace, attributes, value, stored, operations });
      source.canvas.width = source.canvas.height = 1;
    }
  }
  const srgb = results.filter(r => r.colorSpace === 'srgb'), modes = srgb.flatMap(r => r.operations);
  const basePass = srgb.length === 6 && srgb.every(r => r.attributes.colorType === 'float16' && relativeError(r.stored, [r.value, r.value, r.value, 1]) < 0.005);
  const corePass = basePass && modes.filter(m => !['blur', 'brightness', 'contrast', 'saturate', 'shadow'].includes(m.mode)).every(m => m.pass);
  const graphics = make(640, 360); graphics.ctx.fillStyle = 'white'; graphics.ctx.font = '48px sans-serif'; graphics.ctx.fillText('SDR reference white', 20, 160);
  fs.writeFileSync(window.hdrDirectory + '/graphics.png', window.require('node:buffer').Buffer.from(graphics.canvas.toDataURL().split(',')[1], 'base64'));
  const encode = x => x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  const decode = x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  let linearBlend;
  try {
    const a = solid(16, 16, encode(0.25)), b = solid(16, 16, encode(4)), dst = make(16, 16, { colorType: 'float16' });
    dst.ctx.drawImage(a.canvas, 0, 0); dst.ctx.globalAlpha = 0.5; dst.ctx.drawImage(b.canvas, 0, 0);
    const measured = decode(at(read(dst.ctx), 8, 8)[0]);
    linearBlend = { linearInputs: [0.25, 4], expectedLinear: 2.125, measuredLinear: measured, relativeError: Math.abs(measured - 2.125) / 2.125 };
  } catch (e) { linearBlend = { error: e.message }; }
  return { status: corePass ? modes.every(m => m.pass) ? 'pass' : 'partial' : 'fail', results,
    linearBlend,
    interpretation: 'These are extended encoded sRGB/display-P3 channel values, not linear nits. Numeric preservation is necessary but does not prove scene-linear blending or calibrated HDR display output.' };
}

function floatSurface(w, h) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw Error('WebGL2 float render targets unavailable.');
  const texture = (data = null) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.FLOAT, data); return t;
  };
  const source = texture(), target = texture(), fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('RGBA16F framebuffer incomplete.');
  const shader = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s)); return s; };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, '#version 300 es\nout vec2 uv; void main(){vec2 p=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}'));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;in vec2 uv;out vec4 o;uniform sampler2D img;uniform float exposure,alpha;void main(){o=vec4(texture(img,uv).rgb*exposure,alpha);}'));
  gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program); gl.uniform1i(gl.getUniformLocation(program, 'img'), 0);
  const exposure = gl.getUniformLocation(program, 'exposure'), alpha = gl.getUniformLocation(program, 'alpha');
  function draw(data, layers = 1, multiplier = 1) {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.FLOAT, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(exposure, multiplier);
    for (let i = 0; i < layers; i++) { gl.uniform1f(alpha, i ? 0.2 : 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
  }
  function pixels() { const data = new Float32Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data); if (gl.getError()) throw Error('Float framebuffer readback GL error.'); return data; }
  return { gl, canvas, draw, pixels, dispose() { gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.width = canvas.height = 1; } };
}
function planarToRgba(bytes, w, h) {
  const data = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), count = w * h, rgba = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { rgba[i * 4] = data[count * 2 + i]; rgba[i * 4 + 1] = data[i]; rgba[i * 4 + 2] = data[count + i]; rgba[i * 4 + 3] = 1; }
  return rgba;
}
function rgbaToPlanar(rgba) {
  const count = rgba.length / 4, data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { data[i] = rgba[i * 4 + 1]; data[count + i] = rgba[i * 4 + 2]; data[count * 2 + i] = rgba[i * 4]; }
  return window.require('node:buffer').Buffer.from(data.buffer);
}
async function uploadTest({ file, w, h }) {
  const rgba = planarToRgba(fs.readFileSync(file), w, h), surface = floatSurface(w, h);
  surface.draw(rgba); const output = surface.pixels();
  const fields = Array.from({ length: 10 }, (_, k) => {
    const i = (Math.floor(h * 0.3) * w + Math.floor((k + 0.5) * w / 10)) * 4;
    return { input: Array.from(rgba.slice(i, i + 3)), output: Array.from(output.slice(i, i + 3)) };
  });
  const maxError = Math.max(...fields.map(f => relativeError(f.output, f.input)));
  const formats = [];
  for (const format of ['RGBAF16', 'RGBAF32', 'RGBAF16LE']) {
    try { const f = new VideoFrame(new Uint8Array(64), { format, codedWidth: 2, codedHeight: 2, timestamp: 0 }); formats.push({ format, accepted: true, actual: f.format }); f.close(); }
    catch (e) { formats.push({ format, accepted: false, error: e.message }); }
  }
  surface.dispose();
  return { floatTexturePreserved: maxError < 0.005, maxError, fields, videoFrameFloatFormats: formats };
}
async function decodeTest({ fixtures }) {
  const results = [];
  for (const f of fixtures) {
    let input, sample, frame;
    try {
      input = new Input({ formats: ALL_FORMATS, source: new BufferSource(new Uint8Array(fs.readFileSync(f.file))) });
      const track = await input.getPrimaryVideoTrack();
      const config = await track.getDecoderConfig();
      sample = await new VideoSampleSink(track).getSample(0);
      if (!sample) throw Error('No decoded sample.');
      frame = sample.toVideoFrame();
      const canvases = [];
      for (const mode of ['standard', 'extended']) {
        const { canvas, ctx } = make(f.w, f.h, { colorType: 'float16', colorSpace: 'srgb', toneMapping: { mode } });
        ctx.drawImage(frame, 0, 0); const image = read(ctx);
        const scale = image.data instanceof Uint8ClampedArray ? 1 / 255 : 1;
        const fields = Array.from({ length: 10 }, (_, k) => at(image, Math.floor((k + 0.5) * f.w / 10), Math.floor(f.h * 0.3)).map(v => v * scale));
        canvases.push({ requestedToneMapping: mode, canvas: ctx.getContextAttributes(), readback: image.data.constructor.name, fields, retainedHeadroom: Math.max(...fields.flatMap(p => p.slice(0, 3))) > 1.01 });
        canvas.width = canvas.height = 1;
      }
      results.push({ transfer: f.transfer, height: f.h, decoderConfig: config, frameFormat: frame.format, colorSpace: frame.colorSpace.toJSON(), canvases,
        retainedHeadroom: canvases.some(c => c.retainedHeadroom), calibratedNits: false });
    } catch (e) { results.push({ transfer: f.transfer, height: f.h, error: e.message }); }
    finally { frame?.close(); sample?.close(); input?.dispose(); }
  }
  return { status: results.every(r => r.retainedHeadroom) ? 'headroom-preserved-colorimetry-unverified' : 'not-preserved-or-decoder-unavailable', results };
}
async function gradeTest() {
  const values = [0.1, 0.49, 1, 1000 / 203, 4000 / 203, 10000 / 203];
  const cases = {};
  for (const [name, params] of Object.entries({ neutral: {}, plusOneStop: { exposure: 0.5 }, minusOneStop: { exposure: -0.5 }, contrast: { contrast: 0.2 }, highlights: { highlights: 0.3 }, shadows: { shadows: 0.3 }, wheels: { liftL: 0.2, gainL: 0.2 } })) cases[name] = probeHdrGrade(values, params);
  const surface = floatSurface(values.length, 1), rgba = new Float32Array(values.flatMap(v => [v, v, v, 1]));
  const controls = {};
  for (const multiplier of [0.5, 1, 2]) { surface.draw(rgba, 1, multiplier); const p = surface.pixels(); controls[multiplier] = values.map((_, i) => p[i * 4]); }
  surface.dispose();
  return { status: cases.neutral.values?.at(-1) > 1 ? 'inspect-results' : 'existing-shader-clamps-HDR', values, cases, linearFloatShaderControl: controls,
    instrumentation: 'Unmodified current grade GLSL, injected Float32 input and RGBA16F framebuffer only in the temporary esbuild bundle. Current gamma-2.2 math and clamp remain. Positive control uses a separate linear shader.' };
}
async function encoders() {
  const results = [];
  for (const codec of ['hvc1.2.4.L153.B0', 'av01.0.08M.10', 'vp09.02.41.10']) {
    const requested = { codec, width: 1920, height: 1080, framerate: 24, bitrate: 10000000, colorSpace: { primaries: 'bt2020', transfer: 'pq', matrix: 'bt2020-ncl', fullRange: false } };
    try { const supported = await VideoEncoder.isConfigSupported(requested); results.push({ requested, supported, colorSpaceRetained: Object.hasOwn(supported.config, 'colorSpace') }); }
    catch (e) { results.push({ requested, error: e.message }); }
  }
  return { results, limitation: 'isConfigSupported alone does not prove 10-bit output, retained HDR metadata or a working encode. Unknown dictionary members may be stripped.' };
}
async function pipeline({ file, w, h, ffmpeg, mode, frames, dir }) {
  const Buffer = window.require('node:buffer').Buffer;
  const linear = mode !== 'sdr', pixelBytes = w * h * (linear ? 12 : 4);
  let source, output, glSurface;
  const project = newProject('HDR spike'); project.width = w; project.height = h;
  project.media.source = { id: 'source', kind: 'image', width: w, height: h, path: 'synthetic' };
  const layers = Array.from({ length: 5 }, (_, lane) => ({ clip: makeClip('image', { media: project.media.source, lane, dur: frames / 24, props: { opacity: lane ? 0.2 : 1 } }), T: 0 }));
  if (mode === 'webgl') glSurface = floatSurface(w, h);
  else {
    source = make(w, h, linear ? { colorType: 'float16' } : {});
    output = make(w, h, linear ? { colorType: 'float16' } : {});
    if (linear && (output.ctx.getContextAttributes().colorType !== 'float16' || typeof Float16Array === 'undefined')) throw Error('Float16 Canvas is unavailable.');
  }
  const { videoFilters } = window.require(window.hdrRoot + '/src/main/ffmpeg.js');
  const vf = linear ? 'zscale=tin=smpte2084:min=bt2020nc:pin=bt2020:t=linear:npl=203,format=gbrpf32le' : [...videoFilters({ color: { hdr: 'pq' } }), 'format=rgba'].join(',');
  const outputFile = `${dir}/${mode}-${h}.mkv`;
  const encodeVf = linear ? 'zscale=tin=linear:pin=bt2020:min=gbr:t=smpte2084:p=bt2020:m=bt2020nc:npl=203:r=limited,format=yuv420p10le' : 'format=yuv420p';
  const start = performance.now();
  const decoder = spawn(ffmpeg, ['-v', 'error', '-nostdin', '-threads', '2', '-filter_threads', '2', '-stream_loop', '-1', '-i', file, '-frames:v', String(frames), '-vf', vf, '-f', 'rawvideo', '-pix_fmt', linear ? 'gbrpf32le' : 'rgba', 'pipe:1'], { windowsHide: true });
  const encoder = spawn(ffmpeg, ['-v', 'error', '-nostdin', '-y', '-threads', '2', '-filter_threads', '2', '-f', 'rawvideo', '-pixel_format', linear ? 'gbrpf32le' : 'rgba', '-video_size', `${w}x${h}`, '-framerate', '24', '-i', 'pipe:0', '-vf', encodeVf, '-c:v', linear ? 'libx265' : 'libx264', '-preset', 'ultrafast', ...(linear ? ['-x265-params', 'lossless=1:pools=2:frame-threads=2', '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'] : ['-crf', '18']), outputFile], { windowsHide: true });
  let decoderLog = '', encoderLog = '', pipeError = null;
  decoder.stderr.on('data', b => { decoderLog = (decoderLog + b).slice(-2000); }); encoder.stderr.on('data', b => { encoderLog = (encoderLog + b).slice(-2000); });
  encoder.stdout.resume(); encoder.stdin.on('error', e => { pipeError = e; });
  const complete = p => new Promise(resolve => { p.on('error', e => resolve({ error: e.message })); p.on('close', code => resolve({ code })); });
  const decoderDone = complete(decoder), encoderDone = complete(encoder);
  const timer = setTimeout(() => { decoder.kill(); encoder.kill(); }, 180000);
  let pending = [], pendingBytes = 0, done = 0, renderMs = 0, readbackMs = 0, packingMs = 0, inputPackingMs = 0;
  try {
    for await (const chunk of decoder.stdout) {
      pending.push(chunk); pendingBytes += chunk.length;
      while (pendingBytes >= pixelBytes) {
        const raw = Buffer.allocUnsafe(pixelBytes);
        let copied = 0;
        while (copied < pixelBytes) {
          const head = pending[0], take = Math.min(head.length, pixelBytes - copied);
          head.copy(raw, copied, 0, take); copied += take;
          if (take === head.length) pending.shift(); else pending[0] = head.subarray(take);
        }
        pendingBytes -= pixelBytes;
        let t = performance.now(), rgba;
        if (linear) rgba = planarToRgba(raw, w, h);
        if (mode === 'float16') source.ctx.putImageData(new ImageData(new Float16Array(rgba), w, h, { pixelFormat: 'rgba-float16' }), 0, 0);
        else if (mode === 'sdr') source.ctx.putImageData(new ImageData(new Uint8ClampedArray(raw), w, h), 0, 0);
        inputPackingMs += performance.now() - t; t = performance.now();
        if (mode === 'webgl') glSurface.draw(rgba, 5);
        else drawFrame(output.ctx, project, { layers, captions: [], T: done / 24 }, () => ({ img: source.canvas, w, h }));
        renderMs += performance.now() - t; t = performance.now();
        const pixels = mode === 'webgl' ? glSurface.pixels() : linear ? read(output.ctx).data : output.ctx.getImageData(0, 0, w, h).data;
        readbackMs += performance.now() - t; t = performance.now();
        const bytes = linear ? rgbaToPlanar(pixels) : Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
        packingMs += performance.now() - t;
        if (pipeError) throw pipeError;
        if (!encoder.stdin.write(bytes)) await new Promise((resolve, reject) => {
          const cleanup = () => { encoder.stdin.removeListener('drain', drained); encoder.stdin.removeListener('error', failed); };
          const drained = () => { cleanup(); resolve(); }, failed = error => { cleanup(); reject(error); };
          encoder.stdin.once('drain', drained); encoder.stdin.once('error', failed);
        });
        done++;
      }
    }
    encoder.stdin.end();
    const dc = await decoderDone, ec = await encoderDone;
    if (dc.code !== 0 || ec.code !== 0 || done !== frames) throw Error(`Pipeline failed (${done}/${frames} frames). ${decoderLog} ${encoderLog}`);
    const totalMs = performance.now() - start;
    return { height: h, width: w, mode, frames: done, totalMs, fps: done / (totalMs / 1000), inputPackingMs, renderMs, readbackMs, outputPackingMs: packingMs,
      file: outputFile, codePath: mode === 'webgl' ? 'prospective RGBA16F linear compositor, five alpha-blended layers' : 'actual drawFrame, five layers', codec: linear ? 'libx265 lossless ultrafast' : 'libx264 CRF18 ultrafast',
      caveats: 'Includes process startup; short synthetic sample, no effects. Decoder/encoder use two threads. Float16 Canvas carries numeric linear values but scene-linear Canvas compositing is not established by this probe.' };
  } catch (error) { throw Error(`${error.message}; decoder: ${decoderLog}; encoder: ${encoderLog}`); }
  finally { clearTimeout(timer); decoder.kill(); encoder.kill(); glSurface?.dispose(); if (source) source.canvas.width = source.canvas.height = output.canvas.width = output.canvas.height = 1; }
}
function preview() {
  const colorSpaces = [];
  for (const colorSpace of ['srgb', 'display-p3', 'rec2100-pq', 'rec2100-hlg']) {
    try { colorSpaces.push({ requested: colorSpace, actual: make(16, 16, { colorType: 'float16', colorSpace }).ctx.getContextAttributes() }); }
    catch (e) { colorSpaces.push({ requested: colorSpace, error: e.message }); }
  }
  return { dynamicRangeHigh: matchMedia('(dynamic-range: high)').matches, videoDynamicRangeHigh: matchMedia('(video-dynamic-range: high)').matches,
    colorGamutP3: matchMedia('(color-gamut: p3)').matches, colorSpaces,
    status: 'capability-inventory-only', actualHdrDisplayVerified: false, reason: 'Hidden window cannot certify emitted nits or Windows HDR mode. No visual acceptance on a calibrated HDR display was performed.' };
}
window.hdrSpike = { canvas: canvasTest, decode: decodeTest, upload: uploadTest, grade: gradeTest, encoders, pipeline, preview };
