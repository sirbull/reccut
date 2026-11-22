import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip } from '../src/shared/model.js';
import { addMediaClip, connectedClipIds, moveClipLane, moveClipPast, placeFree } from '../src/shared/ops.js';

function media(id, duration, kind = 'video') {
  return { id, kind, path: `/tmp/${id}.mp4`, name: id, duration, width: 1920, height: 1080, fps: 30, streams: { main: { path: `/tmp/${id}.mp4`, hasVideo: kind !== 'audio', hasAudio: true, duration } } };
}

function free(p, type, start, dur, lane) {
  const c = makeClip(type, { start, in: 0, dur });
  placeFree(p, c, start, lane);
  return c;
}

function setup() {
  const p = newProject('t');
  for (const [id, d] of [['a', 4], ['b', 6], ['c', 5]]) {
    p.media[id] = media(id, d);
    addMediaClip(p, p.media[id], 'append');
  }
  return p;
}

test('Option venstre og høyre bytter plass med naboen i hovedsporet, og tilkoblede klipp følger med', () => {
  const p = setup();
  const [a, b, c] = p.primary;
  const title = free(p, 'title', 5, 2, 1); // på b
  assert.ok(moveClipPast(p, b, -1));
  assert.deepEqual(p.primary, [b, a, c]);
  assert.equal(p.clips[b].start, 0);
  assert.equal(p.clips[title.id].start, 1);
  assert.ok(moveClipPast(p, b, 1));
  assert.ok(moveClipPast(p, b, 1));
  assert.deepEqual(p.primary, [a, c, b]);
  assert.equal(moveClipPast(p, b, 1), false);
});

test('i et tilkoblet spor bytter klippene plass og beholder mellomrommet', () => {
  const p = setup();
  const x = free(p, 'title', 1, 2, 1);
  const y = free(p, 'title', 5, 3, 1);
  assert.ok(moveClipPast(p, x.id, 1));
  assert.deepEqual([p.clips[y.id].start, p.clips[x.id].start], [1, 6]);
  assert.ok(moveClipPast(p, x.id, -1));
  assert.deepEqual([p.clips[x.id].start, p.clips[y.id].start], [1, 5]);
  assert.equal(moveClipPast(p, x.id, -1), false);
});

test('Option opp og ned bytter spor med klippene som overlapper', () => {
  const p = setup();
  const low = free(p, 'title', 1, 4, 1);
  const high = free(p, 'title', 2, 2, 2);
  assert.ok(moveClipLane(p, low.id, true));
  assert.deepEqual([p.clips[low.id].lane, p.clips[high.id].lane], [2, 1]);
  assert.equal(moveClipLane(p, low.id, true), false);
  assert.ok(moveClipLane(p, low.id, false));
  assert.deepEqual([p.clips[low.id].lane, p.clips[high.id].lane], [1, 2]);
  assert.equal(moveClipLane(p, low.id, false), false, 'hovedsporet er ikke et spor å bytte til');
  // Lyd kan flyttes til et tomt spor under.
  const music = free(p, 'audio', 0, 3, -1);
  assert.ok(moveClipLane(p, music.id, false));
  assert.equal(p.clips[music.id].lane, -2);
  assert.ok(moveClipLane(p, music.id, true));
  assert.equal(moveClipLane(p, music.id, true), false);
});

test('Ctrl Cmd A velger klippet i hovedsporet og alt som er koblet til det', () => {
  const p = setup();
  const [a, b] = p.primary;
  const onB = free(p, 'title', 5, 2, 1);
  const music = free(p, 'audio', 6, 2, -1);
  const onA = free(p, 'title', 1, 1, 1);
  const fromTitle = connectedClipIds(p, onB.id).sort();
  assert.deepEqual(fromTitle, [b, onB.id, music.id].sort());
  assert.deepEqual(connectedClipIds(p, a).sort(), [a, onA.id].sort());
});
