import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { writePackage } from '../../scripts/package-addons.mjs';
export const digest = data => crypto.createHash('sha256').update(data).digest('hex');
export async function packageFixture(entries, { id = 'test', version = '1.0.0' } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reccut-zip-fixture-'));
  try {
    const name = `${id}-${version}.zip`;
    const data = await writePackage(entries, path.join(dir, name));
    return { data, pack: { version, url: `https://github.com/sirbull/reccut/releases/download/addons-v${version}/${name}`,
      size: data.length, sha256: digest(data), files: entries.map(e => ({ path: e.path, size: e.data.length, sha256: digest(e.data), ...(e.executable ? { executable: true } : {}) })) } };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
