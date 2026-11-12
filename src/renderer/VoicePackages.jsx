import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, Download, Loader2, Play, Search, Square, Trash2, X } from 'lucide-preact';
import catalog from '../main/ttsCatalog.json';
import { installVoicePackages, selectedVoicePackages, suggestedVoicePackages, voicePackageBytes, voicePackageRows } from '../shared/voicePackages.js';
import { Button, IconButton, Modal, Select, toast } from './ui.jsx';
import { modelBytes } from './subtitleModels.js';
import { tasks } from './editor/store.js';
import { audioSink } from './prefs.js';
import { refreshTts, tts, voicePackageRequests, voicePackagesOpen } from './voicePackages.js';

const api = window.api;
export function VoicePackages({ lang = null, onDone = null, firstRun = false }) {
  const state = tts.value, rows = voicePackageRows(catalog, state);
  const [picked, setPicked] = useState(new Set()), [query, setQuery] = useState('');
  const [samples, setSamples] = useState({}), [playing, setPlaying] = useState(null);
  const [offerModelRemoval, setOfferModelRemoval] = useState(false);
  const touched = useRef(false), audio = useRef(null);
  useEffect(() => {
    let alive = true;
    api.voicePackagesMarkAsked().catch(() => {});
    Promise.all([refreshTts(), api.voicePackagesStatus()]).then(([s, context]) => {
      if (alive && !touched.current) setPicked(suggestedVoicePackages(voicePackageRows(catalog, s), [lang, context.systemLanguage, context.appLanguage]));
    }).catch(() => {});
    return () => { alive = false; audio.current?.pause(); };
  }, []);
  const selected = selectedVoicePackages(rows, picked), selectedKeys = new Set(selected.map((r) => r.key));
  const bytes = voicePackageBytes(rows, picked, catalog, state);
  const busyJobs = tasks.value.filter((j) => j.kind === 'download' && ['queued', 'running'].includes(j.state));
  const busy = (r) => voicePackageRequests.value.has(r.key) || busyJobs.some((j) => j.packageKey === r.key) ||
    (r.key === 'kokoro' && state.downloading) || (r.engine === 'piper' && state.piper?.[r.voice]?.downloading) ||
    (r.engine === 'voxcpm' && state.voxcpm?.downloading);
  const toggle = (row) => {
    touched.current = true;
    setPicked((old) => {
      const next = new Set(old);
      if (selectedKeys.has(row.key)) {
        next.delete(row.key);
        for (const r of rows) if (r.dependency === row.key) next.delete(r.key);
      } else next.add(row.key);
      return next;
    });
  };
  const preview = async (row) => {
    audio.current?.pause();
    if (playing === row.key) { setPlaying(null); return; }
    const sample = row.samples?.[samples[row.key] || 0];
    if (!sample) return;
    const player = new Audio(new URL(`voice-samples/${sample.path}`, location.href).href);
    audio.current = player;
    player.onended = () => audio.current === player && setPlaying(null);
    setPlaying(row.key);
    try { await player.setSinkId?.(audioSink.value); await player.play(); }
    catch { if (audio.current === player) { setPlaying(null); toast('Could not play this voice sample.', { kind: 'error' }); } }
  };
  const download = () => {
    const choices = new Set(selected.filter((r) => !busy(r)).map((r) => r.key));
    if (!choices.size) return;
    touched.current = true;
    voicePackageRequests.value = new Set([...voicePackageRequests.value, ...choices]);
    // The model is part of each language job, so it needs no separate pending row.
    if (selected.some((r) => r.lang && r.engine === 'voxcpm')) voicePackageRequests.value = new Set([...voicePackageRequests.value].filter((key) => key !== 'voxcpm:model'));
    installVoicePackages(api, rows, choices, {
      onError: (row, error) => { if (!/canceled/i.test(error.message)) toast(`${row.name}: ${error.message}`, { kind: 'error', timeout: 9000 }); },
      onSettled: (row) => { voicePackageRequests.value = new Set([...voicePackageRequests.value].filter((key) => key !== row.key)); },
      refresh: refreshTts,
    });
    setPicked(new Set());
    onDone?.();
  };
  const remove = async (row) => {
    try {
      if (row.engine === 'kokoro') await api.ttsRemove();
      else if (row.engine === 'piper') await api.ttsPiperRemove(row.voice);
      else if (row.lang) await api.ttsVoxcpmRemoveLanguage(row.lang);
      else await api.ttsVoxcpmRemoveModel();
      const s = await refreshTts();
      if (row.engine === 'voxcpm' && row.lang && s?.voxcpm?.installed && !Object.values(s.voxcpm.languages).some((l) => l.installed)) setOfferModelRemoval(true);
    } catch (error) { toast(error.message, { kind: 'error' }); }
  };
  const shown = rows.filter((r) => !query.trim() || `${r.name} ${r.use} ${r.languages.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div class="voice-packages">
      <p class="hint">Voice packages read scripts aloud in the Voice Over Studio. They run on this computer, free and without an account. Your script stays here. Listen first, then download only the packages you want.</p>
      <label class="search voice-packages-search"><Search size={14} /><input type="search" aria-label="Search voice packages" placeholder="Search language or voice" value={query} onInput={(e) => setQuery(e.currentTarget.value)} /></label>
      <ul class="voice-package-list">
        {shown.map((row) => {
          const job = busyJobs.find((j) => j.packageKey === row.key), pending = busy(row);
          const progress = job?.progress ?? (row.engine === 'voxcpm' ? state.voxcpm?.progress : row.engine === 'piper' ? state.piper?.[row.voice]?.progress : state.progress) ?? 0;
          return (
            <li key={row.key} class={`voice-package${row.installed ? ' installed' : ''}`}>
              <div class="voice-package-choice">
                {row.installed ? <Check size={16} class="ok" aria-label="Installed" /> : <input type="checkbox" aria-label={`Download ${row.name}`} checked={selectedKeys.has(row.key)} disabled={Boolean(row.unavailable) || pending} onChange={() => toggle(row)} />}
                <div class="voice-package-info">
                  <b>{row.name}</b><span>{row.use}</span><small>{row.detail}</small>
                  {row.unavailable && <small>{row.unavailable}</small>}
                  <small>{modelBytes(row.size)} · {row.license}</small>
                </div>
                {pending ? <span class="ai-models-busy"><Loader2 size={14} class="spin" />{job?.state === 'queued' || !job ? 'Waiting' : `${Math.round(progress * 100)} %`}
                  {job && <IconButton icon={X} size={13} title={`Cancel ${row.name}`} onClick={() => api.cancelTask(job.id)} />}</span>
                  : row.installed && <IconButton icon={Trash2} size={14} title={`Remove ${row.name}`} onClick={() => remove(row)} />}
              </div>
              {row.samples?.length > 0 && <div class="voice-package-sample">
                {row.samples.length > 1 && <Select title={`Sample for ${row.name}`} value={samples[row.key] || 0} options={row.samples.map((s, i) => ({ value: i, label: s.name }))} onChange={(v) => { audio.current?.pause(); setPlaying(null); setSamples({ ...samples, [row.key]: Number(v) }); }} />}
                <Button class="small" icon={playing === row.key ? Square : Play} onClick={() => preview(row)}>{playing === row.key ? 'Stop' : 'Listen'}</Button>
                <span class="dim">No download needed</span>
              </div>}
            </li>
          );
        })}
        {!shown.length && <li class="hint">No voice packages match “{query}”.</li>}
      </ul>
      <p class="hint">Kokoro and Piper share one pronunciation add-on: {modelBytes(catalog.phonemizer.size)}, eSpeak NG (GPL), downloaded from npm. It is counted once in the total. Selecting a VoxCPM2 language also selects its shared model.</p>
      {offerModelRemoval && <div class="voice-package-offer"><p>The last VoxCPM2 voice package was removed. Also remove its shared {modelBytes(state.voxcpm?.sizeBytes || 0)} model?</p><Button class="small" onClick={() => setOfferModelRemoval(false)}>Keep model</Button><Button class="small" onClick={async () => { await remove(rows.find((r) => r.key === 'voxcpm:model')); setOfferModelRemoval(false); }}>Remove model</Button></div>}
      <div class="voice-packages-actions">
        <span class="dim" role="status">{selected.length ? `${modelBytes(bytes)} selected` : 'Nothing selected'}</span>
        {onDone && <Button onClick={onDone}>{firstRun ? 'Not now' : 'Done'}</Button>}
        <Button variant="primary" icon={Download} disabled={!selected.length || selected.every(busy)} onClick={download}>Download selected</Button>
      </div>
    </div>
  );
}

export function VoicePackagesDialog() {
  const state = voicePackagesOpen.value;
  const close = () => { voicePackagesOpen.value = null; };
  return <Modal title="Voice Packages" onClose={close} width={700} class="voice-packages-dialog">
    {state?.reason && <p class="ai-models-reason">{state.reason}</p>}
    <VoicePackages lang={state?.lang} firstRun={state?.firstRun} onDone={close} />
  </Modal>;
}
