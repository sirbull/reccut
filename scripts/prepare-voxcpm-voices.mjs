// Prepare the small synthetic reference assets for the same release as the
// engine. No weights, downloads, credentials or publishing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hashFile } = require('../src/main/downloadFile');
const { readWav } = require('../src/main/voxcpm');
const catalog = require('../src/main/ttsCatalog.json').voxcpm;
const root = path.resolve(import.meta.dirname, '..');
const out = process.argv[2] && path.resolve(process.argv[2]);
if (!out) throw new Error('Supply a release artifact directory.');
await fs.mkdir(out, { recursive: true });
const references = [];
for (const l of catalog.languages.filter((l) => l.source === 'release')) for (const v of l.voices) {
  const f = v.reference;
  if (path.basename(f.path) !== f.path || !/^reccut-voxcpm-[a-z0-9-]+\.wav$/.test(f.path)) throw new Error('Invalid reference asset name.');
  const source = path.join(root, 'native/voxcpm/voices', f.path);
  if ((await fs.stat(source)).size !== f.size || await hashFile(source) !== f.sha256) throw new Error(`Reference checksum mismatch: ${f.path}`);
  const audio = readWav(await fs.readFile(source));
  if (audio.rate !== 48000 || audio.samples.length === 0 || audio.samples.length > audio.rate * 10) throw new Error(`Invalid reference audio: ${f.path}`);
  await fs.copyFile(source, path.join(out, f.path));
  await fs.writeFile(path.join(out, f.path + '.sha256'), `${f.sha256}  ${f.path}\n`);
  references.push({ lang: l.lang, voice: v.id, ...f });
}
await fs.writeFile(path.join(out, 'reccut-voxcpm-voices.json'), JSON.stringify({ license: 'MIT', synthetic: true, references }, null, 2) + '\n');
await fs.copyFile(path.join(root, 'native/voxcpm/voices/LICENSE.txt'), path.join(out, 'reccut-voxcpm-voices.LICENSE.txt'));
console.log(`Prepared ${references.length} synthetic references (${references.reduce((n, f) => n + f.size, 0)} bytes).`);
