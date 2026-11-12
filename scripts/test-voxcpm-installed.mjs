// Real backend smoke check against an explicit, already installed directory.
// No download or project writes. This checks integration, not pronunciation.
// Usage: node scripts/test-voxcpm-installed.mjs <installed-directory> [report.json]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVoxcpm } = require('../src/main/voxcpm');
const { version } = require('../package.json');
const dir = process.argv[2] && path.resolve(process.argv[2]);
if (!dir) throw new Error('Supply the installed VoxCPM2 directory. Nothing is downloaded.');
const manager = createVoxcpm({ dir, version, fetchImpl: async () => { throw new Error('No network allowed in installed-voice check.'); } });
const report = { version, networkRequests: 0, checks: [] };
try {
  const status = await manager.status();
  assert.ok(status.installed && status.engine && status.supported);
  for (const [lang, voice, mood, text] of [
    ['en-us', 'en-us-female-1', 'warm', 'We can find a way together.'],
    ['nb', 'nb-male-1', 'sensual', 'Ta en liten pause. Vi finner en god vei videre sammen.'],
  ]) {
    assert.ok(status.languages[lang].installed);
    const updates = [], started = performance.now();
    const audio = await manager.generate({ engine: 'voxcpm', lang, voice, mood, text }, {
      isCanceled: () => false, setCancel: () => {}, progress: (...args) => updates.push(args),
    });
    assert.equal(audio.rate, 48000);
    assert.ok(audio.samples.length > 24000 && audio.samples.every(Number.isFinite));
    assert.ok(audio.samples.some((v) => Math.abs(v) > 0.001));
    assert.equal(updates.at(-1)[0], 1);
    const row = { lang, voice, mood, text, rate: audio.rate, duration: audio.samples.length / audio.rate, elapsedSeconds: (performance.now() - started) / 1000,
      sha256Float32: crypto.createHash('sha256').update(Buffer.from(audio.samples.buffer, audio.samples.byteOffset, audio.samples.byteLength)).digest('hex'),
      sentences: updates.at(-1)[2].total, modelLoadingEvents: updates.filter((u) => u[2].phase === 'loading').length };
    report.checks.push(row); console.log(JSON.stringify(row));
  }
  assert.equal(report.checks[0].modelLoadingEvents, 1);
  assert.equal(report.checks[1].modelLoadingEvents, 0, 'the next language reuses the real loaded model');
  if (process.argv[3]) await fs.writeFile(path.resolve(process.argv[3]), JSON.stringify(report, null, 2) + '\n');
  console.log('PASS: installed catalog references, real model, English/Norwegian expressions, sentence progress and warm model reuse.');
} finally { await manager.stop(); }
