// A real, portable editing project for handbook photography. Originals are copied, never changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { newProject, makeClip, updateDuration } from '../src/shared/model.js';
import { templateDefaults, BUILTIN_TEMPLATES } from '../src/shared/titletemplates.js';

const require = createRequire(import.meta.url);
const ff = require('../src/main/ffmpeg.js');
export const DEFAULT_SOURCE = path.join(os.homedir(), 'Downloads', 'Nature-video');
export const DEFAULT_PROJECT = path.join(os.homedir(), 'Movies', 'Reccut', 'Help Demo - Into the Wild');
const SHOTS = [
  ['14205-255658030_medium.mp4', 'Mountain lake', 2, 6],
  ['203449-921267347_medium.mp4', 'Forest light', 3, 6],
  ['139816-773444570_medium.mp4', 'Falling water', 2, 6],
  ['129496-744385571_medium.mp4', 'Quiet coast', 3, 6],
  ['181177-865745746_medium.mp4', 'Coastal ridge', 3, 6],
  ['158530-816999763_medium.mp4', 'Blossoms and bees', 3, 6],
  ['215173_medium.mp4', 'River gorge', 5, 6],
];

async function demoAudio(file, duration) {
  // A self-contained synthesized pad, clearly labelled as demo audio, not field sound.
  // The supplied videos' only audio stream is silent.
  const rate = 24000, frames = Math.round(rate * duration), data = Buffer.alloc(44 + frames * 4);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(frames * 4, 40);
  const roots = [130.8128, 174.6141, 146.8324, 164.8138, 174.6141, 130.8128];
  for (let i = 0; i < frames; i++) {
    const t = i / rate, part = Math.min(5, Math.floor(t / 7)), u = (t % 7) / 7;
    const envelope = Math.sin(Math.PI * u) ** 2 * Math.min(1, t / 2, (duration - t) / 2);
    const tone = [1, 1.25, 1.5].reduce((sum, ratio) => sum + Math.sin(2 * Math.PI * roots[part] * ratio * t), 0) / 3;
    const sample = Math.round(envelope * tone * 0.55 * 32767);
    data.writeInt16LE(sample, 44 + i * 4); data.writeInt16LE(sample, 46 + i * 4);
  }
  await fs.writeFile(file, data);
}

export async function prepareHelpDemo({ source = DEFAULT_SOURCE, destination = DEFAULT_PROJECT } = {}) {
  const marker = path.join(destination, 'help-demo.json');
  const entries = await fs.readdir(destination).catch((e) => e.code === 'ENOENT' ? [] : Promise.reject(e));
  if (entries.length && !(await fs.readFile(marker, 'utf8').then((s) => JSON.parse(s).generator === 'reccut-help-demo-v1', () => false)))
    throw new Error(`The destination already contains other work: ${destination}. Choose another output folder.`);
  for (const folder of ['Media', 'Recordings', 'Optimized Media', 'Exports', 'Assets', 'Cache']) await fs.mkdir(path.join(destination, folder), { recursive: true });
  const p = newProject('Into the Wild');
  Object.assign(p, { id: 'reccut-nature-help-demo', fps: 25, autoFormat: false, tracks: { video: 2, audio: 1 } });
  let start = 0;
  for (const [file, name, inPoint, duration] of SHOTS) {
    const original = path.join(source, file), copied = path.join(destination, 'Media', `${name}.mp4`);
    const sourceStat = await fs.stat(original);
    const copyStat = await fs.stat(copied).catch(() => null);
    if (copyStat?.size !== sourceStat.size) await fs.copyFile(original, copied);
    const info = await ff.probe(copied);
    if (!info.hasVideo) throw new Error(`Cannot read the demo video: ${file}`);
    const id = name.toLowerCase().replaceAll(' ', '-');
    const thumbDir = path.join(destination, 'Cache', id);
    let thumbs = await fs.readFile(path.join(thumbDir, 'thumbnails.json'), 'utf8').then(JSON.parse, () => null);
    if (!thumbs || !(await fs.stat(thumbs.files[0]).catch(() => null))) {
      thumbs = await ff.thumbnails(copied, thumbDir, info.duration);
      await fs.writeFile(path.join(thumbDir, 'thumbnails.json'), JSON.stringify(thumbs));
    }
    const stream = { path: copied, offset: 0, duration: info.duration, width: info.width, height: info.height, fps: info.fps, hasVideo: true, hasAudio: info.hasAudio, needsProxy: false, color: info.color, thumbs };
    if (info.hasAudio) {
      stream.wave = path.join(thumbDir, 'wave.json');
      if (!(await fs.stat(stream.wave).catch(() => null))) await fs.writeFile(stream.wave, JSON.stringify(await ff.waveform(copied)));
    }
    const media = { id, name, kind: 'video', path: copied, duration: info.duration, width: info.width, height: info.height, fps: info.fps, streams: { main: stream } };
    p.media[id] = media;
    const clip = makeClip('video', { media, in: inPoint, start, dur: duration, name });
    clip.id = `shot-${id}`;
    if (info.hasAudio) clip.props.audioOff = { main: true };
    if (start > 0) clip.transition = { type: 'dissolve', dur: 0.6, audio: true };
    p.clips[clip.id] = clip; p.primary.push(clip.id); start += duration;
    console.log(`Prepared ${name}`);
  }
  const title = makeClip('title', { start: 0.5, dur: 5, lane: 1, name: 'Into the Wild · opening', props: { text: 'INTO THE WILD', subtext: 'A moment outside', size: 106, weight: 600, anim: 'fade', shadow: 0.4 } });
  title.id = 'opening-title'; p.clips[title.id] = title;
  const template = BUILTIN_TEMPLATES.find((t) => t.id === 'lt-line');
  const lower = makeClip('title', { start: 12.5, dur: 4.5, lane: 1, name: 'Falling water · location', props: { template: template.id, ...templateDefaults(template), fields: { name: 'Falling water', title: 'A quiet moment in the forest' }, colors: { accent: '#c9d8aa', text: '#ffffff' } } });
  lower.id = 'location-title'; p.clips[lower.id] = lower;
  const audioFile = path.join(destination, 'Media', 'Ambient pad - demo.wav');
  await demoAudio(audioFile, start);
  const audioWave = path.join(destination, 'Cache', 'demo-audio-wave.json');
  await fs.writeFile(audioWave, JSON.stringify(await ff.waveform(audioFile)));
  const audioMedia = { id: 'demo-ambient-pad', kind: 'audio', name: 'Ambient pad · demo', path: audioFile, duration: start, streams: { main: { path: audioFile, offset: 0, duration: start, hasAudio: true, hasVideo: false, wave: audioWave } } };
  p.media[audioMedia.id] = audioMedia;
  const audio = makeClip('audio', { media: audioMedia, lane: -1, start: 0, dur: start, name: 'Ambient pad · demo', props: { volume: -12, aFadeIn: 1.5, aFadeOut: 2 } });
  audio.id = 'source-audio'; p.clips[audio.id] = audio;
  p.markers = [{ id: 'chapter-mountains', t: 0, name: 'Mountains' }, { id: 'chapter-forest', t: 6, name: 'Forest' }, { id: 'chapter-water', t: 12, name: 'Water' }, { id: 'chapter-coast', t: 18, name: 'Coast' }];
  updateDuration(p);
  const projectFile = path.join(destination, 'Into the Wild.reccut');
  for (const m of Object.values(p.media)) {
    m.rel = path.relative(destination, m.path);
    for (const stream of Object.values(m.streams)) stream.rel = Object.fromEntries(['path', 'wave'].filter((key) => stream[key]).map((key) => [key, path.relative(destination, stream[key])]));
  }
  await fs.writeFile(projectFile, JSON.stringify(p));
  // A layered title asset makes the layer-import guide a genuine operation on the same material.
  const backdrop = await fs.readFile(p.media['mountain-lake'].streams.main.thumbs.files[3]);
  await fs.writeFile(path.join(destination, 'Assets', 'Into the Wild Title.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><g id="Mountain_landscape"><image href="data:image/jpeg;base64,${backdrop.toString('base64')}" width="1920" height="1080"/></g><g id="Shade"><rect width="1920" height="1080" fill="#091c26" opacity=".2"/></g><g id="Title"><text x="960" y="525" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="104" font-weight="600" letter-spacing="8" fill="white">INTO THE WILD</text></g><g id="Subtitle"><text x="960" y="600" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="34" fill="white">A moment outside</text></g></svg>`);
  await fs.writeFile(marker, JSON.stringify({ generator: 'reccut-help-demo-v1', projectFile, source, shots: SHOTS.map(([file, name]) => ({ file, name })), screenshotsOnly: true }, null, 2));
  await fs.writeFile(path.join(destination, 'README.txt'), 'Into the Wild — Reccut Help Demo\n\nAn editable 42-second example using the seven videos supplied in Downloads/Nature-video. Original videos were copied into Media. The source files in Downloads were not modified.\n\nOpen Into the Wild.reccut in Reccut. The opening and location titles, cross dissolves, markers and audio clip are editable. The supplied footage is silent, so Ambient pad - demo.wav is a locally synthesized example track for the audio illustrations, not original field sound. Screenshot-only variations (offline, processing, speed, recording previews) are not saved into this baseline project.\n\nRefresh handbook screenshots from the source repository with npm run help:screenshots.\n');
  return { projectFile, destination, project: p };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await prepareHelpDemo({ source: process.argv[2] || DEFAULT_SOURCE, destination: process.argv[3] || DEFAULT_PROJECT });
  console.log(`Demo project: ${result.projectFile}`);
}
