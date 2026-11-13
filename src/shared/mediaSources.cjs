// Source files only. Proxies and audio synchronized from another media item
// belong to separate sources and must not be deleted with this item.
function mediaSourcePaths(media) {
  if (media.kind === 'recording' && media.loose) {
    return [...new Set([media.path, ...Object.values(media.streams || {})
      .filter((stream) => !stream.syncedFrom).map((stream) => stream.path)].filter(Boolean))];
  }
  const file = media.path || media.streams?.main?.path;
  return file ? [file] : [];
}

module.exports = { mediaSourcePaths };
