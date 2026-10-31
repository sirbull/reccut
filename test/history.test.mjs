import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const history = require('../src/main/history.js');

const p = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;

test('versjonshistorikken lagrer, hopper over like versjoner og tynner ut', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-hist-'));
  const file = path.join(dir, 'Film.reccut');
  fs.writeFileSync(file, '{"a":1}');
  const a = await history.snapshot(file, '{"a":1}', { force: true });
  assert.ok(a && fs.existsSync(a));
  assert.equal(await history.snapshot(file, '{"a":1}', { force: true }), null, 'samme innhold lagres ikke igjen');
  assert.equal(await history.snapshot(file, '{"a":2}'), null, 'for kort tid siden');
  // Lag mange gamle kopier: hvert 10. minutt de siste 40 dagene.
  const hd = history.historyDir(file);
  const now = Date.now();
  for (let t = now - 40 * 864e5; t < now - 3 * 60e3; t += 10 * 60e3) fs.writeFileSync(path.join(hd, `Film ${stamp(new Date(t))}.reccut.gz`), 'x');
  const before = (await history.list(file)).length;
  await history.prune(file);
  const after = await history.list(file);
  assert.ok(before > 5000 && after.length < 130, `${before} -> ${after.length}`);
  // Den eldste dagen er fortsatt med (én per dag eller uke).
  assert.ok(now - after[after.length - 1].time > 33 * 864e5, 'eldre uker beholdes');
  // Alt fra de siste to timene er beholdt.
  assert.ok(after.filter((x) => now - x.time < 2 * 3600e3).length >= 11);
  const data = await history.read(a);
  assert.deepEqual(data, { a: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('versjoner sammenlignes riktig, og riktig installasjonsfil velges', () => {
  const { newer, pickAsset } = require('../src/main/updates.js');
  assert.ok(newer('0.10.0', '0.9.9'));
  assert.ok(newer('v1.0.0', '0.2.0'));
  assert.ok(!newer('0.2.0', '0.2.0'));
  assert.ok(!newer('0.1.9', '0.2.0'));
  const assets = [{ name: 'Reccut-0.3.0.dmg' }, { name: 'Reccut Setup 0.3.0.exe' }, { name: 'Reccut-0.3.0.AppImage' }];
  const a = pickAsset(assets);
  assert.ok(a && (process.platform === 'linux' ? /AppImage/.test(a.name) : true));
});
