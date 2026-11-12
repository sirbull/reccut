// Offline review of the existing Norwegian v3 candidates. No downloads or catalog
// changes. Usage: node scripts/review-voxcpm.mjs <local whisper-base directory> [candidate directory]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { env, AutoTokenizer, AutoProcessor, WhisperForConditionalGeneration, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const modelDir = process.argv[2] && path.resolve(process.argv[2]);
if (!modelDir) throw new Error('Supply a local whisper-base model directory. This script never downloads models.');
const candidates = path.resolve(process.argv[3] || path.join(root, 'vendor/voice-tests/norwegian'));
const out = path.join(candidates, 'voxcpm-review');
const ffmpeg = path.join(root, 'vendor/ffmpeg', `${process.platform === 'darwin' ? 'mac' : process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const catalog = require('../src/main/ttsCatalog.json').voxcpm;
const text = 'Vi har gått gjennom tallene. Resultatet er ikke det vi håpet på. Nå må vi bestemme oss for hva vi gjør videre, og vi har ikke mye tid.';
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex');
const words = (s) => s.toLowerCase().match(/\p{L}+/gu) || [];
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const counts = (s) => { const m = new Map(); for (const w of words(s)) m.set(w, (m.get(w) || 0) + 1); return m; };
function missing(expected, actual) {
  const remaining = counts(actual), result = [];
  for (const word of words(expected)) { const n = remaining.get(word) || 0; if (n) remaining.set(word, n - 1); else result.push(word); }
  return result;
}
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = path.dirname(modelDir) + path.sep;
const id = path.basename(modelDir), options = { device: 'cpu', dtype: 'q8', local_files_only: true };
const [tokenizer, processor, model] = await Promise.all([
  AutoTokenizer.from_pretrained(id, options), AutoProcessor.from_pretrained(id, options), WhisperForConditionalGeneration.from_pretrained(id, options),
]);
const whisper = new AutomaticSpeechRecognitionPipeline({ task: 'automatic-speech-recognition', model, tokenizer, processor });
await fs.mkdir(out, { recursive: true });
const results = [];
try {
  for (const [voice, label] of [['kvinne', 'Woman'], ['mann', 'Man']]) {
    for (const [mood, sourceMood] of [['reference', null], ['neutral', 'noytral'], ['intense', 'intens'], ['angry', 'sint'], ['sad', 'trist']]) {
      const source = path.join(candidates, sourceMood ? `voxcpm2-${voice}-${sourceMood}-v3.wav` : `ref-${voice}-kort.wav`);
      const input = await fs.readFile(source);
      const pcm = execFileSync(ffmpeg, ['-v', 'error', '-i', source, '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'], { maxBuffer: 32 * 1024 * 1024 });
      const samples = new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      const transcript = await whisper(samples, { language: 'norwegian', task: 'transcribe', return_timestamps: false });
      const dest = `${voice}-${mood}.ogg`;
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', source, '-af', 'loudnorm=I=-18:TP=-2:LRA=11', '-ac', '1', '-c:a', 'libopus', '-b:a', '48k', path.join(out, dest)]);
      const row = { voice, label, mood, source: path.basename(source), sha256: hash(input), size: input.length, duration: samples.length / 16000,
        sample: dest, transcript: transcript.text.trim(), expected: sourceMood ? text : null,
        wordsToCheck: sourceMood ? missing(text, transcript.text) : [], negations: counts(transcript.text).get('ikke') || 0 };
      results.push(row);
      console.log(`${voice}/${mood}: ${row.duration.toFixed(2)} s; Whisper: ${row.transcript}`);
    }
  }
} finally { await whisper.dispose(); }
const report = { reviewed: false, source: 'Synthetic VoxCPM2 v3 listening-test candidates; no real-person references.', engineRevision: catalog.engine.revision,
  modelRevision: catalog.model.revision, settings: catalog.settings, recognizer: { localPath: modelDir, name: 'Whisper Base, q8', automatedOnly: true }, expected: text, results };
await fs.writeFile(path.join(out, 'review.json'), JSON.stringify(report, null, 2) + '\n');
const cards = ['kvinne', 'mann'].map((voice) => `<section><h2>${voice === 'kvinne' ? 'Kvinne' : 'Mann'}</h2>${results.filter((r) => r.voice === voice).map((r) => `<article><h3>${escape(r.mood)}</h3><p>${r.duration.toFixed(2)} s · <code>${escape(r.source)}</code></p><audio controls preload="none" src="${r.sample}"></audio><p><b>Whisper:</b> ${escape(r.transcript)}</p>${r.expected ? `<p class="${r.wordsToCheck.length ? 'flag' : 'ok'}">Ord å kontrollere: ${escape(r.wordsToCheck.join(', ') || 'ingen flagget')}. «ikke»: ${r.negations} av 2.</p>` : '<p>Kontroller at referansen er en hel setning og er 3–4 sekunder.</p>'}</article>`).join('')}</section>`).join('');
await fs.writeFile(path.join(out, 'index.html'), `<!doctype html><html lang="nb"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VoxCPM2 · norsk stemmekontroll</title><style>body{background:#18191b;color:#eee;font:16px/1.5 system-ui;max-width:1200px;margin:32px auto;padding:0 24px}h1{font-size:30px}h2{font-size:24px}h3{text-transform:capitalize}blockquote,article{background:#25262a;padding:16px;border-radius:10px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px}audio{width:100%}code{overflow-wrap:anywhere}.flag{color:#ffc086}.ok{color:#a3deb0}small{color:#bbb}</style><h1>VoxCPM2 · norske referanser og fire stemninger</h1><p>Disse stemmene er syntetiske kandidater. De er ikke lagt i appens katalog. Prøvene er justert til omtrent samme lyttenivå; råfilenes SHA-256 står i review.json.</p><blockquote>${escape(text)}</blockquote><p>Lytt etter samme person og dialekt i alle stemninger, tydelig forskjell i stemning, hele setninger og begge forekomstene av «ikke». Kontroller også sus, romklang og klipping. Referansene må være hele setninger på 3–4 sekunder.</p><p>Whisper Base er en automatisk ordkontroll med usikkerheter, og kan ikke godkjenne stemmekvalitet. Flaggene nedenfor må vurderes ved lytting. «Serious» er fortsatt utelatt.</p><main>${cards}</main></html>`);
console.log(`Review: ${path.join(out, 'index.html')}`);
