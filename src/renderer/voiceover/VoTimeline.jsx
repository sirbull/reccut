// Studioets tidslinje: stemmen slik den blir sydd sammen. Spill gjennom, velg et klipp,
// dra i kantene for å trimme og i hjørnene for fades. Sporhodet åpner klippinnstillingene.
import { Fragment } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Headphones, Magnet, Maximize2, SlidersHorizontal, StretchHorizontal, Trash2 } from 'lucide-preact';
import { AudioLines, ChevronRight, Sparkles, Timer, Eye, EyeOff, Minus, Play, Plus, RotateCcw, Square, Diamond, Copy, UserPlus, Volume2, VolumeX, Wand2, Scissors, MousePointer2, X } from 'lucide-preact';
import { Button, IconButton, Modal, NumberField, Slider, toast } from '../ui.jsx';
import { formatDuration, kfTime, valueAt } from '../../shared/model.js';
import { formatVolumeDb, moveVolumeKeyframe, shiftVolume, volumeDelta, volumePath, volumeSegment, volumeY } from '../editor/volume.js';
import { addCut, itemParts, normalizeGain, peakDbIn, personOf, pickKey, takeParts, takeFades, allStudioTakes, deleteStudioClips, studioGapKey } from '../../shared/voiceover.js';
import { prefs, setPrefs } from '../prefs.js';
import { audioSkimming, skimming, snapping } from '../editor/store.js';
import * as booth from './booth.js';
import * as pv from './preview.js';
import { PAUSES, PacingFields, isDefaultPacing, pacing, resetPacing, setPause } from './Pacing.jsx';
import { AUDIO_EFFECTS, AUDIO_FX_CATEGORIES, AUDIO_PRESETS, makeEffect, presetEffects } from '../../shared/audiofx.js';
import { AudioFxIcon, FadeInIcon, FadeOutIcon } from '../editor/audioIcons.jsx';
import { SendToEdit } from './Booth.jsx';
import { studioVolumeAt, studioVolumeClip, studioVolumePatch } from './volume.js';

export const selected = signal(null); // det valgte opptaket på tidslinjen
// Alt som er markert: opptak (id) og romlydbiter ('tone:' + linjen før pausen). Shift- eller Cmd-klikk legger til.
export const marked = signal([]);
// Verktøy: 'select' (velg, trim) eller 'blade' (B: klikk i et klipp for å dele det).
export const tool = signal('select');
const cutAt = signal(null);
// Den gule skummelinjen (tid), når pekeren er over tidslinjen. Mellomrom spiller derfra.
export const skimAt = signal(null);
const snapAt = signal(null);
const toneId = (after) => `tone:${after ?? 'start'}`;
export const pausesOpen = signal(false); // Pauses-vinduet over tidslinjen

const clampPps = (v, min) => Math.max(min, Math.min(600, v));
const HEAD = 168; // bredden på sporhodene

function clearSkim() {
  skimAt.value = null;
  pv.stopScrub();
}

function toggleTimelineTool(key, state) {
  state.value = !state.value;
  setPrefs({ [key]: state.value });
  if (key === 'skimming' && !state.value) clearSkim();
  if (key === 'audioSkimming' && !state.value) pv.stopScrub();
  if (key === 'snapping' && !state.value) snapAt.value = null;
}

// Knappene, tastaturet og menylinjen bruker samme bryter og rydder opp i skumming med en gang.
export function toggleStudioTool(id) {
  const state = { snapping, skimming, audioSkimming }[id];
  if (!state) return false;
  toggleTimelineTool(id, state);
  return true;
}

// Samme åtte pikslers magnet som i Edit, uavhengig av zoom.
function snapTime(t, pps, { plan = booth.plan.value, exclude = new Set(), playhead = true } = {}) {
  if (!snapping.value) return { t };
  let best = null;
  const consider = (at) => {
    if (Math.abs(at - t) < 8 / pps && (best == null || Math.abs(at - t) < Math.abs(best - t))) best = at;
  };
  consider(0);
  if (playhead) consider(pv.time.value);
  for (const it of plan.items) {
    if (exclude.has(it.take.id)) continue;
    consider(it.at);
    consider(it.at + it.dur);
  }
  return best == null ? { t } : { t: best, snapped: true };
}

export function togglePreview() {
  if (pv.playing.value) return pv.stop();
  const plan = booth.plan.value;
  // Står skummelinjen over tidslinjen, starter avspillingen der (og spillehodet flytter seg dit).
  if (skimming.value && prefs.value.playbackFromSkimmer && skimAt.value != null) pv.time.value = skimAt.value;
  clearSkim();
  const tone = booth.vo.value.roomTone;
  pv.play(plan, pv.time.value, { tone: tone && { file: tone.file, pieces: booth.tonePieces(plan, { includeMuted: true }) }, people: booth.people.value });
}
const playOne = (it) => pv.play({ items: [{ ...it, at: 0, active: true }], gaps: [], end: it.dur }, 0, { people: booth.people.value.filter((p) => p.id === it.person) });

// Sletter det som er markert, som ett angresteg: klippene hoppes over (opptakene beholdes),
// og romlyden i de markerte pausene blir stille. Restore Deleted henter alt tilbake.
export function deleteSelected() {
  const ids = new Set(marked.value.length ? marked.value : selected.value ? [selected.value] : []);
  const items = booth.plan.value.items.filter((x) => ids.has(x.take.id));
  const tones = [...ids].filter((id) => String(id).startsWith('tone:')).map((id) => id.slice(5));
  // Deler av et klipp ('opptak#del'): delen blir et kutt, og resten av klippet trekkes sammen.
  const partsOf = new Map();
  for (const id of ids) {
    const [takeId, k] = String(id).split('#');
    if (k != null) partsOf.set(takeId, [...(partsOf.get(takeId) || []), Number(k)]);
  }
  if (!items.length && !tones.length && !partsOf.size) return false;
  pv.stop();
  booth.setVo((v) => {
    v.skip ||= {};
    deleteStudioClips(v, items.map((it) => it.take.id));
    for (const [takeId, ks] of partsOf) {
      const t = allStudioTakes(v).find((x) => x.id === takeId);
      if (!t) continue;
      const parts = takeParts(t);
      for (const k of ks) if (parts[k]) t.cuts = addCut(t.cuts, parts[k][0], parts[k][1]);
      // Er hele opptaket kuttet bort, hoppes linjen over i stedet.
      if (!takeParts(t).length) {
        t.cuts = [];
        v.skip[pickKey(personOf(t), t.key)] = true;
      }
    }
    v.toneOff ||= {};
    for (const t of tones) v.toneOff[t] = true;
  });
  selected.value = null;
  marked.value = [];
  return true;
}
export function clearMarks() {
  if (!selected.value && !marked.value.length) return false;
  selected.value = null;
  marked.value = [];
  return true;
}
// Klikk velger, Shift- eller Cmd/Ctrl-klikk legger til eller tar bort.
function mark(e, id) {
  const add = e.shiftKey || e.metaKey || e.ctrlKey;
  const list = marked.value;
  marked.value = add ? (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]) : [id];
}
// Menyvalgene i studioet: angre, gjør om og marker alt (klippene og romlyden).
export function studioMenu(id) {
  if (toggleStudioTool(id)) return true;
  if (id === 'undo') return booth.voUndo(), true;
  if (id === 'redo') return booth.voRedo(), true;
  if (id === 'selectAll') {
    const plan = booth.plan.value;
    marked.value = [...plan.items.map((it) => it.take.id), ...new Set(booth.tonePieces(plan, { all: true }).map((x) => toneId(x.after)))];
    return true;
  }
  return false;
}

// person: tegn bølgeformen slik den høres (AI Clean Voice, volum og effekter), ikke bare originalen.
function Wave({ file, from, dur, width, height, gain = 0, person = null }) {
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
    const pk = pv.peaksFor(file, person);
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
  }, [file, from, dur, width, height, gain, v, person]);
  return <canvas ref={ref} class="vt-wave" style={{ width: `${width}px`, height: `${height}px` }} />;
}

/* Volum som i Edit: dra linjen opp eller ned, Alt-klikk for et nøkkelbilde, dra punktene, høyreklikk for å slette.
   Opptaket gjøres om til et klipp i Edit-formatet, så linjen tegnes og endres med samme kode som der. */
const trackGain = (id) => booth.people.value.find((p) => p.id === id)?.gain || 0;
const asClip = (it, gain = trackGain(it.person)) => studioVolumeClip(it, gain);
const saveVolume = (take, c) => booth.setTake(take.id, c.kf.volume?.length ? { volKf: c.kf.volume } : { gain: c.props.volume, volKf: null });

function volumeDrag(e, it, pps, H, kfIndex = null) {
  if (tool.value === 'blade') return;
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pv.stop();
  selected.value = it.take.id;
  const base = asClip(it, 0);
  const rect = (e.currentTarget.closest('.vt-part') || e.currentTarget.closest('.vt-clip')).getBoundingClientRect();
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
  let changed = false;
  const move = (ev) => {
    if (!changed) { booth.beginGesture(); changed = true; }
    const dx = ev.clientX - x0;
    const dy = y0 - ev.clientY;
    if (!dir) {
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    const c = asClip(it, 0);
    if (dir === 'x') moveVolumeKeyframe(c, 'volume', kfIndex, base.kf.volume[kfIndex][0] + dx / pps, 0.01);
    else shiftVolume(c, 'volume', volumeDelta(dy, H), indices);
    saveVolume(it.take, c);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (changed) booth.endGesture();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
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
          <title>{`${it.take.volKf?.length ? 'Volume keyframes' : formatVolumeDb(c.props.volume)} · Drag to adjust the volume. ${alt} click to add a keyframe.`}</title>
        </path>
      </svg>
      {(c.kf.volume || []).map(([t, v], i) => t >= c.in - 1e-6 && t <= c.in + c.dur + 1e-6 && (
        <div key={i} class="vol-kf-point" style={{ left: `${(t - c.in) * pps - 6}px`, top: `${16 + volumeY(v, H) - 6}px` }} onPointerDown={(e) => volumeDrag(e, it, pps, H, i)} onContextMenu={(e) => deleteKeyframe(e, it, i)} title={`${formatVolumeDb(v)}. Drag up or down for volume, sideways to move. Right click to delete.`} />
      ))}
    </>
  );
}

// Dra for å skrubbe: spillehodet følger pekeren, med lyd. lane: elementet tiden måles fra.
function scrubDrag(e, lane, pps, { onUp = null, threshold = 0 } = {}) {
  clearSkim();
  const rect = lane.getBoundingClientRect();
  const plan = booth.plan.value;
  const at = (x) => {
    const s = snapTime(Math.max(0, Math.min(plan.end, (x - rect.left) / pps)), pps, { plan, playhead: false });
    snapAt.value = s.snapped ? s.t : null;
    return s.t;
  };
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
    window.removeEventListener('pointercancel', up);
    snapAt.value = null;
    pv.stopScrub();
    onUp?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Dra slutten av en pause (romlyden) for å gjøre den kortere eller lengre. Det blir pausen etter linjen
// før (take.pause), og alt etter flytter seg. Lengre pauser fylles med flere biter romlyd.
function pauseDrag(e, gap, pps) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pv.stop();
  clearSkim();
  const plan = booth.plan.value;
  const it = booth.plan.value.items.find((x) => studioGapKey(x.take) === gap.after && (!gap.person || x.person === gap.person));
  if (!it) return;
  const base = it.take.pause ?? gap.dur;
  const edge = gap.at + gap.dur;
  const exclude = new Set(plan.items.filter((x) => x.at >= edge - 1e-6).map((x) => x.take.id));
  const x0 = e.clientX;
  let changed = false;
  const move = (ev) => {
    if (!changed) { booth.beginGesture(); changed = true; }
    const s = snapTime(Math.max(gap.at, edge + (ev.clientX - x0) / pps), pps, { plan, exclude });
    snapAt.value = s.snapped ? s.t : null;
    booth.setTake(it.take.id, { pause: Math.max(0, Math.round((base + s.t - edge) * 1000) / 1000) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    snapAt.value = null;
    if (changed) booth.endGesture();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
const PauseEdge = ({ gap, pps }) => <div class="vt-pause-edge" title={`Pause ${gap.dur.toFixed(2)} s. Drag to make it shorter or longer; the clips after it move along.`} onPointerDown={(e) => pauseDrag(e, gap, pps)} />;

// Flytt et klipp (velgeverktøyet, A): dra det til siden, så flytter alle klippene etter seg med det.
// Det er pausen før klippet som endres, og den fylles med romlyd. Uten bevegelse er det bare et klikk.
function moveDrag(e, it, pps) {
  clearSkim();
  const plan = booth.plan.value;
  // Etterfølgende klipp flyttes med dette klippet og er ikke faste snap-punkter.
  const exclude = new Set(plan.items.filter((x) => x.at >= it.at - 1e-6).map((x) => x.take.id));
  const x0 = e.clientX;
  let moving = false;
  const move = (ev) => {
    const dx = ev.clientX - x0;
    if (!moving && Math.abs(dx) < 4) return;
    if (!moving) {
      pv.stop();
      booth.beginGesture();
    }
    moving = true;
    const delta = dx / pps;
    const a = snapTime(it.at + delta, pps, { plan, exclude });
    const b = snapTime(it.at + it.dur + delta, pps, { plan, exclude });
    const useStart = a.snapped && (!b.snapped || Math.abs(a.t - it.at - delta) <= Math.abs(b.t - it.at - it.dur - delta));
    const s = useStart ? a : b;
    snapAt.value = s.snapped ? s.t : null;
    booth.moveTake(plan, it.take.id, s.snapped ? s.t - it.at - (useStart ? 0 : it.dur) : delta);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    snapAt.value = null;
    if (moving) booth.endGesture();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// Dra: kanter trimmer, hjørner gir fades. Endringene lagres fortløpende.
function drag(e, take, kind, pps) {
  if (tool.value === 'blade') return;
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  pv.stop();
  clearSkim();
  const plan = booth.plan.value;
  const it = plan.items.find((x) => x.take.id === take.id);
  selected.value = take.id;
  const x0 = e.clientX;
  const orig = { in: take.in, out: take.out, ...takeFades(take) };
  let changed = false;
  const move = (ev) => {
    if (!changed) { booth.beginGesture(); changed = true; }
    let d = (ev.clientX - x0) / pps;
    if (it && (kind === 'in' || kind === 'out')) {
      const edge = kind === 'in' ? it.at : it.at + it.dur;
      const s = snapTime(edge + d, pps, { plan, exclude: new Set([take.id]) });
      snapAt.value = s.snapped ? s.t : null;
      d = s.t - edge;
    }
    if (kind === 'in') booth.setTake(take.id, { in: Math.round((orig.in + d) * 1000) / 1000 });
    else if (kind === 'out') booth.setTake(take.id, { out: Math.round((orig.out + d) * 1000) / 1000 });
    else if (kind === 'fadeIn') booth.setTake(take.id, { fadeIn: Math.max(0, Math.round((orig.fadeIn + d) * 100) / 100) });
    else if (kind === 'fadeOut') booth.setTake(take.id, { fadeOut: Math.max(0, Math.round((orig.fadeOut - d) * 100) / 100) });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    snapAt.value = null;
    if (changed) booth.endGesture();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
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
  const [zoom, setZoom] = useState(null); // null: hele tidslinjen følger vinduets bredde
  const zoomRef = useRef(null);
  const anchorRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [clipSettings, setClipSettings] = useState(null);
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
  useEffect(() => () => { clearSkim(); snapAt.value = null; pv.close(); }, []);
  const canSkim = skimming.value && !pv.playing.value && !booth.busy();
  useEffect(() => {
    if (!canSkim) clearSkim();
    else if (!audioSkimming.value) pv.stopScrub();
    if (!snapping.value) snapAt.value = null;
  }, [canSkim, audioSkimming.value, snapping.value]);
  useEffect(() => { clearSkim(); snapAt.value = null; setClipSettings(null); }, [booth.scriptId.value]);
  // Effekter og volum per person høres med en gang, også mens det spilles.
  for (const p of booth.people.value) {
    pv.setFx(p.id, p.fx || []);
    pv.setGain(p.id, p.gain || 0, Boolean(p.muted));
    pv.setClean(p.id, p.clean);
  }
  // Mute/solo endrer bare av/på. Lydruten oppdateres direkte uten å stoppe spillehodet.
  const playbackPlan = useMemo(() => JSON.stringify({ ...plan, items: plan.items.map(({ active, ...it }) => it) }), [plan]);
  const planRef = useRef(playbackPlan);
  useEffect(() => {
    if (planRef.current !== playbackPlan && pv.playing.value) pv.stop();
    planRef.current = playbackPlan;
  }, [playbackPlan]);

  const end = Math.max(plan.end, 1);
  const fitPps = Math.min(600, Math.max(1, width - HEAD - 40) / end);
  // Selv lange opptak må kunne vises i sin helhet, også under én piksel per sekund.
  const minPps = Math.min(1, fitPps);
  const pps = clampPps(zoom ?? fitPps, minPps);
  zoomRef.current = pps;
  const zoomTo = (next, at, offset) => {
    const value = clampPps(next, minPps);
    if (Math.abs(value - zoomRef.current) < 1e-9) return;
    anchorRef.current ||= { at, offset };
    zoomRef.current = value;
    setZoom(value);
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!el) return;
    if (anchor) el.scrollLeft = Math.max(0, anchor.at * pps - anchor.offset);
    else if (zoom == null) el.scrollLeft = 0;
  }, [pps, zoom]);
  const zoomBy = (factor) => {
    const el = scroller.current;
    if (!el) return;
    const z = zoomRef.current;
    const visible = Math.max(1, el.clientWidth - HEAD);
    const x = pv.time.value * z - el.scrollLeft;
    const offset = x >= 0 && x <= visible ? x : visible / 2;
    zoomTo(z * factor, (el.scrollLeft + offset) / z, offset);
  };
  const fit = () => {
    anchorRef.current = null;
    zoomRef.current = fitPps;
    setZoom(null);
    if (scroller.current) scroller.current.scrollLeft = 0;
  };
  const t = pv.time.value;
  // Spillehodet følger linjen som er valgt: til klippet, eller dit klippet kommer når linjen ikke er tatt opp.
  // Etter et nytt opptak står det rett etter det nye klippet.
  const cur = booth.current.value;
  const who = booth.personId.value;
  const takes = booth.vo.value.takes;
  const seen = useRef(takes.length);
  useEffect(() => {
    if (pv.playing.value || !cur) return;
    const live = plan.items;
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
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) clearMarks();
    scrubDrag(e, e.currentTarget, pps, { onUp: () => was && togglePreview() });
  };
  // Skumming som i Edit: en linje følger pekeren, og lyden høres når lydskumming er på.
  const skim = canSkim ? skimAt.value : null;
  const onSkim = (e) => {
    if (e.buttons) { skimAt.value = null; return; }
    if (!canSkim || e.target.closest('.vt-head')) return clearSkim();
    const lane = e.currentTarget.querySelector('.vt-ruler');
    if (!lane) return;
    const T = (e.clientX - lane.getBoundingClientRect().left) / pps;
    if (T < 0 || T > plan.end) return clearSkim();
    const at = snapTime(T, pps).t;
    skimAt.value = at;
    if (audioSkimming.value) pv.scrub(plan, at, booth.people.value);
  };
  // Knip eller Cmd/Ctrl og rullehjul zoomer rundt pekeren, som i Edit.
  useEffect(() => {
    const el = scroller.current;
    const root = el.closest('.vt');
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dy = Math.max(-40, Math.min(40, e.deltaY * lines));
      const x = Math.max(0, Math.min(el.clientWidth - HEAD, e.clientX - el.getBoundingClientRect().left - HEAD));
      const z = zoomRef.current;
      zoomTo(z * Math.exp(-dy * 0.0125), (el.scrollLeft + x) / z, x);
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, [minPps]);
  // Romlyd: ett spor under hver person som tar opp med mikrofon (slått av i Stitch: ingen spor).
  const tone = !plan.video && booth.opt('voRoomFill') ? booth.vo.value.roomTone : null;
  const pieces = tone ? booth.tonePieces(plan, { all: true }) : [];
  useEffect(() => {
    if (tone) pv.load(tone.file).catch(() => {});
  }, [tone?.file]);
  const tickSeconds = 60 / pps;
  const magnitude = 10 ** Math.floor(Math.log10(tickSeconds));
  const step = [1, 2, 5, 10].find((n) => n * magnitude >= tickSeconds) * magnitude;
  const ticks = [];
  for (let s = 0; s <= end; s += step) ticks.push(s);
  const skipped = Object.keys(booth.vo.value.skip || {}).length + Object.keys(booth.vo.value.toneOff || {}).length + allStudioTakes(booth.vo.value).filter((t) => t.deleted).length;
  const people = booth.people.value;
  const W = end * pps + 40;
  const openClipSettings = (personId) => {
    const items = plan.items.filter((it) => it.person === personId);
    const it = items.find((it) => it.take.id === selected.value) || items.find((it) => it.block.key === cur?.key) || items[0];
    clearSkim();
    booth.choosePerson(personId);
    selected.value = it?.take.id ?? null;
    marked.value = it ? [it.take.id] : [];
    setClipSettings(personId);
  };

  return (
    <section class={`vt${tool.value === 'blade' ? ' blade' : ''}`}>
      <div class="vt-split" title="Drag to make the timeline taller or lower" onPointerDown={resizeTimeline} />
      <div class="vt-bar">
        <IconButton icon={pv.playing.value ? Square : Play} title="Play the voice from the playhead (Space)" onClick={togglePreview} disabled={!plan.items.length} />
        <span class="vt-time">
          {formatDuration(t)} <span class="dim">/ {formatDuration(plan.end)}</span>
        </span>
        <span class="dim">
          {plan.items.length} clips
          {skipped ? ` · ${skipped} deleted` : ''}
        </span>
        <PausesButton />
        <Button class="small" icon={UserPlus} onClick={booth.addPerson} disabled={booth.busy()} title="Add a person on a new track, with their own takes and sound">
          Add Person
        </Button>
        <div class="spacer" />
        {skipped > 0 && (
          <Button class="small" icon={RotateCcw} onClick={() => booth.setVo((v) => { v.skip = {}; v.toneOff = {}; for (const t of allStudioTakes(v)) delete t.deleted; })} title="Bring back all deleted clips and room tone">
            Restore Deleted
          </Button>
        )}
        <IconButton icon={MousePointer2} title="Select tool (A): drag a clip to move it and all clips after it" active={tool.value === 'select'} onClick={() => (tool.value = 'select')} />
        <IconButton icon={Scissors} title="Cut tool (B): click to split into independent clips. A or Esc returns to selecting." active={tool.value === 'blade'} onClick={() => (tool.value = tool.value === 'blade' ? 'select' : 'blade')} />
        <div class="vt-tools" role="group" aria-label="Timeline tools">
          <IconButton icon={Magnet} title="Snapping (N): align clips, trims and the playhead to nearby clip edges" aria-label="Snapping" aria-pressed={snapping.value} active={snapping.value} onClick={() => toggleStudioTool('snapping')} />
          <IconButton icon={StretchHorizontal} title="Skimming (S): preview a position by moving the pointer over the timeline" aria-label="Skimming" aria-pressed={skimming.value} active={skimming.value} onClick={() => toggleStudioTool('skimming')} />
          <IconButton icon={Headphones} title="Audio skimming (Shift S): hear short previews while skimming" aria-label="Audio skimming" aria-pressed={skimming.value && audioSkimming.value} active={skimming.value && audioSkimming.value} disabled={!skimming.value} onClick={() => toggleStudioTool('audioSkimming')} />
        </div>
        <Button class="small" icon={Scissors} onClick={() => booth.trimToVoice(plan.items.filter((i) => i.active !== false).map((i) => i.take))} disabled={!plan.items.length || booth.busy()} title="Find where the voice starts and ends in every clip, and trim away the silence and the clicks from Record and stop. Your own trims on these clips are replaced.">
          Trim to Voice
        </Button>
        <IconButton icon={Minus} title="Zoom out (pinch or Cmd/Ctrl + scroll)" onClick={() => zoomBy(1 / 1.5)} disabled={pps <= minPps} />
        <IconButton icon={Plus} title="Zoom in (pinch or Cmd/Ctrl + scroll)" onClick={() => zoomBy(1.5)} disabled={pps >= 600} />
        <IconButton icon={Maximize2} title="Fit to view: show the whole timeline" onClick={fit} />
        <SendToEdit disabled={!plan.items.length} />
      </div>
      <div class="vt-workspace" style={{ height: `${booth.opt('voTimelineH')}px` }}>
        <div class="vt-scroll" ref={scroller} onPointerMove={onSkim} onPointerLeave={clearSkim}>
        <div class="vt-content" style={{ width: `${HEAD + W}px` }}>
          {skim != null && <div class="vt-skim" style={{ left: `${HEAD + skim * pps}px` }} />}
          {snapping.value && snapAt.value != null && <div class="vt-snapline" style={{ left: `${HEAD + snapAt.value * pps}px` }} />}
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
            <Fragment key={p.id}>
              <div class={`vt-row${p.hidden ? ' hidden' : ''}${p.muted ? ' muted' : ''}${p.id === booth.personId.value ? ' active' : ''}`} style={p.hidden ? null : { height: `${p.height || ROW_H}px` }} {...dropFx(p.id, () => plan.items.filter((x) => x.person === p.id && x.active !== false).map((x) => x.take))}>
                <TrackHead p={p} onClipSettings={() => openClipSettings(p.id)} />
                {!p.hidden && <RowSize h={p.height || ROW_H} set={(h) => booth.setPersonHeight(p.id, h)} />}
                <div class="vt-lane" style={{ width: `${W}px` }} onPointerDown={seek}>
                  {!p.hidden && (
                    <>
                      {plan.gaps.map((g) => (
                        <div key={`g${g.at}`} class="vt-gap" style={{ left: `${g.at * pps}px`, width: `${g.dur * pps}px` }} title={`Pause ${g.dur.toFixed(2)} s`}>
                          {g.after != null && <PauseEdge gap={g} pps={pps} />}
                        </div>
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
              {tone && !p.ai && !p.hidden && plan.items.some((it) => it.person === p.id) && <ToneRow p={p} pieces={pieces.filter((x) => x.person === p.id)} tone={tone} pps={pps} W={W} t={t} seek={seek} />}
            </Fragment>
          ))}
          {!plan.items.length && <p class="dim vt-empty">The takes you keep show up here in script order, the way they will be stitched. Play them through, trim them and adjust them. Add a person to record another voice on its own track.</p>}
        </div>
      </div>
      </div>
      {clipSettings && people.some((p) => p.id === clipSettings) && <ClipSettingsDialog personId={clipSettings} onClose={() => setClipSettings(null)} />}
    </section>
  );
}

// Pausen en romlydbit hører til, for den siste biten i pausen (der håndtaket sitter).
function gapOf(piece, pieces, i) {
  if (pieces[i + 1]?.after === piece.after || piece.after == null) return null;
  return booth.plan.value.gaps.find((g) => g.after === piece.after) || null;
}

// Romlydsporet til en person, rett under stemmen: av/på, volum og høyde. Bitene kan markeres og slettes.
function ToneRow({ p, pieces, tone, pps, W, t, seek }) {
  const h = p.toneHeight || ROW_H;
  const gain = p.toneGain || 0;
  return (
    <div class={`vt-row vt-tone${p.muted || p.toneMuted ? ' muted' : ''}`} style={{ height: `${h}px` }} {...dropFx(p.id, () => booth.plan.value.items.filter((x) => x.person === p.id && x.active !== false).map((x) => x.take))}>
      <RowSize h={h} set={(x) => booth.setPersonTone(p.id, { toneHeight: x })} />
      <div class="vt-head">
        <div class="vt-head-name">
          <span class="vt-dot" style={{ background: p.color, opacity: 0.5 }} />
          <b class="vt-person">Room tone</b>
        </div>
        <div class="vt-head-tools">
          <IconButton icon={p.toneMuted ? VolumeX : Volume2} size={13} active={p.toneMuted} title={p.toneMuted ? `The pauses after ${p.name} are silent. Click to fill them with room tone.` : `Room tone in the pauses after ${p.name}, here and when you send to Edit. Click to turn it off.`} onClick={() => booth.setPersonTone(p.id, { toneMuted: !p.toneMuted })} />
          <NumberField value={gain} min={-40} max={12} step={0.5} precision={1} unit="dB" width={62} title="Room tone volume" onChange={(x) => booth.setPersonTone(p.id, { toneGain: x })} />
        </div>
      </div>
      <div class="vt-lane" style={{ width: `${W}px` }} onPointerDown={seek}>
        {pieces.map((piece, i) => (
          <div
            key={piece.at}
            class={`vt-clip vt-tone-clip${marked.value.includes(toneId(piece.after)) ? ' on' : ''}`}
            title="Room tone in this pause. Click to select, Delete to leave the pause silent."
            onPointerDown={(e) => {
              e.stopPropagation();
              selected.value = null;
              mark(e, toneId(piece.after));
              if (e.button === 0) scrubDrag(e, e.currentTarget.parentElement, pps, { threshold: 4 });
            }}
            style={{ left: `${piece.at * pps}px`, width: `${Math.max(2, piece.dur * pps)}px`, height: `${h - 6}px` }}>
            <Wave file={tone.file} from={piece.in} dur={piece.dur} width={Math.max(2, piece.dur * pps)} height={h - 22} gain={gain} person={p} />
            {gapOf(piece, pieces, i) && <PauseEdge gap={gapOf(piece, pieces, i)} pps={pps} />}
          </div>
        ))}
        <div class="vt-playhead" style={{ left: `${t * pps}px` }} />
      </div>
    </div>
  );
}

function Clip({ it, pps, color, rowH = ROW_H }) {
  const take = it.take;
  const w = Math.max(4, it.dur * pps);
  const on = selected.value === take.id || marked.value.includes(take.id);
  const current = booth.current.value?.key === take.key;
  const { fadeIn: fi, fadeOut: fo } = takeFades(take);
  const H = rowH - 22; // bølgeformen, under navnet
  const parts = itemParts(it);
  const many = parts.length > 1;
  const person = booth.people.value.find((x) => x.id === it.person);
  const gain = studioVolumeAt(it, person?.gain || 0, pv.time.value);
  return (
    <div
      class={`vt-clip${on ? ' on' : ''}${current ? ' current' : ''}${take.video ? ' video' : ''}${it.active === false ? ' inactive' : ''}`}
      style={{ left: `${it.at * pps}px`, width: `${w}px`, height: `${rowH - 6}px`, background: color }}
      title={`${booth.lineNumber(it.block)}. ${it.block.text}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const T = snapTime(it.at + (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, pps).t;
        const k = Math.max(0, parts.findIndex((p) => T < p.at + p.dur));
        // Kutteverktøyet (B): klikket deler klippet der.
        if (tool.value === 'blade' && e.button === 0) {
          pv.stop();
          booth.splitTake(booth.plan.value, take.id, T);
          clearMarks();
          return;
        }
        selected.value = take.id;
        // Er klippet delt, markeres delen det ble klikket på (Delete tar den bort).
        mark(e, many ? `${take.id}#${k}` : take.id);
        booth.goTo(it.block.index);
        booth.choosePerson(it.person);
        // Dra klippet til siden for å flytte det og alt etter det (pausen før fylles med romlyd).
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) moveDrag(e, it, pps);
      }}
      onPointerMove={(e) => {
        if (tool.value !== 'blade' || e.buttons) return;
        const T = snapTime(it.at + (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, pps).t;
        cutAt.value = { id: take.id, x: Math.max(0, Math.min(w, (T - it.at) * pps)) };
      }}
      onPointerLeave={() => { if (cutAt.value?.id === take.id) cutAt.value = null; }}
      onDblClick={() => { if (tool.value !== 'blade') playOne(it); }}
      onContextMenu={(e) => clipMenu(e, it, it.at + (e.clientX - e.currentTarget.getBoundingClientRect().left) / pps, parts)}
      {...dropFx(it.person, () => [take])}
    >
      {tool.value === 'blade' && cutAt.value?.id === take.id && <div class="vt-cut" style={{ left: `${cutAt.value.x}px` }} />}
      <div class="vt-label">
        <b>{booth.lineNumber(it.block)}</b> {it.block.text}
      </div>
      {parts.map((part, k) => {
        const pw = Math.max(1, part.dur * pps);
        return (
          <div key={k} class={`vt-part${many && marked.value.includes(`${take.id}#${k}`) ? ' on' : ''}`} style={{ left: `${(part.at - it.at) * pps}px`, width: `${pw}px` }}>
            <Wave file={take.file} from={part.in} dur={part.dur} width={pw} height={H} gain={take.volKf?.length ? 0 : take.gain || 0} person={person} />
            <VolumeLine it={{ ...it, at: part.at, in: part.in, dur: part.dur }} pps={pps} w={pw} H={H} />
          </div>
        );
      })}
      <svg class="vt-fades" width={w} height={H} viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none">
        {fi > 0 && <polygon points={`0,0 ${fi * pps},0 0,${H}`} />}
        {fo > 0 && <polygon points={`${w},0 ${w - fo * pps},0 ${w},${H}`} />}
      </svg>
      {Math.abs(gain) > 0.001 && <span class="vt-gain">{formatVolumeDb(gain)}</span>}
      {selected.value === take.id && (
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

const partsLength = (take, last) => {
  const parts = takeParts(take);
  const p = last ? parts.at(-1) : parts[0];
  return p ? p[1] - p[0] : 0;
};

function ClipSettingsDialog({ personId, onClose }) {
  const person = booth.people.value.find((p) => p.id === personId);
  const items = booth.plan.value.items.filter((it) => it.person === personId);
  const it = items.find((it) => it.take.id === selected.value) || items[0];
  const choose = (id) => {
    selected.value = id;
    marked.value = [id];
  };
  useEffect(() => {
    if (it && selected.value !== it.take.id) choose(it.take.id);
  }, [it?.take.id]);
  return (
    <Modal title={`Clip settings — ${person.name}`} class="vt-clip-dialog" width={580} onClose={onClose} footer={<>
      <Button icon={Trash2} disabled={!it} onClick={() => { choose(it.take.id); deleteSelected(); }}>Delete Clip</Button>
      <div class="spacer" />
      <Button variant="primary" onClick={onClose}>Done</Button>
    </>}>
      {it ? <>
        <label class="vt-clip-picker">
          Clip
          <select class="select" value={it.take.id} autoFocus onChange={(e) => choose(e.currentTarget.value)}>
            {items.map((item) => <option key={item.take.id} value={item.take.id}>Line {booth.lineNumber(item.block)}, take {item.take.n} — {item.block.text}</option>)}
          </select>
        </label>
        <ClipControls it={it} />
      </> : <p class="dim">No clips on this track yet.</p>}
    </Modal>
  );
}

function ClipControls({ it }) {
  const take = it?.take;
  const disabled = !take;
  const offset = it ? trackGain(it.person) : 0;
  const time = pv.time.value;
  const gain = it ? studioVolumeAt(it, offset, time) : null;
  const keyed = Boolean(take?.volKf?.length);
  const setGain = (value) => it && booth.setTake(take.id, studioVolumePatch(it, offset, value, time));
  const name = it ? `${booth.people.value.find((p) => p.id === it.person)?.name || 'Voice'}, line ${booth.lineNumber(it.block)}, take ${take.n}` : 'Select a clip';
  const normalize = async () => {
    if (!take) return;
    await pv.load(take.file).catch(() => null);
    const pk = pv.peaksFor(take.file);
    const peak = pk ? peakDbIn(pk, take.in, take.out) : take.peakDb;
    booth.setTake(take.id, { gain: normalizeGain(peak, -3 - offset) });
  };
  return (
    <div class="vt-clip-controls" role="group" aria-label="Clip controls" aria-disabled={disabled}>
      <div class="vt-clip-summary">
        <b class="vt-name" title={name}>{name}</b>
        <IconButton icon={Play} size={14} title="Play this clip" disabled={disabled} onClick={() => it && playOne(it)} />
      </div>
      <div class="vt-clip-volume">
        <label class="vt-ctl" title="Combined clip and track volume. Changing this field adjusts only this clip; the track volume stays the same.">
          Volume
          <Slider value={gain ?? 0} min={-60 + offset} max={12 + offset} step={0.1} center={0} onInput={setGain} disabled={disabled} />
          <NumberField value={gain} min={-60 + offset} max={12 + offset} step={0.1} precision={1} unit="dB" width={66} onChange={setGain} disabled={disabled} />
        </label>
        <IconButton icon={Wand2} size={14} title="Normalize the combined volume: peak at -3 dB" onClick={normalize} disabled={disabled || keyed} />
        <IconButton icon={Diamond} size={14} active={keyed} title={keyed ? `${take.volKf.length} volume keyframes. Remove them and keep the current level.` : 'No volume keyframes'} disabled={!keyed} onClick={() => it && booth.setTake(take.id, { gain: studioVolumeAt(it, 0, time), volKf: null })} />
      </div>
      <label class="vt-ctl">
        <FadeInIcon size={14} /> Fade in
        <NumberField value={take ? takeFades(take).fadeIn : null} min={0} max={take ? Math.min(5, partsLength(take, false) / 2) : 5} step={0.01} precision={2} unit="s" width={66} onChange={(x) => take && booth.setTake(take.id, { fadeIn: x })} disabled={disabled} />
      </label>
      <label class="vt-ctl">
        <FadeOutIcon size={14} /> Fade out
        <NumberField value={take ? takeFades(take).fadeOut : null} min={0} max={take ? Math.min(5, partsLength(take, true) / 2) : 5} step={0.01} precision={2} unit="s" width={66} onChange={(x) => take && booth.setTake(take.id, { fadeOut: x })} disabled={disabled} />
      </label>
      <PauseControl it={it} />
      <label class="vt-ctl">
        Start
        <NumberField value={take?.in ?? null} min={0} max={take ? take.out - 0.05 : 0} step={0.01} precision={2} unit="s" width={66} onChange={(x) => take && booth.setTake(take.id, { in: x })} disabled={disabled} />
      </label>
      <label class="vt-ctl">
        End
        <NumberField value={take?.out ?? null} min={take ? take.in + 0.05 : 0} max={take?.duration ?? 0} step={0.01} precision={2} unit="s" width={66} onChange={(x) => take && booth.setTake(take.id, { out: x })} disabled={disabled} />
      </label>
    </div>
  );
}

// Hvilken standardpause som gjelder etter et klipp: setning, avsnitt eller seksjon (eller ingen, til slutt).
function pauseKind(it) {
  const next = booth.plan.value.items.find((x) => x.active && x.at > it.at + 1e-6);
  if (!next) return null;
  const a = it.block,
    b = next.block;
  if (a.key === b.key) return 'clip';
  return b.section !== a.section ? 'section' : b.para !== a.para ? 'paragraph' : 'sentence';
}

// Pausen etter klippet: følger standarden for setning, avsnitt eller seksjon, eller settes for hånd.
// En pause satt for hånd kan gjøres til ny standard for alle pauser av samme slag.
function PauseControl({ it }) {
  const take = it?.take;
  const kind = it ? pauseKind(it) : null;
  const disabled = !kind;
  const standard = kind && kind !== 'clip';
  const def = standard ? pacing()[kind] : 0;
  const label = standard ? PAUSES.find((p) => p.key === kind).label.toLowerCase() : 'between these clips';
  const manual = take?.pause != null;
  return (
    <label class="vt-ctl vt-clip-pause" title={!it ? 'Select a clip to adjust the pause' : !kind ? 'Last clip, no pause after' : `Pause ${label}. Default ${def.toFixed(2)} s.`}>
      Pause after
      <NumberField value={disabled ? null : take.pause ?? def} min={0} max={10} step={0.05} precision={2} unit="s" width={66} onChange={(x) => take && booth.setTake(take.id, { pause: x })} disabled={disabled} />
      <IconButton icon={RotateCcw} size={13} title="Reset to the default pause" disabled={disabled || !manual} onClick={() => take && booth.setTake(take.id, { pause: null })} />
      <IconButton icon={Copy} size={13} title={`Use this pause for all pauses ${label}`} disabled={!standard || !manual} onClick={() => {
        setPause(kind, take.pause);
        booth.setTake(take.id, { pause: null });
      }} />
    </label>
  );
}

/* Effekter i studioet: dra en effekt eller mal til et spor, så gjelder den alle klippene på sporet
   (og romlyden under). Fade inn og ut dras til et klipp, eller til sporet for alle klippene. */
const FX_TYPE = 'application/x-reccut-vo-fx';
const FADE = 0.3;
function readFx(e) {
  try {
    return JSON.parse(e.dataTransfer.getData(FX_TYPE));
  } catch {
    return null;
  }
}
const acceptsFx = (e) => [...(e.dataTransfer?.types || [])].includes(FX_TYPE);
// Legger effekten på personens spor, eller fade på klippene (takes: ett eller alle på sporet).
function applyFx(fx, personId, takes) {
  const p = booth.people.value.find((x) => x.id === personId);
  if (!fx || !p) return;
  if (fx.kind === 'fade') {
    if (!['in', 'out'].includes(fx.id)) return;
    if (!takes.length) return toast('Record a clip on this track first.');
    booth.setTakes(takes.map((t) => t.id), fx.id === 'in' ? { fadeIn: FADE } : { fadeOut: FADE });
    return toast(`Fade ${fx.id} on ${takes.length === 1 ? 'the clip' : `${takes.length} clips`}. Drag the round handle in the clip to change it.`, { timeout: 3500 });
  }
  if (fx.kind !== 'afx' && fx.kind !== 'apreset') return;
  if (fx.kind === 'afx' ? !AUDIO_EFFECTS[fx.id] : !AUDIO_PRESETS.some((p) => p.id === fx.id)) return;
  const add = fx.kind === 'apreset' ? presetEffects(fx.id) : [makeEffect(fx.id)];
  booth.setPersonFx(p.id, [...(p.fx || []), ...add]);
  const label = fx.kind === 'apreset' ? AUDIO_PRESETS.find((x) => x.id === fx.id)?.label : AUDIO_EFFECTS[fx.id]?.label;
  toast(`${label} is on all of ${p.name}'s clips and room tone. Adjust it under Sound.`, { timeout: 3500 });
}
const dropFx = (personId, takes) => ({
  onDragOver: (e) => {
    if (!acceptsFx(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    e.currentTarget.classList.add('fx-over');
  },
  onDragLeave: (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('fx-over');
  },
  onDrop: (e) => {
    if (!acceptsFx(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('fx-over');
    booth.choosePerson(personId);
    applyFx(readFx(e), personId, takes());
  },
});

export function EffectsPanel() {
  const [q, setQ] = useState('');
  const saveOpen = (key, e) => {
    const open = e.currentTarget.open;
    if (open !== booth.opt(key)) setPrefs({ [key]: open });
  };
  const match = (x) => !q || `${x.label} ${x.desc} ${x.category}`.toLowerCase().includes(q.toLowerCase());
  const trackTakes = (pid) => booth.plan.value.items.filter((x) => x.person === pid && x.active !== false).map((x) => x.take);
  // Klikk bruker valgt spor. Fade bruker valgt klipp når det finnes.
  const click = (fx) => {
    const pid = booth.personId.value;
    const one = booth.plan.value.items.find((x) => x.take.id === selected.value && x.person === pid);
    applyFx(fx, pid, one ? [one.take] : trackTakes(pid));
  };
  const menu = async (e, fx) => {
    e.preventDefault();
    const pid = await window.api.popupMenu(booth.people.value.map((p, i) => ({ id: p.id, label: `Add to track ${i + 1} — ${p.name}` })));
    if (!pid || !booth.boothOpen.value) return;
    booth.choosePerson(pid);
    applyFx(fx, pid, trackTakes(pid));
  };
  const card = (fx, label, desc, icon) => (
    <button key={`${fx.kind}${fx.id}`} class="gen-card vo-fx-card" data-vo-fx={`${fx.kind}:${fx.id}`} draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData(FX_TYPE, JSON.stringify(fx)); }}
      onClick={() => click(fx)} onContextMenu={(e) => menu(e, fx)}
      title={`${desc} Drag onto a track, right click to choose a track, or click to add to the selected track.`}>
      <div class={`vo-fx-preview ${fx.kind}`} aria-hidden="true">{icon}</div>
      <span>{label}</span>
    </button>
  );
  const effects = AUDIO_FX_CATEGORIES.map((category) => ({ category, items: Object.entries(AUDIO_EFFECTS).filter(([, x]) => x.category === category && match(x)) })).filter((g) => g.items.length);
  const templates = ['Repair', 'Space', 'Creative', 'Lo-fi'].map((category) => ({ category, items: AUDIO_PRESETS.filter((x) => x.category === category && match(x)) })).filter((g) => g.items.length);
  const fades = [
    { id: 'in', label: 'Fade In', desc: 'The sound rises from silence at the start of the clip.', icon: FadeInIcon },
    { id: 'out', label: 'Fade Out', desc: 'The sound falls to silence at the end of the clip.', icon: FadeOutIcon },
  ].filter((x) => match({ ...x, category: 'Fades Transitions' }));
  return (
    <aside class="vo-fx" aria-label="Effects and templates">
      <div class="vo-fx-top">
        <p class="dim">Drag or right click to add to a track.</p>
        <span class="dim">Selected track: {booth.person.value?.name}</span>
        <input class="vo-fx-search" aria-label="Search effects and templates" placeholder="Search effects and templates" value={q} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div class="vo-fx-groups">
        <details class="vo-fx-section" aria-label="Templates" open={booth.opt('voTemplatesOpen')} onToggle={(e) => saveOpen('voTemplatesOpen', e)}>
          <summary><Sparkles size={15} /> Templates <ChevronRight size={14} class="vo-fx-chevron" /></summary>
          <div class="vo-fx-list">
            {templates.map(({ category, items }) => (
              <div key={category}>
                <div class="sub-head">{category === 'Repair' ? 'Fix and Enhance' : category}</div>
                <div class="card-grid">{items.map((x) => card({ kind: 'apreset', id: x.id }, x.label, x.desc, <AudioFxIcon kind="apreset" id={x.id} size={30} />))}</div>
              </div>
            ))}
            {!templates.length && <p class="dim">No templates found.</p>}
          </div>
        </details>
        <details class="vo-fx-section" aria-label="Effects" open={booth.opt('voEffectsOpen')} onToggle={(e) => saveOpen('voEffectsOpen', e)}>
          <summary><AudioLines size={15} /> Effects <ChevronRight size={14} class="vo-fx-chevron" /></summary>
          <div class="vo-fx-list">
            {fades.length > 0 && <>
              <div class="sub-head">Fades</div>
              <div class="card-grid">{fades.map((x) => card({ kind: 'fade', id: x.id }, x.label, x.desc, <x.icon size={30} />))}</div>
            </>}
            {effects.map(({ category, items }) => (
              <div key={category}>
                <div class="sub-head">{category}</div>
                <div class="card-grid">{items.map(([id, x]) => card({ kind: 'afx', id }, x.label, x.desc, <AudioFxIcon kind="afx" id={id} size={30} />))}</div>
              </div>
            ))}
            {!effects.length && !fades.length && <p class="dim">No effects found.</p>}
          </div>
        </details>
      </div>
    </aside>
  );
}

// Høyreklikk på et klipp: fades, del her og slett.
async function clipMenu(e, it, T, parts) {
  e.preventDefault();
  e.stopPropagation();
  const take = it.take;
  selected.value = take.id;
  booth.choosePerson(it.person);
  const k = Math.max(0, parts.findIndex((p) => T < p.at + p.dur));
  marked.value = [parts.length > 1 ? `${take.id}#${k}` : take.id];
  const id = await window.api.popupMenu([
    { id: 'fadeIn', label: 'Fade In', checked: takeFades(take).fadeIn > 0.02 + 1e-6 },
    { id: 'fadeOut', label: 'Fade Out', checked: takeFades(take).fadeOut > 0.04 + 1e-6 },
    { id: 'noFades', label: 'Remove Fades', enabled: (take.fadeIn ?? 0.02) > 0.02 || (take.fadeOut ?? 0.04) > 0.04 },
    { separator: true },
    { id: 'split', label: 'Split Here' },
    { id: 'play', label: 'Play Clip' },
    { separator: true },
    { id: 'delete', label: parts.length > 1 ? 'Delete This Part' : 'Delete Clip' },
  ]);
  if (id === 'fadeIn') booth.setTake(take.id, { fadeIn: FADE });
  else if (id === 'fadeOut') booth.setTake(take.id, { fadeOut: FADE });
  else if (id === 'noFades') booth.setTake(take.id, { fadeIn: 0.02, fadeOut: 0.04 });
  else if (id === 'split') { booth.splitTake(booth.plan.value, take.id, T); clearMarks(); }
  else if (id === 'play') playOne(it);
  else if (id === 'delete') {
    selected.value = take.id;
    marked.value = [parts.length > 1 ? `${take.id}#${k}` : take.id];
    deleteSelected();
  }
}

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
  const manual = allStudioTakes(booth.vo.value).filter((t) => t.pause != null);
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
              <Button class="small" onClick={() => booth.setVo((v) => allStudioTakes(v).forEach((t) => delete t.pause))} title="Clips with their own pause go back to the defaults">
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

// Sporhodet: navn (dobbeltklikk for å endre), demp, solo, skjul, klippinnstillinger og fjern.
function TrackHead({ p, onClipSettings }) {
  const [editing, setEditing] = useState(false);
  const many = booth.people.value.length > 1;
  return (
    <div class="vt-head" onPointerDown={(e) => { if (e.button === 0) { clearMarks(); booth.choosePerson(p.id); } }} title={`${p.name}: click to record as ${p.name} and adjust the sound`}>
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
        <IconButton icon={p.muted ? VolumeX : Volume2} size={13} title={p.muted ? 'Track disabled: clips keep their positions. Click to enable.' : 'Disable all clips on this track without moving them'} active={p.muted} onClick={() => booth.toggleMute(p.id)} />
        {many && (
          <button class={`icon-btn vt-solo${!p.muted && booth.people.value.every((x) => x.id === p.id || x.muted) ? ' active' : ''}`} title="Solo: hear only this person" onClick={() => booth.toggleSolo(p.id)}>
            S
          </button>
        )}
        <IconButton icon={p.hidden ? EyeOff : Eye} size={13} title={p.hidden ? 'Show the track' : 'Hide the track'} active={p.hidden} onClick={() => booth.toggleHidden(p.id)} />
        <IconButton icon={SlidersHorizontal} size={13} title="Clip settings" aria-label={`Clip settings for ${p.name}`} aria-haspopup="dialog" onPointerDown={(e) => e.stopPropagation()} onClick={onClipSettings} />
        {many && <IconButton icon={X} size={13} title="Remove the person and their takes from the studio (the files stay in the Media browser)" onClick={() => booth.removePerson(p.id)} />}
      </div>
    </div>
  );
}
