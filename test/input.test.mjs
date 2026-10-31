import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';

function setup() {
  let now = 1000;
  let point = { x: 0, y: 0 };
  let poll;
  const hook = new EventEmitter();
  hook.start = hook.stop = () => {};
  const display = { id: 1, bounds: { x: 0, y: 0, width: 3840, height: 2160 } };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../src/main/input.js', import.meta.url), 'utf8'), {
    module, console, process: { platform: 'darwin' }, Date: { now: () => now },
    setInterval: (fn, ms) => { poll = fn; assert.ok(ms <= 10); return 1; },
    clearInterval: () => { poll = null; },
    require: (name) => {
      if (name === 'uiohook-napi') return { uIOhook: hook, UiohookKey: { MetaRight: 42 } };
      if (name === 'electron') return {
        screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display, getCursorScreenPoint: () => point },
        systemPreferences: { isTrustedAccessibilityClient: () => true },
      };
      throw new Error(name);
    },
  });
  const tracker = new module.exports.InputTracker();
  const events = [];
  tracker.listener = (event) => events.push(event);
  tracker.start();
  tracker.startPolling();
  return {
    tracker, events, hook, display,
    advance: (ms) => { now += ms; },
    move: (x, y, native = true) => { point = { x, y }; if (native) hook.emit('mousemove'); },
    poll: () => poll?.(),
  };
}

test('Right Command follows native mouse movement without waiting for a polling tick', () => {
  const s = setup();
  s.hook.emit('keydown', { keycode: 42 });
  s.move(100, 200);
  assert.equal(s.events.at(-1).type, 'cursor');
  assert.equal(s.events.at(-1).x, 100 / 3840);
  // A single pixel on a wide display must not disappear in a movement threshold.
  s.move(101, 200);
  assert.equal(s.events.at(-1).x, 101 / 3840);
  const count = s.events.length;
  s.poll();
  assert.equal(s.events.length, count, 'polling must not repeat the same live position');
});

test('polling covers drags without native mouse events and follows the release animation', () => {
  const s = setup();
  s.tracker.setZoom(true);
  s.tracker.setZoom(false);
  s.advance(100);
  s.move(400, 300, false);
  s.poll();
  assert.equal(s.events.at(-1).type, 'cursor');
  assert.equal(s.events.at(-1).x, 400 / 3840);
  s.advance(101);
  const count = s.events.length;
  s.move(500, 300);
  assert.equal(s.events.length, count, 'stop sending positions once the cursor has shrunk');
});

test('fast input stays live while saved cursor data is bounded and retains the last position', () => {
  const s = setup();
  s.tracker.setZoom(true);
  s.tracker.beginSession(1000);
  for (let i = 1; i <= 100; i++) {
    s.advance(1);
    s.move(i, i);
  }
  assert.equal(s.events.filter((e) => e.type === 'cursor').length, 100);
  assert.ok(s.tracker.session.cursor.length <= 13, 'a 1000 Hz mouse must not flood the session');
  s.advance(10);
  s.poll();
  assert.equal(s.tracker.session.cursor.at(-1)[1], Math.round(100 / 3840 * 1e6) / 1e6);
});

test('live input keeps area coordinates on a display with a negative origin', () => {
  const s = setup();
  s.display.bounds.x = -3840;
  s.display.bounds.y = 200;
  s.tracker.area = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  s.tracker.setZoom(true);
  s.move(-1920, 1280);
  assert.equal(s.events.at(-1).x, 0.5);
  assert.equal(s.events.at(-1).y, 0.5);
});

test('stopped polling ignores global mouse events and stop removes the movement listener', () => {
  const s = setup();
  s.tracker.setZoom(true);
  s.tracker.stopPolling();
  const count = s.events.length;
  s.move(100, 200);
  assert.equal(s.events.length, count);
  s.tracker.stop();
  assert.equal(s.hook.listenerCount('mousemove'), 0);
});
