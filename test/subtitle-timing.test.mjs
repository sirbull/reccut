import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip } from '../src/shared/model.js';
import { speechSources, toSrt, toVtt, parseSrt } from '../src/shared/srt.js';
import { mixSpeechSource } from '../src/shared/subtitleAudio.mjs';

function source(patch = {}, offset = 0) {
  const p = newProject('Existing project');
  p.media.m = { id: 'm', streams: { main: { path: '/speech.wav', hasAudio: true, offset } } };
  const c = makeClip('video', { media: p.media.m, start: 10, in: 5, dur: 2, ...patch });
  Object.assign(c, patch);
  p.clips[c.id] = c; p.primary = [c.id]; p.duration = 20;
  return { p, c };
}

test('trimmed clips placed later retain source time and timeline time, including older projects', () => {
  const { p } = source(); const [s] = speechSources(p);
  assert.deepEqual([s.in, s.dur, s.start], [5, 2, 10]);
  const out = new Float32Array(200); mixSpeechSource(out, Float32Array.from({ length: 20 }, (_, i) => i + 1), s, 10);
  assert.equal(out[99], 0); assert.equal(out[100], 1); assert.equal(out[119], 20); assert.equal(out[120], 0);
  const restored = JSON.parse(JSON.stringify(p)); assert.deepEqual(speechSources(restored), [s]);
});

test('time-stretched source audio occupies the correct timeline duration', () => {
  for (const speed of [0.5, 2]) {
    const { p } = source({ speed }); const [s] = speechSources(p);
    assert.equal(s.dur, 2 * speed);
    const pcm = Float32Array.from({ length: s.dur * 10 }, (_, i) => i + 1), out = new Float32Array(200);
    mixSpeechSource(out, pcm, s, 10);
    assert.equal(out[110], 10 * speed + 1); assert.equal(out[120], 0);
  }
});

test('stream offsets produce silence until source audio begins, with speed applied once', () => {
  const { p } = source({ in: 0, speed: 2 }, 1), [s] = speechSources(p);
  assert.deepEqual([s.start, s.in, s.dur], [10, 0, 3]);
  const out = new Float32Array(200); mixSpeechSource(out, new Float32Array(30).fill(1), s, 10);
  assert.equal(out[104], 0); assert.equal(out[105], 1); assert.equal(out[119], 1); assert.equal(out[120], 0);
});

test('ramps, reverse clips, muted audio and frozen clips respect timeline playback', () => {
  const { p, c } = source({ ramp: [[0, 1], [1, 3]] }), [s] = speechSources(p);
  assert.equal(s.dur, 4);
  const out = new Float32Array(200); mixSpeechSource(out, Float32Array.from({ length: 40 }, (_, i) => i), s, 10);
  assert.equal(out[110], 15);
  delete c.ramp; c.reverse = true;
  const reverse = new Float32Array(200); mixSpeechSource(reverse, Float32Array.from({ length: 20 }, (_, i) => i), speechSources(p)[0], 10);
  assert.equal(reverse[110], 10);
  c.speed = 0; assert.equal(speechSources(p).length, 0);
  c.speed = 1; c.props.audioDetached = true; assert.equal(speechSources(p).length, 0);
});

test('existing SRT/VTT output and caption data remain independent of model selection', () => {
  const segments = [{ start: 10.5, end: 12, text: 'Hei fra Norge.' }];
  assert.deepEqual(parseSrt(toSrt(segments)), segments);
  assert.deepEqual(parseSrt(toVtt(segments)), segments);
});
