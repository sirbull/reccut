import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createRecordingShortcuts } = createRequire(import.meta.url)('../src/main/shortcuts.js');

function setup() {
  const state = { modifier: 'Control+Alt', focused: true, blocked: false, background: false, active: true, otherWindowFocused: false };
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
  assert.equal(keys.size, 12);
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

test('a running recording keeps all recording keys, including layouts, while Reccut is minimized', () => {
  const { state, keys, actions, shortcuts } = setup();
  state.focused = false; // Reccut minimizes when the recording starts.
  state.recording = true;
  shortcuts.refresh();
  assert.equal(keys.size, 12);
  keys.get('Control+Alt+9')();
  keys.get('Control+Alt+4')();
  const queued = keys.get('Control+Alt+0');
  queued();
  assert.deepEqual(actions, [{ togglePause: true, keyboard: true }, { layout: 4, keyboard: true }, { toggleRecord: true, keyboard: true }]);
  state.otherWindowFocused = true; // Clicking the control bar moves focus to it.
  shortcuts.refresh();
  assert.equal(keys.size, 12);
  state.focused = true;
  state.otherWindowFocused = false;
  state.blocked = true; // Typing in Reccut keeps its keys.
  shortcuts.refresh();
  assert.equal(keys.size, 0);
  state.focused = false;
  state.blocked = false;
  state.recording = false;
  shortcuts.refresh();
  assert.equal(keys.size, 0, 'other apps get the keys back when the recording ends');
  queued();
  assert.equal(actions.length, 3, 'late callbacks cannot act after the recording');
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
  assert.equal(keys.size, 12);
});

test('the recording keys belong to the Record room: other rooms get none and stale bindings do nothing', () => {
  const { state, keys, actions, shortcuts } = setup();
  const queued = [keys.get('Control+Alt+0'), keys.get('Control+Alt+1')];
  state.active = false;
  state.background = true;
  shortcuts.refresh();
  assert.equal(keys.size, 0);
  for (const run of queued) run();
  assert.equal(actions.length, 0);
  state.active = true;
  shortcuts.refresh();
  const oldModifier = keys.get('Control+Alt+0');
  state.modifier = 'Command+Alt';
  shortcuts.refresh(); oldModifier();
  assert.equal(actions.length, 0);
});

test('all eight layouts, pause and cursor zoom have distinct keys with every recording modifier', () => {
  const { state, keys, actions, shortcuts } = setup();
  for (const modifier of ['Control+Alt', 'Command+Alt', 'Command+Shift', 'Control+Shift']) {
    state.modifier = modifier;
    shortcuts.refresh();
    actions.length = 0;
    assert.equal(keys.size, 12);
    for (let n = 1; n <= 8; n++) keys.get(`${modifier}+${n}`)();
    keys.get(`${modifier}+9`)();
    keys.get(`${modifier}+M`)();
    keys.get(`${modifier}+0`)();
    assert.deepEqual(actions, [
      ...Array.from({ length: 8 }, (_, i) => ({ layout: i + 1, keyboard: true })),
      { togglePause: true, keyboard: true },
      'zoom',
      { toggleRecord: true, keyboard: true },
    ], modifier);
  }
});
