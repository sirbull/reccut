// Studioets tidslinje: stemmen slik den blir sydd sammen. Spill gjennom, velg et klipp,
// dra i kantene for å trimme og i hjørnene for fades, og juster volum og pause under.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Sparkles, Timer, Eye, EyeOff, Minus, Play, Plus, RotateCcw, Square, Trash2, UserPlus, Volume2, VolumeX, Wand2, Scissors, X } from 'lucide-preact';
import { Button, IconButton, NumberField, Slider } from '../ui.jsx';
import { formatDuration } from '../../shared/model.js';
import { normalizeGain, peakDbIn } from '../../shared/voiceover.js';
import * as booth from './booth.js';
import * as pv from './preview.js';
import { openAiVoices } from './AiVoice.jsx';
import { PAUSES, PacingFields, isDefaultPacing, pacing, resetPacing, setPause } from './Pacing.jsx';

export const selected = signal(null); // opptakets id
export const pausesOpen = signal(false); // Pauses-vinduet over tidslinjen

const clampPps = (v) => Math.max(6, Math.min(600, v));
const HEAD = 168; // bredden på sporhodene

export function togglePreview() {
  if (pv.playing.value) return pv.stop();
  const plan = booth.plan.value;
  const tone = !plan.video && booth.opt('voRoomFill') ? booth.vo.value.roomTone : null;
  pv.play(plan, pv.time.value, { tone, people: booth.people.value });
}
const playOne = (it) => pv.play({ items: [{ ...it, at: 0, active: true }], gaps: [], end: it.dur }, 0, { people: booth.people.value.filter((p) => p.id === it.person) });

// Sletter valgt klipp fra tidslinjen (linjen hoppes over, opptakene beholdes).
export function deleteSelected() {
  const it = booth.plan.value.items.find((x) => x.take.id === selected.value);
  if (!it) return false;
  pv.stop();
  booth.skipLine(it.take.key, true, it.person);
  selected.value = null;
  return true;
}

function Wave({ file, from, dur, width, height, gain = 0 }) {
  const ref = useRef(null);
  const v = pv.peaksVersion.value;
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(width));
    c.width = w * dpr;
    c.height = height * dpr;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, w, height);
    const pk = pv.peaksFor(file);
    if (!pk) return;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const mid = height / 2;
    for (let x = 0; x < w; x++) {
      const a = Math.floor(((from + (x / w) * dur) / 0.01));
      const b = Math.max(a + 1, Math.floor(((from + ((x + 1) / w) * dur) / 0.01)));
      let m = 0;
      for (let i = a; i < b && i < pk.length; i++) if (pk[i] > m) m = pk[i];
      const h = Math.max(0.5, Math.min(1, Math.sqrt(m * Math.pow(10, gain / 20))) * mid * 0.95);
      g.fillRect(x, mid - h, 1, h * 2);
    }
  }, [file, from, dur, width, height, gain, v]);
  return <canvas ref={ref} class="vt-wave" style={{ width: `${width}px`, height: `${height}px` }} />;
}

// Dra: kanter trimmer, hjørner gir fades. Endringene lagres fortløpende.
function drag(e, take, kind, pps) {
  e.preventDefault();
  e.stopPropagation();
  pv.stop();
  selected.value = take.id;
  const x0 = e.clientX;
  const orig = { in: take.in, out: take.out, fadeIn: take.fadeIn ?? 0.02, fadeOut: take.fadeOut ?? 0.04 };
  const move = (ev) => {
    const d = (ev.clientX - x0) / pps;
    if (kind === 'in') booth.setTake(take.id, { in: Math.round((orig.in + d) * 1000) / 1000 });
    else if (kind === 'out') booth.setTake(take.id, { out: Math.round((orig.out + d) * 1000) / 1000 });
    else if (kind === 'fadeIn') booth.setTake(take.id, { fadeIn: Math.max(0, Math.round((orig.fadeIn + d) * 100) / 100) });
    else if (kind === 'fadeOut') booth.setTake(take.id, { fadeOut: Math.max(0, Math.round((orig.fadeOut - d) * 100) / 100) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

export function VoTimeline() {
  const plan = booth.plan.value;
  const scroller = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Lyden dekodes i bakgrunnen, så bølgeformene kommer etter hvert.
  useEffect(() => {
    for (const it of plan.items) pv.load(it.take.file).catch(() => {});
  }, [plan]);
  useEffect(() => () => pv.close(), []);
  // Effekter og volum per person høres med en gang, også mens det spilles.
  for (const p of booth.people.value) {
    pv.setFx(p.id, p.fx || []);
    pv.setGain(p.id, p.gain || 0);
  }
  // Endres planen mens den spilles, stoppes avspillingen så det som høres stemmer med det som vises.
  const planRef = useRef(plan);
  useEffect(() => {
    if (planRef.current !== plan && pv.playing.value) pv.stop();
    planRef.current = plan;
  }, [plan]);

  const end = Math.max(plan.end, 1);
  const pps = clampPps(((width - HEAD - 40) / end) * zoom);
  const t = pv.time.value;
  // Spillehodet følges når det går ut av synet.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pv.playing.value) return;
    const x = t * pps;
    if (x > el.scrollLeft + el.clientWidth - HEAD - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 40);
  }, [t, pps]);

  const seek = (e) => {
    if (e.target.closest('.vt-clip')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const was = pv.playing.value;
    pv.stop();
    pv.time.value = Math.max(0, Math.min(plan.end, (e.clientX - rect.left) / pps));
    selected.value = null;
    if (was) togglePreview();
  };
  const step = end > 120 ? 10 : end > 40 ? 5 : 1;
  const ticks = [];
  for (let s = 0; s <= end; s += step) ticks.push(s);
  const sel = plan.items.find((x) => x.take.id === selected.value);
  const skipped = Object.keys(booth.vo.value.skip || {}).length;
  const people = booth.people.value;
  const W = end * pps + 40;

  return (
    <section class="vt">
      <div class="vt-bar">
        <IconButton icon={pv.playing.value ? Square : Play} title="Play the voice from the playhead (Shift Space)" onClick={togglePreview} disabled={!plan.items.length} />
        <span class="vt-time">
          {formatDuration(t)} <span class="dim">/ {formatDuration(plan.end)}</span>
        </span>
        <span class="dim">
          {plan.items.filter((i) => i.active).length} clips
          {skipped ? ` · ${skipped} deleted` : ''}
        </span>
        <PausesButton />
        <Button class="small" icon={UserPlus} onClick={booth.addPerson} disabled={booth.busy()} title="Add a person on a new track, with their own takes and sound">
          Add Person
        </Button>
        <Button class="small" icon={Sparkles} onClick={openAiVoices} disabled={booth.busy()} title="Add an AI voice that reads the script. Free, and runs on this computer.">
          Add AI Voice
        </Button>
        <div class="spacer" />
        {skipped > 0 && (
          <Button class="small" icon={RotateCcw} onClick={() => booth.setVo((v) => void (v.skip = {}))} title="Bring back all deleted clips">
            Restore Deleted
          </Button>
        )}
        <IconButton icon={Minus} title="Zoom out" onClick={() => setZoom(Math.max(1, zoom / 1.5))} disabled={zoom <= 1} />
        <IconButton icon={Plus} title="Zoom in" onClick={() => setZoom(Math.min(40, zoom * 1.5))} />
        <Button variant="primary" class="small" icon={Scissors} onClick={() => booth.stitch()} disabled={!plan.items.some((i) => i.active) || booth.busy()}>
          {booth.placedCount() ? 'Stitch Again' : 'Stitch to Timeline'}
        </Button>
      </div>
      <div class="vt-scroll" ref={scroller}>
        <div class="vt-content" style={{ width: `${HEAD + W}px` }}>
          <div class="vt-row vt-ruler-row">
            <div class="vt-head vt-head-ruler" />
            <div class="vt-lane vt-ruler" style={{ width: `${W}px` }} onPointerDown={seek}>
              {ticks.map((s) => (
                <span key={s} style={{ left: `${s * pps}px` }}>
                  {formatDuration(s)}
                </span>
              ))}
              <div class="vt-playhead" style={{ left: `${t * pps}px` }} />
            </div>
          </div>
          {people.map((p) => (
            <div key={p.id} class={`vt-row${p.hidden ? ' hidden' : ''}${p.muted ? ' muted' : ''}${p.id === booth.personId.value ? ' active' : ''}`}>
              <TrackHead p={p} />
              <div class="vt-lane" style={{ width: `${W}px` }} onPointerDown={seek}>
                {!p.hidden && (
                  <>
                    {plan.gaps.map((g) => (
                      <div key={`g${g.at}`} class="vt-gap" style={{ left: `${g.at * pps}px`, width: `${g.dur * pps}px` }} title={`Pause ${g.dur.toFixed(2)} s`} />
                    ))}
                    {plan.items
                      .filter((it) => it.person === p.id)
                      .map((it) => (
                        <Clip key={it.take.id} it={it} pps={pps} color={p.color} />
                      ))}
                  </>
                )}
                <div class="vt-playhead" style={{ left: `${t * pps}px` }} />
              </div>
            </div>
          ))}
          {!plan.items.length && <p class="dim vt-empty">The takes you keep show up here in script order, the way they will be stitched. Play them through, trim them and adjust them. Add a person to record another voice on its own track.</p>}
        </div>
      </div>
      {sel && <ClipControls it={sel} />}
    </section>
  );
}

function Clip({ it, pps, color }) {
  const take = it.take;
  const w = Math.max(4, it.dur * pps);
  const on = selected.value === take.id;
  const current = booth.current.value?.key === take.key;
  const fi = take.fadeIn ?? 0.02,
    fo = take.fadeOut ?? 0.04;
  const H = 54;
  return (
    <div
      class={`vt-clip${on ? ' on' : ''}${current ? ' current' : ''}${take.video ? ' video' : ''}${it.active === false ? ' inactive' : ''}`}
      style={{ left: `${it.at * pps}px`, width: `${w}px`, background: color }}
      title={`${booth.lineNumber(it.block)}. ${it.block.text}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        selected.value = take.id;
        booth.goTo(it.block.index);
        booth.choosePerson(it.person);
      }}
      onDblClick={() => playOne(it)}
    >
      <div class="vt-label">
        <b>{booth.lineNumber(it.block)}</b> {it.block.text}
      </div>
      <Wave file={take.file} from={it.in} dur={it.dur} width={w} height={H} gain={take.gain || 0} />
      <svg class="vt-fades" width={w} height={H} viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none">
        {fi > 0 && <polygon points={`0,0 ${fi * pps},0 0,${H}`} />}
        {fo > 0 && <polygon points={`${w},0 ${w - fo * pps},0 ${w},${H}`} />}
      </svg>
      {(take.gain || 0) !== 0 && <span class="vt-gain">{take.gain > 0 ? '+' : ''}{take.gain} dB</span>}
      {on && (
        <>
          <div class="vt-edge in" title="Drag to trim the start" onPointerDown={(e) => drag(e, take, 'in', pps)} />
          <div class="vt-edge out" title="Drag to trim the end" onPointerDown={(e) => drag(e, take, 'out', pps)} />
          <div class="vt-fade in" style={{ left: `${fi * pps}px` }} title="Drag to fade in" onPointerDown={(e) => drag(e, take, 'fadeIn', pps)} />
          <div class="vt-fade out" style={{ right: `${fo * pps}px` }} title="Drag to fade out" onPointerDown={(e) => drag(e, take, 'fadeOut', pps)} />
        </>
      )}
    </div>
  );
}

function ClipControls({ it }) {
  const take = it.take;
  const gain = take.gain || 0;
  const normalize = async () => {
    await pv.load(take.file).catch(() => null);
    const pk = pv.peaksFor(take.file);
    const peak = pk ? peakDbIn(pk, take.in, take.out) : take.peakDb;
    booth.setTake(take.id, { gain: normalizeGain(peak, -3) });
  };
  return (
    <div class="vt-controls">
      <b class="vt-name">
        {booth.people.value.length > 1 ? `${booth.people.value.find((p) => p.id === it.person)?.name}, ` : ''}line {booth.lineNumber(it.block)}, take {take.n}
      </b>
      <IconButton icon={Play} size={14} title="Play this clip (double click)" onClick={() => playOne(it)} />
      <label class="vt-ctl" title="Volume">
        Volume
        <Slider value={gain} min={-24} max={12} step={0.5} center={0} onInput={(x) => booth.setTake(take.id, { gain: x })} />
        <NumberField value={gain} min={-24} max={12} step={0.5} precision={1} unit="dB" width={66} onChange={(x) => booth.setTake(take.id, { gain: x })} />
      </label>
      <IconButton icon={Wand2} size={14} title="Normalize: peak at -3 dB" onClick={normalize} />
      <label class="vt-ctl">
        Fade in
        <NumberField value={take.fadeIn ?? 0.02} min={0} max={5} step={0.01} precision={2} unit="s" width={66} onChange={(x) => booth.setTake(take.id, { fadeIn: x })} />
      </label>
      <label class="vt-ctl">
        Fade out
        <NumberField value={take.fadeOut ?? 0.04} min={0} max={5} step={0.01} precision={2} unit="s" width={66} onChange={(x) => booth.setTake(take.id, { fadeOut: x })} />
      </label>
      <PauseControl it={it} />
      <label class="vt-ctl">
        Start
        <NumberField value={take.in} min={0} max={take.out - 0.05} step={0.01} precision={2} unit="s" width={66} onChange={(x) => booth.setTake(take.id, { in: x })} />
      </label>
      <label class="vt-ctl">
        End
        <NumberField value={take.out} min={take.in + 0.05} max={take.duration} step={0.01} precision={2} unit="s" width={66} onChange={(x) => booth.setTake(take.id, { out: x })} />
      </label>
      <div class="spacer" />
      <Button class="small" icon={Trash2} onClick={deleteSelected} title="Delete the clip from the timeline (Backspace). The takes are kept.">
        Delete
      </Button>
    </div>
  );
}

// Hvilken standardpause som gjelder etter et klipp: setning, avsnitt eller seksjon (eller ingen, til slutt).
function pauseKind(it) {
  const next = booth.plan.value.items.find((x) => x.active && x.at > it.at + 1e-6);
  if (!next) return null;
  const a = it.block,
    b = next.block;
  return b.section !== a.section ? 'section' : b.para !== a.para ? 'paragraph' : 'sentence';
}

// Pausen etter klippet: følger standarden for setning, avsnitt eller seksjon, eller settes for hånd.
// En pause satt for hånd kan gjøres til ny standard for alle pauser av samme slag.
function PauseControl({ it }) {
  const take = it.take;
  const kind = pauseKind(it);
  if (!kind) return <span class="vt-ctl dim">Last clip, no pause after</span>;
  const def = pacing()[kind];
  const label = PAUSES.find((p) => p.key === kind).label.toLowerCase();
  return (
    <label class="vt-ctl" title={`Pause after this clip. The default ${label} is ${def.toFixed(2)} s.`}>
      Pause after
      <NumberField value={take.pause ?? def} min={0} max={10} step={0.05} precision={2} unit="s" width={66} onChange={(x) => booth.setTake(take.id, { pause: x })} />
      {take.pause != null ? (
        <>
          <button class="link" onClick={() => booth.setTake(take.id, { pause: null })} title={`Back to the default ${label}`}>
            Default
          </button>
          <button
            class="link"
            onClick={() => {
              setPause(kind, take.pause);
              booth.setTake(take.id, { pause: null });
            }}
            title={`Use ${take.pause.toFixed(2)} s as the default ${label} for all clips`}
          >
            Use for all
          </button>
        </>
      ) : (
        <span class="dim">{label}</span>
      )}
    </label>
  );
}

// Standardpausene, rett ved tidslinjen. Pauser satt for hånd på enkeltklipp kan nullstilles her.
function PausesButton() {
  const open = pausesOpen.value;
  const setOpen = (v) => (pausesOpen.value = v);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  const manual = booth.vo.value.takes.filter((t) => t.pause != null);
  return (
    <div class="vt-pauses" ref={ref}>
      <Button class={`small${open ? ' active' : ''}`} icon={Timer} onClick={() => setOpen(!open)} title="The default space between clips">
        Pauses
      </Button>
      {open && (
        <div class="vt-pop">
          <b>Space between clips</b>
          <p class="dim">The script decides which pause is used. Select a clip to give it its own pause.</p>
          <div class="vo-grid">
            <PacingFields />
          </div>
          <div class="vt-pop-actions">
            <Button class="small" icon={RotateCcw} onClick={resetPacing} disabled={isDefaultPacing()}>
              Reset
            </Button>
            {manual.length > 0 && (
              <Button class="small" onClick={() => booth.setVo((v) => v.takes.forEach((t) => delete t.pause))} title="Clips with their own pause go back to the defaults">
                Clear {manual.length} own {manual.length === 1 ? 'pause' : 'pauses'}
              </Button>
            )}
          </div>
          <p class="dim">Also in Settings, Editing.</p>
        </div>
      )}
    </div>
  );
}

// Sporhodet: navn (dobbeltklikk for å endre), demp, solo, skjul og fjern.
function TrackHead({ p }) {
  const [editing, setEditing] = useState(false);
  const many = booth.people.value.length > 1;
  return (
    <div class="vt-head" onPointerDown={() => booth.choosePerson(p.id)} title={`${p.name}: click to record as ${p.name} and adjust the sound`}>
      <div class="vt-head-name">
        <span class="vt-dot" style={{ background: p.color }} />
        {editing ? (
          <input
            class="vt-rename"
            value={p.name}
            autoFocus
            onBlur={(e) => {
              booth.renamePerson(p.id, e.currentTarget.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
          />
        ) : (
          <b class="vt-person" title="Double click to rename" onDblClick={() => setEditing(true)}>
            {p.name}
          </b>
        )}
      </div>
      <div class="vt-head-tools">
        <IconButton icon={p.muted ? VolumeX : Volume2} size={13} title={p.muted ? 'Muted: not heard and not stitched. Click to hear.' : 'Mute: not heard and not stitched'} active={p.muted} onClick={() => booth.toggleMute(p.id)} />
        {many && (
          <button class={`icon-btn vt-solo${!p.muted && booth.people.value.every((x) => x.id === p.id || x.muted) ? ' active' : ''}`} title="Solo: hear only this person" onClick={() => booth.toggleSolo(p.id)}>
            S
          </button>
        )}
        <IconButton icon={p.hidden ? EyeOff : Eye} size={13} title={p.hidden ? 'Show the track' : 'Hide the track'} active={p.hidden} onClick={() => booth.toggleHidden(p.id)} />
        {many && <IconButton icon={X} size={13} title="Remove the person and their takes from the studio (the files stay in the Media browser)" onClick={() => booth.removePerson(p.id)} />}
      </div>
    </div>
  );
}
