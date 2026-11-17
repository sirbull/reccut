// Verify archives against a trusted catalogue without executing any helper.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { hashFile } = require('../src/main/downloadFile');
const { validatePackage, unpackPackage } = require('../src/main/addonPackages');
const [input, catalogFile = 'src/main/addonCatalog.json'] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/verify-addon-packages.mjs <download directory> [catalogue]');
const catalog = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
for (const [id, pack] of Object.entries(catalog.packages)) {
  validatePackage(pack);
  const file = path.join(input, path.basename(new URL(pack.url).pathname));
  if ((await fs.stat(file)).size !== pack.size || await hashFile(file) !== pack.sha256) throw new Error(`Package checksum mismatch: ${id}`);
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-verify-addon-'));
  try { await unpackPackage(file, dest, pack); }
  finally { await fs.rm(dest, { recursive: true, force: true }); }
  console.log(`${id}: ZIP and all ${pack.files.length} files verified`);
}
