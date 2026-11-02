import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const { createSplashWindow } = createRequire(import.meta.url)('../src/main/splash.js');

function setup() {
  let window;
  class Window extends EventEmitter {
    constructor(options) {
      super();
      window = this;
      this.options = options;
      this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.send = (...args) => this.messages.push(args);
      this.webContents.setWindowOpenHandler = () => {};
    }
    setMenuBarVisibility() {}
    loadURL(url) { this.html = decodeURIComponent(url.slice(url.indexOf(',') + 1)); return Promise.resolve(); }
    isDestroyed() { return Boolean(this.destroyed); }
    show() { this.visible = true; }
    destroy() { this.destroyed = true; }
  }
  const splash = createSplashWindow({ BrowserWindow: Window, version: '1.2.3' });
  return { splash, window };
}

test('splash waits for its first frame and retains the latest status while loading', async () => {
  const { splash, window } = setup();
  assert.equal(window.options.show, false);
  assert.equal(window.options.webPreferences.sandbox, true);
  splash.setStatus('Loading workspace…');
  splash.setStatus('Restoring project…');
  assert.equal(window.messages.length, 0);
  window.webContents.emit('did-finish-load');
  assert.deepEqual(window.messages, [['startup:status', 'Restoring project…']]);
  window.emit('ready-to-show');
  await splash.ready;
  assert.equal(window.visible, true);
  splash.setStatus('Checking unfinished recordings…');
  assert.equal(window.messages.at(-1)[1], 'Checking unfinished recordings…');
  splash.destroy();
  splash.destroy();
  const count = window.messages.length;
  splash.setStatus('Done');
  assert.equal(window.messages.length, count);
});

test('splash failure rejects readiness so startup can continue without it', async () => {
  const { splash, window } = setup();
  const failed = assert.rejects(splash.ready, /Splash: Failed \(-2\)/);
  window.webContents.emit('did-fail-load', {}, -2, 'Failed');
  await failed;
  splash.destroy();
  assert.equal(window.isDestroyed(), true);
});

test('splash stays for three seconds from its first frame, including loading time', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { splash, window } = setup();
  t.mock.timers.tick(500); // Creating the window is not part of its visible duration.
  window.emit('ready-to-show');
  await splash.ready;
  t.mock.timers.tick(1000);
  let dismissed = false;
  const done = splash.waitForDismissal().then(() => { dismissed = true; });
  t.mock.timers.tick(1999);
  await Promise.resolve();
  assert.equal(dismissed, false);
  t.mock.timers.tick(1);
  await done;
  assert.equal(dismissed, true);
  splash.destroy();
});

test('outside clicks skip the delay only after the workspace has finished loading', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { splash, window } = setup();
  window.emit('ready-to-show');
  await splash.ready;
  window.emit('blur'); // Still loading: this must not pre-dismiss the splash.
  t.mock.timers.tick(500);
  let dismissed = false;
  const done = splash.waitForDismissal().then(() => { dismissed = true; });
  await Promise.resolve();
  assert.equal(dismissed, false);
  window.emit('blur');
  await done;
  assert.equal(dismissed, true);
  splash.destroy();
});

test('loading longer than three seconds adds no further delay', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { splash, window } = setup();
  window.emit('ready-to-show');
  await splash.ready;
  t.mock.timers.tick(4200);
  await splash.waitForDismissal();
  splash.destroy();
});
