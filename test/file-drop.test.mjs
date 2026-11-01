import test from 'node:test';
import assert from 'node:assert/strict';
import { droppedPaths, installFileDrop } from '../src/renderer/fileDrop.js';

function setup(onFiles) {
  const target = new EventTarget();
  const imports = [], hover = [], errors = [];
  const dispose = installFileDrop(target, {
    pathForFile: (file) => file.path,
    onFiles: onFiles || ((paths) => imports.push(paths)),
    onHover: (value) => hover.push(value),
    onError: (error) => errors.push(error.message),
  });
  const send = (type, dataTransfer = { types: ['Files'], files: [{ path: '/clip.mov' }] }, handled = false) => {
    const event = new Event(type, { cancelable: true });
    event.dataTransfer = dataTransfer;
    if (handled) event.preventDefault();
    target.dispatchEvent(event);
    return event;
  };
  return { send, dispose, imports, hover, errors };
}

test('native drops outside local targets accept multiple files and prevent navigation', () => {
  const s = setup();
  const dt = { types: ['Files'], files: [{ path: '/bilder/æ ø.png' }, { path: 'C:\\Users\\Video One.mov' }] };
  assert.ok(s.send('dragover', dt).defaultPrevented);
  assert.equal(dt.dropEffect, 'copy');
  assert.equal(s.hover.at(-1), true);
  assert.ok(s.send('drop', dt).defaultPrevented);
  assert.deepEqual(s.imports, [['/bilder/æ ø.png', 'C:\\Users\\Video One.mov']]);
  assert.equal(s.hover.at(-1), false);
});

test('internal library drags and handled local drops never import twice', () => {
  const s = setup();
  assert.equal(s.send('dragover', { types: ['application/x-reccut'] }).defaultPrevented, false);
  s.send('drop', { types: ['application/x-reccut'] });
  s.send('drop', undefined, true);
  assert.deepEqual(s.imports, []);
});

test('hover survives entering children and clears on leaving, canceling, blur and disposal', () => {
  const s = setup();
  s.send('dragenter'); s.send('dragenter'); s.send('dragleave');
  assert.equal(s.hover.at(-1), true);
  s.send('dragleave');
  assert.equal(s.hover.at(-1), false);
  for (const type of ['dragend', 'blur']) {
    s.send('dragenter'); s.send(type);
    assert.equal(s.hover.at(-1), false);
  }
  s.send('dragenter'); s.dispose();
  assert.equal(s.hover.at(-1), false);
  assert.equal(s.send('drop').defaultPrevented, false);
  assert.deepEqual(s.imports, []);
});

test('path extraction skips nonnative Files and duplicates without losing valid files', () => {
  const files = ['bad', '/one.mov', '', '/one.mov', '/two.wav'];
  assert.deepEqual(droppedPaths({ files }, (file) => {
    if (file === 'bad') throw new Error('Not a native File');
    return file;
  }), ['/one.mov', '/two.wav']);
  const s = setup();
  s.send('drop', { types: ['Files'], files: [{}] });
  assert.equal(s.errors.length, 1);
  assert.equal(s.imports.length, 0);
});

test('asynchronous import failures are reported', async () => {
  const s = setup(async () => { throw new Error('Disk unavailable'); });
  s.send('drop');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(s.errors, ['Disk unavailable']);
});
