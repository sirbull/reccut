import test from 'node:test';
import assert from 'node:assert/strict';
import { analogPixels, filmTexture, tapeLine } from '../src/shared/analog.js';
import { stylizePixels, stylizeSettings } from '../src/shared/stylize.js';
import { makeVideoEffect, VIDEO_EFFECTS } from '../src/shared/videoEffects.js';
const image = (w, h, pixel) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(pixel(x, y), (y * w + x) * 4);
  return data;
};
const settings = (type, p = {}, t = 0.5, w = 128, h = 72) => stylizeSettings(type, { ...makeVideoEffect(type).p, ...p }, t, w, h);
const energy = (a, w, h) => {
  let total = 0;
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) total += Math.abs(a[(y * w + x) * 4] - a[(y * w + x - 1) * 4]);
  return total / ((w - 1) * h);
};

test('VHS softens luminance over the full picture rather than adding only overlays', () => {
  const w = 256, h = 64;
  const data = image(w, h, (x) => { const c = x % 2 ? 230 : 20; return [c, c, c, 255]; });
  const s = settings('vhs', { amount: 0, noise: 0, tracking: 0, fade: 0, scanlines: 0, bleed: 0, softness: 1 }, 0.5, w, h);
  const out = analogPixels(data, w, h, s);
  assert.ok(energy(out, w, h) < energy(data, w, h) * 0.55);
  for (const y of [5, 32, 59]) assert.ok(out[(y * w + 99) * 4] < 200 && out[(y * w + 100) * 4] > 50);
});

test('VHS color low-pass spreads color across an edge independently of luminance softness', () => {
  const w = 256, h = 32, data = image(w, h, (x) => x < 128 ? [255, 0, 0, 255] : [0, 130, 0, 255]);
  const p = { amount: 0, noise: 0, tracking: 0, fade: 0, scanlines: 0, softness: 0 };
  const sharp = analogPixels(data, w, h, settings('vhs', { ...p, bleed: 0 }, 0, w, h));
  const bleed = analogPixels(data, w, h, settings('vhs', { ...p, bleed: 1 }, 0, w, h));
  const at = (16 * w + 130) * 4;
  assert.ok(bleed[at] > sharp[at] + 10, 'red chroma must bleed into the green side');
});

test('tracking errors are brief events, with stable timing when seeking', () => {
  const frames = [];
  for (let f = 0; f < 240; f++) {
    const s = settings('vhs', { tracking: 0.65 }, f / 24);
    let peak = 0;
    for (let y = 0; y < 480; y += 8) peak = Math.max(peak, tapeLine(y, 480, s).band);
    if (peak > 0.2) frames.push(f);
  }
  assert.ok(frames.length > 0 && frames.length < 60, 'tracking faults must be occasional');
  assert.deepEqual(tapeLine(123, 480, settings('vhs', {}, 2.5)), tapeLine(123, 480, settings('vhs', {}, 2.5)));
  assert.equal(tapeLine(24, 48, settings('vhs')).row, 245, 'integer tape rows must not depend on floating point rounding');
});

test('chromatic aberration aligns the lens center and increases fringing at the edges', () => {
  const w = 129, h = 129;
  const data = image(w, h, (x) => { const v = x % 8 < 4 ? 240 : 10; return [v, v, v, 255]; });
  const out = analogPixels(data, w, h, settings('chromatic', { amount: 1 }, 0, w, h));
  const center = (64 * w + 64) * 4;
  assert.deepEqual([...out.slice(center, center + 4)], [...data.slice(center, center + 4)]);
  let middle = 0, edge = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, fringe = Math.abs(out[i] - out[i + 2]);
    if (Math.abs(x - 64) < 8 && Math.abs(y - 64) < 8) middle += fringe;
    if (x < 8 && y < 32) edge += fringe;
  }
  assert.ok(edge > middle + 100);
});

test('film grain is spatially correlated and distinct from digital noise', () => {
  const s = settings('filmGrain', { size: 2.5 });
  let ab = 0, aa = 0, bb = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const a = filmTexture(x, y, s), b = filmTexture(x + 0.5, y, s);
    ab += a * b; aa += a * a; bb += b * b;
  }
  assert.ok(ab / Math.sqrt(aa * bb) > 0.65, 'neighboring grains should form an organic texture');
  const w = 48, h = 1080, data = image(w, h, () => [128, 128, 128, 255]);
  const film = stylizePixels(data, w, h, settings('filmGrain', {}, 1, w, h));
  const digital = stylizePixels(data, w, h, settings('noise', {}, 1, w, h));
  assert.notDeepEqual(film, digital);
});

test('film grain responds to exposure, preserves alpha and all film presets are independent', () => {
  const w = 24, h = 1080;
  const data = image(w, h, (x) => x < 12 ? [128, 128, 128, 130] : [245, 245, 245, 0]);
  const s = settings('filmGrain', { amount: 0.6, tonal: 1, color: 0 }, 0.5, w, h);
  const out = analogPixels(data, w, h, s);
  let mid = 0, high = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (x < 12) mid += (out[i] - 128) ** 2; else high += (out[i] - 245) ** 2;
    assert.equal(out[i + 3], data[i + 3]);
  }
  assert.ok(mid > high * 2, 'highlights should carry less grain than midtones');
  const e = makeVideoEffect('filmGrain'); e.p.dust = 1;
  assert.equal(VIDEO_EFFECTS.find((d) => d.type === 'filmGrain').presets[0].p.dust, 0);
});
