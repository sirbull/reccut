import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mediaSourcePaths } = require('../src/shared/mediaSources.cjs');
const { trashMedia } = require('../src/main/mediaTrash.js');

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-media-trash-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = (name) => {
    const target = path.join(dir, name);
    fs.writeFileSync(target, name);
    return target;
  };
  const calls = [];
  const recycle = async (target) => {
    calls.push(target);
    await fs.promises.rename(target, path.join(bin, `${calls.length}-${path.basename(target)}`));
  };
  return { dir, file, recycle, calls };
}

const media = (id, file) => ({ id, name: `${id}.mp4`, kind: 'video', path: file, streams: { main: { path: file } } });

test('disk deletion recycles only the source and deduplicates shared file paths', async (t) => {
  const { file, recycle, calls } = setup(t);
  const source = file('source.mp4'), proxy = file('proxy.mp4'), external = file('external.wav');
  const first = media('a', source);
  first.streams.main.proxy = proxy;
  first.streams.sync = { path: external, syncedFrom: 'audio' };
  const result = await trashMedia([first, media('b', source)], recycle);
  assert.deepEqual(result.removedIds, ['a', 'b']);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(calls, [source]);
  assert.equal(fs.existsSync(source), false);
  assert.ok(fs.existsSync(proxy));
  assert.ok(fs.existsSync(external));
});

test('a batch failure reports only successfully recycled media as removed', async (t) => {
  const { file, recycle } = setup(t);
  const a = file('a.mp4'), b = file('b.mp4');
  const result = await trashMedia([media('a', a), media('b', b)], async (target) => {
    if (target === b) throw new Error('File is in use');
    await recycle(target);
  });
  assert.deepEqual(result.removedIds, ['a']);
  assert.equal(result.failed[0].mediaId, 'b');
  assert.equal(result.failed[0].errors[0].error, 'File is in use');
  assert.equal(fs.existsSync(a), false);
  assert.ok(fs.existsSync(b));
});

test('loose recordings support partial failure and retry without deleting synchronized external audio', async (t) => {
  const { file, recycle, calls } = setup(t);
  const screen = file('screen.mp4'), camera = file('camera.mp4'), external = file('external.wav');
  const recording = { id: 'r', name: 'Recording', kind: 'recording', loose: true, path: screen,
    streams: { screen: { path: screen }, camera: { path: camera }, sync: { path: external, syncedFrom: 'other' } } };
  const partial = await trashMedia([recording], async (target) => {
    if (target === camera) throw new Error('File is in use');
    await recycle(target);
  });
  assert.deepEqual(partial.removedIds, []);
  assert.equal(partial.failed[0].mediaId, 'r');
  assert.equal(fs.existsSync(screen), false);
  const retry = await trashMedia([recording], recycle);
  assert.deepEqual(retry.removedIds, ['r']);
  assert.deepEqual(retry.failed, []);
  assert.deepEqual(calls, [screen, camera]);
  assert.ok(fs.existsSync(external));
});

test('a verified recording folder and its separately selected contents are recycled once', async (t) => {
  const { dir, recycle, calls } = setup(t);
  const folder = path.join(dir, 'recording');
  fs.mkdirSync(folder);
  const screen = path.join(folder, 'screen.mp4');
  fs.writeFileSync(screen, 'video');
  fs.writeFileSync(path.join(folder, 'recording.json'), JSON.stringify({ screen: { file: 'screen.mp4' } }));
  const recording = { id: 'r', name: 'Recording', kind: 'recording', path: folder };
  const result = await trashMedia([recording, media('screen', screen)], recycle);
  assert.deepEqual(result.removedIds, ['r', 'screen']);
  assert.deepEqual(calls, [folder]);
  assert.equal(fs.existsSync(folder), false);
});

test('ordinary folders, invalid recording folders and drive roots are never recycled', async (t) => {
  const { dir, recycle, calls } = setup(t);
  const folder = path.join(dir, 'ordinary');
  fs.mkdirSync(folder);
  for (const item of [media('folder', folder), { ...media('recording', folder), kind: 'recording' }, media('root', path.parse(dir).root)]) {
    const result = await trashMedia([item], recycle);
    assert.deepEqual(result.removedIds, []);
    assert.equal(result.failed.length, 1);
  }
  assert.deepEqual(calls, []);
  assert.ok(fs.existsSync(folder));
});

test('already missing sources can be removed from the project and relative paths are rejected', async (t) => {
  const { dir, recycle, calls } = setup(t);
  const result = await trashMedia([media('missing', path.join(dir, 'missing.mp4'))], recycle);
  assert.deepEqual(result.removedIds, ['missing']);
  assert.deepEqual(calls, []);
  await assert.rejects(trashMedia([media('relative', '../video.mp4')], recycle), /must be absolute/);
  assert.deepEqual(mediaSourcePaths({ kind: 'video', streams: { main: { path: 'original.mp4', proxy: 'proxy.mp4' } } }), ['original.mp4']);
});
