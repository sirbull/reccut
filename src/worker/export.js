// Eksport i et skjult vindu. Hvert bilde tegnes med samme kode som forhåndsvisningen,
// kodes med WebCodecs (maskinvare) eller FFmpeg, og lyden mikses med nøkkelbilder.
import { setMotion } from '../shared/stabilize.js';
import { ALL_FORMATS, CanvasSource, CustomSource, Input, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, VideoSampleSink, WebMOutputFormat, canEncodeVideo } from 'mediabunny';
import { CAPTION_LANE, audioComponents, clipHasAudio, computeAudio, computeFrame, sealProject, sourceTime, workPath } from '../shared/model.js';
import { drawFrame, preloadAssets } from '../shared/render.js';
import { AUDIO_FORMATS, QUALITIES, VIDEO_FORMATS, audioKbps, outputGeometry, videoBitrate } from '../shared/formats.js';
import { toSrt, toVtt } from '../shared/srt.js';
import { activeEffects, createChain } from '../shared/audiofx.js';

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RATE = 48000;
const canceled = new Set();

ipcRenderer.on('worker:job', async (_e, { jobId, payload }) => {
  try {
    const result = await runExport(jobId, payload);
    ipcRenderer.send('worker:done', { jobId, result });
  } catch (err) {
    console.error(err);
    ipcRenderer.send('worker:error', { jobId, error: canceled.has(jobId) ? 'Canceled' : String(err?.message || err) });
  } finally {
    canceled.delete(jobId);
  }
});
ipcRenderer.on('worker:cancel', (_e, jobId) => canceled.add(jobId));

function checkCancel(jobId) {
  if (canceled.has(jobId)) throw new Error('Canceled');
}

function progress(jobId, p, stage) {
  ipcRenderer.send('worker:progress', { jobId, progress: p, stage });
}

/* FFmpeg */

function ffmpeg(bin, args, { stdin = false, onTime } = {}) {
  const proc = spawn(bin, ['-hide_banner', '-nostdin', '-y', ...args].filter((a) => a !== '-nostdin' || !stdin), {
    stdio: [stdin ? 'pipe' : 'ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let err = '';
  proc.stderr.on('data', (d) => {
    const s = d.toString();
    err = (err + s).slice(-8000);
    const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    if (m && onTime) onTime(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
  });
  const done = new Promise((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`FFmpeg feilet (${code}): ${err.split('\n').slice(-4).join(' ')}`))));
  });
  return { proc, done };
}

function writeAsync(stream, buf) {
  return new Promise((resolve, reject) => {
    const ok = stream.write(buf, (e) => e && reject(e));
    if (ok) resolve();
    else stream.once('drain', resolve);
  });
}

/* Lydmiks */

function streamInfo(project, clip, key) {
  const m = project.media[clip.mediaId];
  const s = m?.streams?.[key];
  return s ? { path: workPath(s), offset: s.offset || 0 } : null;
}

// Tempo-filter for endret fart. atempo støtter 0.5 til 100, så små verdier lenkes.
function tempoFilter(speed, preservePitch) {
  if (Math.abs(speed - 1) < 1e-6) return null;
  if (preservePitch === false) return `asetrate=${Math.round(RATE * speed)},aresample=${RATE}`;
  const parts = [];
  let s = speed;
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  parts.push(`atempo=${s.toFixed(6)}`);
  return parts.join(',');
}

// Kjører effektkjeden over en rå stereofil (f32, sammenflettet) i biter på ett sekund.
// Forsinkelsen i kjeden (støyfjerningen) trekkes fra, så lyden står på samme sted som før.
function applyEffectsToFile(file, afx, check) {
  const chain = createChain(RATE);
  chain.update(afx);
  if (chain.empty) return;
  const lat = chain.latency;
  const total = Math.floor(fs.statSync(file).size / 8);
  const inFd = fs.openSync(file, 'r');
  const outFile = `${file}.fx`;
  const outFd = fs.openSync(outFile, 'w');
  const CH = RATE;
  const inBuf = Buffer.alloc(CH * 8);
  const L = new Float32Array(CH);
  const R = new Float32Array(CH);
  const out = new Float32Array(CH * 2);
  let read = 0;
  let skipped = 0;
  while (read < total + lat) {
    check();
    const n = Math.min(CH, total + lat - read);
    const avail = Math.max(0, Math.min(n, total - read));
    if (avail) fs.readSync(inFd, inBuf, 0, avail * 8, read * 8);
    const f = new Float32Array(inBuf.buffer, inBuf.byteOffset, CH * 2);
    for (let i = 0; i < n; i++) {
      L[i] = i < avail ? f[i * 2] : 0;
      R[i] = i < avail ? f[i * 2 + 1] : 0;
    }
    chain.process(L, R, n);
    let start = 0;
    if (skipped < lat) {
      start = Math.min(lat - skipped, n);
      skipped += start;
    }
    let k = 0;
    for (let i = start; i < n; i++) {
      out[k++] = L[i];
      out[k++] = R[i];
    }
    if (k) fs.writeSync(outFd, Buffer.from(out.buffer, 0, k * 4));
    read += n;
  }
  fs.closeSync(inFd);
  fs.closeSync(outFd);
  fs.renameSync(outFile, file);
}

// Dekoder hver lydkilde til en rå fil, og mikser så blokk for blokk med riktig volum.
async function mixAudio(jobId, ctx, a, b, wavPath, onProgress) {
  const { project, ffmpegBin, tmp } = ctx;
  const PAD = 4;
  const pairs = new Map();
  for (const c of Object.values(project.clips)) {
    if (c.lane === CAPTION_LANE || !c.mediaId) continue;
    const m = project.media[c.mediaId];
    if (!m || m.offline || !clipHasAudio(c, m)) continue;
    if (c.start > b + PAD || c.start + c.dur < a - PAD) continue;
    // Lydkomponentene som er på (kameralyd, synket lyd, mikrofon og systemlyd).
    const keys = audioComponents(c, m).filter((x) => !x.off).map((x) => x.key);
    const speed = c.speed ?? 1;
    // Fartsramper og baklengs: lyden leses fra kildeposisjonen for hver prøve (generell vei).
    const generic = Boolean(c.ramp || c.reverse);
    // Lydvinduet kan være forlenget (utvidet lyd), og overganger bruker litt ekstra på hver side.
    const t0 = Math.max(a, c.start - Math.max(0, c.props.aLead || 0)) - PAD;
    const t1 = Math.min(b, c.start + c.dur + Math.max(0, c.props.aTail || 0)) + PAD;
    const s0 = sourceTime(c, t0);
    const s1 = sourceTime(c, t1);
    for (const key of keys) {
      const info = streamInfo(project, c, key);
      if (!info || !fs.existsSync(info.path)) continue;
      const from = Math.max(0, Math.min(s0, s1) - info.offset);
      const to = Math.max(s0, s1) - info.offset;
      if (to <= from) continue;
      pairs.set(`${c.id}:${key}`, { path: info.path, from, to, speed: generic ? 1 : speed, generic, tempo: generic ? null : tempoFilter(speed, c.props.preservePitch), afx: activeEffects(c), file: path.join(tmp, `a_${pairs.size}.f32`) });
    }
  }

  let i = 0;
  for (const pair of pairs.values()) {
    checkCancel(jobId);
    const args = ['-ss', String(pair.from), '-t', String(pair.to - pair.from), '-i', pair.path, '-map', '0:a:0', '-ac', '2', '-ar', String(RATE)];
    if (pair.tempo) args.push('-af', `aresample=${RATE},${pair.tempo}`);
    args.push('-f', 'f32le', pair.file);
    const job = ffmpeg(ffmpegBin, args);
    await job.done.catch(() => fs.writeFileSync(pair.file, Buffer.alloc(0)));
    // Lydeffektene på klippet, med samme kode som i avspillingen.
    if (pair.afx.length) applyEffectsToFile(pair.file, pair.afx, () => checkCancel(jobId));
    pair.fd = fs.openSync(pair.file, 'r');
    pair.frames = fs.statSync(pair.file).size / 8;
    pair.cache = null;
    onProgress((++i / Math.max(1, pairs.size)) * 0.5);
  }

  const total = Math.max(1, Math.round((b - a) * RATE));
  const BLOCK = 480;
  const out = fs.openSync(wavPath, 'w');
  const header = Buffer.alloc(44);
  const dataBytes = total * 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 8, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);
  fs.writeSync(out, header);

  const chunkFrames = RATE;
  const outBuf = new Float32Array(chunkFrames * 2);
  const readFrames = (pair, startFrame, n) => {
    // Leser i biter på ett sekund for færre diskoperasjoner.
    if (!pair.cache || startFrame < pair.cache.start || startFrame + n > pair.cache.start + pair.cache.len) {
      const len = Math.max(n, RATE * 2);
      const buf = Buffer.alloc(len * 8);
      const bytes = startFrame >= 0 && startFrame < pair.frames ? fs.readSync(pair.fd, buf, 0, buf.length, startFrame * 8) : 0;
      pair.cache = { start: startFrame, len, data: new Float32Array(buf.buffer, buf.byteOffset, len * 2), valid: Math.floor(bytes / 8) };
    }
    return pair.cache;
  };

  let written = 0;
  while (written < total) {
    checkCancel(jobId);
    const n = Math.min(chunkFrames, total - written);
    outBuf.fill(0);
    for (let f = 0; f < n; f += BLOCK) {
      const len = Math.min(BLOCK, n - f);
      const T0 = a + (written + f) / RATE;
      const T1 = T0 + len / RATE;
      const now = computeAudio(project, T0);
      const next = new Map(computeAudio(project, T1).map((x) => [`${x.clip.id}:${x.stream}`, x]));
      for (const src of now) {
        const key = `${src.clip.id}:${src.stream}`;
        const pair = pairs.get(key);
        if (!pair) continue;
        const g0 = src.gain;
        const g1 = next.has(key) ? next.get(key).gain : g0;
        if (pair.generic) {
          // Kildeposisjonen går jevnt gjennom blokken, også baklengs og med varierende fart.
          const p0 = src.src;
          const p1 = next.has(key) ? next.get(key).src : p0 + (src.speed * len) / RATE;
          const lo = Math.floor((Math.min(p0, p1) - pair.from) * RATE) - 2;
          const hi = Math.ceil((Math.max(p0, p1) - pair.from) * RATE) + 2;
          const cache = readFrames(pair, lo, hi - lo + 1);
          for (let k = 0; k < len; k++) {
            const pos = ((p0 + ((p1 - p0) * k) / len) - pair.from) * RATE - cache.start;
            const i0 = Math.floor(pos);
            const fr = pos - i0;
            if (i0 < 0 || i0 + 1 >= cache.valid) continue;
            const g = g0 + ((g1 - g0) * k) / len;
            outBuf[(f + k) * 2] += (cache.data[i0 * 2] * (1 - fr) + cache.data[(i0 + 1) * 2] * fr) * g;
            outBuf[(f + k) * 2 + 1] += (cache.data[i0 * 2 + 1] * (1 - fr) + cache.data[(i0 + 1) * 2 + 1] * fr) * g;
          }
          continue;
        }
        const startFrame = Math.round(((src.src - pair.from) / (pair.speed || 1)) * RATE);
        const cache = readFrames(pair, startFrame, len);
        const off = startFrame - cache.start;
        for (let k = 0; k < len; k++) {
          const idx = off + k;
          if (idx < 0 || idx >= cache.valid) continue;
          const g = g0 + ((g1 - g0) * k) / len;
          outBuf[(f + k) * 2] += cache.data[idx * 2] * g;
          outBuf[(f + k) * 2 + 1] += cache.data[idx * 2 + 1] * g;
        }
      }
    }
    for (let k = 0; k < n * 2; k++) outBuf[k] = outBuf[k] > 1 ? 1 : outBuf[k] < -1 ? -1 : outBuf[k];
    fs.writeSync(out, Buffer.from(outBuf.buffer, 0, n * 8));
    written += n;
    onProgress(0.5 + (written / total) * 0.5);
    if ((written / RATE) % 30 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  fs.closeSync(out);
  for (const pair of pairs.values()) {
    fs.closeSync(pair.fd);
    fs.rmSync(pair.file, { force: true });
  }
}

/* Dekoding av bilder */

class Reader {
  constructor(file) {
    this.file = file;
    this.fd = fs.openSync(file, 'r');
    this.size = fs.fstatSync(this.fd).size;
    this.input = new Input({
      formats: ALL_FORMATS,
      source: new CustomSource({
        getSize: () => this.size,
        read: (start, end) => {
          const buf = Buffer.alloc(end - start);
          fs.readSync(this.fd, buf, 0, buf.length, start);
          return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
        },
      }),
    });
    this.cur = null;
    this.next = null;
    this.iter = null;
    this.ready = this.init();
  }

  async init() {
    const track = await this.input.getPrimaryVideoTrack();
    if (!track) throw new Error(`No video in ${path.basename(this.file)}`);
    this.first = await track.getFirstTimestamp();
    this.end = await track.computeDuration();
    this.sink = new VideoSampleSink(track);
  }

  restart(t) {
    this.iter?.return?.();
    this.cur?.close();
    if (this.next && this.next !== 'end') this.next.close();
    this.cur = null;
    this.next = null;
    this.iter = this.sink.samples(t);
  }

  // Bildene leses i rekkefølge. Hopp bakover eller langt fremover starter dekodingen på nytt.
  async frameAt(t) {
    await this.ready;
    const tt = Math.max(this.first, Math.min(t, this.end - 1e-4));
    if (!this.iter || (this.cur && tt < this.cur.timestamp - 1e-6) || (this.cur && tt > this.cur.timestamp + 2)) this.restart(tt);
    while (true) {
      if (!this.next) {
        const r = await this.iter.next();
        this.next = r.done ? 'end' : r.value;
      }
      if (this.next === 'end') break;
      if (this.cur && this.next.timestamp > tt + 1e-6) break;
      this.cur?.close();
      this.cur = this.next;
      this.next = null;
    }
    return this.cur;
  }

  close() {
    this.iter?.return?.();
    this.cur?.close();
    if (this.next && this.next !== 'end') this.next.close();
    try {
      this.input.dispose?.();
    } catch {}
    fs.closeSync(this.fd);
  }
}

function neededFrames(project, frame) {
  const out = [];
  const add = (clip, T) => {
    const m = project.media[clip.mediaId];
    if (!m || m.offline) return;
    const s = sourceTime(clip, T);
    for (const [key, st] of Object.entries(m.streams)) {
      if (!st.hasVideo) continue;
      const t = s - (st.offset || 0);
      // Baklengs: les den baklengs kopien framover, så dekodingen går raskt.
      if (clip.reverse && st.reversed) {
        out.push({ clip, key, path: st.reversed, image: false, t: st.duration - t, rev: true });
        continue;
      }
      out.push({ clip, key, path: m.kind === 'image' ? st.proxy || m.path : workPath(st), image: m.kind === 'image', t });
    }
  };
  for (const l of frame.layers) {
    if (l.transition) {
      if (l.a) add(l.a.clip, l.a.T);
      if (l.b) add(l.b.clip, l.b.T);
    } else add(l.clip, l.T);
  }
  return out;
}

async function renderVideo(jobId, ctx, { a, b, w, h, matrix, fps, fmt, quality, bitrate, akbps, burnCaptions, embedPath, useWebCodecs, wavPath, output, hasAudio }) {
  const { project, ffmpegBin, tmp } = ctx;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { alpha: false, willReadFrequently: !useWebCodecs });
  const frames = Math.max(1, Math.round((b - a) * fps));
  const readers = new Map();
  const images = new Map();
  const rotated = new Map();
  const q = { ...(QUALITIES.find((x) => x.id === quality) || QUALITIES[2]), audioKbps: akbps, bitrate };

  let encoder;
  if (useWebCodecs) {
    const videoTmp = path.join(tmp, `video.${fmt.ext === 'mov' ? 'mov' : fmt.container === 'webm' ? 'webm' : fmt.container === 'mkv' ? 'mkv' : 'mp4'}`);
    const fd = fs.openSync(videoTmp, 'w');
    const writable = new WritableStream({ write: (chunk) => void fs.writeSync(fd, chunk.data, 0, chunk.data.length, chunk.position) });
    const format =
      fmt.container === 'webm' ? new WebMOutputFormat() : fmt.container === 'mkv' ? new MkvOutputFormat() : fmt.container === 'mov' ? new MovOutputFormat({ fastStart: false }) : new Mp4OutputFormat({ fastStart: false });
    const out = new Output({ format, target: new StreamTarget(writable) });
    const source = new CanvasSource(canvas, { codec: fmt.codec, bitrate: videoBitrate(fmt, quality, w, h, fps, bitrate), keyFrameInterval: 2, latencyMode: 'quality' });
    out.addVideoTrack(source, { frameRate: fps });
    await out.start();
    encoder = {
      add: (i) => source.add(i / fps, 1 / fps),
      finish: async () => {
        await out.finalize();
        fs.closeSync(fd);
        // Lyden legges til med FFmpeg uten å kode bildet på nytt.
        const args = ['-i', videoTmp];
        if (hasAudio) args.push('-i', wavPath);
        if (embedPath) args.push('-i', embedPath);
        args.push('-map', '0:v:0');
        if (hasAudio) args.push('-map', '1:a:0', ...audioArgs(fmt.audio, q), '-disposition:a:0', 'default');
        if (embedPath) args.push(...subtitleArgs(fmt, hasAudio ? 2 : 1));
        args.push('-c:v', 'copy', '-t', String(b - a));
        if (fmt.container === 'mp4' || fmt.container === 'mov') args.push('-movflags', '+faststart');
        if (fmt.codec === 'hevc') args.push('-tag:v', 'hvc1');
        args.push(output);
        await ffmpeg(ffmpegBin, args).done;
      },
      abort: () => out.cancel?.().catch(() => {}),
    };
  } else {
    const args = ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0'];
    if (hasAudio) args.push('-i', wavPath);
    if (embedPath) args.push('-i', embedPath);
    args.push('-map', '0:v:0');
    if (hasAudio) args.push('-map', '1:a:0', ...audioArgs(fmt.audio, q), '-disposition:a:0', 'default');
    if (embedPath) args.push(...subtitleArgs(fmt, hasAudio ? 2 : 1));
    args.push(...videoArgs(fmt, q, w, h, fps), '-t', String(b - a));
    if (fmt.container === 'mp4' || fmt.container === 'mov') args.push('-movflags', '+faststart');
    args.push(output);
    const job = ffmpeg(ffmpegBin, args, { stdin: true });
    job.proc.stdin.on('error', () => {});
    encoder = {
      add: () => writeAsync(job.proc.stdin, Buffer.from(g.getImageData(0, 0, w, h).data.buffer)),
      finish: async () => {
        job.proc.stdin.end();
        await job.done;
      },
      abort: () => job.proc.kill('SIGKILL'),
    };
  }

  try {
    for (let i = 0; i < frames; i++) {
      checkCancel(jobId);
      const T = a + i / fps;
      const frame = computeFrame(project, T, { captions: burnCaptions });
      const needed = neededFrames(project, frame);
      const ready = new Map();
      await Promise.all(
        needed.map(async (n) => {
          const id = `${n.clip.id}:${n.key}`;
          if (n.image) {
            if (!images.has(n.path)) images.set(n.path, await createImageBitmap(new Blob([fs.readFileSync(n.path)])));
            const img = images.get(n.path);
            ready.set(id, { img, w: img.width, h: img.height });
            return;
          }
          // Egen leser per klipp og fil (baklengs klipp bruker en annen fil).
          const rid = `${id}|${n.path}`;
          let r = readers.get(rid);
          if (!r) {
            r = new Reader(n.path);
            readers.set(rid, r);
          }
          r.lastUsed = T;
          const sample = await r.frameAt(n.t);
          if (sample) ready.set(id, { sample });
        })
      );
      const getSource = (clip, key) => {
        const e = ready.get(`${clip.id}:${key}`);
        if (!e) return null;
        if (e.img) return e;
        const s = e.sample;
        if (s.rotation) {
          // Roterte opptak (for eksempel fra telefon) tegnes riktig vei først.
          const id = `${clip.id}:${key}`;
          let c = rotated.get(id);
          if (!c || c.width !== s.displayWidth || c.height !== s.displayHeight) {
            c = new OffscreenCanvas(s.displayWidth, s.displayHeight);
            rotated.set(id, c);
          }
          s.draw(c.getContext('2d'), 0, 0, c.width, c.height);
          return { img: c, w: c.width, h: c.height };
        }
        return { img: s.toCanvasImageSource(), w: s.displayWidth, h: s.displayHeight };
      };
      drawFrame(g, project, frame, getSource, { matrix });
      await encoder.add(i);
      for (const [id, r] of readers) {
        if (T - r.lastUsed > 2) {
          r.close();
          readers.delete(id);
        }
      }
      if (i % 5 === 0) progress(jobId, 0.15 + (i / frames) * 0.8, 'Rendering video');
    }
    progress(jobId, 0.96, 'Finishing');
    await encoder.finish();
  } catch (err) {
    encoder.abort();
    throw err;
  } finally {
    for (const r of readers.values()) r.close();
    for (const img of images.values()) img.close?.();
  }
}

function audioArgs(kind, q) {
  if (kind === 'opus') return ['-c:a', 'libopus', '-b:a', `${Math.min(256, q.audioKbps)}k`];
  if (kind === 'pcm') return ['-c:a', 'pcm_s16le'];
  return ['-c:a', 'aac', '-b:a', `${q.audioKbps}k`];
}

function videoArgs(fmt, q, w, h, fps) {
  const custom = q.bitrate > 0 && !['prores_ks', 'gif'].includes(fmt.ffCodec);
  const base = videoArgsCrf(fmt, q);
  if (!custom) return base;
  // Egen bitrate: bytt ut kvalitetsstyringen med fast mål og tak.
  const out = [];
  for (let i = 0; i < base.length; i++) {
    if (base[i] === '-crf' || base[i] === '-b:v') {
      i++;
      continue;
    }
    out.push(base[i]);
  }
  const k = Math.round(q.bitrate * 1000);
  return [...out, '-b:v', `${k}k`, '-maxrate', `${Math.round(k * 1.5)}k`, '-bufsize', `${k * 2}k`];
}

function videoArgsCrf(fmt, q) {
  switch (fmt.ffCodec) {
    case 'libx264':
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(q.crf), '-pix_fmt', 'yuv420p'];
    case 'libx265':
      return ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(q.crf + 4), '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1'];
    case 'libaom-av1':
      return ['-c:v', 'libaom-av1', '-cpu-used', '6', '-row-mt', '1', '-crf', String(q.crf + 12), '-b:v', '0', '-pix_fmt', 'yuv420p'];
    case 'libvpx-vp9':
      return ['-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', '-crf', String(q.crf + 10), '-b:v', '0', '-pix_fmt', 'yuv420p'];
    case 'prores_ks':
      return ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'];
    case 'gif':
      return ['-vf', 'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0'];
    default:
      return ['-c:v', 'libx264', '-crf', String(q.crf), '-pix_fmt', 'yuv420p'];
  }
}

async function runExport(jobId, payload) {
  const { project, settings, ffmpeg: ffmpegBin } = payload;
  // Eksporten endrer ikke prosjektet, så tidsindeksen kan gjenbrukes for hvert bilde og hver lydblokk.
  sealProject(project);
  // Bakgrunnsbilder for Remove Background må være lastet før bildene tegnes.
  await preloadAssets(project);
  const tmp = path.join(payload.tmpDir, `job-${Date.now()}-${jobId}`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.dirname(settings.output), { recursive: true });
  const ctx = { project, ffmpegBin, tmp };
  // Bevegelsesanalyser for stabiliserte klipp.
  for (const c of Object.values(project.clips)) {
    const p = c.props?.stabilize && project.media[c.mediaId]?.streams?.main?.motion;
    if (p && fs.existsSync(p)) setMotion(p, JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  const a = settings.range ? settings.range.in : 0;
  const b = settings.range ? settings.range.out : project.duration;
  if (b - a <= 0) throw new Error('The timeline is empty.');
  const q = QUALITIES.find((x) => x.id === settings.quality) || QUALITIES[2];
  const wavPath = path.join(tmp, 'mix.wav');

  try {
    if (settings.audioOnly) {
      const fmt = AUDIO_FORMATS.find((x) => x.id === settings.audioFormat) || AUDIO_FORMATS[0];
      progress(jobId, 0, 'Mixing audio');
      await mixAudio(jobId, ctx, a, b, wavPath, (p) => progress(jobId, p * 0.8, 'Mixing audio'));
      const args = ['-i', wavPath, '-c:a', fmt.ffCodec];
      const ak = audioKbps(settings);
      if (['libmp3lame', 'aac', 'libopus'].includes(fmt.ffCodec)) args.push('-b:a', `${fmt.ffCodec === 'libopus' ? Math.min(256, ak) : ak}k`);
      if (fmt.id === 'wav') args.push('-ar', '48000');
      args.push(settings.output);
      progress(jobId, 0.85, 'Encoding audio');
      await ffmpeg(ffmpegBin, args).done;
      writeSidecar(project, settings, a, b);
      return settings.output;
    }

    const fmt = VIDEO_FORMATS.find((x) => x.id === settings.format) || VIDEO_FORMATS[0];
    const { w, h, matrix } = outputGeometry(project, settings);
    const fps = settings.fps || project.fps;
    const hasAudio = Boolean(fmt.audio);
    if (hasAudio) {
      progress(jobId, 0, 'Mixing audio');
      await mixAudio(jobId, ctx, a, b, wavPath, (p) => progress(jobId, p * 0.15, 'Mixing audio'));
    }
    let useWebCodecs = false;
    if (fmt.codec && !settings.forceFfmpeg) {
      try {
        useWebCodecs = await canEncodeVideo(fmt.codec, { width: w, height: h, bitrate: videoBitrate(fmt, settings.quality, w, h, fps, settings.bitrate) });
      } catch {
        useWebCodecs = false;
      }
    }
    const mode = captionMode(settings.captions);
    const burnCaptions = mode.burn;
    let embedPath = null;
    if (mode.embed && fmt.container !== 'gif') {
      const items = captionItems(project, a, b);
      if (items.length) {
        embedPath = path.join(tmp, 'captions.srt');
        fs.writeFileSync(embedPath, toSrt(items));
      }
    }
    await renderVideo(jobId, ctx, { a, b, w, h, matrix, fps, fmt, quality: settings.quality, bitrate: settings.bitrate, akbps: audioKbps(settings), burnCaptions, embedPath, useWebCodecs, wavPath, output: settings.output, hasAudio });
    writeSidecar(project, settings, a, b);
    return settings.output;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Undertekstvalg: burn, srt, vtt, embed, eller kombinasjoner som "burn+srt". "both" er eldre lagring.
function captionMode(v) {
  const parts = new Set(String(v || 'none').split('+'));
  if (parts.has('both')) parts.add('burn').add('srt');
  return { burn: parts.has('burn'), srt: parts.has('srt'), vtt: parts.has('vtt'), embed: parts.has('embed') };
}

function captionItems(project, a, b) {
  return Object.values(project.clips)
    .filter((c) => c.lane === CAPTION_LANE && c.enabled && c.start < b && c.start + c.dur > a && String(c.props.text || '').trim())
    .map((c) => ({ start: Math.max(0, c.start - a), end: Math.min(b, c.start + c.dur) - a, text: c.props.text || '' }));
}

// Myk undertekst: kan slås av og på i avspilleren.
function subtitleArgs(fmt, index) {
  const codec = fmt.container === 'mkv' ? 'srt' : fmt.container === 'webm' ? 'webvtt' : 'mov_text';
  return ['-map', `${index}:s:0`, '-c:s', codec, '-metadata:s:s:0', 'language=und', '-disposition:s:0', 'default'];
}

function writeSidecar(project, settings, a, b) {
  const mode = captionMode(settings.captions);
  const items = captionItems(project, a, b);
  if (!items.length) return;
  const base = settings.output.replace(/\.[^.]+$/, '');
  if (mode.srt) fs.writeFileSync(`${base}.srt`, toSrt(items));
  if (mode.vtt) fs.writeFileSync(`${base}.vtt`, toVtt(items));
}
