// Serialize speech requests and forward progress to the requesting studio control.
// Keep audio out of the shared background-task snapshots.
function createTtsJobs({ jobs, onProgress }) {
  return async function generate(payload, synthesize) {
    let audio;
    const task = jobs.add({
      kind: 'tts', title: 'Generating voice', queue: 'speech',
      run: async (ctx) => {
        const progress = (value, stage, detail = {}) => {
          if (ctx.isCanceled()) return;
          ctx.progress(value, stage);
          onProgress({ requestId: payload?.requestId, jobId: ctx.id, progress: value, stage, ...detail });
        };
        progress(0, 'Preparing voice…', { phase: 'loading' });
        audio = await synthesize(payload, { ...ctx, progress });
        if (ctx.isCanceled()) throw new Error('Canceled');
        return { duration: audio.samples.length / audio.rate };
      },
    });
    onProgress({ requestId: payload?.requestId, jobId: task.id, progress: 0, stage: 'Waiting for the voice engine…', phase: 'queued' });
    await task.done;
    return audio;
  };
}

module.exports = { createTtsJobs };
