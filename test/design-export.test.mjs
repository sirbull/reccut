import test from 'node:test';
import assert from 'node:assert/strict';
import { fitToSize, designFileName, uniqueDesignName } from '../src/shared/designExport.js';
test('quality search finds the best size within a bounded number of encodes', async () => {
  let calls = 0;
  const result = await fitToSize(async (q) => { calls++; return new Uint8Array(Math.round(q * 10000)); }, 7000);
  assert.ok(result.quality <= 0.7001 && result.quality >= 0.69); assert.equal(result.over, false); assert.ok(calls <= 8); assert.ok(result.data.length <= 7000);
});
test('quality search returns the minimum when impossible and the maximum when possible', async () => {
  let calls = 0;
  const impossible = await fitToSize(async () => { calls++; return { size: 3000 }; }, 1000);
  assert.equal(impossible.over, true); assert.equal(impossible.quality, 0.4); assert.equal(calls, 1);
  const small = await fitToSize(async () => new Uint8Array(1), 1000); assert.equal(small.quality, 0.95);
  await assert.rejects(() => fitToSize(() => {}, 0), /Invalid/);
});
test('file names remove invalid characters, keep emoji, bound length and avoid collisions', () => {
  assert.equal(designFileName('a/b\\c:*?"<>|'), 'abc'); assert.equal(designFileName(''), 'Design'); assert.equal(designFileName('..'), 'Design');
  assert.equal(designFileName('/<>|'), 'Design'); assert.equal(designFileName('🦊 æøå'), '🦊 æøå');
  assert.equal(designFileName('x'.repeat(300)).length, 200);
  assert.equal(Array.from(designFileName('😀'.repeat(300))).length, 50);
  assert.equal(designFileName('CON'), '_CON');
  assert.equal(uniqueDesignName('Test', 'jpg', (name) => ['Test.jpg','Test 2.jpg'].includes(name)), 'Test 3.jpg');
});
