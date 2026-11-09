// KI-modellene i Reccut, samlet ett sted. Ingen av dem følger med installasjonsfilen.
// Vinduet vises ved første oppstart (velg hva du vil laste ned), når en funksjon mangler sin
// modell (teksting, fjerne bakgrunn eller AI-stemmer), og fra Settings → AI.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { AudioWaveform, Captions, Check, Download, Loader2, Scissors, Sparkles, Trash2, X } from 'lucide-preact';
import { corridorKeyConsent, corridorKeyStatus, refreshCorridorKey } from './CorridorKeyAddon.jsx';
import { Button, IconButton, Modal, Select } from './ui.jsx';
import { prefs, setPrefs } from './prefs.js';
import { modelAction, modelBytes, subtitleModels } from './subtitleModels.js';
import { tasks } from './editor/store.js';
import { refreshTts, scriptLanguage, tts } from './voiceover/booth.js';
import { piperFor } from './voiceover/piper.js';
import { LANGUAGES, languageById } from '../shared/tts.js';

const api = window.api;

// { focus: 'captions' | 'background' | 'voices' | null, firstRun, reason }
export const aiModelsOpen = signal(null);
export const openAiModels = (focus = null, reason = '') => (aiModelsOpen.value = { focus, reason, firstRun: false });

export const backgroundModels = signal([]);
const refreshBackground = () => api.backgroundModels().then((list) => (backgroundModels.value = list)).catch(() => {});
api.onBackgroundModelsChanged?.((list) => (backgroundModels.value = list));

// Feil fra en funksjon som mangler modellen sin, åpner vinduet i stedet for en feilmelding.
// Gir true når feilen ble tatt hånd om.
export function handleMissingModel(error) {
  const m = /MODEL_MISSING:(\w+)/.exec(String(error?.message || error || ''));
  if (!m) return false;
  const reasons = {
    captions: 'Captions are made by a speech model that runs on your computer. Download one to continue.',
    background: 'Removing backgrounds uses a model that runs on your computer. Download one to continue.',
    voices: 'AI voices need the voice model. Download it to continue.',
  };
  openAiModels(m[1], reasons[m[1]] || '');
  return true;
}

// Språket på maskinen, som forslag til stemmer (nb for norsk bokmål og nynorsk).
function systemLanguage() {
  const l = String(navigator.language || 'en-US').toLowerCase();
  if (/^(nb|nn|no)\b/.test(l)) return 'nb';
  if (l.startsWith('en-gb')) return 'en-gb';
  if (l.startsWith('pt-br')) return 'pt-br';
  const short = l.split('-')[0];
  return LANGUAGES.some((x) => x.id === short) ? short : 'en-us';
}

// Første oppstart: spør én gang, etter at prosjektet er valgt.
export function maybeAskFirstRun() {
  if (prefs.value.aiModelsAsked || aiModelsOpen.value) return;
  aiModelsOpen.value = { focus: null, firstRun: true, reason: '' };
}

const GROUPS = [
  {
    id: 'captions',
    icon: Captions,
    title: 'Captions and transcripts',
    use: 'Turns speech into text: automatic captions in Edit, and the transcripts the AI agent uses to find takes and cut on words.',
  },
  {
    id: 'background',
    icon: Scissors,
    title: 'Remove backgrounds',
    use: 'Cuts people and objects out of images in Design, for thumbnails and cut outs.',
  },
  {
    id: 'keying',
    icon: Sparkles,
    title: 'Green screen keying',
    use: 'Removes green and blue screens from video with clean hair, motion blur and see-through edges. The color key in Effects works without it; this is for harder shots.',
  },
  {
    id: 'voices',
    icon: AudioWaveform,
    title: 'AI voices',
    use: 'Reads a script aloud in the Voice Over Studio, when you want a voice over without recording one yourself. Kokoro has many English voices and styles. For Norwegian, Swedish, Danish, German and other languages, download the voices made for that language.',
  },
];

// Samme sjekk som arbeidsvinduet for bakgrunn: WebGPU med nok lagringsbuffere.
async function hasGoodGpu() {
  try {
    const adapter = navigator.gpu && (await navigator.gpu.requestAdapter());
    return Boolean(adapter && adapter.limits.maxStorageBuffersPerShaderStage >= 8);
  } catch {
    return false;
  }
}

export function AiModelsDialog() {
  const state = aiModelsOpen.value;
  const subs = subtitleModels.value;
  const bg = backgroundModels.value;
  const t = tts.value;
  const [picked, setPicked] = useState(() => new Set());
  const [voiceLang, setVoiceLang] = useState(() => scriptLanguage.value || systemLanguage());
  useEffect(() => {
    modelAction('subtitleModels');
    refreshBackground();
    refreshTts();
    refreshCorridorKey();
  }, []);
  // Forslag ved første oppstart: det minste som dekker teksting og bakgrunn. AI-stemmer velges selv.
  const [gpuOk, setGpuOk] = useState(null);
  useEffect(() => {
    hasGoodGpu().then(setGpuOk);
  }, []);
  useEffect(() => {
    if (!state?.firstRun || !subs || !bg.length || gpuOk == null || picked.size) return;
    const next = new Set();
    const base = subs.models.find((m) => m.id === 'whisper-base' && !m.installed && m.status !== 'unsupported');
    if (base && !subs.models.some((m) => m.installed)) next.add('sub:whisper-base');
    const choice = bg.find((m) => m.gpu === gpuOk && !m.installed) || null;
    if (choice && !bg.some((m) => m.installed)) next.add(`bg:${choice.id}`);
    setPicked(next);
  }, [subs, bg, gpuOk]);

  const close = () => {
    if (state?.firstRun) setPrefs({ aiModelsAsked: true });
    aiModelsOpen.value = null;
  };
  const toggle = (key) => setPicked((old) => (old.has(key) ? new Set([...old].filter((k) => k !== key)) : new Set([...old, key])));
  const download = async (key) => {
    const [kind, id] = key.split(/:(.*)/s);
    try {
      if (kind === 'sub') await modelAction('downloadSubtitleModel', id);
      if (kind === 'bg') await api.downloadBackgroundModel(id).then((list) => (backgroundModels.value = list));
      if (kind === 'tts') await api.ttsInstall().then(refreshTts);
      if (kind === 'piper') await api.ttsPiperInstall(id).then(refreshTts);
    } catch {}
  };
  const downloadPicked = () => {
    for (const key of picked) download(key);
    setPrefs({ aiModelsAsked: true });
    setPicked(new Set());
    if (state?.firstRun) aiModelsOpen.value = null;
  };

  const jobFor = (re) => tasks.value.find((x) => x.kind === 'download' && re.test(x.title) && (x.state === 'running' || x.state === 'queued'));
  const rows = {
    captions: (subs?.models || [])
      .filter((m) => m.status !== 'unsupported')
      .slice(0, 4)
      .map((m) => ({
        key: `sub:${m.id}`,
        name: m.name,
        detail: String(m.description || m.recommendedFor || '').replace(new RegExp(`^${m.name}:\\s*`), ''),
        size: m.downloadSizeBytes,
        installed: m.installed,
        busy: ['downloading', 'installing'].includes(m.status),
        progress: m.totalBytes ? (m.downloadedBytes || 0) / m.totalBytes : 0,
        remove: m.installed && m.removable ? () => modelAction('removeSubtitleModel', m.id) : null,
        cancel: () => modelAction('cancelSubtitleModel', m.id),
      })),
    background: bg.map((m) => ({
      key: `bg:${m.id}`,
      name: m.label,
      detail: m.description,
      size: m.sizeBytes,
      installed: m.installed,
      busy: m.downloading || Boolean(jobFor(new RegExp(m.label.replace(/[()]/g, '.')))),
      progress: m.progress,
      remove: m.installed ? () => api.removeBackgroundModel(m.id).then((list) => (backgroundModels.value = list)) : null,
      cancel: () => api.cancelBackgroundModel(m.id),
    })),
    keying: [
      {
        key: 'ck:corridorkey',
        name: 'CorridorKey (Corridor Digital)',
        detail: 'Needs Apple Silicon or an NVIDIA graphics card, and is slow: seconds per frame. Its own licence (CC BY-NC-SA 4.0 with extra terms) must be accepted before it is downloaded. Remove it from the Plugins list.',
        size: corridorKeyStatus.value?.needed || 8 * 1024 ** 3,
        installed: Boolean(corridorKeyStatus.value?.installed),
        consent: true,
        unsupported: corridorKeyStatus.value && !corridorKeyStatus.value.supported,
      },
    ],
    voices: [
      {
        key: 'tts:kokoro',
        name: 'Kokoro voices',
        detail: '41 voices for English, Spanish, French, Italian, Portuguese and Hindi, and accented reading in Norwegian, Swedish, Danish, German and more. Includes a pronunciation add-on (eSpeak NG, GPL) from npm.',
        size: t.sizeBytes || 116e6,
        installed: t.installed,
        busy: t.downloading || Boolean(jobFor(/AI voices/)),
        progress: jobFor(/AI voices/)?.progress ?? t.progress,
        remove: t.installed ? () => api.ttsRemove().then(refreshTts) : null,
        cancel: () => api.ttsCancel(),
      },
      // Stemmer laget for språket som er valgt (Piper), hver for seg.
      ...piperFor(voiceLang).map((v) => {
        const st = t.piper?.[v.id] || {};
        return {
          key: `piper:${v.id}`,
          name: `${v.name} (${languageById(v.lang)?.label})`,
          detail: `A voice made for ${languageById(v.lang)?.label}${v.gender ? `, ${v.gender.toLowerCase()}` : ''}${v.speakers.length ? `, with ${v.speakers.length} ${v.id.includes('emotional') ? 'emotions' : 'voices'}` : ''}. Licence ${v.license}.`,
          size: v.sizeBytes,
          installed: st.installed,
          busy: st.downloading,
          progress: st.progress,
          remove: st.installed ? () => api.ttsPiperRemove(v.id).then(refreshTts) : null,
          cancel: () => api.ttsPiperCancel(v.id),
        };
      }),
    ],
  };
  const total = [...picked].reduce((s, key) => s + (Object.values(rows).flat().find((r) => r.key === key)?.size || 0), 0);
  const groups = state?.focus ? [...GROUPS.filter((g) => g.id === state.focus), ...GROUPS.filter((g) => g.id !== state.focus)] : GROUPS;

  return (
    <Modal
      title={state?.firstRun ? 'AI Models (Optional)' : 'AI Models'}
      onClose={close}
      width={680}
      class="ai-models"
      footer={
        <>
          {picked.size > 0 && <span class="dim ai-models-total">{modelBytes(total)} selected</span>}
          <Button onClick={close}>{state?.firstRun ? 'Not Now' : 'Done'}</Button>
          {picked.size > 0 && (
            <Button variant="primary" icon={Download} onClick={downloadPicked}>
              Download Selected
            </Button>
          )}
        </>
      }
    >
      {state?.reason && <p class="ai-models-reason">{state.reason}</p>}
      <p class="hint">
        {state?.firstRun ? 'Reccut has a few features that use AI models. ' : ''}The models run on your computer, are free and need no account. They are not part of the installer, so download only what you need. Your media and scripts never leave the computer. You can change this any time in Settings → AI.
      </p>
      {groups.map((g) => (
        <section key={g.id} class={`ai-models-group${state?.focus === g.id ? ' focus' : ''}`}>
          <header>
            <g.icon size={16} />
            <div>
              <b>{g.title}</b>
              <p>{g.use}</p>
              {g.id === 'voices' && (
                <label class="ai-models-lang">
                  Voices for
                  <Select value={voiceLang} options={LANGUAGES.filter((l) => piperFor(l.id).length || l.voices).map((l) => ({ value: l.id, label: l.label }))} onChange={setVoiceLang} />
                </label>
              )}
              {g.id === 'captions' && <p class="dim">Whisper understands about 100 languages, Norwegian, Swedish, Danish, German and Spanish included. Larger models are more accurate, especially for Norwegian.</p>}
            </div>
          </header>
          <ul>
            {rows[g.id].map((r) => (
              <li key={r.key} class={r.installed ? 'installed' : ''}>
                {r.installed ? (
                  <Check size={14} class="ok" />
                ) : r.consent ? (
                  <span class="ai-models-spacer" />
                ) : (
                  <input type="checkbox" checked={picked.has(r.key)} disabled={r.busy} onChange={() => toggle(r.key)} aria-label={`Download ${r.name}`} />
                )}
                <div class="ai-models-name">
                  <b>{r.name}</b>
                  {r.detail && <span class="dim">{r.detail}</span>}
                </div>
                <span class="dim ai-models-size">{r.consent ? `about ${modelBytes(r.size)}` : modelBytes(r.size)}</span>
                {r.busy ? (
                  <span class="ai-models-busy">
                    <Loader2 size={13} class="spin" /> {Math.round((r.progress || 0) * 100)} %
                    <IconButton icon={X} size={12} title="Cancel" onClick={r.cancel} />
                  </span>
                ) : r.installed ? (
                  r.remove && <IconButton icon={Trash2} size={13} title="Remove from this computer" onClick={r.remove} />
                ) : r.consent ? (
                  <Button
                    class="small"
                    disabled={r.unsupported}
                    onClick={() => {
                      aiModelsOpen.value = null;
                      corridorKeyConsent.value = true;
                    }}
                    title="Read what it is, what it needs and its licence before anything is downloaded"
                  >
                    {r.unsupported ? 'Not available here' : 'Read and Install…'}
                  </Button>
                ) : (
                  <Button class="small" icon={Download} onClick={() => download(r.key)}>
                    Download
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
