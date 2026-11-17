import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { createRequire } from 'node:module';

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-move-')));
const originalLoad = Module._load;
Module._load = (request, ...args) => request === 'electron'
  ? { app: { getPath: () => tmp }, shell: {} }
  : originalLoad(request, ...args);
const require = createRequire(import.meta.url);
const projects = require('../src/main/projects.js');
const history = require('../src/main/history.js');
Module._load = originalLoad;
test.after(() => fs.promises.rm(tmp, { recursive: true, force: true }));

async function fixture(t) {
  const root = await fs.promises.mkdtemp(path.join(tmp, 'case-'));
  const base = path.join(root, 'Reccut');
  const created = await projects.create(base, 'My project');
  const folders = await projects.folders(base, created.file);
  const internal = path.join(folders.media, 'shot.mov');
  const external = path.join(root, 'external.wav');
  const asset = path.join(folders.designs, 'image.png');
  for (const file of [internal, external, asset]) await fs.promises.writeFile(file, `contents of ${path.basename(file)}`);
  const project = {
    id: root, name: created.name, media: {
      video: { path: internal, streams: { main: { path: internal, thumbs: { files: [asset] } } } },
      audio: { path: external, streams: { main: { path: external } } },
    },
    designs: { design: { layers: [{ asset: 'image' }] } },
    designAssets: { image: { path: asset } }, clips: { cut: { start: 2, dur: 8, props: { opacity: 0.7 } } },
  };
  await projects.save(base, project, created.file);
  await projects.historySnapshot(created.file, 'initial');
  const dest = path.join(root, 'Destination');
  return { root, base, file: created.file, folders, project, internal, external, asset, dest };
}

test('new projects use the chosen parent folder, without overwriting a namesake', async (t) => {
  const f = await fixture(t);
  const created = await projects.create(f.dest, 'My project');
  const second = await projects.create(f.dest, 'My project');
  assert.equal(created.dir, path.join(f.dest, 'My project'));
  assert.equal(second.dir, path.join(f.dest, 'My project 2'));
  assert.ok(fs.existsSync(path.join(created.dir, 'Recordings')));
});

test('move saves latest edits, moves the entire folder and history, and preserves external links', async (t) => {
  const f = await fixture(t);
  f.project.clips.cut.props.opacity = 0.42;
  const recording = path.join(f.folders.recordings, 'Take');
  await fs.promises.mkdir(recording);
  await fs.promises.writeFile(path.join(recording, 'recording.json'), '{"screen":{"file":"screen.mov"}}');
  await fs.promises.writeFile(path.join(recording, 'screen.mov'), 'recorded video');
  f.project.media.recording = { path: recording, streams: { screen: { path: path.join(recording, 'screen.mov') } } };
  const moved = await projects.move(f.base, f.project, f.file, f.dest);
  const target = path.dirname(moved.file);
  assert.equal(target, path.join(f.dest, 'My project'));
  assert.equal(fs.existsSync(f.folders.root), false);
  const loaded = await projects.load(moved.file);
  assert.deepEqual(loaded.clips, f.project.clips);
  assert.equal(loaded.media.video.path, path.join(target, 'Media', 'shot.mov'));
  assert.equal(loaded.media.video.streams.main.path, loaded.media.video.path);
  assert.equal(loaded.media.video.streams.main.thumbs.files[0], path.join(target, 'Designs', 'image.png'));
  assert.equal(loaded.designAssets.image.path, path.join(target, 'Designs', 'image.png'));
  assert.equal(loaded.media.audio.path, f.external);
  assert.equal(path.resolve(target, loaded.media.audio.rel), f.external);
  assert.equal(await fs.promises.readFile(loaded.media.recording.streams.screen.path, 'utf8'), 'recorded video');
  const snapshots = await history.list(moved.file);
  assert.ok(snapshots.length >= 2);
  for (const item of snapshots) {
    const restored = await projects.historyLoad(item.file, moved.file);
    assert.equal(restored.media.video.path, loaded.media.video.path);
    assert.equal(restored.media.audio.path, f.external);
    assert.equal(path.resolve(target, restored.media.audio.rel), f.external);
    assert.equal(restored.designAssets.image.path, loaded.designAssets.image.path);
  }
  assert.equal(projects.lastSaved(), moved.file);
  const recent = JSON.parse(await fs.promises.readFile(path.join(tmp, 'recent-projects.json')));
  assert.equal(recent[0], moved.file);
  assert.ok(!recent.includes(f.file));
  assert.equal((await projects.list(f.base)).find((p) => p.path === moved.file).name, 'My project');
});

test('a collision leaves the saved source and destination intact', async (t) => {
  const f = await fixture(t);
  const target = path.join(f.dest, 'My project');
  await fs.promises.mkdir(target, { recursive: true });
  await fs.promises.writeFile(path.join(target, 'keep.txt'), 'keep');
  f.project.name = 'Latest edits';
  await assert.rejects(projects.move(f.base, f.project, f.file, f.dest), /already exists/);
  assert.equal((await projects.load(f.file)).name, 'Latest edits');
  assert.equal(await fs.promises.readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep');
});

test('a failed save aborts before copying anything', async (t) => {
  const f = await fixture(t);
  const before = await fs.promises.readFile(f.file, 'utf8');
  const rename = fs.promises.rename;
  fs.promises.rename = async (from, to) => {
    if (to === f.file) throw new Error('Save denied');
    return rename(from, to);
  };
  try { await assert.rejects(projects.move(f.base, { ...f.project, name: 'Unsaved' }, f.file, f.dest), /Save denied/); }
  finally { fs.promises.rename = rename; }
  assert.equal(await fs.promises.readFile(f.file, 'utf8'), before);
  assert.equal(fs.existsSync(f.dest), false);
});

test('a partial copy failure removes only the new copy and keeps the latest saved work', async (t) => {
  const f = await fixture(t);
  const cp = fs.promises.cp;
  fs.promises.cp = async (_source, destination) => {
    await fs.promises.writeFile(path.join(path.dirname(destination), 'partial'), 'partial');
    throw new Error('Disk full');
  };
  f.project.name = 'Saved before copying';
  try { await assert.rejects(projects.move(f.base, f.project, f.file, f.dest), /Disk full/); }
  finally { fs.promises.cp = cp; }
  assert.equal(fs.existsSync(path.join(f.dest, 'My project')), false);
  assert.equal((await projects.load(f.file)).name, 'Saved before copying');
  assert.ok(fs.existsSync(f.internal));
  assert.equal(await projects.move(f.base, f.project, f.file, path.dirname(f.folders.root)).then((r) => r.file), f.file);
});

test('the destination cannot be the source folder or one of its children, including through a symlink', async (t) => {
  const f = await fixture(t);
  await assert.rejects(projects.move(f.base, f.project, f.file, f.folders.root), /outside/);
  await assert.rejects(projects.move(f.base, f.project, f.file, path.join(f.folders.root, 'Nested')), /outside/);
  const alias = path.join(f.root, 'alias');
  await fs.promises.symlink(f.folders.media, alias, 'dir');
  await assert.rejects(projects.move(f.base, f.project, f.file, alias), /outside/);
  assert.ok(fs.existsSync(f.file));
});

test('moving from a symlinked parent updates paths that use that alias', async (t) => {
  const f = await fixture(t);
  const alias = path.join(f.root, 'Source alias');
  await fs.promises.symlink(f.base, alias, 'dir');
  const aliasedFile = path.join(alias, 'My project', path.basename(f.file));
  f.project.media.video.path = path.join(alias, 'My project', 'Media', 'shot.mov');
  const moved = await projects.move(f.base, f.project, aliasedFile, f.dest);
  assert.equal((await projects.load(moved.file)).media.video.path, path.join(f.dest, 'My project', 'Media', 'shot.mov'));
});

test('legacy projects move their own file and history while shared media and other projects stay put', async (t) => {
  const f = await fixture(t);
  const shared = path.join(f.base, 'Projects');
  await fs.promises.mkdir(shared);
  const file = path.join(shared, 'Legacy.obslite');
  const other = path.join(shared, 'Legacy 2.reccut');
  await projects.save(f.base, f.project, file);
  await projects.save(f.base, f.project, other);
  await projects.historySnapshot(file, 'initial');
  await projects.historySnapshot(other, 'initial');
  const otherHistory = await history.list(other);
  const moved = await projects.move(f.base, f.project, file, f.dest);
  assert.equal(moved.file, path.join(f.dest, 'Legacy', 'Legacy.obslite'));
  assert.equal(fs.existsSync(file), false);
  assert.ok(fs.existsSync(other));
  assert.ok(fs.existsSync(otherHistory[0].file));
  const loaded = await projects.load(moved.file);
  assert.equal(loaded.media.video.path, f.internal);
  assert.equal(path.resolve(path.dirname(moved.file), loaded.media.video.rel), f.internal);
  assert.equal((await projects.folders(f.base, moved.file)).own, true);
  assert.ok((await history.list(moved.file)).length);
});

test('a project folder inside the legacy Projects directory is still owned', async (t) => {
  const f = await fixture(t);
  const created = await projects.create(path.join(f.base, 'Projects'), 'Modern');
  await projects.save(f.base, f.project, created.file);
  assert.equal((await projects.folders(f.base, created.file)).own, true);
  const moved = await projects.move(f.base, f.project, created.file, f.dest);
  assert.equal(fs.existsSync(created.dir), false);
  assert.ok(fs.existsSync(moved.file));
});

test('a history rewrite failure leaves a saved, usable original', async (t) => {
  const f = await fixture(t);
  await fs.promises.writeFile(path.join(f.folders.root, 'Auto-Save', 'corrupt.reccut.gz'), 'broken');
  await assert.rejects(projects.move(f.base, f.project, f.file, f.dest));
  assert.ok(fs.existsSync(f.file));
  assert.ok(fs.existsSync(f.internal));
  assert.equal(fs.existsSync(path.join(f.dest, 'My project')), false);
});
