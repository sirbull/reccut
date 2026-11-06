import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = (await build({
  stdin: { contents: "export * as commands from './src/renderer/editor/commands.js'; export * as store from './src/renderer/editor/store.js'; export * as model from './src/shared/model.js'; export { SequenceFormatSettings } from './src/renderer/editor/SequenceFormatSettings.jsx';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact',
  plugins: [{ name: 'services', setup(b) {
    b.onResolve({ filter: /\/playback\.js$|\/player\.js$|\/ui\.jsx$|^preact\/hooks$/ }, ({ path }) => ({ path, external: true }));
  } }],
})).outputFiles[0].text;

function setup() {
  const module = { exports: {} };
  const states = [], cleanups = [];
  let slot = 0, mounted = false, display = { width: 3024, height: 1964 }, notify;
  const services = new Proxy({}, { get: () => () => {} });
  const hooks = {
    useState(initial) {
      const i = slot++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];
    },
    useEffect(fn) { if (!mounted) cleanups.push(fn()); },
  };
  vm.runInNewContext(bundle, {
    module, exports: module.exports,
    require: (path) => path === 'preact/hooks' ? hooks : services,
    window: { api: {
      platform: 'darwin', onTasks() {}, onFlush() {}, onAnalyzed() {}, listTasks: async () => [],
      currentDisplay: async () => display,
      onDisplaysChanged(fn) { notify = fn; return () => { notify = null; }; },
    }, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0, clearTimeout() {}, performance: { now: () => 0 }, structuredClone,
  });
  return {
    ...module.exports,
    render(settings) {
      slot = 0;
      const tree = module.exports.SequenceFormatSettings({ settings, onChange: (fn) => fn(settings) });
      mounted = true;
      // Format is the first Row; keep real Preact VNodes, without mounting a DOM.
      return tree.props.children[0].props.children.props;
    },
    async moveDisplay(next) { display = next; await notify(); },
    dispose() { for (const cleanup of cleanups) cleanup?.(); return notify; },
  };
}

test('New Sequence opens settings without changing the timeline or undo history; Cancel is inert', () => {
  const { commands: c, store: s, model: m } = setup();
  const before = s.project.value;
  c.newSequence();
  assert.equal(s.project.value, before);
  assert.equal(m.sequenceList(s.project.value).length, 1);
  assert.equal(s.canUndo(), false);
  assert.equal(s.sequenceSettingsOpen.value.create, true);
  s.sequenceSettingsOpen.value = null;
  assert.equal(s.project.value, before);
  assert.equal(s.canUndo(), false);
});

test('Create Sequence applies the name and format in one undo step, preserving the original', () => {
  const { commands: c, store: s, model: m } = setup();
  const before = s.project.value;
  const firstId = m.currentSequence(before).id;
  c.newSequence();
  const id = c.confirmNewSequence({ name: ' Portrait cut ', width: 1200, height: 1800, fps: 25, customFormat: true });
  assert.equal(s.sequenceSettingsOpen.value, null);
  assert.equal(m.currentSequence(s.project.value).id, id);
  assert.equal(m.currentSequence(s.project.value).name, 'Portrait cut');
  assert.deepEqual([s.project.value.width, s.project.value.height, s.project.value.fps], [1200, 1800, 25]);
  assert.equal(s.project.value.customFormat, true);
  assert.equal(s.project.value.autoFormat, false);
  assert.deepEqual(Object.keys(s.project.value.clips), []);
  assert.equal(s.project.value.sequences[firstId].width, before.width);
  assert.equal(s.project.value.sequences[firstId].fps, before.fps);
  s.undo();
  assert.equal(m.sequenceList(s.project.value).length, 1);
  assert.equal(s.project.value.width, before.width);
  assert.equal(s.canUndo(), false);
  s.redo();
  assert.equal(m.currentSequence(s.project.value).name, 'Portrait cut');
  assert.equal(s.project.value.fps, 25);
});

test('an old New Sequence dialog cannot create a sequence in a different project', () => {
  const { commands: c, store: s, model: m } = setup();
  c.newSequence();
  s.project.value = m.newProject('Other project');
  assert.throws(() => c.confirmNewSequence({ name: 'Old', width: 1920, height: 1080, fps: 30 }), /project changed/);
  assert.equal(m.sequenceList(s.project.value).length, 1);
});

test('Current Display uses pixel dimensions, updates on display changes and leaves chosen sizes fixed', async () => {
  const app = setup();
  const settings = { width: 1920, height: 1080, fps: 30, autoFormat: true, customFormat: true };
  app.render(settings);
  await Promise.resolve();
  let format = app.render(settings);
  assert.equal(format.options.find((o) => o.value === 'screen').label, 'Current Display (3024 × 1964)');
  format.onChange('screen');
  assert.deepEqual([settings.width, settings.height], [3024, 1964]);
  assert.equal(settings.autoFormat, false);
  assert.equal(settings.customFormat, undefined);
  assert.equal(app.render(settings).value, 'screen');

  await app.moveDisplay({ width: 3840, height: 2160 });
  format = app.render(settings);
  assert.equal(format.options.find((o) => o.value === 'screen').label, 'Current Display (3840 × 2160)');
  assert.deepEqual([settings.width, settings.height], [3024, 1964]);
  format.onChange('screen');
  assert.deepEqual([settings.width, settings.height], [3840, 2160]);
  assert.equal(app.render(settings).value, '3840x2160', 'standard formats remain selected when sizes match');
  app.render(settings).onChange('custom');
  assert.equal(app.render(settings).value, 'custom');
  assert.equal(app.dispose(), null, 'display listener is removed when settings close');
});
