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
  X,
} from 'lucide-preact';
import { Button, IconButton, NumberField, Segmented, Select, Toggle, toast } from '../ui.jsx';
import { prefs, setPrefs } from '../prefs.js';
import { project } from '../editor/store.js';
import { isTyping } from '../keyboard.js';
import { chosenTake, orphanTakes, progress, readingTime, DEFAULT_PACING } from '../../shared/voiceover.js';
import { formatDuration } from '../../shared/model.js';
import * as booth from './booth.js';

const api = window.api;
const isMac = api.platform === 'darwin';
const MOD = isMac ? '⌘' : 'Ctrl+';
const SCRIPT_EXT = ['typeloom', 'docx', 'pdf', 'md', 'markdown', 'txt', 'fountain', 'fdx', 'rtf', 'html', 'htm'];

const db = (v) => (v > 1e-6 ? 20 * Math.log10(v) : -120);
const meterPos = (dbv) => Math.max(0, Math.min(1, (dbv + 60) / 60));
const secs = (v) => `${v.toFixed(1)} s`;

export const KEYS = [
  ['Space', 'Record / stop and keep'],
  ['R', 'Retake: discard and start the line again'],
  ['Esc', 'Discard the take that is recording'],
  ['⌫', 'Last take was bad, go back to it'],
  ['↑ ↓', 'Previous / next line'],
  ['⇧↑ ⇧↓', 'Previous / next section'],
  ['N', 'Next line without a take'],
  ['P', 'Play the chosen take'],
  ['S', 'Star the chosen take'],
  ['M', 'Prompter view'],
  [`${MOD}↩`, 'Stitch takes to the timeline'],
];

function onBoothKey(e) {
  if (!booth.boothOpen.value) return;
  const typing = isTyping(e);
  if (typing) {
    if (e.key === 'Escape') document.activeElement?.blur?.();
    return;
  }
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key;
  let handled = true;
  if (k === ' ' || e.code === 'Space') booth.toggle();
  else if (k === 'Escape') booth.busy() ? booth.cancel() : booth.closeBooth();
  else if (mod && k === 'Enter') booth.stitch();
  else if (mod) handled = false;
  else if (k === 'r' || k === 'R') booth.retake();
  else if ((k === 'Backspace' || k === 'Delete') && !booth.busy()) booth.scrapLast();
  else if (k === 'ArrowUp') e.shiftKey ? booth.stepSection(-1) : booth.step(-1);
  else if (k === 'ArrowDown') e.shiftKey ? booth.stepSection(1) : booth.step(1);
  else if (k === 'Enter') booth.step(1);
  else if (k === 'n' || k === 'N') booth.goNextMissing();
  else if (k === 'p' || k === 'P') booth.playCurrent();
  else if (k === 's' || k === 'S') {
    const t = booth.current.value && chosenTake(booth.vo.value, booth.current.value.key);
    if (t) booth.toggleStar(t);
  } else if (k === 'm' || k === 'M') setPrefs({ voPrompter: !booth.opt('voPrompter') });
  else if (k === '+' || k === '=') setPrefs({ voFont: Math.min(96, booth.opt('voFont') + 2) });
  else if (k === '-') setPrefs({ voFont: Math.max(14, booth.opt('voFont') - 2) });
  else handled = false;
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function VoiceoverBooth() {
  const ref = useRef(null);
  useEffect(() => {
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
        <ScriptPane />
        {!prompter && <SidePane />}
      </div>
      {prompter && <PrompterBar />}
      <KeyBar />
    </div>
  );
}

function BoothHeader() {
  const v = booth.vo.value;
  const { done, total } = progress(booth.blocks.value, v);
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
      <AudioWaveform size={16} />
      <b>Voice Over Studio</b>
      {v.script && (
        <span class="dim vo-progress" title="Lines with a usable take">
          {done} of {total} lines · about {formatDuration(readingTime(booth.blocks.value))} to read
        </span>
      )}
      <div class="spacer" />
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
      <IconButton icon={X} title="Close the studio (Esc)" onClick={booth.closeBooth} />
    </header>
  );
}

/* Manus */

function ScriptPane() {
  const v = booth.vo.value;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
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
  const startEdit = () => {
    setDraft(v.script?.text || '');
    setEditing(true);
  };
  const saveEdit = () => {
    booth.useScript(v.script?.name || 'Voiceover script', draft);
    setEditing(false);
  };
  const docs = (project.value.story?.documents || []).filter((d) => d.text?.trim());

  return (
    <section class={`vo-script${over ? ' drop' : ''}`} onDragOver={dragOver} onDragLeave={() => setOver(false)} onDrop={drop}>
      <div class="vo-script-bar">
        <Button icon={FolderOpen} class="small" onClick={open} title="Typeloom, Word, PDF, Markdown, text, Fountain, Final Draft or RTF">
          Open Script…
        </Button>
        {editing ? (
          <>
            <Button variant="primary" class="small" icon={Check} onClick={saveEdit}>
              Done
            </Button>
            <Button class="small" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button icon={Pencil} class="small" onClick={startEdit}>
            {v.script ? 'Edit' : 'Write or Paste'}
          </Button>
        )}
        {v.script && <span class="dim vo-script-name" title={v.script.name}>{v.script.name}</span>}
        <div class="spacer" />
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
      {editing ? (
        <textarea class="vo-editor" value={draft} onInput={(e) => setDraft(e.currentTarget.value)} placeholder={'Write or paste the script.\n\nBlank lines separate paragraphs. Lines starting with # are sections, and lines starting with = are notes that are not read.\n[Directions in brackets] are shown, but are part of the line.'} autoFocus />
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
  const chosen = chosenTake(v, b.key);
  const rec = booth.recordingKey.value === b.key && booth.status.value === 'recording';
  return (
    <div class={`vo-block vo-line${current ? ' current' : ''}${chosen ? ' done' : ''}${rec ? ' rec' : ''}`} onClick={() => booth.goTo(b.index)}>
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
      {takes.length > 0 && (
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
  return (
    <div class="vo-transport">
      <button class={`vo-rec${recording ? ' on' : ''}${st === 'countin' || st === 'cue' ? ' wait' : ''}`} disabled={st === 'saving' || st === 'tone'} onClick={booth.toggle} title="Record / stop (Space)">
        {recording ? <Square size={18} /> : <span class="vo-rec-dot" />}
        <span>
          {st === 'countin' ? `Starting in ${booth.countLeft.value}` : st === 'cue' ? 'Cue…' : recording ? formatDuration(booth.elapsed.value) : st === 'saving' ? 'Saving…' : st === 'tone' ? 'Room tone…' : cur ? `Record line ${booth.lineNumber(cur)}` : 'Record'}
        </span>
      </button>
      <div class="vo-transport-row">
        <Button class="small" icon={RotateCcw} onClick={booth.retake} disabled={st === 'saving' || st === 'tone'} title="Discard what is recording and start the line again (R)">
          Retake
        </Button>
        <IconButton icon={ChevronUp} title="Previous line (↑)" onClick={() => booth.step(-1)} disabled={recording} />
        <IconButton icon={ChevronDown} title="Next line (↓)" onClick={() => booth.step(1)} disabled={recording} />
        <IconButton icon={SkipForward} title="Next line without a take (N)" onClick={booth.goNextMissing} disabled={recording} />
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

function Takes() {
  const cur = booth.current.value;
  const v = booth.vo.value;
  if (!cur) return null;
  const takes = booth.takesFor(cur.key);
  const chosen = chosenTake(v, cur.key);
  return (
    <div class="vo-section">
      <h4>
        Takes for line {booth.lineNumber(cur)}
        {takes.length > 0 && <span class="dim"> · {takes.length}</span>}
      </h4>
      {!takes.length && <p class="dim">No takes yet. Press Space and read the line.</p>}
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
        <IconButton icon={Star} size={13} title="Star: a circled take, preferred when stitching (S)" active={t.star} onClick={() => booth.toggleStar(t)} />
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
        <Segmented size="small" value={Number(booth.opt('voCountIn'))} onChange={(n) => setPrefs({ voCountIn: n })} options={[{ value: 0, label: 'Off' }, { value: 1, label: '1 s' }, { value: 3, label: '3 s' }]} />
        <span title="Before each take, play the end of the take before it, so the new line matches its tone and pace">Cue last line</span>
        <Toggle checked={booth.opt('voCue')} onChange={(on) => setPrefs({ voCue: on })} />
        <span title="Go to the next line when a take is kept">Next line after a take</span>
        <Toggle checked={booth.opt('voAutoAdvance')} onChange={(on) => setPrefs({ voAutoAdvance: on })} />
        <span title="Air kept before the voice starts">Air before</span>
        <NumberField value={booth.opt('voPreRoll')} min={0} max={1} step={0.01} precision={2} unit="s" width={70} onChange={(x) => setPrefs({ voPreRoll: x })} />
        <span title="Air kept after the voice ends">Air after</span>
        <NumberField value={booth.opt('voPostRoll')} min={0} max={2} step={0.01} precision={2} unit="s" width={70} onChange={(x) => setPrefs({ voPostRoll: x })} />
      </div>
      <p class="dim">Each take is trimmed where your voice starts and ends. The air settings apply to new takes.</p>
    </div>
  );
}

function RoomTone() {
  const tone = booth.vo.value.roomTone;
  return (
    <div class="vo-section">
      <h4>Room tone</h4>
      <p class="dim">Five seconds of the quiet room. It fills the pauses between lines and helps find where your voice starts.</p>
      <div class="vo-transport-row">
        <Button class="small" icon={Wind} onClick={() => booth.recordRoomTone(5)} disabled={booth.busy()}>
          {tone ? 'Record Again' : 'Record Room Tone'}
        </Button>
        {tone && <span class="dim">Floor {tone.floor} dB</span>}
      </div>
    </div>
  );
}

function Assemble() {
  const pacing = { ...DEFAULT_PACING, ...booth.opt('voPacing') };
  const setPace = (k, x) => setPrefs({ voPacing: { ...pacing, [k]: x } });
  const placed = booth.placedCount();
  const v = booth.vo.value;
  const { done } = progress(booth.blocks.value, v);
  const video = booth.lines.value.map((b) => chosenTake(v, b.key)).filter(Boolean).every((t) => t.video) && done > 0;
  return (
    <div class="vo-section">
      <h4>Stitch</h4>
      <div class="vo-grid">
        <span title="Pause after a sentence in the same paragraph">After a sentence</span>
        <NumberField value={pacing.sentence} min={0} max={5} step={0.05} precision={2} unit="s" width={70} onChange={(x) => setPace('sentence', x)} />
        <span>After a paragraph</span>
        <NumberField value={pacing.paragraph} min={0} max={5} step={0.05} precision={2} unit="s" width={70} onChange={(x) => setPace('paragraph', x)} />
        <span>Before a section</span>
        <NumberField value={pacing.section} min={0} max={10} step={0.1} precision={1} unit="s" width={70} onChange={(x) => setPace('section', x)} />
        <span>Place</span>
        <Segmented size="small" value={booth.opt('voPlace')} onChange={(x) => setPrefs({ voPlace: x })} options={[{ value: 'playhead', label: 'At playhead' }, { value: 'end', label: 'At the end' }]} />
        {!video && (
          <>
            <span title="Fill pauses with room tone, so the voice never drops to digital silence">Room tone in pauses</span>
            <Toggle checked={booth.opt('voRoomFill')} onChange={(on) => setPrefs({ voRoomFill: on })} />
          </>
        )}
      </div>
      <Button variant="primary" icon={Scissors} onClick={() => booth.stitch()} disabled={!done || booth.busy()} title={`Put the chosen takes on the timeline in script order (${MOD}Return)`}>
        {placed ? 'Stitch Again' : 'Stitch to Timeline'}
      </Button>
      <p class="dim">
        {video ? 'Talking head takes go into the storyline, cut back to back.' : 'Voice takes go on their own audio track, grouped, under the picture.'}
        {placed ? ` ${placed} clips from the last stitch will be replaced.` : ''}
      </p>
    </div>
  );
}

function SidePane() {
  return (
    <aside class="vo-side">
      <Camera />
      <Meter />
      <Transport />
      <Takes />
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
