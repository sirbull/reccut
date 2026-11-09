import { env, AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.useBrowserCache = false;
env.useCustomCache = false;
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', location.href).href;
env.backends.onnx.wasm.numThreads = 1;
const canceled = new Set();
let cached = null, gpuFailed = false;
const mediaURL = (path) => `media://file/${encodeURIComponent(path)}`;
const checkCanceled = (id) => { if (canceled.has(id)) throw new Error('Canceled'); };

async function loadModel(payload, report) {
  const adapter = !payload.cpuOnly && !gpuFailed && navigator.gpu && await navigator.gpu.requestAdapter().catch(() => null);
  const useGPU = adapter && adapter.limits.maxStorageBuffersPerShaderStage >= 8;
  // Bare den raske modellen er lastet ned, men maskinen har ikke WebGPU: den vanlige trengs.
  if (!useGPU && payload.gpuOnly) throw new Error('MODEL_MISSING:background The fast model needs a graphics card with WebGPU. Download the standard background model in Settings → AI.');
  const id = useGPU ? payload.model : payload.fallback || payload.model;
  const root = mediaURL(payload.modelDir.replace(/[\\/]*$/, '/'));
  const key = `${root}:${id}:${useGPU ? 'gpu' : 'cpu'}`;
  if (cached?.key === key) return cached;
  if (cached) { await cached.model.dispose(); cached = null; }
  env.localModelPath = root;
  const options = { local_files_only: true, progress_callback: (e) => {
    if (e.status === 'progress') report(0.05 + Math.min(1, (e.progress || 0) / 100) * 0.15, 'Loading background model');
  } };
  let model;
  try { model = await AutoModel.from_pretrained(id, { ...options, device: useGPU ? 'webgpu' : 'wasm', dtype: useGPU ? 'fp16' : 'fp32' }); }
  catch (err) {
    if (useGPU && payload.fallback) { gpuFailed = true; return loadModel({ ...payload, cpuOnly: true }, report); }
    throw err;
  }
  try {
    const processor = await AutoProcessor.from_pretrained(id, options);
    cached = { key, model, processor, device: useGPU ? 'webgpu' : 'wasm', id };
    return cached;
  } catch (err) { await model.dispose(); throw err; }
}
async function segmentImage(jobId, payload, report) {
  checkCanceled(jobId);
  const loadStarted = performance.now();
  const { model, processor, device, id } = await loadModel(payload, report);
  const loadMs = performance.now() - loadStarted;
  checkCanceled(jobId); report(0.25, 'Reading image');
  let image = await RawImage.fromURL(mediaURL(payload.path));
  const maxSide = Math.min(2048, Math.max(1, payload.maxSide || 1024));
  if (Math.max(image.width, image.height) > maxSide) {
    const scale = maxSide / Math.max(image.width, image.height);
    image = await image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  }
  const start = performance.now();
  const { pixel_values } = await processor(image);
  let output;
  try {
    checkCanceled(jobId); report(0.4, 'Removing background');
    output = await model({ [id === 'Xenova/modnet' ? 'input' : 'input_image']: pixel_values });
    checkCanceled(jobId);
    const tensor = output.output || Object.values(output).findLast(value => value?.dims?.length >= 3);
    if (!tensor) throw new Error('The background model returned no mask.');
    const alpha = (id === 'Xenova/modnet' ? tensor[0] : tensor[0].sigmoid()).mul(255).to('uint8');
    const maskImage = await RawImage.fromTensor(alpha).resize(image.width, image.height);
    report(1, 'Background removed');
    return { width: maskImage.width, height: maskImage.height, mask: new Uint8Array(maskImage.data), model: id, device, loadMs, inferenceMs: performance.now() - start };
  } finally { for (const value of Object.values(output || {})) value?.dispose?.(); pixel_values.dispose?.(); }
}
window.worker.onCancel((id) => canceled.add(id));
window.worker.onJob(async ({ jobId, payload }) => {
  const report = (p, stage) => window.worker.progress(jobId, p, stage);
  try {
    let result;
    try { result = await segmentImage(jobId, payload, report); }
    catch (err) {
      checkCanceled(jobId);
      if (!payload.fallback || cached?.device !== 'webgpu' || !/OrtRun|WebGPU|backend|GPU|memory|device|allocation/i.test(String(err?.message||err))) throw err;
      gpuFailed = true; report(0.1, 'Retrying background removal');
      result = await segmentImage(jobId, { ...payload, cpuOnly: true }, report);
    }
    window.worker.done(jobId, result);
  } catch (err) { window.worker.error(jobId, String(err?.message || err)); }
  finally { canceled.delete(jobId); }
});
