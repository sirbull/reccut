import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const bundle = (await build({
  entryPoints: ['src/renderer/recorder/engine.js'], bundle: true, write: false, format: 'cjs', platform: 'browser',
  plugins: [{ name: 'project-folder-stub', setup(b) {
    b.onResolve({ filter: /editor\/store\.js$/ }, () => ({ path: 'project-folders', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const projectFolders = { value: null };' }));
  } }],
})).outputFiles[0].text;

function setup() {
  let now = 1000;
  let receive;
  let nextId = 0;
  const frames = new Map();
  const cursors = [];
  let videos = 0;
  let paints = 0;
  const ctx = new Proxy({
    globalAlpha: 1,
    fillRect: () => { paints++; },
    translate: (x, y) => cursors.push([x, y]),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  const api = new Proxy({ platform: 'darwin', onInput: (cb) => { receive = cb; } }, {
    get: (target, key) => target[key] ?? (() => {}),
  });
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, console,
    window: { api }, localStorage: { getItem: () => null },
    performance: { now: () => now },
    Blob, URL,
    Worker: class { postMessage() {} },
    AudioContext: class { createAnalyser() { return {}; } },
    requestAnimationFrame: (fn) => { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    document: {
      body: { appendChild() {} },
      createElement: () => ({
        style: {}, addEventListener() {},
        readyState: videos++ === 0 ? 4 : 0, videoWidth: 1920, videoHeight: 1080,
      }),
    },
  });
  const engine = module.exports;
  engine.attachCanvas({ getContext: () => ctx });
  engine.setActive(true);
  return {
    engine, cursors, frames, receive: (e) => receive(e), paints: () => paints,
    frame(ms = 16) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      for (const fn of pending) fn(now);
    },
  };
}

test('live cursor draws the latest input on the next display frame without waiting for the video timer', () => {
  const s = setup();
  s.receive({ type: 'zoom', on: true, x: 0.1, y: 0.2 });
  s.receive({ type: 'cursor', x: 0.3, y: 0.4 });
  s.receive({ type: 'cursor', x: 0.5, y: 0.6 });
  assert.equal(s.frames.size, 1, 'coalesce high-rate mouse events into one display frame');
  s.frame();
  assert.deepEqual(s.cursors.at(-1), [960, 648]);
  const paints = s.paints();
  s.frame();
  assert.ok(s.paints() > paints, 'continue the size animation when the mouse is stationary');
});

test('release animation keeps painting then stops, and leaving Record cancels pending input draws', () => {
  const s = setup();
  s.receive({ type: 'zoom', on: true, x: 0.1, y: 0.2 });
  s.frame(200);
  s.receive({ type: 'zoom', on: false, x: 0.2, y: 0.3 });
  s.receive({ type: 'cursor', x: 0.4, y: 0.5 });
  s.frame();
  assert.deepEqual(s.cursors.at(-1), [768, 540]);
  s.frame(200);
  assert.equal(s.frames.size, 0);
  s.receive({ type: 'zoom', on: true, x: 0.4, y: 0.5 });
  s.engine.setActive(false);
  assert.equal(s.frames.size, 0);
  s.receive({ type: 'cursor', x: 0.6, y: 0.7 });
  assert.equal(s.frames.size, 0, 'inactive recorder must not render from global input');
});
