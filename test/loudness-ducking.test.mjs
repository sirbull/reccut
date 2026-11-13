import test from 'node:test';
import assert from 'node:assert/strict';
import { LOUDNESS_CEILING, LoudnessMeter, loudnessGain, normalizeTo } from '../src/shared/loudness.js';
import { createChain, makeEffect } from '../src/shared/audiofx.js';
import { DUCK_DEFAULTS, duckClip, duckMusic, speechRegions, speechUnderMusic } from '../src/shared/ducking.js';
import { makeClip, newProject, valueAt } from '../src/shared/model.js';
import { placeFree } from '../src/shared/ops.js';
import { PRESETS } from '../src/shared/formats.js';

const RATE = 48000;

function sine(seconds, dbfs, freq = 1000) {
  const n = Math.round(seconds * RATE);
  const a = 10 ** (dbfs / 20);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = a * Math.sin((2 * Math.PI * freq * i) / RATE);
  return x;
}

function measure(L, R = L) {
  const m = new LoudnessMeter(RATE);
  m.push(L, R);
  return m;
}

test('a stereo 1 kHz tone at -23 dBFS measures -23 LUFS (EBU Tech 3341)', () => {
  assert.ok(Math.abs(measure(sine(10, -23)).integrated() - -23) < 0.1);
  assert.ok(Math.abs(measure(sine(10, -33)).integrated() - -33) < 0.1);
});

test('silence is gated out and does not lower the loudness', () => {
  const x = new Float32Array(RATE * 20);
  x.set(sine(10, -23), RATE * 5);
  assert.ok(Math.abs(measure(x).integrated() - -23) < 0.2);
  assert.equal(measure(new Float32Array(RATE * 2)).integrated(), -Infinity);
});

test('normalizing reaches the target, with peaks under the ceiling', () => {
  // A quiet mix with a loud click: plain gain would clip, the limiter catches it.
  const L = sine(8, -30);
  for (let i = RATE * 4; i < RATE * 4 + 200; i++) L[i] = 0.9;
  const R = L.slice();
  const target = -14;
  // The same loop as the export worker: measure, gain through the limiter, measure again.
  const r = normalizeTo(target, () => measure(L, R).integrated(), (gain) => {
    const chain = createChain(RATE);
    chain.update([makeEffect('limiter', { ceiling: LOUDNESS_CEILING, gain, release: 80 })]);
    chain.process(L, R, L.length);
  });
  assert.ok(r.before > -30, 'the click raises the first measurement');
  const after = measure(L, R);
  assert.ok(Math.abs(after.integrated() - target) < 0.3, `got ${after.integrated()}`);
  assert.ok(after.peakDb() <= LOUDNESS_CEILING + 0.01);
  // Already at the target: nothing is done.
  let calls = 0;
  normalizeTo(-14, () => -14.02, () => calls++);
  assert.equal(calls, 0);
});

test('the gain is bounded, and silence is left alone', () => {
  assert.equal(loudnessGain(-Infinity, -14), 0);
  assert.equal(loudnessGain(-20, 0), 0);
  assert.equal(loudnessGain(-80, -14), 40);
  assert.equal(loudnessGain(-10, -14), -4);
});

test('the YouTube preset exports at -14 LUFS and the master is left untouched', () => {
  assert.equal(PRESETS.find((p) => p.id === 'web').loudness, -14);
  assert.equal(PRESETS.find((p) => p.id === 'master').loudness, 0);
});

/* Ducking */

// Speech at 2–4 s and 6–7 s over a quiet room, and music under it all.
function setup() {
  const p = newProject('Duck');
  p.media.voice = { id: 'voice', kind: 'audio', name: 'voice.wav', duration: 10, streams: { main: { path: '/voice.wav', hasAudio: true, wave: 'voice' } } };
  p.media.music = { id: 'music', kind: 'audio', name: 'music.wav', duration: 10, streams: { main: { path: '/music.wav', hasAudio: true, wave: 'music' } } };
  const voice = makeClip('audio', { media: p.media.voice, start: 0, dur: 10, lane: -1 });
  const music = makeClip('audio', { media: p.media.music, start: 0, dur: 10, lane: -2 });
  placeFree(p, voice, 0, -1);
  placeFree(p, music, 0, -2);
  const peaks = Array.from({ length: 1000 }, (_, i) => ((i >= 200 && i < 400) || (i >= 600 && i < 700) ? 180 : 3));
  const waves = { voice: { rate: 100, peaks }, music: { rate: 100, peaks: Array(1000).fill(200) } };
  return { p, voice: p.clips[voice.id], music: p.clips[music.id], waveOf: (st) => waves[st?.wave] || null };
}

test('speech is found from the other audio, not from the music', () => {
  const { p, music, waveOf } = setup();
  const regions = speechUnderMusic(p, [music.id], waveOf);
  assert.equal(regions.length, 2);
  assert.ok(Math.abs(regions[0][0] - 2) < 0.06 && Math.abs(regions[0][1] - 4) < 0.06);
  assert.ok(Math.abs(regions[1][0] - 6) < 0.06 && Math.abs(regions[1][1] - 7) < 0.06);
  // Short pauses are bridged.
  assert.equal(speechRegions(p, waveOf, { ignore: new Set([music.id]), hold: 2.5 }).length, 1);
});

test('music gets volume keyframes that dip under the speech and come back', () => {
  const { p, music, waveOf } = setup();
  music.props.volume = -6;
  const regions = speechUnderMusic(p, [music.id], waveOf);
  assert.deepEqual(duckMusic(p, [music.id], regions), { clips: 1, regions: 2 });
  const m = p.clips[music.id];
  const low = -6 + DUCK_DEFAULTS.amount;
  assert.equal(valueAt(m, 'volume', 1), -6);
  assert.ok(Math.abs(valueAt(m, 'volume', 3) - low) < 0.01);
  assert.equal(valueAt(m, 'volume', 5.5), -6);
  assert.ok(Math.abs(valueAt(m, 'volume', 6.5) - low) < 0.01);
  assert.equal(valueAt(m, 'volume', 9), -6);
  // Fades down before the speech starts and up after it ends.
  const mid = valueAt(m, 'volume', regions[0][0] - DUCK_DEFAULTS.attack / 2);
  assert.ok(mid < -6 && mid > low);
});

test('keyframes follow the music when it is trimmed, and music without speech is left alone', () => {
  const { p, music } = setup();
  music.in = 3;
  music.start = 1;
  music.dur = 5;
  assert.equal(duckClip(music, [[2, 3]]), true);
  // Keyframes are stored in source time: timeline 2.5 s is source 4.5 s.
  assert.ok(Math.abs(valueAt(music, 'volume', 2.5) - DUCK_DEFAULTS.amount) < 0.01);
  const other = makeClip('audio', { media: p.media.music, start: 20, dur: 3, lane: -2 });
  assert.equal(duckClip(other, [[2, 3]]), false);
  assert.deepEqual(other.kf, {});
});
