import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';

// Run the studio's real capture handler; only its UI and audio dependencies are fixtures.
const bundle = (await build({
  stdin: {
    contents: `${await fs.readFile('src/renderer/voiceover/Booth.jsx', 'utf8')}\nexport { onBoothKey };`,
    resolveDir: fileURLToPath(new URL('../src/renderer/voiceover/', import.meta.url)),
    loader: 'jsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'browser',
  jsx: 'automatic', jsxImportSource: 'preact',
  plugins: [{ name: 'studio-keyboard-fixture', setup(b) {
    b.onResolve({ filter: /.*/ }, ({ path }) => ['../keyboard.js', '../../shared/voiceover.js'].includes(path) ? undefined : { path, external: true });
  } }],
})).outputFiles[0].text;

function setup() {
  const calls = [];
  const booth = {
    boothOpen: { value: true }, needsRoomTone: { value: false },
    generating: { value: false },
    current: { value: { key: 'line' } }, personId: { value: 'p1' },
    vo: { value: { takes: [{ id: 'take', key: 'line', person: 'p1' }] } },
    goNextMissing: () => calls.push('nextMissing'),
    toggleStar: (take) => calls.push(`star:${take.id}`),
    busy: () => false, recordRoomTone: () => calls.push('record'),
  };
  const aiDialogOpen = { value: false };
  const document = { activeElement: { tagName: 'BODY' } };
  const module = { exports: {} };
  vm.runInNewContext(bundle, {
    module, exports: module.exports, window: { api: { platform: 'darwin' } }, document,
    require: (name) => {
      if (name === './booth.js') return booth;
      if (name === './AiVoice.jsx') return { aiDialogOpen };
      if (name === './VoTimeline.jsx') return {
        togglePreview: () => calls.push('play/stop'),
        toggleStudioTool: (id) => calls.push(id),
      };
      return {};
    },
  });
  function key(target = document.activeElement, patch = {}) {
    const event = {
      key: ' ', code: 'Space', target, repeat: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      ...patch,
    };
    module.exports.onBoothKey(event);
    return event;
  }
  return { booth, calls, aiDialogOpen, document, key };
}

test('Space controls studio playback from controls and scrollable panes, without their default actions', () => {
  for (const target of [
    { tagName: 'DIV' }, { tagName: 'BUTTON' }, { tagName: 'SELECT' },
    ...['range', 'checkbox', 'radio', 'number', 'color', 'button'].map((type) => ({ tagName: 'INPUT', type })),
    { tagName: 'INPUT', type: 'text', classList: { contains: (name) => name === 'num-field' } },
    { tagName: 'INPUT', type: 'text', readOnly: true },
  ]) {
    const { calls, document, key } = setup();
    document.activeElement = target;
    const event = key();
    assert.deepEqual(calls, ['play/stop']);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
});

test('Space stays available for script, search, names and editable text', () => {
  for (const target of [
    { tagName: 'TEXTAREA' }, { tagName: 'INPUT' },
    ...['text', 'search', 'password', 'email', 'url', 'tel'].map((type) => ({ tagName: 'INPUT', type })),
    { tagName: 'SPAN', isContentEditable: true },
    { tagName: 'DIV', closest: () => ({ role: 'textbox' }) },
  ]) {
    const { calls, document, key } = setup();
    document.activeElement = target;
    const event = key();
    assert.deepEqual(calls, []);
    assert.equal(event.defaultPrevented, undefined);
  }
});

test('focused text and text within composed event paths retain spaces even with a different target', () => {
  const { calls, document, key } = setup();
  document.activeElement = { tagName: 'TEXTAREA' };
  assert.equal(key({ tagName: 'BODY' }).defaultPrevented, undefined);
  document.activeElement = { tagName: 'BODY' };
  assert.equal(key(document.activeElement, {
    composedPath: () => [{ tagName: 'INPUT', type: 'search' }, document.activeElement],
  }).defaultPrevented, undefined);
  assert.deepEqual(calls, []);
});

test('Space only toggles once when held, and stays consumed while recording', () => {
  const { booth, calls, key } = setup();
  key();
  assert.equal(key(undefined, { repeat: true }).defaultPrevented, true);
  assert.deepEqual(calls, ['play/stop']);
  key();
  assert.deepEqual(calls, ['play/stop', 'play/stop']);
  booth.busy = () => true;
  assert.equal(key().defaultPrevented, true);
  assert.deepEqual(calls, ['play/stop', 'play/stop']);
});

test('Space still means playback in AI Voices and room tone setup; R starts room tone', () => {
  const { booth, aiDialogOpen, calls, key } = setup();
  aiDialogOpen.value = true;
  assert.equal(key().defaultPrevented, true);
  aiDialogOpen.value = false;
  booth.needsRoomTone.value = true;
  key();
  assert.deepEqual(calls, ['play/stop', 'play/stop']);
  key(undefined, { key: 'r', code: 'KeyR' });
  assert.equal(calls.at(-1), 'record');
});

test('a closed studio and IME composition do not trigger playback', () => {
  const { booth, calls, key } = setup();
  assert.equal(key(undefined, { isComposing: true }).defaultPrevented, undefined);
  booth.boothOpen.value = false;
  assert.equal(key().defaultPrevented, undefined);
  assert.deepEqual(calls, []);
});

test('N, S and Shift S use the same timeline tools as Edit without triggering the old actions', () => {
  const { calls, key } = setup();
  for (const patch of [
    { key: 'n', code: 'KeyN' }, { key: 's', code: 'KeyS' },
    { key: 'S', code: 'KeyS', shiftKey: true },
  ]) {
    const event = key(undefined, patch);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    key(undefined, { ...patch, repeat: true });
  }
  assert.deepEqual(calls, ['snapping', 'skimming', 'audioSkimming']);
});

test('Shift N goes to the next missing line and F stars the chosen take', () => {
  const { calls, key } = setup();
  key(undefined, { key: 'N', code: 'KeyN', shiftKey: true });
  key(undefined, { key: 'f', code: 'KeyF' });
  key(undefined, { key: 'f', code: 'KeyF', repeat: true });
  assert.deepEqual(calls, ['nextMissing', 'star:take']);
});

test('timeline shortcuts do not consume text entry, composition or modified system shortcuts', () => {
  for (const shortcut of [
    { key: 'n', code: 'KeyN' }, { key: 's', code: 'KeyS' },
    { key: 'S', code: 'KeyS', shiftKey: true },
    { key: 'N', code: 'KeyN', shiftKey: true }, { key: 'f', code: 'KeyF' },
  ]) {
    const { calls, document, key } = setup();
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }]) {
      assert.equal(key(undefined, { ...shortcut, ...modifier }).defaultPrevented, undefined);
    }
    document.activeElement = { tagName: 'TEXTAREA' };
    assert.equal(key(undefined, shortcut).defaultPrevented, undefined);
    assert.deepEqual(calls, []);
  }
});
