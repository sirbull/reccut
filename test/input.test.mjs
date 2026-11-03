import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/main/input.js', import.meta.url), 'utf8');

function setup() {
  let now = 1000;
  let point = { x: 0, y: 0 };
  let poll;
  const display = { id: 1, bounds: { x: 0, y: 0, width: 3840, height: 2160 } };
  const module = { exports: {} };
  const required = [];
  vm.runInNewContext(source, {
    module, console, process: { platform: 'darwin' }, Date: { now: () => now },
    setInterval: (fn, ms) => { poll = fn; assert.ok(ms <= 10); return 1; },
    clearInterval: () => { poll = null; },
    require: (name) => {
      required.push(name);
      if (name === 'electron') return {
        screen: { getAllDisplays: () => [display], getPrimaryDisplay: () => display, getCursorScreenPoint: () => point },
      };
      throw new Error(name);
    },
  });
  const tracker = new module.exports.InputTracker();
  const events = [];
  tracker.listener = (event) => events.push(event);
  tracker.startPolling();
  return {
    tracker, events, display, required,
    advance: (ms) => { now += ms; },
    move: (x, y) => { point = { x, y }; },
    poll: () => poll?.(),
  };
}

test('input tracking installs no global keyboard or mouse hook', () => {
  const s = setup();
  assert.deepEqual(s.required, ['electron']);
  assert.doesNotMatch(source, /uiohook|keydown|keyup|isTrustedAccessibilityClient/);
  assert.equal(s.tracker.endSession(), null);
});

test('zoomed cursor follows polled positions and stops after the release animation', () => {
  const s = setup();
  s.tracker.setZoom(true);
  s.move(100, 200);
  s.poll();
  assert.equal(s.events.at(-1).type, 'cursor');
  assert.equal(s.events.at(-1).x, 100 / 3840);
  const count = s.events.length;
  s.poll();
  assert.equal(s.events.length, count, 'polling must not repeat the same live position');
  s.tracker.setZoom(false);
  s.advance(100);
  s.move(400, 300);
  s.poll();
  assert.equal(s.events.at(-1).x, 400 / 3840);
  s.advance(101);
  const after = s.events.length;
  s.move(500, 300);
  s.poll();
  assert.equal(s.events.length, after, 'stop sending positions once the cursor has shrunk');
});

test('saved cursor data is bounded to 120 points per second', () => {
  const s = setup();
  s.tracker.beginSession(1000);
  for (let i = 1; i <= 100; i++) {
    s.advance(1);
    s.move(i, i);
    s.poll();
  }
  assert.ok(s.tracker.session.cursor.length <= 13);
  s.tracker.toggleZoom();
  s.advance(500);
  const out = s.tracker.endSession();
  assert.deepEqual(Object.keys(out).sort(), ['cursor', 'zooms']);
  assert.equal(out.zooms.length, 1);
  assert.equal(out.zooms[0][1], 0.6);
});

test('live input keeps area coordinates on a display with a negative origin', () => {
  const s = setup();
  s.display.bounds.x = -3840;
  s.display.bounds.y = 200;
  s.tracker.area = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  s.move(-1920, 1280);
  s.tracker.setZoom(true);
  assert.equal(s.events.at(-1).x, 0.5);
  assert.equal(s.events.at(-1).y, 0.5);
});

test('stop ends polling', () => {
  const s = setup();
  s.tracker.setZoom(true);
  s.tracker.stop();
  const count = s.events.length;
  s.move(100, 200);
  s.poll();
  assert.equal(s.events.length, count);
});
