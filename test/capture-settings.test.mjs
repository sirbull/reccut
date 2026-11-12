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
  assert.equal(settings.value.backgroundShortcuts, true);
  assert.deepEqual(protection, [false]);
}));

test('existing background shortcut default is enabled once and later opt-outs survive restart', async () => {
  let nextLaunch;
  await withSettings({ backgroundShortcuts: false, captureVisibilityVersion: 1, layout: 4, modifier: 'Command+Alt' },
    ({ settings, saveSettings }, _protection, stored) => {
      assert.equal(settings.value.backgroundShortcuts, true);
      assert.equal(stored().backgroundShortcuts, true);
      assert.equal(stored().backgroundShortcutsVersion, 1);
      assert.equal(settings.value.layout, 4);
      assert.equal(settings.value.modifier, 'Command+Alt');
      saveSettings({ backgroundShortcuts: false });
      nextLaunch = stored();
    });
  await withSettings(nextLaunch, ({ settings }) => {
    assert.equal(settings.value.backgroundShortcuts, false);
  });
});

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

test('invalid recording formats default safely and new choices persist', () => withSettings(
  { videoFormat: 'invalid', audioFormat: 'invalid', captureVisibilityVersion: 1 },
  ({ settings, saveSettings }, _protection, stored) => {
    assert.equal(settings.value.videoFormat, 'mp4');
    assert.equal(settings.value.audioFormat, 'auto');
    saveSettings({ videoFormat: 'mkv', audioFormat: 'flac' });
    assert.equal(stored().videoFormat, 'mkv');
    assert.equal(stored().audioFormat, 'flac');
  }
));

test('saved audio-only format survives loading with a video container that cannot embed it', () => withSettings(
  { videoFormat: 'webm-vp9', audioFormat: 'pcm', captureVisibilityVersion: 1 },
  ({ settings }) => {
    assert.equal(settings.value.videoFormat, 'webm-vp9');
    assert.equal(settings.value.audioFormat, 'pcm');
  }
));

test('an unplugged device stands aside and comes back, but never interrupts a recording', () => withSettings(undefined, ({ pickDevice }) => {
  const builtIn = { id: 'built-in' }, camLink = { id: 'cam-link' };
  assert.deepEqual(pickDevice(null, null, [builtIn]), { id: 'built-in', wanted: '' }, 'first launch');
  const gone = pickDevice('cam-link', 'cam-link', [builtIn]);
  assert.deepEqual(gone, { id: 'built-in', wanted: 'cam-link' });
  assert.deepEqual(pickDevice(gone.id, gone.wanted, [builtIn, camLink]), { id: 'cam-link', wanted: 'cam-link' });
  assert.equal(pickDevice(gone.id, gone.wanted, [builtIn, camLink], true).id, 'built-in', 'busy');
  assert.deepEqual(pickDevice('cam-link', null, [builtIn]), { id: 'built-in', wanted: 'cam-link' }, 'choice saved by an older version');
  assert.equal(pickDevice('', '', [builtIn, camLink]).id, '', 'No camera stays off');
}));
