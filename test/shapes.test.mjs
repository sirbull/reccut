import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, setKeyframe, valueAt } from '../src/shared/model.js';
import { addMask, maskKey, maskList, removeMask, setMaskShape, shapeAt } from '../src/shared/shapes.js';

test('punktene i en fri form glir mellom nøkkelbilder', () => {
  const c = makeClip('image', { start: 0, dur: 4 });
  const id = addMask(c, 'path', 1920, 1080);
  const key = maskKey(id, 'points');
  const a = [...c.props[key]];
  const b = a.map((v) => v * 2);
  setKeyframe(c, key, 0, a);
  setKeyframe(c, key, 2, b);
  const mid = valueAt(c, key, 1);
  assert.equal(mid.length, a.length);
  mid.forEach((v, i) => assert.ok(Math.abs(v - a[i] * 1.5) < 1e-9));
  assert.deepEqual(valueAt(c, key, 3), b);
});

test('formens geometri følger posisjon og rotasjon', () => {
  const c = makeClip('image', { start: 0, dur: 4 });
  const id = addMask(c, 'path', 1000, 1000);
  c.props[maskKey(id, 'points')] = [100, 0, 0, 100, -100, 0];
  c.props[maskKey(id, 'x')] = 50;
  c.props[maskKey(id, 'rotation')] = 90;
  const g = shapeAt(c, `mask.${id}.`, 'path', 0, 1000, 1000);
  assert.equal(g.cx, 550);
  // (100, 0) rotert 90 grader blir (0, 100) rundt midten.
  assert.ok(Math.abs(g.pts[0][0] - 550) < 1e-9 && Math.abs(g.pts[0][1] - 600) < 1e-9);
});

test('masker legges til, byttes til fri form og fjernes med nøkkelbilder', () => {
  const c = makeClip('video', { start: 0, dur: 4 });
  const id = addMask(c, 'ellipse', 1920, 1080);
  assert.equal(maskList(c).length, 1);
  setKeyframe(c, maskKey(id, 'x'), 1, 40);
  setMaskShape(c, id, 'path', 0, 1920, 1080);
  assert.equal(maskList(c)[0].shape, 'path');
  assert.equal(c.props[maskKey(id, 'points')].length, 16);
  removeMask(c, id);
  assert.equal(maskList(c).length, 0);
  assert.ok(!Object.keys(c.props).some((k) => k.startsWith('mask.')));
  assert.ok(!Object.keys(c.kf).some((k) => k.startsWith('mask.')));
});
