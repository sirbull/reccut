// AI-stemmer i Voice Over Studio: last ned Kokoro første gang, lytt til stemmene og legg en til som person.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { Download, Loader2, Play, Plus, Square, Trash2, X } from 'lucide-preact';
import { piperFor, speakerLabel } from './piper.js';
import { Button, IconButton, Modal, NumberField, Select, Slider } from '../ui.jsx';
import { tasks } from '../editor/store.js';
import { LANGUAGES, VOICES, languageById, voiceLabel, voiceLanguage, voicesFor } from '../../shared/tts.js';
import { CHARACTERS, TONES, filterStyles, styleEffects } from '../../shared/voiceStyles.js';
import * as booth from './booth.js';

const api = window.api;
export const aiDialogOpen = signal(false);
export const openAiVoices = () => {
  booth.refreshTts();
  aiDialogOpen.value = true;
};

// Ferdige stiler: mørke og lyse, filmatiske og vanlige. Lytt for å høre stilen med effektene.
function StyleList({ lang, onAdd }) {
  const [tone, setTone] = useState('');
  const [character, setCharacter] = useState('');
  const [gender, setGender] = useState('');
  const list = filterStyles({ tone, character, gender });
  const english = languageById(lang)?.english;
  const chip = (value, set, current, label) => (
    <button key={label} class={current === value ? 'active' : ''} onClick={() => set(current === value ? '' : value)}>
      {label}
    </button>
  );
  return (
    <div class="ai-styles">
      <div class="ai-filters">
        <div class="segmented small">{TONES.map((t) => chip(t.value, setTone, tone, t.label))}</div>
        <div class="segmented small">{CHARACTERS.map((c) => chip(c.value, setCharacter, character, c.label))}</div>
        <div class="segmented small">{['Female', 'Male'].map((g) => chip(g, setGender, gender, g))}</div>
      </div>
      {!english && <p class="ai-note">The styles are built on English voices. In {languageById(lang).label} they keep their character, with an English accent.</p>}
      <ul class="ai-style-grid">
        {list.map((st) => {
          const playing = booth.sampling.value === `style:${st.id}`;
          const useLang = english ? st.lang : lang;
          return (
            <li key={st.id} class={`ai-style t-${st.tone}`}>
              <div class="ai-style-head">
                <b>{st.name}</b>
                <span class="ai-tags">
                  <span>{TONES.find((t) => t.value === st.tone).label}</span>
                  <span>{CHARACTERS.find((c) => c.value === st.character).label}</span>
                  <span>{st.gender}</span>
                </span>
              </div>
              <p>{st.desc}</p>
              <div class="ai-style-foot">
                <span class="dim" title={voiceLabel(st.voice)}>
                  {voiceLabel(st.voice)}, {st.speed.toFixed(2)}×
                </span>
                <div class="spacer" />
                <IconButton icon={playing ? Square : Play} size={14} title={playing ? 'Stop' : 'Listen, with the effects'} onClick={() => booth.previewVoice(st.voice, st.speed, useLang, { fx: styleEffects(st), key: `style:${st.id}` })} />
                <Button
                  class="small"
                  icon={Plus}
                  onClick={() => {
                    booth.addAiStyle(st.id, useLang);
                    onAdd();
                  }}
                >
                  Add
                </Button>
              </div>
            </li>
          );
        })}
        {!list.length && <li class="dim">No style matches all the filters.</li>}
      </ul>
    </div>
  );
}

const mb = (b) => `${Math.round(b / 1e6)} MB`;

export function AiVoiceDialog() {
  const t = booth.tts.value;
  const [speed, setSpeed] = useState(1);
  const [lang, setLang] = useState(() => booth.scriptLanguage.value || 'en-us');
  const [tab, setTab] = useState('styles');
  useEffect(() => {
    booth.refreshTts();
  }, []);
  const close = () => {
    booth.sampling.value = null;
    aiDialogOpen.value = false;
  };
  const native = piperFor(lang);
  const kokoroOwn = Boolean(languageById(lang)?.voices);
  const kokoroPart = !t.installed ? (
    <KokoroSetup collapsed={!kokoroOwn && native.length > 0} lang={lang} />
  ) : (
    <>
      {!kokoroOwn && (
        <p class="ai-note">
          {native.length ? `The Kokoro voices below are not made for ${languageById(lang).label}. They pronounce it, but with an accent.` : `Kokoro has no voices made for ${languageById(lang).label}. The words are pronounced in ${languageById(lang).label}, but the voice comes from another language, so it has an accent.`}
        </p>
      )}
      <div class="segmented ai-tabs">
        <button class={tab === 'styles' ? 'active' : ''} onClick={() => setTab('styles')}>
          Styles
        </button>
        <button class={tab === 'voices' ? 'active' : ''} onClick={() => setTab('voices')}>
          Voices
        </button>
      </div>
      {tab === 'styles' ? (
        <StyleList lang={lang} onAdd={close} />
      ) : (
        <>
          <VoiceList voices={voicesFor(lang).own} lang={lang} speed={speed} onAdd={close} title={voicesFor(lang).own.length ? `Made for ${languageById(lang).label}` : null} />
          <VoiceList voices={sortOther(voicesFor(lang).other, lang)} lang={lang} speed={speed} onAdd={close} title={voicesFor(lang).own.length ? 'Other voices, with an accent' : 'Voices from other languages'} collapsed={voicesFor(lang).own.length > 0} />
        </>
      )}
    </>
  );
  return (
    <Modal title="AI Voices" onClose={close} width={680} class="ai-voices">
      <div class="ai-pick">
        <p class="dim">The voices run on this computer, are free and need no account. The script never leaves your computer. Choose the language of the script first.</p>
        <div class="ai-pick-bar">
          <label class="vt-ctl" title="The language of the script. The voice reads it with this pronunciation.">
            Language
            <Select value={lang} options={LANGUAGES.map((l) => ({ value: l.id, label: `${l.label}${l.id === booth.scriptLanguage.value ? ', the script' : ''}` }))} onChange={setLang} />
          </label>
          <label class="vt-ctl ai-speed" title="Speaking speed for new voices. Below 1 is slower, which often suits voice over. Styles have their own speed.">
            Speed
            <Slider value={speed} min={0.5} max={1.5} step={0.01} center={1} onInput={setSpeed} />
            <NumberField value={speed} min={0.5} max={2} step={0.01} precision={2} unit="×" width={66} onChange={setSpeed} />
          </label>
        </div>
        {booth.scriptLanguage.value && booth.scriptLanguage.value !== lang && (
          <p class="ai-note">
            The script looks like {languageById(booth.scriptLanguage.value).label}.{' '}
            <button class="link" onClick={() => setLang(booth.scriptLanguage.value)}>
              Use {languageById(booth.scriptLanguage.value).label}
            </button>
          </p>
        )}
        {native.length > 0 && <PiperList lang={lang} speed={speed} onAdd={close} />}
        {kokoroPart}
        {t.installed && (
          <button class="link" onClick={() => api.ttsRemove().then(booth.refreshTts)}>
            Remove the Kokoro voices from this computer
          </button>
        )}
      </div>
    </Modal>
  );
}

// Kokoro er ikke lastet ned: hva det er og en knapp. Sammenslått når språket har egne Piper-stemmer.
function KokoroSetup({ collapsed, lang }) {
  const t = booth.tts.value;
  const [open, setOpen] = useState(!collapsed);
  const job = tasks.value.find((x) => x.kind === 'download' && /AI voices/.test(x.title) && (x.state === 'running' || x.state === 'queued'));
  const install = () => api.ttsInstall().then(booth.refreshTts).catch(() => booth.refreshTts());
  return (
    <div class="ai-voice-group">
      <button class="ai-voice-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        Kokoro voices <span class="dim">· {VOICES.length} voices and 17 styles, {mb(t.sizeBytes || 116e6)}</span>
      </button>
      {open && (
        <div class="ai-setup">
          <ul class="dim">
            <li>Voices made for English (US and UK), Spanish, French, Italian, Brazilian Portuguese and Hindi, and ready made styles from dark and cinematic to bright and lively. English sounds best.</li>
            <li>Other languages{languageById(lang)?.voices ? '' : `, like ${languageById(lang).label},`} are pronounced correctly but read with an accent. Use the voices made for the language above when there are any.</li>
            <li>Includes a pronunciation add-on (phonemizer.js with eSpeak NG, GPL), downloaded from npm and checked before use. The model is Apache 2.0.</li>
          </ul>
          {job || t.downloading ? (
            <div class="ai-progress">
              <Loader2 size={14} class="spin" />
              <span>Downloading {Math.round((job?.progress ?? t.progress ?? 0) * 100)} %</span>
              <div class="bar">
                <div style={{ width: `${Math.round((job?.progress ?? t.progress ?? 0) * 100)}%` }} />
              </div>
              <Button class="small" onClick={() => api.ttsCancel()}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant={collapsed ? 'secondary' : 'primary'} icon={Download} onClick={install}>
              Download Kokoro Voices
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Stemmer laget for språket (Piper). Hver lastes ned for seg, omtrent 63 MB.
function PiperList({ lang, speed, onAdd }) {
  const t = booth.tts.value;
  const [speakers, setSpeakers] = useState({});
  const voices = piperFor(lang);
  return (
    <div class="ai-voice-group">
      <div class="ai-voice-title">
        Voices made for {languageById(lang).label} <span class="dim">· download each one you want</span>
      </div>
      <ul class="ai-voice-list">
        {voices.map((v) => {
          const st = t.piper?.[v.id] || {};
          const speaker = speakers[v.id] ?? v.speakers[0] ?? '';
          const key = `piper:${v.id}:${speaker}`;
          const playing = booth.sampling.value === key;
          return (
            <li key={v.id}>
              {st.installed ? <IconButton icon={playing ? Square : Play} size={14} title={playing ? 'Stop' : 'Listen'} onClick={() => booth.previewVoice(v.id, speed, lang, { engine: 'piper', speaker, key })} /> : <span class="ai-models-spacer" />}
              <b>{v.name}</b>
              <span class="dim">{[v.gender, v.speakers.length ? `${v.speakers.length} voices` : '', v.license].filter(Boolean).join(', ')}</span>
              {v.speakers.length > 0 && (
                <Select value={speaker} options={v.speakers.map((s) => ({ value: s, label: speakerLabel(v, s) }))} onChange={(x) => setSpeakers({ ...speakers, [v.id]: x })} />
              )}
              <div class="spacer" />
              {st.downloading ? (
                <span class="ai-models-busy">
                  <Loader2 size={13} class="spin" /> {Math.round((st.progress || 0) * 100)} %
                  <IconButton icon={X} size={12} title="Cancel" onClick={() => api.ttsPiperCancel(v.id)} />
                </span>
              ) : st.installed ? (
                <>
                  <IconButton icon={Trash2} size={13} title="Remove this voice from the computer" onClick={() => api.ttsPiperRemove(v.id).then(booth.refreshTts)} />
                  <Button
                    class="small"
                    icon={Plus}
                    onClick={() => {
                      booth.addPiperPerson(v.id, speaker, speed);
                      onAdd();
                    }}
                  >
                    Add
                  </Button>
                </>
              ) : (
                <Button class="small" icon={Download} onClick={() => api.ttsPiperInstall(v.id).then(booth.refreshTts).catch(() => booth.refreshTts())} title={`Download ${v.name}, about ${mb(v.sizeBytes)}`}>
                  {mb(v.sizeBytes)}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Stemmene for andre språk: den som passer best først (near), så etter karakter.
const GRADES = ['A', 'A-', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F+', ''];
function sortOther(list, lang) {
  const near = languageById(lang)?.near;
  return [...list].sort((a, b) => (b.id === near) - (a.id === near) || GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
}

function VoiceList({ voices, lang, speed, onAdd, title, collapsed = false }) {
  const [open, setOpen] = useState(!collapsed);
  if (!voices.length) return null;
  return (
    <div class="ai-voice-group">
      {title && (
        <button class="ai-voice-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {title} <span class="dim">· {voices.length}</span>
        </button>
      )}
      {open && (
        <ul class="ai-voice-list">
          {voices.map((v) => {
            const playing = booth.sampling.value === v.id;
            const foreign = voiceLanguage(v.id).id !== lang;
            return (
              <li key={v.id}>
                <IconButton icon={playing ? Square : Play} size={14} title={playing ? 'Stop' : `Listen in ${languageById(lang).label}`} onClick={() => booth.previewVoice(v.id, speed, lang)} />
                <b>{v.name}</b>
                <span class="dim">
                  {v.gender}
                  {foreign ? `, ${voiceLanguage(v.id).label}` : ''}
                </span>
                {v.grade && !foreign && (
                  <span class={`ai-grade g${v.grade[0]}`} title="Quality grade from the Kokoro project. A is best.">
                    {v.grade}
                  </span>
                )}
                <div class="spacer" />
                <Button
                  class="small"
                  icon={Plus}
                  onClick={() => {
                    booth.addAiPerson(v.id, speed, lang);
                    onAdd();
                  }}
                >
                  Add
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Settings → AI: status for AI-stemmene, med nedlasting og fjerning.
export function AiVoiceSettings() {
  const t = booth.tts.value;
  useEffect(() => {
    booth.refreshTts();
  }, []);
  const job = tasks.value.find((x) => x.kind === 'download' && /AI voices/.test(x.title) && (x.state === 'running' || x.state === 'queued'));
  return (
    <section class="section ai-voice-settings">
      <header>
        <h3>AI Voices</h3>
      </header>
      <div class="section-body">
        <p class="hint">
          Kokoro reads scripts aloud in the Voice Over Studio. It runs on this computer, free and without a key. {t.installed ? 'Installed.' : `Not installed (about ${mb(t.sizeBytes || 115e6)}).`} The pronunciation add-on contains eSpeak NG (GPL) and is downloaded from npm, not included in Reccut.
        </p>
        <div class="row">
          {t.installed ? (
            <Button class="small" onClick={() => api.ttsRemove().then(booth.refreshTts)}>
              Remove AI Voices
            </Button>
          ) : job ? (
            <span class="dim">Downloading {Math.round((job.progress || 0) * 100)} %</span>
          ) : (
            <Button class="small" icon={Download} onClick={() => api.ttsInstall().then(booth.refreshTts).catch(() => booth.refreshTts())}>
              Download AI Voices
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
