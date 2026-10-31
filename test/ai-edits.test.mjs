import test from 'node:test';
import assert from 'node:assert/strict';
import { aiContext, parseAIReply, validateAIActions, applyAIActions } from '../src/shared/aiEdits.js';
function project() {
  return {
    name: 'Test',
    media: { m: { name: 'actor.mp4', path: '/private/secret.mp4' } },
    clips: { a: { id: 'a', type: 'video', name: 'Actor', dur: 5, start: 0, in: 0, props: { volume: 1 }, kf: {} } },
  };
}
test('AI replies support plain text and structured proposals', () => {
  assert.deepEqual(parseAIReply('Hello'), { reply: 'Hello', actions: [] });
  assert.equal(parseAIReply('```json\n{"reply":"Hi", "actions":[]}\n```').reply, 'Hi');
});
test('AI action batches reject unsupported operations and invalid numbers atomically', () => {
  for (const action of [
    { type: 'deleteFile', clipId: 'a' },
    { type: 'setProperty', clipId: 'a', property: '__proto__', value: 0 },
    { type: 'setProperty', clipId: 'a', property: 'opacity', value: NaN },
    { type: 'setProperty', clipId: 'a', property: 'opacity', value: 2 },
    { type: 'addEffect', clipId: 'a', effect: 'shell' },
    { type: 'rename', clipId: 'missing', name: 'Bad' },
    { type: 'rename', clipId: '__proto__', name: 'Bad' },
  ]) {
    const p = project(),
      before = structuredClone(p);
    assert.throws(() => applyAIActions(p, [{ type: 'rename', clipId: 'a', name: 'New' }, action]));
    assert.deepEqual(p, before);
  }
});
test('AI changes apply only supported edits and effects can be stacked', () => {
  const p = project();
  applyAIActions(p, [
    { type: 'rename', clipId: 'a', name: 'Green screen' },
    { type: 'addEffect', clipId: 'a', effect: 'chroma' },
    { type: 'addEffect', clipId: 'a', effect: 'chroma' },
    { type: 'setProperty', clipId: 'a', property: 'opacity', value: 0.5 },
  ]);
  assert.equal(p.clips.a.props.vfx.length, 2);
  assert.equal(p.clips.a.name, 'Green screen');
  assert.equal(p.clips.a.props.opacity, 0.5);
});
test('AI cannot override keyed properties, apply video effects to audio or use overlong fades', () => {
  const p = project();
  p.clips.a.kf.opacity = [
    [0, 0],
    [2, 1],
  ];
  assert.throws(() => validateAIActions(p, [{ type: 'setProperty', clipId: 'a', property: 'opacity', value: 1 }]));
  assert.throws(() => validateAIActions(p, [{ type: 'setProperty', clipId: 'a', property: 'aFadeOut', value: 10 }]));
  p.clips.a.type = 'audio';
  assert.throws(() => validateAIActions(p, [{ type: 'addEffect', clipId: 'a', effect: 'chroma' }]));
});
test('AI context excludes filesystem paths, embedded clean plates and credentials', () => {
  const p = project();
  p.clips.a.mediaId = 'm';
  p.clips.a.props.vfx = [{ type: 'difference', p: { reference: { pixels: 'secret pixels' } } }];
  const context = aiContext(p, ['a'], 2),
    text = JSON.stringify(context);
  assert.ok(!text.includes('/private'));
  assert.ok(!text.includes('secret pixels'));
  assert.deepEqual(context.clips[0].effectTypes, ['difference']);
});

test('AI audio proposals use decibels and distinguish recording audio components', () => {
  const p = project();
  applyAIActions(p, [{ type: 'setProperty', clipId: 'a', property: 'volume', value: -6 }]);
  assert.equal(p.clips.a.props.volume, -6);
  assert.throws(() => applyAIActions(p, [{ type: 'setProperty', clipId: 'a', property: 'micVolume', value: -3 }]));
  p.clips.a.type = 'recording';
  applyAIActions(p, [
    { type: 'setProperty', clipId: 'a', property: 'micVolume', value: -3 },
    { type: 'setProperty', clipId: 'a', property: 'sysVolume', value: -12 },
  ]);
  assert.equal(p.clips.a.props.micVolume, -3);
  assert.equal(p.clips.a.props.sysVolume, -12);
});
