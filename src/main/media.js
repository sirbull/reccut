// Import og analyse av media. Alt tungt skjer som bakgrunnsoppgaver.
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');
const jobs = require('./jobs');
const raw = require('./raw');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.qt', '.webm', '.mkv', '.avi', '.divx', '.mts', '.m2ts', '.ts', '.wmv', '.asf', '.flv', '.f4v', '.mpg', '.mpeg', '.m2v', '.vob', '.mod', '.3gp', '.3g2', '.mxf', '.ogv', '.dv', '.y4m', '.rm', '.rmvb']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.m4b', '.aac', '.flac', '.ogg', '.oga', '.opus', '.weba', '.aif', '.aiff', '.aifc', '.wma', '.caf', '.mka', '.ac3', '.eac3', '.dts', '.amr', '.ape', '.wv', '.au', '.mp2']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.gif', '.bmp', '.avif', '.svg', '.tif', '.tiff', '.heic', '.heif', '.tga', '.psd', '.ico', '.dds', '.exr', '.jp2', '.jxl']);
// Bildeformater Chromium viser direkte. Andre konverteres til PNG ved import.
const NATIVE_IMAGE = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.webp', '.gif', '.bmp', '.avif', '.svg', '.ico']);

const PLAYABLE_CONTAINERS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus']);
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', ...(process.platform === 'linux' ? [] : ['hevc'])]);
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_s32le', 'pcm_u8']);

function cacheRoot() {
  return path.join(app.getPath('userData'), 'cache');
}

async function cacheDirFor(file) {
  const st = await fs.promises.stat(file);
  const hash = crypto.createHash('sha1').update(`${file}|${st.size}|${st.mtimeMs}`).digest('hex').slice(0, 16);
  const dir = path.join(cacheRoot(), hash);
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return 'image';
  if (AUDIO_EXT.has(ext)) return 'audio';
  if (VIDEO_EXT.has(ext)) return 'video';
  return 'unknown';
}

// Ukjente endelser: la FFmpeg avgjøre hva filen inneholder.
function kindFromProbe(info) {
  if (info.hasVideo && (info.duration > 0.2 || !info.hasAudio)) {
    const still = /image2|png_pipe|jpeg_pipe|tiff_pipe|bmp_pipe|webp_pipe|psd_pipe/.test(info.format || '');
    return still ? 'image' : 'video';
  }
  if (info.hasAudio) return 'audio';
  return null;
}

function needsOptimizing(file, info) {
  const ext = path.extname(file).toLowerCase();
  // HDR tonemappes til en arbeidskopi, så bildet ser likt ut i visningen og eksporten.
  if (info.hasVideo && info.color?.hdr) return true;
  if (!PLAYABLE_CONTAINERS.has(ext)) return true;
  if (info.hasVideo && !PLAYABLE_VIDEO.has(info.videoCodec)) return true;
  // 10-bit og 4:2:2 H.264 kan ikke spilles av i Chromium.
  if (info.hasVideo && info.videoCodec === 'h264' && info.pixFmt && !/^yuvj?420p$/.test(info.pixFmt)) return true;
  if (info.hasAudio && !PLAYABLE_AUDIO.has(info.audioCodec)) return true;
  return false;
}

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

async function streamFromFile(file, kind, info) {
  info = info || (await ff.probe(file));
  const stream = {
    path: file,
    offset: 0,
    duration: info.duration,
    hasVideo: kind !== 'audio' && info.hasVideo,
    hasAudio: kind !== 'image' && info.hasAudio,
    width: info.width,
    height: info.height,
    fps: info.fps,
    needsProxy: kind !== 'image' && needsOptimizing(file, info),
    color: info.hasVideo ? info.color : undefined,
  };
  return stream;
}

// Leser inn filer og returnerer mediaposter med en gang. Analysen fortsetter i bakgrunnen.
// Returnerer { items, failed }. Filer som ikke kan leses avvises med en gang.
async function importFiles(files, notify) {
  const result = [];
  const failed = [];
  for (const file of files) {
    let kind = kindOf(file);
    if (raw.RAW_EXT.has(path.extname(file).toLowerCase())) {
      const media = await importRaw(file, notify).catch((err) => (console.error('RAW import failed', file, err), null));
      if (media) result.push(media);
      else failed.push(path.basename(file));
      continue;
    }
    try {
      const info = await ff.probe(file);
      const readable = info.hasVideo || info.hasAudio || (kind === 'image' && info.width > 0);
      if (!readable) {
        failed.push(path.basename(file));
        continue;
      }
      if (kind === 'unknown') kind = kindFromProbe(info);
      if (!kind) {
        failed.push(path.basename(file));
        continue;
      }
      if ((kind === 'video' || kind === 'audio') && !(info.duration > 0)) {
        failed.push(path.basename(file));
        continue;
      }
      // Animerte GIF-er og lignende behandles som video.
      if (kind === 'image' && info.duration > 0.2 && info.fps > 1 && /gif|webp|apng/.test(info.format || path.extname(file))) kind = 'video';
      const stream = await streamFromFile(file, kind, info);
      if (kind === 'image') {
        stream.duration = 0;
        stream.hasVideo = true;
        const ext = path.extname(file).toLowerCase();
        if (!NATIVE_IMAGE.has(ext)) {
          const png = path.join(await cacheDirFor(file), 'bilde.png');
          if (!fs.existsSync(png)) await ff.convertImage(file, png);
          stream.proxy = png;
        }
        stream.width = stream.width || info.width;
        stream.height = stream.height || info.height;
      }
      if (kind === 'video' && !stream.hasVideo && stream.hasAudio) {
        result.push(await makeMedia(file, 'audio', { main: { ...stream, hasVideo: false } }, notify));
        continue;
      }
      result.push(await makeMedia(file, kind, { main: stream }, notify));
    } catch (err) {
      console.error('Import failed', file, err);
      failed.push(path.basename(file));
    }
  }
  return { items: result, failed };
}

// RAW-bilde: kameraets innebygde JPEG hentes ut og rettes opp etter orienteringen i filen.
// DNG uten forhåndsvisning prøves med FFmpeg.
async function importRaw(file, notify) {
  const dir = await cacheDirFor(file);
  const out = path.join(dir, 'raw.jpg');
  let width;
  let height;
  if (!fs.existsSync(out)) {
    const tmp = path.join(dir, 'raw-preview.jpg');
    const prev = await raw.extractPreview(file, tmp);
    if (prev) {
      const rotate = { 3: 'transpose=1,transpose=1', 6: 'transpose=1', 8: 'transpose=2' }[prev.orientation];
      if (rotate) {
        await ff.run(['-i', tmp, '-vf', rotate, '-q:v', '2', out]).promise;
        await fs.promises.unlink(tmp).catch(() => {});
      } else await fs.promises.rename(tmp, out);
    } else if (path.extname(file).toLowerCase() === '.dng') {
      await ff.run(['-i', file, '-frames:v', '1', '-q:v', '2', out]).promise;
    } else return null;
  }
  const info = await ff.probe(out);
  width = info.width;
  height = info.height;
  if (!width) return null;
  const stream = { path: file, proxy: out, offset: 0, duration: 0, hasVideo: true, hasAudio: false, width, height, fps: 0, needsProxy: false };
  return makeMedia(file, 'image', { main: stream }, notify, { raw: true });
}

async function makeMedia(file, kind, streams, notify, extra = {}) {
  const main = streams.main || streams.screen || streams.camera;
  const media = {
    id: newId(),
    kind,
    path: file,
    name: extra.name || path.basename(file),
    duration: extra.duration ?? main.duration,
    width: extra.width ?? main.width,
    height: extra.height ?? main.height,
    fps: main.fps || 30,
    streams,
    ...extra,
  };
  scheduleAnalysis(media, notify);
  return media;
}

// Miniatyrbilder, lydbølger og eventuelt optimalisert kopi for hver strøm.
function scheduleAnalysis(media, notify) {
  for (const [key, stream] of Object.entries(media.streams)) {
    jobs.add({
      kind: 'analyze',
      title: `Analyzing ${media.name}${Object.keys(media.streams).length > 1 ? ` (${key})` : ''}`,
      queue: 'light',
      run: async (ctx) => {
        const dir = await cacheDirFor(stream.path);
        const patch = {};
        let source = stream.path;

        if (stream.needsProxy && !stream.optimized) {
          const old = path.join(dir, 'optimalisert.mp4');
          const proxy = !stream.color?.hdr && fs.existsSync(old) ? old : path.join(dir, `arbeidskopi${ff.transcodeExt(stream.color)}`);
          if (!fs.existsSync(proxy)) {
            ctx.progress(0, stream.color?.hdr ? 'Tone mapping HDR' : 'Creating a playable copy');
            const tmp = proxy + `.tmp${path.extname(proxy)}`;
            const job = ff.transcode(stream.path, tmp, { color: stream.color, duration: stream.duration, quality: 'proxy' }, (p) => ctx.progress(p * 0.7));
            ctx.setCancel(job.kill);
            await job.promise;
            await fs.promises.rename(tmp, proxy);
          }
          patch.proxy = proxy;
          source = proxy;
        } else if (stream.optimized && fs.existsSync(stream.optimized)) source = stream.optimized;

        if (stream.hasVideo && media.kind !== 'image') {
          const thumbDir = path.join(dir, 'thumbs');
          let thumbs;
          const metaFile = path.join(thumbDir, 'meta.json');
          if (fs.existsSync(metaFile)) thumbs = JSON.parse(await fs.promises.readFile(metaFile, 'utf8'));
          else {
            thumbs = await ff.thumbnails(source, thumbDir, stream.duration, (p) => ctx.progress(0.7 + p * 0.2));
            await fs.promises.writeFile(metaFile, JSON.stringify(thumbs));
          }
          patch.thumbs = thumbs;
        }
        if (media.kind === 'image') patch.thumbs = { interval: 1e9, files: [stream.proxy || stream.path] };

        if (stream.hasAudio) {
          const waveFile = path.join(dir, 'wave.json');
          if (!fs.existsSync(waveFile)) {
            const wave = await ff.waveform(source);
            await fs.promises.writeFile(waveFile, JSON.stringify(wave));
          }
          patch.wave = waveFile;
        }
        notify({ mediaId: media.id, stream: key, patch });
        return null;
      },
    });
  }
}

// Gjør om en ferdig opptaksmappe til en mediapost.
async function recordingMedia(dir, notify) {
  const rec = JSON.parse(await fs.promises.readFile(path.join(dir, 'recording.json'), 'utf8'));
  const streams = {};
  for (const key of ['screen', 'camera']) {
    const s = rec[key];
    if (!s) continue;
    const file = path.join(dir, s.file);
    const info = await ff.probe(file);
    streams[key] = {
      path: file,
      offset: s.offset || 0,
      duration: info.duration,
      hasVideo: info.hasVideo,
      hasAudio: info.hasAudio,
      width: info.width,
      height: info.height,
      fps: info.fps,
      color: info.hasVideo ? info.color : undefined,
      needsProxy: false,
    };
  }
  const duration = Math.max(...Object.values(streams).map((s) => s.offset + s.duration), 0.1);
  const base = streams.screen || streams.camera;
  return makeMedia(dir, 'recording', streams, notify, {
    name: path.basename(dir),
    duration,
    fps: rec.fps || 30,
    width: base?.width || 1920,
    height: base?.height || 1080,
    rec: {
      layouts: rec.layouts || [[0, 6]],
      pip: rec.pip || { size: 'medium', shape: 'rect', mirror: false },
      cursor: rec.cursor || [],
      zooms: rec.zooms || [],
      clicks: rec.clicks || [],
      keys: rec.keys || [],
      overlays: rec.overlays || { keys: true, cursorZoom: true, clicks: false },
    },
  });
}

// Baklengs kopi av en strøm, laget i biter på ti sekunder så lange filer ikke fyller minnet.
// Tid r i kopien tilsvarer tid (varighet minus r) i originalen.
const reversing = new Map();
function reverseStream(stream, ctx, share = [0, 1]) {
  const source = stream.optimized || stream.proxy || stream.path;
  const key = source;
  if (reversing.has(key)) return reversing.get(key);
  const job = (async () => {
    const dir = await cacheDirFor(source);
    const out = path.join(dir, 'baklengs.mp4');
    if (fs.existsSync(out)) return out;
    const D = stream.duration;
    const SEG = 10;
    const n = Math.max(1, Math.ceil(D / SEG));
    const parts = [];
    for (let i = 0; i < n; i++) {
      const end = D - i * SEG;
      const start = Math.max(0, end - SEG);
      const part = path.join(dir, `rev_${i}.mp4`);
      const args = ['-ss', String(start), '-t', String(end - start), '-i', source];
      if (stream.hasVideo) args.push('-map', '0:v:0', '-vf', 'reverse', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', '15');
      if (stream.hasAudio) args.push('-map', '0:a:0', '-af', 'areverse', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
      args.push(part);
      const r = ff.run(args);
      ctx?.setCancel(r.kill);
      await r.promise;
      parts.push(part);
      ctx?.progress(share[0] + ((i + 1) / n) * (share[1] - share[0]), 'Creating reversed media');
    }
    const list = path.join(dir, 'rev_list.txt');
    await fs.promises.writeFile(list, parts.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const tmp = out + '.tmp.mp4';
    await ff.run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', tmp]).promise;
    await fs.promises.rename(tmp, out);
    for (const f of [...parts, list]) await fs.promises.unlink(f).catch(() => {});
    return out;
  })();
  reversing.set(key, job);
  job.finally(() => reversing.delete(key)).catch(() => {});
  return job;
}

// Lager baklengs kopier av alle strømmene i et medium. Resultatet meldes som en vanlig analyse.
function scheduleReverse(media, notify) {
  return jobs.add({
    kind: 'analyze',
    title: `Reversing ${media.name}`,
    queue: 'light',
    run: async (ctx) => {
      const keys = Object.keys(media.streams).filter((k) => !media.streams[k].reversed);
      for (const [i, key] of keys.entries()) {
        const file = await reverseStream(media.streams[key], ctx, [i / keys.length, (i + 1) / keys.length]);
        notify({ mediaId: media.id, stream: key, patch: { reversed: file } });
      }
    },
  });
}

/**
 * Optimalisert media: omkoder strømmene til et format som er godt å redigere med
 * (se ff.transcode) og legger filene i prosjektets mappe for optimalisert media.
 */
function scheduleOptimize(media, outDir, notify) {
  const keys = Object.keys(media.streams).filter((k) => media.streams[k].hasVideo && !media.streams[k].optimized);
  if (media.kind === 'image' || !keys.length) return null;
  return jobs.add({
    kind: 'optimize',
    title: `Optimizing ${media.name}`,
    queue: 'optimize',
    run: async (ctx) => {
      await fs.promises.mkdir(outDir, { recursive: true });
      for (const [i, key] of keys.entries()) {
        const st = media.streams[key];
        const stem = path.basename(media.kind === 'recording' ? `${media.name} ${key}` : media.name, path.extname(media.name));
        const ext = ff.transcodeExt(st.color);
        let out = path.join(outDir, `${stem}${ext}`);
        let n = 2;
        while (fs.existsSync(out)) out = path.join(outDir, `${stem} ${n++}${ext}`);
        const tmp = out + `.part${ext}`;
        const job = ff.transcode(st.path, tmp, { color: st.color, duration: st.duration, quality: 'optimized' }, (p) => ctx.progress((i + Math.min(1, p)) / keys.length, st.color?.hdr ? 'Tone mapping HDR' : 'Transcoding'));
        ctx.setCancel(job.kill);
        try {
          await job.promise;
        } catch (err) {
          await fs.promises.unlink(tmp).catch(() => {});
          throw err;
        }
        await fs.promises.rename(tmp, out);
        notify({ mediaId: media.id, stream: key, patch: { optimized: out } });
      }
      return outDir;
    },
  });
}

// Et medium er offline når ingen av filene finnes: verken originalen, arbeidskopien eller optimalisert media.
function isOffline(media) {
  // Synket lyd fra en annen fil teller ikke: det er bildet og kameralyden som mangler.
  const streams = Object.values(media.streams || {}).filter((st) => !st.syncedFrom);
  if (!streams.length) return !fs.existsSync(media.path);
  return streams.every((st) => ![st.optimized, st.proxy, st.path].some((p) => p && fs.existsSync(p)));
}

// Bytter filen et medium peker på (Relink File). Analyser og kopier lages på nytt.
async function relink(media, file, notify) {
  const { items, failed } = await importFiles([file], () => {});
  if (failed.length || !items.length) throw new Error('The file could not be read.');
  const fresh = items[0];
  const next = { ...fresh, id: media.id, name: media.name === path.basename(media.path) ? fresh.name : media.name };
  scheduleAnalysis(next, notify);
  return next;
}

// Alle filendelser appen kjenner, for importdialogen.
function extensions() {
  return [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT, ...raw.RAW_EXT, '.psb', '.reccut-title'].map((e) => e.slice(1));
}

module.exports = { isOffline, relink, scheduleOptimize, reverseStream, scheduleReverse, extensions, importFiles, recordingMedia, kindOf, cacheRoot, newId };
