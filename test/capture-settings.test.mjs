import test from 'node:test';
import assert from 'node:assert/strict';

let instance = 0;
async function withSettings(saved, check) {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  let stored = saved === undefined ? null : JSON.stringify(saved);
  const protection = [];
  globalThis.window = { api: { platform: 'darwin', hideFromCapture: (hidden) => protection.push(hidden) } };
  globalThis.localStorage = { getItem: () => stored, setItem: (_key, value) => { stored = value; } };
  try {
    const settings = await import(`../src/renderer/recorder/settings.js?capture-test=${++instance}`);
    await check(settings, protection, () => JSON.parse(stored));
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = previousStorage;
  }
}

test('new installations include Reccut in screenshots by default', () => withSettings(undefined, ({ settings }, protection) => {
  assert.equal(settings.value.hideFromCapture, false);
  assert.deepEqual(protection, [false]);
}));

test('existing hidden default is migrated once without losing other recording preferences', () => withSettings(
  { hideFromCapture: true, layout: 4, fps: 60, countdown: 5 },
  ({ settings }, protection, stored) => {
    assert.equal(settings.value.hideFromCapture, false);
    assert.equal(settings.value.layout, 4);
    assert.equal(settings.value.fps, 60);
    assert.equal(settings.value.countdown, 5);
    assert.deepEqual(protection, [false]);
    assert.equal(stored().captureVisibilityVersion, 1);
    assert.equal(stored().hideFromCapture, false);
  }
));

test('explicit hide choice after migration is preserved, and visibility changes apply immediately', () => withSettings(
  { hideFromCapture: true, captureVisibilityVersion: 1 },
  ({ settings, saveSettings }, protection, stored) => {
    assert.equal(settings.value.hideFromCapture, true);
    assert.deepEqual(protection, [true]);
    saveSettings({ hideFromCapture: false });
    assert.deepEqual(protection, [true, false]);
    assert.equal(stored().hideFromCapture, false);
    assert.equal(stored().captureVisibilityVersion, 1);
  }
));
