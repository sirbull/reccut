import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { createSpeechGeneration, speechTiming } from '../src/renderer/voiceover/speech.js';

const require = createRequire(import.meta.url);
const { createTtsJobs } = require('../src/main/ttsJobs.js');

function renderer() {
  let sequence = 0, time = 1000;
  const listeners = new Set(), pending = new Map(), canceled = [];
  const api = {
    onTtsProgress(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ttsGenerate(payload) { return new Promise((resolve, reject) => pending.set(payload.requestId, { resolve, reject })); },
    cancelTask(id) { canceled.push(id); return Promise.resolve(); },
  };
  const controller = createSpeechGeneration(api, { requestId: () => `r${++sequence}`, now: () => time });
  return { controller, pending, canceled, listeners, setTime: (t) => time = t,
    emit(event) { for (const fn of listeners) fn(event); },
  };
}

test('speech progress is scoped to its request and cleans up after success and failure', async () => {
  const f = renderer(), { controller } = f;
  const done = controller.run({ text: 'Hei!' });
  f.emit({ requestId: 'some-other-voice', jobId: 1, progress: 0.8, phase: 'synthesizing' });
  assert.equal(controller.state.value.progress, 0);
  f.setTime(2000);
  f.emit({ requestId: 'r1', jobId: 2, progress: 0, phase: 'synthesizing' });
  f.setTime(6000);
  f.emit({ requestId: 'r1', jobId: 2, progress: 0.25, phase: 'synthesizing' });
  assert.equal(controller.state.value.inferenceStartedAt, 2000);
  assert.equal(controller.state.value.progressAt, 6000);
  const audio = { samples: new Float32Array(4), rate: 24000 };
  f.pending.get('r1').resolve(audio);
  assert.equal(await done, audio);
  assert.equal(controller.state.value, null);
  assert.equal(f.listeners.size, 0);
  const failed = controller.run({ text: 'Hei!' });
  const rejects = assert.rejects(failed, /Model failed/);
  f.pending.get('r2').reject(new Error('Model failed'));
  await rejects;
  assert.equal(controller.state.value, null);
  assert.equal(f.listeners.size, 0);
});

test('cancel before a task id is known stops that task when it is announced and discards late audio', async () => {
  const f = renderer();
  const done = f.controller.run({ text: 'Hei!' });
  const rejects = assert.rejects(done, { name: 'AbortError' });
  f.controller.cancel();
  assert.equal(f.controller.state.value.phase, 'stopping');
  f.emit({ requestId: 'r1', jobId: 7, phase: 'queued' });
  assert.deepEqual(f.canceled, [7]);
  f.pending.get('r1').resolve({ samples: [], rate: 24000 });
  await rejects;
  assert.equal(f.controller.state.value, null);
});

test('a superseded audition cannot overwrite or clear a newer voice request', async () => {
  const f = renderer();
  const old = f.controller.run({ text: 'Old' });
  const rejects = assert.rejects(old, { name: 'AbortError' });
  f.emit({ requestId: 'r1', jobId: 3, phase: 'synthesizing', progress: 0.2 });
  const current = f.controller.run({ text: 'New' });
  f.emit({ requestId: 'r1', jobId: 3, phase: 'synthesizing', progress: 0.9 });
  assert.equal(f.controller.state.value.requestId, 'r2');
  f.pending.get('r1').reject(new Error('Canceled'));
  await rejects;
  assert.equal(f.controller.state.value.requestId, 'r2');
  f.pending.get('r2').resolve('new audio');
  assert.equal(await current, 'new audio');
});

test('remaining time uses completed speech, excludes loading, and counts down between updates', () => {
  const state = { startedAt: 0, progressAt: 5000, inferenceStartedAt: 1000, progress: 0.25, phase: 'synthesizing' };
  assert.deepEqual(speechTiming(state, null, 6000), { elapsed: 6, remaining: 11, percent: 25, determinate: true });
  assert.equal(speechTiming(state, null, 7000).remaining, 10);
  assert.equal(speechTiming({ ...state, progress: 0 }, null, 6000).remaining, null);
  assert.equal(speechTiming({ ...state, phase: 'loading' }, null, 6000).remaining, null);
  assert.equal(speechTiming({ ...state, phase: 'finishing', progress: 1 }, null, 6000).percent, 99);
  assert.equal(speechTiming({ ...state, progress: 0.5 }, { done: 1, total: 3, startedAt: 0 }, 6000).percent, 50);
});

function mainJobs() {
  const events = new Map(), windows = [];
  class WorkerWindow extends EventEmitter {
    constructor() { super(); windows.push(this); this.destroyed = false; this.webContents = { isLoading: () => false, send() {} }; }
    loadFile() {}
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../src/main/jobs.js', import.meta.url), 'utf8'), {
    module, exports: module.exports, __dirname: '/verification', setTimeout, clearTimeout,
    console: { error() {} },
    require: (name) => name === 'electron' ? { BrowserWindow: WorkerWindow, ipcMain: { on: (name, fn) => events.set(name, fn) } } : require(name),
  });
  return { jobs: module.exports, windows, events };
}

test('speech requests run in sequence, forward worker details, and keep audio out of task snapshots', async () => {
  const { jobs } = mainJobs();
  const updates = [];
  const generate = createTtsJobs({ jobs, onProgress: (p) => updates.push(p) });
  let finish;
  const audio = { samples: new Float32Array(240), rate: 24000 };
  const first = generate({ requestId: 'first' }, (_, ctx) => {
    ctx.progress(0.5, 'Generating speech', { phase: 'synthesizing', completed: 1, total: 2 });
    return new Promise((resolve) => finish = () => resolve(audio));
  });
  let ranSecond = false;
  const second = generate({ requestId: 'second' }, async () => { ranSecond = true; return audio; });
  await new Promise(setImmediate);
  assert.equal(ranSecond, false);
  const update = updates.find((p) => p.completed === 1);
  assert.equal(update.requestId, 'first');
  assert.equal(update.progress, 0.5);
  assert.equal(update.total, 2);
  finish();
  assert.equal(await first, audio);
  assert.equal(await second, audio);
  const snapshots = jobs.snapshot();
  assert.equal(snapshots.length, 2);
  for (const task of snapshots) {
    assert.equal(task.state, 'done');
    assert.equal(task.result.duration, 0.01);
    assert.equal(task.result.samples, undefined);
  }
});

test('cancel interrupts a running speech worker, rejects waiting UI, and allows the next request', async () => {
  const { jobs, windows, events } = mainJobs();
  const generate = createTtsJobs({ jobs, onProgress() {} });
  const running = generate({ requestId: 'first' }, (payload, ctx) => jobs.runInWorker('tts', payload, ctx));
  const rejects = assert.rejects(running, /closed|Canceled/);
  await new Promise(setImmediate);
  const id = jobs.snapshot()[0].id;
  jobs.cancel(id);
  await rejects;
  assert.equal(windows[0].isDestroyed(), true);
  assert.equal(jobs.snapshot().find((t) => t.id === id).state, 'canceled');
  const next = generate({ requestId: 'next' }, (payload, ctx) => jobs.runInWorker('tts', payload, ctx));
  await new Promise(setImmediate);
  assert.equal(windows.length, 2);
  const audio = { samples: new Float32Array(10), rate: 24000 };
  events.get('worker:done')(null, { jobId: 2, result: audio });
  assert.equal(await next, audio);
});
