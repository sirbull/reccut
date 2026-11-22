// Render complete timeline frames over the selection, including overlapping layers.
export function previewRanges(project, ids) {
  const fps = project.fps || 30;
  const ranges = [...new Set(ids)].map(id => project.clips[id]).filter(c => c && c.dur > 0)
    .map(c => ({ in: Math.max(0, Math.floor(c.start * fps + 1e-7) / fps), out: Math.min(project.duration, Math.ceil((c.start + c.dur) * fps - 1e-7) / fps) }))
    .filter(r => r.out > r.in).sort((a, b) => a.in - b.in);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r.in <= last.out + 1e-7) last.out = Math.max(last.out, r.out);
    else merged.push({ ...r });
  }
  return merged;
}

// Store projects are immutable. Memoize once per revision, never once per frame.
const keys = new WeakMap();
export function previewKey(p) {
  if (!keys.has(p)) keys.set(p, JSON.stringify([
    p.id, p.sequence?.id, p.width, p.height, p.fps, p.duration,
    p.clips, p.primary, p.lanes, p.tracks, p.captionStyle, p.media, p.templates,
  ]));
  return keys.get(p);
}
