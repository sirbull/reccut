import test from 'node:test';
import assert from 'node:assert/strict';
import { attachViewerNavigation, constrainView, zoomView } from '../src/renderer/editor/viewerNavigation.js';

const bounds = { width: 800, height: 600, contentWidth: 800, contentHeight: 450 };
const fit = { zoom: 1, x: 0, y: 0 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} should equal ${b}`);

test('pinch keeps the image point under the pointer fixed, including after panning', () => {
  const anchor = { x: 120, y: -50 };
  const initial = { zoom: 2, x: 30, y: 40 };
  const next = zoomView(initial, 1.4, anchor, bounds);
  near((anchor.x - next.x) / next.zoom, (anchor.x - initial.x) / initial.zoom);
  near((anchor.y - next.y) / next.zoom, (anchor.y - initial.y) / initial.zoom);
  const back = zoomView(next, 1 / 1.4, anchor, bounds);
  near(back.zoom, initial.zoom);
  near(back.x, initial.x);
  near(back.y, initial.y);
});

test('zoom limits are stable and returning to Fit recentres the image', () => {
  assert.deepEqual(zoomView({ zoom: 2, x: 90, y: -80 }, 0.01, { x: 200, y: 100 }, bounds), fit);
  const max = zoomView(fit, 100, { x: 0, y: 0 }, bounds);
  assert.equal(max.zoom, 16);
  assert.deepEqual(zoomView(max, 2, { x: 150, y: -90 }, bounds), max);
});

test('panning keeps the image in view and respects letterboxing and panel resizing', () => {
  assert.deepEqual(constrainView({ zoom: 2, x: 9999, y: -9999 }, bounds), { zoom: 2, x: 400, y: -150 });
  const view = { zoom: 1.2, x: 70, y: 100 };
  assert.deepEqual(constrainView(view, bounds), { zoom: 1.2, x: 70, y: 0 });
  assert.deepEqual(constrainView(view, { ...bounds, width: 1200, height: 900 }), { zoom: 1.2, x: 0, y: 0 });
});

function setup(t) {
  let observer;
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  t.after(() => {
    if (original) globalThis.ResizeObserver = original;
    else delete globalThis.ResizeObserver;
  });
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 800, clientHeight: 600,
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 800, height: 600 }),
  });
  const stage = { style: {}, children: [{ tagName: 'CANVAS', offsetLeft: 0, offsetWidth: 800, offsetHeight: 450 }] };
  let zoom = 1;
  const navigation = attachViewerNavigation(viewport, stage, (value) => { zoom = value; });
  t.after(() => navigation.dispose());
  const wheel = (props) => {
    const event = Object.assign(new Event('wheel', { cancelable: true }), { deltaX: 0, deltaY: 0, deltaMode: 0, clientX: 500, clientY: 350, ...props });
    viewport.dispatchEvent(event);
    return event;
  };
  return { viewport, stage, navigation, wheel, observer, get zoom() { return zoom; } };
}

test('actual wheel handler consumes pinch, pans on both axes and resets', (t) => {
  const f = setup(t);
  assert.equal(f.wheel({ ctrlKey: true, deltaY: -40 }).defaultPrevented, true);
  near(f.zoom, Math.exp(0.5));
  assert.equal(f.wheel({ deltaX: 30, deltaY: 25 }).defaultPrevented, true);
  assert.equal(f.stage.style.transform, `translate(-30px, -25px) scale(${f.zoom})`);
  f.navigation.reset();
  assert.equal(f.zoom, 1);
  assert.equal(f.stage.style.transform, 'translate(0px, 0px) scale(1)');
  f.wheel({ deltaX: 30, deltaY: 25 });
  assert.equal(f.stage.style.transform, 'translate(0px, 0px) scale(1)');
});

test('mouse wheel units, Cmd zoom and Shift horizontal scrolling work', (t) => {
  const f = setup(t);
  f.wheel({ metaKey: true, deltaY: -2.5, deltaMode: 1 });
  near(f.zoom, Math.exp(0.5));
  f.wheel({ deltaX: 2, deltaMode: 1 });
  f.wheel({ shiftKey: true, deltaY: 10 });
  assert.equal(f.stage.style.transform, `translate(-42px, 0px) scale(${f.zoom})`);
  f.wheel({ deltaY: 1, deltaMode: 2 });
  const limit = (450 * f.zoom - 600) / 2;
  assert.equal(f.stage.style.transform, `translate(-42px, ${-limit}px) scale(${f.zoom})`);
});

test('resize reclamps the view and disposal removes gesture handling', (t) => {
  const f = setup(t);
  f.wheel({ ctrlKey: true, deltaY: -40 });
  f.wheel({ deltaX: 100, deltaY: 50 });
  f.viewport.clientWidth = 1600;
  f.viewport.clientHeight = 1000;
  f.observer.callback();
  assert.equal(f.stage.style.transform, `translate(0px, 0px) scale(${f.zoom})`);
  f.navigation.dispose();
  assert.equal(f.observer.disconnected, true);
  assert.equal(f.wheel({ ctrlKey: true, deltaY: -40 }).defaultPrevented, false);
});
