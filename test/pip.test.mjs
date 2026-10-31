import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pipRect } from '../src/shared/model.js';

// Test native vindustyring uten å starte Electron eller be om kameratilgang.
function setup() {
  const windows = [];
  let focused = false;
  let finishLoading;
  const display = { id: 7, bounds: { x: -1920, y: 120, width: 1920, height: 1080 } };
  class Window {
    constructor(options) {
      this.options = options;
      this.bounds = options;
      this.messages = [];
      this.visible = false;
      this.dead = false;
      this.moves = [];
      this.webContents = { on() {}, send: (...args) => this.messages.push(args) };
      windows.push(this);
    }
    setAlwaysOnTop(v) { this.onTop = v; }
    setVisibleOnAllWorkspaces(v) { this.allSpaces = v; }
    setIgnoreMouseEvents(v) { this.passThrough = v; }
    setContentProtection(v) { this.protected = v; }
    isDestroyed() { return this.dead; }
    getBounds() { return this.bounds; }
    setBounds(v) { this.bounds = v; this.moves.push(v); }
    isVisible() { return this.visible; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    destroy() { this.dead = true; }
    loadURL(url) { this.url = url; return new Promise((resolve) => { finishLoading = resolve; }); }
  }
  const require = createRequire(import.meta.url);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../src/main/pip.js', import.meta.url), 'utf8'), {
    module, console, __dirname: '/app/src/main',
    require: (name) => name === 'electron' ? { BrowserWindow: Window, screen: { getAllDisplays: () => [display] } } : require(name),
  });
  const preview = module.exports.createPipPreview({ getMainWindow: () => ({ isDestroyed: () => false, isFocused: () => focused }) });
  const frame = { displayId: 7, rect: { x: 0.6, y: 0.6, w: 0.3, h: 0.3 }, image: 'data:image/webp;base64,test' };
  return { ...module.exports, preview, windows, display, frame, focus: (v) => { focused = v; }, loaded: async () => { finishLoading(); await Promise.resolve(); } };
}

test('PiP følger opptakets hjørne, form og størrelse på en annen skjerm med Retina-skalering', () => {
  const { pipBounds, display } = setup();
  for (const layout of [3, 4, 5, 6]) for (const shape of ['rect', 'square', 'circle']) {
    const r = pipRect(layout, 6, 3840, 2160, 'medium', shape);
    const b = pipBounds(display.bounds, { rect: { x: r.x / 3840, y: r.y / 2160, w: r.w / 3840, h: r.h / 2160 } });
    assert.equal(b.x, Math.round(display.bounds.x + r.x / 2));
    assert.equal(b.y, Math.round(display.bounds.y + r.y / 2));
    assert.equal(b.width, Math.round(r.w / 2));
    assert.equal(b.height, Math.round(r.h / 2));
  }
});

test('PiP plasseres relativt til opptaksområdet og avviser ugyldige koordinater', () => {
  const { pipBounds, display, frame } = setup();
  const b = pipBounds(display.bounds, { ...frame, area: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } });
  assert.equal(b.x, -864);
  assert.equal(b.y, 714);
  assert.equal(b.width, 288);
  assert.equal(b.height, 162);
  for (const rect of [{ ...frame.rect, x: NaN }, { ...frame.rect, w: -1 }, { ...frame.rect, x: 2 }]) {
    assert.equal(pipBounds(display.bounds, { rect }), null);
  }
});

test('PiP lar klikk gå gjennom og åpnes uten fokus; bare nyeste bilde vises etter lasting', async () => {
  const s = setup();
  s.preview.update(s.frame);
  const latest = { ...s.frame, rect: { ...s.frame.rect, x: 0.1 }, image: 'data:image/webp;base64,new' };
  s.preview.update(latest);
  await s.loaded();
  const [w] = s.windows;
  assert.equal(w.options.focusable, false);
  assert.equal(w.passThrough, true);
  assert.equal(w.onTop, true);
  assert.equal(w.allSpaces, true);
  assert.equal(w.protected, true);
  assert.equal(w.visible, true);
  assert.equal(w.messages.length, 1);
  assert.equal(w.messages[0][1].image, latest.image);
  assert.equal(w.messages[0][1].rect.x, 192);
  assert.equal(w.bounds.x, -1920);
  s.focus(true);
  s.preview.update(s.frame);
  assert.equal(w.visible, false);
  s.preview.destroy();
  assert.equal(w.dead, true);
});

test('flytting bruker et fast vindu og fortsetter mellom kamerabilder', async () => {
  const s = setup();
  s.preview.update(s.frame);
  await s.loaded();
  const [w] = s.windows;
  const moves = w.moves.length;
  const motion = { from: s.frame.rect, to: { ...s.frame.rect, x: 0.1 }, start: 1000, duration: 320 };
  s.preview.update({ ...s.frame, image: null, motion });
  await Promise.resolve();
  assert.equal(w.moves.length, moves, 'kameraet flyttes inni vinduet');
  const payload = w.messages.at(-1)[1];
  assert.equal(payload.image, null, 'bevegelse trenger ikke et nytt komprimert bilde');
  assert.equal(payload.motion.from.x, 1152);
  assert.equal(payload.motion.to.x, 192);

  const html = decodeURIComponent(w.url.slice(w.url.indexOf(',') + 1));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const camera = { style: {} };
  let receive;
  let paint;
  let now = 1000;
  vm.runInNewContext(script, {
    document: { getElementById: () => camera },
    pip: { onFrame: (cb) => { receive = cb; } },
    performance: { timeOrigin: 0, now: () => now },
    requestAnimationFrame: (cb) => { paint = cb; return 1; },
    cancelAnimationFrame() {},
  });
  receive(w.messages[0][1]);
  receive(payload);
  const positions = [];
  for (now = 1000; now <= 1320; now += 16) {
    paint(now);
    positions.push(camera.style.transform);
  }
  assert.equal(new Set(positions).size, 21, 'mellombilder flytter kameraet uten nye IPC-bilder');
  assert.equal(camera.style.transform, 'translate3d(192px,648px,0)');
  assert.equal(camera.src, s.frame.image);
  // Et forsinket kamerabilde må ikke starte flyttingen på nytt.
  now = 1400;
  receive({ ...payload, image: 'data:image/webp;base64,next' });
  assert.equal(camera.style.transform, positions.at(-1));
  assert.equal(camera.src, 'data:image/webp;base64,next');
});

test('et forsinket PiP-vindu dukker ikke opp etter at forhåndsvisningen er slått av', async () => {
  const s = setup();
  s.preview.update(s.frame);
  s.preview.update(null);
  await s.loaded();
  assert.equal(s.windows[0].visible, false);
  assert.equal(s.windows[0].messages.length, 0);
  s.preview.update({ ...s.frame, displayId: 999 });
  assert.equal(s.windows[0].visible, false);
});
