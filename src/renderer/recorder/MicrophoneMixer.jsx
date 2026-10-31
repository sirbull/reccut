import { useEffect, useRef } from 'preact/hooks';
import { RotateCcw } from 'lucide-preact';
import { Button, Modal, Toggle } from '../ui.jsx';
import { settings } from './settings.js';
import * as engine from './engine.js';
import { FLAT_MIX, MIC_PRESETS, meterDb, meterPercent } from './mixer.js';

export function GainControl({ label = 'Input gain', value, min = -24, max = 24, reset = 0, onChange, disabled, unit = 'dB' }) {
  return <div class="mic-gain-control">
    <div class="mic-control-heading">
      <span>{label}</span>
      <label class="mic-number">
        <input type="number" aria-label={`${label} value`} min={min} max={max} step="0.5" value={value} disabled={disabled}
          onInput={(e) => { if (e.currentTarget.value !== '' && Number.isFinite(e.currentTarget.valueAsNumber)) onChange(Math.min(max, Math.max(min, e.currentTarget.valueAsNumber))); }} />
        <span>{unit}</span>
      </label>
    </div>
    <input class="mic-slider" type="range" aria-label={label} min={min} max={max} step="0.5" value={value} disabled={disabled}
      style={{ '--position': `${(value - min) / (max - min) * 100}%` }} title="Double click to reset"
      onInput={(e) => onChange(e.currentTarget.valueAsNumber)} onDblClick={() => onChange(reset)} />
    <div class="mic-range-labels"><span>{min}{unit === 'dB' ? ' dB' : ''}</span><span>{unit === 'dB' && min < 0 && max > 0 ? '0' : ''}</span><span>{max > 0 && unit === 'dB' ? '+' : ''}{max}{unit === 'dB' ? ' dB' : ''}</span></div>
  </div>;
}

function LevelMeter({ label, value, held }) {
  return <div class={`mic-level${value >= -0.5 ? ' clipping' : ''}`}>
    <div class="mic-control-heading"><span>{label}</span><output>{meterDb(value)}</output></div>
    <div class="mic-meter-track" role="meter" aria-label={label} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.min(0, Math.max(-60, Number.isFinite(value) ? value : -60))} aria-valuetext={meterDb(value)}>
      <div class="mic-meter-fill" style={{ clipPath: `inset(0 ${100 - meterPercent(value)}% 0 0)` }} />
      {held != null && Number.isFinite(held) && <i style={{ left: `${Math.min(99.5, meterPercent(held))}%` }} />}
    </div>
    <div class="mic-meter-scale">{[-60, -48, -36, -24, -12, 0].map((db) => <span key={db}>{db}</span>)}</div>
  </div>;
}

export function MicrophoneMixer({ onClose }) {
  const mix = settings.value.micMixer;
  const levels = engine.micLevels.value;
  const preset = MIC_PRESETS.find((p) => Object.keys(FLAT_MIX).every((key) => p.mix[key] === mix[key]))?.id || 'custom';
  const root = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.querySelector('select')?.focus();
    return () => previous?.isConnected && previous.focus();
  }, []);
  const clipped = levels.input >= -0.5 || levels.output >= -0.5;
  return <Modal title="Microphone mixer" onClose={onClose} width={650} class="mic-mixer"
    footer={<><span class="mic-autosaved">Changes are saved automatically</span><Button icon={RotateCcw} onClick={() => engine.setMicMix(FLAT_MIX)}>Reset to Flat</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
    <div ref={root} role="group" aria-label="Microphone mixer">
      <div class="mic-mixer-top">
        <div><strong>{engine.mics.value.find((m) => m.id === settings.value.micId)?.label || 'Microphone'}</strong><p class="hint">Shape your microphone sound before recording.</p></div>
        <select class="select" aria-label="Microphone preset" value={preset} onChange={(e) => { const p = MIC_PRESETS.find((p) => p.id === e.currentTarget.value); if (p) engine.setMicMix(p.mix); }}>
          {preset === 'custom' && <option value="custom">Custom</option>}
          {MIC_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div class="mic-mixer-card mic-live-levels">
        <LevelMeter label="Input · before gain" value={levels.input} />
        <LevelMeter label="Output · recorded signal" value={levels.output} held={levels.held} />
        <div class="mic-level-summary"><span>Average <b>{meterDb(levels.rms)}</b></span><span>Peak hold <b>{meterDb(levels.held)}</b></span><span>Compression <b>{Math.abs(levels.reduction).toFixed(1)} dB</b></span></div>
        <p class={`hint${clipped ? ' warn' : ''}`}>{levels.input >= -0.5 ? 'Input is clipping. Lower the microphone input level on your device.' : levels.output >= -0.5 ? 'Output is too loud. Lower gain or EQ, or enable the compressor.' : 'Aim for speech peaks between −18 and −6 dBFS. The white mark holds the output peak briefly.'}</p>
      </div>
      <div class="mic-mixer-card"><GainControl value={mix.gain} onChange={(gain) => engine.setMicMix({ gain })} /><p class="hint">0 dB keeps the original level. Gain changes the recorded microphone signal.</p></div>
      <div class="mic-mixer-card">
        <div class="mic-control-heading"><h3>Equalizer</h3><label class="mic-toggle-label">Low cut · 80 Hz <Toggle checked={mix.highpass} onChange={(highpass) => engine.setMicMix({ highpass })} /></label></div>
        <div class="mic-eq-controls">{[['low', 'Low · 180 Hz'], ['mid', 'Mid · 1.5 kHz'], ['high', 'High · 5 kHz']].map(([key, label]) => <GainControl key={key} label={label} value={mix[key]} min={-12} max={12} onChange={(value) => engine.setMicMix({ [key]: value })} />)}</div>
        <div class="mic-spectrum" role="img" aria-label="Live output frequency spectrum, 60 Hz to 16 kHz">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ height: `${Math.max(2, levels.spectrum[i] || 0)}%` }} />)}</div>
        <div class="mic-range-labels"><span>60 Hz</span><span>1 kHz</span><span>16 kHz</span></div>
      </div>
      <div class="mic-mixer-card">
        <div class="mic-control-heading"><h3>Compressor</h3><label class="mic-toggle-label">{mix.compressor ? 'On' : 'Off'} <Toggle checked={mix.compressor} onChange={(compressor) => engine.setMicMix({ compressor })} /></label></div>
        <p class="hint">Gently reduces louder passages for a more even voice level.</p>
        <div class="mic-compressor-controls"><GainControl label="Threshold" value={mix.threshold} min={-48} max={0} reset={FLAT_MIX.threshold} disabled={!mix.compressor} onChange={(threshold) => engine.setMicMix({ threshold })} /><GainControl label="Ratio" value={mix.ratio} min={1} max={12} unit=":1" reset={FLAT_MIX.ratio} disabled={!mix.compressor} onChange={(ratio) => engine.setMicMix({ ratio })} /></div>
      </div>
      <div class="mic-mixer-test"><p class="hint">Test records four seconds with these settings and plays them back.</p><Button disabled={!settings.value.micId || engine.recording.value || engine.countdown.value > 0 || engine.finishing.value || Boolean(engine.micTest.value)} onClick={engine.testMic}>{engine.micTest.value === 'recording' ? 'Speak now…' : engine.micTest.value === 'playing' ? 'Playing back…' : 'Test microphone'}</Button></div>
      {!settings.value.micId && <p class="hint warn">Choose a microphone in Sources to see live levels.</p>}
    </div>
  </Modal>;
}
