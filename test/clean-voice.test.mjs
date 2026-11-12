import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { cleanAmount, cleanNoiseGain } from '../src/shared/audiofx.js';

test('Clean Voice strength maps to how much of the original is mixed back in', () => {
  assert.equal(cleanNoiseGain(0), 1);
  assert.equal(cleanNoiseGain(1), 0);
  assert.equal(cleanNoiseGain(0.5), 0.25); // about 12 dB less noise
  assert.equal(cleanNoiseGain(2), 0);
  const clip = { props: { cleanVoice: { main: 0.8, camera: 0 } } };
  assert.equal(cleanAmount(clip, 'main'), 0.8);
  assert.equal(cleanAmount(clip, 'camera'), 0);
  assert.equal(cleanAmount(clip, 'screen'), 0);
  assert.equal(cleanAmount({ props: {} }, 'main'), 0);
});

test('the noise removal model ships with the app, pinned and with its license', () => {
  // Unntak fra regelen om nedlasting ved behov: modellen er bare 16 MB (se CLAUDE.md).
  const model = fs.readFileSync(new URL('../assets/denoise/denoiser_model.onnx', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(model).digest('hex'), 'fe5eb64fa2e4154c83f8e4935e82871c850c154387ee892e0ab65fe179e7d8c9');
  assert.match(fs.readFileSync(new URL('../assets/licenses/DeepFilterNet-MIT.txt', import.meta.url), 'utf8'), /MIT OR Apache-2\.0[\s\S]*Permission is hereby granted/);
  assert.match(fs.readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8'), /assets\/denoise/);
});
