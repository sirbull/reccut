import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createHelpWindow } = createRequire(import.meta.url)('../src/main/help.js');

function setup() {
  const handlers = new Map(), windows = [], sent = [];
  class FakeWindow {
    constructor(options) {
      this.options = options; this.listeners = {}; this.destroyed = false; this.focused = false;
      this.webContents = { mainFrame: {}, send: (...args) => sent.push(args), setWindowOpenHandler: (fn) => { this.popup = fn; }, on: (name, fn) => { this.listeners[name] = fn; } };
      for (const method of ['copy', 'cut', 'paste', 'undo', 'redo', 'selectAll']) this.webContents[method] = () => sent.push(['text', method]);
      windows.push(this);
    }
    on(name, callback) { this.listeners[name] = callback; }
    async loadFile(file) { this.file = file; }
    isDestroyed() { return this.destroyed; }
    isMinimized() { return false; }
    isFocused() { return this.focused; }
    show() {}
    focus() { this.focused = true; }
    destroy() { this.destroyed = true; this.listeners.closed?.(); }
  }
  const main = new FakeWindow({});
  const help = createHelpWindow({ BrowserWindow: FakeWindow, ipcMain: { handle: (id, handler) => handlers.set(id, handler) }, getMainWindow: () => main, buildDir: '/test/build' });
  const event = (w) => ({ sender: w.webContents, senderFrame: w.webContents.mainFrame });
  return { main, help, handlers, windows, sent, event };
}

test('Help reuses its own restricted window and rejects other frames', async () => {
  const { main, help, handlers, windows, event } = setup();
  const payload = { request: { article: 'ai-local' }, commands: [{ id: 'tool:blade' }] };
  await handlers.get('help:open')(event(main), payload);
  const manual = windows[1];
  assert.equal(manual.options.webPreferences.nodeIntegration, false);
  assert.equal(manual.options.webPreferences.contextIsolation, true);
  assert.equal(manual.options.webPreferences.sandbox, true);
  assert.deepEqual(manual.popup(), { action: 'deny' });
  let prevented = false;
  manual.listeners['will-navigate']({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await handlers.get('help:open')(event(main), { ...payload, request: { article: 'export' } });
  assert.equal(windows.length, 2);
  assert.equal(handlers.get('help:state')(event(manual)).request.article, 'export');
  await assert.rejects(() => handlers.get('help:open')(event(manual), payload), /Only the main/);
  await assert.rejects(() => handlers.get('help:open')({ sender: main.webContents, senderFrame: {} }, payload), /Only the main/);
  assert.throws(() => handlers.get('help:state')(event(main)), /Only Help/);
  help.destroy();
  assert.equal(manual.isDestroyed(), true);
});

test('only explicit registered commands are forwarded, and focused Help owns text accelerators', async () => {
  const { main, help, handlers, windows, sent, event } = setup();
  await handlers.get('help:open')(event(main), { commands: [{ id: 'copy' }], request: {} });
  const manual = windows[1];
  assert.equal(help.handleMenu('copy'), true);
  assert.deepEqual(sent.at(-1), ['text', 'copy']);
  const count = sent.length;
  assert.equal(help.handleMenu('delete'), true);
  assert.equal(sent.length, count, 'Delete in Help must not alter the editor');
  assert.throws(() => handlers.get('help:command')(event(manual), 'unknown'), /Unknown/);
  assert.throws(() => handlers.get('help:command')(event(main), 'copy'), /Unknown/);
  assert.throws(() => handlers.get('help:update')(event(manual), []), /Only the main/);
  assert.equal(handlers.get('help:command')(event(manual), 'copy'), true);
  assert.deepEqual(sent.at(-1), ['help:command', 'copy']);
  handlers.get('help:update')(event(main), [{ id: 'play', shortcut: 'Space' }]);
  assert.equal(handlers.get('help:state')(event(manual)).commands[0].shortcut, 'Space');
  help.destroy();
});
