import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeVideoEffect,
  activeVideoEffects,
  keyAlpha,
  keyPixels,
  removeSpill,
  rgb,
  sampleScreenColor,
} from '../src/shared/videoEffects.js';
import { pasteAttributes, removeAttributes } from '../src/shared/attributes.js';
const pixel = (r, g, b, a = 255) => [r, g, b, a];
test('chroma key removes green and preserves foreground, existing alpha and soft edges', () => {
  const e = makeVideoEffect('chroma');
  e.p.color = '#00ff00';
  assert.equal(keyAlpha([0, 1, 0], e), 0);
  assert.equal(keyAlpha([1, 0, 0], e), 1);
  const soft = [0.2, 0.8, 0.2],
    a = keyAlpha(soft, e);
  assert.ok(a > 0 && a < 1);
  const data = new Uint8ClampedArray([...pixel(0, 255, 0), ...pixel(255, 0, 0, 128)]);
  const result = keyPixels(data, 2, 1, e);
  assert.equal(result[3], 0);
  assert.equal(result[7], 128);
  assert.equal(data[3], 255);
  e.p.invert = true;
  assert.equal(keyAlpha([0, 1, 0], e), 1);
  assert.equal(keyAlpha([1, 0, 0], e), 0);
});
test('despill reduces key color without introducing a temporal buffer', () => {
  const e = makeVideoEffect('chroma');
  e.p.color = '#00ff00';
  e.p.despill = 1;
  assert.deepEqual(removeSpill([0.3, 0.8, 0.4], e), [0.3, 0.4, 0.4]);
  const first = keyPixels(new Uint8ClampedArray(pixel(255, 0, 0)), 1, 1, e);
  keyPixels(new Uint8ClampedArray(pixel(0, 255, 0)), 1, 1, e);
  assert.deepEqual(keyPixels(new Uint8ClampedArray(pixel(255, 0, 0)), 1, 1, e), first);
});
test('clean plate key requires a reference and preserves changed pixels', () => {
  const e = makeVideoEffect('difference');
  assert.equal(keyAlpha([0.2, 0.3, 0.4], e), 1);
  assert.equal(keyAlpha([0.2, 0.3, 0.4], e, [0.2, 0.3, 0.4]), 0);
  assert.equal(keyAlpha([1, 0, 0], e, [0.2, 0.3, 0.4]), 1);
  const d = new Uint8ClampedArray([...pixel(20, 30, 40), ...pixel(255, 0, 0)]);
  const ref = new Uint8ClampedArray([...pixel(20, 30, 40), ...pixel(20, 30, 40)]);
  const out = keyPixels(d, 2, 1, e, ref);
  assert.equal(out[3], 0);
  assert.equal(out[7], 255);
});
test('luma key, spatial edge refinement and matte visualization', () => {
  const e = makeVideoEffect('luma');
  e.p.similarity = 0.1;
  e.p.softness = 0.1;
  const data = new Uint8ClampedArray([0, 255, 255, 255, 0].flatMap((v) => pixel(v, v, v)));
  e.p.choke = 1;
  let out = keyPixels(data, 5, 1, e);
  assert.deepEqual(
    [3, 7, 11, 15, 19].map((i) => out[i]),
    [0, 0, 255, 0, 0],
  );
  e.p.choke = 0;
  e.p.feather = 1;
  out = keyPixels(data, 5, 1, e);
  assert.ok(out[3] > 0 && out[3] < 255);
  e.p.feather = 0;
  e.p.view = 'matte';
  out = keyPixels(data, 5, 1, e);
  assert.deepEqual([...out.slice(0, 8)], [0, 0, 0, 255, 255, 255, 255, 255]);
});
test('screen sampling selects border color despite a foreground actor', () => {
  const w = 64,
    h = 64,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      data.set(x > 10 && x < 54 && y > 10 && y < 54 ? pixel(255, 50, 20) : pixel(10, 180, 30), (y * w + x) * 4);
  assert.equal(sampleScreenColor(data, w, h), '#0ab41e');
  assert.deepEqual(rgb('#0ab41e'), [10 / 255, 180 / 255, 30 / 255]);
});
test('stack preserves ordering, duplicate instances and recording stream targets', () => {
  const a = makeVideoEffect('chroma'),
    b = makeVideoEffect('chroma'),
    c = makeVideoEffect('blur');
  assert.notEqual(a.id, b.id);
  a.target = 'camera';
  b.target = 'screen';
  c.on = false;
  const clip = { props: { vfx: [a, b, c] } };
  assert.deepEqual(activeVideoEffects(clip, 'camera'), [a]);
  assert.deepEqual(activeVideoEffects(clip, 'screen'), [b]);
  assert.deepEqual(activeVideoEffects({ props: { vfx: [b, a] } }, 'screen'), [b]);
});
test('copy and remove attributes include the complete effect stack without sharing parameters', () => {
  const a = {
    type: 'video',
    in: 0,
    dur: 2,
    props: { vfx: [makeVideoEffect('chroma'), makeVideoEffect('chroma')] },
    kf: {},
  };
  const b = { type: 'video', in: 0, dur: 2, props: {}, kf: {} };
  pasteAttributes(a, b, ['effects']);
  assert.deepEqual(b.props.vfx, a.props.vfx);
  b.props.vfx[0].p.similarity = 0.4;
  assert.notEqual(a.props.vfx[0].p.similarity, 0.4);
  removeAttributes(b, ['effects']);
  assert.equal(b.props.vfx, undefined);
});

test('temporal median recovers a static background behind a moving subject', async () => {
  const { estimateBackground } = await import('../src/shared/videoEffects.js');
  const frames = [0, 1, 2].map((at) => {
    const data = new Uint8ClampedArray(3 * 4);
    for (let x = 0; x < 3; x++) data.set(x === at ? pixel(255, 0, 0) : pixel(20, 40, 60), x * 4);
    return { width: 3, height: 1, data };
  });
  assert.deepEqual(
    [...estimateBackground(frames).data],
    Array(3)
      .fill(pixel(20, 40, 60))
      .flat(),
  );
  assert.throws(() => estimateBackground([frames[0]]));
});
