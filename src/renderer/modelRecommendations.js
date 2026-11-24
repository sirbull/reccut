import { signal } from '@preact/signals';
export const modelGpu = signal(null);
let checking;
// Same compatibility check as the background worker, without loading a model.
export function checkModelGpu() {
  return checking ||= Promise.race([
    Promise.resolve().then(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      return Boolean(adapter && adapter.limits.maxStorageBuffersPerShaderStage >= 8);
    }).catch(() => false),
    new Promise(resolve => setTimeout(() => resolve(false), 2000)),
  ]).then(ok => { modelGpu.value = ok; return ok; });
}
