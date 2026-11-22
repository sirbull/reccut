import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import { newProject, makeClip } from '../src/shared/model.js';
import { previewRanges, previewKey } from '../src/shared/previews.js';
import { createPreviewRenderer } from '../src/main/previews.js';

function timeline() {
  const p = newProject('Previews');
  for (const [start, dur, lane] of [[0, 2, 0], [2, 3, 0], [1, 3, 1], [7, 1, 0]]) {
    const c = makeClip('title', { start, dur, lane });
    p.clips[c.id] = c;
    if (!lane) p.primary.push(c.id);
  }
  p.duration = 8;
  return p;
}

test('single, multiple and Select All ranges merge overlaps and preserve unselected gaps', () => {
  const p = timeline(), ids = Object.keys(p.clips);
  assert.deepEqual(previewRanges(p, [ids[1]]), [{ in: 2, out: 5 }]);
  assert.deepEqual(previewRanges(p, ids), [{ in: 0, out: 5 }, { in: 7, out: 8 }]);
  assert.deepEqual(previewRanges(p, [ids[0], ids[0], 'removed']), [{ in: 0, out: 2 }]);
  assert.deepEqual(previewRanges(p, []), []);
  p.clips[ids[0]].start = 0.01; p.clips[ids[0]].dur = 0.04;
  assert.deepEqual(previewRanges(p, [ids[0]]), [{ in: 0, out: 2 / 30 }]);
});

test('render signatures include layers, captions, media and sequence but ignore navigation and markers', () => {
  const p = timeline(), key = previewKey(p);
  assert.equal(previewKey({ ...p, range: { in: 1, out: 2 }, markers: [{ t: 1 }], name: 'Renamed' }), key);
  for (const mutate of [
    q => q.clips[Object.keys(q.clips)[0]].props.blur = 20,
    q => q.clips[Object.keys(q.clips)[0]].dur = 1,
    q => q.captionStyle.color = '#ff0000',
    q => q.lanes[1] = { hidden: true },
    q => q.media.new = { path: 'relinked.mp4' },
    q => q.sequence = { id: 'another' },
    q => q.fps = 25,
  ]) {
    const q = structuredClone(p); mutate(q); assert.notEqual(previewKey(q), key);
  }
});

test('preview jobs render private files sequentially, report progress and only release their own files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-preview-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const calls = [], progress = [];
  const ctx = { isCanceled: () => false, setCancel() {}, progress: p => progress.push(p) };
  const jobs = { add: spec => {
    assert.equal(spec.kind, 'preview'); assert.equal(spec.queue, 'heavy');
    return { done: Promise.resolve().then(() => spec.run(ctx)) };
  } };
  const host = createPreviewRenderer({ root: path.join(dir, 'cache'), jobs, render: async ({ settings }, ctx) => {
    calls.push(settings); await fs.writeFile(settings.output, 'rendered'); ctx.progress(1);
  } });
  const p = timeline();
  const result = await host.start(p, [{ in: 0, out: 5 }, { in: 7, out: 8 }]);
  assert.equal(calls.length, 2); assert.equal(result.length, 2);
  assert.equal(calls[0].preview, true); assert.equal(calls[0].captions, 'burn');
  assert.deepEqual(progress, [5 / 6, 1]);
  const outside = path.join(dir, 'original.mp4'); await fs.writeFile(outside, 'original');
  await host.release([outside, ...result.map(r => r.file)]);
  assert.equal(await fs.readFile(outside, 'utf8'), 'original');
  for (const r of result) await assert.rejects(fs.stat(r.file), { code: 'ENOENT' });
});

test('failed and canceled preview batches remove completed and partial files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-preview-failure-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  for (const cancel of [false, true]) {
    const root = path.join(dir, String(cancel)); let canceled = false, n = 0;
    const jobs = { add: spec => ({ done: Promise.resolve().then(() => spec.run({ isCanceled: () => canceled, setCancel() {}, progress() {} })) }) };
    const host = createPreviewRenderer({ root, jobs, render: async ({ settings }) => {
      await fs.writeFile(settings.output, 'partial');
      if (++n === 2) { if (cancel) canceled = true; else throw new Error('Decode failed'); }
    } });
    await assert.rejects(host.start(timeline(), [{ in: 0, out: 5 }, { in: 7, out: 8 }]), cancel ? /Canceled/ : /Decode failed/);
    assert.deepEqual(await fs.readdir(root), []);
  }
});

const bundle = (await build({ stdin: { contents: `export * from './src/renderer/editor/previews.js'; export { project, projectEpoch, selection } from './src/renderer/editor/store.js';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'browser' })).outputFiles[0].text;
function renderer() {
  const module = { exports: {} }, released = []; let resolve, reject, calls = 0;
  const api = { onAnalyzed() {}, onTasks() {}, onFlush() {}, listTasks: async () => [],
    renderPreviews: () => { calls++; return new Promise((a, b) => { resolve = a; reject = b; }); },
    releasePreviews: async paths => { released.push(...paths); },
  };
  vm.runInNewContext(bundle, { module, exports: module.exports, window: { api, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, console, structuredClone, performance: { now: () => 0 } });
  const r = module.exports; r.project.value = timeline(); r.selection.value = Object.keys(r.project.value.clips);
  return { ...r, released, finish: value => resolve(value), fail: error => reject(error), calls: () => calls };
}

test('renderer skips already cached selections, clears on edits and rejects results from another project epoch', async () => {
  const r = renderer(), p = r.project.value;
  const pending = r.renderSelectedPreviews();
  assert.equal(r.renderingPreview.value, true);
  assert.match(await r.renderSelectedPreviews(), /already in progress/);
  r.finish([{ in: 0, out: 8, file: '/cache/all.mp4' }]); await pending;
  assert.equal(r.previewsFor(p).length, 1);
  assert.match(await r.renderSelectedPreviews(), /already pre-rendered/);
  assert.equal(r.calls(), 1);
  r.project.value = { ...p, width: 1280 };
  assert.equal(r.previewsFor(r.project.value).length, 0);
  assert.ok(r.released.includes('/cache/all.mp4'));
  const stale = r.renderSelectedPreviews(); r.projectEpoch.value++;
  r.finish([{ in: 0, out: 8, file: '/cache/stale.mp4' }]);
  assert.match(await stale, /timeline changed/);
  assert.ok(r.released.includes('/cache/stale.mp4'));
  assert.equal(r.renderingPreview.value, false);
});

test('failed renderer requests recover so another render can start', async () => {
  const r = renderer(), pending = r.renderSelectedPreviews();
  r.fail(new Error('Canceled')); await assert.rejects(pending, /Canceled/);
  assert.equal(r.renderingPreview.value, false);
  r.selection.value = []; assert.match(await r.renderSelectedPreviews(), /Select timeline clips/);
});
