import { srcOffset } from './model.js';

// The decoder reads a contiguous source range. Resample into timeline seconds before
// Whisper sees it, so caption/word/pause times already use the editor's timebase.
export function mixSpeechSource(out, pcm, source, rate = 16000, gain = 1) {
  const timing = source.timing;
  const duration = timing?.dur ?? source.dur;
  const first = Math.round(source.start * rate);
  const count = Math.min(Math.ceil(duration * rate), out.length - first);
  for (let j = Math.max(0, -first); j < count; j++) {
    const local = j / rate;
    let position;
    if (timing) {
      const offset = srcOffset(timing, local);
      const absolute = timing.reverse ? timing.in + srcOffset(timing, timing.dur) - offset : timing.in + offset;
      position = (absolute - (source.streamOffset || 0) - source.in) * rate;
    } else position = j;
    if (position < 0 || position >= pcm.length) continue;
    const index = Math.floor(position), fraction = position - index;
    out[first + j] += (pcm[index] * (1 - fraction) + (pcm[index + 1] ?? pcm[index]) * fraction) * gain;
  }
}
