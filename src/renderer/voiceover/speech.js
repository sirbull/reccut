import { signal } from '@preact/signals';

const canceled = () => Object.assign(new Error('Canceled'), { name: 'AbortError' });

export function createSpeechGeneration(api, { now = Date.now, requestId = () => crypto.randomUUID() } = {}) {
  const state = signal(null);
  let active = null;
  const cancel = () => {
    if (!active || active.canceled) return;
    active.canceled = true;
    state.value = { ...state.value, stage: 'Stopping…', phase: 'stopping' };
    if (active.jobId != null) api.cancelTask(active.jobId).catch(() => {});
  };
  const run = async (payload) => {
    cancel();
    const request = { id: requestId(), jobId: null, canceled: false };
    active = request;
    const startedAt = now();
    state.value = { requestId: request.id, startedAt, progressAt: startedAt, progress: 0, stage: 'Preparing voice…', phase: 'loading' };
    const off = api.onTtsProgress((event) => {
      if (event.requestId !== request.id) return;
      request.jobId = event.jobId;
      // A stop can arrive before the main process has announced the task id.
      if (request.canceled) {
        api.cancelTask(request.jobId).catch(() => {});
        return;
      }
      if (active !== request) return;
      const previous = state.value;
      state.value = { ...previous, ...event,
        progressAt: event.progress > previous.progress ? now() : previous.progressAt,
        inferenceStartedAt: previous.inferenceStartedAt ?? (event.phase === 'synthesizing' ? now() : undefined),
      };
    });
    try {
      const audio = await api.ttsGenerate({ ...payload, requestId: request.id });
      if (request.canceled) throw canceled();
      return audio;
    } catch (error) {
      if (request.canceled || error.message === 'Canceled') throw canceled();
      throw error;
    } finally {
      off();
      if (active === request) {
        active = null;
        state.value = null;
      }
    }
  };
  return { state, run, cancel };
}

export function speechTiming(state, batch, now = Date.now()) {
  const p = Math.max(0, Math.min(1, state.progress || 0));
  const fraction = batch ? (batch.done + p) / batch.total : p;
  const elapsed = Math.max(0, (now - (batch?.startedAt ?? state.startedAt)) / 1000);
  const measuredAt = state.progressAt ?? state.startedAt;
  const sinceProgress = Math.max(0, (now - measuredAt) / 1000);
  let remaining = null;
  if (batch?.done > 0 && fraction > 0 && fraction < 1) {
    const measured = Math.max(0, (measuredAt - batch.startedAt) / 1000);
    remaining = Math.max(0, measured * (1 - fraction) / fraction - sinceProgress);
  }
  else if (state.inferenceStartedAt != null && p > 0 && p < 1 && state.phase === 'synthesizing') {
    const speaking = Math.max(0, (measuredAt - state.inferenceStartedAt) / 1000);
    remaining = Math.max(0, speaking * (1 - p) / p - sinceProgress);
    if (batch) remaining += speaking / p * (batch.total - batch.done - 1);
  }
  if (remaining === 0 || state.phase === 'loading' || state.phase === 'queued' || state.phase === 'stopping' || state.phase === 'finishing') remaining = null;
  return { elapsed, remaining, percent: Math.min(99, Math.floor(fraction * 100)), determinate: fraction > 0 };
}
