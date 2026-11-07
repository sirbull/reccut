import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createRoto, registerRoto, MODELS } = require('../src/main/roto.js');

const ctx = () => ({ progress() {}, setCancel() {}, isCanceled: () => false });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-roto-'));
const make = (opts = {}) => {
  const root = tmp();
  return createRoto({ dir: path.join(root, 'roto'), cacheDir: path.join(root, 'cache'), ffmpegPath: 'ffmpeg', platform: 'darwin', arch: 'arm64', fetchImpl: async () => new Response('x'), ...opts });
};

test('a download that does not match its checksum is never installed', async () => {
  const urls = [];
  const roto = make({ fetchImpl: async (url) => (urls.push(url), new Response('not uv')), spawnImpl: () => assert.fail('nothing runs before the download is checked') });
  await assert.rejects(roto.install({ model: 'small' }, ctx()), /does not match its checksum/);
  assert.match(urls[0], /astral-sh\/uv\/releases\/download\/0\.13\.5\/uv-aarch64-apple-darwin\.tar\.gz$/);
  assert.equal((await roto.status()).installed, false);
});

test('every model has a pinned size and checksum, and nothing is installed at first', async () => {
  for (const m of MODELS) {
    assert.match(m.sha256, /^[0-9a-f]{64}$/);
    assert.ok(m.bytes > 1e8);
  }
  const s = await make().status();
  assert.equal(s.installed, false);
  assert.equal(s.model, null);
  assert.deepEqual(s.models.map((m) => m.installed), [false, false, false]);
});

test('a model that is not downloaded cannot be chosen, and unknown models are refused', async () => {
  const roto = make();
  await assert.rejects(roto.chooseModel('large'), /Download this model first/);
  await assert.rejects(roto.downloadModel('huge', ctx()), /Unknown model/);
  await assert.rejects(roto.open({ input: '/x.mov', fps: 30, first: 0, count: 10 }), /Install Roto Brush first/);
});

test('the renderer can only send known commands, and installing needs consent', async () => {
  const handlers = {};
  registerRoto({ handle: (ch, fn) => (handlers[ch] = fn), roto: make(), jobs: { add: () => assert.fail('no job without consent') }, media: {}, notifyAnalyzed() {}, outputDir: () => tmp(), send() {} });
  assert.throws(() => handlers['roto:install']({ model: 'small' }), /only installed after you accept/);
  assert.throws(() => handlers['roto:call']('render', {}), /Unknown Roto Brush command/);
});

test('Unsupported computers are told so before anything is downloaded', async () => {
  const roto = make({ platform: 'darwin', arch: 'x64', fetchImpl: () => assert.fail('no download') });
  assert.equal((await roto.status()).supported, false);
  await assert.rejects(roto.install({ model: 'small' }, ctx()), /not available for this computer/);
});
