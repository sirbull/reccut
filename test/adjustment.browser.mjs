import { applyVideoEffects } from '../src/shared/videoEffectsRender.js';
import { makeVideoEffect, VIDEO_EFFECTS } from '../src/shared/videoEffects.js';
import { drawFrame } from '../src/shared/render.js';
import { newProject, computeFrame, makeClip } from '../src/shared/model.js';
import { stylizePixels, stylizeSettings } from '../src/shared/stylize.js';
import { addMask, maskKey } from '../src/shared/shapes.js';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
function pixels(source) {
  const cv = document.createElement('canvas'); cv.width = source.w; cv.height = source.h;
  const ctx = cv.getContext('2d'); ctx.drawImage(source.img, 0, 0);
  return [...ctx.getImageData(0, 0, cv.width, cv.height).data];
}
export function verifyAdjustmentStyles() { verifyStylize(); verifyAdjustment(); }
function verifyStylize() {
  const w = 96, h = 48, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'), input = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) input.data.set([x * 2, y * 5, (x + y) % 256, 255], (y * w + x) * 4);
  ctx.putImageData(input, 0, 0);
  const src = { img: cv, w, h };
  const render = (effect, t = 0.5) => pixels(applyVideoEffects(src, { props: { vfx: [effect] } }, 'main', t));
  for (const type of ['noise', 'glitch', 'vhs', 'rgbSplit', 'scanlines', 'filmGrain', 'chromatic']) {
    const e = makeVideoEffect(type);
    if (type === 'noise') e.p.colored = true;
    const expected = stylizePixels(input.data, w, h, stylizeSettings(type, e.p, 0.5, w, h));
    const actual = render(e);
    for (let i = 0; i < actual.length; i++) assert(Math.abs(actual[i] - expected[i]) <= 2, `${type} GPU/CPU differs at ${i}: ${actual[i]} / ${expected[i]}`);
    assert(JSON.stringify(render(e)) === JSON.stringify(actual), `${type} must reproduce the same frame after seeking`);
    if (['noise', 'glitch', 'vhs', 'filmGrain'].includes(type)) {
      assert(JSON.stringify(render(e, 0.8)) !== JSON.stringify(actual), `${type} must animate`);
      e.p.speed = 0;
      assert(JSON.stringify(render(e, 2)) === JSON.stringify(render(e, 10)), `${type} speed zero must freeze`);
    }
  }
  for (const [type, params, time] of [
    ['vhs', VIDEO_EFFECTS.find((d) => d.type === 'vhs').presets.find((p) => p.id === 'ep').p, 23 / 24],
    ['filmGrain', VIDEO_EFFECTS.find((d) => d.type === 'filmGrain').presets.find((p) => p.id === '8mm').p, 2.375],
    ['chromatic', { amount: 1, centerX: 0.2, centerY: 0.7, falloff: 1.4 }, 0],
  ]) {
    const e = makeVideoEffect(type); Object.assign(e.p, params);
    const expected = stylizePixels(input.data, w, h, stylizeSettings(type, e.p, time, w, h));
    const actual = render(e, time);
    for (let i = 0; i < actual.length; i++) assert(Math.abs(actual[i] - expected[i]) <= 2, `${type} advanced GPU/CPU differs at ${i}: ${actual[i]} / ${expected[i]}`);
  }
  const translucent = ctx.getImageData(0, 0, w, h);
  for (let i = 3; i < translucent.data.length; i += 4) translucent.data[i] = 128;
  ctx.putImageData(translucent, 0, 0);
  for (const type of ['vhs', 'filmGrain', 'chromatic']) {
    const result = render(makeVideoEffect(type));
    assert(result.every((v, i) => i % 4 !== 3 || Math.abs(v - 128) <= 1), `${type} must preserve partial source alpha`);
  }
  ctx.putImageData(input, 0, 0);
  const glow = makeVideoEffect('glow');
  const glowing = render(glow);
  assert(glowing[(24 * w + 48) * 4] > input.data[(24 * w + 48) * 4], 'glow must brighten the source');
  const clip = { props: { vfx: [makeVideoEffect('noise'), makeVideoEffect('glitch'), glow, makeVideoEffect('scanlines')] } };
  const chain = pixels(applyVideoEffects(src, clip, 'main', 0.5));
  assert(chain.some((v, i) => i % 4 !== 3 && v > 0), 'creative effect chains must not erase their own input');
  assert(chain.every((v, i) => i % 4 !== 3 || v === 255), 'creative effect chains must retain opaque alpha');
}
function verifyAdjustment() {
  const W = 160, H = 90, p = newProject('Adjustment rendering'); p.width = W; p.height = H;
  const source = (color, rect = [0, 0, W, H]) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'); cx.fillStyle = color; cx.fillRect(...rect); return { img: cv, w: W, h: H };
  };
  const sources = { base: source('#204060'), lower: source('#ee4020', [0, 0, W / 2, H]), upper: source('#00ff00', [110, 10, 30, 30]) };
  for (const [id, lane] of [['base', 0], ['lower', 1], ['upper', 3]]) {
    p.media[id] = { id, kind: 'image', streams: { main: { hasVideo: true } } };
    p.clips[id] = makeClip('image', { media: p.media[id], lane, dur: 2 }); p.clips[id].id = id;
  }
  const a = makeClip('adjustment', { lane: 2, dur: 2 }); p.clips[a.id] = a; p.primary = ['base'];
  const cv = document.createElement('canvas');
  const render = ({ t = 0.5, scale = 1, crop = false, transparent = false } = {}) => {
    cv.width = crop ? 80 : Math.round(W * scale); cv.height = Math.round(H * scale);
    drawFrame(cv.getContext('2d'), p, computeFrame(p, t), (c) => {
      assert(c.type !== 'adjustment', 'adjustments must never request a media source'); return sources[c.id];
    }, { transparent, matrix: crop ? [1, 1, -40, 0] : [scale, scale, 0, 0] });
    return [...cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data];
  };
  const pixel = (data, x, y, w = W) => data.slice((y * w + x) * 4, (y * w + x) * 4 + 4);
  const plain = render(); a.enabled = false;
  assert(JSON.stringify(render()) === JSON.stringify(plain), 'blank adjustment must be a no-op'); a.enabled = true;
  a.props.grayscale = 1;
  const gray = render();
  for (const x of [30, 90]) { const c = pixel(gray, x, 50); assert(Math.abs(c[0] - c[1]) <= 1 && Math.abs(c[1] - c[2]) <= 1, 'adjustment must affect both lower tracks'); }
  assert(JSON.stringify(pixel(gray, 120, 20)) === '[0,255,0,255]', 'upper track must remain unchanged');
  a.props.opacity = 0.5;
  const half = render();
  assert(pixel(half, 30, 50).every((v, i) => Math.abs(v - (pixel(plain, 30, 50)[i] + pixel(gray, 30, 50)[i]) / 2) <= 2), 'layer strength must blend the whole look once');
  a.props.opacity = 1;
  const mask = addMask(a, 'rect', W, H);
  a.props[maskKey(mask, 'w')] = W / 2; a.props[maskKey(mask, 'h')] = H; a.props[maskKey(mask, 'x')] = -W / 4;
  const masked = render();
  assert(pixel(masked, 30, 50)[0] === pixel(gray, 30, 50)[0], 'mask must include lower-left picture');
  assert(JSON.stringify(pixel(masked, 90, 50)) === JSON.stringify(pixel(plain, 90, 50)), 'mask must preserve the original outside its region');
  a.props.masks = []; a.props.grayscale = 0; a.props.exposure = 0.3;
  const exposed = render();
  assert(pixel(exposed, 90, 50)[0] > pixel(plain, 90, 50)[0], 'Color controls must adjust the composite');
  assert(JSON.stringify(pixel(exposed, 120, 20)) === '[0,255,0,255]', 'Color controls must not affect upper tracks');
  a.props.exposure = 0; a.props.vfx = [makeVideoEffect('gradient')]; a.props.vfx[0].p.mode = 'freeform';
  const full = render(), cropped = render({ crop: true });
  for (const [x, y] of [[10, 60], [55, 60]]) assert(pixel(cropped, x, y, 80).every((v, i) => Math.abs(v - pixel(full, x + 40, y)[i]) <= 1), 'cropped exports must retain project-space gradient geometry');
  const reduced = render({ scale: 0.5 });
  assert(pixel(reduced, 20, 30, 80).every((v, i) => Math.abs(v - pixel(full, 40, 60)[i]) <= 5), 'scaled preview must match the full-resolution adjustment');
  assert(JSON.stringify(render()) === JSON.stringify(full), 'adjustment surfaces must resize back without stale pixels');
  a.props.vfx = [makeVideoEffect('noise')];
  const grain = render({ t: 0.5 });
  assert(JSON.stringify(grain) !== JSON.stringify(render({ t: 0.8 })), 'adjustment noise must follow timeline time');
  assert(JSON.stringify(grain) === JSON.stringify(render({ t: 0.5 })), 'seeking back must reproduce adjustment noise');
  const top = makeClip('adjustment', { lane: 4, dur: 2, props: { invert: 1 } }); p.clips[top.id] = top;
  assert(JSON.stringify(pixel(render(), 120, 20)) === '[255,0,255,255]', 'a higher adjustment must also process the upper image');
  top.enabled = false; p.clips.upper.enabled = false;
  const opacity = makeVideoEffect('opacity'); opacity.p.amount = 0; a.props.vfx = [opacity];
  assert(render({ transparent: true }).every((v, i) => i % 4 !== 3 || v === 0), 'adjustment output alpha must replace the composite, including transparent holes');
  a.props.opacity = 0.5;
  assert(Math.abs(pixel(render({ transparent: true }), 30, 50)[3] - 128) <= 1, 'half-strength transparent output must interpolate alpha');
}
