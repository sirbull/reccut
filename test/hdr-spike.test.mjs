import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { pq, hlg, pattern, samplePlanar, correctHlgRgb, prepareHlgPlanar } = require('../scripts/hdr-spike/fixtures.cjs');

test('HDR experiment uses known PQ reference values and a stated 1000-nit HLG display', () => {
  assert.ok(Math.abs(pq(100) - 0.5080784215) < 1e-9);
  assert.ok(Math.abs(pq(1000) - 0.7518270962) < 1e-9);
  assert.ok(Math.abs(pq(10000) - 1) < 1e-9);
  assert.deepEqual(hlg([0, 0, 0]), [0, 0, 0]);
  assert.ok(hlg([1000, 1000, 1000]).every(v => Math.abs(v - 1) < 1e-7));
  assert.ok(hlg([203, 203, 203]).every(v => Math.abs(v - 0.75) < 0.0002));
});

test('float fixture channels are planar G/B/R and patch samples retain known nits above SDR white', () => {
  const w = 100, h = 40, bytes = pattern(w, h, 'pq', false), data = new Float32Array(bytes.buffer), n = w * h;
  const red = 12 * w + 75;
  assert.equal(data[red], 0); assert.equal(data[n + red], 0); assert.equal(data[n * 2 + red], 1);
  const samples = samplePlanar(bytes, w, h, 'pq');
  assert.ok(samples.find(p => p.name === '10000 nits').measured.every(v => Math.abs(v - 10000 / 203) < 1e-5));
  assert.ok(samples.every(p => p.relativeOrWhiteError < 1e-6));
});

test('HLG reference includes luminance coupling for saturated colors instead of treating them as gray', () => {
  const rgb = hlg([203, 0, 0]);
  assert.ok(rgb[0] > hlg([203, 203, 203])[0]);
  assert.equal(rgb[1], 0); assert.equal(rgb[2], 0);
  // Actual first-run raw zscale blue patch. A same-transform round trip would
  // hide this ~77% discrepancy; the independent luminance OOTF recovers white-relative 1.
  const corrected = correctHlgRgb([0, 0, 1.7738995552062988]);
  assert.ok(Math.abs(corrected[2] - 1) < 0.01);
  assert.equal(corrected[0], 0); assert.equal(corrected[1], 0);
});

test('explicit HLG encode preparation keeps gray unchanged and compensates saturated primaries', () => {
  const w = 100, h = 40, bytes = prepareHlgPlanar(pattern(w, h, 'hlg', false));
  const samples = samplePlanar(bytes, w, h, 'hlg');
  const white = samples.find(p => p.name === '203 nits');
  assert.ok(white.measured.every(v => Math.abs(v - 1) < 1e-6));
  const blue = samples.find(p => p.name === 'BT.2020 blue');
  assert.ok(blue.measured[2] > 1.7);
  assert.ok(Math.abs(correctHlgRgb(blue.measured)[2] - 1) < 1e-6);
});
