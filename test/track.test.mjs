import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const motion = require('../src/main/motion.js');

function noise(n, seed) {
  let s = seed;
  const out = new Float32Array(n * n);
  for (let i = 0; i < out.length; i++) out[i] = ((s = (s * 16807) % 2147483647) / 2147483647) * 255;
  // Glatt litt, så det likner et ekte bilde.
  const sm = new Float32Array(n * n);
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += out[(y + dy) * n + x + dx];
    sm[y * n + x] = v / 9;
  }
  return sm;
}

// Et teksturert objekt (60 x 60) med midten i (cx, cy) og vinkel a, over en bakgrunn som står stille.
function frame(W, H, bg, obj, cx, cy, a) {
  const img = new Float32Array(W * H);
  const c = Math.cos(-a);
  const s = Math.sin(-a);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const u = dx * c - dy * s + 30;
    const v = dx * s + dy * c + 30;
    img[y * W + x] = u >= 1 && v >= 1 && u < 59 && v < 59 ? obj[Math.round(v) * 64 + Math.round(u)] : bg[y * 256 + x];
  }
  return img;
}

test('trackStep follows a moving, rotating object and ignores the background', () => {
  const W = 256;
  const H = 160;
  const bg = noise(256, 7);
  const obj = noise(64, 99);
  let r = { cx: 80, cy: 80, w: 56, h: 56, a: 0, s: 1 };
  let prev = motion.pyramid(frame(W, H, bg, obj, 80, 80, 0), W, H, 4);
  for (let i = 1; i <= 10; i++) {
    const next = motion.pyramid(frame(W, H, bg, obj, 80 + i * 3, 80 + i, i * 0.02), W, H, 4);
    r = motion.trackStep(prev, next, r);
    assert.ok(r, `lost at frame ${i}`);
    prev = next;
  }
  assert.ok(Math.abs(r.cx - 110) < 1.5, `cx ${r.cx}`);
  assert.ok(Math.abs(r.cy - 90) < 1.5, `cy ${r.cy}`);
  assert.ok(Math.abs(r.a - 0.2) < 0.03, `a ${r.a}`);
  assert.ok(Math.abs(r.s - 1) < 0.05, `s ${r.s}`);
});
