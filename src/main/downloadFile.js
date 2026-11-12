// Large optional models are streamed to disk. A partial file is tied to its pinned
// checksum, so retries (including after an app restart) can safely request the rest.
const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

async function hashFile(file, signal) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file, { signal })) hash.update(chunk);
  return hash.digest('hex');
}

async function downloadFile({ url, file, size, sha256, maxBytes = size, signal, fetchImpl = globalThis.fetch, onProgress = () => {} }) {
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 ||
      (size !== undefined && (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes))) {
    throw new Error('Invalid download metadata.');
  }
  signal?.throwIfAborted();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const part = `${file}.${sha256}.part`;
  const length = async (p) => fs.stat(p).then((s) => s.size, (e) => { if (e.code === 'ENOENT') return 0; throw e; });
  const valid = async (p, bytes) => bytes > 0 && bytes <= maxBytes && (size === undefined || bytes === size) && await hashFile(p, signal) === sha256;
  let bytes = await length(file);
  if (await valid(file, bytes)) { onProgress(bytes); return bytes; }
  // Only a verified file is ever exposed at the final path.
  await fs.rm(file, { force: true });
  let offset = await length(part);
  if (await valid(part, offset)) {
    signal?.throwIfAborted();
    await fs.rename(part, file);
    onProgress(offset);
    return offset;
  }
  if (size === undefined || offset >= size) {
    await fs.rm(part, { force: true });
    offset = 0;
  }
  const res = await fetchImpl(url, { signal, redirect: 'follow', headers: offset ? { Range: `bytes=${offset}-` } : {} });
  const rejectResponse = async (message) => {
    await res.body?.cancel?.().catch(() => {});
    throw new Error(message);
  };
  if (!res.ok) return rejectResponse(`Download failed (${res.status}).`);
  if (res.status === 206) {
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get('content-range') || '');
    if (!range || Number(range[1]) !== offset || Number(range[2]) !== size - 1 || Number(range[3]) !== size) {
      return rejectResponse('The download returned an unexpected byte range.');
    }
  } else if (res.status === 200) {
    // Some servers ignore Range. Start over instead of appending a second copy.
    offset = 0;
  } else return rejectResponse(`Unexpected download response (${res.status}).`);
  if (!res.body) throw new Error('The download has no body.');
  const hash = crypto.createHash('sha256');
  if (offset) for await (const chunk of createReadStream(part, { signal })) hash.update(chunk);
  bytes = offset;
  onProgress(bytes);
  const meter = new Transform({
    transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        const error = new Error('The download is larger than expected.');
        error.code = 'DOWNLOAD_INTEGRITY';
        done(error);
        return;
      }
      hash.update(chunk);
      onProgress(bytes);
      done(null, chunk);
    },
  });
  try {
    await pipeline(Readable.from(res.body), meter, createWriteStream(part, { flags: offset ? 'a' : 'w' }), { signal });
    signal?.throwIfAborted();
    if (size !== undefined && bytes !== size) throw new Error('The download ended before the file was complete.');
    if (hash.digest('hex') !== sha256) {
      const error = new Error('The download did not match its checksum.');
      error.code = 'DOWNLOAD_INTEGRITY';
      throw error;
    }
    await fs.rename(part, file);
    return bytes;
  } catch (error) {
    // Interrupted transfers can resume; corrupt or oversized data must start again.
    if (error.code === 'DOWNLOAD_INTEGRITY') await fs.rm(part, { force: true });
    throw error;
  }
}

module.exports = { downloadFile, hashFile };
