import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import { signal } from '@preact/signals';
import { CAPTION_LANE, makeClip, newProject, updateDuration } from '../src/shared/model.js';
import { editGroupContents } from '../src/shared/ops.js';

const require = createRequire(import.meta.url);
const bundle = (await build({
  entryPoints: ['src/renderer/editor/Timeline.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact',
  plugins: [{ name: 'timeline-drag-fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path, importer, kind }) =>
      kind === 'entry-point' || path.startsWith('../../shared/') || importer.replaceAll('\\', '/').includes('/src/shared/') ? undefined : { path, external: true });
  } }],
})).outputFiles[0].text;

function setup(type, lane, grouped = false) {
  const p = newProject('Pointer rolling');
  p.media.source = { id: 'source', kind: type, duration: 30, streams: {} };
  const a = makeClip(type, { media: p.media.source, lane, start: 0, in: 4, dur: 5 });
  const b = makeClip(type, { media: p.media.source, lane, start: 5, in: 9, dur: 5 });
  if (grouped) a.group = b.group = 'group';
  p.clips[a.id] = a; p.clips[b.id] = b;
  if (lane === 0) p.primary = [a.id, b.id];
  updateDuration(p);
  let base, completed = 0;
  const store = {
    project: signal(p), selection: signal([]), tool: signal('trim'), pps: signal(40),
    editingGroup: signal(grouped ? 'group' : null), getTime: () => 0,
    mirror: {}, busyMedia: signal(new Map()),
    inEditingGroup: c => !grouped || c?.group === 'group', clipSelection: id => [id],
    beginTransient: () => { base = structuredClone(store.project.value); },
    updateClipEdit: (fn, ids = store.selection.value) => {
      const next = structuredClone(base);
      editGroupContents(next, store.editingGroup.value, ids, fn);
      store.project.value = next;
    },
    endTransient: keep => { if (keep) completed++; else store.project.value = base; },
  };
  for (const name of ['selectedTransition', 'selectedComponent', 'skim', 'waveVersion', 'timeSig', 'playing', 'snapping', 'skimming', 'audioSkimming']) store[name] = signal(name === 'timeSig' ? 0 : null);
  const hooks = [];
  const useRef = current => { const ref = { current }; hooks.push(ref); return ref; };
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, structuredClone, window: { addEventListener() {}, api: { platform: 'win32' } },
    require(name) {
      if (name === './store.js') return store;
      if (name === 'preact/hooks') return { useRef, useState: value => [value, () => {}], useMemo: fn => fn(), useEffect() {}, useLayoutEffect() {} };
      if (name === './playback.js') return { sourceProject: signal(null), seek() {} };
      if (name === './libraryDrag.js') return { libraryDrag: signal(null) };
      if (name === '../prefs.js') return { prefs: signal({}) };
      if (name.startsWith('preact') || name === '@preact/signals' || name === 'lucide-preact') return require(name);
      return {};
    },
  });
  const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
  const content = nodes(module.exports.Timeline()).find(n => n.props?.class === 'tl-content tool-trim');
  content.ref.current = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const event = (id, edge, x, kind = 'edge') => ({
    button: 0, pointerId: 1, clientX: x, clientY: 50, preventDefault() {},
    target: { closest: () => ({ dataset: { clip: id, hit: kind, edge } }) },
    currentTarget: { setPointerCapture() {} },
  });
  return { store, a, b, event, handlers: content.props, completed: () => completed };
}

test('the real Trim pointer handlers roll either side of a cut on V1, video, audio and captions tracks', () => {
  for (const [type, lane] of [['video', 0], ['video', 2], ['audio', -2], ['caption', CAPTION_LANE]]) {
    for (const edge of ['start', 'end']) {
      const s = setup(type, lane, lane !== 0);
      const id = edge === 'start' ? s.b.id : s.a.id;
      s.handlers.onPointerDown(s.event(id, edge, 216));
      s.handlers.onPointerMove(s.event(id, edge, 256));
      s.handlers.onPointerUp({ type: 'pointerup' });
      const a = s.store.project.value.clips[s.a.id], b = s.store.project.value.clips[s.b.id];
      assert.deepEqual([a.start, a.dur, b.start, b.dur], [0, 6, 6, 4], `${type}, ${edge}`);
      assert.equal(s.completed(), 1);
    }
  }
});

test('a free outer edge still trims one clip and cancelling a rolling drag restores both sides', () => {
  const s = setup('caption', CAPTION_LANE);
  s.handlers.onPointerDown(s.event(s.b.id, 'end', 416));
  s.handlers.onPointerMove(s.event(s.b.id, 'end', 456));
  s.handlers.onPointerUp({ type: 'pointerup' });
  assert.equal(s.store.project.value.clips[s.a.id].dur, 5);
  assert.equal(s.store.project.value.clips[s.b.id].dur, 6);
  s.handlers.onPointerDown(s.event(s.a.id, 'end', 216));
  s.handlers.onPointerMove(s.event(s.a.id, 'end', 256));
  s.handlers.onPointerUp({ type: 'pointercancel' });
  assert.equal(s.store.project.value.clips[s.a.id].dur, 5);
  assert.equal(s.store.project.value.clips[s.b.id].start, 5);
  assert.equal(s.store.project.value.clips[s.b.id].dur, 6);
});
