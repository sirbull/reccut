const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// Private disposable files, never added to project media or user exports.
function createPreviewRenderer({ root, jobs, render }) {
  const files = new Set();
  let ready;
  const prepare = () => ready ||= fs.rm(root, { recursive: true, force: true }).then(() => fs.mkdir(root, { recursive: true }));
  async function release(paths) {
    for (const file of paths) if (files.has(file)) {
      await fs.rm(file, { force: true });
      files.delete(file);
    }
  }
  async function start(project, ranges) {
    if (!ranges?.length || ranges.some(r => !Number.isFinite(r.in) || !Number.isFinite(r.out) || r.in < 0 || r.out <= r.in || r.out > project.duration + 1e-7)) throw new Error('Select timeline clips to pre-render.');
    const outputs = [];
    const { done } = jobs.add({ kind: 'preview', title: 'Pre-rendering selected clips', queue: 'heavy', run: async ctx => {
      await prepare();
      const total = ranges.reduce((n, r) => n + r.out - r.in, 0);
      let completed = 0;
      try {
        for (const range of ranges) {
          if (ctx.isCanceled()) throw new Error('Canceled');
          const file = path.join(root, `${randomUUID()}.mp4`);
          files.add(file);
          outputs.push({ ...range, file });
          await render({ project, settings: { preview: true, output: file, range, format: 'mp4-h264', quality: 'high', fps: project.fps, res: Math.min(1080, project.width, project.height), sourceMedia: 'optimized', captions: 'burn' } }, {
            ...ctx, progress: (p, stage) => ctx.progress((completed + p * (range.out - range.in)) / total, stage),
          });
          completed += range.out - range.in;
        }
        if (ctx.isCanceled()) throw new Error('Canceled');
        return outputs;
      } catch (error) {
        await release(outputs.map(r => r.file));
        throw error;
      }
    } });
    return done;
  }
  return { start, release };
}
module.exports = { createPreviewRenderer };
