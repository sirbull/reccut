import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAudio, dbToGain, kfTime, makeClip, newProject, setKeyframe, setKeyframeEase, valueAt } from '../src/shared/model.js';
import { fadePath, moveVolumeKeyframe, shiftVolume, volumeDelta, volumePath, volumeSegment, volumeY } from '../src/renderer/editor/volume.js';
import { prefs, setPrefs } from '../src/renderer/prefs.js';
import { setKeyframe as setEditorKeyframe } from '../src/renderer/editor/keyframes.js';

function audio() {
  const p = newProject('Volume');
  const media = { id: 'audio', kind: 'audio', duration: 30, streams: { main: { path: '/audio.wav', hasAudio: true } } };
  p.media.audio = media;
  const c = makeClip('audio', { media, start: 10, in: 5, dur: 8, lane: -1 });
  p.clips[c.id] = c;
  p.duration = 18;
  return { p, c };
}

test('four-point volume duck changes only the middle pair and eases both transitions in actual audio', () => {
  const { p, c } = audio();
  for (const t of [6, 8, 10, 12]) setKeyframe(c, 'volume', t, 0);
  const middle = volumeSegment(c, 'volume', 14);
  assert.deepEqual(middle, [1, 2]);
  shiftVolume(c, 'volume', -24, middle);
  assert.deepEqual(c.kf.volume.map((k) => k[1]), [0, -24, -24, 0]);
  assert.equal(valueAt(c, 'volume', 11.5), -1.5, 'eased quarter-way descent');
  assert.equal(valueAt(c, 'volume', 16.5), -1.5, 'eased quarter-way from the end');
  assert.equal(valueAt(c, 'volume', 14), -24);
  assert.equal(valueAt(c, 'volume', 10), 0);
  assert.equal(valueAt(c, 'volume', 17.5), 0);
  assert.ok(Math.abs(computeAudio(p, 11.5)[0].gain - dbToGain(-1.5)) < 1e-12);
  assert.match(volumePath(c, 'volume', 800, 100, 100), / C/);
});

test('point edits and segment edits preserve explicit interpolation and clamp both levels together', () => {
  const { c } = audio();
  for (const [t, v] of [[6, 0], [8, 6], [10, -6], [12, 0]]) setKeyframe(c, 'volume', t, v);
  setKeyframeEase(c, 'volume', 8, 'linear');
  setKeyframeEase(c, 'volume', 10, 'hold');
  shiftVolume(c, 'volume', 20, [1, 2]);
  assert.deepEqual(c.kf.volume.map((k) => k[1]), [0, 12, 0, 0]);
  assert.equal(c.kf.volume[1][2], undefined, 'explicit Linear survives');
  assert.equal(c.kf.volume[2][2], 'hold');
  shiftVolume(c, 'volume', -72, [1]);
  assert.equal(c.kf.volume[1][1], -60);
  assert.equal(c.kf.volume[2][1], 0);
});

test('sideways keyframe drag stays between its neighbours and inside the clip', () => {
  const { c } = audio();
  for (const [t, v] of [[6, 0], [8, -10], [10, 0]]) setKeyframe(c, 'volume', t, v);
  moveVolumeKeyframe(c, 'volume', 1, 9, 0.1);
  assert.deepEqual(c.kf.volume[1], [9, -10, 'easeInOut']);
  moveVolumeKeyframe(c, 'volume', 1, 20, 0.1);
  assert.equal(c.kf.volume[1][0], 9.9);
  moveVolumeKeyframe(c, 'volume', 0, 0, 0.1);
  assert.equal(c.kf.volume[0][0], 5, 'not before the clip in point');
  moveVolumeKeyframe(c, 'volume', 2, 99, 0.1);
  assert.equal(c.kf.volume[2][0], 13, 'not after the clip end');
});

test('constant, single-point, trimmed and extended envelopes reach both ends', () => {
  const { c } = audio();
  assert.equal(volumePath(c, 'volume', 800, 76, 100), 'M0 14 H800');
  shiftVolume(c, 'volume', 30, []);
  assert.equal(c.props.volume, 12);
  setKeyframe(c, 'volume', 9, -12);
  assert.deepEqual(volumeSegment(c, 'volume', 10), [0]);
  assert.deepEqual(volumeSegment(c, 'volume', 18), [0]);
  assert.equal(volumePath(c, 'volume', 800, 76, 100), 'M0 26 H400 H800');
  assert.equal(volumePath(c, 'volume', 1000, 76, 100, 1), 'M0 26 H500 H1000');
  c.in = 10;
  assert.equal(volumePath(c, 'volume', 800, 76, 100), 'M-100 26 H-100 H800');
  c.kf.volume = [];
  assert.equal(volumePath(c, 'volume', 800, 76, 100), 'M0 2 H800');
});

test('volume segment lookup uses animation time for speed, reverse and ramps', () => {
  const { c } = audio();
  c.speed = 2;
  for (const t of [6, 8, 10, 12]) setKeyframe(c, 'volume', t, 0);
  assert.deepEqual(volumeSegment(c, 'volume', 12), [1, 2]);
  c.reverse = true;
  assert.equal(kfTime(c, 14), 9);
  assert.deepEqual(volumeSegment(c, 'volume', 14), [1, 2]);
  c.reverse = false;
  c.ramp = [[0, 0.25], [1, 4]];
  assert.deepEqual(volumeSegment(c, 'volume', 14), [1, 2]);
});

test('drag distance matches line height and the full dB range', () => {
  for (const h of [26, 54, 100, 260]) {
    assert.equal(volumeY(12, h), 2);
    assert.equal(volumeY(-60, h), h - 2);
    const dy = volumeY(-24, h) - volumeY(0, h);
    assert.ok(Math.abs(volumeDelta(-dy, h) + 24) < 1e-12);
  }
});

test('global Eased/Linear preference applies to all new properties and preserves existing overrides', () => {
  const { c } = audio();
  const original = prefs.value;
  try {
    setPrefs({ keyframeEasing: 'easeInOut' });
    for (const prop of ['volume', 'micVolume', 'sysVolume', 'opacity', 'mask.test.points']) {
      setEditorKeyframe(c, prop, 6, prop.endsWith('points') ? [0, 0] : 0);
      assert.equal(c.kf[prop][0][2], 'easeInOut');
    }
    setPrefs({ keyframeEasing: 'linear' });
    setEditorKeyframe(c, 'volume', 8, -12);
    assert.equal(c.kf.volume[1][2], 'linear');
    assert.equal(c.kf.volume[0][2], 'easeInOut');
    setKeyframeEase(c, 'volume', 6, 'easeOut');
    setEditorKeyframe(c, 'volume', 6, -6);
    assert.equal(c.kf.volume[0][2], 'easeOut');
    assert.deepEqual(c.kf['mask.test.points'][0], [6, [0, 0], 'easeInOut']);
  } finally {
    prefs.value = original;
  }
});

test('recording components keep independent volume and computed audio gains', () => {
  const p = newProject('Recording');
  const media = { id: 'rec', kind: 'recording', duration: 20, streams: {
    camera: { path: '/mic.webm', hasAudio: true, hasVideo: true },
    screen: { path: '/screen.webm', hasAudio: true, hasVideo: true },
  } };
  p.media.rec = media;
  const c = makeClip('recording', { media, start: 0, dur: 8 });
  p.clips[c.id] = c;
  p.primary = [c.id];
  setKeyframe(c, 'micVolume', 1, 0);
  setKeyframe(c, 'micVolume', 5, -24);
  c.props.sysVolume = -6;
  const gains = Object.fromEntries(computeAudio(p, 2).map((a) => [a.stream, a.gain]));
  assert.ok(Math.abs(gains.camera - dbToGain(-1.5)) < 1e-12);
  assert.ok(Math.abs(gains.screen - dbToGain(-6)) < 1e-12);
  assert.match(volumePath(c, 'sysVolume', 800, 76, 100), /^M0 20 H800$/);
});

test('fade curves fall from the volume line to silence at the clip edge', () => {
  const media = { id: 'audio', kind: 'audio', duration: 30, streams: { main: { path: '/audio.wav', hasAudio: true } } };
  const c = makeClip('audio', { media, start: 10, dur: 10, lane: -1 });
  c.props.volume = -6;
  const pts = (d) => d.split(/[ML]/).filter(Boolean).map((s) => s.trim().split(' ').map(Number));
  const fin = pts(fadePath(c, 'volume', 'in', 2, 100, 40, 10));
  assert.deepEqual(fin[0], [0, volumeY(-60, 40)], 'starts silent at the left edge');
  assert.deepEqual(fin.at(-1), [20, volumeY(-6, 40)], 'meets the volume line at the handle');
  const fout = pts(fadePath(c, 'volume', 'out', 2, 100, 40, 10));
  assert.deepEqual(fout[0], [100, volumeY(-60, 40)], 'ends silent at the right edge');
  assert.deepEqual(fout.at(-1), [80, volumeY(-6, 40)]);
  assert.equal(fadePath(c, 'volume', 'in', 0, 100, 40, 10), '');
});
