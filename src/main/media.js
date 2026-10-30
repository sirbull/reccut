// Import og analyse av media. Alt tungt skjer som bakgrunnsoppgaver.
const { app } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');
const jobs = require('./jobs');

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

        if (stream.needsProxy) {
          const proxy = path.join(dir, 'optimalisert.mp4');
          if (!fs.existsSync(proxy)) {
            ctx.progress(0, 'Creating optimized media');
            const tmp = proxy + '.tmp.mp4';
            const job = ff.optimize(stream.path, tmp, stream.duration, (p) => ctx.progress(p * 0.7));
            ctx.setCancel(job.kill);
            await job.promise;
            await fs.promises.rename(tmp, proxy);
          }
          patch.proxy = proxy;
          source = proxy;
        }

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

// Alle filendelser appen kjenner, for importdialogen.
function extensions() {
  return [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].map((e) => e.slice(1));
}

module.exports = { extensions, importFiles, recordingMedia, kindOf, cacheRoot, newId };
