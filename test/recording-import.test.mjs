import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { addMediaClip } from '../src/shared/ops.js';
import { mediaFiles } from '../src/shared/package.js';
import { clipBox, clipPivot } from '../src/shared/shapes.js';
import { makeClip, recordingRectsAt } from '../src/shared/model.js';
const require = createRequire(import.meta.url);
const { finalizeRecordingStream, findRecording, loadRecording, readRecordingTag } = require('../src/main/recording.js');
const ff = require('../src/main/ffmpeg.js');

async function recordPair(dir, ext = 'mp4', id = 'rec-1') {
  const rec = { version: 1, id, name: 'Recording 1', fps: 30, layouts: [[0, 5], [1, 3]], pip: { size: 'large', shape: 'circle' }, cursor: [[0, 0.5, 0.5]], zooms: [], screen: { file: `screen.${ext}`, offset: 0.25 }, camera: { file: `camera.${ext}`, offset: 0 } };
  for (const key of ['screen', 'camera']) {
    const raw = `${key}.raw.webm`;
    await ff.run(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-f', 'matroska', path.join(dir, raw)]).promise;
    const { warning } = await finalizeRecordingStream(dir, { raw, file: rec[key].file, videoFormat: ext === 'mkv' ? 'mkv' : ext === 'mov' ? 'mov' : 'mp4', audioFormat: null }, undefined, { ...rec, part: key });
    assert.equal(warning, undefined);
    fs.unlinkSync(path.join(dir, raw));
  }
  return rec;
}

const tmp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-recording-import-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('recording data survives in the files, in every video container, without leftovers', async (t) => {
  for (const ext of ['mp4', 'mov', 'mkv']) {
    const dir = tmp(t);
    await recordPair(dir, ext);
    assert.deepEqual(fs.readdirSync(dir).sort(), [`camera.${ext}`, `screen.${ext}`]);
    const rec = await readRecordingTag(path.join(dir, `camera.${ext}`));
    assert.equal(rec.part, 'camera');
    assert.deepEqual(rec.layouts, [[0, 5], [1, 3]]);
    assert.equal(rec.screen.offset, 0.25);
  }
});

test('either file finds the whole recording, also after the files are renamed', async (t) => {
  const dir = tmp(t);
  await recordPair(dir);
  fs.renameSync(path.join(dir, 'screen.mp4'), path.join(dir, 'demo skjerm.mp4'));
  fs.renameSync(path.join(dir, 'camera.mp4'), path.join(dir, 'demo meg.mp4'));
  fs.copyFileSync(path.join(dir, 'demo meg.mp4'), path.join(dir, 'kopi.txt'));
  const a = await findRecording(path.join(dir, 'demo meg.mp4'));
  const b = await findRecording(path.join(dir, 'demo skjerm.mp4'));
  assert.equal(a.id, b.id, 'the two files must collapse to one recording');
  assert.equal(a.paths.length, 2);
  const { files, name, loose, rec } = await loadRecording(a.target);
  assert.equal(files.screen, path.join(dir, 'demo skjerm.mp4'));
  assert.equal(files.camera, path.join(dir, 'demo meg.mp4'));
  assert.equal(name, 'Recording 1');
  assert.equal(loose, true);
  assert.equal(rec.pip.shape, 'circle');
});

test('a file with the same name from another recording is not paired', async (t) => {
  const dir = tmp(t);
  const other = tmp(t);
  await recordPair(dir, 'mp4', 'first');
  await recordPair(other, 'mp4', 'second');
  fs.copyFileSync(path.join(other, 'camera.mp4'), path.join(dir, 'camera.mp4'));
  const found = await findRecording(path.join(dir, 'screen.mp4'));
  assert.deepEqual(found.paths, [path.join(dir, 'screen.mp4')]);
});

test('a tag cannot point outside the folder of the imported file', async (t) => {
  const dir = tmp(t);
  const inner = path.join(dir, 'inner');
  fs.mkdirSync(inner);
  await recordPair(dir);
  fs.renameSync(path.join(dir, 'screen.mp4'), path.join(inner, 'screen.mp4'));
  const found = await findRecording(path.join(inner, 'screen.mp4'));
  assert.deepEqual(found.paths, [path.join(inner, 'screen.mp4')]);
});

test('older recordings are found through recording.json, also from one of the files', async (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'recording.json'), JSON.stringify({ screen: { file: 'screen.mp4' }, camera: { file: 'camera.mp4' } }));
  fs.writeFileSync(path.join(dir, 'screen.mp4'), '');
  fs.writeFileSync(path.join(dir, 'other.mp4'), '');
  assert.deepEqual(await findRecording(path.join(dir, 'screen.mp4')), { id: dir, target: dir, paths: [dir] });
  assert.equal((await findRecording(dir)).target, dir);
  assert.equal(await findRecording(path.join(dir, 'other.mp4')), null);
});

test('ordinary videos are not recordings', async (t) => {
  const dir = tmp(t);
  const file = path.join(dir, 'plain.mp4');
  await ff.run(['-f', 'lavfi', '-i', 'color=c=red:s=160x90:r=10:d=0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]).promise;
  assert.equal(await findRecording(file), null);
});

const media = (extra = {}) => ({ id: 'm', kind: 'recording', path: '/rec', name: 'Rec', duration: 10, width: 1920, height: 1080, fps: 30, streams: { screen: { path: '/rec/screen.mp4', hasVideo: true, width: 1920, height: 1080, duration: 10 }, camera: { path: '/rec/camera.mp4', hasVideo: true, width: 1280, height: 720, duration: 10 } }, rec: { layouts: [[0, 6]], pip: { size: 'medium', shape: 'rect' } }, ...extra });

test('files with recording data are packaged one by one, not as a folder', () => {
  const m = media({ loose: true, path: '/Media/screen.mp4', streams: { screen: { path: '/Media/screen.mp4' }, camera: { path: '/Media/camera.mp4' } } });
  const [entry] = mediaFiles({ media: { m } });
  assert.equal(entry.dir, undefined);
  assert.deepEqual(entry.sources.map((s) => s.path), ['/Media/screen.mp4', '/Media/camera.mp4']);
  assert.equal(mediaFiles({ media: { m: media() } })[0].dir, '/rec');
});

test('a dropped recording becomes a linked pair with the PiP anchor in the middle of the PiP', () => {
  const p = { width: 1920, height: 1080, fps: 30, media: { m: media() }, clips: {}, primary: [], lanes: {}, duration: 0 };
  const id = addMediaClip(p, p.media.m, 'append');
  const camera = Object.values(p.clips).find((c) => c.recordingPart === 'camera');
  assert.equal(camera.linkedTo, id);
  assert.equal(p.clips[id].recordingPart, 'screen');
  camera.kf.layout = [[0, 6], [2, 3]];
  const rect = recordingRectsAt(camera, 1, 1920, 1080, 16 / 9).cam;
  assert.deepEqual(clipBox(camera, 1, 1920, 1080, p), rect);
  assert.deepEqual(clipPivot(camera, 1, 1920, 1080, p), { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  // Ankeret følger PiP-rammen til det nye hjørnet.
  assert.ok(clipPivot(camera, 5, 1920, 1080, p).x < 960);
  camera.props.anchorX = 40;
  assert.equal(clipPivot(camera, 1, 1920, 1080, p).x, rect.x + rect.w / 2 + 40);
});

test('older PiP clips and other clips pivot around the middle of the frame', () => {
  const p = { media: { m: media() } };
  const old = makeClip('recording', { mediaId: 'm', start: 0, dur: 5 });
  old.recordingPart = 'camera';
  assert.deepEqual(clipPivot(old, 1, 1920, 1080, p), { x: 960, y: 540 });
  assert.deepEqual(clipPivot(makeClip('title', { start: 0, dur: 5 }), 1, 1920, 1080), { x: 960, y: 540 });
});
