import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, setKeyframe, setKeyframeEase, setPathSmooth, valueAt } from '../src/shared/model.js';
import { setKeyframe as setEditorKeyframe, removeKeyframePair } from '../src/renderer/editor/keyframes.js';

function clip() {
  const c = makeClip('title', { start: 0, in: 0, dur: 4 });
  c.kf = {};
  return c;
}

test('uten håndtak går posisjonen i rett linje, med håndtak i en bue', () => {
  const c = clip();
  for (const [t, x] of [[0, 0], [2, 200]]) {
    setKeyframe(c, 'x', t, x, 'linear');
    setKeyframe(c, 'y', t, 0, 'linear');
  }
  assert.deepEqual([valueAt(c, 'x', 1), valueAt(c, 'y', 1)], [100, 0]);
  c.kf.x[0][3] = { out: [0, -100] };
  c.kf.x[1][3] = { in: [0, -100] };
  const y = valueAt(c, 'y', 1);
  assert.ok(Math.abs(valueAt(c, 'x', 1) - 100) < 1, 'symmetrisk bue er midt på halvveis');
  assert.ok(Math.abs(y + 75) < 1, `toppen av buen er 3/4 av håndtaket, fikk ${y}`);
  // Endepunktene er fortsatt nøkkelbildene.
  assert.deepEqual([valueAt(c, 'x', 0), valueAt(c, 'y', 0), valueAt(c, 'x', 2), valueAt(c, 'y', 2)], [0, 0, 200, 0]);
});

test('farten langs buen følger lengden, så lineær fart er jevn', () => {
  const c = clip();
  for (const [t, x] of [[0, 0], [2, 300]]) {
    setKeyframe(c, 'x', t, x, 'linear');
    setKeyframe(c, 'y', t, 0, 'linear');
  }
  c.kf.x[0][3] = { out: [250, 0] };
  const pos = (T) => [valueAt(c, 'x', T), valueAt(c, 'y', T)];
  const steps = [0, 0.5, 1, 1.5, 2].map(pos);
  const d = steps.slice(1).map((q, i) => Math.hypot(q[0] - steps[i][0], q[1] - steps[i][1]));
  for (const x of d) assert.ok(Math.abs(x - 75) < 2, `like lange steg, fikk ${d}`);
});

test('Smooth gir håndtak langs naboene, og easing beholder dem', () => {
  const c = clip();
  for (const [t, x, y] of [[0, 0, 0], [1, 100, -100], [2, 200, 0]]) {
    setKeyframe(c, 'x', t, x, 'linear');
    setKeyframe(c, 'y', t, y, 'linear');
  }
  setPathSmooth(c, 1, true);
  assert.deepEqual(c.kf.x[1][3], { in: [-200 / 6, -0], out: [200 / 6, 0] });
  setKeyframeEase(c, 'x', 1, 'easeInOut');
  assert.equal(c.kf.x[1][2], 'easeInOut');
  assert.ok(c.kf.x[1][3]);
  setKeyframeEase(c, 'x', 1, 'linear');
  assert.ok(c.kf.x[1][3], 'Linear speed beholder banen');
  setPathSmooth(c, 1, false);
  assert.equal(c.kf.x[1].length, 3);
});

test('nøkkelbilde på X gir også Y på samme tid, så banen alltid har to punkter', () => {
  const c = clip();
  c.props.x = 10;
  c.props.y = 20;
  setEditorKeyframe(c, 'x', 0, 10);
  assert.deepEqual(c.kf.y.map((k) => k.slice(0, 2)), [[0, 20]]);
  setEditorKeyframe(c, 'x', 2, 300);
  setEditorKeyframe(c, 'y', 2, 120);
  assert.deepEqual(c.kf.y.map((k) => k.slice(0, 2)), [[0, 20], [2, 120]]);
  removeKeyframePair(c, 'y', 2);
  assert.deepEqual([c.kf.x.length, c.kf.y.length], [1, 1]);
});
