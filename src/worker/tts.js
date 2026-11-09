// AI-stemmer med Kokoro-82M (Transformers.js), lokalt i et skjult vindu, uten nett.
// Modellen og stemmene leses fra disk via hovedprosessen (kontrollert ved nedlasting).
// Uttalen (eSpeak NG i phonemizer.js) er et eget tillegg som lastes inn herfra.
import { env, AutoTokenizer, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers';
import { chunksForSpeech, fixPhonemesFor, languageById, normalizeEnglish, splitPunctuation, voiceLanguage } from '../shared/tts.js';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', location.href).href;
env.backends.onnx.wasm.numThreads = 1;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(request) {
    const key = typeof request === 'string' ? request : request.url;
    const data = await window.worker.cacheMatch(key);
    return data ? new Response(data) : undefined;
  },
  async put() {},
};

const RATE = 24000;
let loaded = null; // { key, model, tokenizer, phonemize }
const voices = new Map();

async function load({ repository, revision, addon }) {
  const key = `${repository}@${revision}`;
  if (loaded?.key === key) return loaded;
  const bytes = await window.worker.cacheMatch(addon);
  if (!bytes) throw new Error('The pronunciation add-on is missing. Download the AI voices again.');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  let phonemize;
  try {
    ({ phonemize } = await import(/* @vite-ignore */ url));
  } finally {
    URL.revokeObjectURL(url);
  }
  const opts = { revision, local_files_only: true };
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(repository, { ...opts, dtype: 'q8', device: 'wasm' }),
    AutoTokenizer.from_pretrained(repository, opts),
  ]);
  loaded = { key, model, tokenizer, phonemize };
  return loaded;
}

async function voice(id, { repository, revision }) {
  if (voices.has(id)) return voices.get(id);
  const bytes = await window.worker.cacheMatch(`https://huggingface.co/${repository}/resolve/${revision}/voices/${id}.bin`);
  if (!bytes) throw new Error(`The voice ${id} is not installed.`);
  const data = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  voices.set(id, data);
  return data;
}

// Tekst til uttale (IPA). Tegnsetting beholdes, så modellen får med seg pausene.
async function toPhonemes(text, lang, phonemize) {
  const l = languageById(lang);
  const src = l.english ? normalizeEnglish(text) : text;
  const parts = await Promise.all(
    splitPunctuation(src).map(async (p) => {
      if (p.match) return p.text;
      try {
        return (await phonemize(p.text, l.espeak)).join(' ');
      } catch (err) {
        if (/Invalid language/.test(err?.message)) throw new Error(`The pronunciation add-on cannot read ${l.label}.`);
        throw err;
      }
    })
  );
  return fixPhonemesFor(parts.join(''), l.id);
}

window.worker.onJob(async ({ jobId, payload }) => {
  try {
    const { model, tokenizer, phonemize } = await load(payload);
    const lang = languageById(payload.lang)?.id || voiceLanguage(payload.voice).id;
    const style = await voice(payload.voice, payload);
    const chunks = chunksForSpeech(payload.text);
    const pieces = [];
    for (let i = 0; i < chunks.length; i++) {
      const ipa = await toPhonemes(chunks[i], lang, phonemize);
      if (!ipa) continue;
      const { input_ids } = tokenizer(ipa, { truncation: true });
      const n = Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
      const { waveform } = await model({
        input_ids,
        style: new Tensor('float32', style.slice(n * 256, n * 256 + 256), [1, 256]),
        speed: new Tensor('float32', [payload.speed || 1], [1]),
      });
      pieces.push(waveform.data);
      // Kort pause mellom setninger som er laget hver for seg.
      if (i < chunks.length - 1) pieces.push(new Float32Array(Math.round(RATE * 0.28)));
      window.worker.progress(jobId, (i + 1) / chunks.length, 'Speaking');
    }
    const len = pieces.reduce((a, p) => a + p.length, 0);
    const samples = new Float32Array(len);
    let o = 0;
    for (const p of pieces) {
      samples.set(p, o);
      o += p.length;
    }
    window.worker.done(jobId, { samples, rate: RATE });
  } catch (err) {
    window.worker.error(jobId, String(err?.message || err));
  }
});
