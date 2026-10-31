import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function setup() {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(new URL('../src/main/jobs.js', import.meta.url), 'utf8'), {
    module,
    exports: module.exports,
    require: (name) => (name === 'electron' ? { ipcMain: { on() {} } } : require(name)),
    setTimeout,
    clearTimeout,
    console,
    __dirname: '/verification',
  });
  return module.exports;
}
test('canceling a queued processor rejects its waiting promise without running it', async () => {
  const jobs = setup();
  let finish,
    ran = false;
  const first = jobs.add({ title: 'First', queue: 'heavy', run: () => new Promise((r) => (finish = r)) });
  await new Promise((r) => setImmediate(r));
  const queued = jobs.add({
    title: 'Processor',
    queue: 'heavy',
    run: () => {
      ran = true;
    },
  });
  jobs.cancel(queued.id);
  await assert.rejects(queued.done, /Canceled/);
  assert.equal(ran, false);
  finish('done');
  assert.equal(await first.done, 'done');
  const next = jobs.add({ title: 'Next', queue: 'heavy', run: () => 42 });
  assert.equal(await next.done, 42);
});
