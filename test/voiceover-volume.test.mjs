import test from 'node:test';
import assert from 'node:assert/strict';
import { studioVolumeAt, studioVolumeClip, studioVolumePatch } from '../src/renderer/voiceover/volume.js';
import { volumePath, volumeY } from '../src/renderer/editor/volume.js';

const item = (take = {}) => ({ at: 10, in: 0.5, dur: 2, take: { id: 'left', in: 0.5, out: 2.5, gain: -0.1, ...take } });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);

test('the yellow line and volume value include track gain without modifying the clip', () => {
  const it = item();
  near(studioVolumeAt(it, 7), 6.9);
  near(studioVolumeClip(it, 7).props.volume, 6.9);
  assert.equal(volumePath(studioVolumeClip(it, 7), 'volume', 100, 54, 50), `M0 ${volumeY(6.9, 54)} H100`);
  near(studioVolumeAt(it, 3), 2.9);
  assert.equal(it.take.gain, -0.1);
});

test('editing combined volume adjusts only the clip and does not apply track gain twice', () => {
  const it = item();
  const patch = studioVolumePatch(it, 7, 4);
  assert.equal(patch.gain, -3);
  const edited = { ...it, take: { ...it.take, ...patch } };
  assert.equal(studioVolumeAt(edited, 7), 4);
  assert.equal(studioVolumeAt(edited, 8), 5, 'later track changes are still additive');
  assert.equal(it.take.gain, -0.1);
});

test('track volume offsets every keyframe and toolbar edits preserve the automation curve', () => {
  const it = item({ volKf: [[0.5, -8, 'linear'], [2.5, -4, 'linear']] });
  assert.deepEqual(studioVolumeClip(it, 7).kf.volume, [[0.5, -1, 'linear'], [2.5, 3, 'linear']]);
  assert.equal(studioVolumeAt(it, 7, 11), 1);
  const patch = studioVolumePatch(it, 7, 4, 11);
  assert.deepEqual(patch.volKf, [[0.5, -5, 'linear'], [2.5, -1, 'linear']]);
  assert.equal(studioVolumeAt({ ...it, take: { ...it.take, ...patch } }, 7, 11), 4);
  assert.deepEqual(it.take.volKf, [[0.5, -8, 'linear'], [2.5, -4, 'linear']], 'existing source and sibling curves are untouched');
});

test('combined volume follows the surviving source range of old cut recordings', () => {
  const it = { at: 10, in: 0, dur: 2, take: { in: 0, out: 3, cuts: [[1, 2]], volKf: [[0, 0, 'linear'], [3, -30, 'linear']] } };
  assert.equal(studioVolumeAt(it, 7, 11.5), -18, 'second part reads source time 2.5, plus track gain');
});

test('combined volume edits respect clip limits and clamp keyed curves together', () => {
  assert.equal(studioVolumePatch(item(), 7, 100).gain, 12);
  assert.equal(studioVolumePatch(item(), -12, -100).gain, -60);
  const it = item({ volKf: [[0.5, -10, 'linear'], [2.5, 10, 'linear']] });
  const patch = studioVolumePatch(it, 7, 30, 10);
  assert.deepEqual(patch.volKf, [[0.5, -8, 'linear'], [2.5, 12, 'linear']]);
});
