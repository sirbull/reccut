import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_LANE, computeFrame, makeClip, newProject } from '../src/shared/model.js';
import { addMediaClip, deleteClips, groupClips, moveClip, placeFree, trimClip } from '../src/shared/ops.js';

function setup() {
  const p = newProject('Independent captions');
  const media = { id: 'video', kind: 'video', duration: 30, streams: {} };
  p.media.video = media;
  const a = addMediaClip(p, media, 'append', 0, 0, { dur: 10 });
  const b = addMediaClip(p, media, 'append', 0, 0, { dur: 10 });
  const caption = makeClip('caption', { start: 12, dur: 3, lane: CAPTION_LANE, props: { text: 'What I hear' } });
  placeFree(p, caption, 12, CAPTION_LANE);
  return { p, a, b, caption };
}

test('caption timing survives insert, ripple delete, trim and reorder of video', () => {
  for (const edit of [
    ({ p }) => addMediaClip(p, p.media.video, 'insert', 5, 0, { dur: 2 }),
    ({ p, a }) => deleteClips(p, [a]),
    ({ p, a }) => trimClip(p, a, 'end', -3),
    ({ p, b }) => trimClip(p, b, 'start', 3),
    ({ p, b }) => moveClip(p, b, { lane: 0, primaryIndex: 0 }),
  ]) {
    const state = setup();
    edit(state);
    assert.equal(state.p.clips[state.caption.id].start, 12);
    assert.equal(state.p.clips[state.caption.id].dur, 3);
    assert.equal(state.p.clips[state.caption.id].props.text, 'What I hear');
  }
});

test('explicit grouping still lets a caption follow its video', () => {
  const { p, a, b, caption } = setup();
  groupClips(p, [b, caption.id]);
  deleteClips(p, [a]);
  assert.equal(p.clips[caption.id].start, 2);
  deleteClips(p, [b]);
  assert.equal(p.clips[caption.id], undefined);
});

test('captions can be moved and rendered on an otherwise empty timeline', () => {
  const p = newProject('Text only');
  const caption = makeClip('caption', { start: 0, dur: 3, lane: CAPTION_LANE, props: { text: 'Typed by hand', pos: { x: 25, y: 30 } } });
  placeFree(p, caption, 0, CAPTION_LANE);
  moveClip(p, caption.id, { start: 8, lane: CAPTION_LANE });
  assert.equal(p.duration, 11);
  assert.equal(computeFrame(p, 0).captions.length, 0);
  assert.equal(computeFrame(p, 9).captions[0].props.text, 'Typed by hand');
  assert.deepEqual(p.clips[caption.id].props.pos, { x: 25, y: 30 });
  assert.deepEqual(p.primary, []);
});
