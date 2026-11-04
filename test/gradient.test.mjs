import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GRADIENT, gradientParams, gradientColorAt, gradientStopColor, gradientAngle, gradientAtAngle, MAX_GRADIENT_POINTS } from '../src/shared/gradient.js';
import { makeVideoEffect, activeVideoEffects } from '../src/shared/videoEffects.js';
import { pasteAttributes } from '../src/shared/attributes.js';

test('fill defaults, nested stops and geometry are independent and survive JSON and attribute copying', () => {
  const a = makeVideoEffect('gradient'), b = makeVideoEffect('gradient');
  a.p.stops[0].color = '#ffffff'; a.p.points[0].radius = 1; a.p.start.x = 0.3;
  assert.equal(b.p.stops[0].color, DEFAULT_GRADIENT.stops[0].color);
  assert.equal(b.p.points[0].radius, DEFAULT_GRADIENT.points[0].radius);
  assert.equal(b.p.start.x, 0);
  const clip = { type: 'image', props: { vfx: [a, makeVideoEffect('solid')] }, kf: {} };
  const copied = JSON.parse(JSON.stringify(clip));
  assert.deepEqual(activeVideoEffects(copied), clip.props.vfx);
  pasteAttributes(clip, copied, ['effects']);
  copied.props.vfx[0].p.points[0].x = 0.9;
  assert.equal(a.p.points[0].x, 0.2);
});

test('linear gradients interpolate all sorted stops and clamp beyond endpoints', () => {
  const p = gradientParams({ stops: [
    { position: 1, color: '#0000ff' }, { position: 0.5, color: '#00ff00' }, { position: 0, color: '#ff0000' },
  ] });
  assert.deepEqual(gradientColorAt(p, 0.25, 0.5), [127.5, 127.5, 0]);
  assert.deepEqual(gradientColorAt(p, 0.5, 0.5), [0, 255, 0]);
  assert.deepEqual(gradientColorAt(p, -1, 0.5), [255, 0, 0]);
  assert.deepEqual(gradientColorAt(p, 2, 0.5), [0, 0, 255]);
  const duplicate = gradientParams({ stops: [{ position: 0.5, color: '#ff0000' }, { position: 0.5, color: '#0000ff' }] });
  assert.deepEqual(gradientStopColor(duplicate.stops, 0.5), [0, 0, 255]);
  p.end = { ...p.start };
  assert.deepEqual(gradientColorAt(p, 0.2, 0.2), [0, 0, 255]);
});

test('radial distance is circular on landscape and portrait sources', () => {
  const p = gradientParams({ mode: 'radial', radius: 0.5 });
  assert.deepEqual(gradientColorAt(p, 0.6, 0.5, 2), gradientColorAt(p, 0.5, 0.7, 2));
  assert.deepEqual(gradientColorAt(p, 0.7, 0.5, 0.5), gradientColorAt(p, 0.5, 0.6, 0.5));
});

test('freeform preserves point colors and increasing spread increases its influence', () => {
  const p = gradientParams({ mode: 'freeform', points: [
    { x: 0.1, y: 0.5, radius: 0.3, color: '#ff0000' },
    { x: 0.9, y: 0.5, radius: 0.3, color: '#0000ff' },
  ] });
  assert.ok(gradientColorAt(p, 0.1, 0.5)[0] > 254.99);
  assert.deepEqual(gradientColorAt(p, 0.5, 0.5), [127.5, 0, 127.5]);
  p.points[0].radius = 0.6;
  assert.ok(gradientColorAt(p, 0.5, 0.5)[0] > 230);
});

test('gradient normalization bounds point counts, invalid geometry, colors and spread', () => {
  const p = gradientParams({ mode: 'bad', radius: Infinity, start: { x: NaN, y: -2 }, stops: [], points: Array(100).fill({ x: 5, radius: 0, color: 'invalid' }) });
  assert.equal(p.mode, 'linear');
  assert.equal(p.radius, 0.5);
  assert.deepEqual(p.start, { x: 0, y: 0 });
  assert.equal(p.points.length, MAX_GRADIENT_POINTS);
  assert.equal(p.points[0].radius, 0.01);
  assert.equal(p.points[0].color, '#487cff');
  assert.equal(p.stops.length, 2);
});

test('gradient angles follow physical direction on landscape, portrait and square sources', () => {
  for (const aspect of [16/9, 9/16, 1]) for (const angle of [0, 22.5, 45, 90, 135, 180, 225, 270, 315, 359.9, 360, -90]) {
    const patch = gradientAtAngle(DEFAULT_GRADIENT, angle, aspect);
    assert.ok(Math.abs(gradientAngle(patch, aspect) - (angle % 360 + 360) % 360) < 1e-8);
    for (const point of [patch.start, patch.end]) for (const value of Object.values(point)) assert.ok(value >= 0 && value <= 1);
    const p = gradientParams({...DEFAULT_GRADIENT,...patch});
    assert.deepEqual(gradientColorAt(p, p.start.x, p.start.y, aspect), [72,124,255]);
    assert.deepEqual(gradientColorAt(p, p.end.x, p.end.y, aspect), [255,112,181]);
  }
});

test('rotating gradients retains a short gradient length and midpoint, fitting long gradients inside the source', () => {
  const original = {start:{x:.2,y:.4},end:{x:.6,y:.4}};
  const rotated = gradientAtAngle(original, 90, 1);
  assert.ok(Math.abs(rotated.start.x-.4)<1e-9);
  assert.ok(Math.abs(rotated.start.y-.2)<1e-9);
  assert.ok(Math.abs(rotated.end.y-.6)<1e-9);
  const corner = gradientAtAngle({start:{x:0,y:0},end:{x:1,y:0}}, 90, 2);
  assert.ok(Math.abs(corner.start.y)<1e-9);
  assert.ok(Math.abs(corner.end.y-1)<1e-9);
  const coincident = gradientAtAngle({start:{x:.3,y:.3},end:{x:.3,y:.3}}, 135, .5);
  assert.ok(Math.abs(gradientAngle(coincident,.5)-135)<1e-9);
  assert.equal(gradientAngle(gradientAtAngle({},NaN,0),0),0);
});
