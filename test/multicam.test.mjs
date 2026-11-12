import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, newProject } from '../src/shared/model.js';
import {
  addAngles,
  angleAt,
  applyMulticamSync,
  bladeAt,
  buildMulticamClips,
  cutAndSwitch,
  moveCut,
  multicamClips,
  multicamFromClips,
  multicamMedia,
  newMulticam,
  pictureAngleAt,
  placeMulticam,
  planMulticamSync,
  programPieces,
  removeCut,
  segments,
  switchSegment,
  tidy,
} from '../src/shared/multicam.js';

function video(id, duration, extra = {}) {
  return { id, kind: 'video', name: `${id}.mp4`, path: `/m/${id}.mp4`, duration, streams: { main: { path: `/m/${id}.mp4`, hasVideo: true, hasAudio: true, wave: `/w/${id}` } }, ...extra };
}

function setup() {
  const p = newProject('Multicam');
  p.media.a = video('a', 20);
  p.media.b = video('b', 20);
  p.media.c = video('c', 20);
  p.media.still = { id: 'still', kind: 'image', name: 'still.png', streams: { main: { hasVideo: true } } };
  return p;
}

function mcWith(p, ids = ['a', 'b', 'c']) {
  const mc = newMulticam('Multicam 1');
  addAngles(p, mc, ids);
  return mc;
}

test('angles are numbered in the order they are added and stills are refused', () => {
  const p = setup();
  const mc = newMulticam();
  const { added, errors } = addAngles(p, mc, ['a', 'still', 'b', 'a']);
  assert.equal(added.length, 2);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /still image/);
  assert.match(errors[1], /already an angle/);
  assert.deepEqual(mc.angles.map((x) => x.mediaId), ['a', 'b']);
  assert.equal(mc.cuts.length, 1);
  assert.equal(mc.cuts[0].angle, mc.angles[0].id);
  assert.equal(mc.audio, mc.angles[0].id);
});

test('number keys cut and switch, and the same angle twice does nothing', () => {
  const p = setup();
  const mc = mcWith(p);
  const [A, B, C] = mc.angles.map((x) => x.id);
  assert.equal(cutAndSwitch(p, mc, 4, B), true);
  assert.equal(cutAndSwitch(p, mc, 4.5, B), false);
  assert.equal(cutAndSwitch(p, mc, 9, C), true);
  assert.deepEqual(mc.cuts.map((c) => [c.t, c.angle]), [[0, A], [4, B], [9, C]]);
  assert.equal(angleAt(mc, 5), B);
  // Switch without cutting changes the angle of the piece under the playhead.
  switchSegment(p, mc, 5, A);
  assert.deepEqual(mc.cuts.map((c) => [c.t, c.angle]), [[0, A], [9, C]]);
});

test('trimming moves a cut but never past its neighbours, and cuts can be removed', () => {
  const p = setup();
  const mc = mcWith(p);
  const [, B, C] = mc.angles.map((x) => x.id);
  cutAndSwitch(p, mc, 4, B);
  cutAndSwitch(p, mc, 9, C);
  moveCut(mc, 1, 12, { frame: 1 / 30 });
  assert.ok(mc.cuts[1].t < 9);
  moveCut(mc, 1, 3, { frame: 1 / 30 });
  assert.equal(mc.cuts[1].t, 3);
  assert.equal(removeCut(p, mc, 1), true);
  assert.equal(mc.cuts.length, 2);
  assert.equal(removeCut(p, mc, 0), false);
});

test('the blade splits a piece with the same angle on both sides', () => {
  const p = setup();
  const mc = mcWith(p);
  assert.equal(bladeAt(mc, 6), 1);
  tidy(p, mc);
  assert.equal(mc.cuts.length, 2);
  assert.equal(mc.cuts[0].angle, mc.cuts[1].angle);
  assert.equal(segments(p, mc).length, 2);
});

test('the result has one clip per piece, another angle where the chosen one has no picture, and audio from one angle', () => {
  const p = setup();
  const mc = mcWith(p);
  const [A, B] = mc.angles.map((x) => x.id);
  mc.angles[1].offset = 6;
  cutAndSwitch(p, mc, 2, B);
  cutAndSwitch(p, mc, 10, A);
  // Angle 2 starts at 6 s, so angle 1 is shown from 2 to 6 s and joins the first clip.
  assert.deepEqual(programPieces(p, mc).map((x) => [x.start, x.end, x.fallback]), [[0, 2, false], [2, 6, true], [6, 10, false], [10, 20, false], [20, 26, true]]);
  assert.equal(pictureAngleAt(p, mc, 3), A);
  const { video: v, audio } = buildMulticamClips(p, mc);
  assert.deepEqual(v.map((c) => [c.type, c.start, c.dur, c.mediaId]), [['video', 0, 6, 'a'], ['video', 6, 4, 'b'], ['video', 10, 10, 'a'], ['video', 20, 6, 'b']]);
  assert.equal(v[1].in, 0);
  assert.equal(v[2].in, 10);
  assert.ok(v.filter((c) => c.type === 'video').every((c) => c.props.audioOff.main));
  assert.equal(audio.length, 1);
  assert.equal(audio[0].mediaId, 'a');
  assert.equal(audio[0].dur, 20);
  assert.equal(audio[0].start, 0);
  mc.audio = 'follow';
  const follow = buildMulticamClips(p, mc);
  assert.equal(follow.audio.length, 0);
  assert.ok(!follow.video[0].props.audioOff?.main);
});

test('a gap is left only where no angle has a picture', () => {
  const p = setup();
  const mc = mcWith(p, ['a', 'b']);
  mc.angles[1].offset = 25;
  cutAndSwitch(p, mc, 20, mc.angles[1].id);
  const { video: v } = buildMulticamClips(p, mc);
  assert.deepEqual(v.map((c) => [c.type, c.start, c.dur]), [['video', 0, 20], ['gap', 20, 5], ['video', 25, 20]]);
});

test('a multicam made from stacked clips keeps their positions and what was visible', () => {
  const p = setup();
  const a = makeClip('video', { media: p.media.a, start: 0, in: 0, dur: 20, lane: 0 });
  const b = makeClip('video', { media: p.media.b, start: 5, in: 2, dur: 5, lane: 1 });
  for (const c of [a, b]) p.clips[c.id] = c;
  p.primary = [a.id];
  const mc = multicamFromClips(p, [a.id, b.id]);
  assert.deepEqual(mc.angles.map((x) => [x.mediaId, x.offset]), [['a', 0], ['b', 3]]);
  assert.deepEqual(mc.cuts.map((c) => [c.t, p.media[mc.angles.find((x) => x.id === c.angle).mediaId].id]), [[0, 'a'], [5, 'b'], [10, 'a']]);
  assert.deepEqual(mc.range, { in: 0, out: 20 });

  const placed = placeMulticam(p, mc, { replace: [a.id, b.id] });
  assert.ok(!p.clips[a.id] && !p.clips[b.id]);
  assert.equal(p.primary.length, 3);
  const group = p.clips[placed[0]].group;
  assert.ok(group);
  assert.ok(placed.every((id) => p.clips[id].group === group && p.clips[id].multicam.id === mc.id));
  assert.ok(placed.some((id) => p.clips[id].type === 'audio' && p.clips[id].lane < 0));
  assert.ok(p.multicams[mc.id]);
  assert.ok(multicamMedia(p).has('b'));

  // Editing again replaces the clips in the same place and keeps effects on an angle.
  p.clips[p.primary[0]].props.saturation = 0.5;
  const again = structuredClone(p.multicams[mc.id]);
  cutAndSwitch(p, again, 15, again.angles[1].id);
  placeMulticam(p, again, { replace: multicamClips(p, mc.id) });
  assert.equal(p.primary.length, 4);
  assert.equal(p.clips[p.primary[0]].props.saturation, 0.5);
  assert.equal(Object.values(p.clips).filter((c) => c.multicam?.id === mc.id && c.type === 'audio').length, 1);
});

test('a new multicam without anything to replace is appended to the storyline', () => {
  const p = setup();
  const first = makeClip('video', { media: p.media.c, start: 0, dur: 4, lane: 0 });
  p.clips[first.id] = first;
  p.primary = [first.id];
  const mc = mcWith(p, ['a', 'b']);
  placeMulticam(p, mc);
  assert.equal(p.primary[0], first.id);
  assert.equal(p.clips[p.primary[1]].start, 4);
});

test('auto sync finds the offset between angles and explains the ones it could not match', () => {
  const p = setup();
  p.media.silent = { ...video('silent', 20), streams: { main: { hasVideo: true, hasAudio: false } } };
  p.media.noise = video('noise', 20);
  // A shared sound pattern, with angle b starting 3 seconds later than a.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const base = Array.from({ length: 2600 }, () => (rnd() > 0.93 ? 0.5 + rnd() : 0.02 * rnd()));
  const waves = {
    '/w/a': { peaks: base.slice(0, 2000) },
    '/w/b': { peaks: base.slice(300, 2300) },
    '/w/noise': { peaks: Array.from({ length: 2000 }, () => 0.1 + 0.01 * rnd()) },
  };
  const mc = mcWith(p, ['a', 'b', 'silent', 'noise']);
  const plan = planMulticamSync(p, mc, (path) => waves[path] || null);
  assert.ok(Math.abs(plan.offsets[mc.angles[1].id] - 3) < 0.02, `offset ${plan.offsets[mc.angles[1].id]}`);
  assert.deepEqual(plan.failures.map((f) => f.number), [3, 4]);
  assert.match(plan.failures[0].reason, /angle 3 \(silent\.mp4\).*no audio/);
  assert.match(plan.failures[1].reason, /angle 4 \(noise\.mp4\).*no matching sound/);
  applyMulticamSync(p, mc, plan.offsets);
  assert.equal(Math.min(...mc.angles.map((x) => x.offset)), 0);
  assert.equal(mc.angles[0].offset, 0);
  assert.ok(Math.abs(mc.angles[1].offset - 3) < 0.02);
});
