import test from 'node:test';
import assert from 'node:assert/strict';
import { frameExportSettings, frameGeometry } from '../src/shared/frameExport.js';

const project = { width: 1920, height: 1080, duration: 10, fps: 30 };
const options = { time: 2.51, width: 1001, height: 563, format: 'png', alpha: true };

test('still export keeps exact odd dimensions, snaps to the playhead frame and supports alpha', () => {
  const s = frameExportSettings(project, options);
  assert.deepEqual(s, { ...options, time: 75 / 30 });
  assert.equal(frameExportSettings(project, { ...options, format: 'webp' }).alpha, true);
  assert.equal(frameExportSettings(project, { ...options, format: 'jpeg' }).alpha, false);
});

test('end position exports the last actual frame, including fractional frame rates and short sequences', () => {
  assert.equal(frameExportSettings(project, { ...options, time: 10 }).time, 299 / 30);
  assert.equal(frameExportSettings(project, { ...options, time: -1 }).time, 0);
  const fractional = { ...project, fps: 29.97, duration: 7 / 29.97 };
  assert.equal(frameExportSettings(fractional, { ...options, time: fractional.duration }).time, 6 / 29.97);
  assert.equal(frameExportSettings({ ...project, duration: 0.01 }, options).time, 0);
});

test('invalid sizes, formats and empty timelines fail before allocating a canvas', () => {
  for (const width of [0, -1, 8193, 2.5, NaN, Infinity]) {
    assert.throws(() => frameExportSettings(project, { ...options, width }), /whole numbers/);
  }
  assert.throws(() => frameExportSettings(project, { ...options, height: 0 }), /whole numbers/);
  assert.throws(() => frameExportSettings(project, { ...options, format: 'gif' }), /PNG/);
  assert.throws(() => frameExportSettings({ ...project, duration: 0 }, options), /empty/);
  assert.throws(() => frameExportSettings(project, { ...options, time: NaN }), /empty/);
});

test('custom aspect ratios contain the sequence without stretching or even-size rounding', () => {
  const g = frameGeometry(project, { width: 1001, height: 1001 });
  assert.equal(g.w, 1001);
  assert.equal(g.h, 1001);
  assert.equal(g.matrix[0], g.matrix[1]);
  assert.equal(g.matrix[2], 0);
  assert.ok(g.matrix[3] > 200);
});
