import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import * as signals from '@preact/signals';

const require = createRequire(import.meta.url);
const bundle = (await build({
  stdin: {
    contents: `${await fs.readFile('src/renderer/voiceover/VoTimeline.jsx', 'utf8')}\nexport { snapTime, snapAt, scrubDrag, moveDrag, drag, pauseDrag };`,
    resolveDir: fileURLToPath(new URL('../src/renderer/voiceover/', import.meta.url)), loader: 'jsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact',
  plugins: [{ name: 'studio-tools-fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path, importer }) => path.startsWith('../../shared/') || importer.replaceAll('\\', '/').includes('/src/shared/') ? undefined : { path, external: true });
  } }],
})).outputFiles[0].text;

function setup() {
  const { signal } = signals;
  const listeners = new Map();
  const calls = [];
  const hookState = [];
  const effects = [];
  let hookIndex = 0;
  let stops = 0;
  const useRef = (value) => {
    const i = hookIndex++;
    return hookState[i] ||= { current: value };
  };
  const useState = (value) => {
    const state = useRef(value);
    return [state.current, (next) => { state.current = next; }];
  };
  const useMemo = (fn, deps) => {
    const state = useRef(null);
    if (!state.current || deps.some((d, i) => d !== state.current.deps[i])) state.current = { value: fn(), deps };
    return state.current.value;
  };
  const useEffect = (fn, deps) => {
    const state = useRef(null);
    if (!state.current || deps.some((d, i) => d !== state.current[i])) effects.push(fn);
    state.current = deps;
  };
  const item = (id, at, dur) => ({ at, dur, in: 0, active: true, person: 'p1', take: { id, in: 0, out: dur, duration: 20 } });
  const plan = { items: [item('first', 2, 2), item('second', 6, 2)], end: 10, gaps: [] };
  const state = { snapping: signal(true), skimming: signal(true), audioSkimming: signal(true) };
  const prefs = signal({ playbackFromSkimmer: true });
  const pv = {
    time: signal(8.5), playing: signal(false),
    stopScrub: () => calls.push(['stopScrub']),
    scrub: (_, t) => calls.push(['scrub', t]),
    play: (_, t) => calls.push(['play', t]), stop() { stops++; pv.playing.value = false; },
    setFx() {}, setGain() {}, setClean() {}, load: async () => {},
  };
  const booth = {
    plan: signal(plan), people: signal([{ id: 'p1' }]), scriptId: signal('main'),
    vo: signal({ takes: plan.items.map((x) => x.take) }), current: signal(null), personId: signal('p1'),
    busy: () => false, opt: () => false, beginGesture() {}, endGesture() {},
    moveTake: (_, id, delta) => calls.push(['move', id, delta]),
    setTake: (id, patch) => calls.push(['trim', id, patch]),
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, structuredClone,
    window: {
      api: { platform: 'darwin' },
      addEventListener: (key, fn) => listeners.set(key, fn),
      removeEventListener: (key) => listeners.delete(key),
    },
    require: (name) => {
      if (name === '@preact/signals') return signals;
      if (name === 'preact/hooks') return { useRef, useState, useMemo, useEffect, useLayoutEffect: useEffect };
      if (name === './booth.js') return booth;
      if (name === './preview.js') return pv;
      if (name === '../editor/store.js') return state;
      if (name === '../prefs.js') return { prefs, setPrefs: (patch) => { prefs.value = { ...prefs.value, ...patch }; } };
      if (['preact', 'preact/jsx-runtime', 'lucide-preact'].includes(name)) return require(name);
      return {};
    },
  });
  const api = module.exports;
  const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  const render = () => { hookIndex = 0; return nodes(api.VoTimeline()); };
  const flushEffects = () => { for (const fn of effects.splice(0)) fn(); };
  const button = (label) => render().find((n) => n.props?.['aria-label'] === label);
  const hover = (t) => render().find((n) => n.props?.class === 'vt-scroll').props.onPointerMove({
    buttons: 0, target: { closest: () => false }, clientX: 100 + t * 59.2,
    currentTarget: { querySelector: () => ({ getBoundingClientRect: () => ({ left: 100 }) }) },
  });
  const event = (clientX = 0) => ({ clientX, button: 0, preventDefault() {}, stopPropagation() {} });
  return { api, state, prefs, pv, booth, plan, calls, listeners, render, button, hover, event, flushEffects, stops: () => stops };
}

test('the three Edit icons toggle the actual tools, persist their settings and disable audio skimming with skimming off', () => {
  const s = setup();
  for (const [label, icon] of [['Snapping', 'Magnet'], ['Skimming', 'StretchHorizontal'], ['Audio skimming', 'Headphones']]) {
    assert.equal(s.button(label).props.icon, require('lucide-preact')[icon]);
    assert.equal(s.button(label).props.active, true);
  }
  s.button('Snapping').props.onClick();
  assert.equal(s.state.snapping.value, false);
  assert.equal(s.prefs.value.snapping, false);
  s.button('Audio skimming').props.onClick();
  assert.equal(s.state.audioSkimming.value, false);
  assert.equal(s.prefs.value.audioSkimming, false);
  s.button('Skimming').props.onClick();
  assert.equal(s.button('Audio skimming').props.disabled, true);
  assert.equal(s.prefs.value.skimming, false);
});

test('keyboard and menu actions use the toolbar state and clear stale skimming immediately', () => {
  const s = setup();
  s.hover(3);
  assert.equal(s.api.toggleStudioTool('skimming'), true);
  assert.equal(s.state.skimming.value, false);
  assert.equal(s.button('Skimming').props.active, false);
  assert.equal(s.prefs.value.skimming, false);
  assert.equal(s.api.skimAt.value, null);
  assert.deepEqual(s.calls.at(-1), ['stopScrub']);
  assert.equal(s.api.studioMenu('skimming'), true);
  assert.equal(s.button('Skimming').props.active, true);
  assert.equal(s.api.studioMenu('audioSkimming'), true);
  assert.equal(s.state.audioSkimming.value, false);
  assert.equal(s.prefs.value.audioSkimming, false);
  assert.equal(s.api.studioMenu('snapping'), true);
  assert.equal(s.state.snapping.value, false);
  assert.equal(s.prefs.value.snapping, false);
  assert.equal(s.api.toggleStudioTool('unrelated'), false);
});

test('hover skimming snaps to clip edges, previews sound, and can run silently or be disabled', () => {
  const s = setup();
  s.hover(3.95);
  assert.equal(s.api.skimAt.value, 4);
  assert.ok(s.calls.some(([kind, t]) => kind === 'scrub' && t === 4));
  s.button('Audio skimming').props.onClick();
  s.calls.length = 0;
  s.hover(3.95);
  assert.equal(s.api.skimAt.value, 4);
  assert.equal(s.calls.length, 0);
  s.button('Snapping').props.onClick();
  s.hover(3.95);
  assert.ok(Math.abs(s.api.skimAt.value - 3.95) < 1e-6);
  s.button('Skimming').props.onClick();
  assert.equal(s.api.skimAt.value, null);
  s.calls.length = 0;
  s.hover(5);
  assert.equal(s.api.skimAt.value, null);
  assert.ok(!s.calls.some(([kind]) => kind === 'scrub'));
});

test('skimming stops on pointer leave and never interrupts playback or a recording', () => {
  const s = setup();
  s.hover(3);
  s.render().find((n) => n.props?.class === 'vt-scroll').props.onPointerLeave();
  assert.equal(s.api.skimAt.value, null);
  for (const mode of ['playing', 'recording']) {
    s.pv.playing.value = mode === 'playing';
    s.booth.busy = () => mode === 'recording';
    s.calls.length = 0;
    s.hover(3);
    assert.equal(s.api.skimAt.value, null);
    assert.ok(!s.calls.some(([kind]) => kind === 'scrub'));
  }
});

test('Space uses the skimmer only when enabled and respects playback-from-skimmer preferences', () => {
  const s = setup();
  s.api.skimAt.value = 3;
  s.api.togglePreview();
  assert.ok(s.calls.some(([kind, t]) => kind === 'play' && t === 3));
  s.pv.time.value = 7;
  s.api.skimAt.value = 1;
  s.state.skimming.value = false;
  s.api.togglePreview();
  assert.equal(s.calls.at(-1)[1], 7);
  s.state.skimming.value = true;
  s.prefs.value = { playbackFromSkimmer: false };
  s.api.skimAt.value = 1;
  s.api.togglePreview();
  assert.equal(s.calls.at(-1)[1], 7);
});

test('dragging the playhead snaps at any zoom and clears the guide on pointer cancellation', () => {
  const s = setup();
  for (const pps of [20, 100, 500]) {
    const lane = { getBoundingClientRect: () => ({ left: 0 }) };
    s.api.scrubDrag(s.event(4 * pps - 5), lane, pps);
    assert.equal(s.pv.time.value, 4);
    assert.equal(s.api.snapAt.value, 4);
    s.listeners.get('pointercancel')();
    assert.equal(s.api.snapAt.value, null);
    assert.equal(s.listeners.size, 0);
  }
  s.state.snapping.value = false;
  s.api.scrubDrag(s.event(395), { getBoundingClientRect: () => ({ left: 0 }) }, 100);
  assert.equal(s.pv.time.value, 3.95);
});

test('moving and trimming clips use snapping, and releasing a drag clears its guide', () => {
  const s = setup();
  s.api.moveDrag(s.event(), s.plan.items[1], 100);
  s.listeners.get('pointermove')(s.event(-195));
  assert.deepEqual(s.calls.at(-1), ['move', 'second', -2]);
  assert.equal(s.api.snapAt.value, 4);
  s.listeners.get('pointerup')();
  assert.equal(s.api.snapAt.value, null);
  s.api.drag(s.event(), s.plan.items[0].take, 'out', 100);
  s.listeners.get('pointermove')(s.event(195));
  assert.equal(s.calls.at(-1)[2].out, 4);
  assert.equal(s.api.snapAt.value, 6);
  s.listeners.get('pointerup')();
  s.state.snapping.value = false;
  s.api.moveDrag(s.event(), s.plan.items[1], 100);
  s.listeners.get('pointermove')(s.event(-195));
  assert.deepEqual(s.calls.at(-1), ['move', 'second', -1.95]);
});

test('muting through a plan update keeps playback and the playhead running; trimming still stops an outdated preview', () => {
  const s = setup();
  s.render();
  s.flushEffects();
  s.pv.playing.value = true;
  s.pv.time.value = 7;
  s.booth.people.value = [{ id: 'p1', muted: true }];
  s.booth.plan.value = { ...s.plan, items: s.plan.items.map((it) => ({ ...it, active: false })) };
  s.render();
  s.flushEffects();
  assert.equal(s.pv.playing.value, true);
  assert.equal(s.pv.time.value, 7);
  assert.equal(s.stops(), 0);
  s.booth.plan.value = { ...s.booth.plan.value, items: s.booth.plan.value.items.map((it) => ({ ...it, dur: it.dur - 0.5 })) };
  s.render();
  s.flushEffects();
  assert.equal(s.pv.playing.value, false);
  assert.equal(s.stops(), 1);
});
