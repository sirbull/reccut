import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createModelPacks } = require('../src/main/modelPacks.js');
const designModels = require('../src/main/designModels.js');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-'));
  const onnx = Buffer.from('weights'), config = Buffer.from('{}');
  const models = [{ id: 'org/model', revision: 'r1', label: 'Standard', files: [{ file: 'config.json', url: 'https://example.test/config.json', sha256: sha(config), size: config.length }, { file: 'onnx/model.onnx', url: 'https://example.test/model.onnx', sha256: sha(onnx), size: onnx.length }] }];
  const bodies = new Map([['https://example.test/config.json', config], ['https://example.test/model.onnx', onnx]]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const b = bodies.get(url);
    return { ok: Boolean(b), status: b ? 200 : 404, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
  };
  return { dir, models, bodies, calls, fetchImpl };
}

test('a model is downloaded only when asked, verified, and laid out for Transformers.js', async () => {
  const f = fixture();
  const packs = createModelPacks(f);
  assert.equal((await packs.status())[0].installed, false);
  assert.equal(f.calls.length, 0);
  const progress = [];
  await packs.install('org/model', (p) => progress.push(p));
  assert.equal(progress.at(-1), 1);
  assert.ok(fs.existsSync(path.join(f.dir, 'org', 'model', 'onnx', 'model.onnx')));
  assert.equal(await createModelPacks(f).installed('org/model'), true, 'found again after a restart');
  await packs.remove('org/model');
  assert.equal(await packs.installed('org/model'), false);
});

test('a wrong checksum stops the download and leaves nothing behind', async () => {
  const f = fixture();
  f.bodies.set('https://example.test/model.onnx', Buffer.from('tampered'));
  const packs = createModelPacks(f);
  await assert.rejects(packs.install('org/model'), /checksum/);
  assert.equal(await packs.installed('org/model'), false);
  assert.deepEqual(fs.readdirSync(f.dir), []);
});

test('the background models are pinned, explained, and their licenses ship without the weights', () => {
  for (const m of designModels.models) {
    assert.match(m.revision, /^[0-9a-f]{40}$/);
    assert.ok(m.label && m.description && m.sizeBytes > 1e6);
    assert.ok(m.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.url.startsWith('https://')));
    const text = fs.readFileSync(new URL(`../${m.licenseText}`, import.meta.url));
    const ref = m.files.find((f) => /^LICENSE/.test(f.file));
    assert.equal(sha(text), ref.sha256, `${m.id} license text matches the pinned file`);
  }
});
