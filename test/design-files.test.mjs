import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { writeImage } = require('../src/main/design.js');
const bundle = (await build({ entryPoints: ['src/main/projects.js'], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['electron'] })).outputFiles[0].text;
function projects(dir) {
  const module = { exports: {} };
  vm.runInNewContext(bundle, { module, exports: module.exports, require: (name) => name === 'electron' ? { app: { getPath: () => dir }, shell: {} } : require(name), Buffer, process, setTimeout, clearTimeout, console });
  return module.exports;
}
async function temp(t) { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-design-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; }
test('image output creates directories and reserves unique names under concurrent exports', async (t) => {
  const dir = await temp(t), file = path.join(dir, 'Exports', 'Thumb.png');
  const paths = await Promise.all([1,2,3,4].map((n) => writeImage(file, new Uint8Array([n]))));
  assert.equal(new Set(paths).size, 4);
  assert.deepEqual(paths.map((p) => path.basename(p)).sort(), ['Thumb 2.png','Thumb 3.png','Thumb 4.png','Thumb.png']);
  assert.deepEqual((await Promise.all(paths.map((p) => fs.readFile(p)))).map((b) => b[0]).sort(), [1,2,3,4]);
});
test('project save writes relative design paths; moving and reopening resolves originals and cutouts', async (t) => {
  const dir = await temp(t), api = projects(dir);
  const created = await api.create(dir, 'Old Project');
  const paths = ['Assets/a.png', 'Frames/b.png', 'Cutouts/c.png'];
  const assets = {};
  for (const [i, rel] of paths.entries()) { const file = path.join(created.dir, 'Designs', rel); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'image'); assets[i] = { id: String(i), name: rel, path: file }; }
  const p = { name: 'Old Project', media: {}, designs: {}, designAssets: assets };
  await api.save(null, p, created.file, { history: false });
  const raw = JSON.parse(await fs.readFile(created.file, 'utf8'));
  assert.equal(raw.designAssets[0].rel, path.join('Designs','Assets','a.png'));
  const moved = path.join(dir, 'Moved'); await fs.rename(created.dir, moved);
  const loaded = await api.load(path.join(moved, path.basename(created.file)));
  for (const a of Object.values(loaded.designAssets)) { assert.ok(a.path.startsWith(moved)); assert.equal(a.missing, false); assert.equal(await fs.readFile(a.path, 'utf8'), 'image'); }
  const folders = await api.folders(dir, path.join(moved, 'Old Project.reccut')); assert.equal(folders.designs, path.join(moved,'Designs'));
});
test('old project files gain empty design fields and missing assets are marked from disk', async (t) => {
  const dir = await temp(t), api = projects(dir), file = path.join(dir,'Legacy.reccut');
  await fs.writeFile(file, JSON.stringify({ name: 'Legacy', media: {} }));
  const p = await api.load(file); assert.equal(Object.keys(p.designs).length, 0); assert.equal(Object.keys(p.designAssets).length, 0);
  p.designAssets.a = { path: path.join(dir,'missing.png'), missing: false }; await api.save(null,p,file, { history: false });
  assert.equal((await api.load(file)).designAssets.a.missing, true);
});
