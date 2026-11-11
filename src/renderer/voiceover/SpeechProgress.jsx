import { useEffect, useState } from 'preact/hooks';
import { Button } from '../ui.jsx';
import { speechTiming } from './speech.js';

const duration = (seconds) => {
  const s = Math.max(1, Math.ceil(seconds));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export function SpeechProgress({ controller, batch = null, onCancel = controller.cancel }) {
  const state = controller.state.value;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!state) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [state?.startedAt]);
  if (!state) return null;
  const { elapsed, remaining, percent, determinate } = speechTiming(state, batch);
  const stopping = state.phase === 'stopping';
  return (
    <div class="vo-speech-progress" aria-label="Voice generation">
      <div class="vo-speech-status" role="status">
        <span>{state.stage}</span>
        {determinate && <b>{percent} %</b>}
      </div>
      <progress max="100" value={determinate ? percent : undefined} aria-label="Voice generation progress" />
      <div class="vo-speech-time">
        <span>{elapsed < 1 ? 'Starting…' : `${duration(elapsed)} elapsed`}{remaining != null && !stopping ? ` · About ${duration(remaining)} left` : ''}</span>
        <Button class="small" onClick={onCancel} disabled={stopping}>Cancel</Button>
      </div>
      {state.phase === 'loading' && <span class="dim">The first generation can take longer while the voice loads.</span>}
      {state.phase === 'synthesizing' && remaining == null && <span class="dim">Estimating remaining time…</span>}
    </div>
  );
}
