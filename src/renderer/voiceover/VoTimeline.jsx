// Studioets tidslinje: stemmen slik den blir sydd sammen. Spill gjennom, velg et klipp,
// dra i kantene for å trimme og i hjørnene for fades, og juster volum og pause under.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Timer, Eye, EyeOff, Minus, Play, Plus, RotateCcw, Square, Trash2, UserPlus, Volume2, VolumeX, Wand2, Scissors, X } from 'lucide-preact';
import { Button, IconButton, NumberField, Slider } from '../ui.jsx';
import { formatDuration, kfTime, valueAt } from '../../shared/model.js';
import { formatVolumeDb, moveVolumeKeyframe, shiftVolume, volumeDelta, volumePath, volumeSegment, volumeY } from '../editor/volume.js';
import { normalizeGain, peakDbIn, roomToneFill } from '../../shared/voiceover.js';
import { setPrefs } from '../prefs.js';
import { audioSkimming } from '../editor/store.js';
import * as booth from './booth.js';
import * as pv from './preview.js';
import { PAUSES, PacingFields, isDefaultPacing, pacing, resetPacing, setPause } from './Pacing.jsx';
import { SendToEdit } from './Booth.jsx';

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

/* Volum som i Edit: dra linjen opp eller ned, Alt-klikk for et nøkkelbilde, dra punktene, høyreklikk for å slette.
   Opptaket gjøres om til et klipp i Edit-formatet, så linjen tegnes og endres med samme kode som der. */
const asClip = (it) => ({ in: it.in, start: it.at, dur: it.dur, props: { volume: it.take.gain || 0 }, kf: it.take.volKf?.length ? { volume: it.take.volKf.map((k) => [...k]) } : {} });
const saveVolume = (take, c) => booth.setTake(take.id, c.kf.volume?.length ? { volKf: c.kf.volume } : { gain: c.props.volume, volKf: null });

function volumeDrag(e, it, pps, H, kfIndex = null) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pv.stop();
  selected.value = it.take.id;
  const base = asClip(it);
  const rect = e.currentTarget.closest('.vt-clip').getBoundingClientRect();
  const T = it.at + (e.clientX - rect.left) / pps;
  if (e.altKey) {
    if (kfIndex != null) return;
    // Nytt punkt på linjen, med volumet som er der.
    const list = [...(base.kf.volume || []), [Math.round(kfTime(base, T) * 1000) / 1000, Math.round((valueAt(base, 'volume', T) ?? 0) * 10) / 10]];
    return booth.setTake(it.take.id, { volKf: list.sort((a, b) => a[0] - b[0]) });
  }
  const indices = kfIndex == null ? volumeSegment(base, 'volume', T) : [kfIndex];
  const x0 = e.clientX;
  const y0 = e.clientY;
  let dir = kfIndex == null ? 'y' : null; // et punkt dras opp/ned eller sidelengs, etter første bevegelse
  const move = (ev) => {
    const dx = ev.clientX - x0;
    const dy = y0 - ev.clientY;
    if (!dir) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    const c = asClip(it);
    if (dir === 'x') moveVolumeKeyframe(c, 'volume', kfIndex, base.kf.volume[kfIndex][0] + dx / pps, 0.01);
    else shiftVolume(c, 'volume', volumeDelta(dy, H), indices);
    saveVolume(it.take, c);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

async function deleteKeyframe(e, it, i) {
  e.preventDefault();
  e.stopPropagation();
  if ((await window.api.popupMenu([{ id: 'delete', label: 'Delete Keyframe' }])) !== 'delete') return;
  const list = (it.take.volKf || []).filter((_, k) => k !== i);
  // Med ett punkt igjen blir det vanlig volum for hele klippet, som i Edit.
  booth.setTake(it.take.id, list.length > 1 ? { volKf: list } : { gain: list[0]?.[1] ?? it.take.gain ?? 0, volKf: null });
}

function VolumeLine({ it, pps, w, H }) {
  const c = asClip(it);
  const path = volumePath(c, 'volume', w, H, pps);
  const alt = window.api.platform === 'darwin' ? 'Option' : 'Alt';
  return (
    <>
      <svg class="vt-vol" width={w} height={H}>
        <path class="vol-line" d={path} />
        <path class="vol-line-hit" d={path} onPointerDown={(e) => volumeDrag(e, it, pps, H)}>
          <title>{`${it.take.volKf?.length ? 'Volume keyframes' : formatVolumeDb(it.take.gain || 0)} · Drag to adjust the volume. ${alt} click to add a keyframe.`}</title>
        </path>
      </svg>
      {(c.kf.volume || []).map(([t, v], i) => (
        <div key={i} class="vol-kf-point" style={{ left: `${(t - c.in) * pps - 6}px`, top: `${16 + volumeY(v, H) - 6}px` }} onPointerDown={(e) => volumeDrag(e, it, pps, H, i)} onContextMenu={(e) => deleteKeyframe(e, it, i)} title={`${formatVolumeDb(v)}. Drag up or down for volume, sideways to move. Right click to delete.`} />
      ))}
    </>
  );
}

// Dra for å skrubbe: spillehodet følger pekeren, med lyd. lane: elementet tiden måles fra.
function scrubDrag(e, lane, pps, { onUp = null, threshold = 0 } = {}) {
  const rect = lane.getBoundingClientRect();
  const plan = booth.plan.value;
  const at = (x) => Math.max(0, Math.min(plan.end, (x - rect.left) / pps));
  const x0 = e.clientX;
  let on = threshold === 0;
  if (on) pv.time.value = at(e.clientX);
  const move = (ev) => {
    if (!on && Math.abs(ev.clientX - x0) < threshold) return;
    on = true;
    pv.time.value = at(ev.clientX);
    pv.scrub(plan, pv.time.value, booth.people.value);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onUp?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
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

// Kanten over tidslinjen dras for å gjøre den høyere og manuset lavere.
function resizeTimeline(e) {
  e.preventDefault();
  const y0 = e.clientY;
  const h0 = booth.opt('voTimelineH');
  const move = (ev) => setPrefs({ voTimelineH: Math.round(Math.max(110, Math.min(window.innerHeight - 320, h0 + y0 - ev.clientY))) });
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// Dra underkanten av et spor for å gjøre det høyere, så bølgeformen blir lettere å se.
const ROW_H = 76;
function resizeRow(e, h0, set) {
  e.preventDefault();
  e.stopPropagation();
  const y0 = e.clientY;
  const move = (ev) => set(Math.round(Math.max(44, Math.min(320, h0 + ev.clientY - y0))));
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
const RowSize = ({ h, set }) => <div class="vt-row-size" title="Drag to make the track taller or lower" onPointerDown={(e) => resizeRow(e, h, set)} />;

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
    pv.setClean(p.id, p.clean);
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
  // Spillehodet følger linjen som er valgt: til klippet, eller dit klippet kommer når linjen ikke er tatt opp.
  // Etter et nytt opptak står det rett etter det nye klippet.
  const cur = booth.current.value;
  const who = booth.personId.value;
  const takes = booth.vo.value.takes;
  const seen = useRef(takes.length);
  useEffect(() => {
    if (pv.playing.value || !cur) return;
    const live = plan.items.filter((it) => it.active !== false);
    const fresh = takes.length > seen.current ? live.find((it) => it.take.id === takes.at(-1).id) : null;
    seen.current = takes.length;
    const own = live.find((it) => it.take.key === cur.key && it.person === who);
    const at = fresh ? fresh.at + fresh.dur : own ? own.at : live.find((it) => it.block.index > cur.index)?.at ?? plan.end;
    pv.time.value = at;
    const el = scroller.current;
    if (el && (at * pps < el.scrollLeft || at * pps > el.scrollLeft + el.clientWidth - HEAD - 40)) el.scrollLeft = Math.max(0, at * pps - 80);
  }, [cur?.key, who, takes.length]);
  // Spillehodet følges når det går ut av synet.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !pv.playing.value) return;
    const x = t * pps;
    if (x > el.scrollLeft + el.clientWidth - HEAD - 40 || x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 40);
  }, [t, pps]);

  // Klikk flytter spillehodet. Dra for å skrubbe, med lyd, som i Edit.
  const seek = (e) => {
    if (e.button !== 0 || e.target.closest('.vt-clip:not(.vt-tone-clip)')) return;
    const was = pv.playing.value;
    pv.stop();
    selected.value = null;
    scrubDrag(e, e.currentTarget, pps, { onUp: () => was && togglePreview() });
  };
  // Skumming som i Edit: en linje følger pekeren, og lyden høres når lydskumming er på.
  const [skim, setSkim] = useState(null);
  const onSkim = (e) => {
    if (e.buttons || e.target.closest('.vt-head')) return setSkim(null);
    const lane = e.currentTarget.querySelector('.vt-ruler');
    if (!lane) return;
    const T = (e.clientX - lane.getBoundingClientRect().left) / pps;
    if (T < 0 || T > plan.end) return setSkim(null);
    setSkim(T);
    if (audioSkimming.value) pv.scrub(plan, T, booth.people.value);
  };
  // Knip eller Cmd/Ctrl og rullehjul zoomer rundt pekeren, som i Edit.
  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const el = scroller.current;
    const x = e.clientX - el.getBoundingClientRect().left - HEAD;
    const T = (el.scrollLeft + x) / pps;
    const z = Math.max(1, Math.min(40, zoom * Math.exp(-e.deltaY * 0.01)));
    const next = clampPps(((width - HEAD - 40) / end) * z);
    setZoom(z);
    requestAnimationFrame(() => (el.scrollLeft = Math.max(0, T * next - x)));
  };
  const tone = !plan.video && booth.vo.value.roomTone;
  const toneOn = booth.opt('voRoomFill');
  useEffect(() => {
    if (tone) pv.load(tone.file).catch(() => {});
  }, [tone?.file]);
  const step = end > 120 ? 10 : end > 40 ? 5 : 1;
  const ticks = [];
  for (let s = 0; s <= end; s += step) ticks.push(s);
  const sel = plan.items.find((x) => x.take.id === selected.value);
  const skipped = Object.keys(booth.vo.value.skip || {}).length;
  const people = booth.people.value;
  const W = end * pps + 40;

  return (
    <section class="vt">
      <div class="vt-split" title="Drag to make the timeline taller or lower" onPointerDown={resizeTimeline} />
      <div class="vt-bar">
        <IconButton icon={pv.playing.value ? Square : Play} title="Play the voice from the playhead (Space)" onClick={togglePreview} disabled={!plan.items.length} />
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
        <div class="spacer" />
        {skipped > 0 && (
          <Button class="small" icon={RotateCcw} onClick={() => booth.setVo((v) => void (v.skip = {}))} title="Bring back all deleted clips">
            Restore Deleted
          </Button>
        )}
        <Button class="small" icon={Scissors} onClick={() => booth.trimToVoice(plan.items.filter((i) => i.active !== false).map((i) => i.take))} disabled={!plan.items.length || booth.busy()} title="Find where the voice starts and ends in every clip, and trim away the silence and the clicks from Record and stop. Your own trims on these clips are replaced.">
          Trim to Voice
        </Button>
        <IconButton icon={Minus} title="Zoom out" onClick={() => setZoom(Math.max(1, zoom / 1.5))} disabled={zoom <= 1} />
        <IconButton icon={Plus} title="Zoom in" onClick={() => setZoom(Math.min(40, zoom * 1.5))} />
        <SendToEdit disabled={!plan.items.some((i) => i.active)} />
      </div>
      <div class="vt-scroll" ref={scroller} style={{ height: `${booth.opt('voTimelineH')}px` }} onWheel={onWheel} onPointerMove={onSkim} onPointerLeave={() => setSkim(null)}>
        <div class="vt-content" style={{ width: `${HEAD + W}px` }}>
          {skim != null && <div class="vt-skim" style={{ left: `${HEAD + skim * pps}px` }} />}
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
            <div key={p.id} class={`vt-row${p.hidden ? ' hidden' : ''}${p.muted ? ' muted' : ''}${p.id === booth.personId.value ? ' active' : ''}`} style={p.hidden ? null : { height: `${p.height || ROW_H}px` }}>
              <TrackHead p={p} />
              {!p.hidden && <RowSize h={p.height || ROW_H} set={(h) => booth.setPersonHeight(p.id, h)} />}
              <div class="vt-lane" style={{ width: `${W}px` }} onPointerDown={seek}>
                {!p.hidden && (
                  <>
                    {plan.gaps.map((g) => (
                      <div key={`g${g.at}`} class="vt-gap" style={{ left: `${g.at * pps}px`, width: `${g.dur * pps}px` }} title={`Pause ${g.dur.toFixed(2)} s`} />
                    ))}
                    {plan.items
                      .filter((it) => it.person === p.id)
                      .map((it) => (
                        <Clip key={it.take.id} it={it} pps={pps} color={p.color} rowH={p.height || ROW_H} />
                      ))}
                  </>
                )}
                <div class="vt-playhead" style={{ left: `${t * pps}px` }} />
              </div>
            </div>
          ))}
          {tone && plan.items.length > 0 && (
            <div class={`vt-row vt-tone${toneOn ? '' : ' muted'}`} style={{ height: `${booth.opt('voToneH')}px` }}>
              <RowSize h={booth.opt('voToneH')} set={(h) => setPrefs({ voToneH: h })} />
              <div class="vt-head">
                <div class="vt-head-name">
                  <b class="vt-person">Room tone</b>
                </div>
                <div class="vt-head-tools">
                  <IconButton icon={toneOn ? Volume2 : VolumeX} size={13} active={!toneOn} title={toneOn ? 'Room tone fills the pauses, here and when you send to Edit. Click to leave the pauses silent.' : 'The pauses are silent. Click to fill them with room tone.'} onClick={() => setPrefs({ voRoomFill: !toneOn })} />
                </div>
              </div>
              <div class="vt-lane" style={{ width: `${W}px` }} onPointerDown={seek}>
                {roomToneFill(plan.gaps, tone.duration).map((piece) => (
                  <div key={piece.at} class="vt-clip vt-tone-clip" style={{ left: `${piece.at * pps}px`, width: `${Math.max(2, piece.dur * pps)}px`, height: `${booth.opt('voToneH') - 6}px` }}>
                    <Wave file={tone.file} from={piece.in} dur={piece.dur} width={Math.max(2, piece.dur * pps)} height={booth.opt('voToneH') - 22} />
                  </div>
                ))}
                <div class="vt-playhead" style={{ left: `${t * pps}px` }} />
              </div>
            </div>
          )}
          {!plan.items.length && <p class="dim vt-empty">The takes you keep show up here in script order, the way they will be stitched. Play them through, trim them and adjust them. Add a person to record another voice on its own track.</p>}
        </div>
      </div>
      {sel && <ClipControls it={sel} />}
    </section>
  );
}

function Clip({ it, pps, color, rowH = ROW_H }) {
  const take = it.take;
  const w = Math.max(4, it.dur * pps);
  const on = selected.value === take.id;
  const current = booth.current.value?.key === take.key;
  const fi = take.fadeIn ?? 0.02,
    fo = take.fadeOut ?? 0.04;
  const H = rowH - 22; // bølgeformen, under navnet
  return (
    <div
      class={`vt-clip${on ? ' on' : ''}${current ? ' current' : ''}${take.video ? ' video' : ''}${it.active === false ? ' inactive' : ''}`}
      style={{ left: `${it.at * pps}px`, width: `${w}px`, height: `${rowH - 6}px`, background: color }}
      title={`${booth.lineNumber(it.block)}. ${it.block.text}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        selected.value = take.id;
        booth.goTo(it.block.index);
        booth.choosePerson(it.person);
        // Dra i klippet for å skrubbe gjennom det.
        if (e.button === 0) scrubDrag(e, e.currentTarget.parentElement, pps, { threshold: 4 });
      }}
      onDblClick={() => playOne(it)}
    >
      <div class="vt-label">
        <b>{booth.lineNumber(it.block)}</b> {it.block.text}
      </div>
      <Wave file={take.file} from={it.in} dur={it.dur} width={w} height={H} gain={take.volKf?.length ? 0 : take.gain || 0} />
      <svg class="vt-fades" width={w} height={H} viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none">
        {fi > 0 && <polygon points={`0,0 ${fi * pps},0 0,${H}`} />}
        {fo > 0 && <polygon points={`${w},0 ${w - fo * pps},0 ${w},${H}`} />}
      </svg>
      {!take.volKf?.length && (take.gain || 0) !== 0 && <span class="vt-gain">{take.gain > 0 ? '+' : ''}{take.gain} dB</span>}
      <VolumeLine it={it} pps={pps} w={w} H={H} />
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
      {take.volKf?.length ? (
        <span class="vt-ctl">
          Volume has {take.volKf.length} keyframes
          <Button class="small" onClick={() => booth.setTake(take.id, { gain: take.volKf[0][1], volKf: null })} title="Remove the keyframes and use one volume for the whole clip">
            Remove Keyframes
          </Button>
        </span>
      ) : (
        <>
          <label class="vt-ctl" title="Volume for the whole clip. You can also drag the yellow line in the clip.">
            Volume
            <Slider value={gain} min={-24} max={12} step={0.5} center={0} onInput={(x) => booth.setTake(take.id, { gain: x })} />
            <NumberField value={gain} min={-60} max={12} step={0.5} precision={1} unit="dB" width={66} onChange={(x) => booth.setTake(take.id, { gain: x })} />
          </label>
          <IconButton icon={Wand2} size={14} title="Normalize: peak at -3 dB" onClick={normalize} />
        </>
      )}
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
