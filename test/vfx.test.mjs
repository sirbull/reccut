import test from 'node:test';
import assert from 'node:assert/strict';
import { guessKeyColor, makeVfx, processVfx } from '../src/shared/vfx.js';

// Et bilde på 64 x 64: grønn skjerm, skygge i skjermen, og et "motiv" med hud, grått og svart.
function scene() {
  const w = 64;
  const h = 64;
  const data = new Uint8ClampedArray(w * h * 4);
  const put = (x, y, [r, g, b]) => {
    const i = (y * w + x) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, [20, 177, 64]);
  for (let y = 50; y < 64; y++) for (let x = 0; x < 64; x++) put(x, y, [8, 80, 30]); // skygge
  for (let y = 16; y < 48; y++) for (let x = 20; x < 30; x++) put(x, y, [220, 160, 130]); // hud
  for (let y = 16; y < 48; y++) for (let x = 30; x < 40; x++) put(x, y, [128, 128, 128]); // grått
  for (let y = 16; y < 48; y++) for (let x = 40; x < 46; x++) put(x, y, [12, 12, 12]); // svart hår
  return { data, width: w, height: h };
}
const alpha = (img, x, y) => img.data[(y * img.width + x) * 4 + 3] / 255;

test('keyeren fjerner grønn skjerm og skygger, men beholder motivet', () => {
  const img = scene();
  assert.equal(guessKeyColor(img), '#14b140');
  processVfx(img, [makeVfx('keyer', { color: '#14b140', feather: 0, choke: 0 })]);
  assert.ok(alpha(img, 5, 5) < 0.05, 'skjermen er borte');
  assert.ok(alpha(img, 5, 58) < 0.1, `skyggen er borte (${alpha(img, 5, 58)})`);
  assert.ok(alpha(img, 25, 30) > 0.95, 'huden er med');
  assert.ok(alpha(img, 35, 30) > 0.95, 'det grå er med');
  assert.ok(alpha(img, 43, 30) > 0.95, 'det svarte er med');
});

test('effekter kan stables: to keyere og matterydding etter hverandre', () => {
  const img = scene();
  const out = processVfx(img, [makeVfx('keyer', { color: '#14b140' }), makeVfx('lumaKey', { mode: 'dark', threshold: 0.1, softness: 0.05 }), makeVfx('matte', { feather: 0, choke: 0, invert: false })]);
  assert.ok(alpha(out, 25, 30) > 0.9);
  assert.ok(alpha(out, 43, 30) < 0.1, 'luma key tar det svarte');
});

test('fjerning av bakgrunn mot et rent bakgrunnsbilde', () => {
  const plate = scene();
  // Bakgrunnen er bare den grønne flaten uten motiv.
  for (let y = 16; y < 48; y++) for (let x = 20; x < 46; x++) plate.data.set([20, 177, 64, 255], (y * 64 + x) * 4);
  const img = scene();
  processVfx(img, [makeVfx('bgRemove', { feather: 0, choke: 0, fill: 0 })], { plate });
  assert.ok(alpha(img, 5, 5) < 0.05);
  assert.ok(alpha(img, 25, 30) > 0.95);
  assert.ok(alpha(img, 35, 30) > 0.95);
});
