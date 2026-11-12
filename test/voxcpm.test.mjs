import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fakeVoxcpmProcess } from './helpers/voxcpm-process.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVoxcpm, assetName, readWav } = require('../src/main/voxcpm.js');
const CATALOG = require('../src/main/ttsCatalog.json').voxcpm;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const file = (name, data) => ({ path: name, size: data.length, sha256: sha(data) });

function wav() {
  const b = Buffer.alloc(50);
  b.write('RIFF'); b.writeUInt32LE(42, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(6, 40);
  b.writeInt16LE(-32768, 44); b.writeInt16LE(0, 46); b.writeInt16LE(16384, 48);
  return b;
}
async function fixture(t, extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-voxcpm-'));

  const model = Buffer.from('base model'), acoustic = Buffer.from('acoustic'), engine = Buffer.from('local executable');
  const reference = wav(), catalog = structuredClone(CATALOG), calls = [];
  catalog.model.files = [file('base.gguf', model), file('acoustic.gguf', acoustic)];
  catalog.languages = ['nb', 'sv', 'en-us', 'de'].map((lang) => ({ lang, repository: 'test/voices', revision: 'a'.repeat(40),
    voices: [{ id: `${lang}-female-1`, name: 'Test voice', gender: 'Female', reference: file(`${lang}.wav`, reference) }] }));
  const bodies = new Map([['base.gguf', model], ['acoustic.gguf', acoustic], ['nb.wav', reference], ['sv.wav', reference],
    ['en-us.wav', reference], ['de.wav', reference],
    ['reccut-voxcpm-mac', engine], ['reccut-voxcpm-mac.sha256', Buffer.from(`${sha(engine)}  reccut-voxcpm-mac\n`)]]);
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const body = bodies.get(url.split('/').at(-1));
    return new Response(body || null, { status: body ? 200 : 404 });
  };
  const fake = fakeVoxcpmProcess({ handle: async (request) => fs.writeFile(request.output, wav()) });
  const spawnImpl = fake.spawn;
  const options = { dir, version: '0.9.2', platform: 'darwin', arch: 'arm64', catalog, fetchImpl, spawnImpl, ...extra };
  const manager = createVoxcpm(options);
  t.after(async () => { await manager.stop(); await fs.rm(dir, { recursive: true, force: true }); });
  return { ...options, bodies, calls, get spawned() { return fake.children.filter((p) => p.args[0] === '--serve'); }, requests: fake.requests, options, manager };
}
function context() {
  const updates = [];
  let cancel;
  return { updates, progress: (...args) => updates.push(args), isCanceled: () => false,
    setCancel: (fn) => { cancel = fn; }, cancel: () => cancel() };
}
const payload = { engine: 'voxcpm', voice: 'nb-female-1', lang: 'nb', mood: 'angry', text: 'Hei! Dette er ikke vanskelig.' };

test('VoxCPM2 is restricted to Apple Silicon and does not download on status or generation', async (t) => {
  assert.equal(assetName('darwin', 'arm64'), 'reccut-voxcpm-mac');
  for (const [platform, arch] of [['darwin', 'x64'], ['win32', 'x64'], ['linux', 'x64']]) assert.equal(assetName(platform, arch), null);
  const f = await fixture(t);
  assert.equal((await f.manager.status()).installed, false);
  await assert.rejects(f.manager.generate(payload, context()), /MODEL_MISSING:voices/);
  assert.equal(f.calls.length, 0);
  const unsupported = createVoxcpm({ ...f.options, platform: 'linux' });
  await assert.rejects(unsupported.installLanguage('nb'), /Apple Silicon/);
  assert.equal(f.calls.length, 0);
});

test('languages share one verified model and engine, survive restart, and can be removed separately', async (t) => {
  const f = await fixture(t), progress = [];
  await f.manager.installLanguage('nb', (p) => progress.push(p));
  assert.equal(progress.at(-1), 1);
  assert.ok(f.calls.every((c) => /\/releases\/download\/v0\.9\.2\/|\/resolve\/[0-9a-f]{40}\//.test(c.url)));
  const n = f.calls.length;
  const restarted = createVoxcpm(f.options);
  t.after(() => restarted.stop());
  assert.ok((await restarted.status()).languages.nb.installed);
  await restarted.installLanguage('sv');
  assert.equal(f.calls.length, n + 1, 'the second language downloads only its reference');
  assert.match(f.calls.at(-1).url, /sv.wav$/);
  await restarted.removeLanguage('nb');
  let state = await restarted.status();
  assert.equal(state.languages.nb.installed, false);
  assert.ok(state.installed && state.engine && state.languages.sv.installed);
  await restarted.removeModel();
  state = await restarted.status();
  assert.equal(state.installed, false);
  assert.equal(state.engine, false);
  assert.ok(state.languages.sv.installed);
});

test('a failed model download resumes after restarting without exposing a partial installation', async (t) => {
  const f = await fixture(t);
  f.bodies.set('base.gguf', Buffer.from('base'));
  await assert.rejects(f.manager.installLanguage('nb'), /complete/);
  const state = await f.manager.status();
  assert.equal(state.downloading, false);
  assert.equal(state.installed, false);
  assert.equal(state.languages.nb.installed, false);
  const fetchImpl = async (url, options) => {
    if (url.endsWith('base.gguf')) {
      assert.equal(options.headers.Range, 'bytes=4-');
      return new Response(Buffer.from(' model'), { status: 206, headers: { 'Content-Range': 'bytes 4-9/10' } });
    }
    return f.fetchImpl(url, options);
  };
  const restarted = createVoxcpm({ ...f.options, fetchImpl });
  await restarted.installLanguage('nb');
  assert.ok((await restarted.status()).installed);
});

test('release reference assets are pinned, installed on request and retained across app versions', async (t) => {
  const f = await fixture(t);
  const l = f.catalog.languages.find((l) => l.lang === 'en-us');
  l.source = 'release'; delete l.repository; delete l.revision;
  await f.manager.installLanguage(l.lang);
  assert.ok(f.calls.some((c) => c.url === 'https://github.com/sirbull/reccut/releases/download/v0.9.2/en-us.wav'));
  assert.ok(!f.calls.some((c) => c.url.includes('huggingface.co/undefined')));
  const updated = createVoxcpm({ ...f.options, version: '0.9.3' });
  t.after(() => updated.stop());
  assert.ok((await updated.status()).languages['en-us'].installed, 'references are pinned by contents across releases');
  assert.equal((await updated.status()).engine, false, 'each app version still needs its own engine');
  const downloads = f.calls.length;
  await updated.installLanguage(l.lang);
  assert.ok((await updated.status()).engine);
  assert.ok(f.calls.slice(downloads).every((c) => c.url.includes('/v0.9.3/') && !c.url.endsWith('en-us.wav')), 'upgrade fetches the new engine without re-fetching references or models');
});

test('an unpublished or corrupt engine stops installation before any model request', async (t) => {
  const f = await fixture(t);
  f.bodies.delete('reccut-voxcpm-mac.sha256');
  await assert.rejects(f.manager.installModel(), /not published.*0.9.2/);
  assert.equal(f.calls.length, 1);
  f.bodies.set('reccut-voxcpm-mac.sha256', Buffer.from(`${'a'.repeat(64)}  reccut-voxcpm-mac\n`));
  await assert.rejects(f.manager.installModel(), /checksum/);
  assert.equal((await f.manager.status()).engine, false);
  assert.ok(!f.calls.some((c) => c.url.endsWith('.gguf')));
});

test('removing a model cancels and waits for its download before deleting partial files', async (t) => {
  const f = await fixture(t);
  let began;
  const ready = new Promise((resolve) => { began = resolve; });
  const manager = createVoxcpm({ ...f.options, fetchImpl: async (url, options) => {
    if (!url.endsWith('base.gguf')) return f.fetchImpl(url, options);
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      began();
    });
  } });
  const downloading = manager.installLanguage('nb');
  const rejects = assert.rejects(downloading, /Canceled/);
  await ready;
  assert.ok((await manager.status()).downloading);
  await manager.removeModel();
  await rejects;
  const state = await manager.status();
  assert.equal(state.downloading, false);
  assert.equal(state.installed, false);
  assert.equal(state.engine, false);
  assert.deepEqual(await fs.readdir(f.dir), []);
});

test('generation keeps text local, preserves mood and reference, and returns progress and mono samples', async (t) => {
  const f = await fixture(t);
  await f.manager.installLanguage('nb');
  const n = f.calls.length, ctx = context();
  const audio = await f.manager.generate({ ...payload, text: '[pause] Hei! Dette er ikke vanskelig.' }, ctx);
  assert.equal(f.calls.length, n, 'no network access during synthesis');
  assert.equal(audio.rate, 48000);
  assert.deepEqual(Array.from(audio.samples), [-1, 0, 0.5, -1, 0, 0.5]);
  assert.equal(f.spawned.length, 1, 'one model load for two sentences');
  assert.equal(f.requests.length, 2);
  for (const p of f.spawned) {
    assert.equal(p.options.shell, undefined);
    assert.deepEqual(p.options.stdio, ['pipe', 'pipe', 'ignore']);
    assert.equal(p.args[0], '--serve');
    assert.ok(!p.args.some((a) => a.includes('Dette')), 'the script travels only over stdin');
  }
  for (const r of f.requests) {
    assert.match(r.reference, /nb.wav$/);
    assert.equal(r.cfg, 3.5); assert.equal(r.steps, 250); assert.equal(r.timesteps, 10); assert.equal(r.seed, 42);
    assert.ok(r.text.startsWith(`(${CATALOG.moods.find((m) => m.id === 'angry').prompt} ${CATALOG.settings.suffix})`));
    assert.ok(!r.text.includes('[pause]'));
    await assert.rejects(fs.stat(path.dirname(r.output)), { code: 'ENOENT' });
  }
  await f.manager.generate({ ...payload, mood: 'sad' }, context());
  assert.equal(f.spawned.length, 1, 'the next speech job reuses the same process');
  assert.ok(f.requests.at(-1).text.includes(CATALOG.moods.find((m) => m.id === 'sad').prompt));
  assert.equal(ctx.updates.at(-1)[0], 1);
  assert.equal(ctx.updates.at(-1)[2].completed, 2);
  await assert.rejects(f.manager.generate({ ...payload, mood: 'unknown' }, context()), /Unknown voice mood/);
});

test('all expressions use the selected language reference and remain local across English and German jobs', async (t) => {
  const f = await fixture(t);
  await f.manager.installLanguage('en-us');
  await f.manager.installLanguage('de');
  const downloads = f.calls.length;
  for (const lang of ['en-us', 'de']) for (const mood of CATALOG.moods) {
    const text = lang === 'en-us' ? 'We can find a way together.' : 'Gemeinsam finden wir einen Weg.';
    await f.manager.generate({ engine: 'voxcpm', voice: `${lang}-female-1`, lang, mood: mood.id, text }, context());
    const request = f.requests.at(-1);
    assert.ok(request.reference.endsWith(`${lang}.wav`));
    assert.equal(request.text, `(${mood.prompt} ${CATALOG.settings.suffix})${text}`);
  }
  assert.equal(f.calls.length, downloads, 'no language or expression makes a network request during synthesis');
  assert.equal(f.spawned.length, 1, 'languages and expressions share one loaded model');
  await assert.rejects(f.manager.generate({ ...payload, voice: 'en-us-female-1', lang: 'de' }, context()), /MODEL_MISSING:voices/);
});

test('cancellation kills the CLI, removes temporary audio, and allows the next job', async (t) => {
  const f = await fixture(t);
  await f.manager.installLanguage('nb');
  let started, proc;
  const ready = new Promise((resolve) => { started = resolve; });
  const held = fakeVoxcpmProcess({ handle: async (_request, child) => { proc = child; started(); return false; } });
  const manager = createVoxcpm({ ...f.options, spawnImpl: (...args) => args[1][0] === '--protocol' ? f.spawnImpl(...args) : held.spawn(...args) });
  t.after(() => manager.stop());
  const ctx = context(), running = manager.generate(payload, ctx);
  const rejects = assert.rejects(running, /Canceled/);
  await ready;
  await assert.rejects(manager.removeModel(), /busy/);
  await assert.rejects(manager.generate(payload, context()), /busy/);
  ctx.cancel();
  await rejects;
  assert.equal(proc.killed, 'SIGTERM');
  assert.deepEqual(await fs.readdir(path.join(f.dir, '.work')), []);
  await manager.removeLanguage('nb');
  await assert.rejects(manager.generate(payload, context()), /MODEL_MISSING/);
  await f.manager.installLanguage('nb');
  assert.equal((await f.manager.generate(payload, context())).rate, 48000);
});

test('changed executable or reference audio is rejected before starting a process', async (t) => {
  const f = await fixture(t);
  await f.manager.installLanguage('nb');
  const ctx = context();
  await f.manager.generate(payload, ctx);
  const enginePath = f.spawned[0].exe, n = f.spawned.length;
  const engine = await fs.readFile(enginePath);
  await fs.writeFile(enginePath, Buffer.alloc(engine.length, 42));
  await assert.rejects(f.manager.generate(payload, context()), /MODEL_MISSING/);
  assert.equal(f.spawned.length, n);
  await fs.writeFile(enginePath, engine);
  const refPath = f.requests[0].reference;
  await fs.writeFile(refPath, Buffer.alloc((await fs.stat(refPath)).size, 42));
  await assert.rejects(f.manager.generate(payload, context()), /MODEL_MISSING/);
  assert.equal(f.spawned.length, n);
  assert.equal((await f.manager.status()).languages.nb.installed, false);
  await f.manager.installLanguage('nb');
  assert.ok((await f.manager.status()).languages.nb.installed);
  assert.equal((await f.manager.generate(payload, context())).rate, 48000);
});

test('a process launch failure releases the engine and removes its working directory', async (t) => {
  const f = await fixture(t);
  await f.manager.installLanguage('nb');
  const failed = fakeVoxcpmProcess({ announce: false });
  const manager = createVoxcpm({ ...f.options, spawnImpl: (...args) => {
    if (args[1][0] === '--protocol') return f.spawnImpl(...args);
    const child = failed.spawn(...args);
    setImmediate(() => child.emit('error', new Error('Cannot start engine')));
    return child;
  } });
  await assert.rejects(manager.generate(payload, context()), /Could not start/);
  assert.deepEqual(await fs.readdir(path.join(f.dir, '.work')), []);
  await manager.removeModel();
  assert.equal((await manager.status()).installed, false);
});

test('malformed or unsupported WAV output cannot enter the audio timeline', () => {
  assert.deepEqual(Array.from(readWav(wav()).samples), [-1, 0, 0.5]);
  assert.throws(() => readWav(wav().subarray(0, 47)), /invalid WAV/);
  for (const [at, value] of [[20, 3], [22, 2], [34, 32]]) {
    const b = wav(); b.writeUInt16LE(value, at);
    assert.throws(() => readWav(b), /invalid WAV/);
  }
});

test('bad WAV output discards the warm process, cleans files and permits a clean retry', async (t) => {
  let corrupt = true;
  const native = fakeVoxcpmProcess({ handle: async (request) => fs.writeFile(request.output, corrupt ? Buffer.from('broken audio') : wav()) });
  const f = await fixture(t, { spawnImpl: native.spawn });
  await f.manager.installLanguage('nb');
  await assert.rejects(f.manager.generate(payload, context()), /invalid WAV/);
  assert.ok(native.children.filter((p) => p.args[0] === '--serve').every((p) => p.closed));
  assert.deepEqual(await fs.readdir(path.join(f.dir, '.work')), []);
  corrupt = false;
  assert.equal((await f.manager.generate(payload, context())).rate, 48000);
  assert.equal(native.children.filter((p) => p.args[0] === '--serve').length, 2);
});
