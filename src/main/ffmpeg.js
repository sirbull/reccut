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
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.split('\n').slice(-6).join('\n')}`));
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
  const info = { pixFmt: null, format: /Input #0, ([\w,]+)/.exec(out)?.[1] ?? null, duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0, fps: 0, videoCodec: null, audioCodec: null };
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (d) info.duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  for (const line of out.split('\n')) {
    if (/Stream #.*Video:/.test(line) && !info.hasVideo && !/attached pic/.test(line)) {
      info.hasVideo = true;
      info.videoCodec = /Video: (\w+)/.exec(line)?.[1] ?? null;
      info.pixFmt = /, (yuv\w+|yuvj\w+|nv\d+|rgb\w*|bgr\w*|argb|abgr|rgba|bgra|gray\w*|pal8|gbr\w*)[,( ]/.exec(line)?.[1] ?? null;
      info.color = parseColor(line, info.pixFmt);
      info.interlaced = /top first|bottom first|top coded first|bottom coded first|\binterlaced\b/.test(line);
      info.alpha = /^(yuva|rgba|bgra|argb|abgr|gbrap|ya\d|ya8)/.test(info.pixFmt || '');
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

// Fargeinformasjon: bitdybde og overføringsfunksjon (PQ og HLG er HDR).
// Eksempel: yuv420p10le(tv, bt2020nc/bt2020/smpte2084)
function parseColor(line, pixFmt) {
  const bits = /p(9|10|12|14|16)(le|be)?$/.exec(pixFmt || '') ? Number(/p(9|10|12|14|16)/.exec(pixFmt)[1]) : /48|64|f32|f16/.test(pixFmt || '') ? 16 : 8;
  const m = new RegExp(`${(pixFmt || 'x').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\(([^)]*)\\)`).exec(line);
  const parts = m ? m[1].split(',').map((x) => x.trim()) : [];
  const range = parts.find((x) => x === 'tv' || x === 'pc') || null;
  const desc = parts.find((x) => x.includes('/')) || parts.find((x) => /^bt|smpte|arib|iec/.test(x)) || '';
  let [space, primaries, transfer] = desc.split('/');
  if (desc && !desc.includes('/')) primaries = transfer = space = desc;
  const hdr = transfer === 'smpte2084' ? 'pq' : transfer === 'arib-std-b67' ? 'hlg' : null;
  return { bits, range, space: space || null, primaries: primaries || null, transfer: transfer || null, hdr };
}

let filterList = null;
function hasFilter(name) {
  if (!filterList) {
    try {
      filterList = require('child_process').execFileSync(ffmpegPath, ['-hide_banner', '-filters'], { encoding: 'utf8', windowsHide: true });
    } catch {
      filterList = '';
    }
  }
  return new RegExp(`\\s${name}\\s`).test(filterList);
}

/**
 * Omkoding til et format som er godt å redigere med.
 * 8-bit SDR: H.264 med korte GOP-er. 10-bit og HDR: VP9 profil 2 i 10-bit.
 * HDR tonemappes til Rec. 709, så bildet ser riktig ut i redigeringen og eksporten.
 * quality 'optimized' gir høy kvalitet, 'proxy' går raskere.
 */
function transcode(file, output, { color, duration, quality = 'optimized', audio = true, alpha = false, interlaced = false, hasVideo = true, safe = false }, onProgress) {
  const tenBit = (color?.bits || 8) > 8 || Boolean(color?.hdr);
  // Gjennomsiktig video (ProRes 4444, animasjoner med alfa) blir VP9 med alfa, som Chromium viser.
  const vp9 = tenBit || alpha;
  const fast = quality === 'proxy';
  const args = ['-fflags', '+genpts', ...(safe ? ['-err_detect', 'ignore_err'] : []), '-i', file, '-map', '0:v:0?', ...(audio ? ['-map', '0:a:0?'] : []), '-map_metadata', '-1'];
  if (hasVideo) {
    const vf = [];
    // Linjeflettet video (TV, DV, eldre kameraer) avflettes, ellers blir bevegelser hakkete.
    if (interlaced) vf.push('bwdif=mode=send_frame:deint=interlaced');
    if (color?.hdr && hasFilter('zscale') && hasFilter('tonemap')) {
      const tin = color.hdr === 'pq' ? 'smpte2084' : 'arib-std-b67';
      vf.push(`zscale=tin=${tin}:min=bt2020nc:pin=bt2020:t=linear:npl=203`, 'format=gbrpf32le', 'zscale=p=bt709', 'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv');
    }
    // Koderne krever partall bredde og høyde, og firkantede piksler gjør resten av appen enklere.
    vf.push("scale='trunc(iw*sar/2)*2':'trunc(ih/2)*2'", 'setsar=1');
    vf.push(alpha ? 'format=yuva420p' : tenBit ? 'format=yuv420p10le' : 'format=yuv420p');
    args.push('-vf', vf.join(','));
  }
  if (vp9) {
    if (hasVideo) {
      args.push('-c:v', 'libvpx-vp9', '-crf', fast ? '24' : '15', '-b:v', '0', '-g', '15', '-row-mt', '1', '-tile-columns', '2', '-deadline', fast ? 'realtime' : 'good', '-cpu-used', fast ? '8' : '4');
      if (alpha) args.push('-auto-alt-ref', '0');
      else args.push('-profile:v', '2', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709');
      if (color?.hdr) args.push('-metadata:s:v:0', `reccut_tonemapped=${color.hdr}`);
    }
    if (audio) args.push('-c:a', 'libopus', '-b:a', '192k', '-ac', '2', '-ar', '48000');
  } else {
    if (hasVideo) args.push('-c:v', 'libx264', '-preset', fast ? 'veryfast' : 'medium', '-crf', fast ? '18' : '12', '-g', '15', '-bf', '0', '-profile:v', 'high');
    // Lyden blir alltid stereo 48 kHz: det tåler alle kodere, og miksen i appen er stereo uansett.
    if (audio) args.push('-c:a', 'aac', '-b:a', '256k', '-ac', '2', '-ar', '48000');
    args.push('-movflags', '+faststart');
  }
  args.push('-max_muxing_queue_size', '9999', output);
  return run(args, { onProgress: (s) => onProgress?.(s / Math.max(duration || 0, 0.1)) });
}

// Prøver omkodingen på nytt med færre krav hvis første forsøk feiler (for eksempel en skadet fil).
async function transcodeRobust(file, output, opts, onProgress, setCancel) {
  const first = transcode(file, output, opts, onProgress);
  setCancel?.(first.kill);
  try {
    return await first.promise;
  } catch (err) {
    await fs.promises.unlink(output).catch(() => {});
    const again = transcode(file, output, { ...opts, safe: true, quality: 'proxy' }, onProgress);
    setCancel?.(again.kill);
    try {
      return await again.promise;
    } catch {
      throw err;
    }
  }
}

// Lengden på filer som ikke oppgir den selv (rå videostrømmer og enkelte opptak): pakkene telles
// uten å dekode bildene. Har pakkene tidsstempler, brukes det siste; ellers antall bilder delt på fps.
async function scanDuration(file, fps = 25) {
  const r = run(['-i', file, '-map', '0:v:0?', '-c', 'copy', '-f', 'framecrc', '-']);
  const out = await r.promise.catch(() => Buffer.alloc(0));
  let tb = null;
  let end = 0;
  let count = 0;
  for (const line of out.toString().split('\n')) {
    const t = /^#tb 0: (\d+)\/(\d+)/.exec(line);
    if (t) tb = Number(t[1]) / Number(t[2]);
    if (!/^0,/.test(line)) continue;
    count++;
    const [, , pts, dur] = line.split(',').map((x) => Number(x.trim()));
    if (tb && Number.isFinite(pts)) end = Math.max(end, (pts + (Number.isFinite(dur) ? dur : 0)) * tb);
  }
  if (end > 0) return end;
  return count > 0 ? count / (fps || 25) : 0;
}

// Filendelsen omkodingen får.
function transcodeExt(color, alpha = false, hasVideo = true) {
  if (!hasVideo) return '.m4a';
  return (color?.bits || 8) > 8 || color?.hdr || alpha ? '.webm' : '.mp4';
}

/**
 * Detaljer om en fil til Info- og Audio-fanene: format, bitrate, kodeker, lydformat og metadata.
 * Leses når fanen vises, så eldre prosjekter også får dem.
 */
async function details(file) {
  const proc = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
  let out = '';
  proc.stderr.on('data', (d) => (out += d.toString()));
  await new Promise((r) => proc.on('close', r));
  const st = await fs.promises.stat(file).catch(() => null);
  const info = {
    size: st?.size ?? null,
    created: st ? Math.round(st.birthtimeMs || st.ctimeMs) : null,
    modified: st ? Math.round(st.mtimeMs) : null,
    container: /Input #0, ([\w,]+)/.exec(out)?.[1] ?? null,
    duration: 0,
    bitrate: Number(/bitrate: (\d+) kb\/s/.exec(out)?.[1]) || null,
    video: [],
    audio: [],
    meta: {},
  };
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
  if (d) info.duration = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
  // Metadata for hele filen: kamera, programvare og opptakstid.
  const head = out.split(/\n\s*Duration:/)[0];
  for (const m of head.matchAll(/^\s{4}(\S[^:]*?)\s*: (.+)$/gm)) {
    const key = m[1].trim();
    if (/creation_time|encoder|make|model|software|location|title|artist|comment|date/i.test(key)) info.meta[key.replace(/^com\.apple\.quicktime\./, '')] = m[2].trim();
  }
  for (const line of out.split('\n')) {
    const v = /Stream #\S+: Video: (\w+)(?: \(([^)]*)\))?/.exec(line);
    if (v && !/attached pic/.test(line)) {
      const size = /, (\d{2,5})x(\d{2,5})/.exec(line);
      const pix = /, (yuv\w+|yuvj\w+|nv\d+|rgb\w*|bgr\w*|argb|abgr|rgba|bgra|gray\w*|pal8|gbr\w*)[,( ]/.exec(line)?.[1] ?? null;
      info.video.push({
        codec: v[1],
        profile: v[2] && !/\//.test(v[2]) ? v[2] : null,
        width: size ? Number(size[1]) : 0,
        height: size ? Number(size[2]) : 0,
        fps: Number(/([\d.]+) fps/.exec(line)?.[1]) || null,
        bitrate: Number(/(\d+) kb\/s/.exec(line)?.[1]) || null,
        pixFmt: pix,
        color: parseColor(line, pix),
      });
    }
    const a = /Stream #\S+: Audio: (\w+)(?: \(([^)]*)\))?/.exec(line);
    if (a) {
      const layout = /Hz, ([^,]+),/.exec(line)?.[1] ?? null;
      info.audio.push({
        codec: a[1],
        profile: a[2] && !/\//.test(a[2]) ? a[2] : null,
        sampleRate: Number(/(\d+) Hz/.exec(line)?.[1]) || null,
        layout,
        channels: layout === 'mono' ? 1 : layout === 'stereo' ? 2 : Number(/(\d+) channels/.exec(line)?.[1]) || (/5\.1/.test(layout || '') ? 6 : /7\.1/.test(layout || '') ? 8 : null),
        sampleFormat: /Hz, [^,]+, (\w+)/.exec(line)?.[1] ?? null,
        bitrate: Number(/(\d+) kb\/s/.exec(line)?.[1]) || null,
      });
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

// Konverterer bilder nettleseren ikke viser (TIFF, HEIC, TGA, PSD og lignende) til PNG.
async function convertImage(file, output) {
  await run(['-i', file, '-frames:v', '1', '-update', '1', output]).promise;
}

module.exports = {
  transcode, transcodeRobust, scanDuration, transcodeExt, hasFilter, details,
  convertImage, getFfmpegPath, run, probe, remux, thumbnails, waveform, optimize, decodePcm };
