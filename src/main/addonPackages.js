// Optional add-ons use immutable, independently versioned ZIP packages. Nothing
// is fetched until a feature's explicit install action calls stagePackage.
const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl');
const { downloadFile } = require('./downloadFile');

const MAX_BYTES = 64 * 1024 * 1024;
const safeName = (name) => typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
function validatePackage(pack) {
  if (!pack || !/^\d+\.\d+\.\d+$/.test(pack.version) || !/^[a-f0-9]{64}$/.test(pack.sha256) ||
      !Number.isSafeInteger(pack.size) || pack.size <= 0 || pack.size > MAX_BYTES) throw new Error('Invalid add-on package metadata.');
  const url = new URL(pack.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !url.pathname.endsWith('.zip')) throw new Error('Invalid add-on package URL.');
  if (!Array.isArray(pack.files) || !pack.files.length || pack.files.length > 64) throw new Error('Invalid add-on package files.');
  const names = new Set();
  let bytes = 0;
  for (const f of pack.files) {
    if (!safeName(f.path) || names.has(f.path.toLowerCase()) || !Number.isSafeInteger(f.size) || f.size <= 0 ||
        !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Invalid add-on package file metadata.');
    names.add(f.path.toLowerCase()); bytes += f.size;
  }
  if (bytes > MAX_BYTES) throw new Error('The add-on package is larger than allowed.');
}

async function unpackPackage(file, dest, pack, signal) {
  validatePackage(pack);
  signal?.throwIfAborted();
  // Callers provide an empty staging directory, never a live installation.
  if ((await fs.readdir(dest)).length) throw new Error('The add-on staging directory must be empty.');
  const expected = new Map(pack.files.map(f => [f.path, f]));
  const zip = await yauzl.openPromise(file, { strictFileNames: true });
  const abort = () => zip.close();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for await (const entry of zip.eachEntry()) {
      signal?.throwIfAborted();
      const spec = expected.get(entry.fileName);
      const type = (entry.externalFileAttributes >>> 16) & 0o170000;
      if (!spec || !safeName(entry.fileName) || (type && type !== 0o100000) ||
          entry.isEncrypted() || entry.uncompressedSize !== spec.size) throw new Error('Unexpected file in add-on package.');
      expected.delete(entry.fileName);
      const hash = crypto.createHash('sha256');
      let size = 0;
      const meter = new Transform({ transform(chunk, _encoding, done) {
        size += chunk.length;
        if (size > spec.size) return done(new Error('The add-on file is larger than expected.'));
        hash.update(chunk); done(null, chunk);
      } });
      await pipeline(await zip.openReadStreamPromise(entry), meter,
        createWriteStream(path.join(dest, spec.path), { flags: 'wx', mode: 0o600 }), { signal });
      if (size !== spec.size || hash.digest('hex') !== spec.sha256) throw new Error('The add-on file does not match its checksum.');
      // Executability comes only from the trusted catalogue, never ZIP attributes.
      if (spec.executable && process.platform !== 'win32') await fs.chmod(path.join(dest, spec.path), 0o755);
    }
    signal?.throwIfAborted();
    if (expected.size) throw new Error('The add-on package is missing required files.');
  } finally {
    signal?.removeEventListener('abort', abort);
    zip.close();
  }
}

async function stagePackage({ pack, cacheDir, signal, fetchImpl = globalThis.fetch, onProgress }) {
  validatePackage(pack);
  const file = path.join(cacheDir, `${pack.sha256}.zip`);
  await downloadFile({ url: pack.url, file, size: pack.size, sha256: pack.sha256, signal, fetchImpl, onProgress });
  const dir = await fs.mkdtemp(path.join(cacheDir, '.unpack-'));
  try {
    await unpackPackage(file, dir, pack, signal);
    return { dir, dispose: () => fs.rm(dir, { recursive: true, force: true }) };
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { stagePackage, unpackPackage, validatePackage };
