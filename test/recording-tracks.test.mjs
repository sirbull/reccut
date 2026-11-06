import test from 'node:test';
import assert from 'node:assert/strict';
import { audioComponents, clipHasAudio, computeAudio, computeFrame, makeClip, newProject, sourceTime, visualStreams } from '../src/shared/model.js';
import { addMediaClip, attachRecordingCamera, bladeAt, copyClips, deleteClips, detachRecordingCamera, freezeFrame, insertGap, moveClip, pasteClips, recordingChildren, separateRecordingCamera, setRamp, setReverse, setSpeed, setTransition, slipClip, splitClip, trimClip } from '../src/shared/ops.js';
import { gradeParams } from '../src/shared/grade.js';
import { drawClip } from '../src/shared/render.js';
import { speechSources } from '../src/shared/srt.js';

function setup() {
  const p = newProject('Recording');
  const stream = (key, offset = 0) => ({ path: `/tmp/${key}.webm`, hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 20, offset });
  p.media.rec = { id: 'rec', name: 'Recording', kind: 'recording', duration: 20, streams: { screen: stream('screen'), camera: stream('camera', 0.1) }, rec: { layouts: [[0, 6], [8, 1], [14, 3]], pip: { shape: 'circle', size: 'medium', mirror: true } } };
  const id = addMediaClip(p, p.media.rec, 'append', 0, undefined, { in: 2, dur: 12 });
  return { p, screen: p.clips[id], camera: recordingChildren(p, id)[0] };
}

function keysSetup() {
  const p = newProject('Keys');
  const stream = (key) => ({ path: `/tmp/${key}.webm`, hasVideo: true, hasAudio: true, width: 1280, height: 720, duration: 20, offset: 0 });
  p.media.rec = { id: 'rec', name: 'Recording', kind: 'recording', duration: 20, streams: { screen: stream('screen'), camera: stream('camera') }, rec: { layouts: [[0, 6]], overlays: { keys: true, cursorZoom: true }, keys: [[1, '⌘ S']] } };
  const id = addMediaClip(p, p.media.rec, 'append', 0, undefined, { in: 2, dur: 12 });
  const part = (name) => Object.values(p.clips).find((c) => c.recordingPart === name);
  return { p, id, part };
}

test('a recording with keystrokes gets three video layers, keys on top', () => {
  const { p, part } = keysSetup();
  const screen = part('screen'), camera = part('camera'), keys = part('keys');
  assert.ok(screen.lane < camera.lane && camera.lane < keys.lane);
  assert.equal(keys.linkedTo, screen.id);
  assert.equal(screen.props.showKeys, false);
  assert.equal(keys.props.showKeys, true);
  assert.equal(recordingChildren(p, screen.id)[0], camera);
  assert.equal(clipHasAudio(keys, p.media.rec), false);
  assert.deepEqual(audioComponents(keys, p.media.rec), []);
  assert.deepEqual(visualStreams(keys, p.media.rec), []);
});

test('the keystroke layer follows the screen through cuts and can be removed alone', () => {
  const { p, part } = keysSetup();
  const screen = part('screen');
  bladeAt(p, 5);
  const layers = Object.values(p.clips).filter((c) => c.recordingPart === 'keys');
  assert.equal(layers.length, 2);
  for (const k of layers) {
    const parent = p.clips[k.linkedTo];
    assert.equal(parent.recordingPart, 'screen');
    assert.deepEqual([k.start, k.in, k.dur], [parent.start, parent.in, parent.dur]);
  }
  deleteClips(p, [layers[0].id]);
  assert.ok(p.clips[screen.id]);
  deleteClips(p, [screen.id]);
  assert.ok(!Object.values(p.clips).some((c) => c.linkedTo === screen.id));
});

test('the keystroke layer draws the keys and never the recording', () => {
  const { p, part } = keysSetup();
  p.media.rec.rec.keys = [[3, '⌘ S']];
  const drawn = [];
  const paint = () => new Proxy({}, {
    get: (t, k) => k in t ? t[k] : k === 'measureText' ? () => ({ width: 40 }) : k === 'fillText' ? (text) => drawn.push(text) : k === 'getTransform' ? () => ({ multiply: () => ({}) }) : () => paint(),
    set: (t, k, v) => (t[k] = v, true),
  });
  const sources = [];
  const source = (clip, key) => (sources.push(key), null);
  drawClip(paint(), p, part('keys'), 1.2, source);
  assert.ok(drawn.includes('⌘ S'));
  assert.deepEqual(sources, []);
  drawn.length = 0;
  drawClip(paint(), p, part('screen'), 1.2, source);
  assert.ok(!drawn.includes('⌘ S'));
  assert.ok(sources.includes('screen'));
});

test('recordings without keystrokes stay on two layers', () => {
  const { p, screen } = setup();
  assert.ok(!Object.values(p.clips).some((c) => c.recordingPart === 'keys'));
  assert.equal(p.clips[screen.id].props.showKeys, true);
});

function synchronized(p, screen, camera) {
  for (const k of ['start', 'in', 'dur', 'speed', 'ramp', 'reverse']) assert.deepEqual(camera[k], screen[k], k);
  for (const u of [0.1, 0.6, 0.9]) assert.equal(sourceTime(camera, camera.start + camera.dur * u), sourceTime(screen, screen.start + screen.dur * u));
  assert.equal(camera.linkedTo, screen.id);
  assert.ok(camera.lane > screen.lane);
}

test('screen recordings create a selectable PiP clip on V2 with independent color and one audio source', () => {
  const { p, screen, camera } = setup();
  assert.equal(screen.lane, 0);
  assert.equal(camera.lane, 1);
  assert.deepEqual(p.primary, [screen.id]);
  synchronized(p, screen, camera);
  assert.equal(camera.props.pipShape, 'circle');
  assert.equal(camera.props.mirror, true);
  assert.deepEqual(camera.kf.layout, p.media.rec.rec.layouts);
  assert.deepEqual(visualStreams(camera, p.media.rec).map(([key]) => key), ['camera']);
  assert.deepEqual(visualStreams(screen, p.media.rec).map(([key]) => key), ['screen']);
  assert.equal(clipHasAudio(camera, p.media.rec), false);
  assert.deepEqual(audioComponents(camera, p.media.rec), []);
  assert.equal(computeAudio(p, 3).length, 2, 'mic and system audio are each mixed once');
  assert.equal(speechSources(p).length, 1, 'captions must not transcribe the PiP copy');
  assert.equal(computeFrame(p, 3).layers.length, 2);
  camera.props.cameraExposure = 0.5;
  assert.equal(gradeParams(camera, 3, 'camera').exposure, 0.5);
  assert.equal(gradeParams(screen, 3, 'screen'), null);
  assert.equal(screen.props.cameraExposure, 0);
});

test('trimming either linked track trims both and ripple edits keep both in sync', () => {
  const { p, screen, camera } = setup();
  trimClip(p, camera.id, 'start', 2);
  assert.equal(screen.in, 4);
  assert.equal(screen.dur, 10);
  synchronized(p, screen, camera);
  trimClip(p, screen.id, 'end', -2);
  synchronized(p, screen, camera);
  insertGap(p, 0, 3);
  assert.equal(screen.start, 3);
  synchronized(p, screen, camera);
  deleteClips(p, [p.primary[0]]);
  assert.equal(screen.start, 0);
  synchronized(p, screen, camera);
});

test('splitting either linked clip makes two linked pairs and blade-all splits each pair only once', () => {
  for (const fromCamera of [false, true]) {
    const { p, screen, camera } = setup();
    const rightId = splitClip(p, fromCamera ? camera.id : screen.id, 5);
    const right = p.clips[rightId];
    synchronized(p, screen, camera);
    synchronized(p, right, recordingChildren(p, rightId)[0]);
    assert.equal(camera.lane, 1);
    assert.equal(recordingChildren(p, rightId)[0].lane, 1);
    assert.equal(screen.dur, 5);
    assert.equal(right.in, 7);
    assert.equal(Object.keys(p.clips).length, 4);
    bladeAt(p, 8);
    assert.equal(Object.keys(p.clips).length, 6);
    assert.equal(p.primary.length, 3);
    for (const id of p.primary) synchronized(p, p.clips[id], recordingChildren(p, id)[0]);
  }
});

test('speed, ramps, reverse and slipping from PiP keep the screen synchronized', () => {
  const { p, screen, camera } = setup();
  setSpeed(p, camera.id, 2);
  synchronized(p, screen, camera);
  setRamp(p, camera.id, [[0, 1], [1, 3]]);
  synchronized(p, screen, camera);
  setReverse(p, camera.id, true);
  synchronized(p, screen, camera);
  slipClip(p, camera.id, 1);
  synchronized(p, screen, camera);
});

test('detached PiP keeps its timing through screen edits and deletion, and can be relinked', () => {
  const { p, screen, camera } = setup();
  assert.equal(detachRecordingCamera(p, camera.id), true);
  trimClip(p, screen.id, 'start', 2);
  assert.equal(camera.in, 2);
  assert.equal(camera.dur, 12);
  insertGap(p, 0, 3);
  assert.equal(camera.start, 0, 'detached PiP does not acquire an implicit storyline anchor');
  moveClip(p, camera.id, { start: 30, lane: 1 });
  assert.equal(camera.start, 30);
  assert.equal(camera.lane, 1, 'detached PiP stays on its own track beyond the storyline');
  assert.equal(attachRecordingCamera(p, camera.id, screen.id), true);
  synchronized(p, screen, camera);
  detachRecordingCamera(p, camera.id);
  deleteClips(p, [screen.id]);
  assert.equal(p.clips[camera.id], camera);
});

test('deleting a screen also deletes linked PiP; removing PiP leaves the screen and its audio', () => {
  const first = setup();
  deleteClips(first.p, [first.screen.id]);
  assert.equal(Object.keys(first.p.clips).length, 0);
  const second = setup();
  deleteClips(second.p, [second.camera.id]);
  assert.ok(second.p.clips[second.screen.id]);
  assert.equal(computeAudio(second.p, 3).length, 2);
});

test('copying a screen copies PiP and paste remaps links; copying only PiP pastes an independent clip', () => {
  const { p, screen, camera } = setup();
  const pair = copyClips(p, [screen.id]);
  assert.equal(pair.length, 2);
  const pasted = pasteClips(p, pair, 12);
  const next = p.clips[pasted[0]];
  assert.equal(next.recordingPart, 'screen');
  const pip = recordingChildren(p, next.id)[0];
  assert.ok(pip);
  synchronized(p, next, pip);
  const lone = pasteClips(p, copyClips(p, [camera.id]), 25);
  assert.equal(lone.length, 1);
  assert.equal(p.clips[lone[0]].linkedTo, undefined);
  assert.equal(p.clips[lone[0]].recordingPart, 'camera');
});

test('inserting into a linked recording splits both tracks; overwrite removes the replaced PiP', () => {
  const { p, screen } = setup();
  addMediaClip(p, p.media.rec, 'insert', 5, undefined, { dur: 2 });
  assert.equal(p.primary.length, 3);
  for (const id of p.primary) synchronized(p, p.clips[id], recordingChildren(p, id)[0]);
  addMediaClip(p, p.media.rec, 'overwrite', 0, undefined, { dur: 3 });
  assert.equal(p.clips[screen.id], undefined);
  for (const c of Object.values(p.clips)) if (c.linkedTo) assert.ok(p.clips[c.linkedTo]);
});

test('legacy recordings can be separated once without losing color, layout or source offsets', () => {
  const { p } = setup();
  p.clips = {};
  p.primary = [];
  const old = makeClip('recording', { media: p.media.rec });
  old.props.cameraExposure = 0.4;
  p.clips[old.id] = old;
  p.primary.push(old.id);
  const id = separateRecordingCamera(p, old.id);
  assert.equal(p.clips[id].props.cameraExposure, 0.4);
  assert.equal(visualStreams(p.clips[id], p.media.rec)[0][1].offset, 0.1);
  assert.equal(separateRecordingCamera(p, old.id), null);
  const restored = JSON.parse(JSON.stringify(p));
  synchronized(restored, restored.clips[old.id], restored.clips[id]);
});

test('moving either member reorders the pair; locked tracks prevent timing edits through PiP', () => {
  const { p, screen, camera } = setup();
  const next = addMediaClip(p, p.media.rec, 'append', 0, undefined, { dur: 4 });
  moveClip(p, camera.id, { lane: 1, start: 15 });
  assert.deepEqual(p.primary, [next, screen.id]);
  synchronized(p, screen, camera);
  assert.equal(screen.start, 4);
  p.lanes[0] = { locked: true };
  trimClip(p, camera.id, 'end', -2);
  assert.equal(screen.dur, 12);
  setSpeed(p, camera.id, 2);
  assert.equal(screen.speed, undefined);
  assert.equal(splitClip(p, camera.id, 6), null);
  p.lanes[0].locked = false;
  p.lanes[1] = { locked: true };
  trimClip(p, screen.id, 'end', -2);
  assert.equal(screen.dur, 12);
});

test('animated PiP corrections keep their timeline timing when slipping the linked source', () => {
  const { p, screen, camera } = setup();
  camera.kf.cameraExposure = [[2, 0], [14, 1]];
  const before = gradeParams(camera, 4, 'camera').exposure;
  slipClip(p, screen.id, 1);
  assert.equal(gradeParams(camera, 4, 'camera').exposure, before);
  synchronized(p, screen, camera);
});

test('linked PiP follows storyline transition handles with no duplicated layer', () => {
  const { p, screen, camera } = setup();
  const nextId = addMediaClip(p, p.media.rec, 'append', 0, undefined, { dur: 4 });
  const nextCamera = recordingChildren(p, nextId)[0];
  setTransition(p, nextId, 'dissolve', 2);
  for (const T of [11.5, 12, 12.5]) {
    const frame = computeFrame(p, T);
    assert.equal(frame.layers.length, 2);
    assert.equal(frame.layers[1].a.clip.id, camera.id);
    assert.equal(frame.layers[1].b.clip.id, nextCamera.id);
    assert.deepEqual(frame.layers[1].transition, frame.layers[0].transition);
  }
  detachRecordingCamera(p, camera.id);
  const frame = computeFrame(p, 11.5);
  assert.ok(frame.layers.some((l) => l.clip?.id === camera.id), 'detached PiP has its own transition behavior');
});

test('a freeze frame keeps a frozen linked camera and the original pairs remain synchronized', () => {
  const { p, camera } = setup();
  camera.props.cameraExposure = 0.3;
  const id = freezeFrame(p, 5, 2);
  const freeze = p.clips[id];
  const frozenCamera = recordingChildren(p, id)[0];
  assert.ok(frozenCamera);
  assert.equal(frozenCamera.speed, 0);
  assert.equal(frozenCamera.freezeAt, 7);
  assert.equal(frozenCamera.props.cameraExposure, 0.3);
  assert.equal(sourceTime(frozenCamera, 5.5), sourceTime(frozenCamera, 6.5));
  assert.equal(clipHasAudio(freeze, p.media.rec), false);
  for (const id of p.primary) synchronized(p, p.clips[id], recordingChildren(p, id)[0]);
});
