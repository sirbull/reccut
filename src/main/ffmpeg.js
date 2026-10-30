// Hjelpefunksjoner rundt FFmpeg: kjøring med fremdrift, remuksing,
// miniatyrbilder, lydbølger og optimalisert media.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let ffmpegPath = require('ffmpeg-static');
// I en pakket app ligger binærfilen utenfor asar-arkivet.
if (ffmpegPath) ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');

function getFfmpegPath() {
  return ffmpegPath;
}

// Kjører FFmpeg. onProgress får sekunder behandlet. Returnerer { promise, kill }.
function run(args, { onProgress, input } = {}) {
  const proc = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-y', ...args], {
    stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderr = '';
  let stdoutChunks = [];
  proc.stdout.on('data', (d) => stdoutChunks.push(d));
  proc.stderr.on('data', (d) => {
    const s = d.toString();
    stderr = (stderr + s).slice(-20000);
    if (onProgress) {
      const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
      if (m) onProgress(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
    }
  });
  const promise = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdoutChunks));
      else reject(new Error(`FFmpeg avsluttet med kode ${code}: ${stderr.split('\n').slice(-6).join('\n')}`));
    });
  });
  return { proc, promise, kill: () => proc.kill('SIGKILL') };
}

// Leser varighet, oppløsning og strømmer fra FFmpeg sin informasjonsutskrift.
async function probe(file) {
  const proc = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
  let out = '';
  proc.stderr.on('data', (d) => (out += d.toString()));
  await new Promise((r) => proc.on('close', r));
  const info = { duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0, fps: 0, videoCodec: null, audioCodec: null };
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (d) info.duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  for (const line of out.split('\n')) {
    if (/Stream #.*Video:/.test(line) && !info.hasVideo && !/attached pic/.test(line)) {
      info.hasVideo = true;
      info.videoCodec = /Video: (\w+)/.exec(line)?.[1] ?? null;
      const s = /, (\d{2,5})x(\d{2,5})/.exec(line);
      if (s) {
        info.width = Number(s[1]);
        info.height = Number(s[2]);
      }
      const f = /([\d.]+) fps/.exec(line);
      if (f) info.fps = Number(f[1]);
      const rot = /rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+)/.exec(out);
      if (rot && Math.abs(Number(rot[1] ?? rot[2])) % 180 === 90) {
        [info.width, info.height] = [info.height, info.width];
      }
    }
    if (/Stream #.*Audio:/.test(line) && !info.hasAudio) {
      info.hasAudio = true;
      info.audioCodec = /Audio: (\w+)/.exec(line)?.[1] ?? null;
    }
  }
  return info;
}

// Gjør MediaRecorder-filer søkbare og gir dem riktig varighet, uten omkoding.
async function remux(input, output) {
  const ext = path.extname(output).toLowerCase();
  const args = ['-fflags', '+genpts', '-i', input, '-map', '0', '-c', 'copy'];
  if (ext === '.mp4' || ext === '.mov' || ext === '.m4a') args.push('-movflags', '+faststart');
  args.push(output);
  await run(args).promise;
}

// Ett miniatyrbilde per intervall, lagret som en stripe av JPEG-filer.
async function thumbnails(file, outDir, duration, onProgress) {
  await fs.promises.mkdir(outDir, { recursive: true });
  const interval = Math.max(1, duration / 240);
  await run(
    ['-i', file, '-an', '-vf', `fps=1/${interval.toFixed(3)},scale=-2:90`, '-q:v', '6', path.join(outDir, 't%04d.jpg')],
    { onProgress: (s) => onProgress?.(s / Math.max(duration, 0.1)) }
  ).promise;
  const files = (await fs.promises.readdir(outDir)).filter((f) => f.endsWith('.jpg')).sort();
  return { interval, files: files.map((f) => path.join(outDir, f)) };
}

// Toppnivåer for lydbølgen: 100 verdier per sekund, mono.
async function waveform(file, streamIndex = 0) {
  const buf = await run([
    '-i', file, '-map', `0:a:${streamIndex}`, '-ac', '1', '-ar', '4000', '-f', 'f32le', '-',
  ]).promise;
  const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  const per = 40;
  const peaks = new Array(Math.ceil(samples.length / per));
  for (let i = 0; i < peaks.length; i++) {
    let m = 0;
    const end = Math.min(samples.length, (i + 1) * per);
    for (let j = i * per; j < end; j++) {
      const v = samples[j] < 0 ? -samples[j] : samples[j];
      if (v > m) m = v;
    }
    peaks[i] = Math.round(Math.min(1, m) * 255);
  }
  return { rate: 100, peaks };
}

// Lager en lett redigerbar H.264-kopi av filer appen ikke kan spille av direkte.
function optimize(file, output, duration, onProgress) {
  return run(
    [
      '-i', file, '-map', '0:v:0?', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
      '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', output,
    ],
    { onProgress: (s) => onProgress?.(s / Math.max(duration, 0.1)) }
  );
}

// Dekoder et utsnitt av lyden til rå 32-bits flyttall, 48 kHz stereo.
function decodePcm(file, { start = 0, duration, streamIndex = 0, rate = 48000, channels = 2, output }) {
  const args = ['-ss', String(Math.max(0, start)), '-i', file];
  if (duration) args.push('-t', String(duration));
  args.push('-map', `0:a:${streamIndex}`, '-ac', String(channels), '-ar', String(rate), '-f', 'f32le', output || '-');
  return run(args);
}

module.exports = { getFfmpegPath, run, probe, remux, thumbnails, waveform, optimize, decodePcm };
