import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTION_LANE, makeClip, newProject, sourceTime, updateDuration } from '../src/shared/model.js';
import { addMediaClip, rollEdit, rollPair, splitClip } from '../src/shared/ops.js';

function setup(type = 'audio', lane = -1) {
  const p = newProject('Rolling edit');
  const media = { id: 'source', kind: type, duration: 30, streams: {} };
  p.media.source = media;
  const a = makeClip(type, { media, lane, start: 10, in: 5, dur: 5, props: { text: 'First caption' } });
  const b = makeClip(type, { media, lane, start: 15, in: 10, dur: 5, props: { text: 'Second caption' } });
  const other = makeClip('image', { lane: lane === 2 ? 3 : 2, start: 15, dur: 12 });
  for (const c of [a, b, other]) p.clips[c.id] = c;
  updateDuration(p);
  return { p, a, b, other };
}

test('rolling from either edge works on every free track, keeping outer edges, source timing and other clips fixed', () => {
  for (const [type, lane] of [['video', 1], ['video', 3], ['audio', -1], ['audio', -4], ['image', 2], ['title', 4], ['redact', 5], ['adjustment', 6], ['caption', CAPTION_LANE]]) {
    for (const delta of [-2, 2]) {
      const { p, a, b, other } = setup(type, lane);
      const untouched = structuredClone(other);
      const duration = p.duration;
      const text = [a.props.text, b.props.text];
      const sourceEnd = sourceTime(b, b.start + b.dur);
      assert.deepEqual(rollPair(p, a.id, 'end'), [a.id, b.id]);
      assert.deepEqual(rollPair(p, b.id, 'start'), [a.id, b.id]);
      rollEdit(p, a.id, b.id, delta);
      assert.deepEqual([a.start, a.dur, b.start, b.dur], [10, 5 + delta, 15 + delta, 5 - delta], `${type}, lane ${lane}`);
      assert.equal(a.start + a.dur, b.start);
      assert.equal(b.start + b.dur, 20);
      assert.equal(sourceTime(b, b.start + b.dur), sourceEnd);
      assert.equal(p.duration, duration);
      assert.deepEqual(other, untouched);
      assert.deepEqual([a.props.text, b.props.text], text);
    }
  }
});

test('rolling free clips never relayouts the main storyline or moves grouped captions on another track', () => {
  const { p, a, b, other } = setup();
  const video = makeClip('image', { lane: 0, start: 0, dur: 30, group: 'group' });
  const caption = makeClip('caption', { lane: CAPTION_LANE, start: 16, dur: 2, group: 'group' });
  p.clips[video.id] = video;
  p.clips[caption.id] = caption;
  p.primary = [video.id];
  a.group = b.group = 'voice-over';
  const before = structuredClone([video, caption, other]);
  rollEdit(p, a.id, b.id, -2);
  assert.deepEqual([video, caption, other], before);
  assert.deepEqual([a.start, a.dur, b.start, b.dur], [10, 3, 13, 7]);
});

test('source handles and minimum duration limit both sides together, including speed and reverse playback', () => {
  for (const reverse of [false, true]) {
    const { p, a, b } = setup('video', 1);
    a.speed = b.speed = 2;
    a.reverse = b.reverse = reverse;
    a.in = 2;
    b.in = 1;
    const leftSource = sourceTime(a, a.start);
    const rightSource = sourceTime(b, b.start + b.dur);
    rollEdit(p, a.id, b.id, reverse ? 100 : -100);
    const delta = reverse ? 1 : -0.5;
    assert.deepEqual([a.dur, b.start, b.dur], [5 + delta, 15 + delta, 5 - delta]);
    assert.equal(sourceTime(a, a.start), leftSource);
    assert.equal(sourceTime(b, b.start + b.dur), rightSource);
  }
  for (const delta of [-100, 100]) {
    const { p, a, b } = setup('caption', CAPTION_LANE);
    rollEdit(p, a.id, b.id, delta);
    assert.ok(a.dur >= 1 / 30 - 1e-6);
    assert.ok(b.dur >= 1 / 30 - 1e-6);
    assert.equal(a.start + a.dur, b.start);
    assert.equal(b.start + b.dur, 20);
  }
});

test('a gap, overlap, different lane, ambiguous neighbour or locked lane cannot roll', () => {
  for (const change of [
    ({ b }) => { b.start += 0.1; },
    ({ b }) => { b.start -= 0.1; },
    ({ b }) => { b.lane--; },
    ({ p, b }) => { const c = { ...structuredClone(b), id: 'duplicate' }; p.clips[c.id] = c; },
    ({ p, a }) => { p.lanes[a.lane] = { locked: true }; },
  ]) {
    const state = setup();
    change(state);
    const before = structuredClone(state.p);
    rollEdit(state.p, state.a.id, state.b.id, 2);
    assert.deepEqual(state.p, before);
  }
  const { p, a, b } = setup('caption', CAPTION_LANE);
  assert.equal(rollPair(p, a.id, 'start'), null);
  assert.equal(rollPair(p, b.id, 'end'), null);
  for (const delta of [NaN, Infinity]) rollEdit(p, a.id, b.id, delta);
  assert.equal(a.dur, 5);
});

test('rolling at a PiP cut edits its parent pair and keeps all linked layers synchronized', () => {
  const p = newProject('Linked recording');
  const stream = { hasVideo: true, duration: 30 };
  const media = { id: 'recording', kind: 'recording', duration: 30, streams: { screen: stream, camera: stream }, rec: { layouts: [[0, 6]] } };
  p.media[media.id] = media;
  const aId = addMediaClip(p, media, 'append', 0, 0, { in: 2, dur: 12 });
  const bId = splitClip(p, aId, 6);
  const camera = id => Object.values(p.clips).find(c => c.linkedTo === id && c.recordingPart === 'camera');
  const aCam = camera(aId), bCam = camera(bId);
  assert.deepEqual(rollPair(p, aCam.id, 'end'), [aCam.id, bCam.id]);
  rollEdit(p, aCam.id, bCam.id, 2);
  for (const [id, child] of [[aId, aCam], [bId, bCam]]) {
    const parent = p.clips[id];
    assert.deepEqual([child.start, child.in, child.dur], [parent.start, parent.in, parent.dur]);
  }
  assert.deepEqual([p.clips[aId].dur, p.clips[bId].start, p.clips[bId].dur], [8, 8, 4]);
  p.lanes[aCam.lane] = { locked: true };
  const before = structuredClone(p);
  rollEdit(p, aId, bId, -1);
  assert.deepEqual(p, before);
});
