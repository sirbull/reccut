import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, newProject, valueAt } from '../src/shared/model.js';
import { deleteClips, editGroupContents, groupClips, moveClip, trimClip } from '../src/shared/ops.js';
import { setGroupOpacity, setGroupPosition } from '../src/shared/groupSettings.js';

function setup() {
  const p = newProject('Grouped clips');
  const video = makeClip('video', { dur: 10, lane: 0, props: { x: 40, y: 20 } });
  const redact = makeClip('redact', { start: 2, dur: 5, lane: 1, props: { x: 200, y: -80 } });
  const outside = makeClip('image', { start: 0, dur: 10, lane: 2, props: { x: 10, opacity: 0.8 } });
  for (const c of [video, redact, outside]) p.clips[c.id] = c;
  p.primary = [video.id];
  const ids = [video.id, redact.id];
  const group = groupClips(p, ids);
  return { p, video, redact, outside, ids, group };
}

test('group positioning preserves the offsets between a video and redaction and their animation', () => {
  const { p, video, redact, outside, ids } = setup();
  video.kf.x = [[0, 40, 'linear'], [10, 140]];
  redact.kf.x = [[0, 200, 'linear'], [5, 250]];
  const before = structuredClone(outside);
  const at = valueAt(video, 'x', 3);
  setGroupPosition(p, ids, 'x', at + 60, 3);
  assert.equal(valueAt(video, 'x', 3), at + 60);
  assert.equal(redact.props.x, 260);
  assert.deepEqual(video.kf.x, [[0, 100, 'linear'], [10, 200]]);
  assert.deepEqual(redact.kf.x, [[0, 260, 'linear'], [5, 310]]);
  setGroupPosition(p, ids, 'y', 50, 3);
  assert.equal(video.props.y, 50);
  assert.equal(redact.props.y, -50);
  assert.deepEqual(outside, before);
});

test('shared opacity works across video, redaction and adjustment clips, leaving audio and outside clips alone', () => {
  const { p, video, redact, outside, ids } = setup();
  const audio = makeClip('audio');
  const adjustment = makeClip('adjustment');
  p.clips[audio.id] = audio;
  p.clips[adjustment.id] = adjustment;
  redact.kf.opacity = [[0, 0.2, 'linear'], [5, 0.8]];
  setGroupOpacity(p, [...ids, audio.id, adjustment.id], 0.5, 4.5);
  assert.equal(video.props.opacity, 0.5);
  assert.equal(adjustment.props.opacity, 0.5);
  assert.equal(valueAt(redact, 'opacity', 4.5), 0.5);
  assert.equal(audio.props.opacity, undefined);
  assert.equal(outside.props.opacity, 0.8);
  assert.ok(redact.kf.opacity.every((k) => k[1] >= 0 && k[1] <= 1));
});

test('editing a member independently preserves grouping and the timing of the other members', () => {
  const { p, video, redact, group } = setup();
  editGroupContents(p, group, [video.id], (q) => trimClip(q, video.id, 'start', 1));
  assert.equal(video.dur, 9);
  assert.equal(redact.start, 2);
  assert.equal(video.group, group);
  assert.equal(redact.group, group);
  editGroupContents(p, group, [redact.id], (q) => moveClip(q, redact.id, { start: 4, lane: 1 }));
  assert.equal(redact.start, 4);
  assert.equal(video.start, 0);
  assert.equal(redact.group, group);
});

test('deleting a storyline member inside a group keeps the other member; normal group deletion still removes it', () => {
  const { p, video, redact, group } = setup();
  editGroupContents(p, group, [video.id], (q) => deleteClips(q, [video.id]));
  assert.equal(p.clips[video.id], undefined);
  assert.equal(p.clips[redact.id].start, 2);
  assert.equal(p.clips[redact.id].group, undefined);
  const normal = setup();
  deleteClips(normal.p, [normal.video.id]);
  assert.equal(normal.p.clips[normal.redact.id], undefined);
});
