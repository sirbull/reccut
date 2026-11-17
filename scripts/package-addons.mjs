// Deterministic, offline packaging. Binaries are built separately; model weights
// are never included. Rebuilding a published package must match its pinned hash.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { ZipFile } = require('yazl');
const { validatePackage } = require('../src/main/addonPackages');
const root = path.resolve(import.meta.dirname, '..');
const hash = b => createHash('sha256').update(b).digest('hex');

export async function writePackage(entries, file) {
  const zip = new ZipFile();
  const writing = pipeline(zip.outputStream, createWriteStream(file, { flags: 'wx' }));
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path, 'en'))) {
    zip.addBuffer(entry.data, entry.path, { mtime: new Date('2020-01-01T00:00:00Z'), mode: entry.executable ? 0o100755 : 0o100644, compress: false, forceDosTimestamp: true });
  }
  zip.end();
  await writing;
  return fs.readFile(file);
}

export async function packageAddons({ input, out, version = '1.0.0' }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Supply a semantic package version.');
  await fs.mkdir(out, { recursive: true });
  const catalog = { schemaVersion: 1, packages: {} };
  const references = require('../src/main/ttsCatalog.json').voxcpm.languages;
  const license = Buffer.from('MIT License\n\nCopyright (c) Reccut contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n');
  const add = async (id, entries) => {
    const name = `reccut-${id}-${version}.zip`;
    const data = await writePackage(entries, path.join(out, name));
    const pack = { version, url: `https://github.com/sirbull/reccut/releases/download/addons-v${version}/${name}`, size: data.length, sha256: hash(data),
      files: entries.map(({ path, data, executable }) => ({ path, size: data.length, sha256: hash(data), ...(executable ? { executable: true } : {}) })) };
    validatePackage(pack); catalog.packages[id] = pack;
  };
  for (const [id, asset] of [['keystrokes-mac', 'reccut-keystrokes-mac'], ['keystrokes-win-x64', 'reccut-keystrokes-win-x64.exe'], ['keystrokes-linux-x64', 'reccut-keystrokes-linux-x64']]) {
    await add(id, [{ path: asset, data: await fs.readFile(path.join(input, asset)), executable: true },
      { path: 'LICENSE.txt', data: license }, { path: 'README.md', data: await fs.readFile(path.join(root, 'native/keystrokes/README.md')) }]);
  }
  await add('voxcpm-mac', [{ path: 'reccut-voxcpm-mac', data: await fs.readFile(path.join(input, 'reccut-voxcpm-mac')), executable: true },
    { path: 'LICENSE.txt', data: Buffer.concat(await Promise.all(['llama-cpp-omni-MIT.txt', 'nlohmann-json-MIT.txt'].map(f => fs.readFile(path.join(root, 'assets/licenses', f))))) }]);
  for (const language of references.filter(l => l.source === 'release')) {
    const entries = [];
    for (const voice of language.voices) {
      const spec = voice.reference, data = await fs.readFile(path.join(root, 'native/voxcpm/voices', spec.path));
      if (data.length !== spec.size || hash(data) !== spec.sha256) throw new Error(`Reference checksum mismatch: ${spec.path}`);
      entries.push({ path: spec.path, data });
    }
    entries.push({ path: 'LICENSE.txt', data: await fs.readFile(path.join(root, 'native/voxcpm/voices/LICENSE.txt')) });
    await add(`voxcpm-${language.lang}`, entries);
  }
  await fs.writeFile(path.join(out, 'addonCatalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, out, version] = process.argv.slice(2);
  if (!input || !out) throw new Error('Usage: node scripts/package-addons.mjs <binary directory> <output directory> [package version]');
  const catalog = await packageAddons({ input: path.resolve(input), out: path.resolve(out), version });
  console.log(`Prepared ${Object.keys(catalog.packages).length} pinned ZIP packages.`);
}
