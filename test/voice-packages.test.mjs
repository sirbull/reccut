import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installVoicePackages, selectedVoicePackages, suggestedVoicePackages, voiceLanguageForLocale, voicePackageBytes, voicePackageRows } from '../src/shared/voicePackages.js';
const require = createRequire(import.meta.url);
const catalog = require('../src/main/ttsCatalog.json');
const { createVoicePackages } = require('../src/main/voicePackages.js');

function fixture() {
  const c = structuredClone(catalog), state = { addon: false, voxcpm: { supported: true } };
  c.voxcpm.languages = ['nb', 'sv'].map((lang) => ({ lang, voices: [{ id: `${lang}-female`, name: 'Woman', reference: { size: 400000 } }] }));
  return { c, state, rows: voicePackageRows(c, state) };
}

test('the chooser remembers being shown across restarts without authorizing any installation', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-voice-consent-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const options = { file: path.join(dir, 'voice-packages.json'), systemLanguage: 'nb-NO', appLanguage: 'en-GB' };
  const chooser = createVoicePackages(options);
  assert.equal((await chooser.status()).voicePackagesAsked, false);
  assert.deepEqual(await fs.readdir(dir), [], 'status has no side effects');
  await Promise.all([chooser.markAsked(), chooser.markAsked()]);
  assert.equal((await createVoicePackages(options).status()).voicePackagesAsked, true);
  assert.deepEqual(JSON.parse(await fs.readFile(options.file, 'utf8')), { voicePackagesAsked: true });
  assert.equal((await chooser.status()).systemLanguage, 'nb-NO');
});

test('all package rows explain their use, size and license and can be searched by language', () => {
  const { rows } = fixture();
  for (const row of rows) {
    assert.ok(row.name && row.use && row.license && row.size > 0, row.key);
    assert.ok(Array.isArray(row.languages));
    if (row.key !== 'voxcpm:model') assert.ok(row.samples.length, row.key);
  }
});

test('suggestions use app and system languages, prefer native voices, and select no unavailable package', () => {
  const { rows } = fixture();
  assert.equal(voiceLanguageForLocale('nn-NO'), 'nb');
  assert.equal(voiceLanguageForLocale('no_NO'), 'nb');
  assert.equal(voiceLanguageForLocale('pt-BR'), 'pt-br');
  const picked = suggestedVoicePackages(rows, ['nb-NO', 'en-GB', 'nb-NO']);
  assert.deepEqual([...picked], ['voxcpm:nb', 'kokoro']);
  const preparing = structuredClone(catalog); preparing.voxcpm.languages = [];
  const withoutVox = voicePackageRows(preparing, { voxcpm: { supported: true } });
  assert.deepEqual([...suggestedVoicePackages(withoutVox, ['nb-NO'])], ['piper:no_NO-talesyntese-medium']);
  assert.ok(!selectedVoicePackages(withoutVox, new Set(['voxcpm:model'])).length, 'do not offer an unusable model before voices are approved');
});

test('English and German packages expose the shared expressions independently of Norwegian approval', () => {
  const { c, state } = fixture();
  c.voxcpm.languages = ['en-us', 'de'].map((lang) => ({ lang, voices: [{ id: `${lang}-woman`, name: 'Test Woman', reference: { size: 400000 } }] }));
  const rows = voicePackageRows(c, state);
  for (const lang of ['en-us', 'de']) {
    const row = rows.find((r) => r.key === `voxcpm:${lang}`);
    assert.match(row.detail, /10 expressions, including warm and sensual/);
    assert.equal(row.samples.length, c.voxcpm.moods.length);
    for (const mood of ['warm', 'sensual']) assert.ok(row.samples.some((s) => s.path === `voxcpm/${lang}-woman-${mood}.ogg`));
    assert.deepEqual([...suggestedVoicePackages(rows, [lang])], [`voxcpm:${lang}`]);
  }
  assert.ok(!rows.some((r) => r.key === 'voxcpm:nb'));
});

test('selecting two languages counts the shared VoxCPM2 model once and skips it after installation', () => {
  const { c, state, rows } = fixture(), picked = new Set(['voxcpm:nb', 'voxcpm:sv']);
  assert.deepEqual(selectedVoicePackages(rows, picked).map((r) => r.key), ['voxcpm:model', 'voxcpm:nb', 'voxcpm:sv']);
  assert.equal(voicePackageBytes(rows, picked, c, state), c.voxcpm.model.files.reduce((n, f) => n + f.size, 0) + 800000);
  state.voxcpm.installed = true;
  assert.equal(voicePackageBytes(voicePackageRows(c, state), picked, c, state), 800000);
});

test('Kokoro and multiple Piper packs count the pronunciation add-on once', () => {
  const { c, state, rows } = fixture(), picked = new Set(['kokoro', 'piper:no_NO-talesyntese-medium', 'piper:sv_SE-nst-medium']);
  const base = selectedVoicePackages(rows, picked).reduce((n, r) => n + r.size, 0);
  assert.equal(voicePackageBytes(rows, picked, c, state), base + c.phonemizer.size);
  assert.equal(voicePackageBytes(rows, picked, c, { ...state, addon: true }), base);
  assert.equal(voicePackageBytes(rows, new Set(), c, state), 0);
});

test('an installed language can acquire the matching engine after an app update without downloading the model again', () => {
  const { c, state } = fixture();
  state.voxcpm = { supported: true, installed: true, engine: false, languages: { nb: { installed: true } } };
  const rows = voicePackageRows(c, state), picked = new Set(['voxcpm:nb']);
  assert.deepEqual(selectedVoicePackages(rows, picked).map((r) => r.key), ['voxcpm:nb']);
  assert.equal(voicePackageBytes(rows, picked, c, state), 400000);
});

test('selection and suggestions do not install; explicit download enqueues packages without duplicate model jobs', async () => {
  const { rows } = fixture(), calls = [], errors = [], settled = [];
  const api = {
    ttsInstall: async () => { calls.push('kokoro'); },
    ttsPiperInstall: async (id) => { calls.push(id); throw new Error('Test failure'); },
    ttsVoxcpmInstall: async (lang) => { calls.push(`voxcpm:${lang}`); },
  };
  const picked = new Set([...suggestedVoicePackages(rows, ['nb', 'en-GB']), 'voxcpm:sv', 'piper:no_NO-talesyntese-medium']);
  selectedVoicePackages(rows, picked);
  assert.deepEqual(calls, []);
  await installVoicePackages(api, rows, picked, { onError: (r) => errors.push(r.key), onSettled: (r) => settled.push(r.key) });
  assert.deepEqual(calls, ['voxcpm:nb', 'voxcpm:sv', 'kokoro', 'no_NO-talesyntese-medium']);
  assert.deepEqual(errors, ['piper:no_NO-talesyntese-medium']);
  assert.equal(settled.length, 4);
});

test('unavailable platforms and already installed packages never enqueue downloads', async () => {
  const { c } = fixture();
  const rows = voicePackageRows(c, { installed: true, voxcpm: { supported: false } });
  let called = false;
  await installVoicePackages({ ttsVoxcpmInstall: () => { called = true; }, ttsInstall: () => { called = true; } }, rows, new Set(['kokoro', 'voxcpm:nb', 'voxcpm:model']));
  assert.equal(called, false);
});
