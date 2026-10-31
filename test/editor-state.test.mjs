import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = (await build({
  entryPoints: ['src/renderer/editor/store.js'], bundle: true, write: false,
  format: 'cjs', platform: 'browser',
})).outputFiles[0].text;

function setup() {
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports,
    window: { addEventListener() {}, api: { onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [] } },
    localStorage: { getItem: () => null, setItem() {} },
    performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {},
  });
  const store = module.exports;
  const caption = store.makeCaptionClip(2, 'Original');
  store.commit(p => { p.clips[caption.id] = caption; });
  return { store, id: caption.id };
}

test('caption text updates live, commits as one edit and supports undo/redo', () => {
  const { store: s, id } = setup();
  s.beginTransient();
  // Assignment callbacks are used by the real caption and number fields.
  s.updateTransient(p => p.clips[id].props.text = 'I');
  s.updateTransient(p => p.clips[id].props.text = 'I hear this');
  assert.equal(s.project.value.clips[id].props.text, 'I hear this');
  s.endTransient(true);
  s.undo();
  assert.equal(s.project.value.clips[id].props.text, 'Original');
  s.redo();
  assert.equal(s.project.value.clips[id].props.text, 'I hear this');
});

test('caption time changes update duration live and can be cancelled', () => {
  const { store: s, id } = setup();
  s.beginTransient();
  s.updateTransient(p => p.clips[id].start = 10);
  assert.equal(s.project.value.duration, 13);
  s.updateTransient(p => p.clips[id].dur = 6);
  assert.equal(s.project.value.duration, 8, 'each preview is based on the edit start');
  s.endTransient(false);
  assert.equal(s.project.value.clips[id].start, 2);
  assert.equal(s.project.value.clips[id].dur, 3);
  assert.equal(s.project.value.duration, 5);
});
