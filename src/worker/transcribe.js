// Automatisk teksting med Whisper (Transformers.js). Kjører lokalt i et skjult vindu.
// Installed models only. All network downloads belong to the explicit model manager.
import { env, AutoTokenizer, AutoProcessor, WhisperForConditionalGeneration, AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';
import { alignWords, findPauses, groupWords } from '../shared/speech.js';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', location.href).href;
env.backends.onnx.wasm.numThreads = 1;
// Modellfilene lagres på disk via hovedprosessen.
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(request) {
    const key = typeof request === 'string' ? request : request.url;
    const data = await window.worker.cacheMatch(key);
    return data ? new Response(data) : undefined;
  },
  async put(request, response) {
    const key = typeof request === 'string' ? request : request.url;
    const data = new Uint8Array(await response.arrayBuffer());
    await window.worker.cachePut(key, data);
  },
};

const RATE = 16000;
const WINDOW = 30;
let cached = { key: null, pipe: null };
const canceled = new Set();

async function getPipe(model, onProgress) {
  if (!model?.repository || !model.version) throw new Error('Select an installed subtitle model in Settings → AI.');
  const id = model.repository;
  const adapter = (model.legacyGpu || model.profile === 'gpu') && navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  const useGpu = Boolean(adapter);
  if (!adapter && model.profile === 'gpu') throw new Error('This older model installation needs WebGPU. Install the CPU-compatible model in Settings → AI.');
  const key = `${id}:${model.version}:${useGpu ? 'gpu' : 'cpu'}`;
  if (cached.key === key) return cached.pipe;
  if (cached.pipe) { await cached.pipe.dispose(); cached = { key: null, pipe: null }; }
  const files = {};
  const progress_callback = (e) => {
    if (e.status === 'progress' && e.file) {
      files[e.file] = e.progress || 0;
      const vals = Object.values(files);
      onProgress(vals.reduce((a, b) => a + b, 0) / vals.length / 100);
    }
  };
  const opts = useGpu
    ? { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' }, progress_callback }
    : { device: 'wasm', dtype: 'q8', progress_callback };
  // The v4 pipeline factory probes unpinned `main` metadata before forwarding
  // revision options. Build the same Whisper pipeline from pinned components.
  const load = async settings => {
    const options = { ...settings, revision: model.version, local_files_only: true };
    const [tokenizer, processor, loaded] = await Promise.all([
      AutoTokenizer.from_pretrained(id, options),
      AutoProcessor.from_pretrained(id, options),
      WhisperForConditionalGeneration.from_pretrained(id, options),
    ]);
    return new AutomaticSpeechRecognitionPipeline({ task: 'automatic-speech-recognition', model: loaded, tokenizer, processor });
  };
  let pipe;
  try { pipe = await load(opts); }
  catch (error) {
    if (!useGpu || !model.cpuAvailable) throw error;
    pipe = await load({ device: 'wasm', dtype: 'q8', progress_callback });
  }
  cached = { key, pipe };
  return pipe;
}

function isSilent(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 16) sum += buf[i] * buf[i];
  return Math.sqrt(sum / (buf.length / 16)) < 0.003;
}

window.worker.onCancel((jobId) => canceled.add(jobId));

window.worker.onJob(async ({ jobId, payload }) => {
  const { audio, language, model } = payload;
  const report = (p, stage) => window.worker.progress(jobId, p, stage);
  try {
    report(0.1, 'Loading speech model');
    const asr = await getPipe(model, (p) => report(0.1 + p * 0.2, 'Loading speech model'));
    const words = [];
    const windows = Math.ceil(audio.length / (RATE * WINDOW));
    const length = audio.length / RATE;
    for (let i = 0; i < windows; i++) {
      if (canceled.has(jobId)) throw new Error('Canceled');
      const offset = i * WINDOW;
      const chunk = audio.subarray(i * RATE * WINDOW, Math.min(audio.length, (i + 1) * RATE * WINDOW));
      if (chunk.length < RATE * 0.5 || isSilent(chunk)) continue;
      const out = await asr(chunk, {
        return_timestamps: 'word',
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
      });
      for (const c of out.chunks || []) {
        const start = offset + (c.timestamp[0] ?? 0);
        const end = Math.min(length, offset + (c.timestamp[1] ?? (c.timestamp[0] ?? 0) + 0.3));
        if (c.text.trim()) words.push({ start, end: Math.max(end, start + 0.05), text: c.text.trim() });
      }
      report(0.3 + ((i + 1) / windows) * 0.7, 'Recognizing speech');
    }
    const pauses = findPauses(audio, RATE);
    const aligned = alignWords(words, pauses);
    window.worker.done(jobId, { segments: groupWords(aligned), words: aligned, pauses });
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || err);
    window.worker.error(jobId, msg);
  } finally {
    canceled.delete(jobId);
  }
});
