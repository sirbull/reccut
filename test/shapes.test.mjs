import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClip, setKeyframe, valueAt } from '../src/shared/model.js';
import { addMask, maskKey, maskList, removeMask, setMaskShape, shapeAt } from '../src/shared/shapes.js';

test('punktene i en fri form glir mellom nøkkelbilder', () => {
  const c = makeClip('image', { start: 0, dur: 4 });
  const id = addMask(c, 'path', 1920, 1080);
  const key = maskKey(id, 'points');
  const a = [...c.props[key]];
  const b = a.map((v) => v * 2);
  setKeyframe(c, key, 0, a);
  setKeyframe(c, key, 2, b);
  const mid = valueAt(c, key, 1);
  assert.equal(mid.length, a.length);
  mid.forEach((v, i) => assert.ok(Math.abs(v - a[i] * 1.5) < 1e-9));
  assert.deepEqual(valueAt(c, key, 3), b);
});

test('formens geometri følger posisjon og rotasjon', () => {
  const c = makeClip('image', { start: 0, dur: 4 });
  const id = addMask(c, 'path', 1000, 1000);
  c.props[maskKey(id, 'points')] = [100, 0, 0, 100, -100, 0];
  c.props[maskKey(id, 'x')] = 50;
  c.props[maskKey(id, 'rotation')] = 90;
  const g = shapeAt(c, `mask.${id}.`, 'path', 0, 1000, 1000);
  assert.equal(g.cx, 550);
  // (100, 0) rotert 90 grader blir (0, 100) rundt midten.
  assert.ok(Math.abs(g.pts[0][0] - 550) < 1e-9 && Math.abs(g.pts[0][1] - 600) < 1e-9);
});

test('masker legges til, byttes til fri form og fjernes med nøkkelbilder', () => {
  const c = makeClip('video', { start: 0, dur: 4 });
  const id = addMask(c, 'ellipse', 1920, 1080);
  assert.equal(maskList(c).length, 1);
  setKeyframe(c, maskKey(id, 'x'), 1, 40);
  setMaskShape(c, id, 'path', 0, 1920, 1080);
  assert.equal(maskList(c)[0].shape, 'path');
  assert.equal(c.props[maskKey(id, 'points')].length, 16);
  removeMask(c, id);
  assert.equal(maskList(c).length, 0);
  assert.ok(!Object.keys(c.props).some((k) => k.startsWith('mask.')));
  assert.ok(!Object.keys(c.kf).some((k) => k.startsWith('mask.')));
});

import { mediaFiles, reduceProject } from '../src/shared/package.js';
import { newProject } from '../src/shared/model.js';

test('pakking fjerner det som er slått av og ikke brukt, uten å flytte redigeringen', () => {
  const p = newProject('Arkiv');
  const media = (id, extra = {}) => ({ id, name: id, kind: 'video', path: `/f/${id}.mp4`, duration: 10, streams: { main: { path: `/f/${id}.mp4`, hasVideo: true, hasAudio: true, proxy: `/cache/${id}.mp4` } }, ...extra });
  p.media = { a: media('a'), b: media('b'), unused: media('unused') };
  p.media.a.streams.ext = { path: '/f/ext.wav', hasAudio: true, syncedFrom: 'x', label: 'Recorder' };
  const c1 = makeClip('video', { media: p.media.a, start: 0, dur: 4 });
  const c2 = makeClip('video', { media: p.media.b, start: 4, dur: 3 });
  const c3 = makeClip('video', { media: p.media.a, start: 7, dur: 2 });
  c2.enabled = false;
  c1.props.audioOff = { ext: true };
  c3.props.audioOff = { ext: true };
  for (const c of [c1, c2, c3]) p.clips[c.id] = c;
  p.primary = [c1.id, c2.id, c3.id];
  const { project, removed } = reduceProject(p, { removeDisabled: true, removeUnused: true, removeOffAudio: true });
  assert.equal(project.clips[c2.id].type, 'gap');
  assert.equal(project.clips[c3.id].start, 7, 'ingenting flytter seg');
  assert.deepEqual(Object.keys(project.media).sort(), ['a']);
  assert.equal(project.media.a.streams.ext, undefined);
  assert.equal(removed.clips.length, 1);
  assert.deepEqual(removed.media.sort(), ['b', 'unused']);
  // Originalen er urørt.
  assert.ok(p.media.unused && p.clips[c2.id].type === 'video');
  const files = mediaFiles(project);
  assert.deepEqual(files[0].sources.map((s) => s.path), ['/f/a.mp4']);
});
