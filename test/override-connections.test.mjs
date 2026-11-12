import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, newProject, updateDuration } from '../src/shared/model.js';
import { moveClip, withConnectionsOverridden } from '../src/shared/ops.js';

function setup() {
  const p = newProject('Override connections');
  const first = makeClip('image', { lane: 0, dur: 5 });
  const second = makeClip('image', { lane: 0, dur: 5 });
  const title = makeClip('title', { lane: 1, start: 6, dur: 2 });
  const grouped = makeClip('image', { lane: 2, start: 7, dur: 1, group: 'g' });
  second.group = 'g';
  for (const c of [first, second, title, grouped]) p.clips[c.id] = c;
  p.primary = [first.id, second.id];
  first.start = 0;
  second.start = 5;
  updateDuration(p);
  return { p, first, second, title, grouped };
}

test('connected and grouped clips follow a storyline clip that moves', () => {
  const { p, second, title, grouped } = setup();
  moveClip(p, second.id, { lane: 0, primaryIndex: 0 });
  assert.equal(second.start, 0);
  assert.deepEqual([title.start, grouped.start], [1, 2]);
});

test('Override Connections leaves connected and grouped clips where they were, and only while held', () => {
  const { p, second, title, grouped } = setup();
  withConnectionsOverridden(true, () => moveClip(p, second.id, { lane: 0, primaryIndex: 0 }));
  assert.equal(second.start, 0);
  assert.deepEqual([title.start, grouped.start], [6, 7]);
  // Sluppet tast: koblingene virker igjen.
  const again = setup();
  moveClip(again.p, again.second.id, { lane: 0, primaryIndex: 0 });
  assert.deepEqual([again.title.start, again.grouped.start], [1, 2]);
});
