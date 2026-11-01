import test from 'node:test';
import { effectWarning } from '../src/shared/effectSupport.js';
import assert from 'node:assert/strict';
import { makeClip, newProject, computeFrame, computeAudio, isElastic, isVisual, sourceTime } from '../src/shared/model.js';
import { moveClip, placeFree, splitClip, setClipDuration } from '../src/shared/ops.js';
import { canMask, addMask } from '../src/shared/shapes.js';
import { frameEffectPlacement, libraryDropTarget } from '../src/shared/libraryDrop.js';
import { makeVideoEffect } from '../src/shared/videoEffects.js';
import { pasteAttributes } from '../src/shared/attributes.js';
import { stylizePixels, stylizeSettings } from '../src/shared/stylize.js';

test('adjustments are visual, elastic, maskable and ordered among video lanes without audio', () => {
  const p = newProject();
  const a = makeClip('adjustment', { lane: 2, dur: 10 });
  const top = makeClip('image', { lane: 3, dur: 10 });
  const back = makeClip('image', { lane: 0, dur: 10 });
  for (const c of [a, top, back]) p.clips[c.id] = c;
  p.primary = [back.id];
  assert.ok(isVisual(a) && isElastic(a) && canMask(a));
  assert.deepEqual(computeFrame(p, 2).layers.map((l) => l.clip.id), [back.id, a.id, top.id]);
  assert.deepEqual(computeAudio(p, 2), []);
  a.enabled = false;
  assert.deepEqual(computeFrame(p, 2).layers.map((l) => l.clip.id), [back.id, top.id]);
});

test('adjustments can extend and split with independent parameters and continuous animation time', () => {
  const p = newProject();
  const a = makeClip('adjustment', { lane: 1, dur: 8, props: { vfx: [makeVideoEffect('glitch')] } });
  placeFree(p, a, 0, 1);
  setClipDuration(p, a.id, 12);
  assert.equal(a.dur, 12);
  const id = splitClip(p, a.id, 4);
  const right = p.clips[id];
  assert.equal(sourceTime(a, 4), sourceTime(right, 4));
  right.props.vfx[0].p.amount = 0.9;
  assert.equal(a.props.vfx[0].p.amount, 0.35);
  moveClip(p, a.id, { lane: 0, start: 0 });
  assert.equal(a.lane, 1, 'an adjustment cannot replace the storyline it processes');
});

test('adjustment drops share placement and accept effects, respecting locked tracks', () => {
  const p = newProject();
  p.range = { in: 2, out: 8 };
  const plan = frameEffectPlacement(p, 0);
  const drop = libraryDropTarget(p, { kind: 'adjustment', id: 'empty' }, 0, 0);
  assert.deepEqual([drop.a, drop.b, drop.lane], [plan.start, plan.start + plan.dur, plan.lane]);
  const a = makeClip('adjustment', { start: 2, dur: 6, lane: 1 });
  p.clips[a.id] = a;
  assert.equal(libraryDropTarget(p, { kind: 'effect', id: 'vhs' }, 1, 3).id, a.id);
  assert.equal(libraryDropTarget(p, { kind: 'effect', id: 'noise' }, 2, 3).kind, 'layer');
  assert.equal(libraryDropTarget(p, { kind: 'effect', id: 'noise' }, -1, 3), null);
  p.lanes[2] = { locked: true };
  assert.equal(libraryDropTarget(p, { kind: 'adjustment', id: 'empty' }, 2, 3), null);
});

test('effects, color and masks copy between footage and adjustment layers and survive saving', () => {
  const a = makeClip('image', { props: { exposure: 0.3, film: 'portra400', vfx: [makeVideoEffect('vhs')] } });
  addMask(a, 'ellipse', 1920, 1080);
  const b = makeClip('adjustment');
  pasteAttributes(a, b, ['effects', 'color', 'masks']);
  assert.equal(b.props.exposure, 0.3);
  assert.equal(b.props.vfx[0].type, 'vhs');
  assert.equal(b.props.masks.length, 1);
  b.props.vfx[0].p.noise = 0.8;
  assert.equal(a.props.vfx[0].p.noise, makeVideoEffect('vhs').p.noise);
  assert.deepEqual(JSON.parse(JSON.stringify(b)), b);
});

test('noise, glitch and VHS are deterministic at a time, animate and freeze at speed zero', () => {
  const w = 80, h = 40, input = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < input.length; i += 4) input.set([(i * 13) % 256, 127, (i * 7) % 256, i % 512 ? 128 : 0], i);
  for (const type of ['noise', 'glitch', 'vhs']) {
    const effect = makeVideoEffect(type);
    const render = (t) => stylizePixels(input, w, h, stylizeSettings(type, effect.p, t, w, h));
    const first = render(0.5);
    assert.deepEqual(render(0.5), first);
    assert.notDeepEqual(render(0.75), first);
    for (let i = 3; i < input.length; i += 4) assert.equal(first[i], input[i]);
    effect.p.speed = 0;
    assert.deepEqual(render(0.5), render(8));
  }
});

test('zero stylize amounts bypass and colored noise and scanline spacing change the picture', () => {
  const input = new Uint8ClampedArray(16 * 8 * 4).fill(128);
  for (const type of ['noise', 'glitch', 'rgbSplit', 'scanlines']) {
    const p = { ...makeVideoEffect(type).p, amount: 0 };
    assert.deepEqual(stylizePixels(input, 16, 8, stylizeSettings(type, p, 1, 16, 8)), input);
  }
  const p = makeVideoEffect('noise').p;
  assert.notDeepEqual(stylizePixels(input, 16, 8, stylizeSettings('noise', p, 1, 16, 8)), stylizePixels(input, 16, 8, stylizeSettings('noise', { ...p, colored: true }, 1, 16, 8)));
});


test('adjustment compatibility distinguishes source-only effects from composite effects', () => {
  const layer = makeClip('adjustment');
  assert.match(effectWarning(layer, 'shadow'), /Drop Shadow.*adjustment layers/);
  assert.match(effectWarning(layer, 'difference'), /Background reference key.*adjustment layers/);
  assert.match(effectWarning(layer, 'gain', 'afx'), /Audio effects/);
  for (const id of ['blur', 'border', 'radius', 'vignette', 'noise', 'glow', 'chroma', 'luma']) assert.equal(effectWarning(layer, id), null, id);
  for (const type of ['video', 'image', 'title', 'recording']) assert.equal(effectWarning(makeClip(type), 'shadow'), null);
});
