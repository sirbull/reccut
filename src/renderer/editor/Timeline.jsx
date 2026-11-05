// Tidslinjen: magnetisk hovedspor i midten, tilkoblede klipp over og lyd under,
// som i Final Cut Pro.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { memo } from 'preact/compat';
import {
  AudioLines,
  Captions,
  Spline,
  Brackets,
  Eye,
  EyeOff,
  Hand,
  Lock,
  LockOpen,
  Headphones,
  Link2,
  Search,
  SquareDashed,
  StretchHorizontal,
  Magnet,
  MoveHorizontal,
  MousePointer2,
  Scissors,
  Type,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-preact';
import {
  CAPTION_LANE,
  TRANSITIONS,
  clipHasAudio,
  EASINGS,
  audioWindow,
  audioXfadeWindow,
  dbToGain,
  componentVolumeProp,
  kfTime,
  kfRate,
  sourceTime,
  speedOf,
  formatTimecode,
  moveKeyframes,
  setKeyframeEase,
  isVisual,
  redactLabel,
  transitionWindow,
  transitionSelection,
  hasFreeTransitions,
  audioComponents,
  primaryComponent,
  titleText,
  CLIP_COLORS,
  deepClone,
  valueAt,
  removeKeyframe,
} from '../../shared/model.js';
import { groupLead, moveClip, positionMove, positionTrim, recordingEditId, removeTransition, rollEdit, setTransition, slideClip, slipClip, splitClip, syncRecordingTracks, trimClip } from '../../shared/ops.js';
import {
  beginTransient,
  commitClipEdit as commit,
  endTransient,
  getTime,
  getWave,
  mirror,
  audioSkimming,
  skim,
  skimming,
  onTime,
  playing,
  pps,
  project,
  selectedTransition,
  selection,
  snapping,
  timeSig,
  tool,
  updateClipEdit as updateTransient,
  waveVersion,
  selectedComponent,
  busyMedia,
  editingGroup,
  enterGroup,
  exitGroup,
  inEditingGroup,
  clipSelection,
} from './store.js';
import { fileUrl, scrubAudio, seek, showTimeline, sourceProject } from './playback.js';
import { Button, IconButton } from '../ui.jsx';
import * as commands from './commands.js';
import { prefs, setPrefs } from '../prefs.js';
import { fadePath, formatVolumeDb, moveVolumeKeyframe, shiftVolume, volumeDelta, volumePath, volumeSegment, volumeY } from './volume.js';
import { libraryDropTarget, mediaDropPreview, resizedTransitionDuration } from '../../shared/libraryDrop.js';
import { endLibraryDrag, libraryDrag } from './libraryDrag.js';

const PAD = 16;
const RULER_H = 26;
const HEIGHTS = { caption: 26, video: 46, primary: 78, audio: 54 };
// Grenser for sporhøyden som kan dras i sporhodet.
const HEIGHT_LIMITS = { caption: [20, 90], video: [26, 260], primary: [30, 300], audio: [26, 260] };
export function clampTrackHeight(kind, h) {
  const [a, b] = HEIGHT_LIMITS[kind] || [26, 260];
  return Math.round(Math.max(a, Math.min(b, h)));
}
const view = signal({ left: 0, width: 1000 });
const volumePreview = signal(null);

function VolumePreview() {
  const preview = volumePreview.value;
  if (!preview) return null;
  const clip = project.value.clips[preview.clipId];
  if (!clip) return null;
  const db = preview.index != null ? clip.kf?.[preview.prop]?.[preview.index]?.[1] : valueAt(clip, preview.prop, preview.T);
  return <div class="volume-preview" role="status" style={{ left: Math.max(8, Math.min(window.innerWidth - 110, preview.x + 14)), top: Math.max(8, Math.min(window.innerHeight - 35, preview.y - 34)) }}>{formatVolumeDb(db ?? 0)}</div>;
}

// Spor: videospor over hovedsporet (V2, V3 ...) og lydspor under (A1, A2 ...).
// Antallet følger klippene, pluss spor du har lagt til, pluss ett tomt spor å slippe på.
export function laneRows(p) {
  let maxLane = Math.max(1, p.tracks?.video || 1);
  let minLane = -Math.max(1, p.tracks?.audio || 1);
  for (const c of Object.values(p.clips)) {
    if (c.lane === CAPTION_LANE) continue;
    maxLane = Math.max(maxLane, c.lane);
    minLane = Math.min(minLane, c.lane);
  }
  // Hvert spor kan ha sin egen høyde (lagret i prosjektet), ellers standardhøyden.
  const hOf = (lane, kind) => {
    const h = p.lanes?.[lane]?.h;
    return h ? clampTrackHeight(kind, h) : HEIGHTS[kind];
  };
  const rows = [{ lane: CAPTION_LANE, h: hOf(CAPTION_LANE, 'caption'), kind: 'caption' }];
  for (let l = maxLane + 1; l >= 1; l--) rows.push({ lane: l, h: l === maxLane + 1 ? HEIGHTS.video : hOf(l, 'video'), kind: 'video', spare: l === maxLane + 1 });
  rows.push({ lane: 0, h: hOf(0, 'primary'), kind: 'primary' });
  for (let l = -1; l >= minLane - 1; l--) rows.push({ lane: l, h: l === minLane - 1 ? HEIGHTS.audio : hOf(l, 'audio'), kind: 'audio', spare: l === minLane - 1 });
  let y = 0;
  for (const r of rows) {
    r.y = y;
    y += r.h + 2;
  }
  return { rows, height: y };
}

const tx = (t) => PAD + t * pps.value;

// Alle spor av samme slag (for Shift og endring av høyden på flere spor samtidig).
function kindLanes(p, kind) {
  return laneRows(p).rows.filter((r) => r.kind === kind && !r.spare).map((r) => r.lane);
}

const REPLACE_HOLD_MS = 600;

export function Timeline() {
  const p = project.value;
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const playheadRef = useRef(null);
  const dragRef = useRef(null);
  // Media holdt over et klipp en liten stund erstatter klippet når det slippes.
  const hoverRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const [snapLine, setSnapLine] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const bladeRef = useRef(null);
  const skimRef = useRef(null);
  const lastScrub = useRef(0);
  // Sporene beholder identiteten så lenge de ikke endres, så klipp som ikke er endret
  // slipper å tegnes på nytt (viktig i lange prosjekter).
  const rowsRef = useRef(null);
  const { rows, height } = useMemo(() => {
    const next = laneRows(p);
    const key = next.rows.map((r) => `${r.lane}:${r.h}:${r.y}:${r.kind}:${r.spare ? 1 : 0}`).join('|');
    if (rowsRef.current?.key === key) return rowsRef.current.value;
    rowsRef.current = { key, value: next };
    return next;
  }, [p]);
  const z = pps.value;
  const dragItem = libraryDrag.value;
  useEffect(() => {
    if (!dragItem) {
      setGhost(null);
      hoverRef.current = null;
    }
  }, [dragItem]);
  const transitions = useMemo(() => [...p.primary, ...Object.values(p.clips).filter(hasFreeTransitions).map((c) => c.id)].flatMap((id) => {
    const c = p.clips[id];
    if (!c) return [];
    const i = c.lane === 0 ? p.primary.indexOf(id) : 0;
    const prev = i > 0 ? p.clips[p.primary[i - 1]] : null;
    return ['start', 'end'].flatMap((edge) => {
      const transition = c[edge === 'end' ? 'transitionOut' : 'transition'];
      if (!transition) return [];
      const [a, b] = transitionWindow(c, Boolean(prev), prev, edge);
      return [{ id, edge, transition, a, b, prev: edge === 'start' ? prev : null }];
    });
  }), [p]);
  // Reserve the covered part of each label, including on both sides of a cut.
  const labelInsets = new Map();
  for (const tr of [...transitions, ...(ghost?.kind === 'transition' ? [ghost] : [])]) {
    for (const id of [tr.id, tr.prev?.id]) {
      const c = p.clips[id];
      if (!c) continue;
      const inset = labelInsets.get(id) || { start: 0, end: 0 };
      if (tr.a <= c.start && tr.b > c.start) inset.start = Math.max(inset.start, (tr.b - c.start) * z);
      if (tr.a < c.start + c.dur && tr.b >= c.start + c.dur) inset.end = Math.max(inset.end, (c.start + c.dur - tr.a) * z);
      labelInsets.set(id, inset);
    }
  }
  const previewEnd = ghost?.kind === 'media' ? Math.max(0, ...ghost.clips.map((c) => c.b)) : 0;
  const width = Math.max(view.value.width, PAD * 2 + (Math.max(p.duration, previewEnd) + 30) * z);

  // Spillhodet flyttes direkte i DOM for jevn avspilling.
  useEffect(() => {
    const place = (t) => {
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${tx(t)}px)`;
      const sc = scrollRef.current;
      if (sc && playing.value) {
        const x = tx(t);
        if (x > sc.scrollLeft + sc.clientWidth - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 60);
      }
    };
    place(getTime());
    return onTime(place);
  }, [z]);

  useEffect(() => {
    const sc = scrollRef.current;
    const update = () => (view.value = { left: sc.scrollLeft, width: sc.clientWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(sc);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    sc.addEventListener('scroll', onScroll);
    return () => {
      ro.disconnect();
      sc.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Zoom holder tiden under pekeren (eller spillhodet) på samme sted på skjermen.
  // Mange hendelser kan komme før tidslinjen er tegnet på nytt, så ankeret huskes til den er det.
  const anchorRef = useRef(null);
  const zoomTo = (next, t, offset) => {
    const a = anchorRef.current || { t, offset };
    const value = Math.min(800, Math.max(1, next));
    // Ved grensen for zoom skjer ingen ny tegning, så ankeret glemmes med en gang.
    if (Math.abs(value - pps.value) < 1e-9) {
      anchorRef.current = null;
      return;
    }
    anchorRef.current = a;
    pps.value = value;
  };
  useLayoutEffect(() => {
    const a = anchorRef.current;
    const sc = scrollRef.current;
    if (!a || !sc) return;
    anchorRef.current = null;
    sc.scrollLeft = Math.max(0, PAD + a.t * pps.value - a.offset);
    view.value = { left: sc.scrollLeft, width: sc.clientWidth };
  }, [z]);

  // Styreflate som i Final Cut Pro: to fingre ruller sidelengs og opp og ned (vanlig rulling),
  // knip zoomer rundt pekeren. Ctrl eller Cmd og rullehjulet zoomer også, ett hakk om gangen.
  useEffect(() => {
    const sc = scrollRef.current;
    const root = sc.closest('.timeline');
    const onWheel = (e) => {
      const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sc.clientHeight : 1;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const rect = sc.getBoundingClientRect();
        const mx = Math.max(0, Math.min(sc.clientWidth, e.clientX - rect.left));
        // Knip gir små verdier; et rullehjul gir store hakk som begrenses, så zoomen blir jevn.
        const dy = Math.max(-40, Math.min(40, e.deltaY * lines));
        const a = anchorRef.current;
        const t = a ? a.t : (sc.scrollLeft + mx - PAD) / pps.value;
        zoomTo(pps.value * Math.exp(-dy * 0.0125), t, a ? a.offset : mx);
        return;
      }
      // Alt og rullehjulet over et sporhode endrer høyden på sporet, som i Premiere Pro.
      const head = e.altKey && e.target.closest?.('.track-head[data-lane]');
      if (head) {
        e.preventDefault();
        const lane = Number(head.dataset.lane);
        const kind = head.dataset.kind;
        const cur = head.getBoundingClientRect().height;
        const next = clampTrackHeight(kind, cur - Math.max(-30, Math.min(30, (e.deltaY || e.deltaX) * lines * 0.25)));
        commands.setTrackHeight(e.shiftKey ? kindLanes(project.value, kind) : [lane], next, true);
        return;
      }
      // Over sporhodene og linjalen: rull tidslinjen likevel.
      if (!sc.contains(e.target)) {
        e.preventDefault();
        sc.scrollTop += e.deltaY * lines;
        sc.scrollLeft += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * lines;
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    commands.registerTimelineView({
      zoomAt: (factor, t, offset) => zoomTo(pps.value * factor, t, offset),
      zoom: (factor) => {
        const sc = scrollRef.current;
        const t = getTime();
        // Spillhodet blir stående; er det utenfor bildet, zoomes det rundt midten.
        let offset = tx(t) - sc.scrollLeft;
        if (offset < 0 || offset > sc.clientWidth) offset = sc.clientWidth / 2;
        zoomTo(pps.value * factor, offset === sc.clientWidth / 2 ? (sc.scrollLeft + offset - PAD) / pps.value : t, offset);
      },
      fit: () => {
        const sc = scrollRef.current;
        const d = Math.max(1, project.value.duration);
        pps.value = Math.min(800, Math.max(1, (sc.clientWidth - PAD * 2 - 20) / d));
        sc.scrollLeft = 0;
      },
    });
  }, []);

  const timeAt = (clientX) => {
    const rect = contentRef.current.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left - PAD) / pps.value);
  };
  const rowAt = (clientY) => {
    const rect = contentRef.current.getBoundingClientRect();
    const y = clientY - rect.top - RULER_H;
    return rows.find((r) => y >= r.y && y < r.y + r.h + 2) || (y < 0 ? rows[0] : rows[rows.length - 1]);
  };

  const snap = (t, exclude = new Set(), extra = []) => {
    if (!snapping.value) return { t };
    const thresh = 8 / pps.value;
    let best = null;
    const consider = (c) => {
      if (Math.abs(c - t) < thresh && (best == null || Math.abs(c - t) < Math.abs(best - t))) best = c;
    };
    consider(getTime());
    consider(0);
    for (const m of project.value.markers) consider(m.t);
    for (const c of Object.values(project.value.clips)) {
      if (exclude.has(c.id)) continue;
      consider(c.start);
      consider(c.start + c.dur);
    }
    extra.forEach(consider);
    return best == null ? { t } : { t: best, snapped: true };
  };

  /* Pekerhendelser */

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    // Volum og fades som dras her, gjelder bare klippet man drar i, selv om flere er markert.
    mirror.paused = true;
    window.addEventListener('pointerup', () => (mirror.paused = false), { once: true });
    const el = e.target.closest('[data-hit]');
    const hit = el?.dataset.hit;
    const T = timeAt(e.clientX);
    const proj = project.value;
    const hitClip = proj.clips[el?.dataset.clip || el?.dataset.id];
    if (hitClip && !inEditingGroup(hitClip)) return;

    if (hit === 'ruler' || hit === 'marker') {
      if (hit === 'marker') {
        seek(Number(el.dataset.t));
        return;
      }
      seek(snap(T).t);
      dragRef.current = { kind: 'scrub' };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    skim.value = null;
    if (tool.value === 'zoom') {
      commands.zoomAt(e.altKey ? 1 / 2 : 2, T, e.clientX - scrollRef.current.getBoundingClientRect().left);
      return;
    }
    const captionHit = proj.clips[el?.dataset.clip]?.type === 'caption';
    if (tool.value === 'range' && !captionHit && hit !== 'ruler') {
      dragRef.current = { kind: 'range', T0: snap(T).t, moved: false, x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (hit === 'comp') {
      selection.value = [el.dataset.clip];
      selectedComponent.value = { clipId: el.dataset.clip, key: el.dataset.key };
      return;
    }
    selectedComponent.value = null;
    if (hit === 'axfade') {
      selection.value = [];
      selectedTransition.value = `ax:${el.dataset.id}`;
      return;
    }
    if (tool.value === 'hand') {
      const sc = scrollRef.current;
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (hit === 'transition' || hit === 'transition-edge') {
      const clip = proj.clips[el.dataset.id];
      if (!clip || proj.lanes?.[clip.lane]?.locked) return;
      const edge = el.dataset.edge || 'start';
      selection.value = [];
      selectedTransition.value = transitionSelection(clip.id, edge);
      if (hit === 'transition-edge') {
        const prev = clip.lane === 0 ? proj.clips[proj.primary[proj.primary.indexOf(clip.id) - 1]] : null;
        const range = transitionWindow(clip, Boolean(prev), prev, edge);
        dragRef.current = { kind: 'transition-resize', x: e.clientX, y: e.clientY, clip: deepClone(clip), edge, handle: el.dataset.handle, centered: edge === 'start' && Boolean(prev), range, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      } else {
        // Overgangen kan dras til starten eller slutten av et klipp, eller til et kutt.
        dragRef.current = { kind: 'transition-move', x: e.clientX, y: e.clientY, id: clip.id, edge, tr: deepClone(clip[edge === 'end' ? 'transitionOut' : 'transition']), moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (hit === 'kf') {
      const clip = proj.clips[el.dataset.clip];
      if (!clip || proj.lanes?.[clip.lane]?.locked) return;
      dragRef.current = { kind: 'kf', x: e.clientX, y: e.clientY, clip: deepClone(clip), from: Number(el.dataset.t), moved: false };
      seek(clip.start + (Number(el.dataset.t) - clip.in) / kfRate(clip));
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const clipId = el?.dataset.clip;
    if (!clipId) {
      // Klikk i tomt område flytter avspillingen, dra markerer klippene innenfor. Cmd, Ctrl eller Shift legger til.
      const add = e.metaKey || e.ctrlKey || e.shiftKey;
      if (!add) selection.value = [];
      selectedTransition.value = null;
      const r = contentRef.current.getBoundingClientRect();
      dragRef.current = { kind: 'marquee', T, x: e.clientX, y: e.clientY, x0: e.clientX - r.left, y0: e.clientY - r.top, base: add ? [...selection.value] : [], moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const clip = proj.clips[clipId];
    selectedTransition.value = null;
    if (proj.lanes?.[clip.lane]?.locked) {
      selection.value = [];
      seek(T);
      return;
    }

    if (tool.value === 'blade' && (hit === 'clip' || hit === 'edge')) {
      const t = snap(T, new Set([clipId])).t;
      commit((p) => splitClip(p, clipId, t));
      return;
    }

    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      const set = new Set(selection.value);
      const ids = clipSelection(clipId, e.altKey);
      const remove = ids.every((id) => set.has(id));
      ids.forEach((id) => remove ? set.delete(id) : set.add(id));
      selection.value = [...set];
      return;
    }
    // Inne i gruppen velges medlemmene som vanlige klipp.
    if (!selection.value.includes(clipId)) selection.value = clipSelection(clipId, e.altKey);
    if (clip.type === 'caption' && (getTime() < clip.start || getTime() >= clip.start + clip.dur)) seek(clip.start);

    const base = { x: e.clientX, y: e.clientY, T, clip: deepClone(clip), moved: false };
    if (hit === 'vol') {
      e.preventDefault();
      const prop = el.dataset.prop;
      const kfIndex = el.dataset.kf != null ? Number(el.dataset.kf) : null;
      if (el.dataset.key) selectedComponent.value = { clipId, key: el.dataset.key };
      if (e.altKey) {
        // Et punkt som allerede finnes skal ikke flyttes av et nytt Alt-klikk.
        if (kfIndex == null) commands.addVolumeKeyframe(clipId, T, prop);
        return;
      }
      // Et punkt dras enten opp/ned eller sidelengs; den første bevegelsen bestemmer retningen.
      dragRef.current = { ...base, kind: 'vol', prop, h: Number(el.dataset.height), kf: kfIndex, indices: kfIndex == null ? volumeSegment(clip, prop, T) : [kfIndex] };
      volumePreview.value = kfIndex == null ? { clipId, prop, T, index: null, x: e.clientX, y: e.clientY } : null;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const positionTool = tool.value === 'position' && clip.lane === 0;
    if (hit === 'fade') {
      dragRef.current = { ...base, kind: 'fade', which: el.dataset.which };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (hit === 'aedge') {
      dragRef.current = { ...base, kind: 'aedge', edge: el.dataset.edge };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (tool.value === 'trim' && clip.type !== 'caption') {
      // Trimverktøyet: kant mellom to klipp ruller kuttet, klippet selv slippes, Option glir.
      const idx = proj.primary.indexOf(clip.id);
      if (hit === 'edge' && clip.lane === 0) {
        const pair = el.dataset.edge === 'end' ? [clip.id, proj.primary[idx + 1]] : [proj.primary[idx - 1], clip.id];
        if (pair[0] && pair[1]) dragRef.current = { ...base, kind: 'roll', a: pair[0], b: pair[1], cut: proj.clips[pair[1]].start };
        else dragRef.current = { ...base, kind: 'trim', edge: el.dataset.edge };
      } else if (hit === 'edge') dragRef.current = { ...base, kind: 'trim', edge: el.dataset.edge };
      else dragRef.current = { ...base, kind: e.altKey && clip.lane === 0 ? 'slide' : 'slip' };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (hit === 'edge') dragRef.current = { ...base, kind: positionTool ? 'ptrim' : 'trim', edge: el.dataset.edge };
    else if (positionTool && hit === 'clip') dragRef.current = { ...base, kind: 'pmove' };
    else dragRef.current = { ...base, kind: 'move', ids: [...selection.value], originals: selection.value.map((id) => deepClone(proj.clips[id])), originalProject: proj };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    const T = timeAt(e.clientX);
    // Kniven viser hvor kuttet havner.
    if (bladeRef.current) {
      const over = tool.value === 'blade' && !d && e.target.closest('[data-clip]');
      bladeRef.current.style.display = over ? 'block' : 'none';
      if (over) {
        const r = e.target.closest('[data-clip]').getBoundingClientRect();
        const crect = contentRef.current.getBoundingClientRect();
        bladeRef.current.style.transform = `translate(${tx(snap(T).t)}px, ${r.top - crect.top}px)`;
        bladeRef.current.style.height = `${r.height}px`;
      }
    }
    // Skumming: visningen følger pekeren, og lyden spilles i korte utdrag.
    if (!d && !sourceProject.value && skimming.value && !playing.value && tool.value !== 'hand') {
      const st = snap(T).t;
      skim.value = { T: st };
      if (skimRef.current) {
        skimRef.current.style.display = 'block';
        skimRef.current.style.transform = `translateX(${tx(st)}px)`;
      }
      const now = performance.now();
      if (audioSkimming.value && now - lastScrub.current > 70) {
        lastScrub.current = now;
        scrubAudio();
      }
    } else if (skimRef.current) skimRef.current.style.display = 'none';
    if (!d) return;
    if (d.kind === 'pan') {
      const sc = scrollRef.current;
      sc.scrollLeft = d.left - (e.clientX - d.x);
      sc.scrollTop = d.top - (e.clientY - d.y);
      return;
    }
    if (d.kind === 'scrub') {
      seek(snap(T).t);
      return;
    }
    if (d.kind === 'transition-move') {
      if (!d.moved && Math.abs(e.clientX - d.x) < 3 && Math.abs(e.clientY - d.y) < 3) return;
      d.moved = true;
      const p = project.value;
      const target = libraryDropTarget(p, { kind: 'transition', id: d.tr.type }, rowAt(e.clientY).lane, T, { transitionDur: d.tr.dur, tolerance: 12 / pps.value });
      const targetRow = target && rows.find((r) => r.lane === target.lane);
      d.target = targetRow ? target : null;
      const prev = target?.edge === 'start' ? p.clips[p.primary[p.primary.indexOf(target.id) - 1]] : null;
      setGhost(d.target ? { ...target, row: targetRow, prev } : null);
      return;
    }
    if (d.kind === 'marquee') {
      if (!d.moved && Math.abs(e.clientX - d.x) < 3 && Math.abs(e.clientY - d.y) < 3) return;
      d.moved = true;
      const r = contentRef.current.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const box = { left: Math.min(d.x0, x), top: Math.min(d.y0, y), right: Math.max(d.x0, x), bottom: Math.max(d.y0, y) };
      setMarquee(box);
      const p = project.value;
      const hits = new Set(d.base);
      for (const el of contentRef.current.querySelectorAll('[data-hit="clip"]')) {
        const b = el.getBoundingClientRect();
        const c = p.clips[el.dataset.clip];
        if (c && inEditingGroup(c) && !p.lanes?.[c.lane]?.locked && b.right - r.left > box.left && b.left - r.left < box.right && b.bottom - r.top > box.top && b.top - r.top < box.bottom) {
          clipSelection(c.id, e.altKey).forEach((id) => hits.add(id));
        }
      }
      if (hits.size !== selection.value.length || selection.value.some((id) => !hits.has(id))) selection.value = [...hits];
      return;
    }
    if (!d.moved && Math.abs(e.clientX - d.x) < 3 && Math.abs(e.clientY - d.y) < 3) return;
    if (!d.moved) {
      d.moved = true;
      beginTransient();
    }
    const dt = (e.clientX - d.x) / pps.value;
    const c = d.clip;

    if (d.kind === 'transition-resize') {
      const index = d.handle === 'start' ? 0 : 1;
      const exclude = new Set([c.id]);
      const prev = project.value.primary[project.value.primary.indexOf(c.id) - 1];
      if (d.centered && prev) exclude.add(prev);
      const s = snap(d.range[index] + dt, exclude);
      const dur = resizedTransitionDuration(d.range[1] - d.range[0], s.t - d.range[index], d.handle, d.centered);
      const transition = c[d.edge === 'end' ? 'transitionOut' : 'transition'];
      updateTransient((p) => setTransition(p, c.id, transition.type, Math.round(dur * p.fps) / p.fps, d.edge));
      const current = project.value.clips[c.id];
      const previous = project.value.clips[prev];
      const window = transitionWindow(current, Boolean(previous), previous, d.edge);
      setSnapLine(s.snapped && Math.abs(window[index] - s.t) < 1 / project.value.fps ? window[index] : null);
      return;
    }
    if (d.kind === 'range') {
      const t1 = snap(T).t;
      updateTransient((p) => (p.range = { in: Math.min(d.T0, t1), out: Math.max(d.T0, t1) }));
      return;
    }
    if (d.kind === 'roll') {
      const s1 = snap(d.cut + dt, new Set([d.a, d.b]));
      setSnapLine(s1.snapped ? s1.t : null);
      updateTransient((p) => rollEdit(p, d.a, d.b, s1.t - d.cut));
      return;
    }
    if (d.kind === 'slip') {
      updateTransient((p) => slipClip(p, c.id, -dt));
      return;
    }
    if (d.kind === 'slide') {
      updateTransient((p) => slideClip(p, c.id, dt));
      return;
    }
    if (d.kind === 'aedge') {
      const key = d.edge === 'start' ? 'aLead' : 'aTail';
      const sign = d.edge === 'start' ? -1 : 1;
      const v = (c.props[key] || 0) + sign * dt;
      updateTransient((p) => (p.clips[c.id].props[key] = Math.round(Math.max(-c.dur + 0.1, Math.min(10, v)) * 100) / 100));
      return;
    }
    if (d.kind === 'kf') {
      const c0 = d.clip;
      const fps = project.value.fps;
      const r = kfRate(c0);
      // Flytt i hele bilder, regnet om til klippets tidsakse.
      const to = d.from + Math.round(dt * fps) / fps * r;
      updateTransient((p) => moveKeyframes(p.clips[c0.id], d.from, to));
      seek(c0.start + (Math.max(c0.in, Math.min(c0.in + c0.dur * r, to)) - c0.in) / r);
      return;
    }
    if (d.kind === 'pmove') {
      const s1 = snap(c.start + dt, new Set([c.id]));
      setSnapLine(s1.snapped ? s1.t : null);
      updateTransient((p) => positionMove(p, c.id, s1.t - c.start));
      return;
    }
    if (d.kind === 'ptrim') {
      const edgeT = d.edge === 'start' ? c.start + dt : c.start + c.dur + dt;
      const s = snap(edgeT, new Set([c.id]));
      setSnapLine(s.snapped ? s.t : null);
      updateTransient((p) => positionTrim(p, c.id, d.edge, s.t - (d.edge === 'start' ? c.start : c.start + c.dur)));
      return;
    }
    if (d.kind === 'trim') {
      const edgeT = d.edge === 'start' ? c.start + dt : c.start + c.dur + dt;
      const s = snap(edgeT, new Set([c.id]));
      setSnapLine(s.snapped ? s.t : null);
      const delta = s.t - (d.edge === 'start' ? c.start : c.start + c.dur);
      updateTransient((p) => trimClip(p, c.id, d.edge, delta));
      return;
    }
    if (d.kind === 'fade') {
      const key = d.which === 'in' ? 'aFadeIn' : 'aFadeOut';
      const [a, b] = audioWindow(c);
      const v = Math.max(0, Math.min((b - a) / 2, (c.props[key] || 0) + (d.which === 'in' ? dt : -dt)));
      updateTransient((p) => (p.clips[c.id].props[key] = Math.round(v * 100) / 100));
      return;
    }
    if (d.kind === 'vol') {
      if (d.kf != null) d.axis ??= Math.abs(e.clientX - d.x) > Math.abs(e.clientY - d.y) ? 'x' : 'y';
      if (d.axis === 'x') {
        const fps = project.value.fps;
        const r = kfRate(c);
        const to = c.kf[d.prop][d.kf][0] + Math.round(dt * fps) / fps * r;
        updateTransient((p) => moveVolumeKeyframe(p.clips[c.id], d.prop, d.kf, to, r / fps));
        return;
      }
      const delta = volumeDelta(d.y - e.clientY, d.h);
      updateTransient((p) => shiftVolume(p.clips[c.id], d.prop, delta, d.indices));
      volumePreview.value = { clipId: c.id, prop: d.prop, T: d.T, index: d.indices.length === 1 ? d.indices[0] : null, x: e.clientX, y: e.clientY };
      return;
    }
    if (d.kind === 'move') {
      const row = rowAt(e.clientY);
      // En gruppe med et klipp i hovedsporet flyttes ved å flytte det klippet; resten følger med.
      const lead = d.ids.length > 1 ? groupLead(d.originalProject, d.ids) : null;
      const linkedParent = recordingEditId(d.originalProject, d.clip.id);
      const linked = linkedParent !== d.clip.id;
      const c = lead ? d.originalProject.clips[lead] : linked ? d.originalProject.clips[linkedParent] : d.clip;
      if (d.ids.length === 1 || lead) {
        const visual = isVisual(c);
        let lane = row.lane;
        if (c.type === 'caption') lane = CAPTION_LANE;
        else if (lane === CAPTION_LANE) lane = visual ? 1 : -1;
        else if (visual && lane < 0) lane = c.lane === 0 ? 0 : 1;
        else if (!visual && lane >= 0) lane = -1;
        if (lead) lane = 0;
        if (linked) lane = c.lane;
        // Ikke høyere enn ett nytt spor over de som finnes: et nytt spor skyver alle sporene ned,
        // og ellers havner musa over et nytt tomt spor for hver bevegelse.
        const used = Object.values(d.originalProject.clips).map((o) => o.lane).filter((l) => l !== CAPTION_LANE);
        if (lane > 0) lane = Math.min(lane, Math.max(1, ...used) + 1);
        else if (lane < 0) lane = Math.max(lane, Math.min(-1, ...used) - 1);
        if (lane === 0) {
          const p0 = project.value;
          const order = p0.primary.filter((id) => id !== c.id);
          let idx = order.length;
          for (let i = 0; i < order.length; i++) {
            const o = p0.clips[order[i]];
            if (T < o.start + o.dur / 2) {
              idx = i;
              break;
            }
          }
          setGhost(null);
          setSnapLine(null);
          updateTransient((p) => moveClip(p, c.id, { lane: 0, primaryIndex: idx }));
        } else {
          const s1 = snap(c.start + dt, new Set([c.id]));
          const s2 = snap(c.start + c.dur + dt, new Set([c.id]));
          let start = c.start + dt;
          let sl = null;
          if (s1.snapped && (!s2.snapped || Math.abs(s1.t - (c.start + dt)) <= Math.abs(s2.t - (c.start + c.dur + dt)))) {
            start = s1.t;
            sl = s1.t;
          } else if (s2.snapped) {
            start = s2.t - c.dur;
            sl = s2.t;
          }
          setSnapLine(sl);
          updateTransient((p) => moveClip(p, c.id, { start, lane }));
        }
      } else {
        // Flere klipp: flytt bare de frie i tid. Klipp gruppert med et klipp i hovedsporet blir der videoen er.
        const anchored = new Set(d.originalProject.primary.map((id) => d.originalProject.clips[id].group).filter((g) => g && g !== editingGroup.value));
        updateTransient((p) => {
          for (const o of d.originals) if (o.lane !== 0 && !anchored.has(o.group) && p.clips[o.id]) p.clips[o.id].start = Math.max(0, o.start + dt);
          syncRecordingTracks(p);
        });
      }
    }
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.kind === 'marquee' && !d.moved) seek(d.T);
    const t = d?.kind === 'transition-move' && e.type !== 'pointercancel' && d.target;
    if (t && (t.id !== d.id || t.edge !== d.edge)) {
      commit((q) => {
        removeTransition(q, d.id, d.edge);
        q.clips[t.id][t.edge === 'end' ? 'transitionOut' : 'transition'] = d.tr;
        setTransition(q, t.id, d.tr.type, d.tr.dur, t.edge);
      });
      selectedTransition.value = transitionSelection(t.id, t.edge);
    }
    setMarquee(null);
    volumePreview.value = null;
    setGhost(null);
    setSnapLine(null);
    if (d?.moved) endTransient(e.type !== 'pointercancel');
  };

  const onContextMenu = async (e) => {
    e.preventDefault();
    const el = e.target.closest('[data-hit]');
    const clipId = el?.dataset.clip;
    const hitClip = project.value.clips[clipId || el?.dataset.id];
    if (hitClip && !inEditingGroup(hitClip)) return;
    if (el?.dataset.hit === 'marker') {
      const id = await window.api.popupMenu([{ id: 'del', label: 'Delete Marker' }]);
      if (id === 'del') commit((p) => (p.markers = p.markers.filter((m) => m.id !== el.dataset.id)));
      return;
    }
    if (el?.dataset.hit === 'kf' || (el?.dataset.hit === 'vol' && el.dataset.kf != null)) {
      const cid = el.dataset.clip;
      const c = project.value.clips[cid];
      if (!c || project.value.lanes?.[c.lane]?.locked) return;
      const prop = el.dataset.hit === 'vol' ? el.dataset.prop : null;
      const t = prop ? c.kf[prop]?.[Number(el.dataset.kf)]?.[0] : Number(el.dataset.t);
      if (t == null) return;
      const current = Object.entries(c.kf).filter(([key]) => !prop || prop === key).flatMap(([, l]) => l.filter((k) => Math.abs(k[0] - t) < 1e-4)).map((k) => k[2] || 'linear');
      const id = await window.api.popupMenu([
        ...EASINGS.map((x) => ({ id: x.id, label: x.label, checked: current.includes(x.id) })),
        { separator: true },
        { id: 'delete', label: 'Delete Keyframe' },
      ]);
      if (!id) return;
      commit((p) => {
        const cc = p.clips[cid];
        if (!cc) return;
        for (const [prop, list] of Object.entries(cc.kf)) {
          if (prop === 'layout' || (el.dataset.hit === 'vol' && prop !== el.dataset.prop)) continue;
          if (id === 'delete') {
            // Behold siste nivå når volumautomatiseringen fjernes helt.
            if (list.length === 1 && ['volume', 'micVolume', 'sysVolume'].includes(prop)) cc.props[prop] = list[0][1];
            removeKeyframe(cc, prop, t);
          } else if (list.some((k) => Math.abs(k[0] - t) < 1e-4)) setKeyframeEase(cc, prop, t, id);
        }
      });
      return;
    }
    if (clipId) {
      if (!selection.value.includes(clipId)) selection.value = clipSelection(clipId);
      await commands.clipContextMenu(clipId, timeAt(e.clientX));
      return;
    }
    const row = rowAt(e.clientY);
    await commands.laneContextMenu(row.lane, timeAt(e.clientX));
  };

  // Slipp fra mediebiblioteket eller filer fra Finder/Utforsker.
  const onDragOver = (e) => {
    e.preventDefault();
    const row = rowAt(e.clientY);
    const item = libraryDrag.value;
    if (item?.kind === 'media') {
      skim.value = null;
      if (skimRef.current) skimRef.current.style.display = 'none';
      const T = timeAt(e.clientX);
      const over = Object.values(project.value.clips).find((c) => c.lane === row.lane && c.type !== 'gap' && T >= c.start && T < c.start + c.dur)?.id;
      if (hoverRef.current?.id !== over) hoverRef.current = { id: over, since: performance.now() };
      // dragover kommer hele tiden mens pekeren står stille, så ingen egen timer trengs.
      const held = over && performance.now() - hoverRef.current.since > REPLACE_HOLD_MS;
      const replace = held ? mediaDropPreview(project.value, item, row.lane, T, over) : [];
      hoverRef.current.replace = replace.length ? over : null;
      const clips = (replace.length ? replace : mediaDropPreview(project.value, item, row.lane, snap(T).t))
        .map((clip) => ({ ...clip, row: rows.find((r) => r.lane === clip.lane) }))
        .filter((clip) => clip.row);
      e.dataTransfer.dropEffect = clips.length ? 'copy' : 'none';
      setGhost(clips.length ? { kind: 'media', replace: replace.length > 0, clips } : null);
    } else if (item && ['transition', 'effect', 'afx', 'apreset', 'frameFx', 'redact', 'adjustment'].includes(item.kind)) {
      skim.value = null;
      if (skimRef.current) skimRef.current.style.display = 'none';
      const T = ['frameFx', 'redact', 'adjustment'].includes(item.kind) ? snap(timeAt(e.clientX)).t : timeAt(e.clientX);
      const target = libraryDropTarget(project.value, item, row.lane, T, { transitionDur: prefs.value.transitionDur, tolerance: 12 / pps.value });
      const targetRow = target && rows.find((r) => r.lane === target.lane);
      e.dataTransfer.dropEffect = target && targetRow ? 'copy' : 'none';
      const prev = target?.edge === 'start' ? project.value.clips[project.value.primary[project.value.primary.indexOf(target.id) - 1]] : null;
      setGhost(target && targetRow ? { ...target, row: targetRow, prev } : null);
    } else {
      e.dataTransfer.dropEffect = 'copy';
      setGhost({ t: snap(timeAt(e.clientX)).t, row });
    }
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setGhost(null);
    const row = rowAt(e.clientY);
    const item = libraryDrag.value;
    const exact = item && ['transition', 'effect', 'afx', 'apreset'].includes(item.kind);
    const T = exact ? timeAt(e.clientX) : snap(timeAt(e.clientX)).t;
    try {
      await commands.handleDrop(e.dataTransfer, row.lane, T, { tolerance: 12 / pps.value, replace: item?.kind === 'media' ? hoverRef.current?.replace : null });
    } finally {
      hoverRef.current = null;
      endLibraryDrag();
    }
  };

  const rangeEl = p.range ? (
    <div class="tl-range" style={{ left: tx(p.range.in), width: (p.range.out - p.range.in) * z }} />
  ) : null;

  return (
    <div class="timeline" onPointerDownCapture={(e) => {
      if (e.button !== 0) return;
      commands.browserFocus.value = false;
      showTimeline();
    }}>
      <TimelineToolbar />
      {editingGroup.value && <div class="tl-group-edit" role="status">
        <Link2 size={14} />
        <b>Editing group</b>
        <span>Select a clip to edit it. Esc to finish.</span>
        <Button class="small" onClick={exitGroup}>Done</Button>
      </div>}
      <VolumePreview />
      <div class="tl-body">
      <TrackHeaders rows={rows} p={p} scrollRef={scrollRef} />
      <div class="tl-scroll" ref={scrollRef}>
        <div
          class={`tl-content tool-${tool.value}`}
          ref={contentRef}
          style={{ width, height: height + RULER_H + 40 }}
          onPointerDown={onPointerDown}
          onDblClick={(e) => {
            if (tool.value !== 'select' && tool.value !== 'position') return;
            // Pointer capture fra drag-håndteringen kan gjøre selve tidslinjen til e.target.
            const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-hit]');
            if (el?.dataset.hit === 'clip') {
              const clip = project.value.clips[el.dataset.clip];
              if (clip?.group && inEditingGroup(clip)) enterGroup(clip.id);
            } else if (!el && editingGroup.value) exitGroup();
            else if (!el && rowAt(e.clientY).kind === 'caption' && !project.value.lanes?.[CAPTION_LANE]?.locked) commands.addCaption(timeAt(e.clientX));
          }}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            if (bladeRef.current) bladeRef.current.style.display = 'none';
            if (skimRef.current) skimRef.current.style.display = 'none';
            if (!dragRef.current) skim.value = null;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onLostPointerCapture={onPointerUp}
          onContextMenu={onContextMenu}
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            setGhost(null);
            hoverRef.current = null;
          }}
          onDrop={onDrop}
        >
          <Ruler width={width} />
          {rangeEl}
          {marquee && <div class="tl-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.right - marquee.left, height: marquee.bottom - marquee.top }} />}
          <div class="tl-lanes" style={{ top: RULER_H }}>
            {rows.map((r) => (
              <LaneBg key={r.lane} row={r} p={p} />
            ))}
            {(() => {
              // Bare klipp i og nær det synlige området blir komponenter (lange prosjekter).
              const { left, width: vw } = view.value;
              const t0 = (left - PAD - 600) / z;
              const t1 = (left + vw + 600) / z;
              const byLane = new Map(rows.map((r) => [r.lane, r]));
              const sel = new Set(selection.value);
              const out = [];
              for (const c of Object.values(p.clips)) {
                if (c.start + c.dur < t0 || c.start > t1) continue;
                const row = byLane.get(c.lane);
                if (row) out.push(<Clip key={c.id} clip={c} row={row} media={p.media[c.mediaId]} selected={sel.has(c.id)} z={z} labelStart={labelInsets.get(c.id)?.start || 0} labelEnd={labelInsets.get(c.id)?.end || 0} />);
              }
              return out;
            })()}
            {Object.values(p.clips).map((c) => {
              const parent = c.linkedTo && p.clips[c.linkedTo];
              if (!parent) return null;
              const row = rows.find((r) => r.lane === c.lane);
              const parentRow = rows.find((r) => r.lane === parent.lane);
              if (!row || !parentRow) return null;
              return <div key={`pip-link-${c.id}`} class="pip-connection" title="PiP linked to screen recording" style={{ left: tx(c.start) + 8, top: row.y + row.h, height: Math.max(2, parentRow.y - row.y - row.h) }} />;
            })}
            {transitions.map(({ id, edge, transition, a, b, prev }) => {
              const row = rows.find((r) => r.lane === p.clips[id].lane);
              if (!row) return null;
              const label = TRANSITIONS.find((t) => t.id === transition.type)?.label || transition.type;
              const centered = edge === 'start' && Boolean(prev);
              // Bare over bildedelen, så lyden under kan justeres (fades) for seg.
              const h = Math.min(...[p.clips[id], prev].filter(Boolean).map((c) => videoHeight(c, row, p.media[c.mediaId])));
              return (
                <div
                  key={transitionSelection(id, edge)}
                  data-hit="transition"
                  data-id={id}
                  data-edge={edge}
                  class={`tl-transition${selectedTransition.value === transitionSelection(id, edge) ? ' selected' : ''}${!inEditingGroup(p.clips[id]) ? ' group-outside' : ''}`}
                  style={{ left: tx(a), width: Math.max(10, (b - a) * z), top: row.y, height: h }}
                  title={`${label}, ${(b - a).toFixed(2)} s. Drag to move it, or drag the handles to change duration.`}
                >
                  {(centered || edge === 'end') && <div class="transition-handle start" data-hit="transition-edge" data-id={id} data-edge={edge} data-handle="start" title="Drag to change transition duration" />}
                  {(centered || edge === 'start') && <div class="transition-handle end" data-hit="transition-edge" data-id={id} data-edge={edge} data-handle="end" title="Drag to change transition duration" />}
                </div>
              );
            })}
 {Object.values(p.clips).map((c) => {
              if (!c.expanded) return null;
              const row = rows.find((r) => r.lane === c.lane);
              if (!row || !clipHasAudio(c, p.media[c.mediaId])) return null;
              return <AudioBand key={`ab${c.id}`} clip={c} row={row} media={p.media[c.mediaId]} z={z} selected={selection.value.includes(c.id)} />;
            })}
            {Object.values(p.clips).map((c) => {
              if (!c.axfade || c.lane === 0) return null;
              const xf = audioXfadeWindow(p, c);
              const row = rows.find((r) => r.lane === c.lane);
              if (!xf || !row) return null;
              return (
                <div key={`ax${c.id}`} data-hit="axfade" data-id={c.id} class={`tl-axfade${selectedTransition.value === `ax:${c.id}` ? ' selected' : ''}${!inEditingGroup(c) ? ' group-outside' : ''}`} title={`Audio crossfade, ${c.axfade.toFixed(2)} s`} style={{ left: tx(xf.a), width: Math.max(8, (xf.b - xf.a) * z), top: row.y + 2, height: row.h - 4 }}>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                    <path d="M0 4 C 50 4, 50 36, 100 36" />
                    <path d="M0 36 C 50 36, 50 4, 100 4" />
                  </svg>
                </div>
              );
            })}
            {ghost && (ghost.kind === 'media' ? ghost.clips.map((clip, i) => (
              <div key={i} class={`tl-drop-preview media${ghost.replace ? ' replace' : ''}`} style={{ left: tx(clip.a), width: Math.max(1, (clip.b - clip.a) * z), top: clip.row.y + 2, height: clip.row.h - 4 }}>
                {ghost.replace && <span>Replace</span>}
              </div>
            )) : ghost.kind ? (
              <div class={`tl-drop-preview ${ghost.kind}`} style={{ left: tx(ghost.a), width: Math.max(10, (ghost.b - ghost.a) * z), top: ghost.row.y, height: ghost.row.h }}>
                {ghost.kind !== 'transition' && <span>{ghost.label}</span>}
              </div>
            ) : <div class="tl-ghost" style={{ left: tx(ghost.t), top: ghost.row.y, height: ghost.row.h }} />)}
          </div>
          {snapLine != null && <div class="tl-snapline" style={{ left: tx(snapLine) }} />}
          <div class="tl-blade" ref={bladeRef} />
          <div class="tl-skimmer" ref={skimRef} />
          <div class="tl-playhead" ref={playheadRef}>
            <div class="head" />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// Sporhoder til venstre: navn, skjul, demp og lås. Følger den vertikale rullingen.
function TrackHeaders({ rows, p, scrollRef }) {
  const innerRef = useRef(null);
  useEffect(() => {
    const sc = scrollRef.current;
    const sync = () => innerRef.current && (innerRef.current.style.transform = `translateY(${-sc.scrollTop}px)`);
    sc.addEventListener('scroll', sync);
    sync();
    return () => sc.removeEventListener('scroll', sync);
  }, []);
  const toggle = (lane, key) =>
    commit((q) => {
      q.lanes = q.lanes || {};
      q.lanes[lane] = { ...(q.lanes[lane] || {}), [key]: !q.lanes[lane]?.[key] };
    });
  // Dra i underkanten av sporhodet for å endre høyden. Shift endrer alle spor av samme slag.
  const startResize = (e, r) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const y0 = e.clientY;
    const h0 = r.h;
    const lanes = e.shiftKey ? kindLanes(p, r.kind) : [r.lane];
    document.body.classList.add('row-resizing');
    const move = (ev) => commands.setTrackHeight(lanes, clampTrackHeight(r.kind, h0 + ev.clientY - y0), 'live');
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('row-resizing');
      commands.endTrackHeight();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  return (
    <div class="tl-headers">
      <div class="tl-headers-inner" ref={innerRef} style={{ paddingTop: RULER_H + 8 }}>
        {rows.map((r) => {
          const l = p.lanes?.[r.lane] || {};
          const name = r.kind === 'caption' ? 'CC' : r.kind === 'primary' ? 'V1' : r.kind === 'video' ? `V${r.lane + 1}` : `A${-r.lane}`;
          return (
            <div key={r.lane} class={`track-head ${r.kind}${r.spare ? ' spare' : ''}${r.h < 34 ? ' short' : ''}`} data-lane={r.spare ? undefined : r.lane} data-kind={r.kind} style={{ height: r.h, marginBottom: 2 }}>
              {r.spare ? null : (
                <>
                  <span class="track-name" title={name}>
                    {name}
                  </span>
                  <div class="track-btns">
                    {r.kind !== 'audio' && (
                      <button class={l.hidden ? 'off' : ''} title={l.hidden ? 'Show track' : 'Hide track'} onClick={() => toggle(r.lane, 'hidden')}>
                        {l.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    )}
                    {r.kind !== 'caption' && (
                      <button class={l.muted ? 'off' : ''} title={l.muted ? 'Unmute track' : 'Mute track'} onClick={() => toggle(r.lane, 'muted')}>
                        {l.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                    )}
                    <button class={l.locked ? 'on' : ''} title={l.locked ? 'Unlock track' : 'Lock track'} onClick={() => toggle(r.lane, 'locked')}>
                      {l.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                    </button>
                  </div>
                  <div
                    class="track-resize"
                    title="Drag to make the track taller or shorter. Shift drag changes all tracks of this kind. Double click resets."
                    onPointerDown={(e) => startResize(e, r)}
                    onDblClick={(e) => commands.setTrackHeight(e.shiftKey ? kindLanes(p, r.kind) : [r.lane], null)}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const isMac = window.api.platform === 'darwin';
const TOOLS = [
  { id: 'select', icon: MousePointer2, label: 'Select', key: 'A' },
  { id: 'position', icon: MoveHorizontal, label: 'Position (move clips and leave gaps)', key: 'P' },
  { id: 'trim', icon: Brackets, label: 'Trim (roll at a cut, slip in a clip, Option drag to slide)', key: 'T' },
  { id: 'range', icon: SquareDashed, label: 'Range Selection', key: 'R' },
  { id: 'blade', icon: Scissors, label: 'Blade', key: 'B' },
  { id: 'zoom', icon: Search, label: 'Zoom (Option click to zoom out)', key: 'Z' },
  { id: 'hand', icon: Hand, label: 'Hand (scroll the timeline)', key: 'H' },
];

function TimelineToolbar() {
  const p = project.value;
  return (
    <div class="tl-toolbar">
      <div class="group">
        <div class="tool-group">
          {TOOLS.map((t) => (
            <IconButton key={t.id} icon={t.icon} data-tool={t.id} title={`${t.label} (${t.key})`} active={tool.value === t.id} onClick={() => (tool.value = t.id)} />
          ))}
        </div>
        <span class="sep" />
        <IconButton icon={Magnet} data-toggle="snapping" title="Snapping (N)" active={snapping.value} onClick={() => (snapping.value = !snapping.value)} />
        <IconButton icon={StretchHorizontal} data-toggle="skimming" title="Skimming (S)" active={skimming.value} onClick={() => (skimming.value = !skimming.value)} />
        <IconButton icon={Headphones} data-toggle="audioSkimming" title="Audio skimming (Shift S)" active={skimming.value && audioSkimming.value} disabled={!skimming.value} onClick={() => (audioSkimming.value = !audioSkimming.value)} />
        <IconButton icon={Spline} data-toggle="keyframeEasing" title={`Default for new keyframes: ${prefs.value.keyframeEasing === 'linear' ? 'Linear. Click for Eased' : 'Eased. Click for Linear'}`} active={prefs.value.keyframeEasing !== 'linear'} onClick={() => setPrefs({ keyframeEasing: prefs.value.keyframeEasing === 'linear' ? 'easeInOut' : 'linear' })} />
      </div>
      <div class="tl-time">
        <span class="tc">{formatTimecode(timeSig.value, p.fps)}</span>
        <span class="dim"> / {formatTimecode(p.duration, p.fps)}</span>
      </div>
      <div class="group">
        <IconButton icon={Type} title={`Add Title (${isMac ? '⌃T' : 'Alt+T'})`} onClick={() => commands.addTitle('center')} />
        <IconButton icon={Captions} title={`Add Caption (${isMac ? '⌥C' : 'Alt+C'})`} onClick={() => commands.addCaption()} />
        <span class="sep" />
        <IconButton icon={ZoomOut} title={`Zoom Out (${isMac ? '⌘-' : 'Ctrl+-'})`} onClick={() => commands.zoom(1 / 1.5)} />
        <input
          type="range"
          class="slider zoom"
          min={0}
          max={100}
          step={0.1}
          value={Math.log(pps.value) / Math.log(800) * 100}
          onInput={(e) => (pps.value = Math.max(1, Math.pow(800, Number(e.currentTarget.value) / 100)))}
        />
        <IconButton icon={ZoomIn} title={`Zoom In (${isMac ? '⌘+' : 'Ctrl++'})`} onClick={() => commands.zoom(1.5)} />
      </div>
    </div>
  );
}

function niceStep(z) {
  const target = 90 / z;
  const steps = [1 / 30, 1 / 10, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
  return steps.find((s) => s >= target) || 3600;
}

function Ruler({ width }) {
  const z = pps.value;
  const p = project.value;
  const { left, width: vw } = view.value;
  const step = niceStep(z);
  const t0 = Math.max(0, Math.floor((left - PAD) / z / step) * step);
  const t1 = (left + vw) / z;
  const ticks = [];
  for (let t = t0; t <= t1 + step; t += step) {
    const s = Math.round(t * 1000) / 1000;
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    const label = step < 1 ? `${mm}:${String(ss).padStart(2, '0')}.${Math.round((s % 1) * 10)}` : `${mm}:${String(ss).padStart(2, '0')}`;
    ticks.push(
      <div key={s} class="tick" style={{ left: tx(s) }}>
        <span>{label}</span>
      </div>
    );
  }
  return (
    <div class="tl-ruler" data-hit="ruler" style={{ width }}>
      {ticks}
      {p.range && <div class="ruler-range" style={{ left: tx(p.range.in), width: (p.range.out - p.range.in) * z }} />}
      {p.markers.map((m) => (
        <div key={m.id} class="marker" data-hit="marker" data-id={m.id} data-t={m.t} style={{ left: tx(m.t) }} title={m.label || 'Marker'} />
      ))}
    </div>
  );
}

function LaneBg({ row, p }) {
  const lane = p.lanes?.[row.lane] || {};
  return (
    <div class={`tl-lane ${row.kind}${lane.hidden ? ' hidden' : ''}${lane.muted ? ' muted' : ''}${lane.locked ? ' locked' : ''}${row.spare ? ' spare' : ''}`} style={{ top: row.y, height: row.h }}>
      {row.spare && <span class="lane-label">Drop here for a new {row.kind === 'video' ? 'video' : 'audio'} track</span>}
      {lane.locked && <span class="lane-lock" />}
    </div>
  );
}

const Clip = memo(function Clip({ clip, row, media, selected, z, labelStart = 0, labelEnd = 0 }) {
  waveVersion.value;
  const x = PAD + clip.start * z;
  const w = Math.max(2, clip.dur * z);
  const { left, width: vw } = view.value;
  if (x > left + vw + 200 || x + w < left - 200) return null;

  const hasAudio = clipHasAudio(clip, media);
  const expanded = clip.expanded && hasAudio && clip.type !== 'audio';
  const speed = speedOf(clip);
  const visual = isVisual(clip) && !['title', 'redact', 'adjustment'].includes(clip.type);
  const busy = media ? busyMedia.value.get(media.id) : null;
  const colorTag = CLIP_COLORS.find((c) => c.id === clip.colorLabel);
  const cls = ['tl-clip', `t-${clip.type}`, !inEditingGroup(clip) && 'group-outside', busy && 'busy', colorTag && 'labeled', selected && 'selected', !clip.enabled && 'disabled', row.kind === 'primary' && 'primary', clip.group && 'grouped', media?.offline && 'offline', audioComponents(clip, media).length > 0 && audioComponents(clip, media).every((c) => c.off) && 'audio-off'].filter(Boolean).join(' ');
  const label = clip.type === 'title' ? titleText(clip) : clip.type === 'redact' ? `${redactLabel(clip)} (redact)` : clip.type === 'caption' ? clip.props.text || 'Caption' : clip.name || media?.name || clip.type;
  const narrow = w < 24;
  const thumbStream = clip.recordingPart === 'camera' ? media?.streams?.camera : media?.streams?.screen || media?.streams?.main || media?.streams?.camera;
  const audioComp = primaryComponent(clip, media);
  const audioStream = audioComp?.stream;
  const bandH = expanded ? bandHeight(row, clip, media) : Math.round(row.h * 0.34);
  const boxH = expanded ? row.h - bandH - 3 : row.h;
  const waveH = expanded ? 0 : clip.type === 'audio' ? row.h - 16 : hasAudio && row.kind !== 'caption' ? bandH : 0;
  const stripH = boxH - 16 - waveH;
  const showStrip = visual && stripH > 12 && thumbStream?.thumbs;

  return (
    <div class={cls} data-hit="clip" data-clip={clip.id} style={{ left: x, width: w, top: row.y, height: boxH, ...(colorTag ? { '--label': colorTag.color } : {}) }} title={busy ? `${busy.title}${busy.queued ? ' (waiting)' : ` ${Math.round(busy.progress * 100)} %`}` : undefined}>
      {!narrow && (
        <div class="clip-label" data-hit="clip" data-clip={clip.id} style={{ marginLeft: labelStart, marginRight: labelEnd }}>
          {clip.type === 'recording' && <span class="badge">{clip.recordingPart === 'camera' ? 'PiP' : 'REC'}</span>}
          {clip.type === 'adjustment' && <span class="badge">ADJ</span>}
          {clip.linkedTo && <span class="badge group" title="PiP linked to screen. Select to adjust PiP only; detach to edit its timing independently."><Link2 size={9} strokeWidth={2.6} /></span>}
          {clip.reverse && <span class="badge speed" title="Reversed">Reverse</span>}
          {clip.ramp ? <span class="badge speed" title="Speed ramp">Ramp</span> : speed !== 1 && <span class="badge speed">{speed === 0 ? 'Freeze' : `${Math.round(speed * 100)}%`}</span>}
          {clip.solo && <span class="badge solo">S</span>}
          {clip.group && (
            <span class="badge group" title="Grouped. Double click to edit the group. Option click to select one clip.">
              <Link2 size={9} strokeWidth={2.6} />
            </span>
          )}
          <span class="name">{label}</span>
        </div>
      )}
      {showStrip && <Filmstrip clip={clip} stream={thumbStream} x={x} w={w} h={stripH} z={z} media={media} />}
      {clip.type === 'recording' && !narrow && <RecBands clip={clip} media={media} />}
      {waveH > 0 && (
        <Wave clip={clip} stream={audioStream} componentKey={audioComp?.key} x={x} w={w} h={waveH} z={z} offset={audioStream?.offset || 0} />
      )}
      {selected && <Keyframes clip={clip} z={z} />}
      {busy && (
        // Klippet analyseres: turkise striper som beveger seg, og en fremdriftslinje nederst.
        <div class="tl-busy" aria-label="Working">
          <div class="tl-busy-bar" style={{ width: `${Math.max(3, busy.progress * 100)}%` }} />
        </div>
      )}
      <div class="edge start" data-hit="edge" data-edge="start" data-clip={clip.id} />
      <div class="edge end" data-hit="edge" data-edge="end" data-clip={clip.id} />
    </div>
  );
});

function Filmstrip({ clip, stream, x, w, h, z, media }) {
  const { left, width: vw } = view.value;
  const tileW = Math.round((h * 16) / 9);
  const files = stream.thumbs.files;
  const interval = stream.thumbs.interval;
  const offset = stream.offset || 0;
  const tiles = [];
  const from = Math.max(0, Math.floor((left - x) / tileW) - 1);
  const to = Math.min(Math.ceil(w / tileW), Math.ceil((left + vw - x) / tileW) + 1);
  for (let i = from; i < to; i++) {
    const tSrc = sourceTime(clip, clip.start + ((i + 0.5) * tileW) / z) - offset;
    const idx = media?.kind === 'image' ? 0 : Math.max(0, Math.min(files.length - 1, Math.floor(tSrc / interval)));
    tiles.push(<img key={i} src={fileUrl(files[idx])} style={{ left: i * tileW, width: tileW, height: h }} draggable={false} />);
  }
  return (
    <div class="filmstrip" style={{ height: h }}>
      {tiles}
    </div>
  );
}

// Tynne bånd som viser når kamera og forstørret peker er i bruk i et opptak.
function RecBands({ clip, media }) {
  const cam = clip.recordingPart !== 'screen' && media.streams.camera?.hasVideo && clip.props.showCamera !== false;
  return (
    <div class="rec-bands">
      {cam && <span class="band cam" title="Camera" />}
      {clip.props.showKeys && media.rec?.keys?.length > 0 && <span class="band keys" title="Keystrokes" />}
      {clip.props.cursorZoom && media.rec?.zooms?.length > 0 && <span class="band zoom" title="Cursor zoom" />}
    </div>
  );
}

function Wave({ clip, stream, componentKey, x, w, h, z, offset, lead = 0 }) {
  waveVersion.value;
  const ref = useRef(null);
  const prop = componentVolumeProp(clip, componentKey);
  const { left, width: vw } = view.value;
  const wave = getWave(stream?.wave);
  const visX = Math.max(0, left - x - 50);
  const visW = Math.max(1, Math.min(w, left + vw - x + 50) - visX);
  const fi = Math.min((clip.props.aFadeIn || 0) * z, w);
  const fo = Math.min((clip.props.aFadeOut || 0) * z, w);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(visW * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!wave) return;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const mid = cv.height / 2;
    for (let px = 0; px < cv.width; px++) {
      // Kildetid for hver piksel (følger fart, ramper og baklengs).
      const T = clip.start + (visX + px / dpr) / z - lead;
      const a0 = sourceTime(clip, T) - offset;
      const a1 = sourceTime(clip, T + 1 / dpr / z) - offset;
      const t0 = Math.min(a0, a1);
      const t1 = Math.max(a0, a1);
      let i0 = Math.floor(t0 * wave.rate);
      const i1 = Math.max(i0 + 1, Math.ceil(t1 * wave.rate));
      let m = 0;
      for (; i0 < i1; i0++) if (i0 >= 0 && wave.peaks[i0] > m) m = wave.peaks[i0];
      const xx = visX + px / dpr;
      const fade = Math.min(1, fi > 0 ? xx / fi : 1, fo > 0 ? (w - xx) / fo : 1);
      const gain = dbToGain(valueAt(clip, prop, T) ?? 0) * Math.max(0, fade);
      const v = Math.min(1, (m / 255) * gain);
      const hh = v * mid * 0.95;
      g.fillRect(px, mid - hh, 1, hh * 2);
    }
  }, [wave, visX, visW, h, z, clip.start, clip.in, clip.speed, clip.ramp, clip.reverse, clip.freezeAt, offset, lead, prop, clip.props[prop], clip.kf?.[prop], fi, fo, w]);
  const kfs = clip.kf?.[prop];
  const path = volumePath(clip, prop, w, h, z, lead);
  const hit = { 'data-hit': 'vol', 'data-clip': clip.id, 'data-prop': prop, 'data-height': h, 'data-key': componentKey };
  const preview = (e, index = null) => {
    if (e.buttons) return;
    const rect = e.currentTarget.closest('.wave').getBoundingClientRect();
    volumePreview.value = { clipId: clip.id, prop, index, T: clip.start + (e.clientX - rect.left) / z - lead, x: e.clientX, y: e.clientY };
  };
  const hidePreview = (e) => { if (!e.buttons) volumePreview.value = null; };
  const displayDb = valueAt(clip, prop, Math.max(clip.start, Math.min(clip.start + clip.dur, getTime()))) ?? 0;
  // Volumlinjen stopper der fadene begynner; fadekurvene tar over derfra.
  const fadeClip = fi > 0 || fo > 0 ? `fade-${clip.id}-${componentKey || 'a'}` : null;
  const fadeIn = fi > 0 ? fadePath(clip, prop, 'in', fi / z, w, h, z, lead) : '';
  const fadeOut = fo > 0 ? fadePath(clip, prop, 'out', fo / z, w, h, z, lead) : '';
  const lineAt = (px) => volumeY(valueAt(clip, prop, clip.start + px / z - lead) ?? 0, h);
  return (
    <div class="wave" style={{ height: h }}>
      <canvas ref={ref} style={{ left: visX, width: visW, height: h }} />
      <svg class="vol-kf" width={w} height={h}>
        {fadeClip && (
          <clipPath id={fadeClip}>
            <rect x={fi} width={Math.max(0, w - fi - fo)} height={h} />
          </clipPath>
        )}
        {fi > 0 && <path class="fade-shade" d={`${fadeIn} L${fi} 0 L0 0 Z`} />}
        {fo > 0 && <path class="fade-shade" d={`${fadeOut} L${w - fo} 0 L${w} 0 Z`} />}
        {fi > 0 && <path class="vol-line" d={fadeIn} />}
        {fo > 0 && <path class="vol-line" d={fadeOut} />}
        <path class="vol-line" d={path} clip-path={fadeClip ? `url(#${fadeClip})` : undefined} />
        <path class="vol-line-hit" d={path} {...hit} onPointerMove={preview} onPointerEnter={preview} onPointerLeave={hidePreview}>
          <title>{`${formatVolumeDb(displayDb)} · Drag to adjust volume. ${isMac ? 'Option' : 'Alt'} click to add a keyframe. Drag between keyframes to adjust both.`}</title>
        </path>
      </svg>
      {w >= 24 && ['in', 'out'].map((which) => {
        // Håndtaket sitter på volumlinjen, litt inn fra kanten så trimkanten fortsatt kan gripes.
        const len = which === 'in' ? fi : fo;
        const px = which === 'in' ? Math.max(len, 9) : Math.min(w - len, w - 9);
        const secs = (which === 'in' ? clip.props.aFadeIn : clip.props.aFadeOut) || 0;
        return <div key={which} class="fade-handle" data-hit="fade" data-which={which} data-clip={clip.id} style={{ left: px - 5, top: lineAt(px) - 5 }} title={`Fade ${which}${secs ? `, ${secs.toFixed(2)} s` : ''}. Drag to change.`} />;
      })}
      {visW > 60 && <span class="vol-db-label" style={{ left: visX + visW - 62 }}>{formatVolumeDb(displayDb)}</span>}
      {kfs?.map(([t, v, ease], i) => {
        const px = ((t - clip.in) / kfRate(clip) + lead) * z;
        if (px < 0 || px > w) return null;
        return <div key={i} class="vol-kf-point" {...hit} data-kf={i} style={{ left: px - 6, top: volumeY(v, h) - 6 }} title={`${EASINGS.find((e) => e.id === (ease || 'linear'))?.label || ease}. Drag up or down for volume, sideways to move. Right click for easing.`} />;
      })}
    </div>
  );
}

function Keyframes({ clip, z }) {
  // Nøkkelbildene kan dras for å endre tidspunkt, og høyreklikkes for myk overgang.
  const times = new Map();
  for (const [prop, list] of Object.entries(clip.kf || {})) {
    if (['volume', 'micVolume', 'sysVolume', 'layout'].includes(prop)) continue;
    for (const [t, , e] of list) if (t >= clip.in - 1e-4 && t <= clip.in + clip.dur * kfRate(clip) + 1e-4) times.set(t, [...(times.get(t) || []), prop + (e && e !== 'linear' ? ` (${e})` : '')]);
  }
  return (
    <div class="kf-row">
      {[...times].map(([t, props]) => (
        <span key={t} class="kf" data-hit="kf" data-clip={clip.id} data-t={t} title={`Keyframe: ${props.join(', ')}. Drag to move, right click for easing.`} style={{ left: ((t - clip.in) / kfRate(clip)) * z - 5 }} />
      ))}
    </div>
  );
}

// Høyden på utvidet lyd. Flere lydkomponenter får en stripe hver.
// Høyden på bildedelen av et klipp, uten lydbåndet.
function videoHeight(clip, row, media) {
  if (clip.type === 'audio' || !clipHasAudio(clip, media)) return row.h;
  return clip.expanded ? row.h - bandHeight(row, clip, media) - 3 : row.h - Math.round(row.h * 0.34);
}

function bandHeight(row, clip, media) {
  const n = audioComponents(clip, media).length;
  return Math.round(row.h * (n > 1 ? 0.5 : 0.34));
}

// Utvidet lyd: lyddelen vises under bildet og kan dras ut over kantene (J- og L-kutt).
function AudioBand({ clip, row, media, z, selected }) {
  const lead = clip.props.aLead || 0;
  const tail = clip.props.aTail || 0;
  const h = bandHeight(row, clip, media);
  const x = PAD + (clip.start - lead) * z;
  const w = Math.max(4, (clip.dur + lead + tail) * z);
  const comps = audioComponents(clip, media);
  const comp = primaryComponent(clip, media);
  const stream = comp?.stream;
  const sc = selectedComponent.value;
  // Fargekoden følger med til lyddelen når den er utvidet.
  const colorTag = CLIP_COLORS.find((c) => c.id === clip.colorLabel);
  return (
    <div class={`tl-audioband${selected ? ' selected' : ''}${colorTag ? ' labeled' : ''}${!inEditingGroup(clip) ? ' group-outside' : ''}`} data-hit="clip" data-clip={clip.id} style={{ left: x, width: w, top: row.y + row.h - h, height: h, ...(colorTag ? { '--label': colorTag.color } : {}) }}>
      {comps.length > 1 ? (
        // Én stripe per lydkomponent. Klikk velger komponenten, V slår den av og på.
        comps.map((c, i) => {
          const ch = Math.floor(h / comps.length);
          const active = sc?.clipId === clip.id && sc.key === c.key;
          return (
            <div
              key={c.key}
              class={`tl-comp${c.off ? ' off' : ''}${active ? ' selected' : ''}`}
              data-hit="comp"
              data-clip={clip.id}
              data-key={c.key}
              title={`${c.label}${c.off ? ' (off)' : ''}. Click to select, press V to switch it on or off.`}
              style={{ top: i * ch, height: ch }}
            >
              <Wave clip={clip} stream={c.stream} componentKey={c.key} x={x} w={w} h={ch} z={z} offset={c.stream.offset || 0} lead={lead} />
              <span class="comp-label">{c.label}</span>
            </div>
          );
        })
      ) : (
        <Wave clip={clip} stream={stream} componentKey={comp?.key} x={x} w={w} h={h} z={z} offset={stream?.offset || 0} lead={lead} />
      )}
      <div class="edge start" data-hit="aedge" data-edge="start" data-clip={clip.id} title="Drag to extend or shorten the audio" />
      <div class="edge end" data-hit="aedge" data-edge="end" data-clip={clip.id} title="Drag to extend or shorten the audio" />
    </div>
  );
}
