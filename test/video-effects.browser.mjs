// Run in Electron with npm run test:render. Exercises the real GPU and Canvas fallback.
import { applyVideoEffects } from '../src/shared/videoEffectsRender.js';
import { makeVideoEffect, keyPixels } from '../src/shared/videoEffects.js';
import { drawFrame } from '../src/shared/render.js';
import { newProject, computeFrame } from '../src/shared/model.js';
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
function pixels(source) {
  const cv = document.createElement('canvas');
  cv.width = source.w;
  cv.height = source.h;
  const cx = cv.getContext('2d');
  cx.drawImage(source.img, 0, 0);
  return [...cx.getImageData(0, 0, cv.width, cv.height).data];
}
export function verify(forceCPU = false) {
  if (forceCPU) {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : original.call(this, type, ...args);
    };
    globalThis.OffscreenCanvas = undefined;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 16;
  const cx = canvas.getContext('2d');
  cx.fillStyle = '#00ff00';
  cx.fillRect(0, 0, 32, 16);
  cx.fillStyle = '#ff0000';
  cx.fillRect(8, 4, 16, 8);
  const src = { img: canvas, w: 32, h: 16 },
    e = makeVideoEffect('chroma');
  e.p.color = '#00ff00';
  e.p.despill = 0;
  let out = pixels(applyVideoEffects(src, { props: { vfx: [e] } }));
  assert(out[3] === 0, 'green background must become transparent');
  assert(out[(8 * 32 + 16) * 4] === 255 && out[(8 * 32 + 16) * 4 + 3] === 255, 'foreground must stay opaque red');
  // Varying pixel colors exercise the shader and alpha math against the CPU reference.
  const input = cx.getImageData(0, 0, 32, 16);
  for (let i = 0; i < input.data.length; i += 4) {
    input.data[i] = (i * 13) % 256;
    input.data[i + 1] = (i * 29) % 256;
    input.data[i + 2] = (i * 7) % 256;
    input.data[i + 3] = 255;
  }
  cx.putImageData(input, 0, 0);
  for (const params of [
    {},
    { choke: 2, feather: 1 },
    { choke: -2, feather: 2 },
    { invert: true },
    { view: 'matte', black: 0.1, white: 0.9 },
  ]) {
    const k = makeVideoEffect('chroma');
    Object.assign(k.p, { color: '#00ff00', despill: 0 }, params);
    const actual = pixels(applyVideoEffects(src, { props: { vfx: [k] } })),
      expected = keyPixels(input.data, 32, 16, k);
    for (let i = 3; i < actual.length; i += 4)
      assert(
        Math.abs(actual[i] - expected[i]) <= 3,
        `GPU/CPU matte differs at ${i}: ${actual[i]} vs ${expected[i]} (${JSON.stringify(params)})`,
      );
  }
  cx.fillStyle = '#00ff00';
  cx.fillRect(0, 0, 32, 16);
  cx.fillStyle = '#ff0000';
  cx.fillRect(8, 4, 16, 8);
  // A second key acts on the already keyed output, and disabled effects have no influence.
  const second = makeVideoEffect('chroma');
  second.p.color = '#ff0000';
  second.p.despill = 0;
  out = pixels(applyVideoEffects(src, { props: { vfx: [e, second] } }));
  assert(
    out.every((v, i) => i % 4 !== 3 || v === 0),
    'two color keys must remove both colors',
  );
  const opacity = makeVideoEffect('opacity');
  opacity.p.amount = 0.5;
  out = pixels(applyVideoEffects(src, { props: { vfx: [opacity, e] } }));
  assert(out[3] === 0, 'CPU/filter to GPU chain must retain keyed transparency');
  assert(Math.abs(out[(8 * 32 + 16) * 4 + 3] - 128) <= 1, 'opacity before key must remain');
  const blur = makeVideoEffect('blur');
  blur.p.amount = 2;
  out = pixels(applyVideoEffects(src, { props: { vfx: [e, blur, opacity] } }));
  assert(
    out.some((v, i) => i % 4 === 3 && v > 0),
    'key → blur → opacity must not clear its own reused canvas',
  );
  const ref = new Uint8ClampedArray(32 * 16 * 4);
  for (let i = 0; i < ref.length; i += 4) {
    ref[i + 1] = 255;
    ref[i + 3] = 255;
  }
  let binary = '';
  for (const b of ref) binary += String.fromCharCode(b);
  const difference = makeVideoEffect('difference');
  difference.p.reference = { width: 32, height: 16, pixels: btoa(binary) };
  out = pixels(applyVideoEffects(src, { props: { vfx: [difference] } }));
  assert(out[3] === 0 && out[(8 * 32 + 16) * 4 + 3] === 255, 'embedded reference must align with the source');
  // Preview/export share drawFrame; test the composite against an underlying blue clip.
  const p = newProject('Render');
  p.width = 32;
  p.height = 16;
  p.media.m = { id: 'm', kind: 'image', streams: { main: { hasVideo: true } } };
  p.clips.back = {
    id: 'back',
    enabled: true,
    type: 'image',
    mediaId: 'm',
    lane: 0,
    start: 0,
    dur: 1,
    in: 0,
    props: {},
    kf: {},
  };
  p.clips.top = {
    id: 'top',
    enabled: true,
    type: 'image',
    mediaId: 'm',
    lane: 1,
    start: 0,
    dur: 1,
    in: 0,
    props: { vfx: [e] },
    kf: {},
  };
  p.primary = ['back'];
  const blue = document.createElement('canvas');
  blue.width = 32;
  blue.height = 16;
  const bc = blue.getContext('2d');
  bc.fillStyle = '#0000ff';
  bc.fillRect(0, 0, 32, 16);
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 16;
  drawFrame(cv.getContext('2d'), p, computeFrame(p, 0.5), (c) => ({
    img: c.id === 'back' ? blue : canvas,
    w: 32,
    h: 16,
  }));
  out = pixels({ img: cv, w: 32, h: 16 });
  assert(out[2] === 255, 'key must reveal the lower track');
  assert(out[(8 * 32 + 16) * 4] === 255, 'keyed subject must remain above the lower track');
  document.body.append(cv);
  cv.style = 'width:640px;image-rendering:pixelated';
  return { mode: forceCPU ? 'CPU' : 'WebGL2', checks: 12, status: 'passed' };
}
