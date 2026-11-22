// Transcript Search: what is said in each media item, in source seconds, saved with the project.
import { signal } from '@preact/signals';
import { workPath } from '../../shared/model.js';
import { project, setMediaTranscript } from './store.js';

const api = window.api;
export const transcriptSearchOpen = signal(false);
export const transcribing = signal(null); // { done, total, name, abort }

export function speechStream(m) {
  if (!m || m.offline) return null;
  const st = m.kind === 'recording' ? (m.streams?.camera?.hasAudio ? m.streams.camera : m.streams?.screen) : m.streams?.main;
  return st?.hasAudio ? st : null;
}

// Runs one Whisper job. `agent: true` keeps the result out of the captions track.
export function runTranscribe(payload, signal) {
  let off = [];
  const job = api.startTranscribe({ ...payload, agent: true });
  return new Promise((resolve, reject) => {
    job.catch(reject);
    const abort = () => job.then((id) => api.cancelTask(id));
    signal?.addEventListener('abort', abort, { once: true });
    off = [
      api.onTranscribeDone((e) => job.then((id) => e.id === id && resolve(e))),
      api.onTranscribeError((e) => job.then((id) => e.id === id && reject(new Error(String(e.error))))),
      () => signal?.removeEventListener('abort', abort),
    ];
  }).finally(() => off.forEach((f) => f()));
}

export function mediaSources(m) {
  const st = speechStream(m);
  if (!st) throw new Error('This media has no audio.');
  return [{ path: workPath(st), in: 0, dur: m.duration, start: Math.max(0, st.offset || 0) }];
}

// Saves only the phrases; word times stay out of the project file.
export function saveTranscript(m, language, segments) {
  setMediaTranscript(m.id, { language, segments: segments.map(({ start, end, text }) => ({ start, end, text })) });
}

// Transcribes the media items one by one in the background. Closing the search window does not stop it.
export async function transcribeAll(ids, language) {
  if (transcribing.value) return;
  const ctrl = new AbortController();
  transcribing.value = { done: 0, total: ids.length, name: '', abort: () => ctrl.abort() };
  try {
    for (const [i, id] of ids.entries()) {
      const m = project.value.media[id];
      if (ctrl.signal.aborted) break;
      if (!speechStream(m)) continue;
      transcribing.value = { ...transcribing.value, done: i, name: m.name };
      const projectId = project.value.id;
      const result = await runTranscribe({ sources: mediaSources(m), duration: m.duration, language, projectId }, ctrl.signal);
      if (project.value.id === projectId) saveTranscript(m, language, result.segments || []);
    }
  } finally {
    transcribing.value = null;
  }
}
