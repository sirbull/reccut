import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { validateDesignTemplate } from '../src/shared/designTemplates.js';

const require = createRequire(import.meta.url);
const { createStockHost, imageType } = require('../src/main/stock');
const catalogUrl = 'https://sirbull.github.io/reccut/design-catalog/index.json';
const catalogRoot = new URL('../docs/design-catalog/', import.meta.url);

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-catalog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  let offline = false;
  const create = () => createStockHost({
    dir, cacheDir: path.join(dir, 'cache'),
    safeStorage: { isEncryptionAvailable: () => false },
    lookup: async () => [{ address: '8.8.8.8' }],
    fetchImpl: async url => {
      calls.push(url);
      if (offline) throw Error('Offline');
      assert.ok(url.startsWith(new URL('.', catalogUrl).href));
      return new Response(fs.readFileSync(new URL(url.slice(new URL('.', catalogUrl).href.length), catalogRoot)));
    },
  });
  return { dir, calls, create, goOffline() { offline = true; } };
}

test('fresh profiles load the published catalog on demand with valid relative templates and previews', async t => {
  const f = fixture(t), host = f.create();
  assert.equal(host.settings().catalog, catalogUrl);
  assert.deepEqual(f.calls, [], 'creating a host and reading settings must not start downloads');
  const entries = await host.catalog();
  assert.equal(entries.length, 22);
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.url.startsWith(new URL('templates/', catalogUrl).href));
    assert.ok(entry.preview.startsWith(new URL('previews/', catalogUrl).href));
    const file = new URL(entry.url.slice(new URL('.', catalogUrl).href.length), catalogRoot);
    const template = validateDesignTemplate(JSON.parse(fs.readFileSync(file, 'utf8')));
    assert.equal(template.name, entry.name);
    const preview = await host.catalogPreview(entry.id);
    assert.equal(imageType(fs.readFileSync(preview)), 'png');
  }
  assert.equal(f.calls.length, 23, 'one index request and one preview request per card');
  f.goOffline();
  const restarted = f.create();
  assert.deepEqual(await restarted.catalog(), entries, 'cached list survives restart without a connection');
  await restarted.catalogPreview(entries[0].id);
  assert.equal(f.calls.length, 23, 'cached previews do not make network requests');
  restarted.settings({ enabled: false });
  assert.deepEqual(await restarted.catalog(), [], 'disabling online resources hides even cached catalog entries');
  assert.equal(f.calls.length, 23);
});

test('saved catalog choices survive upgrades, unrelated settings changes and restarts', async t => {
  const f = fixture(t);
  for (const catalog of ['https://templates.example.org/custom/index.json', '']) {
    fs.writeFileSync(path.join(f.dir, 'settings.json'), JSON.stringify({ catalog, enabled: false, sources: { openverse: false } }));
    const host = f.create();
    assert.equal(host.settings().catalog, catalog);
    host.settings({ enabled: true });
    assert.equal(f.create().settings().catalog, catalog);
    assert.equal(f.create().settings().sources.openverse, false);
    if (!catalog) assert.deepEqual(await host.catalog(), []);
  }
  assert.deepEqual(f.calls, []);
  fs.writeFileSync(path.join(f.dir, 'settings.json'), JSON.stringify({ enabled: false }));
  const legacy = f.create();
  assert.equal(legacy.settings().catalog, catalogUrl, 'profiles with no catalog field get the default');
  assert.deepEqual(await legacy.catalog(), []);
  const fresh = f.create();
  fresh.settings({ catalog: '' });
  assert.equal(f.create().settings().catalog, '', 'clearing and saving remains off after restart');
});

test('an unavailable catalog leaves offline templates usable and catalog URLs still require HTTPS', async t => {
  const f = fixture(t), host = f.create();
  f.goOffline();
  assert.deepEqual(await host.catalog(), []);
  assert.throws(() => host.settings({ catalog: 'http://templates.example.org/index.json' }), /HTTPS/);
  assert.equal(host.settings().catalog, catalogUrl, 'rejected settings must not change the active catalog');
  const { BUILTIN_DESIGN_TEMPLATES } = await import('../src/shared/designTemplates.js');
  assert.ok(BUILTIN_DESIGN_TEMPLATES.length >= 22);
});
