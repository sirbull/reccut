import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, computeAudio, CAPTION_LANE } from '../src/shared/model.js';
import { addMediaClip } from '../src/shared/ops.js';
import { applyMediaDrop, mediaDropPreview } from '../src/shared/libraryDrop.js';

function setup(kind = 'video') {
  const p = newProject('Media drop');
  p.media.source = {
    id: 'source', kind, name: 'Source', duration: 23,
    streams: kind === 'recording'
      ? { screen: { path: '/screen.mp4', hasVideo: true, hasAudio: true }, camera: { path: '/mic.wav', hasAudio: true }, synced: { path: '/synced.wav', hasAudio: true } }
      : { main: { path: '/video.mp4', hasVideo: kind !== 'audio', hasAudio: true } },
  };
  return p;
}

function compareDrop(p, item, lane, T) {
  const before = JSON.stringify(p);
  const preview = mediaDropPreview(p, item, lane, T);
  assert.equal(JSON.stringify(p), before, 'hover does not change the project');
  const ids = applyMediaDrop(p, item, lane, T);
  assert.deepEqual(preview, ids.map((id) => {
    const c = p.clips[id];
    return { a: c.start, b: c.start + c.dur, lane: c.lane, label: c.name };
  }));
  return ids.map((id) => p.clips[id]);
}

test('in/out range previews and inserts at the same length, including one frame', () => {
  for (const dur of [6.25, 1 / 30]) {
    const p = setup();
    const [clip] = compareDrop(p, { kind: 'media', clips: [{ id: 'source', opts: { in: 3, dur } }] }, 0, 0);
    assert.equal(clip.in, 3);
    assert.equal(clip.dur, dur);
  }
});

test('preview follows magnetic insertion beyond the end and close to cuts', () => {
  for (const T of [0.01, 5, 22.99, 100]) {
    const p = setup();
    addMediaClip(p, p.media.source, 'append');
    compareDrop(p, { clips: [{ id: 'source', opts: { in: 2, dur: 4 } }] }, 0, T);
  }
});

test('connected clips preview the free lane and audio uses an audio lane', () => {
  const p = setup();
  addMediaClip(p, p.media.source, 'connect', 0, 1);
  const [clip] = compareDrop(p, { id: 'source' }, 1, 2);
  assert.equal(clip.lane, 2);
  const a = setup('audio');
  const [audio] = compareDrop(a, { id: 'source' }, 0, 3);
  assert.equal(audio.lane, -1);
  const v = setup();
  assert.equal(compareDrop(v, { id: 'source' }, CAPTION_LANE, 0)[0].lane, 1);
});

test('audio choice silences all recording components, persists, and only affects new clips', () => {
  const p = setup('recording');
  const first = addMediaClip(p, p.media.source, 'append');
  assert.ok(computeAudio(p, 1).length > 0);
  p.media.source.includeAudio = false;
  const loaded = JSON.parse(JSON.stringify(p));
  const [silent] = compareDrop(loaded, { clips: [{ id: 'source', opts: { in: 2, dur: 4, includeAudio: false } }] }, 0, 23);
  assert.deepEqual(silent.props.audioOff, { screen: true, camera: true, synced: true });
  assert.equal(computeAudio(loaded, silent.start + 1).length, 0);
  assert.ok(computeAudio(loaded, 1).length > 0);
  assert.equal(loaded.clips[first].props.audioOff, undefined);
  loaded.media.source.includeAudio = true;
  const next = addMediaClip(loaded, loaded.media.source, 'append');
  assert.ok(computeAudio(loaded, loaded.clips[next].start + 1).length > 0);
});

test('multi-selection keeps per-clip duration and audio choices in the drag snapshot', () => {
  const p = setup();
  p.media.still = { id: 'still', kind: 'image', name: 'Still', path: '/still.png', streams: {} };
  const clips = compareDrop(p, { clips: [{ id: 'source', opts: { includeAudio: false } }, { id: 'still', opts: { dur: 7 } }] }, 0, 0);
  assert.deepEqual(clips.map((c) => [c.start, c.dur]), [[0, 23], [23, 7]]);
  assert.equal(computeAudio(p, 1).length, 0);
});

test('locked destination rejects both preview and insertion', () => {
  const p = setup();
  p.lanes = { 0: { locked: true } };
  assert.deepEqual(compareDrop(p, { id: 'source' }, 0, 0), []);
});
