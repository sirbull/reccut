import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createChain, makeEffect } from '../src/shared/audiofx.js';

test('the actual worklet drains the pitch buffer when its source has ended', async () => {
  const bundled = await build({ entryPoints: ['src/renderer/audiofx-worklet.js'], bundle: true, write: false, format: 'iife' });
  let Processor;
  vm.runInNewContext(bundled.outputFiles[0].text, {
    sampleRate: 48000,
    AudioWorkletProcessor: class { constructor() { this.port = {}; } },
    registerProcessor: (_, processor) => { Processor = processor; },
  });
  const fx = [makeEffect('pitch', { semitones: -3 })];
  const processor = new Processor({ processorOptions: { init: fx } });
  const inputLength = 4096;
  const input = new Float32Array(inputLength + 2048);
  for (let i = 0; i < inputLength; i++) input[i] = 0.3 * Math.sin(2 * Math.PI * 187 * i / 48000);
  const actual = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    const block = input.subarray(i, i + 128);
    const output = [new Float32Array(128), new Float32Array(128)];
    processor.process(i < inputLength ? [[block]] : [[]], [output]);
    actual.set(output[0], i);
    assert.deepEqual(output[0], output[1], 'mono source stays centred');
  }
  const chain = createChain(48000);
  chain.update(fx);
  const expected = input.slice();
  chain.process(expected, expected.slice(), expected.length);
  assert.deepEqual(actual, expected, 'worklet and compensated export have the same final samples');
  assert.ok(actual.subarray(inputLength).some((v) => Math.abs(v) > 0.1), 'the final voice samples are not cut off');
});
