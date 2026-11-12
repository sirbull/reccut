// Real offline test of the optional persistent engine. No installation or model
// downloads. Usage: node scripts/test-voxcpm-process.mjs <engine> <model-dir> <reference.wav> [second-reference.wav]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVoxcpmProcess } = require('../src/main/voxcpmProcess');
const { hashFile } = require('../src/main/downloadFile');
const { readWav } = require('../src/main/voxcpm');
const catalog = require('../src/main/ttsCatalog.json').voxcpm;
const [exe, modelDir, reference, secondReference] = process.argv.slice(2).map((p) => path.resolve(p));
if (!exe || !modelDir || !reference) throw new Error('Supply an engine binary, local model directory and synthetic reference WAV.');
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-voxcpm-process-test-'));
let launches = 0;
const client = createVoxcpmProcess({ spawnImpl: (...args) => { launches++; return spawn(...args); } });
const report = { engineRevision: catalog.engine.revision, modelRevision: catalog.model.revision, protocol: 1, measurements: [] };
try {
  const models = catalog.model.files.map((f) => path.join(modelDir, f.path));
  for (const [i, f] of catalog.model.files.entries()) {
    assert.equal((await fs.stat(models[i])).size, f.size);
    assert.equal(await hashFile(models[i]), f.sha256);
  }
  const config = { exe, models, sha256: await hashFile(exe), cwd: dir };
  report.engineSha256 = config.sha256;
  const base = { reference, cfg: catalog.settings.cfg, steps: catalog.settings.steps, timesteps: catalog.settings.timesteps, temperature: catalog.settings.temperature, seed: 42 };
  async function generate(name, mood = 'neutral', ref = reference) {
    const started = performance.now(), output = path.join(dir, name + '.wav');
    let loading = false, readyAt = started;
    const description = catalog.moods.find((m) => m.id === mood).prompt;
    await client.run(config, { ...base, reference: ref, output, text: `(${description} ${catalog.settings.suffix})Dette er ikke vanskelig.` }, {
      onLoading: () => { loading = true; }, onReady: () => { readyAt = performance.now(); },
    });
    const seconds = (performance.now() - started) / 1000;
    const audio = readWav(await fs.readFile(output));
    const row = { name, loading, seconds, loadSeconds: loading ? (readyAt - started) / 1000 : 0, audioSeconds: audio.samples.length / audio.rate, rate: audio.rate, launches };
    report.measurements.push(row); console.log(JSON.stringify(row));
    return audio;
  }
  const cold = await generate('cold'), warm = await generate('warm');
  assert.equal(launches, 1, 'one process must handle both jobs');
  assert.equal(cold.samples.length, warm.samples.length, 'warm decode must reset the preceding sentence');
  let difference = 0;
  for (let i = 0; i < cold.samples.length; i++) difference = Math.max(difference, Math.abs(cold.samples[i] - warm.samples[i]));
  report.maximumSampleDifference = difference;
  assert.ok(difference <= 2 / 32768, `reused model changed audio by ${difference}`);
  await generate('different-mood', 'sad');
  assert.equal(launches, 1);
  if (secondReference) await generate('different-reference', 'neutral', secondReference);
  const reset = await generate('neutral-again');
  assert.deepEqual(reset.samples, cold.samples, 'a changed mood/reference must not leak into the next sentence');
  report.referenceAndMoodReset = true;
  const ctrl = new AbortController();
  let cancelTimer;
  const canceled = client.run(config, { ...base, output: path.join(dir, 'canceled.wav'), text: '(Neutral.)Dette er en lengre setning som vi avbryter før den blir ferdig.' }, {
    signal: ctrl.signal, onReady: () => { cancelTimer = setTimeout(() => ctrl.abort(), 250); },
  });
  try { await assert.rejects(canceled, { name: 'AbortError' }); }
  finally { clearTimeout(cancelTimer); }
  assert.equal(client.running(), false);
  await generate('after-cancel');
  assert.equal(launches, 2, 'cancel must discard the process and allow a clean restart');
  await client.stop();
  report.cancellationAndRestart = true;
  await fs.writeFile(path.join(dir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`PASS: real model reuse, deterministic audio, changed mood, cancellation and restart. Results/audio: ${dir}`);
} finally { await client.stop(); }
