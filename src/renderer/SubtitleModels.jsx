import { useState } from 'preact/hooks';
import { Button, Modal, Row, Section, Select } from './ui.jsx';
import { modelAction, modelBytes, useSubtitleModels } from './subtitleModels.js';
import './styles/subtitle-models.css';

const labels = { 'not-installed': 'Not installed', downloading: 'Downloading', installing: 'Installing', installed: 'Installed', active: 'Active', failed: 'Failed', unsupported: 'Unsupported on this device' };

export function LocalSubtitleModels() {
  const state = useSubtitleModels(), [manager, setManager] = useState(false);
  const active = state?.models.find(m => m.id === state.active);
  return <>
    <Section title="LOCAL SUBTITLE MODELS" collapsible={false}>
      <p class="hint">Generate subtitles locally using free AI models. Download additional models to improve accuracy or performance. All transcription runs on your computer.</p>
      <Row label="Active subtitle model" stacked>
        <Select value={state?.active || ''} disabled={!state?.models.some(m => m.usable)} options={[
          ...(!state?.active ? [{ value: '', label: state ? 'Install a subtitle model to get started' : 'Checking installed models…' }] : []),
          ...(state?.models.filter(m => m.usable).map(m => ({ value: m.id, label: `${m.name} — Installed` })) || []),
        ]} onChange={id => modelAction('selectSubtitleModel', id)} />
      </Row>
      {active && <p class="hint">{active.description}</p>}
      <div class="subtitle-model-summary"><Button onClick={() => setManager(true)}>Manage Models</Button><span class="hint">Storage used: {state ? modelBytes(state.storageBytes) : 'Checking…'}</span></div>
    </Section>
    {manager && <SubtitleModelManager state={state} onClose={() => setManager(false)} />}
  </>;
}

export function SubtitleModelManager({ state, onClose }) {
  const [pending, setPending] = useState(new Set());
  const action = async (method, id) => {
    setPending(old => new Set([...old, id]));
    try { await modelAction(method, id); }
    finally { setPending(old => new Set([...old].filter(value => value !== id))); }
  };
  return <Modal title="Subtitle Model Manager" width={710} class="subtitle-model-manager" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
    <p class="hint">Install once, then transcribe offline. Speed and quality are estimates; results depend on your computer, language and audio.</p>
    {state && <p class="hint">{state.hardware.backend} · {state.hardware.ramGB} GB RAM · Storage used: {modelBytes(state.storageBytes)}</p>}
    {!state && <p class="hint">Checking installed models…</p>}
    <div class="subtitle-model-list">{state?.models.map(m => {
      const busy = ['downloading', 'installing'].includes(m.status), locked = pending.has(m.id);
      const progress = m.totalBytes ? Math.min(100, 100 * (m.downloadedBytes || 0) / m.totalBytes) : 0;
      return <article key={m.id} class={`subtitle-model-card${state.active === m.id ? ' active' : ''}`}>
        <div class="subtitle-model-heading"><h3>{m.name}</h3><div class="subtitle-model-badges">
          {m.bundled && <span>Default · protected</span>}{m.recommended && <span>Recommended</span>}
          <span class={m.status === 'active' ? 'active' : ''}>{labels[m.status]}</span>
        </div></div>
        <p class="hint">{modelBytes(m.downloadSizeBytes)} download{m.installed ? ` · ${modelBytes(m.installedSizeBytes)} installed` : ''} · Multilingual ({m.supportedLanguages.length} languages, including Norwegian)</p>
        <p>{m.recommendedFor}</p>
        <dl><div><dt>Estimated speed</dt><dd>{m.speedCategory}</dd></div><div><dt>Estimated quality</dt><dd>{m.qualityCategory}</dd></div><div><dt>Strengths</dt><dd>{m.strengths}</dd></div><div><dt>Limitations</dt><dd>{m.weaknesses}</dd></div></dl>
        <p class="hint">Requires at least {m.minimumRequirements.ramGB} GB system RAM. {m.minimumRequirements.ramGB >= 8 && 'Substantial memory and processing power required.'}</p>
        <details><summary>Languages, source and license</summary><p class="hint">{m.supportedLanguages.join(', ')}</p><p class="hint">{m.repository} · MIT · ONNX Q8 · revision {m.version.slice(0, 12)}</p></details>
        {busy && <div class="subtitle-model-progress" role="status" aria-live="polite"><progress max="100" value={progress} aria-label={`${m.name} download progress`} /><p class="hint">{m.status === 'installing' ? 'Verifying and installing…' : `${progress.toFixed(1)}% · ${modelBytes(m.downloadedBytes || 0)} / ${modelBytes(m.totalBytes)}${m.bytesPerSecond ? ` · ${modelBytes(m.bytesPerSecond)}/s` : ''}`}</p></div>}
        {m.error && <p class="subtitle-model-error" role="alert">{m.error}</p>}
        <div class="subtitle-model-actions">
          {busy ? <Button disabled={locked} onClick={() => action('cancelSubtitleModel', m.id)}>Cancel</Button> : m.installed ? <>
            {state.active !== m.id && <Button variant="primary" disabled={locked || !m.usable} onClick={() => action('selectSubtitleModel', m.id)}>Use this model</Button>}
            {m.removable && <Button disabled={locked || state.active === m.id || m.inUse} title={state.active === m.id ? 'Select another model before deleting.' : m.inUse ? 'A transcription is using this model.' : 'Delete this model'} onClick={() => action('removeSubtitleModel', m.id)}>Delete</Button>}
          </> : <Button variant="primary" disabled={locked || m.status === 'unsupported'} onClick={() => action('downloadSubtitleModel', m.id)}>{m.status === 'failed' ? 'Retry' : 'Download'}</Button>}
          {m.inUse && <span class="hint">In use by a transcription</span>}
          {state.active === m.id && m.removable && <span class="hint">Select another model before deleting.</span>}
        </div>
      </article>;
    })}</div>
  </Modal>;
}
