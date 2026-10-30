// Automatisk teksting med Whisper (Transformers.js). Kjører lokalt i et skjult vindu.
// Modellen lastes ned første gang og ligger deretter i hurtigbufferen.
import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
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

const MODELS = { base: 'onnx-community/whisper-base', small: 'onnx-community/whisper-small' };
const RATE = 16000;
const WINDOW = 30;
let cached = { key: null, pipe: null };
const canceled = new Set();

async function getPipe(model, onProgress) {
  const id = MODELS[model] || MODELS.base;
  const useGpu = Boolean(navigator.gpu) && (await navigator.gpu.requestAdapter().catch(() => null));
  const key = `${id}:${useGpu ? 'gpu' : 'cpu'}`;
  if (cached.key === key) return cached.pipe;
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
  let pipe;
  try {
    pipe = await pipeline('automatic-speech-recognition', id, opts);
  } catch (err) {
    if (!useGpu) throw err;
    pipe = await pipeline('automatic-speech-recognition', id, { device: 'wasm', dtype: 'q8', progress_callback });
  }
  cached = { key, pipe };
  return pipe;
}

// Deler lange setninger slik at hver undertekst blir lett å lese.
function splitSegment(seg, maxChars = 84) {
  const text = seg.text.replace(/\s+/g, ' ').trim();
  if (!text) return [];
  if (text.length <= maxChars) return [{ ...seg, text }];
  const words = text.split(' ');
  const parts = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      parts.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) parts.push(cur);
  const total = text.length;
  let t = seg.start;
  return parts.map((p) => {
    const d = ((seg.end - seg.start) * p.length) / total;
    const out = { start: t, end: t + d, text: p };
    t += d;
    return out;
  });
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
    const asr = await getPipe(model, (p) => report(0.1 + p * 0.2, 'Downloading speech model'));
    const segments = [];
    const windows = Math.ceil(audio.length / (RATE * WINDOW));
    for (let i = 0; i < windows; i++) {
      if (canceled.has(jobId)) throw new Error('Canceled');
      const offset = i * WINDOW;
      const chunk = audio.subarray(i * RATE * WINDOW, Math.min(audio.length, (i + 1) * RATE * WINDOW));
      if (chunk.length < RATE * 0.5 || isSilent(chunk)) continue;
      const out = await asr(chunk, {
        return_timestamps: true,
        language: language === 'auto' ? undefined : language,
        task: 'transcribe',
      });
      for (const c of out.chunks || [{ timestamp: [0, chunk.length / RATE], text: out.text }]) {
        const start = offset + (c.timestamp[0] ?? 0);
        const end = offset + (c.timestamp[1] ?? Math.min(WINDOW, (c.timestamp[0] ?? 0) + 3));
        segments.push(...splitSegment({ start, end: Math.max(end, start + 0.6), text: c.text }));
      }
      report(0.3 + ((i + 1) / windows) * 0.7, 'Recognizing speech');
    }
    window.worker.done(jobId, segments);
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || err);
    window.worker.error(jobId, /fetch|network/i.test(msg) ? 'Could not download the speech model. Check your internet connection and try again.' : msg);
  } finally {
    canceled.delete(jobId);
  }
});
