import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const { downloadFile } = createRequire(import.meta.url)('../src/main/downloadFile.js');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-download-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const data = Buffer.from('a model that must never be buffered as one response');
  const opts = { url: 'https://models.example/pinned/model', file: path.join(dir, 'model'), size: data.length, sha256: sha(data) };
  return { dir, data, opts, part: `${opts.file}.${opts.sha256}.part` };
}
function response(body, options) {
  const res = new Response(body, options);
  res.arrayBuffer = () => { throw new Error('Large downloads must stream'); };
  return res;
}

test('interrupted downloads survive a new caller and resume at the exact byte offset', async (t) => {
  const f = await fixture(t);
  await assert.rejects(downloadFile({ ...f.opts, fetchImpl: async () => response(f.data.subarray(0, 7)) }), /complete/);
  assert.equal((await fs.stat(f.part)).size, 7);
  await assert.rejects(fs.stat(f.opts.file), { code: 'ENOENT' });
  const progress = [];
  await downloadFile({ ...f.opts, onProgress: (p) => progress.push(p), fetchImpl: async (url, { headers }) => {
    assert.equal(headers.Range, 'bytes=7-');
    return response(f.data.subarray(7), { status: 206, headers: { 'Content-Range': `bytes 7-${f.data.length - 1}/${f.data.length}` } });
  } });
  assert.deepEqual(await fs.readFile(f.opts.file), f.data);
  assert.equal(progress[0], 7);
  assert.equal(progress.at(-1), f.data.length);
  await assert.rejects(fs.stat(f.part), { code: 'ENOENT' });
  await downloadFile({ ...f.opts, fetchImpl: () => { throw new Error('Already verified on disk'); } });
});

test('a server ignoring Range restarts the file instead of appending to it', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.part, f.data.subarray(0, 6));
  await downloadFile({ ...f.opts, fetchImpl: async () => response(f.data) });
  assert.deepEqual(await fs.readFile(f.opts.file), f.data);
});

test('invalid ranges and HTTP errors cannot corrupt a saved partial download', async (t) => {
  const f = await fixture(t);
  const partial = f.data.subarray(0, 6);
  await fs.writeFile(f.part, partial);
  for (const options of [
    { status: 206, headers: { 'Content-Range': `bytes 0-${f.data.length - 1}/${f.data.length}` } },
    { status: 206, headers: { 'Content-Range': `bytes 6-${f.data.length - 1}/${f.data.length + 1}` } },
    { status: 503 },
  ]) {
    await assert.rejects(downloadFile({ ...f.opts, fetchImpl: async () => response(f.data, options) }), /range|503/);
    assert.deepEqual(await fs.readFile(f.part), partial);
  }
});

test('same-size corruption, including saved partial data, never becomes a final model', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.part, Buffer.from('corrupt'));
  await assert.rejects(downloadFile({ ...f.opts, fetchImpl: async () => response(f.data.subarray(7), {
    status: 206, headers: { 'Content-Range': `bytes 7-${f.data.length - 1}/${f.data.length}` },
  }) }), /checksum/);
  await assert.rejects(fs.stat(f.part), { code: 'ENOENT' });
  await assert.rejects(fs.stat(f.opts.file), { code: 'ENOENT' });
  await downloadFile({ ...f.opts, fetchImpl: async () => response(f.data) });
  await fs.writeFile(f.opts.file, Buffer.alloc(f.data.length, 42));
  let downloaded = false;
  await downloadFile({ ...f.opts, fetchImpl: async () => { downloaded = true; return response(f.data); } });
  assert.ok(downloaded);
  assert.deepEqual(await fs.readFile(f.opts.file), f.data);
});

test('oversized data is rejected as it streams, and a complete saved partial needs no network', async (t) => {
  const f = await fixture(t);
  await assert.rejects(downloadFile({ ...f.opts, fetchImpl: async () => response(Buffer.alloc(f.data.length + 1)) }), /larger/);
  await assert.rejects(fs.stat(f.part), { code: 'ENOENT' });
  await fs.writeFile(f.part, f.data);
  await downloadFile({ ...f.opts, fetchImpl: () => { throw new Error('No request needed'); } });
  assert.deepEqual(await fs.readFile(f.opts.file), f.data);
});

test('bounded engine downloads without a known size still verify the complete checksum', async (t) => {
  const f = await fixture(t);
  await downloadFile({ ...f.opts, size: undefined, maxBytes: 100, fetchImpl: async () => response(f.data) });
  assert.deepEqual(await fs.readFile(f.opts.file), f.data);
  await fs.rm(f.opts.file);
  await assert.rejects(downloadFile({ ...f.opts, size: undefined, maxBytes: 100, fetchImpl: async () => response(Buffer.from('bad engine')) }), /checksum/);
});

test('cancel stops a streaming transfer and leaves no final file', async (t) => {
  const f = await fixture(t), ctrl = new AbortController();
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(f.data.subarray(0, 6)); },
  });
  await assert.rejects(downloadFile({ ...f.opts, signal: ctrl.signal, fetchImpl: async () => response(stream),
    onProgress: (bytes) => { if (bytes) ctrl.abort(); },
  }), { name: 'AbortError' });
  await assert.rejects(fs.stat(f.opts.file), { code: 'ENOENT' });
});
