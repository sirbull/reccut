import { signal } from '@preact/signals';
import { createPlayer } from '../player.js';

// A private Design preview player. Sampling never moves the Edit playhead or
// changes the frame selected in the Video tab, and never invokes export.
export function createFrameSampler(source) {
  let time = 0, disposed = false;
  const canvas = document.createElement('canvas');
  const player = createPlayer({ getProject: () => source, playing: signal(false), getTime: () => time, setTime: value => { time = value; }, resolutionScale: () => 1, keepSeconds: 0 });
  player.attachCanvas(canvas);
  const scale = Math.min(256 / source.width, 512 / source.height, 1);
  player.resizeCanvas(source.width * scale, source.height * scale, scale);
  player.start();
  return {
    async sample(time, { signal, timeoutMs = 500 } = {}) {
      if (disposed || signal?.aborted) return null;
      player.seek(time);
      const until = performance.now() + timeoutMs;
      while (!disposed && !signal?.aborted && performance.now() < until) {
        const fresh = player.snapshot({ fresh: true });
        if (fresh) {
          const copy = document.createElement('canvas'); copy.width = fresh.width; copy.height = fresh.height;
          const ctx = copy.getContext('2d', { willReadFrequently: true }); ctx.drawImage(fresh, 0, 0);
          return { canvas: copy, pixels: ctx.getImageData(0, 0, copy.width, copy.height) };
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return null;
    },
    dispose() { disposed = true; player.dispose(); canvas.width = canvas.height = 1; },
  };
}
