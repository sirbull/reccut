import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createRecordingShortcuts } = createRequire(import.meta.url)('../src/main/shortcuts.js');

function setup() {
  const state = { modifier: 'Control+Alt', focused: true, blocked: false, background: false, active: true, nativeInput: false, otherWindowFocused: false };
  const keys = new Map(), actions = [];
  const shortcuts = createRecordingShortcuts({
    globalShortcut: { unregisterAll: () => keys.clear(), register: (key, fn) => { keys.set(key, fn); return true; } },
    context: () => state, send: (a) => actions.push(a), toggleZoom: () => actions.push('zoom'),
  });
  shortcuts.refresh();
  return { state, keys, actions, shortcuts };
}

test('background apps retain their keys by default; global recording requires opt-in', () => {
  const { state, keys, actions, shortcuts } = setup();
  assert.equal(keys.size, 10);
  keys.get('Control+Alt+1')();
  assert.deepEqual(actions, [{ layout: 1, keyboard: true }]);
  const queued = keys.get('Control+Alt+0');
  state.focused = false;
  shortcuts.refresh();
  assert.equal(keys.size, 0);
  queued();
  assert.equal(actions.length, 1, 'late callbacks cannot act after blur');
  state.background = true;
  shortcuts.refresh();
  keys.get('Control+Alt+0')();
  assert.equal(actions.at(-1).toggleRecord, true);
});

test('inputs, composition and dialogs release native shortcuts; other app windows are isolated', () => {
  const { state, keys, actions, shortcuts } = setup();
  const queued = keys.get('Control+Alt+0');
  state.blocked = true;
  shortcuts.refresh();
  assert.equal(keys.size, 0);
  queued();
  assert.equal(actions.length, 0);
  state.background = true;
  state.focused = false;
  state.otherWindowFocused = true;
  shortcuts.refresh();
  assert.equal(keys.size, 0, 'Help and controls must never forward keyboard actions behind themselves');
  state.focused = true;
  state.otherWindowFocused = false;
  state.blocked = false;
  shortcuts.refresh();
  assert.equal(keys.size, 10);
});

test('inactive recorder keeps start/pause keys, suppresses layout keys and stale bindings', () => {
  const { state, keys, actions, shortcuts } = setup();
  const queued = keys.get('Control+Alt+1');
  state.active = false;
  shortcuts.refresh();
  assert.deepEqual([...keys.keys()], ['Control+Alt+0', 'Control+Alt+8']);
  queued();
  assert.equal(actions.length, 0);
  const oldModifier = keys.get('Control+Alt+0');
  state.modifier = 'Command+Alt';
  shortcuts.refresh(); oldModifier();
  assert.equal(actions.length, 0);
});
