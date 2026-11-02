import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle = (await build({ stdin: { contents: "export * as editor from './src/renderer/editor/store.js'; export * as design from './src/renderer/design/store.js';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'browser' })).outputFiles[0].text;
function setup() {
  const module = { exports: {} };
  vm.runInNewContext(bundle, { module, exports: module.exports, window: { addEventListener() {}, api: { onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [] } }, localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 }, setTimeout: () => 0, clearTimeout() {}, structuredClone });
  return module.exports;
}
test('design and Edit undo and redo preserve the other room in both directions', () => {
  const { editor: e, design: s } = setup();
  e.commit((p) => { p.name = 'Edited'; });
  const d = s.addDesign({ name: 'Design' }); s.addText();
  const designs = e.project.value.designs;
  e.undo(); assert.equal(e.project.value.name, 'Untitled Project'); assert.equal(e.project.value.designs, designs);
  e.redo(); assert.equal(e.project.value.name, 'Edited'); assert.equal(e.project.value.designs, designs);
  s.designUndo(); assert.equal(e.project.value.designs[d.id].layers.length, 0); assert.equal(e.project.value.name, 'Edited');
  s.designRedo(); assert.equal(e.project.value.designs[d.id].layers.length, 1); assert.equal(e.project.value.name, 'Edited');
  e.commit((p) => { p.name = 'Again'; }); s.designUndo(); e.undo();
  assert.equal(e.project.value.name, 'Edited'); assert.equal(e.project.value.designs[d.id].layers.length, 0);
});
test('design transients commit one undo step, cancel and do not clobber timeline changes', () => {
  const { editor: e, design: s } = setup(); const d = s.addDesign(); s.addText();
  const original = e.project.value.designs[d.id].layers[0].x;
  s.beginDesignTransient();
  for (const x of [1,2,3,40]) s.updateDesignTransient((p) => { p.designs[d.id].layers[0].x = x; });
  e.commit((p) => { p.name = 'Timeline'; });
  s.endDesignTransient(); s.designUndo(); assert.equal(e.project.value.designs[d.id].layers[0].x, original); assert.equal(e.project.value.name, 'Timeline');
  s.designRedo(); assert.equal(e.project.value.designs[d.id].layers[0].x, 40);
  s.beginDesignTransient(); s.updateDesignTransient((p) => { p.designs[d.id].layers[0].x = 90; }); s.endDesignTransient(false); assert.equal(e.project.value.designs[d.id].layers[0].x, 40);
});
test('opening any project, including the same project again, clears Design history and selection', () => {
  const { editor: e, design: s } = setup(); s.addDesign(); s.addText(); const p = e.project.value;
  assert.ok(s.canDesignUndo()); assert.ok(s.selection.value.length);
  e.setProject(structuredClone(p)); assert.equal(s.canDesignUndo(), false); assert.equal(s.canDesignRedo(), false); assert.equal(s.selection.value.length, 0); assert.equal(s.currentDesignId.value, null);
  e.setProject({ ...structuredClone(p), designs: undefined, designAssets: undefined }); assert.equal(Object.keys(e.project.value.designs).length, 0);
});
test('empty commits do not create history entries and locked layers cannot be changed or deleted', () => {
  const { editor: e, design: s } = setup(); const d = s.addDesign(); const l = s.addText();
  s.changeDesign((d) => { d.layers[0].locked = true; });
  s.moveSelection(10,10); s.deleteSelection(); assert.equal(e.project.value.designs[d.id].layers.length, 1); assert.equal(e.project.value.designs[d.id].layers[0].x, l.x);
  s.designUndo(); assert.equal(e.project.value.designs[d.id].layers[0].locked, false);
});

test('timeline hover and transient cancellation preserve Design changes made since their start', () => {
  const { editor: e, design: s } = setup();
  e.previewEdit((p) => { p.name = 'Preview'; }); const d = s.addDesign(); s.addText();
  e.endPreview(); assert.ok(e.project.value.designs[d.id]); assert.equal(e.project.value.name, 'Untitled Project');
  e.beginTransient(); e.updateTransient((p) => { p.name = 'Transient'; });
  s.changeDesign((d) => { d.name = 'Design survives'; });
  e.updateTransient((p) => { p.name = 'Transient again'; });
  assert.equal(e.project.value.designs[d.id].name, 'Design survives');
  e.endTransient(false); assert.equal(e.project.value.name, 'Untitled Project'); assert.equal(e.project.value.designs[d.id].name, 'Design survives');
});
