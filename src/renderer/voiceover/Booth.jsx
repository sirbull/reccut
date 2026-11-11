// Voice Over Studio: et eget arbeidsvindu over redigeringen for fortellerstemme og snakkende hode.
// Manuset til venstre (også som teleprompter), opptak og valg av opptak til høyre.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  AudioWaveform,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  FlipHorizontal2,
  FolderOpen,
  Minus,
  MonitorPlay,
  Pencil,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  SkipForward,
  Square,
  Star,
  Trash2,
  Ban,
  Video,
  VideoOff,
  Wind,
  UserPlus,
  RotateCw,
  Sparkles,
  Loader2,
  Mic,
  ArrowLeft,
  Download,
} from 'lucide-preact';
import { Button, IconButton, NumberField, Segmented, Select, Slider, Toggle, toast } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { project, room } from '../editor/store.js';
import { isSpaceInput, isTyping } from '../keyboard.js';
import { chosenTake, htmlToScript, isSkipped, pickKey, orphanTakes, progress, readingTime, DEFAULT_PACING } from '../../shared/voiceover.js';
import { AudioFxChain } from '../editor/AudioFxChain.jsx';
import { withDefaultPitch } from '../../shared/audiofx.js';
import { formatDuration } from '../../shared/model.js';
import * as booth from './booth.js';
import { StudioIcon } from './StudioIcon.jsx';
import { AiVoiceDialog, aiDialogOpen, openAiVoices } from './AiVoice.jsx';
import { LANGUAGES, languageById, voiceLabel, voicesFor } from '../../shared/tts.js';
import { PacingFields } from './Pacing.jsx';
import { piperById, piperFor, speakerLabel } from './piper.js';
import { SpeechProgress } from './SpeechProgress.jsx';
import { EffectsPanel, VoTimeline, clearMarks, deleteSelected, marked, pausesOpen, selected as vtSelected, togglePreview, toggleStudioTool, tool } from './VoTimeline.jsx';

const api = window.api;
const isMac = api.platform === 'darwin';
const MOD = isMac ? '⌘' : 'Ctrl+';
const SCRIPT_EXT = ['typeloom', 'docx', 'pdf', 'md', 'markdown', 'txt', 'fountain', 'fdx', 'rtf', 'html', 'htm'];

const db = (v) => (v > 1e-6 ? 20 * Math.log10(v) : -120);
const meterPos = (dbv) => Math.max(0, Math.min(1, (dbv + 60) / 60));
const secs = (v) => `${v.toFixed(1)} s`;

export const KEYS = [
  ['R', 'Record / stop and keep'],
  ['⇧R', 'Record the line again: discard and start over'],
  ['Space', 'Play / pause the timeline, from the yellow line when the pointer is over it'],
  ['A', 'Select tool: drag a clip sideways to move it and the clips after it'],
  ['B', 'Cut tool: click a clip to split it'],
  ['N', 'Snapping on / off'],
  ['S', 'Skimming on / off'],
  ['⇧S', 'Audio skimming on / off'],
  ['Esc', 'Discard the take that is recording'],
  ['⌫', 'Delete the selected clips, or: last take was bad, go back to it'],
  [`${MOD}Z`, 'Undo (⇧ or Y to redo)'],
  [`${MOD}A`, 'Select all clips and room tone'],
  ['↑ ↓', 'Previous / next line'],
  ['⇧↑ ⇧↓', 'Previous / next section'],
  ['⇧N', 'Next line without a take'],
  ['P', 'Play the chosen take'],
  ['F', 'Star the chosen take'],
  ['M', 'Prompter view'],
  [`${MOD}↩`, 'Send to Edit: stitch the takes with room tone'],
];

function onBoothKey(e) {
  if (!booth.boothOpen.value || e.isComposing) return;
  if (document.querySelector?.('.vt-clip-dialog')) return;
  // Ta mellomrom før felter, dialoger og romlydoppsettet, så fokus aldri må flyttes til tidslinjen.
  if (e.key === ' ' || e.code === 'Space') {
    if (e.isComposing || isSpaceInput(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // Hold inne tasten uten å veksle gjentatte ganger. Avspilling må ikke lekke inn i et opptak.
    if (!e.repeat && !booth.busy()) togglePreview();
    return;
  }
  if (aiDialogOpen.value) return;
  // Enter åpner/lukker effektgrupper som har tastaturfokus.
  if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && e.target?.closest?.('.vo-fx-section > summary')) return;
  const typing = isTyping(e);
  if (typing) {
    if (e.key === 'Escape') document.activeElement?.blur?.();
    return;
  }
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key;
  let handled = true;
  // R starter romlyden, Esc avbryter eller hopper over.
  if (booth.needsRoomTone.value) {
    if (k === 'r' || k === 'R') !booth.busy() && booth.recordRoomTone(5);
    else if (k === 'Escape') booth.busy() ? booth.cancel() : booth.skipRoomTone();
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (k === 'Escape' && (booth.generating.value || booth.status.value === 'generating')) booth.cancelGenerate();
  else if (k === 'Escape' && pausesOpen.value) pausesOpen.value = false;
  else if (k === 'Escape' && tool.value === 'blade') tool.value = 'select';
  else if (k === 'Escape' && !booth.busy() && (vtSelected.value || marked.value.length)) clearMarks();
  else if (k === 'Escape') booth.busy() ? booth.cancel() : backToEdit();
  else if ((k === 'Backspace' || k === 'Delete') && !booth.busy() && (vtSelected.value || marked.value.length)) deleteSelected();
  else if (mod && k === 'Enter') booth.stitch({ open: true });
  else if (mod && (k === 'y' || k === 'Y')) booth.voRedo();
  else if (mod) handled = false;
  else if (!e.altKey && ((k.toLowerCase() === 'n' && !e.shiftKey) || k.toLowerCase() === 's')) {
    if (!e.repeat) toggleStudioTool(k.toLowerCase() === 'n' ? 'snapping' : e.shiftKey ? 'audioSkimming' : 'skimming');
  }
  else if (!e.altKey && k.toLowerCase() === 'n' && e.shiftKey) {
    if (!e.repeat) booth.goNextMissing();
  }
  else if (k === 'b' || k === 'B') tool.value = tool.value === 'blade' ? 'select' : 'blade';
  else if (k === 'a' || k === 'A') tool.value = 'select';
  else if ((k === 'r' || k === 'R') && e.shiftKey) booth.retake();
  else if (k === 'r' || k === 'R') booth.toggle();
  else if ((k === 'Backspace' || k === 'Delete') && !booth.busy()) booth.scrapLast();
  else if (k === 'ArrowUp') e.shiftKey ? booth.stepSection(-1) : booth.step(-1);
  else if (k === 'ArrowDown') e.shiftKey ? booth.stepSection(1) : booth.step(1);
  else if (k === 'Enter') booth.step(1);
  else if (k === 'p' || k === 'P') booth.playCurrent();
  else if (!e.altKey && (k === 'f' || k === 'F')) {
    const t = booth.current.value && chosenTake(booth.vo.value, booth.current.value.key, booth.personId.value);
    if (t && !e.repeat) booth.toggleStar(t);
  } else if (k === 'm' || k === 'M') setPrefs({ voPrompter: !booth.opt('voPrompter') });
  else if (k === '+' || k === '=') setPrefs({ voFont: Math.min(96, booth.opt('voFont') + 2) });
  else if (k === '-') setPrefs({ voFont: Math.max(14, booth.opt('voFont') - 2) });
  else handled = false;
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

// Lim inn beholder formateringen som manus (overskrifter blir seksjoner).
// Lim inn som ren tekst (høyreklikk, ⇧⌘V eller ⌥⇧⌘V) gir bare teksten, slik den var.
function pasteScript(e) {
  const html = e.clipboardData?.getData('text/html');
  if (!html) return;
  e.preventDefault();
  // insertText beholder angre-historikken i feltet.
  document.execCommand('insertText', false, htmlToScript(html));
}
function pastePlainKey(e) {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyV') {
    e.preventDefault();
    api.editText('pasteAndMatchStyle');
  }
}

export function VoiceoverBooth() {
  const ref = useRef(null);
  useEffect(() => {
    booth.ensurePeople();
    booth.startOnMic();
    booth.refreshTts();
    booth.openInput();
    window.addEventListener('keydown', onBoothKey, true);
    const onDevices = () => booth.refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onDevices);
    ref.current?.focus();
    return () => {
      window.removeEventListener('keydown', onBoothKey, true);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDevices);
      booth.closeInput();
    };
  }, []);
  const prompter = booth.opt('voPrompter');
  return (
    <div class={`vo-booth${prompter ? ' prompter' : ''}`} role="dialog" aria-modal="true" aria-label="Voice Over Studio" tabIndex={-1} ref={ref}>
      <BoothHeader />
      <div class="vo-body">
        {!prompter && booth.opt('voBrowserVisible') && <EffectsPanel />}
        <ScriptPane />
        {!prompter && booth.opt('voInspectorVisible') && <SidePane />}
        {booth.needsRoomTone.value && <RoomToneSetup />}
      </div>
      {!prompter && <VoTimeline />}
      {aiDialogOpen.value && <AiVoiceDialog />}
      {prompter && <PrompterBar />}
      {!booth.needsRoomTone.value && <KeyBar />}
    </div>
  );
}

function BoothHeader() {
  const v = booth.vo.value;
  const { done, total } = progress(booth.blocks.value, v, booth.personId.value);
  const mics = booth.devices.value.mics;
  const cams = booth.devices.value.cams;
  const video = booth.opt('voVideo');
  const reopen = (patch) => {
    if (booth.busy()) return toast('Stop the take first.');
    setPrefs(patch);
    booth.openInput();
  };
  return (
    <header class="vo-head">
      <StudioIcon size={16} />
      <b>Voice Over Studio</b>
      {v.script && (
        <span class="dim vo-progress" title="Lines with a usable take">
          {done} of {total} lines · about {formatDuration(readingTime(booth.blocks.value))} to read
        </span>
      )}
      <div class="spacer" />
      <RoomTonePicker />
      <label class="vo-field" title="Microphone">
        <span>Mic</span>
        <Select value={booth.opt('voMic')} options={[{ value: '', label: 'System default' }, ...mics.map((m) => ({ value: m.id, label: m.label }))]} onChange={(id) => reopen({ voMic: id })} />
      </label>
      <label class="vo-field" title="Which input channel to record. Most interfaces have the microphone on input 1.">
        <span>Input</span>
        <Select value={String(booth.opt('voChannel'))} options={[{ value: '0', label: '1 (left)' }, { value: '1', label: '2 (right)' }, { value: '-1', label: '1 + 2 mixed' }]} onChange={(ch) => booth.setChannel(Number(ch))} />
      </label>
      <button class={`btn small ${video ? 'primary' : 'secondary'}`} title="Record the camera too, for a talking head" onClick={() => reopen({ voVideo: !video })}>
        {video ? <Video size={14} /> : <VideoOff size={14} />}
        Camera
      </button>
      {video && cams.length > 1 && <Select value={booth.opt('voCam')} options={[{ value: '', label: 'Default camera' }, ...cams.map((c) => ({ value: c.id, label: c.label }))]} onChange={(id) => reopen({ voCam: id })} />}
      <IconButton icon={PanelLeft} title={`${booth.opt('voBrowserVisible') ? 'Hide' : 'Show'} Effects & Templates`} active={!booth.opt('voPrompter') && booth.opt('voBrowserVisible')} aria-pressed={!booth.opt('voPrompter') && booth.opt('voBrowserVisible')} disabled={booth.opt('voPrompter')} onClick={() => setPrefs({ voBrowserVisible: !booth.opt('voBrowserVisible') })} />
      <IconButton icon={PanelRight} title={`${booth.opt('voInspectorVisible') ? 'Hide' : 'Show'} Properties`} active={!booth.opt('voPrompter') && booth.opt('voInspectorVisible')} aria-pressed={!booth.opt('voPrompter') && booth.opt('voInspectorVisible')} disabled={booth.opt('voPrompter')} onClick={() => setPrefs({ voInspectorVisible: !booth.opt('voInspectorVisible') })} />
      <Button variant="primary" class="small vo-back" icon={ArrowLeft} onClick={backToEdit} title="Leave the studio and go back to Edit (Esc). The takes are kept.">
        Back to Edit
      </Button>
    </header>
  );
}

// Romlyd i toppen: velg hvilken som brukes, eller ta opp en ny.
function RoomTonePicker() {
  const list = booth.roomTones.value;
  const active = booth.vo.value.roomTone;
  return (
    <div class="vo-field" title="Room tone used to find your voice and fill the pauses">
      <span>Room tone</span>
      {list.length > 0 ? (
        <Select value={active?.id || ''} options={[...(active ? [] : [{ value: '', label: 'None' }]), ...[...list].reverse().map((t) => ({ value: t.id, label: `${booth.toneLabel(t)}${t.quiet === false ? ' (has sound)' : ''}` }))]} onChange={(id) => id && booth.useRoomTone(id)} />
      ) : (
        <span class="dim">None</span>
      )}
      <Button class="small" icon={Plus} onClick={booth.newRoomTone} disabled={booth.busy()} title="Record a new room tone: countdown from 3, then 5 seconds">
        New
      </Button>
    </div>
  );
}

const backToEdit = () => {
  booth.closeBooth();
  if (!booth.boothOpen.value) room.value = 'edit';
};

/* Manus */

function ScriptPane() {
  const v = booth.vo.value;
  const draft = booth.scriptDraft.value;
  const editing = draft != null;
  const setDraft = (text) => (booth.scriptDraft.value = text);
  useEffect(() => () => (booth.scriptDraft.value = null), []);
  const [over, setOver] = useState(false);
  const scroller = useRef(null);
  const cur = booth.current.value;
  const font = booth.opt('voFont');
  const mirror = booth.opt('voMirror');
  const prompter = booth.opt('voPrompter');

  // Linjen som leses holdes omtrent en tredjedel ned i vinduet, som på en teleprompter.
  useLayoutEffect(() => {
    const el = scroller.current?.querySelector('.vo-block.current');
    if (!el || !scroller.current) return;
    const box = scroller.current;
    const top = el.offsetTop - box.clientHeight * (prompter ? 0.3 : 0.25);
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [cur?.index, prompter, font, editing]);

  const open = async () => {
    const file = await api.openFileDialog({ title: 'Open Script', filters: [{ name: 'Scripts', extensions: SCRIPT_EXT }, { name: 'All Files', extensions: ['*'] }] });
    if (file) await booth.loadScriptFile(file).catch((e) => toast(e.message, { kind: 'error' }));
  };
  const drop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const f = e.dataTransfer?.files?.[0];
    const path = f && api.pathForFile(f);
    if (path) await booth.loadScriptFile(path).catch((err) => toast(err.message, { kind: 'error' }));
  };
  const dragOver = (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setOver(true);
  };
  const startEdit = () => setDraft(v.script?.text || '');
  const saveEdit = booth.commitDraft;
  const docs = (project.value.story?.documents || []).filter((d) => d.text?.trim());

  return (
    <section class={`vo-script${over ? ' drop' : ''}`} onDragOver={dragOver} onDragLeave={() => setOver(false)} onDrop={drop}>
      <div class="vo-script-bar">
        <div class="vo-bar-left">
        <Button icon={FolderOpen} class="small" onClick={open} title="Typeloom, Word, PDF, Markdown, text, Fountain, Final Draft or RTF">
          Open Script…
        </Button>
        {editing ? (
          <>
            <Button variant="primary" class="small" icon={Check} onClick={saveEdit}>
              Done
            </Button>
            <Button class="small" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            {draft.trim() && draft !== (v.script?.text || '') && (
              <span class="vo-draft-hint">Not saved yet. Click Done to read the script line by line (Record does it too).</span>
            )}
          </>
        ) : (
          <Button icon={Pencil} class="small" onClick={startEdit}>
            {v.script ? 'Edit' : 'Write or Paste'}
          </Button>
        )}
        <span class="vo-scripts">
          <Select value={booth.scriptId.value} title="The scripts in this project. Each one has its own takes." options={booth.scripts.value.map((s) => ({ value: s.id, label: `${s.name}${s.takes ? ` · ${s.takes} ${s.takes === 1 ? 'take' : 'takes'}` : ''}` }))} onChange={booth.openScript} />
        </span>
        <IconButton icon={Plus} title="New script. The script that is open now, and its takes, stay in the list." onClick={booth.newScript} disabled={editing} />
        <IconButton icon={Trash2} title="Delete this script and its takes" onClick={booth.deleteScript} disabled={editing} />
        </div>
        <div class="vo-bar-right">
        <Segmented
          size="small"
          value={booth.opt('voSplit')}
          onChange={booth.setSplit}
          options={[
            { value: 'paragraph', label: 'Paragraphs', title: 'One take per paragraph' },
            { value: 'sentence', label: 'Sentences', title: 'One take per sentence. Good for dense or technical text.' },
            { value: 'line', label: 'Lines', title: 'One take per line in the document' },
          ]}
        />
        <IconButton icon={Minus} title="Smaller text (-)" onClick={() => setPrefs({ voFont: Math.max(14, font - 2) })} />
        <span class="vo-font">{font}</span>
        <IconButton icon={Plus} title="Larger text (+)" onClick={() => setPrefs({ voFont: Math.min(96, font + 2) })} />
        <IconButton icon={FlipHorizontal2} title="Mirror the text, for a teleprompter with a beam splitter glass" active={mirror} onClick={() => setPrefs({ voMirror: !mirror })} />
        <IconButton icon={MonitorPlay} title="Prompter view: only the script, big (M)" active={prompter} onClick={() => setPrefs({ voPrompter: !prompter })} />
        </div>
      </div>
      {editing ? (
        <textarea class="vo-editor" value={draft} onInput={(e) => setDraft(e.currentTarget.value)} onPaste={pasteScript} onKeyDown={pastePlainKey} placeholder={'Write or paste the script.\n\nBlank lines separate paragraphs. Lines starting with # are sections, and lines starting with = are notes that are not read.\n[Directions in brackets] are shown, but are part of the line.'} autoFocus />
      ) : !v.script ? (
        <div class="vo-empty">
          <FileText size={34} />
          <h3>Read while you record</h3>
          <p>Open a script from Typeloom, Word, PDF, Markdown, plain text, Fountain, Final Draft or RTF, drop it here, or write one. Each paragraph or sentence becomes a line you record, retake and stitch together.</p>
          <div class="vo-empty-actions">
            <Button variant="primary" icon={FolderOpen} onClick={open}>
              Open Script…
            </Button>
            <Button icon={Pencil} onClick={startEdit}>
              Write or Paste
            </Button>
          </div>
          {docs.length > 0 && (
            <div class="vo-docs">
              <span class="dim">Or use a document from the project:</span>
              {docs.map((d) => (
                <button key={d.name} class="link" onClick={() => booth.useScript(d.name, d.text)}>
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <p class="dim">No script? Record freely with Free Take in the panel on the right.</p>
        </div>
      ) : (
        <div class="vo-scroll" ref={scroller}>
          <div class="vo-text" style={{ fontSize: `${font}px`, transform: mirror ? 'scaleX(-1)' : undefined }}>
            {booth.blocks.value.map((b) => (
              <Block key={b.index} b={b} current={cur?.index === b.index} />
            ))}
            <div class="vo-end" />
          </div>
        </div>
      )}
    </section>
  );
}

// Retningslinjer i [klammer] eller (parentes) vises dempet, så de ikke leses høyt ved et uhell.
function Spoken({ text }) {
  const parts = String(text).split(/(\[[^\]]*\]|\([^)]*\))/g);
  return parts.map((p, i) => (/^[[(]/.test(p) ? <span key={i} class="vo-dir">{p}</span> : p));
}

function Block({ b, current }) {
  if (b.kind === 'title') return <h1 class="vo-block vo-title">{b.text}</h1>;
  if (b.kind === 'heading') return <h2 class="vo-block vo-heading">{b.text}</h2>;
  if (b.kind === 'note') return <p class="vo-block vo-note">{b.text}</p>;
  const v = booth.vo.value;
  const takes = booth.takesFor(b.key);
  const chosen = chosenTake(v, b.key, booth.personId.value);
  const rec = booth.recordingKey.value === b.key && booth.status.value === 'recording';
  const skipped = isSkipped(v, booth.personId.value, b.key);
  return (
    <div class={`vo-block vo-line${current ? ' current' : ''}${chosen ? ' done' : ''}${rec ? ' rec' : ''}${skipped ? ' skipped' : ''}`} onClick={() => booth.goTo(b.index)}>
      <span class="vo-num">{booth.lineNumber(b)}</span>
      <div class="vo-line-body">
        {(b.speaker || b.direction) && (
          <div class="vo-speaker">
            {b.speaker}
            {b.direction && <span class="vo-dir"> ({b.direction})</span>}
          </div>
        )}
        <div class="vo-words">
          <Spoken text={b.text} />
        </div>
      </div>
      {skipped && (
        <button class="vo-badge" title="Deleted from the timeline. Click to bring it back." onClick={(e) => (e.stopPropagation(), booth.skipLine(b.key, false))}>
          deleted
        </button>
      )}
      {takes.length > 0 && !skipped && (
        <span class={`vo-badge${chosen ? ' ok' : ''}`} title={`${takes.length} ${takes.length === 1 ? 'take' : 'takes'}${chosen?.star ? ', starred' : ''}`}>
          {chosen?.star ? <Star size={10} /> : chosen ? <Check size={10} /> : null}
          {takes.length}
        </span>
      )}
    </div>
  );
}

/* Opptak */

function Meter() {
  const { peak, rms, hold } = booth.level.value;
  const p = db(peak),
    h = db(hold);
  const hot = h > -3;
  return (
    <div class="vo-meter-wrap" title="Aim for peaks between -12 and -6 dB">
      <div class="vo-meter">
        <div class="vo-meter-target" />
        <div class="vo-meter-rms" style={{ width: `${meterPos(db(rms)) * 100}%` }} />
        <div class={`vo-meter-peak${p > -3 ? ' hot' : p > -6 ? ' warm' : ''}`} style={{ width: `${meterPos(p) * 100}%` }} />
        <div class={`vo-meter-hold${hot ? ' hot' : ''}`} style={{ left: `${meterPos(h) * 100}%` }} />
      </div>
      <div class="vo-meter-scale">
        {[-48, -36, -24, -12, -6].map((x) => (
          <span key={x} style={{ left: `${meterPos(x) * 100}%` }}>
            {x}
          </span>
        ))}
        <b class={hot ? 'hot' : ''}>{h > -100 ? `Peak ${Math.round(h)} dB` : 'No signal'}</b>
      </div>
    </div>
  );
}

function Camera() {
  const ref = useRef(null);
  const s = booth.cameraStream.value;
  useEffect(() => {
    if (ref.current) ref.current.srcObject = s;
  }, [s]);
  if (!s) return null;
  return <video class="vo-camera" ref={ref} autoplay muted playsInline />;
}

function Transport() {
  const st = booth.status.value;
  const recording = st === 'recording';
  const cur = booth.current.value;
  const ai = booth.person.value?.ai;
  const gen = booth.generating.value;
  return (
    <div class="vo-transport">
      {ai ? (
        <>
          <button class={`vo-rec vo-ai${st === 'generating' || gen ? ' wait' : ''}`} disabled={st === 'saving' || (!gen && st !== 'idle' && st !== 'generating')} onClick={booth.toggle} title="Read the line with the AI voice (R). Again to stop.">
            {st === 'generating' || gen ? <Loader2 size={16} class="spin" /> : <Sparkles size={16} />}
            <span>{gen ? `Reading ${Math.min(gen.done + 1, gen.total)} of ${gen.total}` : st === 'generating' ? 'Reading…' : st === 'saving' ? 'Saving…' : cur ? `Read line ${booth.lineNumber(cur)}` : 'Read'}</span>
          </button>
          <Button class="small" icon={Sparkles} onClick={gen ? booth.cancelGenerate : booth.generateAll} disabled={!gen && st !== 'idle'} title="Read every line that has no take yet, one after another">
            {gen ? 'Stop' : 'Read All Missing Lines'}
          </Button>
          <SpeechProgress controller={booth.speechGeneration} batch={gen} onCancel={booth.cancelGenerate} />
        </>
      ) : (
      <button class={`vo-rec${recording ? ' on' : ''}${st === 'countin' || st === 'cue' ? ' wait' : ''}`} disabled={st === 'saving' || st === 'tone'} onClick={booth.toggle} title="Record / stop (R)">
        {recording ? <Square size={18} /> : <span class="vo-rec-dot" />}
        <span>
          {st === 'countin' ? `Starting in ${booth.countLeft.value}` : st === 'cue' ? 'Cue…' : recording ? formatDuration(booth.elapsed.value) : st === 'saving' ? 'Saving…' : st === 'tone' ? 'Room tone…' : cur ? `Record line ${booth.lineNumber(cur)}` : 'Record'}
        </span>
      </button>
      )}
      {!aiDialogOpen.value && <SpeechProgress controller={booth.speechAudition} onCancel={booth.stopVoicePreview} />}
      <div class="vo-transport-row vo-person-row">
        <span class="dim">Record as</span>
        <Select value={booth.personId.value} options={booth.people.value.map((p) => ({ value: p.id, label: p.name }))} onChange={booth.choosePerson} disabled={recording} />
        <IconButton icon={UserPlus} title="Add a person on a new track, with their own takes and sound" onClick={booth.addPerson} disabled={st !== 'idle'} />
        <IconButton icon={Sparkles} title="Use another AI voice (free, runs on this computer)" onClick={openAiVoices} disabled={st !== 'idle'} />
      </div>
      <div class="vo-transport-row">
        <Button class="small" icon={RotateCcw} onClick={booth.retake} disabled={st === 'saving' || st === 'tone' || (ai && st !== 'idle')} title={ai ? 'Read the line again, as a new take (Shift R)' : 'Discard what is recording and start the line again (Shift R)'}>
          {ai ? 'Read Again' : 'Retake'}
        </Button>
        <IconButton icon={ChevronUp} title="Previous line (↑)" onClick={() => booth.step(-1)} disabled={recording} />
        <IconButton icon={ChevronDown} title="Next line (↓)" onClick={() => booth.step(1)} disabled={recording} />
        <IconButton icon={SkipForward} title="Next line without a take (Shift N)" onClick={booth.goNextMissing} disabled={recording} />
      </div>
      {booth.inputError.value && (
        <p class="vo-error">
          {booth.inputError.value}{' '}
          <button class="link" onClick={booth.openInput}>
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

// Det AI-stemmen leser for linjen. Skriv om ord som uttales feil, for eksempel navn, tall eller forkortelser.
function SayItAs({ block }) {
  const text = booth.spokenFor(block.key);
  const [draft, setDraft] = useState(text);
  const changed = booth.vo.value.spoken?.[pickKey(booth.personId.value, block.key)] != null;
  return (
    <label class="vo-say">
      <span>
        Say it as {changed && <button class="link" onClick={() => (booth.setSpoken(block.key, ''), setDraft(booth.spokenFor(block.key)))}>Reset</button>}
      </span>
      <textarea value={draft} rows={3} onInput={(e) => setDraft(e.currentTarget.value)} onBlur={() => booth.setSpoken(block.key, draft)} title="What the AI voice reads. Write words the way they sound if it says them wrong. The script is not changed." />
    </label>
  );
}

function Takes() {
  const cur = booth.current.value;
  const v = booth.vo.value;
  if (!cur) return null;
  const takes = booth.takesFor(cur.key);
  const chosen = chosenTake(v, cur.key, booth.personId.value);
  return (
    <div class="vo-section">
      <h4>
        Takes for line {booth.lineNumber(cur)}
        {takes.length > 0 && <span class="dim"> · {takes.length}</span>}
      </h4>
      {booth.person.value?.ai && <SayItAs key={`${booth.personId.value}|${cur.key}`} block={cur} />}
      {!takes.length && <p class="dim">{booth.person.value?.ai ? 'No takes yet. Press R to let the AI voice read the line.' : 'No takes yet. Press R and read the line.'}</p>}
      <ul class="vo-takes">
        {[...takes].reverse().map((t) => (
          <TakeRow key={t.id} t={t} chosen={chosen?.id === t.id} />
        ))}
      </ul>
    </div>
  );
}

function TakeRow({ t, chosen }) {
  const playing = booth.playingTake.value === t.id;
  const [open, setOpen] = useState(false);
  return (
    <li class={`vo-take${chosen ? ' chosen' : ''}${t.bad ? ' bad' : ''}`}>
      <div class="vo-take-row">
        <IconButton icon={playing ? Square : Play} size={13} title={playing ? 'Stop' : 'Play (P plays the chosen take)'} onClick={() => (playing ? booth.stopPlayback() : booth.playTake(t))} />
        <button class="vo-take-name" onClick={() => booth.selectTake(t)} title={`Use this take. Peak ${t.peakDb} dB.`}>
          Take {t.n}
          {t.video && <Video size={11} />}
          <span class="dim"> {secs(t.out - t.in)}</span>
        </button>
        {chosen && <Check size={13} class="vo-ok" />}
        <IconButton icon={Star} size={13} title="Star: a circled take, preferred when stitching (F)" active={t.star} onClick={() => booth.toggleStar(t)} />
        <IconButton icon={Scissors} size={13} title="Adjust where the take starts and ends" active={open} onClick={() => setOpen(!open)} />
        <IconButton icon={Ban} size={13} title={t.bad ? 'Use again' : 'Not usable'} active={t.bad} onClick={() => booth.markBad(t)} />
        <IconButton icon={Trash2} size={13} title="Remove from the studio (the file stays in the project)" onClick={() => booth.deleteTake(t)} />
      </div>
      {(t.clipped || !t.found) && (
        <div class="vo-take-warn">
          {t.clipped && <span title="The input was too loud. Lower the gain on the microphone or interface.">Clipped at {t.peakDb} dB</span>}
          {!t.found && <span title="The take is kept whole. Trim it with the scissors.">No voice found, not trimmed</span>}
        </div>
      )}
      {open && (
        <div class="vo-trim">
          <label>
            Start
            <NumberField value={t.in} min={0} max={t.out - 0.05} step={0.01} precision={2} unit="s" width={70} onChange={(x) => booth.setTrim(t, 'in', x)} />
          </label>
          <label>
            End
            <NumberField value={t.out} min={t.in + 0.05} max={t.duration} step={0.01} precision={2} unit="s" width={70} onChange={(x) => booth.setTrim(t, 'out', x)} />
          </label>
          <span class="dim">of {secs(t.duration)}</span>
        </div>
      )}
    </li>
  );
}

function FreeTakes() {
  const v = booth.vo.value;
  const free = v.takes.filter((t) => t.key === 'free');
  const orphans = orphanTakes(booth.blocks.value, v).filter((t) => t.key !== 'free');
  return (
    <div class="vo-section">
      <h4>Free takes</h4>
      <p class="dim">Record without a line, for ad libs and pickups. They are in the Media browser.</p>
      <Button class="small" icon={AudioWaveform} onClick={booth.recordFree} disabled={booth.busy()}>
        Free Take
      </Button>
      {(free.length > 0 || orphans.length > 0) && (
        <ul class="vo-takes">
          {[...free, ...orphans].reverse().slice(0, 8).map((t) => (
            <li key={t.id} class="vo-take">
              <div class="vo-take-row">
                <IconButton icon={booth.playingTake.value === t.id ? Square : Play} size={13} title="Play" onClick={() => (booth.playingTake.value === t.id ? booth.stopPlayback() : booth.playTake(t))} />
                <span class="vo-take-name">
                  {t.media?.name || `Take ${t.n}`}
                  <span class="dim"> {secs(t.out - t.in)}</span>
                  {t.key !== 'free' && <span class="vo-warn"> line changed</span>}
                </span>
                <IconButton icon={Trash2} size={13} title="Remove from the studio" onClick={() => booth.deleteTake(t)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecordSettings() {
  return (
    <div class="vo-section">
      <h4>Recording</h4>
      <div class="vo-grid">
        <span>Count in</span>
        <Segmented size="small" value={Number(booth.opt('voCountIn'))} onChange={(n) => booth.setVoPrefs({ voCountIn: n })} options={[{ value: 0, label: 'Off' }, { value: 1, label: '1 s' }, { value: 3, label: '3 s' }]} />
        <span title="Before each take, play the end of the take before it, so the new line matches its tone and pace">Cue last line</span>
        <Toggle checked={booth.opt('voCue')} onChange={(on) => booth.setVoPrefs({ voCue: on })} />
        <span title="Go to the next line when a take is kept">Next line after a take</span>
        <Toggle checked={booth.opt('voAutoAdvance')} onChange={(on) => booth.setVoPrefs({ voAutoAdvance: on })} />
        <span title="Air kept before the voice starts">Air before</span>
        <NumberField value={booth.opt('voPreRoll')} min={0} max={1} step={0.01} precision={2} unit="s" width={70} onChange={(x) => booth.setVoPrefs({ voPreRoll: x })} />
        <span title="Air kept after the voice ends">Air after</span>
        <NumberField value={booth.opt('voPostRoll')} min={0} max={2} step={0.01} precision={2} unit="s" width={70} onChange={(x) => booth.setVoPrefs({ voPostRoll: x })} />
      </div>
      <p class="dim">Each take is trimmed where your voice starts and ends. The air settings apply to new takes.</p>
    </div>
  );
}

function RoomTone() {
  const active = booth.vo.value.roomTone;
  const list = booth.roomTones.value;
  return (
    <div class="vo-section">
      <h4>Room tone</h4>
      <p class="dim">Five seconds of the quiet room. It fills the pauses between lines and helps find where your voice starts. Record a new one when the room or the microphone changes, and pick the one to use.</p>
      <Button class="small" icon={Plus} onClick={booth.newRoomTone} disabled={booth.busy()}>
        New Room Tone
      </Button>
      {list.length > 0 && (
        <ul class="vo-takes vo-tones">
          {[...list].reverse().map((t) => {
            const on = active?.id === t.id;
            const playing = booth.playingTake.value === t.id;
            return (
              <li key={t.id} class={`vo-take${on ? ' chosen' : ''}`}>
                <div class="vo-take-row">
                  <IconButton icon={playing ? Square : Play} size={13} title={playing ? 'Stop' : 'Listen'} onClick={() => (playing ? booth.stopPlayback() : booth.playTake({ ...t, in: 0, out: t.duration }))} />
                  <button class="vo-take-name" onClick={() => booth.useRoomTone(t.id)} title={`${on ? 'In use' : 'Use this room tone'}. Noise floor ${t.floor} dB.`}>
                    {booth.toneLabel(t)}
                  </button>
                  {on && <Check size={13} class="vo-ok" />}
                  <IconButton icon={Trash2} size={13} title="Remove from the list (the file stays in the project)" onClick={() => booth.deleteRoomTone(t.id)} />
                </div>
                {t.quiet === false && <div class="vo-take-warn">Has sound in it</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Lyden til personen som er valgt: volum og effekter. Studio Voice er standard, så det høres
// ut som voice over rett ut av boksen. Gjelder alle opptakene til personen, i studioet og når de syes inn.
function Sound() {
  const p = booth.person.value;
  if (!p) return null;
  const fx = withDefaultPitch(p.fx || []);
  return (
    <div class="vo-section vo-sound">
      <h4>
        <span class="vt-dot" style={{ background: p.color }} />
        Sound for {p.name}
      </h4>
      <p class="dim">Applies to all of {p.name}'s takes. You hear it in the studio timeline, and it goes with the clips when you stitch.</p>
      {p.ai && <AiSound p={p} />}
      <label class="vt-ctl">
        Volume
        <Slider value={p.gain || 0} min={-24} max={12} step={0.5} center={0} onInput={(x) => booth.setPersonGain(p.id, x)} />
        <NumberField value={p.gain || 0} min={-24} max={12} step={0.5} precision={1} unit="dB" width={66} onChange={(x) => booth.setPersonGain(p.id, x)} />
      </label>
      {!p.ai && (
        <label class="vt-ctl" title="AI removes background noise such as fans, heat pumps, traffic and hum, also from the room tone. You see the result in the waveforms. It runs on this computer.">
          AI Clean Voice
          <Toggle checked={p.clean != null} onChange={(v) => booth.setPersonClean(p.id, v ? 0.8 : null)} />
          {p.clean != null && <Slider value={p.clean} min={0} max={1} step={0.01} onInput={(x) => booth.setPersonClean(p.id, x)} />}
          {p.clean != null && <span class="dim">{Math.round(p.clean * 100)} %</span>}
        </label>
      )}
      <AudioFxChain
        showAdd={false}
        list={fx}
        onSet={(list) => booth.setPersonFx(p.id, list)}
        onLive={(id, patch) => booth.setPersonFx(p.id, fx.map((e) => (e.id === id ? { ...e, p: { ...e.p, ...patch } } : e)))}
        hint="No effects: the takes sound as recorded. Add Studio Voice from Templates in the left panel for the standard voice over sound."
      />
      <Button class="small" icon={RotateCw} onClick={() => booth.setPersonFx(p.id, booth.DEFAULT_FX())} title="Replace the effects with Studio Voice">
        Reset to Studio Voice
      </Button>
    </div>
  );
}

// Stemmen til en AI-person. Språket først, så bare stemmene for språket som er lastet ned
// (Piper og Kokoro i samme liste). Flere stemmer og språk lastes ned fra AI Voices.
function AiSound({ p }) {
  const t = booth.tts.value;
  const piper = p.ai.engine === 'piper' ? piperById(p.ai.voice) : null;
  const lang = booth.aiLanguage(p).id;
  const label = languageById(lang).label;
  const forLang = (l) => [
    ...piperFor(l).filter((x) => t.piper?.[x.id]?.installed).map((x) => ({ engine: 'piper', voice: x.id, label: x.name })),
    ...(t.installed ? voicesFor(l).own.map((v) => ({ engine: 'kokoro', voice: v.id, label: `${v.name} (${v.gender.toLowerCase()})` })) : []),
  ];
  const choices = forLang(lang);
  const value = `${piper ? 'piper' : 'kokoro'}:${p.ai.voice}`;
  const options = choices.map((c) => ({ value: `${c.engine}:${c.voice}`, label: c.label }));
  // En stemme fra et annet språk (som en stil) vises fortsatt, så valget ikke blir tomt.
  if (!options.some((o) => o.value === value)) options.unshift({ value, label: piper ? piper.name : voiceLabel(p.ai.voice) });
  const use = (c, l = lang) =>
    booth.setAiVoice(p.id, c.engine === 'piper' ? { engine: 'piper', voice: c.voice, speaker: piperById(c.voice).speakers[0] || '', lang: l } : { engine: undefined, speaker: undefined, voice: c.voice, lang: l });
  const pick = (val) => {
    const i = val.indexOf(':');
    use({ engine: val.slice(0, i), voice: val.slice(i + 1) });
  };
  // Nytt språk: bytt til den første nedlastede stemmen for det, ellers behold stemmen og vis nedlasting.
  const setLang = (l) => {
    const first = forLang(l)[0];
    first ? use(first, l) : booth.setAiVoice(p.id, { lang: l });
  };
  const key = piper ? `piper:${piper.id}:${p.ai.speaker || ''}` : p.ai.voice;
  const listen = () => booth.previewVoice(p.ai.voice, p.ai.speed || 1, lang, { fx: p.fx || [], key, ...(piper ? { engine: 'piper', speaker: p.ai.speaker || '' } : {}) });
  return (
    <>
      <label class="vt-ctl" title="The language the lines are read in">
        Language
        <Select value={lang} options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))} onChange={setLang} />
      </label>
      <label class="vt-ctl">
        Voice
        <Select value={value} options={options} onChange={pick} />
        <IconButton icon={booth.sampling.value === key ? Square : Play} size={13} title="Listen" onClick={listen} />
      </label>
      {piper?.speakers.length > 0 && (
        <label class="vt-ctl">
          {piper.id.includes('emotional') ? 'Emotion' : 'Speaker'}
          <Select value={p.ai.speaker || piper.speakers[0]} options={piper.speakers.map((x) => ({ value: x, label: speakerLabel(piper, x) }))} onChange={(speaker) => booth.setAiVoice(p.id, { speaker })} />
        </label>
      )}
      {!choices.length && <p class="ai-note">No voices for {label} are downloaded yet. Download one to read the script in {label}.</p>}
      <Button class="small" icon={Download} variant={choices.length ? 'secondary' : 'primary'} onClick={() => openAiVoices(lang)} title={`Listen to and download voices for ${label}`}>
        Download Voices…
      </Button>
      {booth.scriptLanguage.value && booth.scriptLanguage.value !== lang && (
        <p class="ai-note">
          The script looks like {languageById(booth.scriptLanguage.value).label}.{' '}
          <button class="link" onClick={() => setLang(booth.scriptLanguage.value)}>
            Read it in {languageById(booth.scriptLanguage.value).label}
          </button>
        </p>
      )}
      <label class="vt-ctl" title="Set before generating. Applies only to new AI takes; existing takes keep their recorded speed. Below 1 is slower.">
        Generation speed
        <Slider value={p.ai.speed || 1} min={0.5} max={2} step={0.01} center={1} onInput={(x) => booth.setAiVoice(p.id, { speed: x })} />
        <NumberField value={p.ai.speed || 1} min={0.5} max={2} step={0.01} precision={2} unit="×" width={66} onChange={(x) => booth.setAiVoice(p.id, { speed: x })} />
      </label>
      <p class="dim">Language, voice and generation speed apply to new takes. Generate the lines again to hear these changes. Pitch below changes existing takes without regenerating.</p>
    </>
  );
}

// Første steg når studioet åpnes: fem sekunder romlyd. Ett klikk, nedtelling fra 3, så tar det opp og stopper selv.
function RoomToneSetup() {
  const st = booth.status.value;
  const tone = booth.vo.value.roomTone;
  const mine = booth.recordingKey.value === 'roomtone';
  const counting = mine && st === 'countin';
  const recording = st === 'tone';
  const saving = mine && st === 'saving';
  const retry = tone && !tone.quiet && st === 'idle';
  return (
    <div class="vo-setup">
      <div class="vo-setup-card" role="group" aria-label="Record room tone">
        <StudioIcon size={30} />
        <h3>{retry ? 'There was sound in the room tone' : 'First, record the room'}</h3>
        {counting ? (
          <div class="vo-setup-count">{booth.countLeft.value}</div>
        ) : recording ? (
          <>
            <div class="vo-setup-count rec">{Math.ceil(booth.toneLeft.value)}</div>
            <p>Recording the room. Stay quiet and still.</p>
            <div class="vo-setup-progress">
              <div style={{ width: `${(1 - booth.toneLeft.value / 5) * 100}%` }} />
            </div>
          </>
        ) : saving ? (
          <p>Saving…</p>
        ) : (
          <>
            <p>
              {retry
                ? 'It sounded like a voice or a knock. Try again while everyone is quiet.'
                : 'Sit where you will record, with the microphone in place. Reccut counts down from 3 and records 5 seconds of silence, then stops by itself. It uses the room tone to find where your voice starts and to fill the pauses between lines.'}
            </p>
            <Meter />
            <Button variant="primary" class="vo-setup-go" icon={Wind} onClick={() => booth.recordRoomTone(5)} disabled={st !== 'idle'}>
              {retry ? 'Try Again' : 'Record Room Tone'}
            </Button>
            <button class="link" onClick={retry ? () => (booth.roomSetup.value = false) : booth.skipRoomTone}>
              {retry ? 'Use it anyway' : tone ? 'Keep the one I have' : 'Skip for now'}
            </button>
            <p class="dim">R starts, Esc {tone || retry ? 'closes' : 'skips'}.</p>
          </>
        )}
        {(counting || recording) && (
          <button class="link" onClick={booth.cancel}>
            Cancel (Esc)
          </button>
        )}
        {booth.inputError.value && <p class="vo-error">{booth.inputError.value}</p>}
      </div>
    </div>
  );
}

// Syr de valgte opptakene sammen i manusrekkefølge, med romlyd i pausene, og legger dem i Edit.
export function SendToEdit({ large = false, disabled = false }) {
  const tone = booth.vo.value.roomTone && booth.opt('voRoomFill') && !booth.plan.value.video;
  const subs = booth.opt('voSubtitles');
  return (
    <>
      {!large && (
        <label class="vo-subs-toggle" title="Also add subtitles with the text from the script, timed to each clip">
          <Toggle checked={subs} onChange={(on) => booth.setVoPrefs({ voSubtitles: on })} /> Subtitles
        </label>
      )}
      <Button variant="primary" class={large ? 'vo-send' : 'small'} icon={Scissors} onClick={() => booth.stitch({ open: true })} disabled={disabled || booth.busy()} title={`Stitch the chosen takes together in script order${tone ? ', with room tone in the pauses,' : ''}${subs ? ' add subtitles from the script,' : ''} and open them in Edit. Again after retakes to replace them. (${MOD}Return)`}>
        Send to Edit
      </Button>
    </>
  );
}

function Assemble() {
  const placed = booth.placedCount();
  const v = booth.vo.value;
  const done = booth.plan.value.items.some((i) => i.active);
  const video = booth.plan.value.video;
  return (
    <div class="vo-section">
      <h4>Stitch</h4>
      <div class="vo-grid">
        <PacingFields />
        <span>Place</span>
        <Segmented size="small" value={booth.opt('voPlace')} onChange={(x) => booth.setVoPrefs({ voPlace: x })} options={[{ value: 'playhead', label: 'At playhead' }, { value: 'end', label: 'At the end' }]} />
        {!video && (
          <>
            <span title="Fill pauses with room tone, so the voice never drops to digital silence">Room tone in pauses</span>
            <Toggle checked={booth.opt('voRoomFill')} onChange={(on) => booth.setVoPrefs({ voRoomFill: on })} />
          </>
        )}
        <span title="Send to Edit also adds subtitles with the text from the script, timed to each clip. Fix them in the Captions tab.">Subtitles from the script</span>
        <Toggle checked={booth.opt('voSubtitles')} onChange={(on) => booth.setVoPrefs({ voSubtitles: on })} />
      </div>
      <SendToEdit large disabled={!done} />
      <p class="dim">
        {video ? 'Talking head takes go into the storyline, cut back to back.' : 'Voice takes go on their own audio track, grouped, under the picture.'}
        {placed ? ` ${placed} clips from the last stitch will be replaced.` : ''}
      </p>
    </div>
  );
}

// Opptak eller AI-stemme, øverst i sidepanelet. Bytter til den personen av den typen som sist ble brukt.
const lastOf = {};
function ModeSwitch() {
  const p = booth.person.value;
  const ai = Boolean(p?.ai);
  lastOf[ai ? 'ai' : 'mic'] = p?.id;
  const busy = booth.status.value !== 'idle';
  const use = (wantAi) => {
    if (wantAi === ai) return;
    const list = booth.people.value.filter((x) => Boolean(x.ai) === wantAi);
    const next = list.find((x) => x.id === lastOf[wantAi ? 'ai' : 'mic']) || list[0];
    if (next) booth.choosePerson(next.id);
    else if (wantAi) openAiVoices();
    else booth.addPerson();
  };
  return (
    <div class="segmented vo-mode" role="radiogroup" aria-label="Voice source">
      <button role="radio" aria-checked={!ai} class={ai ? '' : 'active'} disabled={busy} onClick={() => use(false)} title="Record your own voice with the microphone">
        <Mic size={15} /> Record
      </button>
      <button role="radio" aria-checked={ai} class={ai ? 'active' : ''} disabled={busy} onClick={() => use(true)} title="Use an AI voice that reads the script. Free, and runs on this computer.">
        <Sparkles size={15} /> AI Voice
      </button>
    </div>
  );
}

function SidePane() {
  return (
    <aside class="vo-side">
      <ModeSwitch />
      {!booth.person.value?.ai && <Camera />}
      {!booth.person.value?.ai && <Meter />}
      <Transport />
      <Takes />
      <Sound />
      <Assemble />
      <RecordSettings />
      <RoomTone />
      <FreeTakes />
    </aside>
  );
}

// I teleprompter-visning er bare det viktigste igjen nederst.
function PrompterBar() {
  return (
    <div class="vo-prompter-bar">
      <Meter />
      <Transport />
    </div>
  );
}

function KeyBar() {
  return (
    <footer class="vo-keys">
      {KEYS.map(([k, label]) => (
        <span key={k}>
          <kbd>{k}</kbd> {label}
        </span>
      ))}
    </footer>
  );
}
