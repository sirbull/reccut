// Et lite vindu for å ta opp lyd uten mer: velg mikrofon, trykk Rec, stopp. Klippet legges i Media-biblioteket.
import { useEffect, useRef } from 'preact/hooks';
import { Check, Mic, Square, X } from 'lucide-preact';
import { IconButton } from '../ui.jsx';
import { formatDuration } from '../../shared/model.js';
import * as q from './quick.js';

const db = (v) => (v > 1e-6 ? 20 * Math.log10(v) : -120);

export function QuickRecord() {
  const ref = useRef(null);
  const st = q.quickState.value;
  const rec = st === 'recording';
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => {
      if (!ref.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        q.quickState.value === 'recording' ? q.stopQuick() : q.closeQuick();
      } else if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest?.('button')) {
        e.preventDefault();
        e.stopPropagation();
        q.toggleQuick();
      }
    };
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.quick-rec-btn')) q.closeQuick();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, []);
  const a = q.quickAnchor.value;
  const style = a ? { right: `${Math.max(8, window.innerWidth - a.right)}px`, bottom: `${window.innerHeight - a.top + 6}px` } : { right: '16px', top: '56px' };
  const level = Math.max(0, Math.min(1, (db(q.quickLevel.value) + 60) / 60));
  const mics = q.quickMics.value;
  const current = q.quickMic();
  return (
    <div class="quick-rec plugin-window" role="dialog" aria-label="Record Audio" tabIndex={-1} ref={ref} style={style}>
      <header>
        <Mic size={14} />
        <b>Record Audio</b>
        <IconButton icon={X} size={14} title="Close (Esc)" onClick={q.closeQuick} disabled={st !== 'idle'} />
      </header>
      <div class="quick-rec-body">
        <ul class="quick-rec-mics" role="listbox" aria-label="Input">
          {mics.length === 0 && <li class="dim">Looking for microphones…</li>}
          {mics.map((m) => (
            <li key={m.id || 'default'}>
              <button class={m.id === current ? 'on' : ''} role="option" aria-selected={m.id === current} disabled={st !== 'idle'} onClick={() => q.chooseQuickMic(m.id)}>
                <span class="quick-rec-check">{m.id === current && <Check size={12} />}</span>
                <span class="quick-rec-name">{m.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div class="vo-meter quick-rec-meter">
          <div class={`vo-meter-peak${level > 0.95 ? ' hot' : level > 0.9 ? ' warm' : ''}`} style={{ width: `${level * 100}%` }} />
        </div>
        {q.quickError.value && <p class="vo-error">{q.quickError.value}</p>}
        <button class={`vo-rec${rec ? ' on' : ''}`} disabled={st === 'saving' || Boolean(q.quickError.value)} onClick={q.toggleQuick} title="Record / stop (Space)">
          {rec ? <Square size={16} /> : <span class="vo-rec-dot" />}
          <span>{rec ? formatDuration(q.quickElapsed.value) : st === 'saving' ? 'Saving…' : 'Rec'}</span>
        </button>
        <p class="dim quick-rec-hint">
          {q.quickLast.value ? `${q.quickLast.value.name} (${formatDuration(q.quickLast.value.duration)}) is in the Media browser.` : 'The recording goes to the Media browser.'}
        </p>
      </div>
    </div>
  );
}
