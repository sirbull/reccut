import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_EFFECTS, AUDIO_PRESETS, biquadResponse, componentEffects, createChain, eqCoefs, makeEffect, presetEffects } from '../src/shared/audiofx.js';

const SR = 48000;
const sine = (f, n, a = 0.5) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / SR));
const rms = (x, from = 0) => Math.sqrt(x.slice(from).reduce((s, v) => s + v * v, 0) / (x.length - from));

function run(list, L, R = L.slice()) {
  const c = createChain(SR);
  c.update(list);
  for (let i = 0; i < L.length; i += 128) c.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, L.length - i));
  return { L, R, latency: c.latency };
}

test('alle effekter og maler gir endelige verdier', () => {
  for (const type of Object.keys(AUDIO_EFFECTS)) {
    const { L, R } = run([makeEffect(type)], sine(440, SR / 2));
    assert.ok(L.every(Number.isFinite) && R.every(Number.isFinite), type);
    assert.ok(Math.max(...L.map(Math.abs)) < 8, `${type} for høyt`);
  }
  for (const pr of AUDIO_PRESETS) {
    const { L } = run(presetEffects(pr.id), sine(300, SR / 2));
    assert.ok(L.every(Number.isFinite), pr.id);
  }
});

test('equalizeren gir riktig forsterkning på båndet', () => {
  const p = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`b${i}`, i === 5 ? 9 : 0]));
  const c = eqCoefs(p, SR);
  const db = c.reduce((s, x) => s + biquadResponse(x, 1000, SR), 0);
  assert.ok(Math.abs(db - 9) < 0.6, `1 kHz gir ${db}`);
  const { L } = run([makeEffect('eq', p)], sine(1000, SR));
  assert.ok(Math.abs(20 * Math.log10(rms(L, SR / 2) / (0.5 / Math.SQRT2)) - 9) < 0.8);
});

test('high pass fjerner brum og hum removal tar 50 Hz', () => {
  assert.ok(rms(run([makeEffect('highpass', { freq: 200 })], sine(40, SR)).L, SR / 2) < 0.03);
  assert.ok(rms(run([makeEffect('hum', { freq: 50 })], sine(50, SR)).L, SR / 2) < 0.02);
  // Talefrekvenser slipper gjennom.
  assert.ok(rms(run([makeEffect('hum', { freq: 50 })], sine(700, SR)).L, SR / 2) > 0.3);
});

test('støyfjerning demper jevn støy, og forsinkelsen er oppgitt', () => {
  let s = 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const noise = Float32Array.from({ length: SR * 2 }, () => rnd() * 0.05);
  const before = rms(noise, SR);
  const { L, latency } = run([makeEffect('denoise', { amount: 0.9, floor: -30 })], noise.slice());
  assert.equal(latency, 1024);
  assert.ok(rms(L, SR) < before * 0.4, `${rms(L, SR)} mot ${before}`);
});

test('limiteren holder toppene under taket', () => {
  const { L } = run([makeEffect('limiter', { ceiling: -3, gain: 12 })], sine(200, SR));
  assert.ok(Math.max(...L.map(Math.abs)) <= 10 ** (-3 / 20) + 1e-6);
});

test('støyfjerning beholder tale med pauser', () => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  // Taleaktige støt (0,3 s lyd, 0,3 s pause) med jevn støy under.
  const on = (i) => Math.floor(i / (SR * 0.3)) % 2 === 0;
  const tone = Float32Array.from({ length: SR * 4 }, (_, i) => (on(i) ? 0.3 * Math.sin((2 * Math.PI * (300 + 200 * Math.sin(i / 4000)) * i) / SR) : 0));
  const x = tone.map((v) => v + rnd() * 0.02);
  const { L, latency } = run([makeEffect('denoise', { amount: 0.8 })], x.slice());
  // Sammenlign i siste halvdel, med forsinkelsen trukket fra.
  const out = L.slice(SR * 2 + latency);
  const ref = tone.slice(SR * 2, SR * 4 - latency);
  const speech = (a, b) => Math.sqrt(a.reduce((acc, v, i) => (on(i + SR * 2) ? acc + v * v : acc), 0) / b);
  const pause = (a) => Math.sqrt(a.reduce((acc, v, i) => (!on(i + SR * 2) ? acc + v * v : acc), 0));
  assert.ok(speech(out, out.length) > speech(ref, ref.length) * 0.8, 'talen beholdes');
  assert.ok(pause(out) < pause(x.slice(SR * 2, SR * 4 - latency)) * 0.4, 'pausene blir stillere');
});

import { makeClip as mk, setKeyframe as setKf } from '../src/shared/model.js';
import { groupsWithContent, pasteAttributes, removeAttributes } from '../src/shared/attributes.js';

test('Paste Attributes limer inn valgte grupper og strekker nøkkelbilder', () => {
  const src = mk('video', { start: 0, dur: 4, in: 10 });
  src.props.blur = 12;
  src.props.fx = ['blur'];
  src.props.afx = [makeEffect('reverb')];
  src.props.exposure = 0.3;
  setKf(src, 'scale', 10, 1);
  setKf(src, 'scale', 12, 2);
  const groups = groupsWithContent(src);
  assert.deepEqual(groups.sort(), ['afx', 'color', 'effects', 'transform'].sort());
  const dst = mk('video', { start: 20, dur: 8, in: 0 });
  dst.props.x = 300;
  pasteAttributes(src, dst, ['effects', 'afx', 'transform'], { stretch: true });
  assert.equal(dst.props.blur, 12);
  assert.equal(dst.props.afx.length, 1);
  assert.notEqual(dst.props.afx[0].id, src.props.afx[0].id);
  assert.equal(dst.props.exposure, 0, 'farge ble ikke valgt');
  assert.equal(dst.props.x, 0, 'transform erstattes helt');
  assert.deepEqual(dst.kf.scale.map((k) => k[0]), [0, 4]);
  // Samme timing.
  const dst2 = mk('video', { start: 0, dur: 8, in: 5 });
  pasteAttributes(src, dst2, ['transform'], { stretch: false });
  assert.deepEqual(dst2.kf.scale.map((k) => k[0]), [5, 7]);
  // Lyd limes ikke inn i et bilde, og video ikke i lyd.
  const audio = mk('audio', { dur: 3 });
  pasteAttributes(src, audio, ['effects', 'afx']);
  assert.equal(audio.props.blur, undefined);
  assert.equal(audio.props.afx.length, 1);
  removeAttributes(dst, ['effects', 'afx']);
  assert.equal(dst.props.blur, 0);
  assert.equal(dst.props.afx.length, 0);
});

test('mono applies to the chosen component only, averages both channels and runs before other effects', () => {
  const gain = { id: 'g', type: Object.keys(AUDIO_EFFECTS)[0] };
  const clip = { props: { afx: [gain], audioMono: { camera: true } } };
  assert.deepEqual(componentEffects(clip, 'screen'), [gain]);
  assert.equal(componentEffects(clip, 'camera').length, 2);
  assert.equal(componentEffects(clip, 'camera')[1], gain);
  const L = sine(440, 1024), R = new Float32Array(1024);
  const expected = L.map((v) => v / 2);
  run(componentEffects({ props: { audioMono: { main: true } } }, 'main'), L, R);
  assert.deepEqual([...L], [...expected]);
  assert.deepEqual([...R], [...expected]);
});

test('neutral pitch is sample exact with no delay; disabling it restores the original', () => {
  const input = sine(187, SR);
  const { L, latency } = run([makeEffect('pitch')], input.slice());
  assert.deepEqual(L, input);
  assert.equal(latency, 0);
  assert.deepEqual(run([{ ...makeEffect('pitch', { semitones: -4 }), on: false }], input.slice()).L, input);
});

test('Voice Character adds low end without changing length, and delays only when it pitches', () => {
  const gainAt = (f, p) => rms(run([makeEffect('voice', { presence: 0, density: 0, warmth: 0, ...p })], sine(f, SR, 0.05)).L, SR / 2);
  const low = gainAt(110, { depth: 1 }) / gainAt(110, { depth: 0 });
  const mid = gainAt(1000, { depth: 1 }) / gainAt(1000, { depth: 0 });
  assert.ok(low > 2 && mid < 1.2, `low ${low}, mid ${mid}`);
  assert.ok(gainAt(4000, { presence: 1 }) / gainAt(4000, { presence: 0 }) > 1.5, 'presence lifts 4 kHz');
  const { L, latency } = run([makeEffect('voice')], sine(220, SR));
  assert.equal(L.length, SR);
  assert.equal(latency, 0);
  assert.equal(run([makeEffect('voice', { semitones: -1 })], sine(220, SR)).latency, 2048);
  for (const id of ['warm-narrator', 'deep-voice', 'trailer-voice']) assert.equal(AUDIO_PRESETS.find((x) => x.id === id).category, 'Voice');
});

// Count periods after the analysis window has settled. Tests the sound produced,
// rather than just the slider or saved parameter.
const frequency = (x, sr) => {
  const crossings = [];
  for (let i = sr; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) crossings.push(i);
  return (crossings.length - 1) * sr / (crossings.at(-1) - crossings[0]);
};
test('pitch shifts both channels in either direction without changing their duration', () => {
  for (const sr of [22050, 24000, 44100, 48000]) for (const st of [-12, -3, 2, 12]) {
    const input = Float32Array.from({ length: sr * 2 }, (_, i) => 0.4 * Math.sin(2 * Math.PI * 220 * i / sr));
    const L = input.slice(), R = input.map((v) => v * 0.3);
    const chain = createChain(sr);
    chain.update([makeEffect('pitch', { semitones: st })]);
    for (let i = 0; i < L.length; i += 128) chain.process(L.subarray(i, i + 128), R.subarray(i, i + 128), Math.min(128, L.length - i));
    assert.equal(L.length, input.length);
    assert.ok(L.every(Number.isFinite) && R.every(Number.isFinite));
    assert.ok(Math.abs(frequency(L, sr) - 220 * 2 ** (st / 12)) < 2, `${sr} Hz, ${st} st: ${frequency(L, sr)} Hz`);
    assert.ok(rms(L, sr) > 0.1, 'shifted voice stays audible');
    assert.ok(rms(R.map((v, i) => v - L[i] * 0.3)) / rms(L) < 0.001, 'stereo balance stays intact');
  }
});

test('pitch is identical in worklet sized and export sized blocks and resets to neutral', () => {
  const effect = makeEffect('pitch', { semitones: -3 });
  const input = sine(173, SR * 2);
  const live = run([effect], input.slice());
  const chain = createChain(SR);
  chain.update([effect]);
  const offline = input.slice(), right = input.slice();
  chain.process(offline, right, offline.length);
  assert.deepEqual(offline, live.L);
  assert.equal(chain.latency, 2048);
  chain.update([{ ...effect, p: { semitones: 0 } }]);
  const neutral = input.slice();
  chain.process(neutral, neutral.slice(), neutral.length);
  assert.equal(chain.latency, 0);
  assert.deepEqual(neutral, input);
});

test('channels uses one side, swaps or mixes to mono', () => {
  const L = new Float32Array([1, 0.5]);
  const R = new Float32Array([0, -0.5]);
  const go = (mode) => {
    const l = L.slice(), r = R.slice();
    const chain = createChain(SR);
    chain.update([makeEffect('channels', { mode })]);
    chain.process(l, r, 2);
    return [[...l], [...r]];
  };
  assert.deepEqual(go(0), [[1, 0.5], [0, -0.5]]);
  assert.deepEqual(go(1), [[1, 0.5], [1, 0.5]]);
  assert.deepEqual(go(2), [[0, -0.5], [0, -0.5]]);
  assert.deepEqual(go(3), [[0, -0.5], [1, 0.5]]);
  assert.deepEqual(go(4), [[0.5, 0], [0.5, 0]]);
});
