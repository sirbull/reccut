import test from 'node:test';
import assert from 'node:assert/strict';
import { produce } from 'immer';
import { addSequence, currentSequence, deleteSequence, newProject, openSequence, renameSequence, sequenceList } from '../src/shared/model.js';
import { reduceProject, trimProject } from '../src/shared/package.js';

const medium = (id) => ({ id, name: `${id}.mp4`, path: `/m/${id}.mp4`, kind: 'video', duration: 100, streams: { main: { path: `/m/${id}.mp4`, duration: 100, hasVideo: true, hasAudio: true } } });
const clip = (id, mediaId, sourceIn) => ({ id, mediaId, type: 'video', in: sourceIn, start: 0, dur: 5, lane: 1, enabled: true, props: {}, kf: {} });

test('sequences: new, open, duplicate, rename and delete keep each timeline', () => {
  let p = newProject('t');
  p.media.a = medium('a');
  p.clips.c1 = clip('c1', 'a', 0);
  p.duration = 5;
  const firstId = currentSequence(p).id;

  let second;
  p = produce(p, (d) => void (second = addSequence(d)));
  assert.equal(currentSequence(p).id, second);
  assert.deepEqual(p.clips, {});
  assert.equal(p.sequences[firstId].clips.c1.mediaId, 'a');
  assert.deepEqual(sequenceList(p).map((s) => s.name), ['Sequence 1', 'Sequence 2']);

  p = produce(p, (d) => void openSequence(d, firstId));
  assert.equal(p.clips.c1.in, 0);
  assert.equal(p.duration, 5);

  let copy;
  p = produce(p, (d) => void (copy = addSequence(d, { from: firstId })));
  assert.equal(currentSequence(p).name, 'Sequence 1 copy');
  p = produce(p, (d) => void (d.clips.c1.in = 9));
  assert.equal(p.sequences[firstId].clips.c1.in, 0, 'the duplicate is independent');

  p = produce(p, (d) => renameSequence(d, firstId, 'Main'));
  assert.equal(p.sequences[firstId].name, 'Main');

  p = produce(p, (d) => void deleteSequence(d, copy));
  assert.notEqual(currentSequence(p).id, copy);
  assert.equal(sequenceList(p).length, 2);
});

test('packaging keeps media and ranges used by closed sequences', () => {
  let p = newProject('t');
  p.media.a = medium('a');
  p.media.b = medium('b');
  p.clips.c1 = clip('c1', 'a', 0);
  p = produce(p, (d) => void addSequence(d));
  p = produce(p, (d) => void (d.clips.c2 = clip('c2', 'b', 50)));

  const { project } = reduceProject(p, { removeUnused: true });
  assert.ok(project.media.a, 'media only used in the closed sequence stays');

  const { project: trimmed } = trimProject(p, { handles: 0 });
  const closed = Object.values(trimmed.sequences)[0];
  assert.equal(trimmed.media[closed.clips.c1.mediaId].trimmedFrom.path, '/m/a.mp4');
  assert.equal(closed.clips.c1.in, 0);
});
