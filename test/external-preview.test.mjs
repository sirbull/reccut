import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { createPreviewConnection } from '../src/renderer/editor/previewConnection.js';

const require = createRequire(import.meta.url);
const { createExternalPreview } = require('../src/main/externalPreview.js');
function setup() {
  const windows = [];
  const handlers = new Map();
  const listeners = new Map();
  const contents = () => Object.assign(new EventEmitter(), {
    mainFrame: {}, messages: [],
    send(...message) { this.messages.push(message); },
    setWindowOpenHandler(handler) { this.openHandler = handler; },
  });
  const main = { webContents: contents(), isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 1440, height: 900 }) };
  const builtIn = { id: 1, label: 'Built-in Display', bounds: { x: 0, y: 0, width: 1440, height: 900 }, size: { width: 1440, height: 900 }, scaleFactor: 2 };
  const external = { id: 2, label: 'Studio Display', bounds: { x: -1920, y: 120, width: 1920, height: 1080 }, size: { width: 1920, height: 1080 }, scaleFactor: 1 };
  let displays = [builtIn, external];
  let current = builtIn;
  let load = () => Promise.resolve();
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = contents(); this.dead = false; windows.push(this); }
    setMenu(menu) { this.menu = menu; }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; this.emit('closed'); }
    loadFile(file) { this.file = file; return load(); }
    setBounds(bounds) { this.bounds = bounds; }
    showInactive() { this.shown = true; }
  }
  const manager = createExternalPreview({
    BrowserWindow: Window,
    ipcMain: { handle: (key, fn) => handlers.set(key, fn), on: (key, fn) => listeners.set(key, fn) },
    screen: { getAllDisplays: () => displays, getDisplayMatching: () => current, getPrimaryDisplay: () => builtIn },
    getMainWindow: () => main, buildDir: '/app/build',
  });
  const event = (sender = main.webContents) => ({ sender, senderFrame: sender.mainFrame });
  return {
    manager, main, windows, external, builtIn,
    read: () => handlers.get('external-preview:state')(event()),
    open: (id = 2, e = event()) => handlers.get('external-preview:open')(e, id),
    close: (e = event()) => handlers.get('external-preview:close')(e),
    emit: (name, sender, message) => listeners.get(`external-preview:${name}`)(event(sender), message),
    displays: (value) => { displays = value; manager.displaysChanged(); },
    moveMain: (value) => { current = value; manager.displaysChanged(); },
    setLoad: (value) => { load = value; },
  };
}

test('preview lists extended displays relative to the editor, with physical pixel sizes', async () => {
  const s = setup();
  assert.deepEqual(s.read().displays, [{ id: 2, label: 'Studio Display', width: 1920, height: 1080 }]);
  s.moveMain(s.external);
  assert.deepEqual(s.read().displays, [{ id: 1, label: 'Built-in Display', width: 2880, height: 1800 }]);
  await assert.rejects(s.open(2), /no longer available/);
  s.displays([s.builtIn, { ...s.external, bounds: s.builtIn.bounds }]);
  s.moveMain(s.builtIn);
  assert.equal(s.read().displays.length, 0, 'mirrored screens are not separate workspaces');
});

test('preview opens on negative display coordinates with a restricted preload and no focus steal', async () => {
  const s = setup();
  const state = await s.open();
  const [w] = s.windows;
  assert.deepEqual(w.bounds, s.external.bounds);
  assert.equal(w.options.frame, false);
  assert.equal(w.options.webPreferences.nodeIntegration, false);
  assert.equal(w.options.webPreferences.sandbox, true);
  assert.match(w.options.webPreferences.preload, /preload-preview\.js$/);
  assert.equal(w.menu, null);
  assert.equal(w.shown, true);
  assert.equal(state.active.id, 2);
  assert.ok(state.session);
  assert.deepEqual(w.webContents.openHandler(), { action: 'deny' });
  let prevented = false;
  w.webContents.emit('will-navigate', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await s.open();
  assert.equal(s.windows.length, 1);
  s.manager.destroy();
});

test('unplugging, moving the editor onto its output, closing and renderer crashes restore local preview', async () => {
  for (const action of ['unplug', 'move', 'close', 'crash']) {
    const s = setup();
    await s.open();
    const [w] = s.windows;
    if (action === 'unplug') s.displays([s.builtIn]);
    if (action === 'move') s.moveMain(s.external);
    if (action === 'close') w.destroy();
    if (action === 'crash') w.webContents.emit('render-process-gone');
    assert.equal(w.dead, true, action);
    assert.equal(s.read().active, null, action);
    assert.equal(s.read().session, null, action);
    assert.equal(s.main.webContents.messages.at(-1)[1].active, null, action);
  }
});

test('display resolution changes reposition the existing output and publish its new size', async () => {
  const s = setup();
  await s.open();
  const next = { ...s.external, bounds: { x: 1440, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 }, scaleFactor: 2 };
  s.displays([s.builtIn, next]);
  assert.equal(s.windows.length, 1);
  assert.deepEqual(s.windows[0].bounds, next.bounds);
  assert.equal(s.read().active.width, 2560);
  s.manager.destroy();
});

test('an output that finishes loading after disconnect never reappears', async () => {
  const s = setup();
  let finish;
  s.setLoad(() => new Promise((resolve) => { finish = resolve; }));
  const opening = s.open();
  s.displays([s.builtIn]);
  finish();
  assert.equal((await opening).active, null);
  assert.equal(s.windows[0].shown, undefined);
});

test('an output that finishes loading after a resolution change uses the latest bounds', async () => {
  const s = setup();
  let finish;
  s.setLoad(() => new Promise((resolve) => { finish = resolve; }));
  const opening = s.open();
  const next = { ...s.external, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, size: { width: 1280, height: 720 } };
  s.displays([s.builtIn, next]);
  finish();
  assert.equal((await opening).active.width, 1280);
  assert.deepEqual(s.windows[0].bounds, next.bounds);
  s.manager.destroy();
});

test('failed output loading restores preview and reports the error', async () => {
  const s = setup();
  s.setLoad(() => Promise.reject(new Error('Missing preview page')));
  await assert.rejects(s.open(), /Missing preview page/);
  assert.equal(s.windows[0].dead, true);
  assert.equal(s.read().active, null);
});

test('only the editor and current preview main frames may signal; stale sessions are ignored', async () => {
  const s = setup();
  const { session } = await s.open();
  const output = s.windows[0].webContents;
  const offer = { session, description: { type: 'offer', sdp: 'local offer' } };
  s.emit('signal', s.main.webContents, offer);
  assert.deepEqual(output.messages.at(-1), ['external-preview:signal', offer]);
  const count = output.messages.length;
  s.emit('signal', {}, offer);
  s.emit('signal', s.main.webContents, { ...offer, session: 'old' });
  s.emit('signal', s.main.webContents, { ...offer, description: { type: 'answer', sdp: 'wrong direction' } });
  assert.equal(output.messages.length, count);
  await assert.rejects(s.open(2, { sender: s.main.webContents, senderFrame: {} }), /Only the editor/);
  assert.throws(() => s.close({ sender: {}, senderFrame: {} }), /Unknown preview/);
  s.emit('ready', output);
  assert.deepEqual(s.main.webContents.messages.at(-1), ['external-preview:signal', { session, ready: true }]);
  const answer = { session, description: { type: 'answer', sdp: 'local answer' } };
  s.emit('signal', output, answer);
  assert.deepEqual(s.main.webContents.messages.at(-1), ['external-preview:signal', answer]);
  s.emit('command', output, 'toggle');
  assert.deepEqual(s.main.webContents.messages.at(-1), ['external-preview:command', 'toggle']);
  const before = s.main.webContents.messages.length;
  s.emit('command', output, 'delete');
  assert.equal(s.main.webContents.messages.length, before);
  s.emit('command', output, 'failed');
  assert.equal(s.read().active, null);
  assert.equal(s.main.webContents.messages.at(-1)[0], 'external-preview:error');
});

test('preview connection exchanges local descriptions, delivers video and stops every track', async () => {
  const peers = [];
  class Peer {
    constructor(config) { this.config = config; peers.push(this); this.iceGatheringState = 'complete'; }
    addTrack(track, stream) { this.track = track; this.stream = stream; }
    async createOffer() { return { type: 'offer', sdp: 'offer' }; }
    async createAnswer() { return { type: 'answer', sdp: 'answer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    close() { this.closed = true; }
  }
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }] };
  const failures = [];
  const sent = [];
  const received = [];
  const sender = createPreviewConnection({ Peer, stream, send: (d) => sent.push(d), onError: (e) => failures.push(e) });
  const receiver = createPreviewConnection({ Peer, send: (d) => sent.push(d), onStream: (s) => received.push(s), onError: (e) => failures.push(e) });
  try {
    await sender.offer();
    await receiver.receive(sent[0]);
    await sender.receive(sent[1]);
    peers[1].ontrack({ streams: [stream] });
    assert.deepEqual(peers[0].config, { iceServers: [] });
    assert.equal(peers[0].stream, stream);
    assert.equal(peers[0].remoteDescription.type, 'answer');
    assert.deepEqual(received, [stream]);
    assert.equal(failures.length, 0);
    peers[0].connectionState = 'failed';
    peers[0].onconnectionstatechange();
    assert.match(failures[0].message, /disconnected/);
  } finally { sender.close(); receiver.close(); }
  assert.equal(stopped, 1);
  assert.ok(peers.every((p) => p.closed));
});
