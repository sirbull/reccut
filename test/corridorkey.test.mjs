import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCorridorKey, recommendedSize, manifest } = require('../src/main/corridorkey.js');
const { validatePlugin } = require('../src/main/extensions.js');
const GB = 1024 ** 3;

const ctx = () => ({ progress() {}, setCancel() {}, isCanceled: () => false });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-ck-'));

test('a download that does not match its checksum is never installed', async () => {
  const dir = path.join(tmp(), 'corridorkey');
  const urls = [];
  const ck = createCorridorKey({
    dir,
    platform: 'darwin',
    arch: 'arm64',
    fetchImpl: async (url) => (urls.push(url), new Response('not uv')),
    spawnImpl: () => assert.fail('nothing runs before the download is checked'),
  });
  await assert.rejects(ck.install(ctx()), /does not match its checksum/);
  assert.equal(fs.existsSync(dir), false);
  assert.match(urls[0], /astral-sh\/uv\/releases\/download\/0\.13\.5\/uv-aarch64-apple-darwin\.tar\.gz$/);
});

test('unsupported computers are refused before anything is downloaded', async () => {
  const ck = createCorridorKey({ dir: path.join(tmp(), 'ck'), platform: 'win32', arch: 'arm64', fetchImpl: () => assert.fail('no download') });
  await assert.rejects(ck.install(ctx()), /not available/);
});

test('full quality only where there is memory for it', () => {
  assert.equal(recommendedSize({ kind: 'apple', memory: 16 * GB }), '1024');
  assert.equal(recommendedSize({ kind: 'apple', memory: 64 * GB }), '2048');
  assert.equal(recommendedSize({ kind: 'nvidia', memory: 8 * GB }), '1024');
  assert.equal(recommendedSize({ kind: 'nvidia', memory: 24 * GB }), '2048');
  assert.equal(recommendedSize({ kind: 'cpu', memory: 0 }), '1024');
});

test('the installed add-on is a valid processor plugin', () => {
  const dir = tmp();
  const python = path.join(dir, 'python');
  fs.writeFileSync(python, '');
  const p = validatePlugin(manifest({ python, script: path.join(dir, 'corridorkey.py'), src: dir, weights: dir, size: '1024' }));
  assert.equal(p.id, 'corridorkey');
  assert.equal(p.params.find((x) => x.id === 'size').default, '1024');
  assert.ok(p.args.includes('{ffmpeg}') && p.args.includes('{input}') && p.args.includes('{output}'));
});
