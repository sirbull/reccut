import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { build } from 'esbuild';

// Exercise the actual store with a controlled IPC boundary and recorder state.
const root = path.resolve(import.meta.dirname, '..');
const bundle = await build({
  stdin: {
    contents: `export * from './src/renderer/editor/store.js'; export { newProject } from './src/shared/model.js';`,
    resolveDir: root, loader: 'js',
  },
  bundle: true, write: false, format: 'iife', globalName: 'projectStore', platform: 'browser',
  jsx: 'automatic', jsxImportSource: 'preact', loader: { '.svg': 'text' },
  plugins: [{ name: 'recorder-state', setup(builder) {
    builder.onResolve({ filter: /recorder\/engine\.js$/ }, () => ({ path: 'recorder', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
      export const recording = window.testEngine.recording;
      export const finishing = window.testEngine.finishing;
      export const countdown = window.testEngine.countdown;
    ` }));
  } }],
});

function fixture(t, overrides = {}) {
  const storage = new Map();
  const api = {
    onAnalyzed() {}, onTasks() {}, onFlush() {}, listTasks: async () => [],
    projectFolders: async (file) => ({ root: file.slice(0, file.lastIndexOf('/')), own: true }),
    saveProject: async (_p, file) => file, offlineMedia: async () => [],
    ...overrides,
  };
  const window = { api, addEventListener() {}, testEngine: { recording: { value: false }, finishing: { value: false }, countdown: { value: 0 } } };
  const timers = new Set();
  const context = vm.createContext({
    window, console: { ...console, error() {} }, queueMicrotask, performance,
    setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timers.add(timer); return timer; },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
  });
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  vm.runInContext(bundle.outputFiles[0].text, context);
  const store = context.projectStore;
  store.setProject(store.newProject('Original'), '/old/Original/Original.reccut');
  return { store, api, storage, window };
}

test('overlapping saves are serialized and the newest edit is saved last', async (t) => {
  const calls = [];
  let release;
  const { store } = fixture(t, { saveProject: async (p, file) => {
    calls.push(p.name);
    if (calls.length === 1) await new Promise((resolve) => { release = resolve; });
    return file;
  } });
  const first = store.saveNow();
  await Promise.resolve();
  store.commit((p) => { p.name = 'Newest'; });
  const second = store.saveNow();
  await Promise.resolve();
  assert.deepEqual(calls, ['Original']);
  release();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.deepEqual(calls, ['Original', 'Newest']);
  assert.equal(store.saveState.value, 'saved');
});

test('moving is aborted when the latest save fails', async (t) => {
  let moves = 0;
  const { store } = fixture(t, {
    saveProject: async () => { throw new Error('Read-only disk'); },
    moveProject: async () => { moves++; },
  });
  await assert.rejects(store.moveProject('/new'), /could not be saved/);
  assert.equal(moves, 0);
  assert.equal(store.projectPath.value, '/old/Original/Original.reccut');
  assert.equal(store.saveState.value, 'error');
  assert.equal(store.projectMoving.value, false);
});

test('moving waits for active saves, saves latest edits, then reloads the new path', async (t) => {
  const calls = [];
  const next = '/new/Original/Original.reccut';
  let release;
  let data;
  const { store, storage } = fixture(t, {
    saveProject: async (p, file) => {
      calls.push(`save ${p.name}`);
      if (calls.length === 1) await new Promise((resolve) => { release = resolve; });
      return file;
    },
    moveProject: async ({ project, file }) => {
      assert.equal(file, '/old/Original/Original.reccut');
      calls.push(`move ${project.name}`);
      data = structuredClone(project);
      return { file: next, project: data };
    },
    loadProject: async (file) => { assert.equal(file, next); calls.push('load'); return structuredClone(data); },
  });
  const first = store.saveNow();
  await Promise.resolve();
  store.commit((p) => { p.name = 'Latest'; });
  const moving = store.moveProject('/new');
  for (let n = 0; n < 20 && !store.projectMoving.value; n++) await Promise.resolve();
  assert.equal(store.projectMoving.value, true);
  assert.equal(await store.saveNow(), false, 'no writes to the source are allowed during the move');
  assert.deepEqual(calls, ['save Original']);
  release();
  await first;
  await moving;
  assert.deepEqual(calls, ['save Original', 'save Latest', 'move Latest', 'load']);
  assert.equal(store.projectPath.value, next);
  assert.equal(store.project.value.name, 'Latest');
  assert.equal(storage.get('lastProject'), next);
  assert.equal(store.projectFolders.value.root, '/new/Original');
  assert.equal(store.projectMoving.value, false);
});

test('a reload check failure keeps the newly moved data and paths safe for subsequent saves', async (t) => {
  const next = '/new/Original/Original.reccut';
  let latest;
  const { store, api } = fixture(t, {
    moveProject: async ({ project }) => ({ file: next, project: { ...structuredClone(project), name: 'Moved data' } }),
    loadProject: async () => { throw new Error('Media check unavailable'); },
  });
  const result = await store.moveProject('/new');
  assert.match(result.warning, /was moved and loaded/);
  assert.equal(store.project.value.name, 'Moved data');
  assert.equal(store.projectPath.value, next);
  api.saveProject = async (p, file) => { latest = { name: p.name, file }; return file; };
  await store.saveNow();
  assert.deepEqual(latest, { name: 'Moved data', file: next });
});

test('recordings and active background jobs prevent moving', async (t) => {
  const { store, window } = fixture(t);
  window.testEngine.finishing.value = true;
  await assert.rejects(store.moveProject('/new'), /Finish recording/);
  window.testEngine.finishing.value = false;
  store.tasks.value = [{ state: 'running' }];
  await assert.rejects(store.moveProject('/new'), /background tasks/);
});
