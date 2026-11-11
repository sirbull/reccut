// AI-stemmer med Kokoro-82M (Transformers.js), lokalt i et skjult vindu, uten nett.
// Modellen og stemmene leses fra disk via hovedprosessen (kontrollert ved nedlasting).
// Uttalen (eSpeak NG, alle språk) er et eget tillegg som lastes inn herfra.
import { env, AutoTokenizer, StyleTextToSpeech2Model, Tensor } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web/webgpu';
import { blendVectors, chunksForSpeech, piperIds, fixPhonemesFor, languageById, normalizeEnglish, parseVoice, splitPunctuation, voiceLanguage } from '../shared/tts.js';

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

let phonemizer = null;
// Uttaletillegget (eSpeak NG fra @echogarden/espeak-ng-emscripten), lastet ned for seg og delt av Kokoro og Piper.
// Språkdataene (espeak-ng.data) gis direkte fra disken, så modulen aldri henter noe selv.
async function loadPhonemizer(addon, addonData) {
  if (phonemizer) return phonemizer;
  const [bytes, data] = await Promise.all([window.worker.cacheMatch(addon), window.worker.cacheMatch(addonData)]);
  if (!bytes || !data) throw new Error('MODEL_MISSING:voices The pronunciation add-on is missing. Download the voice again.');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
  let Module;
  try {
    ({ default: Module } = await import(/* @vite-ignore */ url));
  } finally {
    URL.revokeObjectURL(url);
  }
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  const espeak = new (await Module({ getPreloadedPackage: () => buffer })).eSpeakNGWorker();
  // Samme svar som før: én streng per setningsdel, i IPA. Denne utgaven skiller lydene med _ og
  // markerer språkbytter med (en), som fjernes.
  phonemizer = async (text, lang) => {
    if (espeak.set_voice(lang) !== 0) throw new Error(`Invalid language identifier: "${lang}".`);
    return (espeak.synthesize_ipa(text).ipa || '')
      .split('\n')
      .map((l) => l.replace(/\([a-z-]+\)/gi, '').replace(/_/g, ''))
      .filter((l) => l.trim());
  };
  return phonemizer;
}

async function load({ repository, revision, addon, addonData }) {
  const key = `${repository}@${revision}`;
  if (loaded?.key === key) return loaded;
  const phonemize = await loadPhonemizer(addon, addonData);
  const opts = { revision, local_files_only: true };
  const [model, tokenizer] = await Promise.all([
    StyleTextToSpeech2Model.from_pretrained(repository, { ...opts, dtype: 'q8', device: 'wasm' }),
    AutoTokenizer.from_pretrained(repository, opts),
  ]);
  loaded = { key, model, tokenizer, phonemize };
  return loaded;
}

async function oneVoice(id, { repository, revision }) {
  if (voices.has(id)) return voices.get(id);
  const bytes = await window.worker.cacheMatch(`https://huggingface.co/${repository}/resolve/${revision}/voices/${id}.bin`);
  if (!bytes) throw new Error(`The voice ${id} is not installed.`);
  const data = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  voices.set(id, data);
  return data;
}
// En stemme, eller en blanding av flere ("bm_lewis:0.6,am_fenrir:0.4").
async function voice(spec, opts) {
  const parts = parseVoice(spec);
  if (!parts) throw new Error('Unknown voice.');
  const vectors = await Promise.all(parts.map((p) => oneVoice(p.id, opts)));
  return parts.length === 1 ? vectors[0] : blendVectors(vectors, parts.map((p) => p.weight));
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

/* Piper: VITS-stemmer for ett språk hver (norsk, svensk, dansk, tysk ...). Uttalen kommer fra eSpeak,
   og lydtegnene slås opp i stemmens egen tabell (phoneme_id_map), som i Piper selv. */

const piperCache = new Map(); // modelladresse -> { session, config }
async function piperModel(payload) {
  if (piperCache.has(payload.model)) return piperCache.get(payload.model);
  const [model, cfg] = await Promise.all([window.worker.cacheMatch(payload.model), window.worker.cacheMatch(payload.config)]);
  if (!model || !cfg) throw new Error('MODEL_MISSING:voices This voice is not downloaded.');
  ort.env.wasm.wasmPaths = new URL('./ort/', location.href).href;
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  const entry = { session, config: JSON.parse(new TextDecoder().decode(cfg)) };
  piperCache.set(payload.model, entry);
  return entry;
}

async function piper(jobId, payload) {
  const phonemize = await loadPhonemizer(payload.addon, payload.addonData);
  const { session, config } = await piperModel(payload);
  const voice = config.espeak?.voice || 'en-us';
  const rate = config.audio?.sample_rate || 22050;
  const inf = config.inference || {};
  const multi = (config.num_speakers || 1) > 1;
  const chunks = chunksForSpeech(payload.text);
  const pieces = [];
  for (let i = 0; i < chunks.length; i++) {
    const parts = await Promise.all(splitPunctuation(chunks[i]).map(async (p) => (p.match ? p.text : (await phonemize(p.text, voice)).join(' '))));
    const ids = piperIds(parts.join(''), config.phoneme_id_map);
    if (ids.length < 3) continue;
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / (payload.speed || 1), inf.noise_w ?? 0.8]), [3]),
    };
    if (multi) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(payload.speaker || 0)]), [1]);
    const out = await session.run(feeds);
    pieces.push(Float32Array.from((out.output || Object.values(out)[0]).data));
    if (i < chunks.length - 1) pieces.push(new Float32Array(Math.round(rate * 0.28)));
    window.worker.progress(jobId, (i + 1) / chunks.length, 'Speaking');
  }
  return { samples: joinPieces(pieces), rate };
}

function joinPieces(pieces) {
  const out = new Float32Array(pieces.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of pieces) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

window.worker.onJob(async ({ jobId, payload }) => {
  if (payload.engine === 'piper') {
    try {
      window.worker.done(jobId, await piper(jobId, payload));
    } catch (err) {
      window.worker.error(jobId, String(err?.message || err));
    }
    return;
  }
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
