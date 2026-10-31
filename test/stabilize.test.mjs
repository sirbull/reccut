import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { corrections, setMotion, getMotion, stabilizeAt, resolvedMethod } from '../src/shared/stabilize.js';

const require = createRequire(import.meta.url);
const motion = require('../src/main/motion.js');

// Et detaljert testbilde: støy og former, med kjent forflytning og rotasjon.
function texture(W, H) {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = new Float32Array(W * H);
  for (let i = 0; i < img.length; i++) img[i] = r() * 255;
  // Glatt litt, så det likner et ekte bilde.
  const out = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += img[(y + dy) * W + x + dx];
    out[y * W + x] = v / 9;
  }
  return out;
}

function warp(src, W, H, tx, ty, angle) {
  const out = new Float32Array(W * H);
  const cx = W / 2;
  const cy = H / 2;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Bakover: hvor i kilden kommer dette punktet fra.
      const u = x - cx - tx;
      const v = y - cy - ty;
      const sx = c * u - s * v + cx;
      const sy = s * u + c * v + cy;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) continue;
      const fx = sx - x0;
      const fy = sy - y0;
      const i = y0 * W + x0;
      out[y * W + x] = (src[i] * (1 - fx) + src[i + 1] * fx) * (1 - fy) + (src[i + W] * (1 - fx) + src[i + W + 1] * fx) * fy;
    }
  }
  return out;
}

test('finner forflytning og rotasjon mellom to bilder', () => {
  const W = 320;
  const H = 180;
  const a = texture(W, H);
  for (const [tx, ty, ang] of [[3.4, -2.2, 0.004], [-7.5, 5.1, -0.008], [0.3, 0.2, 0]]) {
    const b = warp(a, W, H, tx, ty, ang);
    const m = motion.estimate(motion.pyramid(a, W, H, 3), motion.pyramid(b, W, H, 3));
    assert.ok(m.ok, 'analysen lyktes');
    assert.ok(Math.abs(m.dx - tx) < 0.15, `dx ${m.dx} skal være ${tx}`);
    assert.ok(Math.abs(m.dy - ty) < 0.15, `dy ${m.dy} skal være ${ty}`);
    assert.ok(Math.abs(m.da - ang) < 0.0015, `vinkel ${m.da} skal være ${ang}`);
  }
});

test('et bilde uten detaljer gir ingen bevegelse', () => {
  const W = 320;
  const H = 180;
  const flat = new Float32Array(W * H).fill(90);
  const m = motion.estimate(motion.pyramid(flat, W, H, 3), motion.pyramid(flat, W, H, 3));
  assert.equal(m.ok, false);
});

// Rystet bane: langsom panorering pluss risting.
function shakyData(n = 300) {
  const motions = [[0, 0, 0, 1, 1]];
  let px = 0;
  for (let i = 1; i < n; i++) {
    const x = 0.001 * i + 0.006 * Math.sin(i * 1.3);
    const dx = x - px;
    px = x;
    motions.push([dx, 0.004 * Math.cos(i * 1.7) - 0.004 * Math.cos((i - 1) * 1.7), 0.002 * (Math.sin(i * 2.1) - Math.sin((i - 1) * 2.1)), 1, 1]);
  }
  return { version: 1, fps: 30, width: 320, height: 180, motions };
}

test('glattingen fjerner ristingen, men beholder panoreringen', () => {
  setMotion('/a', shakyData());
  const clip = { in: 0, dur: 10, props: { stabilize: true, stabMethod: 'smooth', stabX: 0.6, stabY: 0.6, stabRot: 0.6 } };
  const d = getMotion('/a');
  const c = corrections(d, clip);
  // Banen etter korreksjon: rister mye mindre fra bilde til bilde.
  let before = 0;
  let after = 0;
  for (let i = 50; i < 250; i++) {
    const r0 = d.X[i] - d.X[i - 1];
    const r1 = d.X[i] + c.cx[i] - (d.X[i - 1] + c.cx[i - 1]);
    before += Math.abs(r0 - 0.001);
    after += Math.abs(r1 - 0.001);
  }
  assert.ok(after < before * 0.15, `risting ${after} mot ${before}`);
  // Panoreringen (0,001 per bilde) er der fortsatt.
  const pan = (d.X[250] + c.cx[250] - (d.X[50] + c.cx[50])) / 200;
  assert.ok(Math.abs(pan - 0.001) < 0.0002, `panorering ${pan}`);
  assert.ok(c.zoom > 1 && c.zoom < 1.2, `zoom ${c.zoom}`);
  assert.equal(resolvedMethod(d, { ...clip, props: { ...clip.props, stabMethod: 'auto' } }), 'smooth');
});

test('stativ låser bildet, og en skyver på 0 lar den retningen være', () => {
  setMotion('/b', shakyData());
  const d = getMotion('/b');
  const tripod = corrections(d, { in: 2, dur: 3, props: { stabilize: true, stabMethod: 'tripod' } });
  const pos = (i) => d.X[i] + tripod.cx[i];
  assert.ok(Math.abs(pos(70) - pos(140)) < 1e-9);
  const noX = corrections(d, { in: 0, dur: 10, props: { stabilize: true, stabMethod: 'smooth', stabX: 0, stabY: 0.6, stabRot: 0.6 } });
  assert.ok(noX.cx.every((v) => v === 0));
  // Av: ingen korreksjon.
  assert.equal(stabilizeAt({ in: 0, dur: 1, props: { stabilize: false } }, '/b', 0.5), null);
  const at = stabilizeAt({ in: 0, dur: 10, props: { stabilize: true, stabMethod: 'smooth', stabX: 0.6, stabY: 0.6, stabRot: 0.6 } }, '/b', 1.234);
  assert.ok(Number.isFinite(at.x) && Number.isFinite(at.a) && at.zoom >= 1);
});
