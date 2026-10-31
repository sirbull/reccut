import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { mediaFiles, trimProject } from '../src/shared/package.js';
import { newProject } from '../src/shared/model.js';
const require = createRequire(import.meta.url),
  ffmpeg = require('ffmpeg-static');
const bundled = (
  await build({
    entryPoints: ['src/main/packager.js'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['electron', 'ffmpeg-static'],
  })
).outputFiles[0].text;
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-package-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const module = { exports: {} };
  vm.runInNewContext(bundled, {
    module,
    exports: module.exports,
    require: (name) => (name === 'electron' ? { app: { getPath: () => dir }, shell: {} } : require(name)),
    Buffer,
    process,
    console,
    setTimeout,
    clearTimeout,
  });
  return { dir, packager: module.exports };
}
const context = () => ({ isCanceled: () => false, progress: () => {}, setCancel: () => {} });
function source(dir) {
  const file = path.join(dir, 'source.mp4');
  execFileSync(ffmpeg, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=green:s=64x48:r=24:d=5',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=5',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    file,
  ]);
  return file;
}
function project(file) {
  const p = newProject('Test');
  p.media.a = {
    id: 'a',
    kind: 'video',
    name: 'source.mp4',
    path: file,
    duration: 5,
    streams: { main: { path: file, hasVideo: true, hasAudio: true, duration: 5, width: 64, height: 48, fps: 24 } },
  };
  p.clips.c = {
    id: 'c',
    type: 'video',
    mediaId: 'a',
    start: 0,
    in: 1,
    dur: 1,
    lane: 1,
    enabled: true,
    props: {},
    kf: {},
  };
  return p;
}
const ff = require('../src/main/ffmpeg.js');
test('packager creates a playable trimmed source with correct links and no trim instructions', async (t) => {
  const { dir, packager } = setup(t),
    file = source(dir),
    p = project(file),
    r = trimProject(p, { handles: 0 });
  const result = await packager.packageProject(
    { project: r.project, files: mediaFiles(r.project), dest: dir, name: 'Archive', removed: { trimmed: r.trimmed } },
    context(),
  );
  const saved = JSON.parse(fs.readFileSync(result.file)),
    m = saved.media.a_p1;
  assert.ok(fs.existsSync(m.path));
  assert.equal(m.streams.main.path, m.path);
  assert.equal(m.streams.main.trim, undefined);
  assert.equal(saved.clips.c.in, 0);
  const info = await ff.probe(m.path);
  assert.ok(info.hasVideo && info.hasAudio);
  assert.ok(Math.abs(info.duration - 1) < 0.08);
  assert.ok(!path.isAbsolute(m.rel));
  assert.ok(fs.existsSync(path.join(result.root, 'Package Report.txt')));
  assert.equal(fs.existsSync(file), true);
});
test('different trims with the same source start are not conflated', async (t) => {
  const { dir, packager } = setup(t),
    file = source(dir),
    p = project(file);
  const a = p.media.a;
  a.streams.main.trim = { source: file, from: 0, to: 1, total: 5 };
  a.duration = 1;
  p.media.b = structuredClone(a);
  p.media.b.id = 'b';
  p.media.b.streams.main.trim.to = 2;
  p.media.b.duration = 2;
  const result = await packager.packageProject(
      { project: p, files: mediaFiles(p), dest: dir, name: 'Parts' },
      context(),
    ),
    saved = JSON.parse(fs.readFileSync(result.file));
  assert.notEqual(saved.media.a.path, saved.media.b.path);
  assert.ok(Math.abs((await ff.probe(saved.media.a.path)).duration - 1) < 0.08);
  assert.ok(Math.abs((await ff.probe(saved.media.b.path)).duration - 2) < 0.08);
});
test('canceled and failed package jobs remove the partial archive and preserve sources', async (t) => {
  const { dir, packager } = setup(t),
    file = path.join(dir, 'source.mp4');
  fs.writeFileSync(file, 'not a video');
  const p = project(file);
  await assert.rejects(
    () =>
      packager.packageProject(
        { project: p, files: mediaFiles(p), dest: dir, name: 'Canceled' },
        { ...context(), isCanceled: () => true },
      ),
    /Canceled/,
  );
  assert.equal(fs.existsSync(path.join(dir, 'Canceled')), false);
  const r = trimProject(p, { handles: 0 });
  await assert.rejects(() =>
    packager.packageProject({ project: r.project, files: mediaFiles(r.project), dest: dir, name: 'Failed' }, context()),
  );
  assert.equal(fs.existsSync(path.join(dir, 'Failed')), false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'not a video');
});
test('recording packages copy synced audio outside the recording folder and remap it', async (t) => {
  const { dir, packager } = setup(t),
    recording = path.join(dir, 'Recording'),
    audio = path.join(dir, 'sync.wav');
  fs.mkdirSync(recording);
  fs.writeFileSync(path.join(recording, 'screen.webm'), 'screen');
  fs.writeFileSync(audio, 'audio');
  const p = newProject('Rec');
  p.media.r = {
    id: 'r',
    name: 'Rec',
    kind: 'recording',
    path: recording,
    streams: { screen: { path: path.join(recording, 'screen.webm') }, sync: { path: audio, hasAudio: true } },
  };
  const result = await packager.packageProject(
      { project: p, files: mediaFiles(p), dest: dir, name: 'Recording archive' },
      context(),
    ),
    saved = JSON.parse(fs.readFileSync(result.file));
  assert.equal(fs.readFileSync(saved.media.r.streams.sync.path, 'utf8'), 'audio');
  assert.ok(saved.media.r.streams.sync.path.startsWith(result.root));
  assert.ok(saved.media.r.streams.screen.path.startsWith(saved.media.r.path));
});
