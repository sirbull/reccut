// Demo media for the website feature cards (Beat Grid and Transcript Search).
// A synthesized 100 BPM drum and bass loop, and three English takes spoken by Kokoro (Apache 2.0),
// using the Kokoro model and eSpeak NG add-on already downloaded in the app. No system voices.
//   node scripts/feature-demo-media.mjs [output-directory] [user-data-with-tts]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env, AutoTokenizer, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers';
import { fixPhonemesFor, languageById, normalizeEnglish, splitPunctuation } from '../src/shared/tts.js';

const out = path.resolve(process.argv[2] || path.join(os.homedir(), 'Movies/Reccut/Website Demos - 2026-11-22/Feature Cards/Media'));
const userData = process.argv[3] || path.join(os.homedir(), 'Library/Application Support/Reccut Development');
fs.mkdirSync(out, { recursive: true });

function wav(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return b;
}

// 24 bars of 4/4 at 100 BPM: kick on 1 and 3, snare on 2 and 4, eighth-note hi-hats,
// a bass line on Am, F, C, G and a soft pad. Seeded noise, so every run gives the same file.
function beat() {
  const rate = 44100, bpm = 100, bars = 24, spb = 60 / bpm;
  const pcm = new Float32Array(Math.ceil((bars * 4 * spb + 1) * rate));
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const add = (t, len, fn) => {
    const s0 = Math.round(t * rate);
    for (let j = 0; j < len * rate && s0 + j < pcm.length; j++) pcm[s0 + j] += fn(j / rate);
  };
  const roots = [55, 43.65, 65.41, 49];
  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * spb, root = roots[bar % 4];
    add(t0, 4 * spb, (u) => 0.035 * Math.min(1, u * 4) * chords[bar % 4].reduce((s, f) => s + Math.sin(2 * Math.PI * f * u), 0));
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * spb;
      if (b % 2 === 0) add(t, 0.35, (u) => (b === 0 ? 0.95 : 0.7) * Math.exp(-u * 9) * Math.sin(2 * Math.PI * (45 * u + 40 * (1 - Math.exp(-u * 30)))));
      else add(t, 0.2, (u) => Math.exp(-u * 18) * (0.32 * noise() + 0.2 * Math.sin(2 * Math.PI * 185 * u)));
      for (const h of [0, 0.5]) {
        let prev = 0;
        add(t + h * spb, 0.05, (u) => { const n = noise(), v = n - prev; prev = n; return 0.09 * Math.exp(-u * 70) * v; });
      }
    }
    for (const [beatAt, len] of [[0, 1.4], [2.5, 1.2]]) add(t0 + beatAt * spb, len * spb, (u) => 0.28 * Math.exp(-u * 2.5) * Math.tanh(2 * Math.sin(2 * Math.PI * root * u)));
  }
  return { pcm, rate };
}

const TAKES = [
  { file: 'Interview - Take 1.wav', voice: 'af_heart', lines: [
    'We hiked up to the lake just before sunrise.',
    'The water was completely still, and you could see the mountains reflected in it.',
    'That was the moment I knew we had the opening shot.' ] },
  { file: 'Interview - Take 2.wav', voice: 'af_heart', lines: [
    'The hardest part was the weather.',
    'It rained for three days, so we waited in the tent and checked the forecast every hour.',
    'When the sun finally came out, the light on the ridge was incredible.' ] },
  { file: 'Narration - Coast.wav', voice: 'am_fenrir', lines: [
    'Along the coast, the light changes every few minutes.',
    'We filmed the waves at sunrise and again at sunset.',
    'The colors were completely different each time.' ] },
];

async function speech() {
  const tts = path.join(userData, 'tts');
  if (!fs.existsSync(path.join(tts, 'kokoro/config.json'))) throw new Error(`Kokoro is not downloaded in ${tts}. Download it in the app first.`);
  env.allowRemoteModels = false;
  env.localModelPath = tts;
  const { default: Module } = await import(pathToFileURL(path.join(tts, 'espeak-ng.js')).href);
  const data = fs.readFileSync(path.join(tts, 'espeak-ng.data'));
  const espeak = new (await Module({ getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) })).eSpeakNGWorker();
  espeak.set_voice('en-us');
  const ipa = (text) => (espeak.synthesize_ipa(text).ipa || '').split('\n').map((l) => l.replace(/\([a-z-]+\)/gi, '').replace(/_/g, '')).filter((l) => l.trim()).join(' ');
  const model = await StyleTextToSpeech2Model.from_pretrained('kokoro', { dtype: 'q8', local_files_only: true });
  const tokenizer = await AutoTokenizer.from_pretrained('kokoro', { local_files_only: true });
  const lang = languageById('en-us');
  for (const take of TAKES) {
    const bin = fs.readFileSync(path.join(tts, 'kokoro/voices', `${take.voice}.bin`));
    const style = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
    const parts = [new Float32Array(24000 * 0.6)];
    for (const line of take.lines) {
      const text = normalizeEnglish(line);
      const phon = splitPunctuation(text).map((p) => (p.match ? p.text : ipa(p.text))).join('');
      const { input_ids } = tokenizer(fixPhonemesFor(phon, lang.id), { truncation: true });
      const n = Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
      const { waveform } = await model({ input_ids, style: new Tensor('float32', style.slice(n * 256, n * 256 + 256), [1, 256]), speed: new Tensor('float32', [1], [1]) });
      parts.push(waveform.data, new Float32Array(24000 * 0.45));
    }
    const all = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    parts.reduce((o, p) => (all.set(p, o), o + p.length), 0);
    fs.writeFileSync(path.join(out, take.file), wav(all, 24000));
    console.log('speech', take.file);
  }
}

const b = beat();
fs.writeFileSync(path.join(out, 'Demo beat - 100 BPM.wav'), wav(b.pcm, b.rate));
console.log('beat', path.join(out, 'Demo beat - 100 BPM.wav'));
await speech();
