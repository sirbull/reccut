import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { voicePackageRows, suggestedVoicePackages } from '../src/shared/voicePackages.js';
const require = createRequire(import.meta.url);
const { subtitleRecommendation, backgroundRecommendation, voiceRecommendations, rotoRecommendation } = require('../src/shared/modelRecommendations.cjs');
const models = require('../src/main/subtitleCatalog');
const voices = require('../src/main/ttsCatalog.json');
const backgrounds = require('../src/main/designModels').models;

test('subtitle recommendations scale conservatively and never suggest an incompatible model', () => {
  for (const [ramGB, cpuThreads, id] of [[4, 4, 'tiny'], [6, 12, 'tiny'], [64, 2, 'tiny'], [12, 12, 'base'], [16, 4, 'base'], [16, 8, 'small'], [32, 12, 'medium']]) {
    const result = subtitleRecommendation(models, { ramGB, cpuThreads, platform: 'win32', arch: 'x64' });
    assert.equal(result.id, `whisper-${id}`);
    assert.ok(result.reason);
  }
  assert.equal(subtitleRecommendation(models, {}).id, 'whisper-base');
  assert.equal(subtitleRecommendation(models, { ramGB: 1, cpuThreads: 2 }), null);
  assert.equal(subtitleRecommendation(models, { ramGB: 64, cpuThreads: 32, platform: 'win32', arch: 'ia32' }), null);
  assert.notEqual(subtitleRecommendation(models.map(m => m.id === 'whisper-small' ? { ...m, status: 'unsupported' } : m), { ramGB: 16, cpuThreads: 8 }).id, 'whisper-small');
});

test('background suggestions follow worker compatibility rather than a GPU speed claim', () => {
  assert.equal(backgroundRecommendation(backgrounds, null), null);
  assert.equal(backgrounds.find(m => m.id === backgroundRecommendation(backgrounds, true).id).gpu, true);
  assert.equal(backgrounds.find(m => m.id === backgroundRecommendation(backgrounds, false).id).gpu, false);
});

test('voices respect language, platform and hardware without preferring a heavy unavailable engine', () => {
  const rows = voicePackageRows(voices, { voxcpm: { supported: true } });
  const low = { ramGB: 4, cpuThreads: 2 }, high = { ramGB: 32, cpuThreads: 12 };
  assert.equal(suggestedVoicePackages(rows, ['nb-NO'], low).has('piper:no_NO-talesyntese-medium'), true);
  assert.equal(suggestedVoicePackages(rows, ['en-US'], low).has('kokoro'), true);
  assert.equal(suggestedVoicePackages(rows, ['nb-NO'], high).has('voxcpm:nb'), true);
  assert.ok(!voiceRecommendations(rows, low).some(r => r.key.startsWith('voxcpm:')));
  const unsupported = voicePackageRows(voices, { voxcpm: { supported: false } });
  assert.ok(!voiceRecommendations(unsupported, high).some(r => r.key.startsWith('voxcpm:')));
  const installed = rows.map(r => r.key === 'piper:no_NO-talesyntese-medium' ? { ...r, installed: true } : r);
  assert.equal(suggestedVoicePackages(installed, ['nb-NO'], low).size, 0, 'do not suggest a duplicate package when the recommended one is installed');
});

test('Roto Brush favors Small on constrained hardware and Base+ with headroom', () => {
  const roto = ['small', 'base', 'large'].map(id => ({ id }));
  assert.equal(rotoRecommendation(roto, { ramGB: 8, cpuThreads: 8 }).id, 'small');
  assert.equal(rotoRecommendation(roto, { ramGB: 64, cpuThreads: 2 }).id, 'small');
  assert.equal(rotoRecommendation(roto, { ramGB: 16, cpuThreads: 8 }).id, 'base');
  assert.equal(rotoRecommendation(roto, {}).id, 'small');
});

test('model-manager advice stays offline without selecting, installing or rewriting models', async t => {
  const { SubtitleModelManager } = require('../src/main/subtitleModels');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-model-advice-'));
  const before = structuredClone(models);
  const manager = new SubtitleModelManager({ dir, ram: 12 * 1024 ** 3, cpuThreads: 12, fetchImpl: () => { throw Error('No downloads allowed'); } });
  t.after(async () => { await manager.shutdown(); await fs.rm(dir, { recursive: true, force: true }); });
  await manager.ready;
  const state = await manager.listAvailableModels();
  assert.equal(state.hardware.cpuThreads, 12);
  assert.equal(state.recommendation.id, 'whisper-base');
  assert.deepEqual(state.models.filter(m => m.recommended).map(m => m.id), ['whisper-base']);
  assert.equal(state.active, null);
  assert.equal(state.models.some(m => m.installed), false);
  assert.deepEqual(models, before);
  assert.ok(require('../package.json').build.files.includes('src/shared/modelRecommendations.cjs'), 'main-process helper ships in the packaged app');
});
