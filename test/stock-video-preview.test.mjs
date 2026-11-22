import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createStockHost } = require('../src/main/stock');
const { validateSource, mapResults } = require('../src/shared/stockSources.cjs');
const { secrets } = require('../src/main/stock/secrets');
const mp4 = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from('ftypisom'), Buffer.alloc(32)]);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNioAAAAASUVORK5CYII=', 'base64');
const video = { id: 7, pageURL: 'https://pixabay.com/videos/7', user: 'Filmer', tags: 'Ocean', videos: {
  tiny: { url: 'https://cdn.pixabay.com/preview.mp4', thumbnail: 'https://cdn.pixabay.com/poster.jpg' },
  medium: { url: 'https://cdn.pixabay.com/original.mp4', width: 1920, height: 1080 },
} };
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-video-preview-'));
const options = dir => ({ dir, cacheDir: path.join(dir, 'cache'), safeStorage: { isEncryptionAvailable: () => false }, lookup: async () => [{ address: '8.8.8.8' }], env: {} });

test('video previews are opt-in, coalesced and cached across hosts; import retains original quality and credits', async () => {
  const dir = temp(), calls = [];
  try {
    const opts = { ...options(dir), fetchImpl: async url => {
      calls.push(url);
      if (url.startsWith('https://pixabay.com/api/')) return new Response(JSON.stringify({ hits: [video] }));
      return new Response(mp4);
    } };
    let host = createStockHost(opts);
    host.addPlugin('pixabay-personal'); host.saveKey('pixabay-personal', 'key');
    const result = await host.search({ query: 'ocean', kind: 'video', provider: 'pixabay-personal' });
    const token = result.items[0].token;
    assert.equal(calls.length, 1, 'search must not fetch preview video');
    assert.equal(result.items[0].videoPreview, undefined);
    const files = await Promise.all([host.videoPreview(token), host.videoPreview(token)]);
    assert.equal(files[0], files[1]); assert.match(files[0], /\.mp4$/);
    assert.deepEqual(calls.slice(1), ['https://cdn.pixabay.com/preview.mp4']);
    assert.deepEqual(fs.readFileSync(await host.videoPreview(token)), mp4);
    assert.equal(calls.length, 2);
    const asset = await host.download(token, path.join(dir, 'out'));
    assert.equal(calls.at(-1), 'https://cdn.pixabay.com/original.mp4', 'a low resolution preview must never replace the import');
    assert.equal(asset.source.author, 'Filmer'); assert.equal(asset.source.videoPreview, undefined);
    host = createStockHost(opts); host.saveKey('pixabay-personal', 'key');
    const again = await host.search({ query: 'ocean', kind: 'video', provider: 'pixabay-personal' });
    const count = calls.length;
    assert.equal(await host.videoPreview(again.items[0].token), files[0]);
    assert.equal(calls.length, count, 'reopening does not redownload the video');
    host.settings({ enabled: false });
    await assert.rejects(host.videoPreview(token), /disabled/);
    assert.equal(calls.length, count);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('preview failures can be retried and invalid or oversized files never enter the cache', async () => {
  const dir = temp(); let mode = 'image';
  try {
    const host = createStockHost({ ...options(dir), fetchImpl: async url => {
      if (url.startsWith('https://pixabay.com/api/')) return new Response(JSON.stringify({ hits: [video] }));
      if (mode === 'large') return new Response(mp4, { headers: { 'Content-Length': '80000001' } });
      return new Response(mode === 'image' ? png : mp4);
    } });
    host.addPlugin('pixabay-personal'); host.saveKey('pixabay-personal', 'key');
    const { items } = await host.search({ query: 'sea', kind: 'video', provider: 'pixabay-personal' });
    await assert.rejects(host.videoPreview(items[0].token), /video preview/);
    mode = 'large'; await assert.rejects(host.videoPreview(items[0].token), /large/);
    assert.ok(!fs.readdirSync(path.join(dir, 'cache')).some(file => file.includes('.video-preview.')));
    mode = 'video'; assert.ok(fs.existsSync(await host.videoPreview(items[0].token)));
    await assert.rejects(host.videoPreview('unknown-token'), /Search again/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Pexels preview selects a small MP4 and leaves the original download mapping intact', () => {
  const source = require('../src/main/stock/keyProviders').find(p => p.id === 'pexels');
  const fields = source.searches.video.results;
  const item = mapResults(source, { videos: [{ id: 8, image: 'https://images.pexels.com/poster.jpg', video_files: [
    { width: 3840, height: 2160, file_type: 'video/mp4', link: 'https://videos.pexels.com/original.mp4' },
    { width: 640, height: 360, file_type: 'video/mp4', link: 'https://videos.pexels.com/small.mp4' },
    { width: 320, height: 180, file_type: 'other', link: 'https://videos.pexels.com/unsupported' },
  ] }] }, { results: fields, kind: 'video' })[0];
  assert.equal(item.videoPreview, 'https://videos.pexels.com/small.mp4');
  assert.equal(item.full, 'https://videos.pexels.com/original.mp4');
});

test('MCP video previews inspect details without calling the original-download tool', async () => {
  const dir = temp(), tools = [], files = [];
  // Test-only reversible storage lets the new host read a fixture OAuth token.
  const storage = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  try {
    secrets(dir, storage).set('magnific:oauth', { access_token: 'test-only', expiresAt: Date.now() + 3600000 });
    const host = createStockHost({ ...options(dir), safeStorage: storage, fetchImpl: async (url, opts) => {
      if (url === 'https://mcp.magnific.com/') {
        const rpc = JSON.parse(opts.body);
        if (rpc.method !== 'tools/call') return new Response(JSON.stringify({ result: {} }));
        tools.push(rpc.params.name);
        if (rpc.params.name === 'stock_search') return new Response(JSON.stringify({ result: { structuredContent: { data: [{ id: 9, title: 'Sea', thumbnails: [{ url: 'https://cdn.example.org/poster.jpg' }], url: 'https://www.magnific.com/video/9' }] } } }));
        assert.equal(rpc.params.name, 'stock_get'); assert.equal(rpc.params.arguments.type, 'video');
        return new Response(JSON.stringify({ result: { structuredContent: { data: { previews: [{ url: 'https://cdn.example.org/watermarked.mp4' }] } } } }));
      }
      files.push(url); return new Response(mp4);
    } });
    host.acceptCosts('magnific');
    const { items } = await host.search({ query: 'ocean', kind: 'video', provider: 'magnific' });
    assert.equal(files.length, 0);
    const file = await host.videoPreview(items[0].token);
    assert.deepEqual(fs.readFileSync(file), mp4);
    assert.deepEqual(tools, ['stock_search', 'stock_get']);
    assert.deepEqual(files, ['https://cdn.example.org/watermarked.mp4']);
    host.signOut('magnific');
    await assert.rejects(host.videoPreview(items[0].token), /Connect/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('video preview mappings validate optional URLs without losing an otherwise usable result', () => {
  const source = require('../src/main/stock/keyProviders')[0];
  assert.ok(validateSource(source));
  const changed = { ...video, videos: { ...video.videos, tiny: { ...video.videos.tiny, url: 'javascript:alert(1)' } } };
  const [item] = mapResults(source, { hits: [changed] }, { results: source.searches.video.results, kind: 'video' });
  assert.equal(item.videoPreview, undefined); assert.ok(item.full);
});
