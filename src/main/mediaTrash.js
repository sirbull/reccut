const fs = require('fs');
const path = require('path');
const { mediaSourcePaths } = require('../shared/mediaSources.cjs');

const pathKey = (file) => process.platform === 'win32' ? file.toLowerCase() : file;

// Return per-item results so a failed file operation keeps its media in the
// project. A loose recording may contain several separately stored files.
async function trashMedia(items, trashItem) {
  const sources = items.map((media) => ({ media, paths: mediaSourcePaths(media) }));
  const targets = new Map();
  for (const { media, paths } of sources) {
    for (const file of paths) {
      if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Media source paths must be absolute.');
      const resolved = path.resolve(file);
      const key = pathKey(resolved);
      const target = targets.get(key) || { path: resolved, recording: false };
      target.recording ||= media.kind === 'recording' && !media.loose;
      targets.set(key, target);
    }
  }
  const results = new Map();
  const trashedDirectories = [];
  const trashedPaths = [];
  // A recording folder may also contain a separately imported selected file.
  // Process the folder first and recycle it only once.
  for (const [key, target] of [...targets].sort((a, b) => a[0].length - b[0].length)) {
    try {
      if (target.path === path.parse(target.path).root) throw new Error('A drive root cannot be deleted as media.');
      if (!trashedDirectories.some((dir) => key.startsWith(dir + path.sep))) {
        const stat = await fs.promises.lstat(target.path);
        if (stat.isDirectory()) {
          if (!target.recording) throw new Error('This media source is a folder, not a file.');
          const recording = JSON.parse(await fs.promises.readFile(path.join(target.path, 'recording.json'), 'utf8'));
          if (!recording.screen?.file && !recording.camera?.file) throw new Error('This folder has no recording sources.');
        }
        await trashItem(target.path);
        trashedPaths.push(target.path);
        if (stat.isDirectory()) trashedDirectories.push(key);
      }
      results.set(key, { ok: true });
    } catch (error) {
      // Retrying a partially completed recording deletion can find files that
      // have already been recycled. Missing files require no further deletion.
      const missing = error.code === 'ENOENT' && !fs.existsSync(target.path);
      results.set(key, missing ? { ok: true } : { error: error.message });
    }
  }
  const removedIds = [], failed = [];
  for (const { media, paths } of sources) {
    const errors = paths.map((file) => ({ path: file, error: results.get(pathKey(path.resolve(file)))?.error })).filter((item) => item.error);
    if (!paths.length) errors.push({ path: '', error: 'No source file is available for this media.' });
    if (errors.length) failed.push({ mediaId: media.id, name: media.name, errors });
    else removedIds.push(media.id);
  }
  return { removedIds, failed, trashedPaths };
}

module.exports = { trashMedia };
