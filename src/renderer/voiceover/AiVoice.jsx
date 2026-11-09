// AI-stemmer i Voice Over Studio: last ned Kokoro første gang, lytt til stemmene og legg en til som person.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { Download, Loader2, Play, Plus, Square } from 'lucide-preact';
import { Button, IconButton, Modal, NumberField, Select, Slider } from '../ui.jsx';
import { tasks } from '../editor/store.js';
import { LANGUAGES, VOICES, languageById, voiceLanguage, voicesFor } from '../../shared/tts.js';
import * as booth from './booth.js';

const api = window.api;
export const aiDialogOpen = signal(false);
export const openAiVoices = () => {
  booth.refreshTts();
  aiDialogOpen.value = true;
};

const mb = (b) => `${Math.round(b / 1e6)} MB`;

export function AiVoiceDialog() {
  const t = booth.tts.value;
  const [speed, setSpeed] = useState(1);
  const [lang, setLang] = useState(() => booth.scriptLanguage.value || 'en-us');
  useEffect(() => {
    booth.refreshTts();
  }, []);
  const job = tasks.value.find((x) => x.kind === 'download' && /AI voices/.test(x.title) && (x.state === 'running' || x.state === 'queued'));
  const close = () => {
    booth.sampling.value = null;
    aiDialogOpen.value = false;
  };
  const install = () => api.ttsInstall().then(booth.refreshTts).catch((e) => e.message !== 'Canceled' && booth.refreshTts());
  return (
    <Modal title="AI Voices" onClose={close} width={620} class="ai-voices">
      {!t.installed ? (
        <div class="ai-setup">
          <p>
            Let an AI voice read the script. The voices come from <b>Kokoro</b>, an open model that runs on this computer. It is free, needs no account or key, and the script never leaves your computer.
          </p>
          <ul class="dim">
            <li>About {mb(t.sizeBytes || 115e6)} is downloaded once: the model, {VOICES.length} voices and a pronunciation add-on.</li>
            <li>There are voices made for English (US and UK), Spanish, French, Italian, Brazilian Portuguese and Hindi, and English sounds best. Norwegian, Swedish, Danish, German, Dutch, Finnish and Polish are pronounced correctly, but read by a voice from another language, so they have an accent.</li>
            <li>The pronunciation add-on (phonemizer.js) contains eSpeak NG, which is GPL software. It is not part of Reccut and is downloaded from npm and checked before use. The model is Apache 2.0.</li>
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
            <Button variant="primary" icon={Download} onClick={install}>
              Download AI Voices
            </Button>
          )}
        </div>
      ) : (
        <div class="ai-pick">
          <div class="ai-pick-bar">
            <label class="vt-ctl" title="The language of the script. The voice reads it with this pronunciation.">
              Language
              <Select value={lang} options={LANGUAGES.map((l) => ({ value: l.id, label: `${l.label}${l.voices ? '' : ' (with accent)'}${l.id === booth.scriptLanguage.value ? ', the script' : ''}` }))} onChange={setLang} />
            </label>
            <label class="vt-ctl ai-speed" title="Speaking speed. Below 1 is slower, which often suits voice over.">
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
          {!languageById(lang).voices && (
            <p class="ai-note">
              Kokoro has no voices made for {languageById(lang).label}. The words are pronounced in {languageById(lang).label}, but the voice comes from another language, so it has an accent. Listen to a few and pick the one you like. The first ones usually work best.
            </p>
          )}
          <VoiceList voices={voicesFor(lang).own} lang={lang} speed={speed} onAdd={close} title={voicesFor(lang).own.length ? `Made for ${languageById(lang).label}` : null} />
          <VoiceList voices={sortOther(voicesFor(lang).other, lang)} lang={lang} speed={speed} onAdd={close} title={voicesFor(lang).own.length ? 'Other voices, with an accent' : 'Voices from other languages'} collapsed={voicesFor(lang).own.length > 0} />
          <p class="dim">
            Listening generates a short sample, which can take a few seconds the first time. Each voice is added as a person on its own track, with its own takes and sound. Change the voice and speed later under Sound.
          </p>
          <button class="link" onClick={() => api.ttsRemove().then(booth.refreshTts)}>
            Remove the AI voices from this computer
          </button>
        </div>
      )}
    </Modal>
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
