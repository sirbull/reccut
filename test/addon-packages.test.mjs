import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { packageFixture, digest } from './helpers/addon-package.mjs';
const require = createRequire(import.meta.url);
const { stagePackage, validatePackage } = require('../src/main/addonPackages');
const catalog = require('../src/main/addonCatalog.json');
const voices = require('../src/main/ttsCatalog.json').voxcpm;
const entries = [{ path: 'helper', data: Buffer.from('executable fixture'), executable: true }, { path: 'LICENSE.txt', data: Buffer.from('license fixture') }];
async function setup(t, input = entries) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-addons-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const fixture = await packageFixture(input);
  const calls = [];
  return { ...fixture, dir, calls, stage: (overrides = {}) => stagePackage({ pack: fixture.pack, cacheDir: dir,
    fetchImpl: async url => { calls.push(url); return new Response(fixture.data); }, ...overrides }) };
}

test('catalogue pins independent packages and every reference in the voice catalogue', () => {
  for (const id of ['keystrokes-mac', 'keystrokes-win-x64', 'keystrokes-linux-x64', 'voxcpm-mac']) assert.ok(catalog.packages[id]);
  for (const pack of Object.values(catalog.packages)) {
    validatePackage(pack);
    assert.ok(pack.url.includes(`/addons-v${pack.version}/`));
    assert.ok(pack.files.some(f => f.path === 'LICENSE.txt'));
  }
  for (const l of voices.languages.filter(l => l.source === 'release')) for (const voice of l.voices) {
    assert.ok(catalog.packages[`voxcpm-${l.lang}`].files.some(f => f.path === voice.reference.path && f.sha256 === voice.reference.sha256 && f.size === voice.reference.size));
  }
});

test('verified ZIPs retain notices and executable permissions; cached archives avoid network requests', async t => {
  const f = await setup(t);
  const first = await f.stage();
  assert.deepEqual(await fs.readFile(path.join(first.dir, 'helper')), entries[0].data);
  assert.deepEqual(await fs.readFile(path.join(first.dir, 'LICENSE.txt')), entries[1].data);
  if (process.platform !== 'win32') assert.ok((await fs.stat(path.join(first.dir, 'helper'))).mode & 0o100);
  await first.dispose();
  const second = await f.stage();
  assert.equal(f.calls.length, 1);
  await second.dispose();
  assert.ok(!(await fs.readdir(f.dir)).some(n => n.startsWith('.unpack-')));
});

test('a corrupt archive never reaches extraction or a live installation', async t => {
  const f = await setup(t);
  await assert.rejects(f.stage({ fetchImpl: async () => new Response(Buffer.alloc(f.data.length, 42)) }), /checksum/);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('per-file hashes reject an archive whose contents differ from the catalogue', async t => {
  const f = await setup(t);
  f.pack.files[0].sha256 = 'f'.repeat(64);
  await assert.rejects(f.stage(), /checksum/);
  assert.ok(!(await fs.readdir(f.dir)).some(n => n.startsWith('.unpack-')));
});

test('missing, extra, duplicate and incorrectly sized files are rejected', async t => {
  for (const kind of ['missing', 'extra', 'duplicate', 'size']) {
    const input = kind === 'extra' ? [...entries, { path: 'unlisted', data: Buffer.from('x') }] : kind === 'duplicate' ? [...entries, entries[0]] : entries;
    const f = await setup(t, input);
    f.pack.files = (await packageFixture(entries)).pack.files;
    if (kind === 'missing') f.pack.files.push({ path: 'missing', size: 1, sha256: digest('x') });
    if (kind === 'size') f.pack.files[0].size++;
    await assert.rejects(f.stage(), /Unexpected file|missing required/);
    assert.ok(!(await fs.readdir(f.dir)).some(n => n.startsWith('.unpack-')));
  }
});

test('ZIP traversal, symlinks and encrypted entries cannot be extracted', async t => {
  for (const kind of ['traversal', 'symlink', 'encrypted']) {
    const f = await setup(t, [{ path: 'good.txt', data: Buffer.from('x') }]);
    const data = Buffer.from(f.data);
    const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    if (kind === 'traversal') {
      for (let at = data.indexOf('good.txt'); at !== -1; at = data.indexOf('good.txt', at + 8)) data.write('../x.txt', at);
    } else if (kind === 'symlink') data.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    else data.writeUInt16LE(data.readUInt16LE(central + 8) | 1, central + 8);
    f.pack.sha256 = digest(data);
    await assert.rejects(f.stage({ fetchImpl: async () => new Response(data) }), /invalid relative path|Unexpected file|size mismatch/);
    assert.ok(!(await fs.readdir(f.dir)).some(n => n.startsWith('.unpack-')));
  }
});

test('cancellation before download performs no network or installation writes', async t => {
  const f = await setup(t), ctrl = new AbortController();
  ctrl.abort(new Error('Canceled'));
  await assert.rejects(f.stage({ signal: ctrl.signal }), /Canceled/);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('an interrupted ZIP can resume without exposing a partial installation', async t => {
  const f = await setup(t), ctrl = new AbortController();
  await assert.rejects(f.stage({ signal: ctrl.signal, fetchImpl: async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(f.data.subarray(0, 30)); setTimeout(() => ctrl.abort(new Error('Canceled')), 10); },
  })) }), /Canceled|aborted/);
  assert.ok(!(await fs.readdir(f.dir)).some(n => n.startsWith('.unpack-')));
  const resumed = await f.stage({ fetchImpl: async (_url, options) => {
    assert.equal(options.headers.Range, 'bytes=30-');
    return new Response(f.data.subarray(30), { status: 206, headers: { 'content-range': `bytes 30-${f.data.length - 1}/${f.data.length}` } });
  } });
  assert.deepEqual(await fs.readFile(path.join(resumed.dir, 'helper')), entries[0].data);
  await resumed.dispose();
});

test('catalogue refuses unbounded sizes, unsafe names, case collisions and non-HTTPS addresses', async t => {
  const f = await setup(t);
  for (const override of [{ size: 2 ** 30 }, { url: 'http://example.com/pack.zip' }, { url: 'https://user:secret@example.com/pack.zip' },
    { files: [{ ...f.pack.files[0], path: '../escape' }] }, { files: [f.pack.files[0], { ...f.pack.files[0], path: 'HELPER' }] }]) {
    assert.throws(() => validatePackage({ ...f.pack, ...override }), /Invalid|larger/);
  }
});
