import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, SEQUENCE_FIELDS } from '../src/shared/model.js';
import { newDesign, newLayer, normalizeDesign, normalizeLayer, normalizeDesignProject, designList, DESIGN_SIZES, layerBounds, layerPoint, hitTest, fitBox, resizeLayer, snapMove, snapRotation, reorderLayers, resizeDesign } from '../src/shared/design.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('design defaults and every preset are valid without changing the sequence format', () => {
  const d = newDesign(); assert.equal(d.width, 1280); assert.deepEqual(d.layers, []);
  assert.deepEqual(newProject().designAssets, {});
  assert.ok(!SEQUENCE_FIELDS.includes('designs') && !SEQUENCE_FIELDS.includes('designAssets'));
  for (const size of DESIGN_SIZES) { const d = newDesign(size); assert.equal(d.width, size.width); assert.equal(d.height, size.height); }
  for (const [width, height] of [[0, 1], [8193, 1], [2.5, 10], [NaN, 20], [1, Infinity]]) assert.throws(() => newDesign({ width, height }), /whole numbers/);
  for (const [width, height] of [[1, 1], [8192, 8192], [333, 777]]) assert.equal(newDesign({ width, height }).height, height);
});
test('normalization tolerates missing, malformed and duplicate layers and bad numbers', () => {
  for (const value of [null, undefined, false, [], {}, { width: NaN, height: -4, layers: [null, {}, { type: 'alien' }, { type: 'text', opacity: 4, size: NaN, text: 12 }, { type: 'image', crop: { x: 2, w: NaN } }] }]) {
    const d = normalizeDesign(value); assert.ok(d.width >= 1 && d.width <= 8192); assert.ok(d.height >= 1); assert.ok(Array.isArray(d.layers));
  }
  const d = normalizeDesign({ layers: [{ id: 'x', type: 'text', opacity: -4 }, { id: 'x', type: 'shape', rotation: NaN }, { type: 'unknown' }] });
  assert.equal(d.layers.length, 2); assert.notEqual(d.layers[0].id, d.layers[1].id); assert.equal(d.layers[0].opacity, 0); assert.equal(d.layers[1].rotation, 0);
  assert.equal(normalizeLayer({ type: 'image', asset: 'a', media: 'b' }).media, null);
  assert.deepEqual(designList({}), []);
  assert.deepEqual(normalizeDesignProject({ media: {} }).designs, {});
  const p = normalizeDesignProject({ designs: { a: { layers: [{ type: 'text' }] } } }); assert.equal(p.designs.a.id, 'a');
});
test('design listing is stable by creation time', () => {
  assert.deepEqual(designList({ designs: { b: { id: 'b', created: 20 }, a: { id: 'a', created: 10 } } }).map((d) => d.id), ['a','b']);
});
test('hit testing uses inverse rotation, ignores hidden and locked layers, and respects order', () => {
  const l = newLayer('shape', { x: 100, y: 100, w: 100, h: 100, rotation: 45 }), d = { layers: [l] };
  assert.equal(hitTest(d, 150, 85)?.id, l.id);
  assert.equal(hitTest(d, 102, 102), null);
  const flip = { ...l, flipX: true, flipY: true }; assert.equal(hitTest({ layers: [flip] }, 150, 85), flip);
  const top = newLayer('shape', { x: 120, y: 120, w: 50, h: 50 });
  assert.equal(hitTest({ layers: [l, top] }, 150, 150), top);
  for (const prop of ['hidden', 'locked']) assert.equal(hitTest({ layers: [{ ...top, [prop]: true }] }, 150, 150), null);
  near(layerBounds(l).w, Math.sqrt(2) * 100);
});
test('cover and contain preserve aspect for wide, tall and equal sources', () => {
  assert.deepEqual(fitBox(200, 100, 100, 100), { x: 0, y: 25, w: 100, h: 50 });
  assert.deepEqual(fitBox(200, 100, 100, 100, 'cover'), { x: -50, y: 0, w: 200, h: 100 });
  assert.deepEqual(fitBox(100, 200, 100, 100, 'cover'), { x: 0, y: -50, w: 100, h: 200 });
  assert.deepEqual(fitBox(100, 200, 100, 100), { x: 25, y: 0, w: 50, h: 100 });
  assert.deepEqual(fitBox(100, 100, 100, 100), { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(fitBox(100, 200, 333, 777, 'stretch'), { x: 0, y: 0, w: 333, h: 777 });
});
test('rotated corner resizing keeps the opposite corner fixed, including aspect lock', () => {
  for (const rotation of [0, 30, 90, -135]) for (const handle of ['nw','ne','se','sw']) for (const keepAspect of [false,true]) {
    const l = newLayer('shape', { x: 80, y: 70, w: 200, h: 100, rotation });
    const opposite = [handle.includes('w') ? l.w : 0, handle.includes('n') ? l.h : 0];
    const a = layerPoint(l, ...opposite), next = resizeLayer(l, handle, 40, 25, { keepAspect });
    const b = layerPoint(next, handle.includes('w') ? next.w : 0, handle.includes('n') ? next.h : 0);
    near(a.x, b.x); near(a.y, b.y);
    if (keepAspect) near(next.w / next.h, 2);
  }
});
test('center resize keeps center fixed and tiny reversed drags do not create negative sizes', () => {
  const l = newLayer('shape', { x: 20, y: 30, w: 200, h: 100, rotation: 30 });
  const next = resizeLayer(l, 'se', 40, 30, { fromCenter: true });
  near(l.x + l.w / 2, next.x + next.w / 2); near(l.y + l.h / 2, next.y + next.h / 2);
  const small = resizeLayer(l, 'se', -1e6, -1e6, { keepAspect: true }); assert.ok(small.w >= 1 && small.h >= 1);
  assert.equal(snapRotation(37, true), 30); assert.equal(snapRotation(38, true), 45); assert.equal(snapRotation(38), 38);
});
test('move snapping chooses the nearest edge or center inside the threshold', () => {
  const b = { x: 0, y: 0, w: 20, h: 10 };
  const s = snapMove(b, 79, 45, { x: [101, 100], y: [100] }, 3);
  assert.equal(s.dx, 80); assert.equal(s.dy, 45); assert.deepEqual(s.guides, [{ axis: 'x', value: 100 }]);
  assert.deepEqual(snapMove(b, 50, 0, { x: [100] }, 2).guides, []);
  assert.deepEqual(normalizeDesign({ guides: [{ axis: 'x', value: 40 }, { axis: 'z', value: 1 }, { axis: 'y', value: 'a' }, null] }).guides, [{ axis: 'x', value: 40 }]);
});
test('reordering preserves the order inside a selection; resizing keeps centers relative', () => {
  const layers = ['a','b','c','d'].map((id) => newLayer('shape', { id }));
  assert.deepEqual(reorderLayers(layers, ['b','c'], 'up').map((l) => l.id), ['a','d','b','c']);
  assert.deepEqual(reorderLayers(layers, ['b','c'], 'down').map((l) => l.id), ['b','c','a','d']);
  assert.deepEqual(reorderLayers(layers, ['a','c'], 'front').map((l) => l.id), ['b','d','a','c']);
  const d = { ...newDesign(), layers: [newLayer('shape')] }, r = resizeDesign(d, 333, 777);
  near(r.layers[0].x - d.layers[0].x, (333 - d.width) / 2);
  assert.throws(() => resizeDesign(d, 0, 0), /whole numbers/);
});

test('source videos retain native geometry and cached thumbnail tiles sample timeline source times', async () => {
  const { frameSourceProject, frameThumbnails } = await import('../src/shared/design.js');
  const p = { width: 1920, height: 1080, fps: 30, duration: 4, media: {}, clips: {} };
  const media = { kind: 'video', streams: { main: { width: 1080, height: 1920, fps: 24, thumbs: { interval: 1, files: ['a','b','c','d'] } } } };
  const source = frameSourceProject(p, media); assert.equal(source.width, 1080); assert.equal(source.height, 1920); assert.equal(source.fps, 24);
  assert.equal(p.width, 1920); assert.equal(frameSourceProject(p, { kind: 'recording' }), p);
  assert.deepEqual(frameThumbnails(p), []);
  p.media.v = media; p.clips.c = { type: 'video', mediaId: 'v', lane: 0, start: 0, in: 0, dur: 4, props: {} };
  assert.deepEqual(frameThumbnails(p, 4).map((t) => t.path), ['a','b','c','d']);
  p.clips.c.in = 1;
  assert.deepEqual(frameThumbnails(p, 4).map((t) => t.path), ['b','c','d','d']);
});
