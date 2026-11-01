import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScopes, chroma709, luma709, vectorBin, VECTOR_TARGETS } from '../src/shared/scopes.js';
const frame = (pixels, width = pixels.length) => ({
  data: new Uint8ClampedArray(
    pixels.flatMap((p) => [...p, p.length === 3 ? 255 : undefined].filter((v) => v !== undefined)),
  ),
  width,
  height: pixels.length / width,
});
const sum = (a) => a.reduce((s, v) => s + v, 0);
test('scopes count actual pixels, preserve input and measure black and white correctly', () => {
  const input = frame([
      [0, 0, 0],
      [255, 255, 255],
    ]),
    before = new Uint8ClampedArray(input.data),
    a = analyzeScopes(input, { columns: 2 });
  assert.equal(a.samples, 2);
  for (const h of a.histograms) {
    assert.equal(h[0], 1);
    assert.equal(h[255], 1);
    assert.equal(sum(h), 2);
  }
  assert.equal(a.stats.min, 0);
  assert.ok(Math.abs(a.stats.max - 1) < 1e-12);
  assert.ok(Math.abs(a.stats.mean - 0.5) < 1e-12);
  assert.equal(a.stats.high, 0.5);
  assert.equal(a.stats.low, 0.5);
  assert.deepEqual(input.data, before);
});
test('Rec.709 luma gives the expected signal levels for red, green and blue', () => {
  assert.equal(luma709(1, 0, 0), 0.2126);
  assert.equal(luma709(0, 1, 0), 0.7152);
  assert.equal(luma709(0, 0, 1), 0.0722);
  const a = analyzeScopes(
    frame([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]),
  );
  assert.equal(a.histograms[3][54], 1);
  assert.equal(a.histograms[3][182], 1);
  assert.equal(a.histograms[3][18], 1);
});
test('waveform retains horizontal position and places white at the top', () => {
  const a = analyzeScopes(
    frame(
      [
        [0, 0, 0],
        [255, 255, 255],
        [255, 0, 0],
        [0, 0, 0],
        [255, 255, 255],
        [255, 0, 0],
      ],
      3,
    ),
    { columns: 3 },
  );
  assert.equal(a.waveforms[3][255 * 3], 2);
  assert.equal(a.waveforms[3][1], 2);
  assert.equal(a.waveforms[0][2], 2);
  assert.equal(a.waveforms[1][255 * 3 + 2], 2);
  for (const w of a.waveforms) assert.equal(sum(w), 6);
});
test('a gray ramp has a diagonal waveform and a uniform histogram', () => {
  const ramp = Array.from({ length: 256 }, (_, v) => [v, v, v]);
  const a = analyzeScopes(frame(ramp), { columns: 256 });
  for (let i = 0; i < 256; i++) {
    assert.equal(a.histograms[3][i], 1);
    assert.equal(a.waveforms[3][(255 - i) * 256 + i], 1);
  }
});
test('neutral colors are centered and color targets occupy the correct vectorscope quadrants', () => {
  for (const v of [0, 0.1, 0.5, 1]) assert.deepEqual(chroma709(v, v, v), [0, 0]);
  const a = analyzeScopes(
    frame([
      [0, 0, 0],
      [128, 128, 128],
      [255, 255, 255],
    ]),
  );
  assert.equal(a.vectors[vectorBin(0, 0, a.vectorSize)], 3);
  assert.equal(sum(a.vectors), 3);
  const [ru, rv] = chroma709(1, 0, 0),
    [bu, bv] = chroma709(0, 0, 1);
  assert.ok(ru < 0 && rv > 0);
  assert.ok(bu > 0 && bv < 0);
  assert.equal(VECTOR_TARGETS.length, 6);
  assert.ok(VECTOR_TARGETS.find((t) => t.label === 'R').uv[1] === 0.375);
});
test('transparent pixels are measured as the composited signal over black', () => {
  const a = analyzeScopes(
    frame([
      [255, 255, 255, 0],
      [255, 255, 255, 128],
    ]),
  );
  assert.equal(a.histograms[3][0], 1);
  assert.equal(a.histograms[3][128], 1);
  assert.equal(a.stats.high, 0);
});
test('invalid frames are rejected and plot resolutions are bounded', () => {
  for (const bad of [
    { width: 0, height: 1, data: [] },
    { width: 2, height: 2, data: [0, 1] },
    { width: 1.5, height: 1, data: [] },
  ])
    assert.throws(() => analyzeScopes(bad));
  const a = analyzeScopes(frame([[0, 0, 0]]), { columns: 9999, vectorSize: 9999 });
  assert.equal(a.columns, 512);
  assert.equal(a.vectorSize, 256);
});
