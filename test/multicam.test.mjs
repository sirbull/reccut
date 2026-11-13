import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, newProject } from '../src/shared/model.js';
import { deleteClips, rollEdit, splitClip, trimClip } from '../src/shared/ops.js';
import {
  absorbTimeline,
  addAngles,
  switchClipAngle,
  angleLabel,
  angleSound,
  soundEffects,
  soundLevelAt,
  angleAt,
  applyMulticamSync,
  bladeAt,
  buildMulticamClips,
  cutAndSwitch,
  extendProgram,
  moveAngle,
  moveCut,
  multicamClips,
  multicamFromClips,
  multicamMedia,
  multicamTimeOfClip,
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
  // Existing saved multicams retain their full timeline and legacy cut semantics.
  delete mc.programMode;
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
  assert.match(errors[1], /already added/);
  assert.deepEqual(mc.angles.map((x) => x.mediaId), ['a', 'b']);
  assert.equal(mc.cuts.length, 0);
  assert.equal(pictureAngleAt(p, mc, 0), null);
  assert.equal(mc.audio, mc.angles[0].id);
});

test('new multicams remain empty until a camera is chosen, including after sync and saving', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  applyMulticamSync(p, mc, { [mc.angles[1].id]: 2 });
  const restored = tidy(p, JSON.parse(JSON.stringify(mc)));
  assert.deepEqual(restored.cuts, []);
  assert.deepEqual(programPieces(p, restored), []);
  assert.equal(pictureAngleAt(p, restored, 0), null);
  assert.equal(pictureAngleAt(p, restored, 12), null);
  assert.equal(extendProgram(p, restored, 0, 10), false, 'playback without a choice leaves Program empty');
  assert.deepEqual(buildMulticamClips(p, restored), { video: [], audio: [], duration: 0 });
  const before = structuredClone(p);
  assert.deepEqual(placeMulticam(p, restored), []);
  assert.deepEqual(p, before, 'an empty program cannot replace or add timeline clips');
});

test('a first choice starts at the playhead and grows only through reviewed footage', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  const [A, B] = mc.angles.map((a) => a.id);
  cutAndSwitch(p, mc, 5, B);
  assert.equal(pictureAngleAt(p, mc, 4.9), null);
  assert.equal(pictureAngleAt(p, mc, 5), B);
  assert.equal(pictureAngleAt(p, mc, 6), null);
  extendProgram(p, mc, 5, 8);
  assert.deepEqual(segments(p, mc).map((s) => [s.start, s.end, s.angle]), [[5, 8, B]]);
  assert.equal(pictureAngleAt(p, mc, 9), null);
  // Seeking to an unreviewed position does not extend an earlier choice.
  assert.equal(extendProgram(p, mc, 10, 11), false);
  // At the next manual choice, the previous camera fills the reviewed interval.
  extendProgram(p, mc, 5, 10);
  cutAndSwitch(p, mc, 10, A);
  assert.equal(angleAt(mc, 9), B);
  assert.equal(angleAt(mc, 10), A);
  assert.equal(angleAt(mc, 11), null);
  const { video, audio, duration } = buildMulticamClips(p, mc);
  assert.equal(video[0].in, 5);
  assert.equal(video[0].start, 0);
  assert.equal(duration, 5.033333);
  assert.equal(audio[0].dur, duration);
});

test('unreviewed gaps and tails stay empty through export and reopening from the timeline', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  const [A, B] = mc.angles.map((a) => a.id);
  cutAndSwitch(p, mc, 5, A);
  extendProgram(p, mc, 5, 6);
  cutAndSwitch(p, mc, 9, B);
  extendProgram(p, mc, 9, 10);
  const built = buildMulticamClips(p, mc);
  assert.deepEqual(built.video.map((c) => [c.type, c.start, c.dur]), [['video', 0, 1], ['gap', 1, 3], ['video', 4, 1]]);
  assert.equal(built.duration, 5);
  assert.equal(built.audio[0].dur, 5);
  placeMulticam(p, mc);
  const reopened = absorbTimeline(p, p.multicams[mc.id]);
  assert.equal(reopened.ok, true);
  assert.equal(angleAt(reopened.mc, 7), null);
  assert.equal(angleAt(reopened.mc, 15), null);
  assert.deepEqual(segments(p, reopened.mc).map((s) => [s.start, s.end]), [[5, 6], [9, 10]]);
});

test('repeated paused choices preserve already reviewed neighbours and finite ends', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b', 'c']);
  const [A, B, C] = mc.angles.map((a) => a.id);
  cutAndSwitch(p, mc, 0, A);
  extendProgram(p, mc, 0, 5);
  cutAndSwitch(p, mc, 5, B);
  extendProgram(p, mc, 5, 10);
  cutAndSwitch(p, mc, 10, C);
  extendProgram(p, mc, 10, 15);
  for (const angle of [C, A, B]) {
    cutAndSwitch(p, mc, 7, angle, { preserveCuts: true });
    assert.equal(angleAt(mc, 6), B);
    assert.equal(angleAt(mc, 8), angle);
    assert.equal(angleAt(mc, 11), C);
    assert.equal(angleAt(mc, 16), null);
  }
  bladeAt(mc, 12);
  tidy(p, mc);
  assert.equal(angleAt(mc, 14), C);
  assert.equal(angleAt(mc, 16), null);
  const normalized = JSON.parse(JSON.stringify(mc));
  for (const angle of normalized.angles) angle.offset += 3;
  for (const cut of normalized.cuts) { cut.t += 3; cut.end += 3; }
  applyMulticamSync(p, normalized, {});
  assert.deepEqual(normalized.cuts, mc.cuts);
});

test('reverse playback extends a chosen camera only over the reviewed interval', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  const [A, B] = mc.angles.map((a) => a.id);
  cutAndSwitch(p, mc, 0, A);
  extendProgram(p, mc, 0, 5);
  cutAndSwitch(p, mc, 10, B);
  extendProgram(p, mc, 10, 8);
  assert.equal(angleAt(mc, 8), B);
  assert.equal(angleAt(mc, 7), null);
  assert.equal(angleAt(mc, 11), null);
  extendProgram(p, mc, 8, 3);
  assert.equal(angleAt(mc, 4), A);
  assert.equal(angleAt(mc, 6), B);
});

test('a reopened selected multicam can continue beyond its previously exported endpoint with matching audio', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  const [A, B] = mc.angles.map((angle) => angle.id);
  delete mc.rangeExplicit; // A selected-mode project saved before this fix.
  cutAndSwitch(p, mc, 0, A);
  extendProgram(p, mc, 0, 5);
  placeMulticam(p, mc);
  const read = absorbTimeline(p, p.multicams[mc.id]).mc;
  assert.equal(read.rangeExplicit, false);
  cutAndSwitch(p, read, 6, B);
  extendProgram(p, read, 6, 8);
  const previous = multicamClips(p, mc.id).map((id) => p.clips[id]);
  const built = buildMulticamClips(p, read, { previous, previousMc: p.multicams[mc.id] });
  assert.equal(built.duration, 8);
  assert.equal(built.video.at(-1).mediaId, 'b');
  assert.equal(built.video.at(-1).dur, 2);
  assert.equal(built.audio[0].dur, 8);
  placeMulticam(p, read, { replace: previous.map((clip) => clip.id) });
  assert.equal(p.duration, 8);
});

test('explicit I/O marks survive reopening and still bound further camera choices', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  const [A, B] = mc.angles.map((angle) => angle.id);
  cutAndSwitch(p, mc, 0, A);
  extendProgram(p, mc, 0, 5);
  mc.range = { in: 1, out: 12 };
  mc.rangeExplicit = true;
  placeMulticam(p, mc);
  const read = absorbTimeline(p, p.multicams[mc.id]).mc;
  assert.deepEqual(read.range, { in: 1, out: 12 });
  assert.equal(read.rangeExplicit, true);
  cutAndSwitch(p, read, 6, B);
  extendProgram(p, read, 6, 15);
  const built = buildMulticamClips(p, read);
  assert.equal(built.duration, 11);
  assert.equal(built.video.at(-1).dur, 6);
});

test('continuing selected video preserves deliberate audio trims from the timeline', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a']);
  const A = mc.angles[0].id;
  cutAndSwitch(p, mc, 0, A);
  extendProgram(p, mc, 0, 5);
  placeMulticam(p, mc);
  const audio = Object.values(p.clips).find((clip) => clip.type === 'audio');
  audio.in = 1;
  audio.start = 1;
  audio.dur = 3;
  const read = absorbTimeline(p, p.multicams[mc.id]).mc;
  extendProgram(p, read, 5, 8);
  const previous = multicamClips(p, mc.id).map((id) => p.clips[id]);
  const built = buildMulticamClips(p, read, { previous, previousMc: p.multicams[mc.id] });
  assert.equal(built.duration, 8);
  assert.equal(built.audio[0].in, 1);
  assert.equal(built.audio[0].start, 1);
  assert.equal(built.audio[0].dur, 3);
});

test('rolling a finite cut out and back never extends the reviewed end or fills later footage', () => {
  const p = setup(), mc = newMulticam();
  addAngles(p, mc, ['a', 'b']);
  const [A, B] = mc.angles.map((angle) => angle.id);
  cutAndSwitch(p, mc, 0, A);
  extendProgram(p, mc, 0, 5);
  cutAndSwitch(p, mc, 5, B);
  extendProgram(p, mc, 5, 10);
  moveCut(mc, 1, 12);
  assert.equal(mc.cuts[1].end, 10);
  assert.ok(mc.cuts[1].t < 10);
  moveCut(mc, 1, 6);
  assert.deepEqual(mc.cuts.map((cut) => [cut.t, cut.end]), [[0, 6], [6, 10]]);
  assert.equal(buildMulticamClips(p, mc).duration, 10);
  assert.equal(angleAt(mc, 11), null);
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

test('paused angle choices stay between the playhead and the next cut, even after auditioning neighbouring angles', () => {
  const p = setup(), mc = mcWith(p);
  const [A, B, C] = mc.angles.map((a) => a.id);
  cutAndSwitch(p, mc, 4, B);
  cutAndSwitch(p, mc, 9, C);
  cutAndSwitch(p, mc, 15, A);
  const outside = [0, 3.9, 4, 5.9, 9, 12, 15, 19];
  const original = outside.map((t) => angleAt(mc, t));
  // Choosing the next angle used to merge away the cut at 9. A second choice
  // would then overwrite that later section as well.
  for (const angle of [C, A, B, C, B]) {
    assert.equal(cutAndSwitch(p, mc, 6, angle, { preserveCuts: true }), true);
    tidy(p, mc); // The window also tidies after every edit.
    assert.equal(angleAt(mc, 6), angle);
    assert.equal(angleAt(mc, 8.9), angle);
    assert.deepEqual(outside.map((t) => angleAt(mc, t)), original);
    assert.deepEqual(mc.cuts.map((c) => c.t), [0, 4, 6, 9, 15]);
  }
  const reopened = tidy(p, JSON.parse(JSON.stringify(mc)));
  cutAndSwitch(p, reopened, 6, A, { preserveCuts: true });
  assert.deepEqual(outside.map((t) => angleAt(reopened, t)), original);
  assert.equal(angleAt(reopened, 6), A);
});

test('paused replacement at an existing cut and switch without cutting preserve both neighbouring sections', () => {
  const p = setup(), mc = mcWith(p);
  const [A, B, C] = mc.angles.map((a) => a.id);
  cutAndSwitch(p, mc, 4, B);
  cutAndSwitch(p, mc, 9, C);
  for (const angle of [C, A, B]) {
    cutAndSwitch(p, mc, 4, angle, { preserveCuts: true });
    assert.equal(angleAt(mc, 3.9), A);
    assert.equal(angleAt(mc, 4), angle);
    assert.equal(angleAt(mc, 9), C);
    assert.deepEqual(mc.cuts.map((c) => c.t), [0, 4, 9]);
  }
  for (const angle of [A, C, B]) {
    switchSegment(p, mc, 6, angle, { preserveCuts: true });
    assert.equal(angleAt(mc, 3.9), A);
    assert.equal(angleAt(mc, 4), angle);
    assert.equal(angleAt(mc, 9), C);
    assert.deepEqual(mc.cuts.map((c) => c.t), [0, 4, 9]);
  }
  const { video } = buildMulticamClips(p, mc);
  assert.deepEqual(video.map((c) => [c.start, c.dur, c.mediaId]),
    [[0, 4, 'a'], [4, 5, 'b'], [9, 11, 'c']]);
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
  assert.match(plan.failures[0].reason, /camera 3 \(silent\.mp4\).*no audio/);
  assert.match(plan.failures[1].reason, /camera 4 \(noise\.mp4\).*no matching sound/);
  applyMulticamSync(p, mc, plan.offsets);
  assert.equal(Math.min(...mc.angles.map((x) => x.offset)), 0);
  assert.equal(mc.angles[0].offset, 0);
  assert.ok(Math.abs(mc.angles[1].offset - 3) < 0.02);
});

test('a chosen fallback camera is used where the cut camera has no picture, or a gap with none', () => {
  const p = setup();
  const mc = mcWith(p);
  const [A, B, C] = mc.angles.map((x) => x.id);
  mc.angles[2].offset = 5; // camera 3 starts at 5 s
  cutAndSwitch(p, mc, 2, C);
  // Automatic: the first camera with a picture.
  assert.equal(pictureAngleAt(p, mc, 3), A);
  mc.fallback = B;
  assert.equal(pictureAngleAt(p, mc, 3), B);
  assert.deepEqual(buildMulticamClips(p, mc).video.slice(0, 3).map((c) => [c.mediaId, c.start, c.dur]), [['a', 0, 2], ['b', 2, 3], ['c', 5, 20]]);
  mc.fallback = 'none';
  assert.equal(pictureAngleAt(p, mc, 3), null);
  assert.equal(buildMulticamClips(p, mc).video[1].type, 'gap');
  // A fallback that is removed goes back to automatic.
  mc.fallback = B;
  mc.angles.splice(1, 1);
  tidy(p, mc);
  assert.equal(mc.fallback, 'auto');
});

test('external audio is labelled A1, becomes the sound, and its settings follow to the timeline', () => {
  const p = setup();
  p.media.rec = { id: 'rec', kind: 'audio', name: 'rec.wav', duration: 20, streams: { main: { path: '/m/rec.wav', hasAudio: true, wave: '/w/rec' } } };
  const mc = mcWith(p, ['a', 'rec', 'b']);
  const rec = mc.angles[1];
  assert.deepEqual(mc.angles.map((x) => angleLabel(p, mc, x.id)), ['1', 'A1', '2']);
  assert.equal(mc.audio, rec.id);
  rec.sound = { volume: -3, channels: 'left', gain: 4, bass: -6, rumble: true };
  const fx = soundEffects(angleSound(rec));
  assert.deepEqual(fx.map((e) => e.type), ['channels', 'highpass', 'gain', 'eq']);
  assert.equal(fx[0].p.mode, 1);
  assert.equal(fx[3].p.b0, -6);
  assert.equal(soundEffects({}).length, 0);
  const { audio } = buildMulticamClips(p, mc);
  assert.equal(audio.length, 1);
  assert.equal(audio[0].mediaId, 'rec');
  assert.equal(audio[0].props.volume, -3);
  assert.deepEqual(audio[0].props.afx.map((e) => e.id), ['mc-channels', 'mc-rumble', 'mc-gain', 'mc-eq']);
});

test('one file can be synchronized to the others afterwards, without moving them', () => {
  const p = setup();
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const base = Array.from({ length: 2600 }, () => (rnd() > 0.93 ? 0.5 + rnd() : 0.02 * rnd()));
  const waves = { '/w/a': { peaks: base.slice(0, 2000) }, '/w/b': { peaks: base.slice(300, 2300) }, '/w/c': { peaks: base.slice(500, 2500) } };
  const mc = mcWith(p);
  mc.angles[0].offset = 10;
  mc.angles[1].offset = 13;
  mc.angles[2].offset = 0;
  const plan = planMulticamSync(p, mc, (path) => waves[path] || null, { only: mc.angles[2].id });
  assert.deepEqual(Object.keys(plan.offsets), [mc.angles[2].id]);
  assert.ok(Math.abs(plan.offsets[mc.angles[2].id] - 15) < 0.02, String(plan.offsets[mc.angles[2].id]));
  p.media.c.streams.main.hasAudio = false;
  const none = planMulticamSync(p, mc, (path) => waves[path] || null, { only: mc.angles[2].id });
  assert.match(none.failures[0].reason, /camera 3 .*no audio/);
});

test('level keyframes on the sound follow to the audio clip in source time', () => {
  const p = setup();
  p.media.rec = { id: 'rec', kind: 'audio', name: 'rec.wav', duration: 20, streams: { main: { path: '/m/rec.wav', hasAudio: true, wave: '/w/rec' } } };
  const mc = mcWith(p, ['a', 'rec']);
  const rec = mc.angles[1];
  rec.offset = 2;
  rec.sound = { volume: -2, volumeKf: [[4, 0], [8, -12]] };
  assert.equal(soundLevelAt(angleSound(rec), 6), -6);
  assert.equal(soundLevelAt(angleSound(rec), 1), 0);
  assert.equal(soundLevelAt({ volume: -2 }, 6), -2);
  const { audio } = buildMulticamClips(p, mc);
  assert.deepEqual(audio[0].kf.volume, [[2, 0, 'linear'], [6, -12, 'linear']]);
});

test('tracks can be reordered, cameras and separate sound each among their own', () => {
  const p = setup();
  p.media.rec = { id: 'rec', kind: 'audio', name: 'rec.wav', duration: 20, streams: { main: { hasAudio: true } } };
  p.media.rec2 = { id: 'rec2', kind: 'audio', name: 'rec2.wav', duration: 20, streams: { main: { hasAudio: true } } };
  const mc = mcWith(p, ['a', 'rec', 'b', 'c', 'rec2']);
  const id = (m) => mc.angles.find((x) => x.mediaId === m).id;
  const C = id('c');
  cutAndSwitch(p, mc, 5, C);
  assert.equal(moveAngle(p, mc, C, 0), true);
  assert.deepEqual(mc.angles.map((x) => x.mediaId), ['c', 'rec', 'a', 'b', 'rec2']);
  assert.equal(angleLabel(p, mc, C), '1');
  assert.equal(angleAt(mc, 6), C);
  moveAngle(p, mc, id('rec2'), 0);
  assert.deepEqual(mc.angles.map((x) => x.mediaId), ['c', 'rec2', 'a', 'b', 'rec']);
  assert.equal(angleLabel(p, mc, id('rec2')), 'A1');
  assert.equal(moveAngle(p, mc, C, 0), false);
});

test('AI Clean Voice in the multicam sound settings becomes Clean Voice on the clips', () => {
  const p = setup();
  p.media.rec = { id: 'rec', kind: 'audio', name: 'rec.wav', duration: 20, streams: { main: { path: '/m/rec.wav', hasAudio: true } } };
  const mc = mcWith(p, ['a', 'rec']);
  mc.angles[1].sound = { clean: 0.7 };
  let { audio } = buildMulticamClips(p, mc);
  assert.deepEqual(audio[0].props.cleanVoice, { main: 0.7 });
  // Lyden følger bildet: videoklippene får Clean Voice på sine egne lydstrømmer.
  mc.audio = 'follow';
  mc.angles[0].sound = { clean: 0.5 };
  const { video } = buildMulticamClips(p, mc);
  assert.deepEqual(video[0].props.cleanVoice, { main: 0.5 });
  mc.audio = mc.angles[1].id;
  mc.angles[1].sound = { clean: null };
  ({ audio } = buildMulticamClips(p, mc));
  assert.equal(audio[0].props.cleanVoice, undefined);
});

test('the time of a clip in the multicam clip, for Active Video Angle on the timeline', () => {
  const p = setup();
  const mc = mcWith(p, ['a', 'b']);
  const [A, B] = mc.angles.map((x) => x.id);
  mc.angles[1].offset = 2;
  cutAndSwitch(p, mc, 6, B);
  const placed = placeMulticam(p, mc);
  const clips = placed.map((id) => p.clips[id]).filter((c) => c.type === 'video');
  const second = clips.find((c) => c.multicam.angle === B);
  assert.equal(multicamTimeOfClip(p, mc, second), 14);
  switchSegment(p, mc, multicamTimeOfClip(p, mc, second), A);
  assert.equal(angleAt(mc, 10), A);
  assert.equal(mc.cuts.length, 1);
});

function editedTimeline() {
  const p = setup();
  p.media.rec = { id: 'rec', kind: 'audio', name: 'rec.wav', duration: 20, streams: { main: { path: '/m/rec.wav', hasAudio: true } } };
  const mc = mcWith(p, ['a', 'b', 'rec']);
  const [A, B] = mc.angles.map((x) => x.id);
  cutAndSwitch(p, mc, 6, B);
  placeMulticam(p, mc);
  const vids = () => p.primary.map((id) => p.clips[id]).filter((c) => c.multicam);
  return { p, mc, A, B, vids };
}

test('trims, cuts and effects made on the timeline survive an update from the multicam window', () => {
  const { p, mc, A, B, vids } = editedTimeline();
  let [one, two] = vids();
  // Roll the cut one second later, add an effect and a keyframe to camera 2, blade it and trim the end.
  rollEdit(p, one.id, two.id, 1);
  two = p.clips[two.id];
  two.props.saturation = 0.4;
  two.kf.opacity = [[10, 1], [11, 0.5]];
  two.colorLabel = 'red';
  splitClip(p, two.id, 12);
  trimClip(p, vids().at(-1).id, 'end', -2);
  const audio = Object.values(p.clips).find((c) => c.type === 'audio');
  trimClip(p, audio.id, 'start', 1);
  const { mc: read, ok } = absorbTimeline(p, p.multicams[mc.id]);
  assert.equal(ok, true);
  assert.deepEqual(read.cuts.filter((c) => c.t <= read.range.out).map((c) => [c.t, c.angle === A ? 'A' : 'B', Boolean(c.blade)]), [[0, 'A', false], [7, 'B', false], [12, 'B', true]]);
  assert.deepEqual(read.range, { in: 0, out: 18 });
  // Cut to camera 1 at 15 s in the window, then update the timeline.
  cutAndSwitch(p, read, 15, A);
  placeMulticam(p, read, { replace: Object.values(p.clips).filter((c) => c.multicam?.id === mc.id).map((c) => c.id) });
  const after = vids();
  assert.deepEqual(after.map((c) => [c.start, c.dur, c.multicam.angle === A ? 'A' : 'B']), [[0, 7, 'A'], [7, 5, 'B'], [12, 3, 'B'], [15, 3, 'A']]);
  assert.equal(after[1].props.saturation, 0.4);
  assert.deepEqual(after[1].kf.opacity, [[10, 1], [11, 0.5]]);
  assert.equal(after[1].colorLabel, 'red');
  const sound = Object.values(p.clips).find((c) => c.type === 'audio');
  assert.equal(sound.start, 1);
  assert.equal(sound.dur, 17);
});

test('a camera can be switched in one clip without touching its trim, and removed middle parts are reported', () => {
  const { p, mc, A, B, vids } = editedTimeline();
  p.multicams[mc.id].angles[1].offset = 0;
  const [one, two] = vids();
  rollEdit(p, one.id, two.id, -1);
  const before = structuredClone(p.clips[two.id]);
  p.clips[two.id].kf.opacity = [[8, 1]];
  assert.equal(switchClipAngle(p, two.id, A).ok, true);
  const now = p.clips[two.id];
  assert.equal(now.start, before.start);
  assert.equal(now.dur, before.dur);
  assert.equal(now.multicam.angle, A);
  assert.equal(now.mediaId, 'a');
  assert.deepEqual(now.kf.opacity, [[8, 1]]);
  // A camera that starts later than the clip cannot cover it, so nothing changes.
  p.multicams[mc.id].angles[1].offset = 3;
  const first = vids()[0];
  const refused = switchClipAngle(p, first.id, B);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /no picture for the whole clip/);
  assert.equal(p.clips[first.id].multicam.angle, A);
  // Deleting a piece in the middle of the storyline cannot be described as cuts.
  splitClip(p, now.id, 10);
  const pieces = vids();
  deleteClips(p, [pieces[1].id], { ripple: true });
  assert.equal(absorbTimeline(p, p.multicams[mc.id]).ok, false);
});
