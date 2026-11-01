import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { findSequence, render } = require('../src/main/sequence.js');
const ff = require('../src/main/ffmpeg.js');

test('finner den sammenhengende rekken filen hører til', () => {
  const names = ['shot_0001.png', 'shot_0002.png', 'shot_0003.png', 'shot_0005.png', 'other_0002.png', 'shot_0002.jpg'];
  const s = findSequence('/f/shot_0002.png', names);
  assert.equal(s.start, 1);
  assert.equal(s.count, 3);
  assert.equal(s.pattern, path.join('/f', 'shot_%04d.png'));
  assert.equal(findSequence('/f/shot_0005.png', names), null);
  assert.equal(findSequence('/f/a%1.png', ['a%1.png', 'a%2.png']).pattern, path.join('/f', 'a%%%d.png'));
});

test('bildesekvens blir en video med riktig lengde', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-seq-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  execFileSync(ff.getFfmpegPath(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=s=65x48:r=12:d=1', '-start_number', '7', path.join(dir, 'frame.%03d.png')]);
  const ctx = { progress: () => {}, setCancel: () => {}, isCanceled: () => false };
  const out = await render(path.join(dir, 'frame.010.png'), 24, [dir, path.join(dir, 'fallback')], ctx);
  assert.equal(path.basename(out), 'frame 7-18.mp4');
  const info = await ff.probe(out);
  assert.equal(info.width, 64);
  assert.ok(Math.abs(info.duration - 0.5) < 0.05, `duration ${info.duration}`);
});
