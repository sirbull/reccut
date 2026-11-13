import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fakeVoxcpmProcess } from './helpers/voxcpm-process.mjs';
const { createVoxcpmProcess, verifyVoxcpmProtocol } = createRequire(import.meta.url)('../src/main/voxcpmProcess.js');
const config = { exe: '/test/engine', sha256: 'a'.repeat(64), models: ['/test/base.gguf', '/test/acoustic.gguf'], cwd: '/test' };
const request = { text: 'A private script.\nWith Unicode: æøå.', reference: '/test/ref.wav', output: '/test/out.wav' };
const tick = () => new Promise(setImmediate);

function fixture(t, nativeOptions, options) {
  const native = fakeVoxcpmProcess(nativeOptions), client = createVoxcpmProcess({ spawnImpl: native.spawn, ...options });
  // Fake children do not hold Node alive as real child pipes do.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(async () => { await client.stop(); clearInterval(keepAlive); });
  return { native, client };
}

test('consecutive jobs reuse one model process and send text only over stdin', async (t) => {
  const { native, client } = fixture(t);
  let loads = 0, starts = 0;
  for (let i = 0; i < 3; i++) await client.run(config, { ...request, text: request.text + i }, { onLoading: () => loads++, onReady: () => starts++ });
  assert.equal(native.children.length, 1);
  assert.equal(loads, 1); assert.equal(starts, 3);
  assert.deepEqual(native.children[0].args, ['--serve', ...config.models]);
  assert.deepEqual(native.children[0].options.stdio, ['pipe', 'pipe', 'ignore']);
  assert.equal(native.children[0].options.shell, undefined);
  assert.deepEqual(native.requests.map((r) => r.id), [1, 2, 3]);
  assert.equal(native.requests[0].text, request.text + '0');
});

test('cancel while loading waits for the old process to close, then a new job can start', async (t) => {
  const { native, client } = fixture(t, { announce: false });
  const ctrl = new AbortController();
  const running = client.run(config, request, { signal: ctrl.signal });
  const rejects = assert.rejects(running, { name: 'AbortError' });
  await tick(); ctrl.abort(); await rejects;
  assert.equal(native.children[0].closed, true);
  assert.equal(client.running(), false);
  const next = client.run(config, request);
  await tick(); native.children[1].respond({ type: 'ready', protocol: 1, rate: 48000 });
  await next;
  assert.equal(native.requests.length, 1, 'no canceled script was sent during loading');
});

test('cancel during generation kills the worker and never retries or replays that script', async (t) => {
  const { native, client } = fixture(t, { handle: async () => false });
  const ctrl = new AbortController(), running = client.run(config, request, { signal: ctrl.signal });
  const rejects = assert.rejects(running, { name: 'AbortError' });
  await tick(); await tick(); ctrl.abort(); await rejects;
  assert.equal(native.requests.length, 1);
  assert.equal(native.children[0].killed, 'SIGTERM');
  assert.equal(native.children[0].closed, true);
});

test('a crash rejects the active request, and a later request starts a clean engine', async (t) => {
  const { native, client } = fixture(t, { handle: async (_r, child) => { child.close(1); return false; } });
  await assert.rejects(client.run(config, request), /stopped unexpectedly/);
  await assert.rejects(client.run(config, request), /stopped unexpectedly/);
  assert.equal(native.children.length, 2);
});

test('protocol failures are bounded and cannot leak private exception text', async (t) => {
  for (const failure of ['wrong-id', 'bad-json', 'oversized', 'private-error']) {
    const { native, client } = fixture(t, { handle: async (r, child) => {
      if (failure === 'wrong-id') child.respond({ type: 'done', id: r.id + 1, rate: 48000 });
      if (failure === 'bad-json') child.stdout.write('not JSON\n');
      if (failure === 'oversized') child.stdout.write('x'.repeat(8193));
      if (failure === 'private-error') child.respond({ type: 'error', id: r.id, error: request.text });
      return false;
    } });
    await assert.rejects(client.run(config, request), (e) => !e.message.includes('private script') && /invalid response|too large|could not generate/.test(e.message));
    assert.equal(native.children[0].closed, true);
    await client.stop();
  }
});

test('startup and generation timeouts settle and terminate their process', async (t) => {
  const loading = fixture(t, { announce: false }, { startupTimeoutMs: 10 });
  await assert.rejects(loading.client.run(config, request), /Loading.*timed out/);
  assert.ok(loading.native.children[0].closed);
  const generating = fixture(t, { handle: async () => false }, { requestTimeoutMs: 10 });
  await assert.rejects(generating.client.run(config, request), /Generating.*timed out/);
  assert.ok(generating.native.children[0].closed);
});

test('idle expiry releases the model; changed model or executable checksum forces a fresh process', async (t) => {
  const { native, client } = fixture(t, {}, { idleTimeoutMs: 10 });
  await client.run(config, request);
  // Process exit runs on a later event-loop turn, also when timers fire late under load.
  await once(native.children[0], 'close', { signal: AbortSignal.timeout(3000) });
  assert.ok(native.children[0].closed);
  await client.run(config, request);
  await client.run({ ...config, sha256: 'b'.repeat(64) }, request);
  await client.run({ ...config, sha256: 'b'.repeat(64), models: ['/test/new.gguf', config.models[1]] }, request);
  assert.equal(native.children.length, 4);
  assert.ok(native.children.slice(0, -1).every((p) => p.closed));
});

test('request serialization, pre-cancel and concurrent calls cannot corrupt the active job', async (t) => {
  const { native, client } = fixture(t, { handle: async () => false });
  const canceled = new AbortController(); canceled.abort();
  await assert.rejects(client.run(config, request, { signal: canceled.signal }), { name: 'AbortError' });
  assert.equal(native.children.length, 0);
  const running = client.run(config, request);
  const stopped = assert.rejects(running, /stopped/);
  await tick();
  await assert.rejects(client.run(config, request), /busy/);
  await client.stop(); await stopped;
  await assert.rejects(client.run(config, { ...request, text: 'x'.repeat(65536) }), /too long/);
});

test('unsupported protocol cannot accept a script', async (t) => {
  const { native, client } = fixture(t, { announce: false });
  const running = client.run(config, request), rejected = assert.rejects(running, /invalid response/);
  await tick(); native.children[0].respond({ type: 'ready', protocol: 999, rate: 48000 });
  await rejected;
  assert.equal(native.requests.length, 0);
});

test('installation probes protocol support without opening model weights', async () => {
  const native = fakeVoxcpmProcess();
  await verifyVoxcpmProtocol(config.exe, { spawnImpl: native.spawn });
  assert.deepEqual(native.children[0].args, ['--protocol']);
  assert.equal(native.requests.length, 0);
  assert.equal(native.children[0].closed, true);
});

test('the old one-shot CLI is rejected as incompatible before model installation', async () => {
  const native = fakeVoxcpmProcess({ announce: false });
  const check = verifyVoxcpmProtocol(config.exe, { spawnImpl: native.spawn });
  const rejects = assert.rejects(check, /incompatible/);
  await tick(); native.children[0].stdout.write('Usage: voxcpm2-cli\n'); native.children[0].close(1);
  await rejects;
});

test('protocol probing has cancellation and bounded time/output', async (t) => {
  const keepAlive = setInterval(() => {}, 1000); t.after(() => clearInterval(keepAlive));
  const stalled = fakeVoxcpmProcess({ announce: false });
  await assert.rejects(verifyVoxcpmProtocol(config.exe, { spawnImpl: stalled.spawn, timeoutMs: 10 }), /timed out/);
  assert.ok(stalled.children[0].closed);
  const canceled = fakeVoxcpmProcess({ announce: false }), ctrl = new AbortController();
  const check = verifyVoxcpmProtocol(config.exe, { spawnImpl: canceled.spawn, signal: ctrl.signal });
  const rejects = assert.rejects(check, { name: 'AbortError' });
  ctrl.abort(); await rejects;
  assert.ok(canceled.children[0].closed);
  const oversized = fakeVoxcpmProcess({ announce: false });
  const bad = verifyVoxcpmProtocol(config.exe, { spawnImpl: oversized.spawn });
  const rejected = assert.rejects(bad, /invalid protocol response/);
  oversized.children[0].stdout.write('x'.repeat(1025)); await rejected;
  assert.ok(oversized.children[0].closed);
});

test('cancellation escalates to SIGKILL if graceful termination does not close the process', async (t) => {
  const { native, client } = fixture(t, { handle: async () => false }, { killTimeoutMs: 10 });
  const running = client.run(config, request), rejected = assert.rejects(running, /stopped/);
  await tick(); await tick();
  const child = native.children[0];
  child.kill = (signal) => { child.signals.push(signal); if (signal === 'SIGKILL') setImmediate(() => child.close(null)); };
  await client.stop(); await rejected;
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL']);
  assert.ok(child.closed);
});
