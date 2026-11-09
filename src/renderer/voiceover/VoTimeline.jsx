// Studioets tidslinje: stemmen slik den blir sydd sammen. Spill gjennom, velg et klipp,
// dra i kantene for å trimme og i hjørnene for fades, og juster volum og pause under.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Minus, Play, Plus, RotateCcw, Square, Trash2, Wand2, Scissors } from 'lucide-preact';
import { Button, IconButton, NumberField, Slider } from '../ui.jsx';
import { formatDuration } from '../../shared/model.js';
import { normalizeGain, peakDbIn } from '../../shared/voiceover.js';
import * as booth from './booth.js';
import * as pv from './preview.js';

export const selected = signal(null); // opptakets id

const clampPps = (v) => Math.max(6, Math.min(600, v));

export function togglePreview() {
  if (pv.playing.value) return pv.stop();
  const plan = booth.plan.value;
  const tone = !plan.video && booth.opt('voRoomFill') ? booth.vo.value.roomTone : null;
  pv.play(plan, pv.time.value, { tone });
}

// Sletter valgt klipp fra tidslinjen (linjen hoppes over, opptakene beholdes).
export function deleteSelected() {
  const it = booth.plan.value.items.find((x) => x.take.id === selected.value);
  if (!it) return false;
  pv.stop();
  booth.skipLine(it.take.key, true);
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
  // Endres planen mens den spilles, stoppes avspillingen så det som høres stemmer med det som vises.
  const planRef = useRef(plan);
  useEffect(() => {
    if (planRef.current !== plan && pv.playing.value) pv.stop();
    planRef.current = plan;
  }, [plan]);

  const end = Math.max(plan.end, 1);
  const pps = clampPps(((width - 40) / end) * zoom);
  const t = pv.time.value;
  // Spillehodet følges når det går ut av synet.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pv.playing.value) return;
    const x = t * pps;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 40);
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

  return (
    <section class="vt">
      <div class="vt-bar">
        <IconButton icon={pv.playing.value ? Square : Play} title="Play the voice from the playhead (Shift Space)" onClick={togglePreview} disabled={!plan.items.length} />
        <span class="vt-time">
          {formatDuration(t)} <span class="dim">/ {formatDuration(plan.end)}</span>
        </span>
        <span class="dim">
          {plan.items.length} {plan.items.length === 1 ? 'clip' : 'clips'}
          {skipped ? ` · ${skipped} deleted` : ''}
        </span>
        <div class="spacer" />
        {skipped > 0 && (
          <Button class="small" icon={RotateCcw} onClick={() => booth.setVo((v) => void (v.skip = {}))} title="Bring back all deleted clips">
            Restore Deleted
          </Button>
        )}
        <IconButton icon={Minus} title="Zoom out" onClick={() => setZoom(Math.max(1, zoom / 1.5))} disabled={zoom <= 1} />
        <IconButton icon={Plus} title="Zoom in" onClick={() => setZoom(Math.min(40, zoom * 1.5))} />
        <Button variant="primary" class="small" icon={Scissors} onClick={() => booth.stitch()} disabled={!plan.items.length || booth.busy()}>
          {booth.placedCount() ? 'Stitch Again' : 'Stitch to Timeline'}
        </Button>
      </div>
      <div class="vt-scroll" ref={scroller}>
        {!plan.items.length ? (
          <p class="dim vt-empty">The takes you keep show up here in script order, the way they will be stitched. Play them through, trim them and adjust them.</p>
        ) : (
          <div class="vt-track" style={{ width: `${end * pps + 40}px` }} onPointerDown={seek}>
            <div class="vt-ruler">
              {ticks.map((s) => (
                <span key={s} style={{ left: `${s * pps}px` }}>
                  {formatDuration(s)}
                </span>
              ))}
            </div>
            {plan.gaps.map((g) => (
              <div key={`g${g.at}`} class="vt-gap" style={{ left: `${g.at * pps}px`, width: `${g.dur * pps}px` }} title={`Pause ${g.dur.toFixed(2)} s`} />
            ))}
            {plan.items.map((it) => (
              <Clip key={it.take.id} it={it} pps={pps} />
            ))}
            <div class="vt-playhead" style={{ left: `${t * pps}px` }} />
          </div>
        )}
      </div>
      {sel && <ClipControls it={sel} />}
    </section>
  );
}

function Clip({ it, pps }) {
  const take = it.take;
  const w = Math.max(4, it.dur * pps);
  const on = selected.value === take.id;
  const current = booth.current.value?.key === take.key;
  const fi = take.fadeIn ?? 0.02,
    fo = take.fadeOut ?? 0.04;
  const H = 54;
  return (
    <div
      class={`vt-clip${on ? ' on' : ''}${current ? ' current' : ''}${take.video ? ' video' : ''}`}
      style={{ left: `${it.at * pps}px`, width: `${w}px` }}
      title={`${booth.lineNumber(it.block)}. ${it.block.text}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        selected.value = take.id;
        booth.goTo(it.block.index);
      }}
      onDblClick={() => pv.play({ items: [{ ...it, at: 0 }], gaps: [], end: it.dur }, 0)}
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
        {booth.lineNumber(it.block)}. Take {take.n}
      </b>
      <IconButton icon={Play} size={14} title="Play this clip (double click)" onClick={() => pv.play({ items: [{ ...it, at: 0 }], gaps: [], end: it.dur }, 0)} />
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
      <label class="vt-ctl" title="Pause after this clip. Auto follows the script.">
        Pause after
        <NumberField value={take.pause ?? autoPause(it)} min={0} max={10} step={0.05} precision={2} unit="s" width={66} onChange={(x) => booth.setTake(take.id, { pause: x })} />
        {take.pause != null && (
          <button class="link" onClick={() => booth.setTake(take.id, { pause: null })}>
            Auto
          </button>
        )}
      </label>
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

// Pausen etter et klipp slik planen har lagt den (inkludert opptakets egen romlyd).
function autoPause(it) {
  const items = booth.plan.value.items;
  const i = items.findIndex((x) => x.take.id === it.take.id);
  const next = items[i + 1];
  if (!next) return 0;
  return Math.round((next.at - it.at - (it.take.out - it.take.in)) * 100) / 100;
}
