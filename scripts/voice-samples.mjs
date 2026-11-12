// Lager korte lydprøver av AI-stemmene, så man kan høre dem før man laster ned noe.
// Kokoro: én setning på stemmens eget språk, laget med Kokoro som er lastet ned i appen.
// Piper: de offisielle prøvene fra rhasspy/piper-voices, samme versjon som katalogen.
// Resultatet (assets/voice-samples) sjekkes inn og følger med appen. Kjør på nytt når stemmene endres:
//   node scripts/voice-samples.mjs ["<mappen med tts/, f.eks. ~/Library/Application Support/Reccut Development>"]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { env, AutoTokenizer, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers';
import { PREVIEW_TEXT, VOICES, fixPhonemesFor, languageById, normalizeEnglish, splitPunctuation, voiceLanguage } from '../src/shared/tts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/main/ttsCatalog.json'), 'utf8'));
const out = path.join(root, 'assets/voice-samples');
const userData = process.argv[2] || path.join(os.homedir(), 'Library/Application Support/Reccut Development');
const ffmpeg = path.join(root, 'vendor/ffmpeg', `${process.platform === 'darwin' ? 'mac' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`, 'ffmpeg');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-samples-'));

// Opus, mono, 32 kbit/s: noen få kB per prøve.
const toOgg = (src, dest) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', dest]);

function wav(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return b;
}

async function kokoro() {
  const tts = path.join(userData, 'tts');
  if (!fs.existsSync(path.join(tts, 'kokoro/config.json'))) throw new Error(`Kokoro is not downloaded in ${tts}. Download it in the app first.`);
  env.allowRemoteModels = false;
  env.localModelPath = tts;
  // Uttaletillegget (eSpeak NG) slik appen bruker det: språkdataene fra disken, lydene uten skilletegn.
  const { default: Module } = await import(pathToFileURL(path.join(tts, 'espeak-ng.js')).href);
  const data = fs.readFileSync(path.join(tts, 'espeak-ng.data'));
  const espeak = new (await Module({ getPreloadedPackage: () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) })).eSpeakNGWorker();
  const phonemize = async (text, lang) => {
    espeak.set_voice(lang);
    return (espeak.synthesize_ipa(text).ipa || '').split('\n').map((l) => l.replace(/\([a-z-]+\)/gi, '').replace(/_/g, '')).filter((l) => l.trim());
  };
  const model = await StyleTextToSpeech2Model.from_pretrained('kokoro', { dtype: 'q8', local_files_only: true });
  const tokenizer = await AutoTokenizer.from_pretrained('kokoro', { local_files_only: true });
  fs.mkdirSync(path.join(out, 'kokoro'), { recursive: true });
  for (const v of VOICES) {
    const l = languageById(voiceLanguage(v.id).id);
    const text = l.english ? normalizeEnglish(PREVIEW_TEXT[l.id]) : PREVIEW_TEXT[l.id];
    const parts = await Promise.all(splitPunctuation(text).map(async (p) => (p.match ? p.text : (await phonemize(p.text, l.espeak)).join(' '))));
    const { input_ids } = tokenizer(fixPhonemesFor(parts.join(''), l.id), { truncation: true });
    const n = Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
    const bin = fs.readFileSync(path.join(tts, 'kokoro/voices', `${v.id}.bin`));
    const style = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
    const { waveform } = await model({ input_ids, style: new Tensor('float32', style.slice(n * 256, n * 256 + 256), [1, 256]), speed: new Tensor('float32', [1], [1]) });
    const src = path.join(tmp, `${v.id}.wav`);
    fs.writeFileSync(src, wav(waveform.data, 24000));
    toOgg(src, path.join(out, 'kokoro', `${v.id}.ogg`));
    console.log('kokoro', v.id);
  }
}

async function piper() {
  fs.mkdirSync(path.join(out, 'piper'), { recursive: true });
  const { repository, revision, voices } = catalog.piper;
  for (const v of voices) {
    const dir = path.dirname(v.files[0].path);
    for (let i = 0; i < Math.max(1, v.speakers.length); i++) {
      const url = `https://huggingface.co/${repository}/resolve/${revision}/${dir}/samples/speaker_${i}.mp3`.split('/').map((s, k) => (k > 2 ? encodeURIComponent(s) : s)).join('/');
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: ${res.status}`);
      const src = path.join(tmp, `${v.id}-${i}.mp3`);
      fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
      toOgg(src, path.join(out, 'piper', `${v.id}-${i}.ogg`));
      console.log('piper', v.id, i);
    }
  }
}

if (!process.argv.includes('--piper-only')) await kokoro();
await piper();
fs.rmSync(tmp, { recursive: true, force: true });
