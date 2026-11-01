import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { RECORDING_VIDEO_FORMATS, RECORDING_AUDIO_FORMATS, recordingAudioOptions, recordingAudioChoice, recordingPlan } = require('../src/shared/recordingFormats.cjs');
const { finalizeRecordingStream } = require('../src/main/recording.js');
const ff = require('../src/main/ffmpeg.js');

test('recording choices constrain embedded audio but offer every standalone audio format', () => {
  assert.deepEqual(recordingAudioOptions('webm-vp9').map((f) => f.value), ['auto', 'opus']);
  assert.deepEqual(recordingAudioOptions('mov').map((f) => f.value), ['auto', 'aac', 'pcm']);
  assert.equal(recordingAudioChoice('mp4', 'flac'), 'auto');
  assert.equal(recordingAudioChoice('mp4', 'flac', false), 'flac');
  assert.equal(recordingAudioOptions('mp4', false).length, RECORDING_AUDIO_FORMATS.length + 1);
});

test('capture plans keep recoverable WebM chunks and avoid a lossy intermediate for PCM/FLAC', () => {
  for (const audioFormat of ['pcm', 'flac', 'aac', 'mp3']) {
    const plan = recordingPlan({ hasVideo: false, hasAudio: true, audioFormat }, () => true);
    assert.equal(plan.mimeType, 'audio/webm;codecs=pcm');
    assert.equal(plan.ext, RECORDING_AUDIO_FORMATS.find((f) => f.value === audioFormat).ext);
    assert.equal(plan.rawExt, 'webm');
  }
  const fallback = recordingPlan({ videoFormat: 'mp4', hasVideo: true, hasAudio: true }, (mime) => mime.includes('vp9'));
  assert.equal(fallback.mimeType, 'video/webm;codecs=vp9,pcm');
  assert.equal(fallback.videoFormat, 'mp4', 'fallback capture must still finalize in the selected format');
  assert.throws(() => recordingPlan({ hasVideo: false, hasAudio: true, audioFormat: 'pcm' }, () => false), /cannot capture PCM/);
});

test('finalization writes the selected containers/codecs and leaves recovery sources until metadata is committed', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-recording-formats-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = 'camera.raw.webm';
  // Matroska carries the same H.264/PCM streams Chromium records into WebM.
  await ff.run(['-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10:d=0.4', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=0.4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le', '-f', 'matroska', path.join(dir, raw)]).promise;
  for (const video of RECORDING_VIDEO_FORMATS) {
    for (const audioFormat of video.audio) {
      const file = `${video.value}-${audioFormat}.${video.ext}`;
      const result = await finalizeRecordingStream(dir, { raw, file, videoFormat: video.value, audioFormat, offset: 0.125 });
      assert.equal(result.warning, undefined, result.warning);
      assert.equal(result.stream.raw, undefined);
      assert.equal(result.stream.offset, 0.125);
      const info = await ff.probe(path.join(dir, result.stream.file));
      assert.equal(info.videoCodec, video.codec, file);
      assert.equal(info.audioCodec, RECORDING_AUDIO_FORMATS.find((f) => f.value === audioFormat).codec, file);
      assert.ok(info.duration > 0, file);
      assert.ok(fs.existsSync(path.join(dir, raw)), 'source must survive until recording.json is written');
    }
  }
  const audioRaw = 'mic.raw.webm';
  await ff.run(['-i', path.join(dir, raw), '-vn', '-c:a', 'copy', '-f', 'matroska', path.join(dir, audioRaw)]).promise;
  for (const audio of RECORDING_AUDIO_FORMATS) {
    const result = await finalizeRecordingStream(dir, { raw: audioRaw, file: `mic.${audio.ext}`, videoFormat: null, audioFormat: audio.value });
    assert.equal(result.warning, undefined, result.warning);
    const info = await ff.probe(path.join(dir, result.stream.file));
    assert.equal(info.hasVideo, false);
    assert.equal(info.audioCodec, audio.codec);
    assert.ok(info.duration > 0);
  }
});

test('failed conversion retains the real source extension and reports the failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-recording-failure-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const raw = 'camera.raw.webm';
  fs.writeFileSync(path.join(dir, raw), 'recoverable recording');
  const result = await finalizeRecordingStream(dir, { raw, file: 'camera.wav', audioFormat: 'pcm' }, {
    probe: async () => ({ hasAudio: true, audioCodec: 'pcm_s16le' }),
    run: (args) => { fs.writeFileSync(args.at(-1), 'incomplete'); return { promise: Promise.reject(new Error('disk full')) }; },
  });
  assert.equal(result.stream.file, raw);
  assert.equal(result.stream.audioFormat, undefined);
  assert.match(result.warning, /original recording was kept.*disk full/);
  assert.equal(fs.readFileSync(path.join(dir, raw), 'utf8'), 'recoverable recording');
  assert.deepEqual(fs.readdirSync(dir), [raw]);
});
