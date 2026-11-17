import test from 'node:test';
import assert from 'node:assert/strict';
import { HUE_BANDS, hueBandWeight, hueSaturationPixels, hueSaturationSettings } from '../src/shared/hueSaturation.js';
import { activeVideoEffects, BROWSER_VIDEO_EFFECTS, makeVideoEffect } from '../src/shared/videoEffects.js';
import { makeClip, valueAt, vfxProp } from '../src/shared/model.js';
import { pasteAttributes, removeAttributes } from '../src/shared/attributes.js';

const pixels = (...colors) => new Uint8ClampedArray(colors.flat());
const render = (input, p = {}) => hueSaturationPixels(input, hueSaturationSettings(p));
const close = (actual, expected, tolerance = 1) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `channel ${i}: ${v} vs ${expected[i]}`));
};

test('the mixer starts neutral and strength zero bypasses adjusted ranges', () => {
  const input = pixels([220, 60, 30, 128], [30, 80, 200, 255], [1, 1, 1, 0]);
  assert.deepEqual(render(input, makeVideoEffect('hueSaturation').p), input);
  assert.deepEqual(render(input, { redHue: 120, redSaturation: -1, amount: 0 }), input);
  assert.equal(BROWSER_VIDEO_EFFECTS.find((e) => e.type === 'hueSaturation').category, 'Color correction');
});

test('recoloring a red jacket leaves greens, blues, neutral grays and alpha intact', () => {
  const input = pixels([255, 0, 0, 128], [0, 255, 0, 255], [0, 0, 255, 100], [90, 90, 90, 255], [255, 0, 0, 0]);
  assert.deepEqual(render(input, { redHue: -120 }), pixels([0, 0, 255, 128], [0, 255, 0, 255], [0, 0, 255, 100], [90, 90, 90, 255], [255, 0, 0, 0]));
  assert.equal(input[0], 255, 'source pixels are not mutated');
});

test('each color range independently increases and removes saturation while preserving HSL lightness', () => {
  const sourceColors = [[255, 0, 0], [255, 128, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [128, 0, 255], [255, 0, 255]];
  for (const [i, { id }] of HUE_BANDS.entries()) {
    const input = pixels([...sourceColors[i], 123]);
    close(render(input, { [`${id}Saturation`]: -1 }), [128, 128, 128, 123]);
  }
  const mutedRed = pixels([180, 100, 100, 255]);
  close(render(mutedRed, { redSaturation: 1 }), [220, 60, 60, 255]);
  close(render(mutedRed, { redSaturation: -0.5 }), [160, 120, 120, 255]);
  assert.deepEqual(render(pixels([0, 255, 0, 255]), { redSaturation: -1 }), pixels([0, 255, 0, 255]));
});

test('all default ranges blend without gaps and red wraps smoothly across the hue seam', () => {
  const settings = hueSaturationSettings();
  for (let degrees = 0; degrees < 360; degrees += 0.25) {
    const sum = settings.bands.reduce((v, b) => v + hueBandWeight(degrees / 360, b), 0);
    assert.ok(Math.abs(sum - 1) < 1e-12, `weights at ${degrees}° sum to ${sum}`);
  }
  const left = render(pixels([255, 0, 1, 255]), { redHue: 120 });
  const right = render(pixels([255, 1, 0, 255]), { redHue: 120 });
  close(left, right, 3);
  const p = Object.fromEntries(HUE_BANDS.map(({ id }) => [`${id}Saturation`, -1]));
  const gray = render(pixels([255, 64, 0, 255], [27, 92, 187, 90]), p);
  assert.equal(gray[0], gray[1]); assert.equal(gray[1], gray[2]);
  assert.equal(gray[4], gray[5]); assert.equal(gray[5], gray[6]);
});

test('range refinement targets source shades and does not cascade recolored pixels into another band', () => {
  const input = pixels([255, 0, 0, 255], [0, 0, 255, 255]);
  assert.deepEqual(render(input, { redHue: -120, blueHue: 60 }), pixels([0, 0, 255, 255], [255, 0, 255, 255]));
  assert.deepEqual(render(input, { redCenter: 240, redWidth: 0.1, redHue: 120 }), pixels([255, 0, 0, 255], [255, 0, 0, 255]));
  const orange = pixels([255, 100, 0, 255]);
  assert.deepEqual(render(orange, { redWidth: 0.1, redSaturation: -1 }), orange);
  assert.notDeepEqual(render(orange, { redWidth: 2, redSaturation: -1 }), orange);
});

test('strength blends the result and invalid parameters cannot introduce invalid channels', () => {
  close(render(pixels([255, 0, 0, 128]), { redHue: 120, amount: 0.5 }), [128, 128, 0, 128]);
  const s = hueSaturationSettings({ redHue: NaN, redCenter: Infinity, redWidth: 0, redSaturation: -999, amount: NaN });
  assert.equal(s.amount, 1); assert.equal(s.bands[0].hue, 0); assert.equal(s.bands[0].saturation, -1);
  assert.ok(s.bands.every((b) => Object.values(b).every(Number.isFinite) && b.left > 0 && b.right > 0));
});

test('overlapping custom ranges stay continuous as another adjustment crosses zero', () => {
  const input = pixels([255, 128, 0, 255]);
  const p = { redHue: 120, redWidth: 2 };
  close(render(input, p), render(input, { ...p, orangeSaturation: 0.000001 }));
  close(render(input, p), render(input, { ...p, orangeHue: -0.000001 }));
});

test('range settings and animation survive saving, copying, removal and recording-stream targeting', () => {
  const e = makeVideoEffect('hueSaturation');
  Object.assign(e.p, { redHue: 60, redSaturation: -0.25, redWidth: 0.7 });
  const clip = makeClip('video', { start: 10, in: 2, dur: 4, props: { vfx: [e] } });
  clip.kf[vfxProp(e.id, 'redHue')] = [[2, 0], [6, 120]];
  const saved = JSON.parse(JSON.stringify(clip)), dest = makeClip('adjustment', { start: 10, in: 2, dur: 4 });
  pasteAttributes(saved, dest, ['effects']);
  assert.equal(valueAt(dest, vfxProp(e.id, 'redHue'), 12), 60);
  assert.deepEqual(dest.props.vfx, clip.props.vfx);
  dest.props.vfx[0].p.redCenter = 12;
  assert.equal(clip.props.vfx[0].p.redCenter, 0);
  removeAttributes(dest, ['effects']);
  assert.deepEqual(dest.props.vfx, []);
  assert.equal(dest.kf[vfxProp(e.id, 'redHue')], undefined);
  e.target = 'camera';
  assert.deepEqual(activeVideoEffects(clip, 'screen'), []);
  assert.equal(activeVideoEffects(clip, 'camera').length, 1);
  e.on = false;
  assert.deepEqual(activeVideoEffects(clip, 'camera'), []);
});
