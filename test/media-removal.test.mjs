import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, addSequence, timelines } from '../src/shared/model.js';
import { addMediaClip } from '../src/shared/ops.js';
import { mediaRemovalPlan, removeProjectMedia } from '../src/shared/mediaRemoval.js';

function setup() {
  const p = newProject();
  for (const id of ['a', 'b']) p.media[id] = { id, name: id, kind: 'video', duration: 5,
    path: `/${id}.mp4`, streams: { main: { path: `/${id}.mp4`, hasVideo: true } } };
  return p;
}

test('removes all occurrences across sequences while preserving other edits and timing', () => {
  const p = setup();
  addMediaClip(p, p.media.a, 'append');
  const keep = addMediaClip(p, p.media.b, 'append');
  const keepBefore = structuredClone(p.clips[keep]);
  addSequence(p, { name: 'Other' });
  addMediaClip(p, p.media.a, 'append');
  assert.equal(mediaRemovalPlan(p, ['a']).usedOnTimeline, true);
  removeProjectMedia(p, ['a', 'a', 'missing']);
  assert.equal(p.media.a, undefined);
  assert.ok(p.media.b);
  for (const t of timelines(p)) {
    assert.ok(Object.values(t.clips).every((c) => c.mediaId !== 'a'));
    assert.ok(t.primary.every((id) => t.clips[id]));
  }
  assert.deepEqual(timelines(p)[1].clips[keep], keepBefore);
  assert.equal(p.duration, 0);
});

test('linked recording parts are removed with their source', () => {
  const p = setup();
  const parent = addMediaClip(p, p.media.a, 'append');
  const child = makeClip('video', { media: p.media.a, lane: 1, dur: 5 });
  child.linkedTo = parent;
  child.recordingPart = 'camera';
  p.clips[child.id] = child;
  removeProjectMedia(p, ['a']);
  assert.equal(p.clips[parent], undefined);
  assert.equal(p.clips[child.id], undefined);
});

test('warns about multicam dependencies and removes whole affected multicams without dangling angles', () => {
  const p = setup();
  p.multicams = { mc: { id: 'mc', name: 'Interview', angles: [{ id: 'a1', mediaId: 'a' }, { id: 'a2', mediaId: 'b' }] } };
  const clip = addMediaClip(p, p.media.b, 'append');
  p.clips[clip].multicam = { id: 'mc', angle: 'a2' };
  const other = makeClip('video', { media: p.media.b, lane: 1, dur: 5 });
  p.clips[other.id] = other;
  const plan = mediaRemovalPlan(p, ['a']);
  assert.equal(plan.usedOnTimeline, true, 'indirect timeline dependency');
  assert.deepEqual(plan.multicamNames, ['Interview']);
  removeProjectMedia(p, ['a']);
  assert.equal(p.multicams.mc, undefined);
  assert.equal(p.clips[clip], undefined);
  assert.ok(p.clips[other.id]);
  assert.ok(p.media.b);
});
