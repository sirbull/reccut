import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { SubtitleModelManager } = require('../src/main/subtitleModels');
const catalog = require('../src/main/subtitleCatalog');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-models-'));
  const bytes = Buffer.from('verified model contents');
  const models = ['base', 'tiny', 'small'].map((name, i) => ({
    ...catalog[i], id: `whisper-${name}`, name, bundled: i === 0, removable: i !== 0,
    version: 'a'.repeat(40), minimumRequirements: { ramGB: 1, arch: [process.arch] },
    files: ['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'preprocessor_config.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx'].map(file => ({ path: file, size: bytes.length, sha256: sha(bytes), url: `https://huggingface.co/test/${name}/resolve/${'a'.repeat(40)}/${file}` })),
    downloadSizeBytes: bytes.length * 7,
  }));
  const changes = [], calls = [];
  const make = overrides => new SubtitleModelManager({
    dir: path.join(root, 'managed'), bundleDir: path.join(root, 'bundle'), legacyDir: path.join(root, 'legacy'),
    models, ram: 16 * 1024 ** 3, freeSpace: async () => 10 ** 10,
    fetchImpl: async (url) => { calls.push(url); return new Response(bytes); },
    onChange: s => changes.push(structuredClone(s)), ...options, ...overrides,
  });
  const manager = make(); await manager.ready;
  t.after(async () => { await manager.shutdown(); await fs.rm(root, { recursive: true, force: true }); });
  const install = async id => { await manager.downloadModel(id); await manager.downloads.get(id)?.done; };
  return { root, bytes, models, manager, changes, calls, make, install };
}

test('catalog contains pinned timestamp-capable ONNX models, exact sizes and trusted checksums', () => {
  assert.equal(catalog.filter(m => m.bundled).length, 1);
  assert.equal(catalog.find(m => m.bundled).id, 'whisper-base');
  for (const m of catalog) {
    assert.match(m.version, /^[a-f0-9]{40}$/);
    assert.ok(m.supportedLanguages.includes('no'));
    assert.equal(m.downloadSizeBytes, m.files.reduce((s, f) => s + f.size, 0));
    for (const f of m.files) { assert.match(f.sha256, /^[a-f0-9]{64}$/); assert.ok(f.url.startsWith(`https://huggingface.co/${m.repository}/resolve/${m.version}/`)); assert.ok(!f.path.includes('..')); }
  }
  assert.ok(!catalog.some(m => /parakeet|nb-whisper|large-v3$/.test(m.id)));
});

test('packaging bundles only Base, includes attribution, and treats its ONNX weights as data', () => {
  const pkg = require('../package.json'), hook = require('../scripts/before-pack.cjs');
  assert.deepEqual(pkg.build.extraResources.filter(r => r.to.startsWith('subtitle-models')).map(r => r.to), ['subtitle-models/whisper-base']);
  assert.equal(hook.modelResource('/tmp/Reccut.app/Contents/Resources/subtitle-models/whisper-base/onnx/encoder_model_quantized.onnx'), true);
});

test('startup is offline, discovers verified bundled files, protects the default and ignores partial staging', async t => {
  const f = await fixture(t);
  for (const file of f.models[0].files) { const target = path.join(f.root, 'bundle', 'whisper-base', file.path); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, f.bytes); }
  const partial = path.join(f.manager.dir, '.staging-whisper-small'); await fs.mkdir(partial); await fs.writeFile(path.join(partial, 'partial'), 'bad');
  const manager = f.make({ fetchImpl: () => { throw new Error('No network allowed'); } }); await manager.ready;
  assert.equal(manager.snapshot().active, 'whisper-base');
  assert.equal(manager.snapshot().models[0].removable, false);
  assert.equal(manager.snapshot().storageBytes, f.bytes.length * 7);
  await assert.rejects(manager.removeModel('whisper-base'), /protected/);
  await assert.rejects(fs.stat(partial), /ENOENT/);
  await manager.shutdown();
  assert.equal(f.calls.length, 0);
});

test('download streams progress, verifies and atomically installs multiple models without duplicate requests', async t => {
  const f = await fixture(t);
  await f.install('whisper-base'); await f.install('whisper-small');
  assert.ok(f.changes.some(s => s.models.some(m => m.status === 'downloading' && m.totalBytes > 0)));
  assert.ok(f.changes.some(s => s.models.some(m => m.downloadedBytes > 0)));
  assert.ok(f.changes.some(s => s.models.some(m => m.status === 'installing' && !m.installed)));
  assert.equal(f.manager.snapshot().models.filter(m => m.installed).length, 2);
  const before = f.calls.length; await f.install('whisper-small'); assert.equal(f.calls.length, before);
  const record = JSON.parse(await fs.readFile(path.join(f.manager.dir, 'manifest.json'))).installed[0];
  for (const field of ['id','name','family','version','backend','localPath','installedSizeBytes','expectedDownloadSize','status','sourceRepository','integrity']) assert.ok(field in record, field);
  const key = `https://huggingface.co/${f.models[0].repository}/resolve/${f.models[0].version}/config.json`;
  assert.deepEqual(Buffer.from(await f.manager.readModelFile(key)), f.bytes);
  assert.deepEqual(Buffer.from(await f.manager.readModelFile(key.replace(f.models[0].version, 'main'))), f.bytes);
  assert.equal(await f.manager.readModelFile(key.replace('config.json', '../manifest.json')), null);
});

test('selection persists offline, deletion frees only inactive owned files, leases protect queued and running inference', async t => {
  const f = await fixture(t); await f.install('whisper-base'); await f.install('whisper-small');
  await f.manager.setActiveModel('whisper-small');
  const lease = await f.manager.acquireActiveModel(); assert.equal(lease.model.id, 'whisper-small');
  await assert.rejects(f.manager.removeModel('whisper-small'), /Select another/);
  await f.manager.setActiveModel('whisper-base'); await assert.rejects(f.manager.removeModel('whisper-small'), /being used/);
  lease.release(); lease.release();
  await f.manager.setActiveModel('whisper-small');
  const restored = f.make({ fetchImpl: () => { throw new Error('offline'); } }); await restored.ready;
  assert.equal(await restored.getActiveModel(), 'whisper-small');
  const second = await restored.acquireActiveModel(); second.release();
  await restored.setActiveModel('whisper-base'); await restored.removeModel('whisper-small');
  assert.equal(restored.snapshot().storageBytes, f.models[0].downloadSizeBytes);
  assert.ok((await fs.stat(path.join(f.manager.dir, 'whisper-base/config.json'))).isFile());
  await restored.shutdown();
});

test('missing or same-sized corrupted installations are rejected and selection falls back without a download', async t => {
  const f = await fixture(t); await f.install('whisper-base'); await f.install('whisper-small'); await f.manager.setActiveModel('whisper-small');
  await fs.writeFile(path.join(f.manager.dir, 'whisper-small/config.json'), Buffer.alloc(f.bytes.length));
  const restored = f.make({ fetchImpl: () => { throw new Error('offline'); } }); await restored.ready;
  assert.equal(restored.snapshot().active, 'whisper-base');
  assert.equal(restored.snapshot().models.find(m => m.id === 'whisper-small').status, 'failed');
  await fs.rm(path.join(f.manager.dir, 'whisper-base/config.json'));
  await assert.rejects(restored.acquireActiveModel(), /Install Whisper Base/);
  await restored.shutdown();
});

test('legacy Whisper cache is discovered without copying, deleting, or downloading default files', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.root, 'legacy'));
  for (const file of f.models[0].files) await fs.writeFile(f.manager.legacyPath(f.models[0], file), f.bytes);
  const restored = f.make({ fetchImpl: () => { throw new Error('offline'); } }); await restored.ready;
  assert.equal(restored.installed.get('whisper-base').source, 'legacy');
  assert.equal(restored.snapshot().active, 'whisper-base'); await restored.shutdown();
});

test('disk reservations, hardware compatibility and unknown IDs prevent invalid downloads', async t => {
  const f = await fixture(t, { freeSpace: async () => 1 });
  await f.manager.downloadModel('whisper-small'); const op = f.manager.downloads.get('whisper-small'); await assert.rejects(op.done, /Insufficient/);
  assert.equal(f.calls.length, 0); assert.equal(f.manager.snapshot().models[2].status, 'failed');
  await assert.rejects(f.manager.downloadModel('../outside'), /Unknown/);
  f.manager.ram = 0;
  await assert.rejects(f.manager.downloadModel('whisper-small'), /Unsupported/);
});

test('failure has bounded retries and integrity errors never install selectable models; retry succeeds', async t => {
  let count = 0;
  const f = await fixture(t, { fetchImpl: async () => { count++; return new Response('unavailable', { status: 503 }); } });
  await f.manager.downloadModel('whisper-small'); await assert.rejects(f.manager.downloads.get('whisper-small').done, /HTTP 503/); assert.equal(count, 3);
  f.manager.fetchImpl = async () => new Response(Buffer.alloc(f.bytes.length));
  await f.manager.downloadModel('whisper-small'); await assert.rejects(f.manager.downloads.get('whisper-small').done, /integrity/);
  assert.equal(f.manager.snapshot().models[2].usable, false);
  await assert.rejects(fs.stat(path.join(f.manager.dir, '.staging-whisper-small')), /ENOENT/);
  f.manager.fetchImpl = async () => new Response(f.bytes); await f.install('whisper-small'); assert.ok(f.manager.snapshot().models[2].usable);
});

test('cancellation prevents duplicate concurrent downloads, cleans files and makes retry possible', async t => {
  const f = await fixture(t, { fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('Canceled')), { once: true }); } })) });
  await f.manager.downloadModel('whisper-small');
  const operation = f.manager.downloads.get('whisper-small');
  await f.manager.downloadModel('whisper-small'); assert.equal(f.manager.downloads.get('whisper-small'), operation);
  await f.manager.cancelDownload('whisper-small'); assert.equal(f.manager.snapshot().models[2].status, 'not-installed');
  assert.equal(f.manager.snapshot().models[2].usable, false);
  await assert.rejects(fs.stat(path.join(f.manager.dir, '.staging-whisper-small')), /ENOENT/);
  f.manager.fetchImpl = async () => new Response(f.bytes); await f.install('whisper-small');
});

test('shutdown aborts incomplete transfers and next launch recovers offline', async t => {
  const f = await fixture(t, { fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({ start(controller) { signal.addEventListener('abort', () => controller.error(new Error('Canceled')), { once: true }); } })) });
  await f.manager.downloadModel('whisper-small'); await f.manager.shutdown();
  assert.equal(f.manager.downloads.size, 0);
  const restored = f.make(); await restored.ready; assert.equal(restored.snapshot().models[2].installed, false); await restored.shutdown();
});

test('mid-transfer cancellation removes written partial bytes and permits retry', async t => {
  let began;
  const started = new Promise(resolve => { began = resolve; });
  const f = await fixture(t, { fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([1, 2, 3])); began();
    signal.addEventListener('abort', () => controller.error(new Error('Canceled')), { once: true });
  } })) });
  await f.manager.downloadModel('whisper-small'); await started;
  await f.manager.cancelDownload('whisper-small');
  assert.equal(f.manager.snapshot().models[2].installed, false);
  assert.deepEqual((await fs.readdir(f.manager.dir)).filter(n => n.startsWith('.staging-')), []);
});

test('network inactivity times out and bounds attempts', async t => {
  let attempts = 0;
  const f = await fixture(t, { timeoutMs: 10, fetchImpl: async (_url, { signal }) => { attempts++; return new Response(new ReadableStream({ start(controller) {
    signal.addEventListener('abort', () => controller.error(new Error('Download timed out.')), { once: true });
  } })); } });
  // Keep the test alive while the production timeout is deliberately unref'd.
  const keepAlive = setInterval(() => {}, 100);
  try {
    await f.manager.downloadModel('whisper-small');
    await assert.rejects(f.manager.downloads.get('whisper-small').done, /timed out/);
    assert.equal(attempts, 3); assert.equal(f.manager.snapshot().models[2].status, 'failed');
  } finally { clearInterval(keepAlive); }
});

test('corrupt manifests and forged local paths cannot authorize deletion outside the model directory', async t => {
  const f = await fixture(t); await f.install('whisper-small');
  const outside = path.join(f.root, 'keep.txt'); await fs.writeFile(outside, 'keep');
  for (const raw of ['null', '{"installed":"bad"}', '{"installed":[null,{"id":"whisper-small","localPath":"'+outside+'"}]}']) {
    await fs.writeFile(path.join(f.manager.dir, 'manifest.json'), raw);
    const restored = f.make(); await restored.ready;
    assert.equal(restored.snapshot().models[2].installed, true); await restored.shutdown();
  }
  await f.manager.removeModel('whisper-small'); assert.equal(await fs.readFile(outside, 'utf8'), 'keep');
});

test('concurrent selection, queued acquisition and deletion preserve an inference lease', async t => {
  const f = await fixture(t); await f.install('whisper-base'); await f.install('whisper-small'); await f.manager.setActiveModel('whisper-small');
  const acquire = f.manager.acquireActiveModel(), select = f.manager.setActiveModel('whisper-base'), remove = f.manager.removeModel('whisper-small');
  const lease = await acquire; await select; await assert.rejects(remove, /being used/);
  lease.release(); await f.manager.removeModel('whisper-small'); assert.equal(f.manager.snapshot().models[2].installed, false);
});

test('existing verified WebGPU weights coexist with the bundled CPU fallback and remain offline', async t => {
  const f = await fixture(t); await f.install('whisper-base');
  const model = f.models[0];
  model.legacyGpuFiles = ['onnx/encoder_model.onnx', 'onnx/decoder_model_merged_q4.onnx'].map(file => ({ path: file, size: f.bytes.length, sha256: sha(f.bytes) }));
  await fs.mkdir(path.join(f.root, 'legacy'));
  for (const file of [...model.files.filter(f => !f.path.startsWith('onnx/')), ...model.legacyGpuFiles]) await fs.writeFile(f.manager.legacyPath(model, file), f.bytes);
  const restored = f.make({ fetchImpl: () => { throw new Error('offline'); } }); await restored.ready;
  const lease = await restored.acquireActiveModel();
  assert.equal(lease.model.legacyGpu, true); assert.equal(lease.model.cpuAvailable, true);
  const key = `https://huggingface.co/${model.repository}/resolve/${model.version}/onnx/encoder_model.onnx`;
  assert.deepEqual(Buffer.from(await restored.readModelFile(key)), f.bytes);
  assert.equal(restored.snapshot().storageBytes, f.bytes.length * 14);
  lease.release(); await restored.shutdown();
});
