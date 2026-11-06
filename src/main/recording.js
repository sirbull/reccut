const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const ffmpeg = require('./ffmpeg');
const { RECORDING_AUDIO_FORMATS, recordingVideoFormat } = require('../shared/recordingFormats.cjs');

const MOV_FLAGS = ['-movflags', '+faststart+use_metadata_tags'];

function recordingArgs(input, output, stream, info, metaFile) {
  const args = ['-fflags', '+genpts', '-i', input, ...(metaFile ? ['-f', 'ffmetadata', '-i', metaFile, '-map_metadata', '1'] : []), '-map', '0:v:0?', '-map', '0:a:0?'];
  if (!stream.videoFormat && !stream.audioFormat) return [...args, '-c', 'copy', ...(/\.(mp4|mov|m4a)$/.test(output) ? MOV_FLAGS : []), output];
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
  if (/\.(mp4|mov|m4a)$/.test(output)) args.push(...MOV_FLAGS);
  return [...args, output];
}

// Commit the new file only after FFmpeg succeeds. On failure the recoverable
// source keeps its actual extension; a WebM must never be renamed to MP4/WAV.
// rec: opptaksdataene som skal ligge i filen (se readRecordingTag).
async function finalizeRecordingStream(dir, stream, ff = ffmpeg, rec = null) {
  const raw = path.join(dir, stream.raw);
  const final = path.join(dir, stream.file);
  const tmp = final + `.part${path.extname(final)}`;
  const metaFile = rec ? `${final}.ffmeta` : null;
  const result = { ...stream };
  delete result.raw;
  try {
    const info = await ff.probe(raw);
    if (!info.hasVideo && !info.hasAudio) throw new Error('The recording contains no readable media');
    if (metaFile) await fs.promises.writeFile(metaFile, `;FFMETADATA1\nreccut=${zlib.gzipSync(JSON.stringify(rec)).toString('base64url')}\n`);
    await ff.run(recordingArgs(raw, tmp, stream, info, metaFile)).promise;
    await fs.promises.rename(tmp, final);
    return { stream: result };
  } catch (error) {
    await fs.promises.unlink(tmp).catch(() => {});
    result.file = stream.raw;
    delete result.videoFormat;
    delete result.audioFormat;
    return { stream: result, warning: `Could not save ${stream.file} in the selected format. The original recording was kept as ${stream.raw}. ${error.message}` };
  } finally {
    if (metaFile) await fs.promises.unlink(metaFile).catch(() => {});
  }
}

/* Opptaksdataene ligger også i selve filene, pakket i taggen "reccut", så skjerm og kamera
   gjenkjennes etter at de er flyttet eller har fått nye navn. recording.json brukes når den finnes.
   WAV og Ogg kan ikke bære taggen; de finnes med filnavnet som står i den andre filen. */

const PARTS = ['screen', 'camera'];
const otherPart = (part) => (part === 'screen' ? 'camera' : 'screen');

function readRecordingTag(file) {
  return new Promise((resolve) => {
    execFile(ffmpeg.getFfmpegPath(), ['-v', 'error', '-i', file, '-f', 'ffmetadata', '-'], { maxBuffer: 2 ** 26, windowsHide: true }, (_err, out) => {
      try {
        const tag = /^reccut=(.+)$/im.exec(out)?.[1];
        const rec = tag ? JSON.parse(zlib.gunzipSync(Buffer.from(tag, 'base64url'), { maxOutputLength: 2 ** 28 })) : null;
        resolve(rec?.id && PARTS.includes(rec.part) ? rec : null);
      } catch {
        resolve(null);
      }
    });
  });
}

// Den andre filen i opptaket: først under navnet den fikk, ellers den i mappen med samme id.
async function partnerFile(file, rec) {
  const part = otherPart(rec.part);
  if (!rec[part]?.file) return null;
  const dir = path.dirname(file);
  const belongs = async (f) => {
    const tag = await readRecordingTag(f);
    return tag ? tag.id === rec.id && tag.part === part : /\.(wav|ogg)$/i.test(f);
  };
  // basename: navnet kommer fra filen som importeres, og skal ikke kunne peke ut av mappen.
  const named = path.join(dir, path.basename(rec[part].file));
  if (fs.existsSync(named) && (await belongs(named))) return named;
  // ponytail: leser taggen i hver mediefil i mappen, men bare når filene har fått nye navn.
  for (const name of await fs.promises.readdir(dir)) {
    const f = path.join(dir, name);
    if (f !== file && f !== named && /\.(mp4|mov|mkv|webm|m4a|flac|mp3)$/i.test(name) && (await belongs(f))) return f;
  }
  return null;
}

// Opptaket filen hører til: { id, target, paths }, eller null. target går til loadRecording,
// paths er alt som må følge med når opptaket kopieres.
async function findRecording(file) {
  if (fs.existsSync(path.join(file, 'recording.json'))) return { id: file, target: file, paths: [file] };
  const dir = path.dirname(file);
  try {
    const rec = JSON.parse(await fs.promises.readFile(path.join(dir, 'recording.json'), 'utf8'));
    if (PARTS.some((key) => rec[key]?.file === path.basename(file))) return { id: dir, target: dir, paths: [dir] };
  } catch {}
  const rec = await readRecordingTag(file);
  return rec && { id: rec.id, target: file, paths: [file, await partnerFile(file, rec)].filter(Boolean) };
}

// target er en opptaksmappe, eller en fil med tagg. Gir { rec, name, files: { screen, camera }, loose }.
async function loadRecording(target) {
  if ((await fs.promises.stat(target)).isDirectory()) {
    const rec = JSON.parse(await fs.promises.readFile(path.join(target, 'recording.json'), 'utf8'));
    const files = {};
    for (const key of PARTS) if (rec[key]) files[key] = path.join(target, rec[key].file);
    return { rec, name: path.basename(target), files, loose: false };
  }
  const rec = await readRecordingTag(target);
  if (!rec) throw new Error('The file has no recording data');
  const partner = await partnerFile(target, rec);
  const files = { [rec.part]: target, ...(partner ? { [otherPart(rec.part)]: partner } : {}) };
  return { rec, name: rec.name || path.basename(target, path.extname(target)), files, loose: true };
}

module.exports = { recordingArgs, finalizeRecordingStream, readRecordingTag, findRecording, loadRecording };
