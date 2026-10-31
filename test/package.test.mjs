import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, sourceTime, valueAt } from '../src/shared/model.js';
import { usedRanges, trimProject, mediaFiles } from '../src/shared/package.js';
const medium = (id = 'a', kind = 'video') => ({
  id,
  name: `${id}.mp4`,
  path: `/media/${id}.mp4`,
  kind,
  duration: 100,
  streams: { main: { path: `/media/${id}.mp4`, duration: 100, hasVideo: kind !== 'audio', hasAudio: true } },
});
const clip = (id, mediaId, sourceIn, start = 0, dur = 5) => ({
  id,
  mediaId,
  type: 'video',
  in: sourceIn,
  start,
  dur,
  lane: 1,
  props: {},
  kf: {},
});
function setup() {
  const p = newProject('Package');
  p.media.a = medium();
  p.clips.c = clip('c', 'a', 20);
  return p;
}
test('trim packaging is optional and leaves the original untouched', () => {
  const p = setup(),
    before = structuredClone(p),
    r = trimProject(p, { handles: 2 });
  assert.deepEqual(p, before);
  assert.equal(r.trimmed.length, 1);
  assert.deepEqual(r.project.media.a_p1.streams.main.trim, { source: '/media/a.mp4', from: 18, to: 27, total: 100 });
  assert.equal(r.project.clips.c.in, 2);
  assert.equal(r.project.media.a_p1.duration, 9);
  assert.equal(mediaFiles(p)[0].sources[0].trim, undefined);
  assert.ok(mediaFiles(r.project)[0].sources[0].trim);
});
test('two remote used ranges get independent files and clip keyframes retain their timing', () => {
  const p = setup();
  p.clips.d = clip('d', 'a', 70, 10);
  p.clips.c.kf.opacity = [
    [20, 0],
    [25, 1],
  ];
  const r = trimProject(p, { handles: 1 });
  assert.equal(r.trimmed[0].parts, 2);
  for (const id of ['c', 'd']) {
    const c = p.clips[id],
      n = r.project.clips[id],
      offset = r.project.media[n.mediaId].trimmedFrom.start;
    for (const t of [c.start, c.start + 2, c.start + c.dur])
      assert.ok(Math.abs(sourceTime(c, t) - sourceTime(n, t) - offset) < 1e-6);
  }
  assert.equal(valueAt(p.clips.c, 'opacity', 2), valueAt(r.project.clips.c, 'opacity', 2));
});
test('speed ramps, reverse and freeze frames retain source and keyframe timing', () => {
  for (const props of [
    { speed: 2 },
    { reverse: true },
    { speed: 0, freezeAt: 60 },
    {
      ramp: [
        [0, 0.5],
        [1, 2],
      ],
    },
  ]) {
    const p = setup();
    Object.assign(p.clips.c, props);
    p.clips.c.kf.opacity = [
      [20, 0.2],
      [25, 0.8],
    ];
    const r = trimProject(p, { handles: 1 }),
      c = r.project.clips.c,
      offset = r.project.media[c.mediaId].trimmedFrom.start;
    for (const t of [0, 1, 2.5, 5]) {
      assert.ok(Math.abs(sourceTime(p.clips.c, t) - sourceTime(c, t) - offset) < 1e-6);
      assert.ok(Math.abs(valueAt(p.clips.c, 'opacity', t) - valueAt(c, 'opacity', t)) < 1e-6);
    }
  }
});
test('zero archive handles still keep the extra frames needed by a transition', () => {
  const p = setup();
  p.clips.c.lane = 0;
  p.clips.d = clip('d', 'a', 60, 5);
  p.clips.d.lane = 0;
  p.clips.d.transition = { type: 'dissolve', dur: 2 };
  p.primary = ['c', 'd'];
  assert.deepEqual(usedRanges(p, 0).a, [
    [20, 26],
    [59, 65],
  ]);
});
test('recordings, images, unused media and small savings are copied whole', () => {
  for (const kind of ['recording', 'image']) {
    const p = setup();
    p.media.a.kind = kind;
    assert.equal(trimProject(p).trimmed.length, 0);
  }
  const p = setup();
  p.clips.c.in = 0;
  p.clips.c.dur = 90;
  p.media.unused = medium('unused');
  assert.equal(trimProject(p).trimmed.length, 0);
});
test('synced audio preserves its source offset and clips without intersecting audio lose that stream', () => {
  const p = setup();
  p.media.a.streams.sync = { path: '/audio.wav', offset: 22, duration: 10, hasAudio: true };
  const r = trimProject(p, { handles: 0 }),
    s = r.project.media.a_p1.streams.sync;
  assert.equal(s.offset, 2);
  assert.equal(s.trim.from, 0);
  assert.equal(s.trim.to, 3);
  p.media.a.streams.sync.offset = 90;
  assert.equal(trimProject(p, { handles: 0 }).project.media.a_p1.streams.sync, undefined);
});
test('part IDs do not overwrite existing media and recording bundles include external synced audio', () => {
  const p = setup();
  p.media.a_p1 = medium('a_p1');
  const r = trimProject(p);
  assert.equal(r.project.media.a_p1.name, 'a_p1.mp4');
  assert.equal(r.project.clips.c.mediaId, 'a_p1_');
  p.media.a.kind = 'recording';
  p.media.a.path = '/rec';
  p.media.a.streams.main.path = '/rec/screen.webm';
  p.media.a.streams.sync = { path: '/rec-other/audio.wav' };
  const f = mediaFiles(p).find((f) => f.mediaId === 'a');
  assert.equal(f.dir, '/rec');
  assert.deepEqual(
    f.sources.map((s) => s.path),
    ['/rec-other/audio.wav'],
  );
});
