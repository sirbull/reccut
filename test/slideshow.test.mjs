import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip, computeFrame } from '../src/shared/model.js';
import { addSlideshow, slideshowOptions } from '../src/shared/slideshow.js';
import { imageFitRect, imageRectAt, enableKenBurns } from '../src/shared/imageMotion.js';
import { splitClip, trimClip, moveClip, copyClips, pasteClips, deleteClips } from '../src/shared/ops.js';
function setup(n = 5) {
  const p = newProject(); p.width = 1920; p.height = 1080;
  for (let i = 0; i < n; i++) p.media[`m${i}`] = { id: `m${i}`, kind: 'image', name: `Photo ${n - i}.jpg`,
    streams: { main: { hasVideo: true, width: i % 2 ? 800 : 1600, height: i % 2 ? 1200 : 900 } } };
  return p;
}
test('all image fitting modes preserve aspect except explicit stretch', () => {
  assert.deepEqual(imageFitRect(400, 800, 1600, 900), { x: 575, y: 0, w: 450, h: 900 });
  assert.deepEqual(imageFitRect(400, 800, 1600, 900, 'height'), { x: 575, y: 0, w: 450, h: 900 });
  assert.deepEqual(imageFitRect(400, 800, 1600, 900, 'width'), { x: 0, y: -1150, w: 1600, h: 3200 });
  assert.deepEqual(imageFitRect(400, 800, 1600, 900, 'cover'), { x: 0, y: -1150, w: 1600, h: 3200 });
  assert.deepEqual(imageFitRect(400, 800, 1600, 900, 'stretch'), { x: 0, y: 0, w: 1600, h: 900 });
});
test('Ken Burns is bounded, deterministic and preserves continuity through a split', () => {
  const p = setup(1), c = makeClip('image', { media: p.media.m0, dur: 6, props: { imageFit: 'cover' } });
  p.clips[c.id] = c; p.primary = [c.id]; enableKenBurns(c, 'in', 0.2);
  assert.ok(imageRectAt(c, 5.9, 1600, 900, 1920, 1080).w > imageRectAt(c, 0.1, 1600, 900, 1920, 1080).w);
  const original = imageRectAt(c, 4, 1600, 900, 1920, 1080);
  const id = splitClip(p, c.id, 3);
  assert.deepEqual(imageRectAt(p.clips[id], 4, 1600, 900, 1920, 1080), original);
  for (const T of [0, 1, 3, 6, 7]) { const r = imageRectAt(c, T, 1600, 900, 1920, 1080); assert.ok(r.x <= 0 && r.y <= 0 && r.x + r.w >= 1920 && r.y + r.h >= 1080); }
});
test('slideshow makes ordinary foreground/background image pairs with shared transitions', () => {
  const p = setup(), r = addSlideshow(p, Object.keys(p.media));
  assert.equal(r.end, 25); assert.equal(p.primary.length, 5); assert.equal(Object.keys(p.clips).length, 10);
  r.foregrounds.forEach((id, i) => {
    const fg = p.clips[id], bg = p.clips[fg.slideshowParent];
    assert.equal(fg.type, 'image'); assert.equal(bg.mediaId, fg.mediaId); assert.equal(bg.group, fg.group);
    assert.equal(bg.slideshowForeground, fg.id); assert.equal(bg.props.imageFit, 'cover');
    assert.equal(fg.start, i * 5); assert.equal(fg.dur, bg.dur); assert.equal(fg.props.kenBurns, true);
    assert.ok(bg.props.blur > 0 && bg.props.exposure < 0);
    if (i) assert.equal(bg.transition.type, 'dissolve'); else assert.equal(bg.transition, undefined);
  });
  const frame = computeFrame(p, 4.8);
  assert.equal(frame.layers.length, 1); assert.equal(frame.layers[0].a.companions[0].id, r.foregrounds[0]);
  assert.equal(frame.layers[0].b.companions[0].id, r.foregrounds[1]);
  assert.deepEqual(JSON.parse(JSON.stringify(p)).clips, p.clips);
});
test('background-free static slideshows, random subsets and file-name order work', () => {
  const p = setup(20), r = addSlideshow(p, Object.keys(p.media), { background: false, motion: 'none', duration: 3,
    transitionMode: 'random', transitions: ['wipe', 'dissolve'], order: 'name' }, { seed: 23 });
  assert.equal(r.backgrounds.length, 0); assert.equal(p.primary.length, 20);
  assert.equal(p.clips[r.foregrounds[0]].name, 'Photo 1.jpg');
  const transitions = p.primary.slice(1).map((id) => p.clips[id].transition.type);
  assert.deepEqual([...new Set(transitions)].sort(), ['dissolve', 'wipe']);
  transitions.forEach((t, i) => { if (i) assert.notEqual(t, transitions[i - 1]); });
  for (const id of r.foregrounds) assert.equal(p.clips[id].props.kenBurns, false);
  const q = setup(2), s = addSlideshow(q, Object.keys(q.media), { transitionMode: 'none', background: false, motion: 'pan' });
  assert.equal(q.clips[s.foregrounds[1]].transition, undefined);
  assert.match(q.clips[s.foregrounds[0]].props.kenBurnsMode, /left|right|up|down/);
});
test('a slideshow appends after existing layers and leaves them intact', () => {
  const p = setup(2), existing = makeClip('image', { media: p.media.m0, dur: 4 }), upper = makeClip('title', { lane: 2, start: 3, dur: 6 });
  p.clips[existing.id] = existing; p.clips[upper.id] = upper; p.primary = [existing.id];
  const r = addSlideshow(p, ['m1']);
  assert.equal(r.start, 9); assert.equal(existing.start, 0); assert.equal(upper.start, 3);
  assert.equal(p.primary[0], existing.id); assert.equal(p.clips[p.primary[1]].type, 'gap');
});
test('background pairs trim, split, copy, move and delete together', () => {
  const p = setup(3), r = addSlideshow(p, Object.keys(p.media));
  const fg = p.clips[r.foregrounds[0]], bg = p.clips[fg.slideshowParent];
  trimClip(p, fg.id, 'end', 1); assert.equal(fg.dur, 6); assert.equal(bg.dur, 6);
  const rightId = splitClip(p, fg.id, 3), right = p.clips[rightId];
  const rightFg = p.clips[right.slideshowForeground];
  assert.equal(rightFg.slideshowParent, right.id); assert.equal(rightFg.start, 3); assert.equal(rightFg.dur, 3);
  assert.equal(rightFg.group, right.group); assert.notEqual(right.group, bg.group);
  const copied = copyClips(p, [rightFg.id]); assert.equal(copied.length, 2);
  const pasted = pasteClips(p, copied, 16), pastedFg = pasted.map((id) => p.clips[id]).find((c) => c.slideshowParent);
  assert.equal(p.clips[pastedFg.slideshowParent].slideshowForeground, pastedFg.id);
  assert.notEqual(pastedFg.slideshowParent, right.id);
  deleteClips(p, [pastedFg.id]); assert.equal(p.clips[pastedFg.id], undefined); assert.equal(p.clips[pastedFg.slideshowParent], undefined);
  moveClip(p, rightFg.id, { lane: 0, start: 0, primaryIndex: 0 }); assert.equal(rightFg.start, right.start);
});
test('invalid requests reject before mutation, and transition lengths cannot consume a photo', () => {
  const p = setup(2), before = JSON.stringify(p);
  assert.throws(() => addSlideshow(p, ['m0'], { transitionMode: 'random', transitions: [] }));
  assert.equal(JSON.stringify(p), before);
  p.lanes[0] = { locked: true }; assert.throws(() => addSlideshow(p, ['m0']));
  const opts = slideshowOptions({ duration: 2, transitionDuration: 20, fit: 'bad' }, 30);
  assert.ok(opts.transitionDuration <= 0.9); assert.equal(opts.fit, 'contain');
});
