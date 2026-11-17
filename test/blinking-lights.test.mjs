import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_DEFAULTS, LIGHT_PRESETS, flashAt, lightProfile, lightsAt, matchingPreset, pulse } from '../src/shared/lights.js';
import { makeVideoEffect } from '../src/shared/videoEffects.js';
import { kfIntegral, valueAt, vfxProp } from '../src/shared/model.js';
import { pasteAttributes } from '../src/shared/attributes.js';

const police = LIGHT_PRESETS.find((x) => x.id === 'police').p;

test('every requested preset exists, is complete and is recognised until edited', () => {
  assert.deepEqual(LIGHT_PRESETS.map((x) => x.label), ['Police Lights', 'Emergency Red', 'Emergency Amber', 'Strobe', 'Flickering Neon', 'Broken Light', 'Beacon', 'Camera Flash']);
  for (const x of LIGHT_PRESETS) assert.deepEqual(Object.keys(x.p).sort(), Object.keys(LIGHT_DEFAULTS).sort());
  const e = makeVideoEffect('lights');
  assert.equal(matchingPreset(e.p), 'police');
  assert.equal(matchingPreset({ ...e.p, frequency: 3 }), 'custom');
});

test('a flash rises fast, holds and fades out naturally instead of switching off', () => {
  const p = { attack: 0.01, duration: 0.05, decay: 0.1 };
  assert.equal(pulse(-0.001, p), 0);
  assert.ok(pulse(0.005, p) > 0 && pulse(0.005, p) < 1);
  assert.equal(pulse(0.03, p), 1);
  const a = pulse(0.07, p), b = pulse(0.1, p);
  assert.ok(a > b && b > 0, 'decays gradually');
  assert.equal(pulse(0.2, p), 0);
});

test('police lights: red double flash, then blue double flash half a cycle later', () => {
  const at = (c) => lightsAt(police, c).lights.map((l) => l.level);
  const period = 1 / police.frequency, second = (police.attack + police.duration + police.pause) / period;
  const [red0, blue0] = at(0.01);
  assert.ok(red0 > 0.9 && blue0 < 0.05);
  assert.ok(at(second + 0.01)[0] > 0.9, 'second red flash');
  const [red1, blue1] = at(0.51);
  assert.ok(blue1 > 0.9 && red1 < 0.05);
  const { lights } = lightsAt(police, 0);
  assert.ok(lights[0].x < 0 && lights[1].x > 1, 'both lights sit outside the frame');
});

test('same time gives the same light, whatever the frame rate or scrubbing order', () => {
  const neon = LIGHT_PRESETS.find((x) => x.id === 'neon').p;
  const times = [0.5, 0.1, 2.3, 0.5, 7.77];
  const first = times.map((t) => flashAt(neon, t * neon.frequency, neon.frequency));
  const again = [...times].reverse().map((t) => flashAt(neon, t * neon.frequency, neon.frequency)).reverse();
  assert.deepEqual(first, again);
  for (const fps of [24, 30, 60]) assert.deepEqual(flashAt(neon, (60 / fps) * (fps / 60) * 2 * neon.frequency, neon.frequency), flashAt(neon, 2 * neon.frequency, neon.frequency));
});

test('alternate colour mode switches colours per cycle, smoothly when asked', () => {
  const p = { ...police, dual: false, colorMode: 'alternate', pattern: 'single' };
  assert.equal(flashAt(p, 0.01, 1).mix, 0);
  assert.equal(flashAt(p, 1.01, 1).mix, 1);
  const smooth = flashAt({ ...p, transition: 'smooth' }, 0.5, 1).mix;
  assert.ok(Math.abs(smooth - 0.5) < 1e-9);
});

test('light spreads beyond its radius as glow, and the visible source adds a bright core', () => {
  const p = { ...LIGHT_DEFAULTS, glow: 1, core: false };
  assert.ok(lightProfile(0, p).light > lightProfile(0.8, p).light);
  assert.ok(lightProfile(1.5, p).light > 0, 'glow reaches past the radius');
  assert.equal(lightProfile(0, p).core, 0);
  assert.ok(lightProfile(0, { ...p, core: true }).core > 0.9);
});

test('keyframed frequency changes tempo without jumps, and light keyframes are pasted with effects', () => {
  const e = makeVideoEffect('lights');
  const clip = { id: 'c', type: 'video', start: 0, in: 0, dur: 10, props: { vfx: [e] }, kf: { [vfxProp(e.id, 'frequency')]: [[1, 1, 'linear'], [3, 5]], [vfxProp(e.id, 'x')]: [[0, 0.1], [2, 0.9]] } };
  const c = (T) => kfIntegral(clip, vfxProp(e.id, 'frequency'), T, e.p.frequency);
  for (const T of [1, 2, 3]) assert.ok(Math.abs(c(T + 1e-4) - c(T - 1e-4)) < 1e-2, `continuous at ${T}`);
  assert.ok(Math.abs(c(3) - (1 + 6)) < 1e-9, '1 cycle before, then the 1→5 Hz ramp gives 6');
  assert.equal(valueAt(clip, vfxProp(e.id, 'x'), 1), 0.5);
  const dst = { id: 'd', type: 'video', start: 0, in: 0, dur: 10, props: {}, kf: {} };
  pasteAttributes(clip, dst, ['effects']);
  assert.deepEqual(dst.kf[vfxProp(e.id, 'x')], clip.kf[vfxProp(e.id, 'x')]);
});
