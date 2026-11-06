import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const model = require('../src/main/designModels.js');
const root = path.resolve(import.meta.dirname, '..', 'vendor', 'models');
const checksum = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
for (const item of model.models) for (const file of item.files) {
  const target = path.join(root, item.id, file.file);
  let existing;
  try { existing = await fs.readFile(target); } catch {}
  if (existing && checksum(existing) === file.sha256) continue;
  console.log(`Downloading ${item.id}/${file.file}…`);
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Model download failed (${response.status}): ${file.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (checksum(bytes) !== file.sha256) throw new Error(`Model checksum mismatch: ${file.file}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  try { await fs.writeFile(temporary, bytes); await fs.rename(temporary, target); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}
console.log(`Background models verified locally (MIT).`);
await import('./fetch-subtitle-model.mjs');
