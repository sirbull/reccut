import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const raw = require('../src/main/raw.js');
const ffmpeg = require('ffmpeg-static');

function jpeg(w, h, extra = []) {
  return execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc=size=${w}x${h}`, '-frames:v', '1', ...extra, '-f', 'mjpeg', '-']);
}

// En liten TIFF-basert «RAW-fil»: IFD med orientering 6, et lite miniatyrbilde og en stor forhåndsvisning.
function fakeRaw(orientation = 6) {
  const head = Buffer.alloc(8 + 2 + 12 + 4 + 64);
  head.write('II', 0);
  head.writeUInt16LE(42, 2);
  head.writeUInt32LE(8, 4);
  head.writeUInt16LE(1, 8);
  head.writeUInt16LE(274, 10);
  head.writeUInt16LE(3, 12);
  head.writeUInt32LE(1, 14);
  head.writeUInt16LE(orientation, 18);
  const sensor = Buffer.alloc(30000, 0x5a);
  return Buffer.concat([head, jpeg(160, 120), sensor, jpeg(1200, 800, ['-q:v', '3']), Buffer.alloc(500, 0x11)]);
}

test('henter den største innebygde JPEG-en og orienteringen fra en RAW-fil', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obslite-raw-'));
  const file = path.join(dir, 'a.cr2');
  fs.writeFileSync(file, fakeRaw(6));
  const prev = await raw.extractPreview(file, path.join(dir, 'p.jpg'));
  assert.equal(prev.width, 1200);
  assert.equal(prev.height, 800);
  assert.equal(prev.orientation, 6);
  const out = fs.readFileSync(prev.file);
  assert.equal(out[0], 0xff);
  assert.equal(out[out.length - 1], 0xd9);
  // Filen kan dekodes.
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', prev.file, '-f', 'null', '-']);
});

test('filer uten innebygd bilde gir null', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obslite-raw-'));
  const file = path.join(dir, 'b.nef');
  fs.writeFileSync(file, Buffer.alloc(5000, 0x33));
  assert.equal(await raw.extractPreview(file, path.join(dir, 'p.jpg')), null);
});
