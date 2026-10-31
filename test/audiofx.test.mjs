import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_EFFECTS, AUDIO_PRESETS, biquadResponse, createChain, eqCoefs, makeEffect, presetEffects } from '../src/shared/audiofx.js';

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
