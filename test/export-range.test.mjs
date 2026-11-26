import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_LANE, clampRange, exportRangeProblem, rangeHasContent } from '../src/shared/model.js';

const project = (clips, duration = 92) => ({ duration, clips: Object.fromEntries(clips.map((c, i) => [String(i), { lane: 0, type: 'video', ...c }])) });

test('an export range past the end of the timeline becomes empty', () => {
  assert.deepEqual(clampRange({ in: 169, out: 256.625 }, 92), { in: 92, out: 92 });
  assert.deepEqual(clampRange({ in: 10, out: 20 }, 92), { in: 10, out: 20 });
  assert.equal(clampRange(null, 92), null);
});

test('export says so when In/Out holds no video or sound', () => {
  const p = project([{ start: 0, dur: 30 }, { start: 50, dur: 42, type: 'gap' }, { start: 40, dur: 20, lane: CAPTION_LANE, type: 'caption' }]);
  assert.equal(exportRangeProblem(p, { in: 5, out: 10 }), null);
  assert.equal(exportRangeProblem(p, null), null);
  assert.match(exportRangeProblem(p, { in: 40, out: 60 }), /no video or sound between In and Out/);
  assert.match(exportRangeProblem(p, { in: 169, out: 256.625 }), /no video or sound between In and Out/);
  assert.equal(rangeHasContent(p, 29, 31), true);
  assert.equal(rangeHasContent(p, 30, 40), false);
  assert.match(exportRangeProblem(project([], 0), null), /timeline is empty/);
});
