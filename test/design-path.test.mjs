import test from 'node:test';
import assert from 'node:assert/strict';
import { newLayer, normalizeLayer } from '../src/shared/design.js';
import { fitPathLayer, localNodes, toLocal, toWorld } from '../src/shared/designPath.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('editing a rotated, flipped shape as a path keeps untouched points in place', () => {
  const l = newLayer('shape', { shape: 'star', x: 100, y: 50, w: 300, h: 200, rotation: 30, flipX: true });
  const before = localNodes(l).map((n) => toWorld(l, n.x, n.y));
  const nodes = localNodes(l);
  const moved = toLocal(l, { x: before[0].x + 40, y: before[0].y - 25 });
  nodes[0] = { ...nodes[0], x: moved.x, y: moved.y };
  const next = fitPathLayer(l, nodes, true);
  const after = localNodes(next).map((n) => toWorld(next, n.x, n.y));
  close(after[0].x, before[0].x + 40); close(after[0].y, before[0].y - 25);
  for (let i = 1; i < before.length; i++) { close(after[i].x, before[i].x); close(after[i].y, before[i].y); }
  assert.equal(next.shape, 'path'); assert.equal(next.rotation, 30); assert.equal(next.flipX, true);
});

test('path layers survive normalization and bad paths fall back to a rectangle', () => {
  const base = newLayer('shape', { x: 0, y: 0, w: 1, h: 1, fill: null });
  const path = fitPathLayer(base, [{ x: 10, y: 10, ix: 10, iy: 10, ox: 60, oy: 0 }, { x: 110, y: 60, ix: 110, iy: 60, ox: 110, oy: 60 }], false);
  const saved = normalizeLayer(JSON.parse(JSON.stringify(path)));
  assert.equal(saved.shape, 'path'); assert.equal(saved.path.closed, false); assert.equal(saved.path.nodes.length, 2);
  const broken = normalizeLayer({ ...saved, path: { nodes: [{ x: 0, y: 0 }] } });
  assert.equal(broken.shape, 'rect'); assert.equal(broken.path, undefined);
});
