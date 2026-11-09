// AI-stemmer i Voice Over Studio: last ned Kokoro første gang, lytt til stemmene og legg en til som person.
import { signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { Download, Loader2, Play, Plus, Square } from 'lucide-preact';
import { Button, IconButton, Modal, NumberField, Slider } from '../ui.jsx';
import { tasks } from '../editor/store.js';
import { LANGUAGES, VOICES } from '../../shared/tts.js';
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
  const [lang, setLang] = useState('a');
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
            <li>The voices speak English (US and UK), Spanish, French, Italian, Brazilian Portuguese and Hindi. English sounds best. There is no Norwegian voice.</li>
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
            <div class="segmented small">
              {Object.entries(LANGUAGES).map(([k, l]) => (
                <button key={k} class={k === lang ? 'active' : ''} onClick={() => setLang(k)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <label class="vt-ctl ai-speed" title="Speaking speed. Below 1 is slower, which often suits voice over.">
            Speed
            <Slider value={speed} min={0.5} max={1.5} step={0.01} center={1} onInput={setSpeed} />
            <NumberField value={speed} min={0.5} max={2} step={0.01} precision={2} unit="×" width={66} onChange={setSpeed} />
          </label>
          <ul class="ai-voice-list">
            {VOICES.filter((v) => v.lang === lang).map((v) => {
              const playing = booth.sampling.value === v.id;
              return (
                <li key={v.id}>
                  <IconButton icon={playing ? Square : Play} size={14} title={playing ? 'Stop' : 'Listen'} onClick={() => booth.previewVoice(v.id, speed)} />
                  <b>{v.name}</b>
                  <span class="dim">{v.gender}</span>
                  {v.grade && (
                    <span class={`ai-grade g${v.grade[0]}`} title="Quality grade from the Kokoro project. A is best.">
                      {v.grade}
                    </span>
                  )}
                  <div class="spacer" />
                  <Button
                    class="small"
                    icon={Plus}
                    onClick={() => {
                      booth.addAiPerson(v.id, speed);
                      close();
                    }}
                  >
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
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
