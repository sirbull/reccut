// Import og analyse av media. Alt tungt skjer som bakgrunnsoppgaver.
const { app } = require('electron');
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ff = require('./ffmpeg');
const jobs = require('./jobs');
const raw = require('./raw');
const motion = require('./motion');
const tsdemux = require('./tsdemux');
const decoders = require('./decoders');
const { findRecording, loadRecording } = require('./recording');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.qt', '.webm', '.mkv', '.avi', '.divx', '.mts', '.m2ts', '.ts', '.wmv', '.asf', '.flv', '.f4v', '.mpg', '.mpeg', '.m2v', '.vob', '.mod', '.3gp', '.3g2', '.mxf', '.ogv', '.dv', '.y4m', '.rm', '.rmvb', '.h264', '.264', '.avc', '.h265', '.265', '.hevc', '.m1v', '.mpv', '.vc1', '.ivf', '.obu', '.nut', '.ogm', '.xvid', '.evo', '.trp', '.tp', '.m2t', '.f4p', '.bik', '.smk', '.nsv', '.amv', '.mjpeg', '.mjpg', '.dav', '.vro', '.wtv', '.dvr-ms', '.gxf', '.r3d', '.braw']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.m4b', '.aac', '.flac', '.ogg', '.oga', '.opus', '.weba', '.aif', '.aiff', '.aifc', '.wma', '.caf', '.mka', '.ac3', '.eac3', '.dts', '.amr', '.ape', '.wv', '.au', '.mp2', '.spx', '.tta', '.w64', '.rf64', '.mpc', '.ra', '.voc', '.snd', '.gsm', '.m4r', '.3ga', '.dsf', '.dff', '.thd', '.truehd', '.mlp', '.shn', '.tak', '.ofr', '.awb', '.qcp', '.sln', '.adts', '.mp1', '.m2a', '.oma', '.aa3', '.xa', '.vqf']);
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.jfif', '.pjpeg', '.webp', '.gif', '.bmp', '.dib', '.avif', '.svg', '.tif', '.tiff', '.heic', '.heif', '.tga', '.psd', '.ico', '.cur', '.dds', '.exr', '.jp2', '.j2k', '.jpx', '.jxl', '.dpx', '.cin', '.hdr', '.pcx', '.ppm', '.pgm', '.pbm', '.pam', '.pfm', '.sgi', '.rgb', '.rgba', '.bw', '.xwd', '.xbm', '.xpm', '.sun', '.ras', '.qoi', '.fits', '.fit', '.pic', '.vbn', '.wbmp', '.jls', '.jng']);
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
    // Alle FFmpegs bildeformater heter noe med _pipe (dpx_pipe, sgi_pipe og så videre) eller image2.
    const still = /image2|_pipe\b/.test(info.format || '') || (!(info.duration > 0) && !info.hasAudio && /^(png|mjpeg|bmp|tiff|webp|dpx|sgi|pcx|ppm|pgm|pbm|pam|xwd|hdr|qoi|exr|jpeg2000|targa|sunrast|fits)$/.test(info.videoCodec || ''));
    return still ? 'image' : 'video';
  }
  if (info.hasAudio) return 'audio';
  return null;
}

function needsOptimizing(file, info) {
  const ext = path.extname(file).toLowerCase();
  // HDR tonemappes til en arbeidskopi, så bildet ser likt ut i visningen og eksporten.
  if (info.hasVideo && info.color?.hdr) return true;
  // Linjeflettet video avflettes, og gjennomsiktighet utenfor WebM må over i VP9 med alfa for å vises.
  if (info.hasVideo && info.interlaced) return true;
  if (info.hasVideo && info.alpha && ext !== '.webm' && !/gif|png|apng|webp/.test(info.videoCodec || '')) return true;
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
    alpha: Boolean(info.hasVideo && info.alpha),
    interlaced: Boolean(info.hasVideo && info.interlaced),
  };
  return stream;
}

// Produsentens verktøy gjør filen om til ProRes (decoders.js), og den importeres som vanlig video.
// Mangler verktøyet, havner filen i missing, så brukeren får lenke og kan peke på verktøyet.
async function viaDecoder(id, file, notify, out) {
  if (!decoders.findTool(id)) return void out.missing.push({ tool: id, file });
  try {
    const { done } = jobs.add({ kind: 'decode', title: `Converting ${path.basename(file)} to ProRes`, queue: 'optimize', run: (ctx) => decoders.decode(id, file, [path.dirname(file), path.join(cacheRoot(), 'decoded')], ctx, ff.getFfmpegPath()) });
    const r = await importFiles([await done], notify);
    out.items.push(...r.items);
    out.failed.push(...r.failed);
  } catch (err) {
    console.error('Decoding failed', file, err);
    out.failed.push(path.basename(file));
  }
}

// Leser inn filer og returnerer mediaposter med en gang. Analysen fortsetter i bakgrunnen.
// Returnerer { items, failed, missing }. Filer som ikke kan leses avvises med en gang.
// missing: [{ tool, file }] for filer som trenger en dekoder som ikke er installert.
async function importFiles(files, notify) {
  const result = [];
  const failed = [];
  const missing = [];
  const out = { items: result, failed, missing };
  const recordings = new Set();
  for (const file of files) {
    let kind = kindOf(file);
    // Skjerm og kamera fra samme opptak blir ett opptak, også når bare den ene filen er valgt.
    const recording = kind === 'image' ? null : await findRecording(file);
    if (recording) {
      if (recordings.has(recording.id)) continue;
      recordings.add(recording.id);
      const media = await recordingMedia(recording.target, notify).catch((err) => (console.error('Recording import failed', file, err), null));
      if (media) result.push(media);
      else failed.push(path.basename(file));
      continue;
    }
    // Kamera-RAW-video (BRAW, R3D, N-RAW, ARRIRAW): FFmpeg kan ikke dekode det, så produsentens verktøy brukes.
    const rawTool = decoders.toolFor(file, false);
    if (rawTool) {
      await viaDecoder(rawTool, file, notify, out);
      continue;
    }
    if (raw.RAW_EXT.has(path.extname(file).toLowerCase())) {
      const media = await importRaw(file, notify).catch((err) => (console.error('RAW import failed', file, err), null));
      if (media) result.push(media);
      else failed.push(path.basename(file));
      continue;
    }
    try {
      let info = await ff.probe(file);
      // MPEG-TS (AVCHD og lignende) som FFmpeg ikke klarer å åpne: les strømmene selv og lag en arbeidskopi.
      if (!info.hasVideo && !info.hasAudio && kind !== 'image') {
        const fb = await tsFallback(file).catch((err) => (console.error('TS fallback failed', file, err), null));
        if (fb) {
          info = fb.info;
          const stream = await streamFromFile(file, fb.info.hasVideo ? 'video' : 'audio', info);
          Object.assign(stream, { proxy: fb.proxy, needsProxy: false, tsFallback: true });
          result.push(await makeMedia(file, fb.info.hasVideo ? 'video' : 'audio', { main: stream }, notify));
          continue;
        }
      }
      // Animert WebP som FFmpeg ikke kan dekode blir video via arbeidsvinduet (se animatedFallback).
      if (kind === 'image' && !(info.width > 0)) {
        const anim = await animatedFallback(file).catch((err) => (console.error('Animated WebP failed', file, err), null));
        if (anim) {
          const stream = await streamFromFile(file, 'video', anim.info);
          // tsFallback: originalen kan ikke dekodes, så arbeidskopien er kilden overalt.
          Object.assign(stream, { proxy: anim.proxy, needsProxy: false, tsFallback: true });
          result.push(await makeMedia(file, 'video', { main: stream }, notify));
          continue;
        }
      }
      // Bilder FFmpeg ikke kan lese (HEIC, JPEG XL): på Mac gjør sips dem om til PNG.
      const converted = kind === 'image' && !(info.width > 0) ? await sipsToPng(file).catch(() => null) : null;
      if (converted) info = await ff.probe(converted);
      const readable = (info.hasVideo && info.videoCodec !== 'none') || info.hasAudio || (kind === 'image' && info.width > 0);
      // FFmpeg kjenner beholderen men ikke bildet (ProRes RAW, ARRIRAW i MXF): prøv et verktøy som kan.
      const tool = kind !== 'image' && (!readable || info.videoCodec === 'none') ? decoders.toolFor(file, true) : null;
      if (tool) {
        await viaDecoder(tool, file, notify, out);
        continue;
      }
      if (!readable) {
        failed.push(path.basename(file));
        continue;
      }
      if (kind === 'unknown') kind = kindFromProbe(info);
      if (!kind) {
        failed.push(path.basename(file));
        continue;
      }
      // Rå videostrømmer (.h264, .hevc, .m2v) og noen opptak oppgir ikke lengden: les den fra pakkene.
      if ((kind === 'video' || kind === 'audio') && !(info.duration > 0)) info.duration = await ff.scanDuration(file, info.fps);
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
        if (converted) stream.proxy = converted;
        else if (!NATIVE_IMAGE.has(ext)) {
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
  return { items: result, failed, missing };
}

// Filene som må følge med når disse kopieres inn: hele opptaket, ikke bare den valgte filen.
async function recordingPaths(files) {
  const out = new Set();
  for (const file of files) {
    const recording = kindOf(file) === 'image' ? null : await findRecording(file);
    for (const p of recording?.paths || [file]) out.add(p);
  }
  return [...out];
}

async function animatedFallback(file) {
  const head = Buffer.alloc(21);
  const fd = await fs.promises.open(file, 'r');
  await fd.read(head, 0, head.length, 0);
  await fd.close();
  // VP8X-hode med animasjonsflagget satt.
  if (head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 16) !== 'WEBPVP8X' || !(head[20] & 0x02)) return null;
  const proxy = path.join(await cacheDirFor(file), 'arbeidskopi-animert.webm');
  if (!fs.existsSync(proxy)) {
    const part = `${proxy}.part.webm`;
    await jobs.runInWorker('export', { task: 'animated', file, output: part, type: 'image/webp', ffmpeg: ff.getFfmpegPath() });
    await fs.promises.rename(part, proxy);
  }
  return { proxy, info: await ff.probe(proxy) };
}

// ponytail: bare macOS. Windows og Linux trenger en nyere FFmpeg (HEIC, JPEG XL) for å lese disse.
async function sipsToPng(file) {
  if (process.platform !== 'darwin') return null;
  const png = path.join(await cacheDirFor(file), 'bilde.png');
  if (!fs.existsSync(png)) await new Promise((ok, fail) => execFile('sips', ['-s', 'format', 'png', file, '--out', png], (err) => (err ? fail(err) : ok())));
  return png;
}

// RAW-bilde: kameraets innebygde JPEG hentes ut og rettes opp etter orienteringen i filen.
// DNG uten forhåndsvisning prøves med FFmpeg.
// Skriver RAW-filens innebygde forhåndsvisning, rotert riktig, til out. False hvis den mangler.
async function rawPreview(file, out) {
  const tmp = `${out}.part.jpg`;
  const prev = await raw.extractPreview(file, tmp);
  if (prev) {
    const rotate = { 3: 'transpose=1,transpose=1', 6: 'transpose=1', 8: 'transpose=2' }[prev.orientation];
    if (rotate) {
      await ff.run(['-i', tmp, '-vf', rotate, '-q:v', '2', out]).promise;
      await fs.promises.unlink(tmp).catch(() => {});
    } else await fs.promises.rename(tmp, out);
  } else if (path.extname(file).toLowerCase() === '.dng') {
    await ff.run(['-i', file, '-frames:v', '1', '-q:v', '2', out]).promise;
  } else return false;
  return true;
}

// Et bilde Chromium kan vise: originalen, eller en konvertert kopi i hurtigbufferen (HEIC, TIFF, RAW og lignende).
async function readableImage(file) {
  const ext = path.extname(file).toLowerCase();
  if (NATIVE_IMAGE.has(ext)) return file;
  const isRaw = raw.RAW_EXT.has(ext);
  if (!isRaw && !IMAGE_EXT.has(ext) && ext !== '.psb') throw new Error('This file type is not a supported image.');
  const out = path.join(await cacheDirFor(file), `${path.basename(file, ext)}.${isRaw ? 'jpg' : 'png'}`);
  if (fs.existsSync(out)) return out;
  if (isRaw) {
    if (!(await rawPreview(file, out))) throw new Error('This RAW photo has no preview that can be read.');
  } else {
    const tmp = `${out}.part.png`;
    await ff.convertImage(file, tmp);
    await fs.promises.rename(tmp, out);
  }
  return out;
}

const imageExtensions = () => [...IMAGE_EXT, ...raw.RAW_EXT, '.psb'].map((e) => e.slice(1));

async function importRaw(file, notify) {
  const dir = await cacheDirFor(file);
  const out = path.join(dir, 'raw.jpg');
  let width;
  let height;
  if (!fs.existsSync(out) && !(await rawPreview(file, out))) return null;
  const info = await ff.probe(out);
  width = info.width;
  height = info.height;
  if (!width) return null;
  const stream = { path: file, proxy: out, offset: 0, duration: 0, hasVideo: true, hasAudio: false, width, height, fps: 0, needsProxy: false };
  return makeMedia(file, 'image', { main: stream }, notify, { raw: true });
}

// Reserve for TS-filer: strømmene hentes ut med tsdemux og settes sammen til en MP4 i bufferen.
async function tsFallback(file) {
  const head = Buffer.alloc(2048);
  const fd = await fs.promises.open(file, 'r');
  await fd.read(head, 0, head.length, 0);
  await fd.close();
  if (!tsdemux.packetLayout(head)) return null;
  const dir = await cacheDirFor(file);
  const proxy = path.join(dir, 'arbeidskopi-ts.mp4');
  if (!fs.existsSync(proxy)) {
    const es = await tsdemux.demux(file, path.join(dir, 'ts-stream'));
    if (!es) return null;
    const args = [];
    if (es.video) args.push('-framerate', String(es.video.fps || 25), '-i', es.video.file);
    if (es.audio) args.push('-i', es.audio.file);
    if (es.video) args.push('-map', '0:v:0', '-vf', "bwdif=mode=send_frame:deint=interlaced,scale='trunc(iw*sar/2)*2':'trunc(ih/2)*2',setsar=1,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-g', '15', '-bf', '0');
    if (es.audio) args.push('-map', `${es.video ? 1 : 0}:a:0`, '-c:a', 'aac', '-b:a', '256k', '-ac', '2', '-ar', '48000');
    args.push('-movflags', '+faststart', proxy + '.tmp.mp4');
    await ff.run(args).promise;
    await fs.promises.rename(proxy + '.tmp.mp4', proxy);
    for (const f of [es.video?.file, es.audio?.file]) if (f) await fs.promises.unlink(f).catch(() => {});
  }
  const info = await ff.probe(proxy);
  if (!info.hasVideo && !info.hasAudio) return null;
  return { info, proxy };
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
      mediaId: media.id,
      title: `Analyzing ${media.name}${Object.keys(media.streams).length > 1 ? ` (${key})` : ''}`,
      queue: 'light',
      run: async (ctx) => {
        const dir = await cacheDirFor(stream.path);
        const patch = {};
        // Filer FFmpeg ikke kan åpne direkte (TS-reserven) analyseres fra arbeidskopien.
        let source = stream.tsFallback && stream.proxy ? stream.proxy : stream.path;

        if (stream.needsProxy && !stream.optimized) {
          const old = path.join(dir, 'optimalisert.mp4');
          const proxy = !stream.color?.hdr && !stream.alpha && stream.hasVideo && fs.existsSync(old) ? old : path.join(dir, `arbeidskopi${ff.transcodeExt(stream.color, stream.alpha, stream.hasVideo)}`);
          if (!fs.existsSync(proxy)) {
            ctx.progress(0, stream.color?.hdr ? 'Tone mapping HDR' : 'Creating a playable copy');
            const tmp = proxy + `.tmp${path.extname(proxy)}`;
            // Kopien er en proxy på høyst 1920 piksler: eksporten leser originalen (se decodeFilters i main.js).
            // ponytail: fast størrelse, gjør den valgbar hvis noen trenger full oppløsning uten Optimize Media.
            await ff.transcodeRobust(stream.path, tmp, { color: stream.color, alpha: stream.alpha, interlaced: stream.interlaced, hasVideo: stream.hasVideo, duration: stream.duration, quality: 'proxy', maxSide: 1920 }, (p) => ctx.progress(p * 0.7), ctx.setCancel);
            await fs.promises.rename(tmp, proxy);
          }
          patch.proxy = proxy;
          source = proxy;
        } else if (stream.optimized && fs.existsSync(stream.optimized)) source = stream.optimized;

        if (stream.hasVideo && media.kind !== 'image') {
          const thumbDir = path.join(dir, 'thumbs');
          let thumbs;
          const metaFile = path.join(thumbDir, 'meta.json');
          if (fs.existsSync(metaFile)) {
            thumbs = JSON.parse(await fs.promises.readFile(metaFile, 'utf8'));
            // Bufferen kan ha blitt flyttet (for eksempel fra OBSlite til Reccut): bruk mappen den ligger i nå.
            thumbs.files = thumbs.files.map((f) => path.join(thumbDir, path.basename(f)));
          }
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

// Gjør om et ferdig opptak til en mediapost. target: opptaksmappen, eller en fil med opptaksdata.
async function recordingMedia(target, notify) {
  const { rec, name, files, loose } = await loadRecording(target);
  const streams = {};
  for (const key of ['screen', 'camera']) {
    const s = rec[key];
    const file = files[key];
    if (!file) continue;
    const info = await ff.probe(file);
    streams[key] = {
      path: file,
      offset: s?.offset || 0,
      duration: info.duration,
      hasVideo: info.hasVideo,
      hasAudio: info.hasAudio,
      width: info.width,
      height: info.height,
      fps: info.fps,
      color: info.hasVideo ? info.color : undefined,
      needsProxy: needsOptimizing(file, info),
    };
  }
  const duration = Math.max(...Object.values(streams).map((s) => s.offset + s.duration), 0.1);
  const base = streams.screen || streams.camera;
  return makeMedia(target, 'recording', streams, notify, {
    name,
    ...(loose ? { loose } : {}),
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
  // Fra originalen, ikke proxyen, så baklengs klipp får full oppløsning i eksporten.
  const source = stream.optimized || (stream.tsFallback && stream.proxy) || stream.path;
  const vf = [...(stream.needsProxy && !stream.optimized ? ff.videoFilters(stream) : []), 'reverse'].join(',');
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
      if (stream.hasVideo) args.push('-map', '0:v:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-g', '15');
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
    mediaId: media.id,
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
    mediaId: media.id,
    title: `Optimizing ${media.name}`,
    queue: 'optimize',
    run: async (ctx) => {
      await fs.promises.mkdir(outDir, { recursive: true });
      for (const [i, key] of keys.entries()) {
        const st = media.streams[key];
        const stem = path.basename(media.kind === 'recording' ? `${media.name} ${key}` : media.name, path.extname(media.name));
        const ext = ff.transcodeExt(st.color, st.alpha);
        let out = path.join(outDir, `${stem}${ext}`);
        let n = 2;
        while (fs.existsSync(out)) out = path.join(outDir, `${stem} ${n++}${ext}`);
        const tmp = out + `.part${ext}`;
        try {
          await ff.transcodeRobust(st.tsFallback && st.proxy ? st.proxy : st.path, tmp, { color: st.color, alpha: st.alpha, interlaced: st.interlaced, duration: st.duration, quality: 'optimized' }, (p) => ctx.progress((i + Math.min(1, p)) / keys.length, st.color?.hdr ? 'Tone mapping HDR' : 'Transcoding'), ctx.setCancel);
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

// Bevegelsesanalyse for stabilisering. Resultatet lagres i bufferen og gjenbrukes.
const motionJobs = new Map();
function scheduleMotion(media, notify) {
  const st = media.streams.main;
  if (!st?.hasVideo) return null;
  if (motionJobs.has(media.id)) return motionJobs.get(media.id);
  const job = jobs.add({
    kind: 'analyze',
    mediaId: media.id,
    title: `Analyzing motion in ${media.name}`,
    queue: 'light',
    run: async (ctx) => {
      const dir = await cacheDirFor(st.path);
      const out = path.join(dir, 'motion.json');
      if (!fs.existsSync(out)) {
        ctx.progress(0, 'Analyzing camera motion');
        const source = [st.optimized, st.proxy, st.path].find((p) => p && fs.existsSync(p));
        const data = await motion.analyze(ff.getFfmpegPath(), source, { fps: st.fps || media.fps, duration: st.duration || media.duration, onProgress: (p) => ctx.progress(p, 'Analyzing camera motion'), isCanceled: ctx.isCanceled });
        await fs.promises.writeFile(out, JSON.stringify(data));
      }
      notify({ mediaId: media.id, stream: 'main', patch: { motion: out } });
      return out;
    },
  });
  motionJobs.set(media.id, job);
  job.done.finally(() => motionJobs.delete(media.id)).catch(() => {});
  return job;
}

/* Filbrowseren i importvinduet */

// Mapper og mediefiler i én mappe. Skjulte filer og filer appen ikke kan lese, vises ikke.
async function browseDir(dir) {
  const out = [];
  for (const e of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    let st;
    try {
      st = await fs.promises.stat(full);
    } catch {
      continue;
    }
    const kind = st.isDirectory() ? 'folder' : kindOf(full);
    if (kind !== 'unknown') out.push({ name: e.name, path: full, kind, size: st.size, modified: st.mtimeMs });
  }
  out.sort((a, b) => (b.kind === 'folder') - (a.kind === 'folder') || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const parent = path.dirname(dir);
  return { dir, parent: parent !== dir ? parent : null, entries: out };
}

// Ett miniatyrbilde og varighet per fil, lagret i hurtigbufferen. Høyst tre FFmpeg om gangen.
// ponytail: enkel kø uten avbrudd; ventende bilder fra en mappe man har forlatt lages likevel.
let thumbsRunning = 0;
const thumbsWaiting = [];
async function browseThumb(file) {
  const dir = await cacheDirFor(file);
  const json = path.join(dir, 'browse.json');
  try {
    return JSON.parse(await fs.promises.readFile(json, 'utf8'));
  } catch {}
  if (thumbsRunning >= 3) await new Promise((r) => thumbsWaiting.push(r));
  thumbsRunning++;
  try {
    const info = await ff.probe(file);
    const result = { duration: info.duration, width: info.width, height: info.height, hasAudio: info.hasAudio, thumb: null };
    if (info.hasVideo) {
      const out = path.join(dir, 'browse.jpg');
      const still = kindOf(file) === 'image' || info.duration < 0.2;
      await ff.run([...(still ? [] : ['-ss', String(Math.min(1, info.duration * 0.1))]), '-i', file, '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '5', out]).promise.catch(() => {});
      if (fs.existsSync(out)) result.thumb = out;
    }
    await fs.promises.writeFile(json, JSON.stringify(result));
    return result;
  } finally {
    thumbsRunning--;
    thumbsWaiting.shift()?.();
  }
}

// Favorittene brukeren har festet i sidepanelet i Finder, Utforsker (Hurtigtilgang) eller filbehandleren på Linux,
// i samme rekkefølge. Tom liste hvis de ikke kan leses; da brukes de vanlige mappene.
const FINDER_FAVORITES = `ObjC.import('CoreServices');
const list = $.LSSharedFileListCreate($.kCFAllocatorDefault, $.kLSSharedFileListFavoriteItems, null);
const items = ObjC.castRefToObject($.LSSharedFileListCopySnapshot(list, Ref()));
const out = [];
for (let i = 0; i < items.count; i++) {
  const item = items.objectAtIndex(i);
  const url = ObjC.castRefToObject($.LSSharedFileListItemCopyResolvedURL(item, 0, null));
  const name = ObjC.castRefToObject($.LSSharedFileListItemCopyDisplayName(item));
  if (url && !url.isNil() && url.isFileURL) out.push({ label: name.js, path: url.path.js });
}
JSON.stringify(out);`;

// Windows 11 merker festede mapper i Hurtigtilgang. Windows 10 gjør ikke det, og da tas alle mappene der med.
const QUICK_ACCESS = `$items = @((New-Object -ComObject Shell.Application).Namespace('shell:::{679f85cb-0220-4080-b29b-5540cc05aab6}').Items() | Where-Object { $_.IsFolder })
$pinned = @($items | Where-Object { $_.ExtendedProperty('System.Home.IsPinned') })
if ($pinned.Count) { $items = $pinned }
ConvertTo-Json -Compress @($items | ForEach-Object { @{ label = $_.Name; path = $_.Path } })`;

function run(cmd, args) {
  return new Promise((ok) => execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, out) => ok(err ? '' : String(out))));
}

async function systemFavorites() {
  try {
    if (process.platform === 'darwin') return JSON.parse((await run('osascript', ['-l', 'JavaScript', '-e', FINDER_FAVORITES])) || '[]');
    if (process.platform === 'win32') return [].concat(JSON.parse((await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', QUICK_ACCESS])) || '[]'));
    // GTK (GNOME, Xfce, Cinnamon og flere): én linje per bokmerke, "file:///sti Valgfritt navn".
    const home = app.getPath('home');
    const out = [];
    try {
      for (const line of fs.readFileSync(path.join(home, '.config/gtk-3.0/bookmarks'), 'utf8').split('\n')) {
        const [uri, ...name] = line.trim().split(' ');
        if (!uri?.startsWith('file://')) continue;
        const p = decodeURIComponent(new URL(uri).pathname);
        out.push({ label: name.join(' ') || path.basename(p), path: p });
      }
    } catch {}
    // KDE (Dolphin) lagrer stedene som XBEL.
    try {
      const xml = fs.readFileSync(path.join(home, '.local/share/user-places.xbel'), 'utf8');
      for (const m of xml.matchAll(/<bookmark href="(file:\/\/[^"]+)"[^>]*>\s*<title>([^<]*)<\/title>/g)) {
        const p = decodeURIComponent(new URL(m[1]).pathname);
        out.push({ label: m[2] || path.basename(p), path: p });
      }
    } catch {}
    return out;
  } catch {
    return [];
  }
}

// Stedene i venstre kolonne: brukerens egne favoritter (eller de vanlige mappene) og tilkoblede disker og minnekort.
async function browsePlaces() {
  const isDir = (p) => {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  const seen = new Set();
  let places = (await systemFavorites()).filter((p) => p?.path && !seen.has(p.path) && seen.add(p.path) && isDir(p.path));
  if (!places.length) {
    places = [{ label: 'Home', path: app.getPath('home') }];
    for (const [label, key] of [['Desktop', 'desktop'], ['Documents', 'documents'], ['Downloads', 'downloads'], ['Movies', 'videos'], ['Music', 'music'], ['Pictures', 'pictures']]) {
      try {
        places.push({ label, path: app.getPath(key) });
      } catch {}
    }
    places = places.filter((p) => isDir(p.path));
  }
  const volumes = [];
  if (process.platform === 'darwin') {
    try {
      for (const name of fs.readdirSync('/Volumes')) if (!name.startsWith('.')) volumes.push({ label: name, path: path.join('/Volumes', name) });
    } catch {}
  } else if (process.platform === 'win32') {
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (fs.existsSync(`${l}:\\`)) volumes.push({ label: `${l}:`, path: `${l}:\\` });
  } else {
    volumes.push({ label: 'Computer', path: '/' });
  }
  const movies = app.getPath('videos');
  return { places, volumes, home: app.getPath('home'), start: isDir(movies) ? movies : app.getPath('home') };
}

// Alle filendelser appen kjenner, for importdialogen.
function extensions() {
  return [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT, ...raw.RAW_EXT, '.psb', '.reccut-title'].map((e) => e.slice(1));
}

module.exports = { browseDir, browseThumb, browsePlaces, scheduleMotion, isOffline, relink, scheduleOptimize, reverseStream, scheduleReverse, extensions, imageExtensions, readableImage, importFiles, recordingMedia, recordingPaths, kindOf, cacheRoot, newId };
