import { useEffect, useRef, useState } from 'preact/hooks';
import { Pause, Play, X } from 'lucide-preact';
import { analyzeScopes, SCOPE_TYPES } from '../../shared/scopes.js';
import { prefs, setPrefs } from '../prefs.js';
import { IconButton } from '../ui.jsx';
import { drawScope } from './scopesDraw.js';
const TITLES = {
  waveform: 'Luma Y′ waveform',
  rgbwaveform: 'RGB waveform',
  parade: 'RGB parade',
  histogram: 'RGB + luma histogram',
  vectorscope: 'Vectorscope · 75% targets',
};
export function VideoScopes({ sourceRef, onClose }) {
  const panel = useRef(null),
    plots = useRef({}),
    latest = useRef(null),
    settings = useRef(null);
  const [held, setHeld] = useState(false),
    [summary, setSummary] = useState(null),
    [error, setError] = useState('');
  const mode = SCOPE_TYPES.some((s) => s.value === prefs.value.videoScopesMode) ? prefs.value.videoScopesMode : 'all';
  const gain = Math.max(0.5, Math.min(6, Number(prefs.value.videoScopesGain) || 2));
  const log = prefs.value.videoScopesLog !== false,
    skin = prefs.value.videoScopesSkin !== false;
  settings.current = { gain, log, skin, held, mode };
  const modes = mode === 'all' ? ['waveform', 'parade', 'histogram', 'vectorscope'] : [mode];
  useEffect(() => {
    const sampler = document.createElement('canvas'),
      ctx = sampler.getContext('2d', { willReadFrequently: true });
    let timer = 0,
      disposed = false,
      previous = null,
      lastAnalysis = null,
      lastSignature = '';
    const paint = (force = false) => {
      const rect = panel.current?.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return;
      const signature = JSON.stringify([
        settings.current.mode,
        settings.current.gain,
        settings.current.log,
        settings.current.skin,
        rect.width,
        rect.height,
      ]);
      if (!force && latest.current === lastAnalysis && signature === lastSignature) return;
      lastAnalysis = latest.current;
      lastSignature = signature;
      for (const [type, canvas] of Object.entries(plots.current))
        if (canvas) drawScope(canvas, type, latest.current, settings.current);
    };
    const update = () => {
      if (disposed) return;
      const source = sourceRef.current,
        rect = panel.current?.getBoundingClientRect();
      if (
        source?.width > 0 &&
        source?.height > 0 &&
        rect?.width > 0 &&
        rect?.height > 0 &&
        !document.hidden &&
        !settings.current.held
      ) {
        try {
          const scale = Math.min(1, 512 / source.width, 288 / source.height);
          const width = Math.max(1, Math.round(source.width * scale)),
            height = Math.max(1, Math.round(source.height * scale));
          if (sampler.width !== width || sampler.height !== height) {
            sampler.width = width;
            sampler.height = height;
            previous = null;
          }
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(source, 0, 0, width, height);
          const frame = ctx.getImageData(0, 0, width, height);
          let changed = !previous || previous.length !== frame.data.length;
          if (!changed)
            for (let i = 0; i < frame.data.length; i++)
              if (previous[i] !== frame.data[i]) {
                changed = true;
                break;
              }
          if (changed) {
            previous = frame.data;
            latest.current = analyzeScopes(frame);
            setSummary(latest.current.stats);
            setError('');
          }
        } catch {
          previous = null;
          latest.current = null;
          setError('This viewer frame could not be read.');
        }
      }
      if (rect?.width > 0 && rect?.height > 0 && !document.hidden) paint();
      timer = window.setTimeout(update, 125);
    };
    update();
    const resize = new ResizeObserver(() => paint(true));
    resize.observe(panel.current);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      resize.disconnect();
    };
  }, [sourceRef]);
  return (
    <section ref={panel} class={`video-scopes${mode === 'all' ? ' four-up' : ''}`} aria-label="Video scopes">
      <header class="scopes-toolbar">
        <b>Video scopes</b>
        <select
          class="select"
          aria-label="Scope layout"
          value={mode}
          onChange={(e) => setPrefs({ videoScopesMode: e.currentTarget.value })}
        >
          {SCOPE_TYPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label class="scope-gain" title="Trace brightness, without changing the measured signal">
          Gain{' '}
          <input
            aria-label="Scope trace gain"
            type="range"
            min="0.5"
            max="6"
            step="0.5"
            value={gain}
            onInput={(e) => setPrefs({ videoScopesGain: Number(e.currentTarget.value) })}
          />
        </label>
        {(mode === 'all' || mode === 'histogram') && (
          <label class="scope-check">
            <input
              type="checkbox"
              checked={log}
              onChange={(e) => setPrefs({ videoScopesLog: e.currentTarget.checked })}
            />
            Log
          </label>
        )}
        {(mode === 'all' || mode === 'vectorscope') && (
          <label class="scope-check" title="Approximate skin-hue direction; not a target for every skin tone">
            <input
              type="checkbox"
              checked={skin}
              onChange={(e) => setPrefs({ videoScopesSkin: e.currentTarget.checked })}
            />
            Skin guide
          </label>
        )}
        <IconButton
          icon={held ? Play : Pause}
          title={held ? 'Resume video scopes' : 'Hold video scopes'}
          active={held}
          aria-pressed={held}
          onClick={() => setHeld(!held)}
        />
        <IconButton icon={X} title="Close video scopes" onClick={onClose} />
      </header>
      <div class="scopes-plots">
        {modes.map((type) => (
          <div class="scope-plot" key={type}>
            <h4>{TITLES[type]}</h4>
            <canvas ref={(el) => (plots.current[type] = el)} role="img" aria-label={TITLES[type]} />
          </div>
        ))}
      </div>
      <footer class="scopes-footer">
        <span title="Sampled 8-bit display signal after grading, effects and compositing. HDR is measured after conversion to the viewer, not as raw HDR or nits.">
          {held ? 'Held · ' : ''}SDR viewer signal · sampled · 0–100%
        </span>
        {error ? (
          <span role="status">{error}</span>
        ) : (
          summary && (
            <span title="The fraction of sampled pixels where any RGB channel reaches code value 0 or 255; this alone does not prove clipping in the original source.">
              Y′ {(summary.min * 100).toFixed(1)}–{(summary.max * 100).toFixed(1)}% · RGB at 255:{' '}
              {(summary.high * 100).toFixed(1)}%
            </span>
          )
        )}
      </footer>
    </section>
  );
}
