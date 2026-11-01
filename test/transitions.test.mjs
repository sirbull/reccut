import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, transitionWindow, computeFrame, computeAudio, transitionSelection, parseTransitionSelection, nearestEdit } from '../src/shared/model.js';
import { addMediaClip, removeTransition, setTransition, splitClip } from '../src/shared/ops.js';
import { frameEffectPlacement, libraryDropTarget, resizedTransitionDuration } from '../src/shared/libraryDrop.js';

function setup() {
  const p = newProject('Transitions');
  for (const id of ['a', 'b']) {
    const m = { id, kind: 'video', name: id, duration: 8, streams: { main: { path: `/tmp/${id}.mp4`, duration: 8, hasVideo: true, hasAudio: true } } };
    p.media[id] = m;
    addMediaClip(p, m, 'append');
  }
  return p;
}
const item = { kind: 'transition', id: 'dissolve', label: 'Cross Dissolve' };
function drop(p, T, options) {
  const target = libraryDropTarget(p, item, 0, T, options);
  assert.ok(target);
  setTransition(p, target.id, item.id, target.dur, target.edge);
  const i = p.primary.indexOf(target.id);
  const prev = p.clips[p.primary[i - 1]];
  assert.deepEqual(transitionWindow(p.clips[target.id], Boolean(prev), prev, target.edge), [target.a, target.b], 'hover and drop have identical geometry');
  return target;
}

test('library drops target the opening, either side of a cut, and the final edge', () => {
  const p = setup();
  assert.deepEqual([drop(p, 0.2).a, drop(p, 0.2).b], [0, 1]);
  const left = drop(p, 7.8, { transitionDur: 2 });
  const right = drop(p, 8.2, { transitionDur: 2 });
  assert.deepEqual(left, right);
  assert.equal(left.id, p.primary[1]);
  assert.deepEqual([left.a, left.b], [7, 9]);
  const end = drop(p, 15.8, { transitionDur: 2 });
  assert.equal(end.edge, 'end');
  assert.deepEqual([end.a, end.b], [14, 16]);
  assert.ok(p.clips[end.id].transition, 'opening and closing transitions coexist');
});

test('wrong tracks, locked tracks and empty space do not receive transitions', () => {
  const p = setup();
  assert.equal(libraryDropTarget(p, item, 1, 8), null);
  assert.equal(libraryDropTarget(p, item, -1, 8), null);
  assert.equal(libraryDropTarget(p, item, 0, 20), null);
  p.lanes = { 0: { locked: true } };
  assert.equal(libraryDropTarget(p, item, 0, 8), null);
});

test('outer edge tolerance and short clips use the actual clamped duration', () => {
  const p = setup();
  const end = drop(p, 16.1, { tolerance: 0.2, transitionDur: 8 });
  assert.deepEqual([end.a, end.b], [12, 16]);
  const c = p.clips[p.primary[0]];
  c.dur = 1 / 30;
  const start = drop(p, 0, { transitionDur: 1 });
  assert.ok(Math.abs(start.b - start.a - c.dur) < 1e-6);
});

test('final transition fades picture and audio to black and silence', () => {
  const p = setup();
  const end = drop(p, 15.9, { transitionDur: 2 });
  const f = computeFrame(p, 15);
  assert.equal(f.layers[0].a.clip.id, end.id);
  assert.equal(f.layers[0].b, null);
  assert.equal(f.layers[0].transition.p, 0.5);
  const audio = computeAudio(p, 15);
  assert.equal(audio.length, 1);
  assert.ok(Math.abs(audio[0].gain - Math.SQRT1_2) < 1e-9);
  assert.ok(computeAudio(p, 15.99)[0].gain < 0.01);
  assert.equal(computeFrame(p, 16).layers.length, 0);
  assert.equal(computeAudio(p, 16).length, 0);
});

test('resizing keeps cuts centered and outer endpoints attached', () => {
  assert.equal(resizedTransitionDuration(1, -0.5, 'start', true), 2);
  assert.equal(resizedTransitionDuration(1, 0.5, 'end', true), 2);
  assert.equal(resizedTransitionDuration(1, 0.5, 'end', false), 1.5);
  assert.equal(resizedTransitionDuration(1, -0.5, 'start', false), 1.5);
  const p = setup();
  const end = drop(p, 15.9);
  setTransition(p, end.id, 'dissolve', 3, 'end');
  assert.deepEqual(transitionWindow(p.clips[end.id], false, null, 'end'), [13, 16]);
});

test('closing transition can be selected and removed independently, and survives save/load', () => {
  const p = setup();
  const end = drop(p, 15.9);
  drop(p, 8.1);
  const loaded = JSON.parse(JSON.stringify(p));
  const { id, edge, key } = parseTransitionSelection(transitionSelection(end.id, 'end'));
  assert.equal(key, 'transitionOut');
  assert.ok(loaded.clips[id][key]);
  removeTransition(loaded, id, edge);
  assert.equal(loaded.clips[id].transitionOut, undefined);
  assert.ok(loaded.clips[id].transition);
});

test('splitting a clip keeps its fade out only on the right piece', () => {
  const p = setup();
  const end = drop(p, 15.9);
  const right = splitClip(p, end.id, 12);
  assert.equal(p.clips[end.id].transitionOut, undefined);
  assert.ok(p.clips[right].transitionOut);
  assert.deepEqual(transitionWindow(p.clips[right], false, null, 'end'), [15, 16]);
});

test('effects preview only the clip under the pointer, including audio eligibility', () => {
  const p = setup();
  const effect = { kind: 'effect', id: 'grayscale' };
  const target = libraryDropTarget(p, effect, 0, 9);
  assert.equal(target.id, p.primary[1]);
  assert.deepEqual([target.a, target.b], [8, 16]);
  assert.equal(libraryDropTarget(p, effect, 0, 20), null);
  const audio = makeClip('audio', { lane: -1, start: 2, dur: 5 });
  p.clips[audio.id] = audio;
  assert.equal(libraryDropTarget(p, effect, -1, 3), null);
  assert.equal(libraryDropTarget(p, { kind: 'afx', id: 'eq' }, 0, 9).id, p.primary[1]);
  p.lanes = { 0: { locked: true } };
  assert.equal(libraryDropTarget(p, effect, 0, 9), null);
});

test('whole frame effects share the same range, duration and lane for preview and drop', () => {
  const p = setup();
  p.range = { in: 3, out: 6 };
  const plan = frameEffectPlacement(p, 4);
  const target = libraryDropTarget(p, { kind: 'frameFx', id: 'blur' }, 0, 4);
  assert.deepEqual([target.a, target.b, target.lane], [plan.start, plan.start + plan.dur, plan.lane]);
  const hinted = libraryDropTarget(p, { kind: 'frameFx', id: 'blur' }, 2, 4);
  assert.deepEqual([hinted.a, hinted.b, hinted.lane], [4, 8, 2]);
});

test('connected clips fade in and out over the lanes below, video and audio', () => {
  const p = setup();
  const id = addMediaClip(p, p.media.a, 'connect', 4, 1, { dur: 4 });
  const start = libraryDropTarget(p, item, 1, 4.5, { transitionDur: 1 });
  const end = libraryDropTarget(p, item, 1, 7.5, { transitionDur: 1 });
  assert.deepEqual([start.id, start.edge, start.a, start.b], [id, 'start', 4, 5]);
  assert.deepEqual([end.edge, end.a, end.b], ['end', 7, 8]);
  setTransition(p, id, 'dissolve', 1, 'start', true);
  setTransition(p, id, 'dissolve', 1, 'end', true);
  const layerAt = (T) => computeFrame(p, T).layers.find((l) => (l.b || l)?.clip?.id === id);
  const mid = layerAt(4.5);
  assert.equal(mid.overlay, true);
  assert.equal(mid.a, null);
  assert.equal(mid.transition.p, 0.5);
  assert.equal(layerAt(7.75).transition.p, 0.25, 'the end is the opening played backwards');
  assert.equal(layerAt(6).transition, undefined);
  assert.ok(computeFrame(p, 6).layers[0].clip, 'the storyline below is drawn as before');
  const gain = (T) => computeAudio(p, T).filter((a) => a.clip.id === id).reduce((s, a) => s + a.gain, 0);
  assert.ok(gain(4.1) < gain(6));
});

test('whole frame effects like Pixelate can fade in with a transition', () => {
  const p = setup();
  const fx = makeClip('redact', { start: 2, dur: 4, lane: 1, props: { mode: 'pixelate', shape: 'full' } });
  p.clips[fx.id] = fx;
  const target = libraryDropTarget(p, item, 1, 2.2, { transitionDur: 1 });
  assert.deepEqual([target.id, target.edge], [fx.id, 'start']);
  setTransition(p, fx.id, 'dissolve', 1, 'start');
  const layer = computeFrame(p, 2.5).layers.find((l) => l.b?.clip.id === fx.id);
  assert.equal(layer.overlay, true);
  assert.equal(layer.transition.p, 0.5);
});

test('nearestEdit picks the cut, opening or closing edge closest to the playhead', () => {
  const p = setup();
  const [a, b] = p.primary;
  assert.deepEqual(nearestEdit(p, 0.5), { id: a, edge: 'start' });
  assert.deepEqual(nearestEdit(p, 7.2), { id: b, edge: 'start' });
  assert.deepEqual(nearestEdit(p, 15.9), { id: b, edge: 'end' }, 'playhead at the end of the last clip fades out');
  assert.deepEqual(nearestEdit(p, 30), { id: b, edge: 'end' });
  assert.equal(nearestEdit(newProject('Empty'), 3), null);
});
