// Explicit developer installation from existing local files. Uses the normal
// verified installer with an offline file source; never downloads anything.
// Usage: node scripts/install-voxcpm-local.mjs <engine> <model-dir> <destination> [lang,lang]
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVoxcpm } = require('../src/main/voxcpm');
const { hashFile } = require('../src/main/downloadFile');
const { version } = require('../package.json');
const catalog = require('../src/main/ttsCatalog.json').voxcpm;
const root = path.resolve(import.meta.dirname, '..');
const [engine, modelDir, dir] = process.argv.slice(2, 5).map((p) => path.resolve(p));
if (!engine || !modelDir || !dir) throw new Error('Supply the local engine, model directory and explicit destination.');
const languages = process.argv[5]?.split(',') || catalog.languages.map((l) => l.lang);
if (languages.some((lang) => !catalog.languages.some((l) => l.lang === lang))) throw new Error('Unknown language.');
const files = new Map(catalog.model.files.map((f) => [f.path, path.join(modelDir, f.path)]));
for (const l of catalog.languages) for (const v of l.voices) files.set(v.reference.path, path.join(root, 'native/voxcpm/voices', v.reference.path));
files.set('reccut-voxcpm-mac', engine);
const engineHash = await hashFile(engine);
const manager = createVoxcpm({ dir, version, fetchImpl: async (url, { signal, headers = {} } = {}) => {
  signal?.throwIfAborted();
  const name = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
  if (name === 'reccut-voxcpm-mac.sha256') return new Response(`${engineHash}  reccut-voxcpm-mac\n`);
  const file = files.get(name);
  if (!file) throw new Error('The offline installer has no local file for this asset.');
  const size = (await fs.stat(file)).size;
  const range = headers.Range;
  if (range && !/^bytes=\d+-$/.test(range)) throw new Error('Invalid resume range.');
  const start = range ? Number(range.slice(6, -1)) : 0;
  if (start >= size) return new Response(null, { status: 416 });
  return new Response(Readable.toWeb(createReadStream(file, { start, signal })), { status: start ? 206 : 200,
    headers: { 'Content-Length': String(size - start), ...(start ? { 'Content-Range': `bytes ${start}-${size - 1}/${size}` } : {}) } });
} });
try {
  for (const lang of languages) { await manager.installLanguage(lang); console.log(`Installed ${lang} from verified local files.`); }
  const state = await manager.status();
  if (!state.installed || !state.engine || languages.some((lang) => !state.languages[lang]?.installed)) throw new Error('Incomplete local installation.');
  console.log(`Local voices ready in ${dir}. No network requests were made.`);
} finally { await manager.stop(); }
