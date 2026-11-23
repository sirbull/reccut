// Quick Search (Ctrl Space, also Cmd/Ctrl K) must find everything: every command and menu item, every effect,
// and every option in Settings. These checks fail when something new is added without reaching it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMPONENTS, indexText } from '../scripts/build-settings-index.mjs';

const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const registry = read('src/renderer/registry.js');
const consoleSrc = read('src/renderer/help/console.js');
const settingsSrc = read('src/renderer/Settings.jsx');

test('Ctrl Space opens Quick Search', () => {
  assert.match(registry, /\{ id: 'findCommand', label: 'Quick Search',[^\n]*keys: 'Ctrl\+Space'/);
});

test('every command is in Quick Search, also those only in the menus', () => {
  const body = consoleSrc.slice(consoleSrc.indexOf('function itemsFor'), consoleSrc.indexOf('const norm'));
  assert.match(body, /for \(const c of COMMANDS\) \{\n\s+if \(c\.hidden\) continue;/);
  assert.doesNotMatch(body, /menuOnly\) continue/);
  // Copy, Paste, Undo and the other Edit commands run the real action, not only the text field shortcut.
  for (const id of ['copy', 'paste', 'cut', 'undo', 'redo', 'selectAll']) {
    const row = registry.split('\n').find((l) => l.includes(`{ id: '${id}',`));
    assert.ok(row && /run: /.test(row) && !/hidden: true/.test(row), `${id} must be a runnable command`);
  }
});

test('menu items that are not commands are in Quick Search and can be run', () => {
  assert.match(consoleSrc, /for \(const r of menuRoles\(\)\)/);
  const main = read('src/main/main.js');
  const actions = main.slice(main.indexOf("ipcMain.handle('menu:role'"), main.indexOf("ipcMain.handle('menu:set'"));
  const skip = new Set(['help', 'windowMenu', 'appMenu', 'editMenu']);
  const roles = [...new Set([...registry.matchAll(/role: '(\w+)'/g)].map((m) => m[1]))].filter((r) => !skip.has(r));
  assert.ok(roles.includes('quit') && roles.includes('about'));
  for (const r of roles) assert.match(actions, new RegExp(`\\b${r}: \\(\\) =>`), `menu:role must handle ${r}`);
});

test('every option in Settings is in Quick Search', () => {
  assert.equal(read('src/renderer/help/settingsIndex.json'), indexText(), 'settingsIndex.json is out of date: run npm run build');
  const index = JSON.parse(indexText());
  for (const label of ['Snapping', 'Loop playback', 'Provider', 'Allow AI apps to use Reccut', 'Tool servers (MCP)', 'Default location for new projects', 'Keyboard Settings'])
    assert.ok(index.some((s) => s.label === label), `${label} is missing`);
  assert.match(consoleSrc, /for \(const s of SETTINGS\)/);
});

test('every component shown in a Settings pane is read for the index', () => {
  const mapped = new Map(Object.values(COMPONENTS).flatMap((m) => Object.entries(m)));
  const panes = [...settingsSrc.matchAll(/current\.id === '(\w+)' && (.+)\}\n/g)];
  assert.ok(panes.length >= 8);
  for (const [, pane, jsx] of panes)
    for (const [, name] of jsx.matchAll(/<([A-Z]\w*)/g))
      // A pane that only shows another pane's component (Design and Plugins show the stock settings) is fine.
      assert.ok(mapped.has(name), `${name} in the ${pane} pane is not in COMPONENTS in scripts/build-settings-index.mjs`);
});
