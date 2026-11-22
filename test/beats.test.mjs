import test from 'node:test';
import assert from 'node:assert/strict';
import { BEAT_RATE, clipBeatLines, detectBeats } from '../src/shared/beats.js';

// 30 s at 120 BPM from 0.3 s: a bass kick and a long bass note on beat 1 of each bar, hi-hat ticks on the other beats.
function song({ bpm = 120, offset = 0.3, seconds = 30 } = {}) {
  const pcm = new Float32Array(BEAT_RATE * seconds);
  for (let k = 0, t = offset; t < seconds - 0.2; k++, t = offset + (k * 60) / bpm) {
    const s0 = Math.round(t * BEAT_RATE);
    for (let j = 0; j < BEAT_RATE * 0.15 && s0 + j < pcm.length; j++) {
      const u = j / BEAT_RATE, decay = Math.exp(-u * 30);
      pcm[s0 + j] += k % 4 === 0 ? 0.8 * decay * Math.sin(2 * Math.PI * 60 * u) : 0.3 * decay * Math.sin(2 * Math.PI * 3000 * u);
    }
    // A loud bass note rings over the next beats, as in real music. Loudness alone would miss the drums under it.
    if (k % 4 === 0) for (let j = 0; j < BEAT_RATE * 1.2 && s0 + j < pcm.length; j++) pcm[s0 + j] += 0.5 * Math.exp(-j / BEAT_RATE * 1.5) * Math.sin(2 * Math.PI * 110 * j / BEAT_RATE);
  }
  return pcm;
}

test('detectBeats finds tempo, beats and the downbeat', () => {
  const r = detectBeats(song());
  assert.ok(Math.abs(r.bpm - 120) < 2, `bpm ${r.bpm}`);
  const inner = r.beats.filter((b) => b > 2 && b < 28);
  for (const b of inner) {
    const k = Math.round((b - 0.3) / 0.5);
    assert.ok(Math.abs(b - (0.3 + k * 0.5)) < 0.03, `beat ${b} is off the grid`);
  }
  const bars = r.beats.filter((_, i) => (i - r.downbeat) % 4 === 0 && i >= r.downbeat);
  for (const b of bars.filter((b) => b > 2 && b < 28)) assert.equal(Math.round((b - 0.3) / 0.5) % 4, 0, `bar line at ${b} is not on beat 1`);
});

test('clipBeatLines maps source beats into the clip on the timeline', () => {
  const beats = { downbeat: 3, beats: [0, 0.5, 1, 1.5, 2, 2.5, 3] };
  const lines = clipBeatLines({ start: 10, in: 1, dur: 1, speed: 1 }, beats);
  assert.deepEqual(lines, [{ t: 10, bar: false }, { t: 10.5, bar: true }, { t: 11, bar: false }]);
  assert.deepEqual(clipBeatLines({ start: 0, in: 0, dur: 3, ramp: [[0, 1], [1, 2]] }, beats), []);
});
