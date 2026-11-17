import test from 'node:test';
import assert from 'node:assert/strict';
import { BLEND_MODES, clipBlendMode } from '../src/shared/blendModes.js';
import { makeClip, newProject, computeFrame } from '../src/shared/model.js';
import { splitClip } from '../src/shared/ops.js';
import { groupsWithContent, pasteAttributes, removeAttributes } from '../src/shared/attributes.js';

test('old projects and unsupported blend modes render as Normal', () => {
  const clip = makeClip('video');
  assert.equal(clipBlendMode(clip), 'source-over');
  delete clip.props.blendMode;
  assert.equal(clipBlendMode(clip), 'source-over');
  for (const mode of ['destination-out', 'invalid', null]) {
    clip.props.blendMode = mode;
    assert.equal(clipBlendMode(clip), 'source-over');
  }
  for (const type of ['video', 'image', 'recording', 'title']) {
    for (const blendMode of BLEND_MODES) assert.equal(clipBlendMode(makeClip(type, { props: { blendMode } })), blendMode);
  }
  assert.equal(clipBlendMode(makeClip('adjustment', { props: { blendMode: 'multiply' } })), 'source-over');
});

test('blend mode follows compositing when pasting and removing attributes', () => {
  const source = makeClip('video', { props: { blendMode: 'screen', opacity: 0.6 } });
  const target = makeClip('image');
  assert.ok(groupsWithContent(source).includes('compositing'));
  pasteAttributes(source, target, ['compositing']);
  assert.equal(target.props.blendMode, 'screen');
  assert.equal(target.props.opacity, 0.6);
  removeAttributes(target, ['compositing']);
  assert.equal(target.props.blendMode, 'source-over');
  assert.equal(target.props.opacity, 1);
  delete source.props.blendMode;
  target.props.blendMode = 'multiply';
  pasteAttributes(source, target, ['compositing']);
  assert.equal(clipBlendMode(target), 'source-over');
});

test('splits and save/load preserve blend mode and stacking order', () => {
  const p = newProject();
  const base = makeClip('image', { dur: 6 });
  const top = makeClip('video', { lane: 1, dur: 6, props: { blendMode: 'overlay' } });
  p.clips[base.id] = base; p.primary = [base.id]; p.clips[top.id] = top;
  const right = splitClip(p, top.id, 3);
  const restored = JSON.parse(JSON.stringify(p));
  assert.equal(restored.clips[top.id].props.blendMode, 'overlay');
  assert.equal(restored.clips[right].props.blendMode, 'overlay');
  assert.deepEqual(computeFrame(restored, 4).layers.map(l => l.clip.id), [base.id, right]);
});
