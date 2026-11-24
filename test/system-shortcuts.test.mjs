import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { reservedFromPrefs, inputSourceCount, accelOf } = require('../src/main/systemShortcuts.js');
const CATALOG = require('../src/main/mcpCatalog.json');

const layout = (name) => ({ InputSourceKind: 'Keyboard Layout', 'KeyboardLayout Name': name, 'KeyboardLayout ID': 1 });
const two = { AppleEnabledInputSources: [layout('Norwegian'), layout('U.S.'), { InputSourceKind: 'Non Keyboard Input Method', 'Bundle ID': 'com.apple.CharacterPaletteIM' }] };
const one = { AppleEnabledInputSources: [layout('Norwegian'), { InputSourceKind: 'Non Keyboard Input Method', 'Bundle ID': 'com.apple.PressAndHold' }] };
const accels = (list) => list.map((r) => r.accel).sort();

test('macOS modifier masks become Reccut shortcuts', () => {
  assert.equal(accelOf([32, 49, 262144]), 'Ctrl+Space');
  assert.equal(accelOf([32, 49, 786432]), 'Ctrl+Alt+Space');
  assert.equal(accelOf([32, 49, 1048576]), 'Cmd+Space');
  assert.equal(accelOf([97, 0, 262144]), null, 'keys other than Space are not checked');
});

test('Control Space is reserved only with more than one keyboard language', () => {
  assert.equal(inputSourceCount(two), 2);
  assert.equal(inputSourceCount(one), 1);
  assert.deepEqual(accels(reservedFromPrefs({}, one)), ['Cmd+Alt+Space', 'Cmd+Space']);
  // A missing entry means the macOS default, which is on.
  assert.deepEqual(accels(reservedFromPrefs({}, two)), ['Cmd+Alt+Space', 'Cmd+Space', 'Ctrl+Alt+Space', 'Ctrl+Space']);
  const off = { AppleSymbolicHotKeys: { 60: { enabled: false }, 61: { enabled: false } } };
  assert.ok(!accels(reservedFromPrefs(off, two)).includes('Ctrl+Space'));
  // The user moved input switching to Option Space: then that is taken, and Control Space is free.
  const moved = { AppleSymbolicHotKeys: { 60: { enabled: true, value: { type: 'standard', parameters: [32, 49, 524288] } } } };
  const r = accels(reservedFromPrefs(moved, two));
  assert.ok(r.includes('Alt+Space') && !r.includes('Ctrl+Space'));
  // Unreadable preferences report nothing about input switching rather than guessing.
  assert.ok(!accels(reservedFromPrefs(null, null)).includes('Ctrl+Space'));
});

test('Reccut checks the macOS shortcuts at start and offers another key', () => {
  const app = fs.readFileSync('src/renderer/app.jsx', 'utf8');
  assert.match(app, /setTimeout\(checkSystemShortcuts/);
  assert.match(app, /<SystemShortcutsDialog \/>/);
  const settings = fs.readFileSync('src/renderer/Settings.jsx', 'utf8');
  assert.match(settings, /reservedFor\(accel\)/, 'recording a key macOS takes is refused');
  assert.match(fs.readFileSync('src/main/preload.js', 'utf8'), /systemReservedShortcuts: invoke\('shortcuts:systemReserved'\)/);
});

test('every link in the tool server catalog can be opened', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  const allow = new RegExp(main.match(/ipcMain\.handle\('shell:openExternal'[^]*?if \((\/.+?\/)\.test/)[1].slice(1, -1));
  for (const s of CATALOG.servers) for (const url of [s.homepage, s.secret?.helpUrl].filter(Boolean)) assert.match(url, allow, `${url} is blocked by shell:openExternal`);
  for (const url of ['https://docs.astral.sh/uv/', 'https://nodejs.org/']) assert.match(url, allow);
});
