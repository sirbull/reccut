import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, newProject } from '../src/shared/model.js';
import {
  addAngles,
  angleLabel,
  angleSound,
  soundEffects,
  soundLevelAt,
  angleAt,
  applyMulticamSync,
  bladeAt,
  buildMulticamClips,
  cutAndSwitch,
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
