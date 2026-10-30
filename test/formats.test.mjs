import test from 'node:test';
import assert from 'node:assert/strict';
import { cropForAspect, outputGeometry, videoBitrate, VIDEO_FORMATS } from '../src/shared/formats.js';

const p = { width: 3840, height: 2160 };

test('original størrelse beholder prosjektets format', () => {
  const g = outputGeometry(p, {});
  assert.equal(g.w, 3840);
  assert.equal(g.h, 2160);
  assert.deepEqual(g.matrix, [1, 1, 0, 0]);
});

test('forhåndsinnstilt høyde skalerer ned med samme sideforhold', () => {
  const g = outputGeometry(p, { size: { preset: 1080 } });
  assert.equal(g.w, 1920);
  assert.equal(g.h, 1080);
});

test('beskjæring til 9:16 gir stående video', () => {
  const crop = cropForAspect(p, 9 / 16);
  const g = outputGeometry(p, { crop, size: { preset: 1080 } });
  assert.equal(g.w, 1080);
  assert.equal(g.h, 1920);
  // Utsnittet ligger midt i bildet
  const [sx, , tx] = g.matrix;
  assert.ok(Math.abs(tx + crop.x * 3840 * sx) < 1e-6);
});

test('egen størrelse med tilpass gir svarte kanter, fyll beskjærer', () => {
  const contain = outputGeometry(p, { size: { preset: 'custom', w: 1080, h: 1080 }, fit: 'contain' });
  assert.equal(contain.w, 1080);
  assert.ok(contain.matrix[3] > 0, 'kanter oppe og nede');
  const cover = outputGeometry(p, { size: { preset: 'custom', w: 1080, h: 1080 }, fit: 'cover' });
  assert.ok(cover.matrix[2] < 0, 'sidene beskjæres');
  const stretch = outputGeometry(p, { size: { preset: 'custom', w: 1080, h: 1080 }, fit: 'stretch' });
  assert.notEqual(stretch.matrix[0], stretch.matrix[1]);
});

test('størrelser rundes til partall', () => {
  const g = outputGeometry(p, { size: { preset: 'custom', w: 1001, h: 777 } });
  assert.equal(g.w % 2, 0);
  assert.equal(g.h % 2, 0);
});

test('egen bitrate overstyrer kvalitet', () => {
  const fmt = VIDEO_FORMATS[0];
  assert.equal(videoBitrate(fmt, 'high', 1920, 1080, 30, 8), 8e6);
  assert.ok(videoBitrate(fmt, 'high', 1920, 1080, 30) > 1e6);
});
