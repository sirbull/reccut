// Run in Electron with npm run test:render. Exercises the real GPU and Canvas fallback.
import { applyVideoEffects } from '../src/shared/videoEffectsRender.js';
import { makeVideoEffect, keyPixels } from '../src/shared/videoEffects.js';
import { drawFrame } from '../src/shared/render.js';
import { newProject, computeFrame, cameraRectAt } from '../src/shared/model.js';
import { addMediaClip, recordingChildren } from '../src/shared/ops.js';
import { gradientParams, gradientColorAt } from '../src/shared/gradient.js';
import { addMask, maskKey } from '../src/shared/shapes.js';
import { renderGradient } from '../src/shared/gradientRender.js';
import { verifyAdjustmentStyles } from './adjustment.browser.mjs';
import { verifySlideshowRender } from './slideshow-render.browser.mjs';
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
    { detail: 0.8, gamma: 1.4, edgeColor: 0.5 },
    { shadows: 0.9, shadowRange: 0.4 },
    { detail: 0.5, shadows: 0.6, gamma: 0.7, black: 0.05, white: 0.95 },
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
  verifyRecordingTracks();
  verifyAlphaEffects();
  verifyFills();
  verifyAdjustmentStyles();
  verifySlideshowRender();
  return { mode: forceCPU ? 'CPU' : 'WebGL2', checks: 86, status: 'passed' };
}

function verifyFills() {
  const cv = document.createElement('canvas');
  cv.width = 80; cv.height = 40;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0000ff'; ctx.fillRect(0, 0, 80, 40);
  const src = { img: cv, w: 80, h: 40 };
  const solid = makeVideoEffect('solid');
  solid.p.color = '#ff0000';
  const apply = (effects, source = src, target = 'main') => pixels(applyVideoEffects(source, { props: { vfx: effects } }, target));
  assert(JSON.stringify(apply([solid]).slice(0, 4)) === '[255,0,0,255]', 'solid must fill the source');
  solid.p.amount = 0.5;
  const blended = apply([solid]);
  assert(Math.abs(blended[0] - 128) <= 1 && Math.abs(blended[2] - 127) <= 1, 'fill strength must blend with original');
  solid.p.amount = 0;
  assert(JSON.stringify(apply([solid]).slice(0, 4)) === '[0,0,255,255]', 'zero strength must bypass fill');
  solid.p.amount = 1; solid.on = false;
  assert(apply([solid])[2] === 255, 'disabled fill must be bypassed');
  solid.on = true; solid.target = 'camera';
  assert(apply([solid])[2] === 255 && apply([solid], src, 'camera')[0] === 255, 'fill must respect recording targets');
  delete solid.target;
  ctx.clearRect(0, 0, 80, 40); ctx.globalAlpha = 0.5;
  ctx.fillRect(10, 10, 60, 20); ctx.globalAlpha = 1;
  solid.p.preserveAlpha = true;
  let out = apply([solid]);
  assert(out[3] === 0 && Math.abs(out[(20 * 80 + 40) * 4 + 3] - 128) <= 1, 'fill must preserve transparent and partial alpha');
  const gradient = makeVideoEffect('gradient');
  gradient.p.preserveAlpha = true;
  out = apply([solid, gradient]);
  assert(out[3] === 0 && Math.abs(out[(20 * 80 + 40) * 4 + 3] - 128) <= 1, 'consecutive fills must preserve source alpha');
  const opacity = makeVideoEffect('opacity'); opacity.p.amount = 0.5;
  out = apply([solid, gradient, opacity]);
  assert(Math.abs(out[(20 * 80 + 40) * 4 + 3] - 64) <= 1, 'fill → fill → filter must keep alpha');
  for (const mode of ['linear', 'radial', 'freeform']) {
    for (const [w, h] of [[80, 40], [40, 80]]) {
      const p = gradientParams({ mode, stops: [
        { position: 0, color: '#ff0000' }, { position: 0.4, color: '#00ff00' }, { position: 1, color: '#0000ff' },
      ] });
      const image = renderGradient(p, w, h);
      const data = pixels({ img: image, w, h });
      for (const [x, y] of [[4, 7], [30, 20], [w - 2, h - 2]]) {
        const expected = gradientColorAt(p, (x + 0.5) / w, (y + 0.5) / h, w / h);
        const offset = (y * w + x) * 4;
        assert(expected.every((v, i) => Math.abs(v - data[offset + i]) <= 2), `${mode} ${w}×${h} must match reference at ${x},${y}: ${expected} / ${data.slice(offset, offset + 3)}`);
        assert(data[offset + 3] === 255, `${mode} must fill the source opaquely`);
      }
      assert(renderGradient(p, w, h) === image, 'unchanged gradients must reuse cached full-resolution render');
    }
  }
  const free = gradientParams({ mode: 'freeform' });
  const before = pixels({ img: renderGradient(free, 80, 40), w: 80, h: 40 });
  free.points[0].radius = 1.5;
  const after = pixels({ img: renderGradient(free, 80, 40), w: 80, h: 40 });
  assert(after[(20 * 80 + 40) * 4 + 2] > before[(20 * 80 + 40) * 4 + 2] + 10, 'larger blue-point spread must visibly change the blend');
  // drawFrame is used by the viewer and export, including scaled export matrices.
  const p = newProject('Gradient export'); p.width = 80; p.height = 40;
  p.media.m = { id: 'm', kind: 'image', streams: { main: { hasVideo: true } } };
  p.clips.c = { id: 'c', enabled: true, type: 'image', mediaId: 'm', lane: 0, start: 0, dur: 1, in: 0, props: { vfx: [gradient] }, kf: {} };
  p.primary = ['c']; gradient.p.preserveAlpha = false; gradient.p.mode = 'freeform';
  const output = document.createElement('canvas'); output.width = 40; output.height = 20;
  drawFrame(output.getContext('2d'), p, computeFrame(p, 0.5), () => src, { matrix: [0.5, 0.5, 0, 0] });
  const result = output.getContext('2d').getImageData(10, 10, 1, 1).data;
  const expected = gradientColorAt(gradientParams(gradient.p), 21 / 80, 21 / 40, 2);
  assert(expected.every((v, i) => Math.abs(v - result[i]) < 5), 'scaled export must keep gradient coordinates and colors');
}

function verifyRecordingTracks() {
  const p = newProject('PiP color');
  p.width = 320;
  p.height = 180;
  const solid = (color) => {
    const img = document.createElement('canvas');
    img.width = 320;
    img.height = 180;
    const ctx = img.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 320, 180);
    return { img, w: 320, h: 180 };
  };
  const screenSource = solid('#506070');
  let cameraSource = solid('#404040');
  const m = { id: 'rec', kind: 'recording', duration: 2, streams: { screen: { hasVideo: true }, camera: { hasVideo: true } }, rec: { layouts: [[0, 6]] } };
  p.media.rec = m;
  const id = addMediaClip(p, m, 'append');
  const camera = recordingChildren(p, id)[0];
  const output = document.createElement('canvas');
  const rect = cameraRectAt(camera, 0.5, 320, 180);
  const center = [Math.floor(rect.x + rect.w / 2), Math.floor(rect.y + rect.h / 2)];
  const render = (scale = 1) => {
    output.width = 320 * scale;
    output.height = 180 * scale;
    drawFrame(output.getContext('2d'), p, computeFrame(p, 0.5), (_clip, key) => key === 'camera' ? cameraSource : screenSource, scale === 1 ? {} : { matrix: [scale, scale, 0, 0] });
    return (x, y) => [...output.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data];
  };
  let pixel = render();
  const beforeScreen = pixel(10, 10);
  const beforeCamera = pixel(...center);
  camera.props.cameraExposure = 0.5;
  pixel = render();
  assert(pixel(...center)[0] > beforeCamera[0] + 15, 'raising PiP exposure must brighten the camera');
  assert(JSON.stringify(pixel(10, 10)) === JSON.stringify(beforeScreen), 'PiP correction must leave the screen unchanged');
  const preview = pixel(...center);
  pixel = render(0.5);
  assert(pixel(...center).every((v, i) => Math.abs(v - preview[i]) <= 2), `export matrix must preserve PiP correction: ${preview} / ${pixel(...center)}`);
  camera.props.cameraTemperature = 1;
  pixel = render();
  assert(pixel(...center)[0] > pixel(...center)[2], 'PiP white balance must work in both GPU and Canvas fallback');
  camera.props.cameraExposure = 0;
  camera.props.cameraTemperature = 0;
  cameraSource = solid('#b05030');
  camera.props.cameraSaturation = -1;
  pixel = render();
  const gray = pixel(...center);
  assert(Math.abs(gray[0] - gray[1]) <= 1 && Math.abs(gray[1] - gray[2]) <= 1, 'PiP saturation must be independent');
  camera.props.cameraSaturation = 0;
  camera.props.cameraTemperature = 1;
  cameraSource = solid('#00ff00');
  camera.kf.layout = [[0, 1]];
  const key = makeVideoEffect('chroma');
  key.target = 'camera';
  key.p.color = '#00ff00';
  camera.props.vfx = [key];
  pixel = render();
  assert(pixel(...center).every((v, i) => Math.abs(v - beforeScreen[i]) <= 2), 'PiP correction must preserve keyed transparency');
  camera.props.vfx = [];
  camera.kf.layout = [[0, 1]];
  cameraSource = solid('#404040');
  camera.props.cameraExposure = 0.5;
  pixel = render();
  assert(pixel(10, 10)[0] > beforeCamera[0] + 15, 'corrected camera must also work full screen');
  camera.props.showCamera = false;
  pixel = render();
  assert(JSON.stringify(pixel(10, 10)) === JSON.stringify(beforeScreen), 'hiding PiP must reveal a clean screen without a second camera copy');
}

function verifyAlphaEffects() {
  const W = 320, H = 180;
  const source = document.createElement('canvas'); source.width = W; source.height = H;
  const sc = source.getContext('2d');
  sc.fillStyle = '#00ff00'; sc.fillRect(0, 0, W, H);
  sc.fillStyle = '#ff0000'; sc.fillRect(120, 45, 80, 90);
  const key = makeVideoEffect('chroma'); key.p.color = '#00ff00';
  const p = newProject('Alpha effects'); p.width = W; p.height = H;
  p.media.m = { id: 'm', kind: 'image', streams: { main: { hasVideo: true } } };
  const c = p.clips.c = { id: 'c', enabled: true, type: 'image', mediaId: 'm', lane: 0, start: 0, dur: 1, in: 0, props: { vfx: [key], shadow: 0.8 }, kf: {} };
  p.primary = ['c'];
  const output = document.createElement('canvas');
  const render = (scale = 1, transparent = true) => {
    output.width = W * scale; output.height = H * scale;
    drawFrame(output.getContext('2d'), p, computeFrame(p, 0.5), () => ({ img: source, w: W, h: H }), { matrix: [scale, scale, 0, 0], transparent });
    return (x, y) => [...output.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data];
  };
  let pixel = render();
  assert(pixel(10, 10)[3] === 0, 'drop shadow must preserve the keyed background alpha');
  assert(pixel(160, 90)[0] === 255, 'drop shadow must preserve the keyed subject');
  const shadow = pixel(160, 140);
  assert(shadow[3] > 0 && shadow[3] < 150 && shadow[0] === 0, 'shadow must follow the visible silhouette');
  const preview = pixel(160, 140)[3];
  pixel = render(0.5);
  assert(Math.abs(pixel(160, 140)[3] - preview) < 12, 'scaled export must keep shadow size');
  // Large amounts, independent opacity, a sharp colored edge and signed X/Y offsets.
  c.props.shadow = 5;
  pixel = render();
  assert(pixel(95, 90)[3] > 0, '500% must spread the shadow well beyond the original edge');
  Object.assign(c.props, { shadowColor: '#0000ff', shadowSoftness: 0, shadowOpacity: 0.5, shadowOffsetX: 60, shadowOffsetY: -20 });
  pixel = render();
  assert(pixel(230, 90)[2] === 255 && Math.abs(pixel(230, 90)[3] - 128) <= 1, 'sharp blue shadow must use its own opacity and position');
  assert(pixel(230, 120)[3] === 0, 'negative Y must move the sharp shadow upward');
  assert(pixel(160, 90)[0] === 255 && pixel(160, 90)[3] === 255, 'shadow color and opacity must leave the source intact');
  pixel = render(0.5);
  assert(pixel(230, 90)[2] === 255 && Math.abs(pixel(230, 90)[3] - 128) <= 1, 'custom shadow offsets must scale with preview/export');
  c.kf.shadowOffsetX = [[0, -60], [1, -60]];
  pixel = render();
  assert(pixel(80, 90)[2] === 255 && pixel(230, 90)[3] === 0, 'shadow position keyframes must control rendering');
  delete c.kf.shadowOffsetX;
  c.props.shadowOpacity = 0;
  pixel = render();
  assert(pixel(230, 90)[3] === 0 && pixel(160, 90)[3] === 255, 'zero shadow opacity must preserve the source');
  for (const key of ['shadowColor', 'shadowSoftness', 'shadowOpacity', 'shadowOffsetX', 'shadowOffsetY']) delete c.props[key];
  c.props.shadow = 0.8;
  Object.assign(c.props, { vignette: 0.7, temperature: 0.5, blur: 1, sepia: 0.3, exposure: 0.1 });
  pixel = render();
  assert(pixel(10, 10)[3] === 0, 'vignette, grading and clip filters must keep keyed transparency');
  c.props.opacity = 0.5;
  pixel = render();
  assert(Math.abs(pixel(160, 90)[3] - 128) < 3, 'clip opacity must apply once to the complete result');
  Object.assign(c.props, { opacity: 1, vignette: 0, temperature: 0, blur: 0, sepia: 0, exposure: 0 });
  const mask = addMask(c, 'rect', W, H);
  c.props[maskKey(mask, 'w')] = 40;
  c.props[maskKey(mask, 'h')] = 70;
  pixel = render();
  assert(pixel(160, 90)[3] === 255 && pixel(125, 90)[0] === 0 && pixel(125, 90)[3] < 10, `user mask must cut the subject before shadow generation: ${pixel(160, 90)} / ${pixel(125, 90)}`);
  assert(pixel(160, 130)[3] > 0, 'mask must cast a shadow beyond its own edge');
  c.props.opacity = 0.5;
  pixel = render();
  assert(Math.abs(pixel(160, 90)[3] - 128) <= 1, 'masked shadow and source must fade as one layer');
  c.props.opacity = 1;
  // Moving, rotating and cropping the keyed clip must keep empty areas transparent.
  c.props.masks = [];
  Object.assign(c.props, { x: 20, y: 5, rotation: 10, scale: 0.8, cropL: 0.1, cropR: 0.1 });
  pixel = render();
  assert(pixel(10, 10)[3] === 0 && pixel(180, 95)[0] > 200, 'transformed keyed clip must retain its alpha silhouette');
  // A second visible track remains visible behind the key plus shadow.
  p.clips.back = { ...c, id: 'back', lane: 0, props: {}, kf: {} };
  c.lane = 1; p.primary = ['back'];
  const back = document.createElement('canvas'); back.width = W; back.height = H;
  const bc = back.getContext('2d'); bc.fillStyle = '#ffffff'; bc.fillRect(0, 0, W, H);
  output.width = W; output.height = H;
  drawFrame(output.getContext('2d'), p, computeFrame(p, 0.5), (clip) => ({ img: clip.id === 'back' ? back : source, w: W, h: H }));
  assert(output.getContext('2d').getImageData(10, 10, 1, 1).data[0] === 255, 'underlying track must show through keyed clip effects');
}
