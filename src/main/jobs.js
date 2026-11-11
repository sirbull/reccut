// Bakgrunnsoppgaver: analyse av media, eksport og teksting.
// Tunge jobber kjøres i et skjult arbeidsvindu, så redigeringen forblir jevn.
const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let nextId = 1;
const tasks = new Map();
const listeners = new Set();
const runners = new Map(); // id -> { cancel }

function snapshot() {
  return [...tasks.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30)
    .map(({ id, kind, title, progress, state, error, result, stage, mediaId }) => ({ id, kind, title, progress, state, error, result, stage, mediaId }));
}

let broadcastTimer = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const list = snapshot();
    for (const l of listeners) l(list);
  }, 100);
}

function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(id, patch) {
  const t = tasks.get(id);
  if (!t) return;
  Object.assign(t, patch);
  broadcast();
}

// Køer: analyse kan gå to samtidig, tunge jobber én om gangen.
// Optimalisering har sin egen kø, så den ikke stopper eksport og analyse.
const queues = { light: { limit: 2, running: 0, items: [] }, heavy: { limit: 1, running: 0, items: [] }, optimize: { limit: 1, running: 0, items: [] } };

// mediaId: mediet jobben arbeider med, så klippene kan vise at de analyseres.
function add({ kind, title, queue = 'light', run, silent = false, mediaId = null }) {
  const id = nextId++;
  const task = { id, kind, title, progress: 0, state: 'queued', createdAt: Date.now(), silent, mediaId };
  tasks.set(id, task);
  let resolveDone, rejectDone;
  const done = new Promise((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });
  done.catch(() => {});
  queues[queue].items.push({ id, run, resolveDone, rejectDone });
  pump(queue);
  broadcast();
  return { id, done };
}

function pump(name) {
  const q = queues[name];
  while (q.running < q.limit && q.items.length) {
    const item = q.items.shift();
    const task = tasks.get(item.id);
    if (!task || task.state === 'canceled') continue;
    q.running++;
    update(item.id, { state: 'running' });
    const ctx = {
      id: item.id,
      progress: (p, stage) => update(item.id, { progress: Math.max(0, Math.min(1, p)), ...(stage ? { stage } : {}) }),
      setCancel: (fn) => runners.set(item.id, { cancel: fn }),
      isCanceled: () => tasks.get(item.id)?.state === 'canceled',
    };
    Promise.resolve()
      .then(() => item.run(ctx))
      .then(
        (result) => {
          if (tasks.get(item.id)?.state !== 'canceled') update(item.id, { state: 'done', progress: 1, result });
          item.resolveDone(result);
        },
        (err) => {
          const canceled = tasks.get(item.id)?.state === 'canceled';
          if (!canceled) {
            console.error(err);
            update(item.id, { state: 'error', error: String(err?.message || err) });
          }
          item.rejectDone(err);
        }
      )
      .finally(() => {
        runners.delete(item.id);
        q.running--;
        pump(name);
      });
  }
}

function cancel(id) {
  const t = tasks.get(id);
  if (!t || (t.state !== 'running' && t.state !== 'queued')) return;
  update(id, { state: 'canceled' });
  // A queued job has no runner yet; settle its promise so awaiting UI controls recover.
  for (const queue of Object.values(queues)) {
    const index = queue.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      const [item] = queue.items.splice(index, 1);
      item.rejectDone(new Error('Canceled'));
      return;
    }
  }
  runners.get(id)?.cancel?.();
}

function clearFinished() {
  for (const [id, t] of tasks) if (t.state !== 'running' && t.state !== 'queued') tasks.delete(id);
  broadcast();
}

/* Skjult arbeidsvindu for eksport (Node og WebCodecs) og teksting (Whisper). */

const workers = {};
const pending = new Map();
let jobSeq = 1;

function getWorker(kind) {
  if (workers[kind] && !workers[kind].isDestroyed()) return workers[kind];
  const node = kind === 'export' || kind === 'denoise';
  const win = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      // Eksportvinduet laster bare appens egne filer og trenger direkte filtilgang.
      nodeIntegration: node,
      contextIsolation: !node,
      sandbox: false,
      backgroundThrottling: false,
      preload: node ? undefined : path.join(__dirname, 'preload-worker.js'),
    },
  });
  win.loadFile(path.join(__dirname, '..', '..', 'build', `${kind}.html`));
  win.on('closed', () => {
    workers[kind] = null;
    for (const [jobId, p] of pending) {
      if (p.kind === kind) {
        p.reject(new Error('The background worker window was closed.'));
        pending.delete(jobId);
      }
    }
  });
  workers[kind] = win;
  return win;
}

function runInWorker(kind, payload, ctx) {
  const win = getWorker(kind);
  const jobId = jobSeq++;
  return new Promise((resolve, reject) => {
    pending.set(jobId, { kind, resolve, reject, ctx });
    const sendJob = () => win.webContents.send('worker:job', { jobId, payload });
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', sendJob);
    else sendJob();
    ctx?.setCancel(() => {
      if (kind === 'transcribe') {
        // Interrupt inference and release its WASM/GPU memory immediately.
        pending.delete(jobId);
        reject(new Error('Canceled'));
        if (!win.isDestroyed()) win.destroy();
        return;
      }
      if (!win.isDestroyed()) win.webContents.send('worker:cancel', jobId);
    });
  });
}

ipcMain.on('worker:progress', (_e, { jobId, progress, stage }) => {
  pending.get(jobId)?.ctx?.progress(progress, stage);
});
ipcMain.on('worker:done', (_e, { jobId, result }) => {
  const p = pending.get(jobId);
  pending.delete(jobId);
  p?.resolve(result);
});
ipcMain.on('worker:error', (_e, { jobId, error }) => {
  const p = pending.get(jobId);
  pending.delete(jobId);
  p?.reject(new Error(error));
});

function destroyWorkers() {
  for (const w of Object.values(workers)) if (w && !w.isDestroyed()) w.destroy();
}

function unloadTranscription() {
  if ([...pending.values()].some(p => p.kind === 'transcribe')) return;
  const win = workers.transcribe;
  if (win && !win.isDestroyed()) win.destroy();
}

module.exports = { add, cancel, clearFinished, onChange, snapshot, runInWorker, destroyWorkers, unloadTranscription };
