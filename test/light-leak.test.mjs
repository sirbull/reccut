import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAK_PRESETS, leakModified, lightLeakField } from '../src/shared/lightLeak.js';
import { baseValueAt, kfIntegral, propBase, pruneEffectKeyframes, setPropBase, vfxProp } from '../src/shared/model.js';
import { makeVideoEffect } from '../src/shared/videoEffects.js';

const W = 64, H = 36;
const alpha = (data) => data.reduce((sum, v, i) => (i % 4 === 3 ? sum + v : sum), 0) / (W * H * 255);

test('every preset produces visible, soft light and is deterministic for a given time', () => {
  for (const { id, p } of LEAK_PRESETS) {
    const a = lightLeakField(p, 3.2, 3.2 * p.speed * 0.12, 1, W, H);
    assert.deepEqual(a, lightLeakField(p, 3.2, 3.2 * p.speed * 0.12, 1, W, H), id);
    const cover = alpha(a);
    assert.ok(cover > 0.02 && cover < 0.95, `${id} coverage ${cover}`);
  }
});

test('the light moves over time and is not a flat gradient', () => {
  const p = LEAK_PRESETS[0].p;
  const a = lightLeakField(p, 1, 0.1, 0.3, W, H), b = lightLeakField(p, 4, 0.5, 1.2, W, H);
  let diff = 0;
  for (let i = 3; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]);
  assert.ok(diff / (W * H) > 5);
  // Rows differ in shape, not just in offset: a linear ramp would have identical rows.
  const row = (y) => Array.from({ length: W }, (_, x) => a[(y * W + x) * 4 + 3]);
  assert.notDeepEqual(row(5), row(30));
});

test('zero intensity gives no light', () => {
  assert.equal(alpha(lightLeakField({ ...LEAK_PRESETS[0].p, intensity: 0 }, 2, 0.2, 0, W, H)), 0);
});

test('effect parameters keyframe through the clip and colors glide in OKLab', () => {
  const e = makeVideoEffect('lightLeak');
  const clip = { start: 10, in: 2, dur: 8, speed: 1, props: { vfx: [e] }, kf: {} };
  const color = vfxProp(e.id, 'startColor');
  assert.equal(baseValueAt(clip, color, 12), e.p.startColor);
  setPropBase(clip, vfxProp(e.id, 'intensity'), 0.4);
  assert.equal(propBase(clip, vfxProp(e.id, 'intensity')), 0.4);
  clip.kf[color] = [[2, '#ff0000'], [4, '#0000ff']];
  const mid = baseValueAt(clip, color, 11); // source time 3
  assert.match(mid, /^#[0-9a-f]{6}$/);
  assert.ok(mid !== '#800080', 'OKLab midpoint differs from an sRGB average');
  assert.equal(baseValueAt(clip, color, 15), '#0000ff');
  clip.props.vfx = [];
  pruneEffectKeyframes(clip);
  assert.deepEqual(clip.kf, {});
});

test('speed keyframes integrate to a continuous phase, independent of frame rate', () => {
  const clip = { start: 0, in: 0, dur: 10, speed: 1, props: {}, kf: { s: [[2, 1], [4, 3, 'easeInOut'], [6, 0]] } };
  assert.equal(kfIntegral({ ...clip, kf: {} }, 's', 5, 2), 10);
  assert.equal(kfIntegral(clip, 's', 2), 2);
  assert.ok(Math.abs(kfIntegral(clip, 's', 4) - 6) < 1e-9); // 2 + 2 * (1 + 2 * 0.5)
  // Matches a fine numerical integration of the eased curve.
  let sum = 0;
  const v = (s) => (s < 2 ? 1 : s < 4 ? 1 + 2 * (s - 2 <= 1 ? 4 * ((s - 2) / 2) ** 3 : 1 - (-2 * ((s - 2) / 2) + 2) ** 3 / 2) : s < 6 ? 3 - 3 * ((s - 4) / 2) : 0);
  for (let s = 0; s < 7; s += 1e-4) sum += v(s + 5e-5) * 1e-4;
  assert.ok(Math.abs(kfIntegral(clip, 's', 7) - sum) < 1e-3);
});

test('editing a preset makes a variant without changing the preset', () => {
  const p = structuredClone(LEAK_PRESETS[1].p);
  assert.equal(leakModified(p), false);
  p.intensity = 0.1;
  assert.equal(leakModified(p), true);
  assert.notEqual(LEAK_PRESETS[1].p.intensity, 0.1);
});
