import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

// Kjør selve komponenten og pekehendelsene med synkrone hooks, uten nettleser.
const bundle = (await build({
  entryPoints: ['src/renderer/ui.jsx'], bundle: true, write: false,
  format: 'cjs', platform: 'browser', jsx: 'automatic', jsxImportSource: 'preact',
  external: ['preact/hooks', 'preact/jsx-runtime', 'lucide-preact'],
})).outputFiles[0].text;
const require = createRequire(import.meta.url);

function field(options = {}) {
  const slots = [];
  const effects = [];
  const captures = new Set();
  const changes = [];
  let cursor = 0;
  let starts = 0;
  let commits = 0;
  let node;
  const props = {
    value: 44, min: 8, max: 400, unit: 'pt',
    onStart: () => starts++, onCommit: () => commits++,
    onChange: (v) => { changes.push(v); props.value = v; render(); },
    ...options,
  };
  const hooks = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = value; render(); }];
    },
    useRef(initial) { return slots[cursor++] ||= { current: initial }; },
    useLayoutEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || deps.some((v, j) => v !== slots[i][j])) effects.push(fn);
      slots[i] = deps;
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports,
    require: (name) => name === 'preact/hooks' ? hooks : name === 'lucide-preact' ? {} : require(name),
  });
  function render() {
    cursor = 0;
    node = module.exports.NumberField(props);
    while (effects.length) effects.shift()();
  }
  render();
  const target = {
    setPointerCapture: (id) => captures.add(id),
    hasPointerCapture: (id) => captures.has(id),
    releasePointerCapture: (id) => captures.delete(id),
  };
  return {
    get node() { return node; }, get value() { return props.value; },
    get starts() { return starts; }, get commits() { return commits; }, changes, captures,
    event(handler, extra = {}) {
      node.props[handler]?.({ button: 0, pointerId: 1, clientX: 100, clientY: 100, currentTarget: target, preventDefault() {}, ...extra });
    },
  };
}

test('all shared number fields increase upwards and decrease downwards during a single undo gesture', () => {
  const f = field();
  f.event('onPointerDown');
  f.event('onPointerMove', { clientY: 80 });
  assert.equal(f.value, 54);
  f.event('onPointerMove', { clientY: 110 });
  assert.equal(f.value, 39);
  assert.equal(f.node.type, 'div', 'live rerenders must keep the drag control');
  assert.equal(f.starts, 1);
  f.event('onPointerUp');
  assert.equal(f.commits, 1);
  assert.equal(f.captures.size, 0);
  assert.equal(f.node.type, 'div', 'releasing a drag must not enter text editing');
});

test('horizontal dragging still works and the initial axis stays locked', () => {
  const f = field();
  f.event('onPointerDown');
  f.event('onPointerMove', { clientX: 120, clientY: 99 });
  assert.equal(f.value, 54);
  f.event('onPointerMove', { clientX: 90, clientY: 30 });
  assert.equal(f.value, 39, 'vertical drift does not reverse a horizontal drag');
  f.event('onPointerUp');
  const v = field();
  v.event('onPointerDown');
  v.event('onPointerMove', { clientY: 80 });
  v.event('onPointerMove', { clientX: 200, clientY: 90 });
  assert.equal(v.value, 49);
});

test('decimal steps, limits and fine/coarse modifiers work vertically', () => {
  const f = field({ value: 1, min: 0, max: 20, step: 0.5, precision: 1 });
  f.event('onPointerDown');
  f.event('onPointerMove', { clientY: 80 });
  assert.equal(f.value, 6);
  f.event('onPointerMove', { clientY: 80, altKey: true });
  assert.equal(f.value, 1.5);
  f.event('onPointerMove', { clientY: 80, shiftKey: true });
  assert.equal(f.value, 20);
  f.event('onPointerMove', { clientY: 140 });
  assert.equal(f.value, 0);
});

test('clicks and keyboard focus still open text editing, while tiny movements do not change values', () => {
  const f = field();
  f.event('onPointerDown');
  f.event('onFocus');
  assert.equal(f.node.type, 'div', 'pointer focus must not interrupt the drag');
  f.event('onPointerMove', { clientX: 101, clientY: 98 });
  f.event('onPointerUp');
  assert.equal(f.node.type, 'input');
  assert.equal(f.node.props.value, '44');
  assert.equal(f.starts, 0);
  assert.equal(f.commits, 0);
  const keyboard = field();
  keyboard.event('onFocus');
  assert.equal(keyboard.node.type, 'input');
});

test('cancelled gestures and lost capture commit once without opening text editing', () => {
  for (const end of ['onPointerCancel', 'onLostPointerCapture']) {
    for (const moved of [false, true]) {
      const f = field();
      f.event('onPointerDown');
      if (moved) f.event('onPointerMove', { clientY: 80 });
      f.event(end);
      f.event('onPointerUp');
      assert.equal(f.commits, moved ? 1 : 0);
      assert.equal(f.captures.size, 0);
      assert.equal(f.node.type, 'div');
    }
  }
});

test('disabled fields, secondary buttons and unrelated pointers cannot change the value', () => {
  for (const [options, down] of [[{ disabled: true }, {}], [{}, { button: 2 }]]) {
    const f = field(options);
    f.event('onPointerDown', down);
    f.event('onPointerMove', { clientY: 80 });
    f.event('onPointerUp');
    assert.equal(f.value, 44);
    assert.equal(f.starts, 0);
    assert.equal(f.node.type, 'div');
  }
  const f = field();
  f.event('onPointerDown');
  f.event('onPointerMove', { pointerId: 2, clientY: 80 });
  f.event('onPointerUp', { pointerId: 2 });
  assert.equal(f.value, 44);
  f.event('onPointerMove', { clientY: 80 });
  assert.equal(f.value, 54);
  f.event('onPointerUp');
  assert.equal(f.commits, 1);
});
