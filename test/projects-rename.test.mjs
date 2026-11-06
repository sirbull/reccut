// Nytt navn på prosjektfilen: filen, Auto-Save-kopiene og listen over nylige prosjekter følger med.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-rename-'));
const load = Module._load;
Module._load = (r, ...a) => (r === 'electron' ? { app: { getPath: () => tmp }, shell: {} } : load(r, ...a));
const projects = createRequire(import.meta.url)('../src/main/projects.js');

test('rename project file', async () => {
  const dir = path.join(tmp, 'Test');
  const auto = path.join(dir, 'Auto-Save');
  fs.mkdirSync(auto, { recursive: true });
  const file = path.join(dir, 'Test.reccut');
  fs.writeFileSync(file, '{}');
  fs.writeFileSync(path.join(dir, 'Other.reccut'), '{}');
  fs.writeFileSync(path.join(auto, 'Test 2026-11-05 10.00.00.reccut.gz'), '');
  fs.writeFileSync(path.join(auto, 'Test 2 2026-11-05 10.00.00.reccut.gz'), '');
  await projects.touchRecent(file);

  const next = await projects.rename(file, 'New: name');
  assert.equal(next, path.join(dir, 'New_ name.reccut'));
  assert.ok(!fs.existsSync(file) && fs.existsSync(next));
  assert.deepEqual(fs.readdirSync(auto).sort(), ['New_ name 2026-11-05 10.00.00.reccut.gz', 'Test 2 2026-11-05 10.00.00.reccut.gz']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'recent-projects.json'))), [next]);
  await assert.rejects(projects.rename(next, 'Other'), /already exists/);
  assert.equal(await projects.rename(next, 'new_ NAME'), path.join(dir, 'new_ NAME.reccut'));
});
