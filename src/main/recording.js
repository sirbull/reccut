const fs = require('fs');
const path = require('path');
const ffmpeg = require('./ffmpeg');
const { RECORDING_AUDIO_FORMATS, recordingVideoFormat } = require('../shared/recordingFormats.cjs');

function recordingArgs(input, output, stream, info) {
  const args = ['-fflags', '+genpts', '-i', input, '-map', '0:v:0?', '-map', '0:a:0?'];
  if (!stream.videoFormat && !stream.audioFormat) return [...args, '-c', 'copy', ...(/\.(mp4|mov|m4a)$/.test(output) ? ['-movflags', '+faststart'] : []), output];
  if (info.hasVideo) {
    const video = recordingVideoFormat(stream.videoFormat);
    if (info.videoCodec === video.codec) args.push('-c:v', 'copy');
    else {
      args.push('-vf', "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p");
      if (video.codec === 'h264') args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18');
      else args.push('-c:v', video.codec === 'vp9' ? 'libvpx-vp9' : 'libvpx', '-b:v', '0', '-crf', video.codec === 'vp9' ? '24' : '10', '-deadline', 'realtime', '-cpu-used', '4');
    }
  }
  if (info.hasAudio) {
    const audio = RECORDING_AUDIO_FORMATS.find((f) => f.value === stream.audioFormat);
    if (!audio) throw new Error('Unknown recording audio format');
    if (info.audioCodec === audio.codec) args.push('-c:a', 'copy');
    else {
      const encoder = { aac: 'aac', opus: 'libopus', pcm: 'pcm_s16le', flac: 'flac', mp3: 'libmp3lame' }[audio.value];
      args.push('-c:a', encoder, '-ar', '48000', '-ac', '2');
      if (['aac', 'opus', 'mp3'].includes(audio.value)) args.push('-b:a', audio.value === 'opus' ? '192k' : '256k');
    }
  }
  if (/\.(mp4|mov|m4a)$/.test(output)) args.push('-movflags', '+faststart');
  return [...args, output];
}

// Commit the new file only after FFmpeg succeeds. On failure the recoverable
// source keeps its actual extension; a WebM must never be renamed to MP4/WAV.
async function finalizeRecordingStream(dir, stream, ff = ffmpeg) {
  const raw = path.join(dir, stream.raw);
  const final = path.join(dir, stream.file);
  const tmp = final + `.part${path.extname(final)}`;
  const result = { ...stream };
  delete result.raw;
  try {
    const info = await ff.probe(raw);
    if (!info.hasVideo && !info.hasAudio) throw new Error('The recording contains no readable media');
    await ff.run(recordingArgs(raw, tmp, stream, info)).promise;
    await fs.promises.rename(tmp, final);
    return { stream: result };
  } catch (error) {
    await fs.promises.unlink(tmp).catch(() => {});
    result.file = stream.raw;
    delete result.videoFormat;
    delete result.audioFormat;
    return { stream: result, warning: `Could not save ${stream.file} in the selected format. The original recording was kept as ${stream.raw}. ${error.message}` };
  }
}

module.exports = { recordingArgs, finalizeRecordingStream };
