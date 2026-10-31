// Tidslinjen: magnetisk hovedspor i midten, tilkoblede klipp over og lyd under,
// som i Final Cut Pro.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { memo } from 'preact/compat';
import {
  AudioLines,
  Captions,
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
  audioXfadeWindow,
  dbToGain,
  kfRate,
  sourceTime,
  speedOf,
  formatTimecode,
  moveKeyframes,
  setKeyframeEase,
  isVisual,
  transitionWindow,
  audioComponents,
  primaryComponent,
  titleText,
  CLIP_COLORS,
} from '../../shared/model.js';
import { groupLead, groupMembers, moveClip, positionMove, positionTrim, rollEdit, slideClip, slipClip, splitClip, trimClip } from '../../shared/ops.js';
import {
  beginTransient,
  commit,
  endTransient,
  getTime,
  getWave,
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
  updateTransient,
  waveVersion,
  selectedComponent,
  busyMedia,
} from './store.js';
import { fileUrl, scrubAudio, seek } from './playback.js';
import { IconButton } from '../ui.jsx';
import * as commands from './commands.js';

const PAD = 16;
const RULER_H = 26;
const HEIGHTS = { caption: 26, video: 46, primary: 78, audio: 54 };
const view = signal({ left: 0, width: 1000 });

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
  const rows = [{ lane: CAPTION_LANE, h: HEIGHTS.caption, kind: 'caption' }];
  for (let l = maxLane + 1; l >= 1; l--) rows.push({ lane: l, h: HEIGHTS.video, kind: 'video', spare: l === maxLane + 1 });
  rows.push({ lane: 0, h: HEIGHTS.primary, kind: 'primary' });
  for (let l = -1; l >= minLane - 1; l--) rows.push({ lane: l, h: HEIGHTS.audio, kind: 'audio', spare: l === minLane - 1 });
  let y = 0;
  for (const r of rows) {
    r.y = y;
    y += r.h + 2;
  }
  return { rows, height: y };
}

const tx = (t) => PAD + t * pps.value;

export function Timeline() {
  const p = project.value;
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const playheadRef = useRef(null);
  const dragRef = useRef(null);
  const [ghost, setGhost] = useState(null);
  const [snapLine, setSnapLine] = useState(null);
  const bladeRef = useRef(null);
  const skimRef = useRef(null);
  const lastScrub = useRef(0);
  const { rows, height } = useMemo(() => laneRows(p), [p]);
  const z = pps.value;
  const width = Math.max(view.value.width, PAD * 2 + (p.duration + 30) * z);

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

  // Knipezoom og Ctrl/Cmd + rullehjul zoomer rundt pekeren.
  useEffect(() => {
    const sc = scrollRef.current;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = sc.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const t = (sc.scrollLeft + mx - PAD) / pps.value;
      const next = Math.min(800, Math.max(1, pps.value * Math.exp(-e.deltaY * 0.01)));
      pps.value = next;
      requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, PAD + t * next - mx)));
    };
    sc.addEventListener('wheel', onWheel, { passive: false });
    return () => sc.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    commands.registerTimelineView({
      zoomAt: (factor, t, offset) => {
        const sc = scrollRef.current;
        pps.value = Math.min(800, Math.max(1, pps.value * factor));
        requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, PAD + t * pps.value - offset)));
      },
      zoom: (factor) => {
        const sc = scrollRef.current;
        const t = getTime();
        const offset = tx(t) - sc.scrollLeft;
        pps.value = Math.min(800, Math.max(1, pps.value * factor));
        requestAnimationFrame(() => (sc.scrollLeft = Math.max(0, PAD + t * pps.value - offset)));
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
    commands.browserFocus.value = false;
    const el = e.target.closest('[data-hit]');
    const hit = el?.dataset.hit;
    const T = timeAt(e.clientX);
    const proj = project.value;

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
    if (tool.value === 'range' && hit !== 'ruler') {
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
    if (hit === 'transition') {
      selection.value = [];
      selectedTransition.value = el.dataset.id;
      return;
    }
    if (hit === 'kf') {
      const clip = proj.clips[el.dataset.clip];
      dragRef.current = { kind: 'kf', x: e.clientX, y: e.clientY, clip: structuredClone(clip), from: Number(el.dataset.t), moved: false };
      seek(clip.start + (Number(el.dataset.t) - clip.in) / kfRate(clip));
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const clipId = el?.dataset.clip;
    if (!clipId) {
      selection.value = [];
      selectedTransition.value = null;
      seek(T);
      dragRef.current = { kind: 'scrub' };
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
      set.has(clipId) ? set.delete(clipId) : set.add(clipId);
      selection.value = [...set];
      return;
    }
    // Et klikk velger hele gruppen. Option (Alt) velger bare ett klipp.
    if (!selection.value.includes(clipId)) selection.value = e.altKey ? [clipId] : groupMembers(proj, clipId);

    const base = { x: e.clientX, y: e.clientY, T, clip: structuredClone(clip), moved: false };
    const positionTool = tool.value === 'position' && clip.lane === 0;
    if (hit === 'aedge') {
      dragRef.current = { ...base, kind: 'aedge', edge: el.dataset.edge };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (tool.value === 'trim') {
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
    else if (hit === 'fade') dragRef.current = { ...base, kind: 'fade', which: el.dataset.which };
    else if (hit === 'vol') {
      if (e.altKey) {
        commands.addVolumeKeyframe(clipId, T);
        return;
      }
      dragRef.current = { ...base, kind: 'vol', kfIndex: el.dataset.kf != null ? Number(el.dataset.kf) : null };
    } else dragRef.current = { ...base, kind: 'move', ids: [...selection.value], originals: selection.value.map((id) => structuredClone(proj.clips[id])), originalProject: proj };
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
    if (!d && skimming.value && !playing.value && tool.value !== 'hand' && !e.target.closest('.tl-ruler')) {
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
    if (!d.moved && Math.abs(e.clientX - d.x) < 3 && Math.abs(e.clientY - d.y) < 3) return;
    if (!d.moved) {
      d.moved = true;
      beginTransient();
    }
    const dt = (e.clientX - d.x) / pps.value;
    const c = d.clip;

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
      const v = Math.max(0, Math.min(c.dur / 2, (c.props[key] || 0) + (d.which === 'in' ? dt : -dt)));
      updateTransient((p) => (p.clips[c.id].props[key] = Math.round(v * 100) / 100));
      return;
    }
    if (d.kind === 'vol') {
      const dy = (d.y - e.clientY) / 1.5;
      if (d.kfIndex != null) {
        const [t0, v0] = c.kf.volume[d.kfIndex];
        updateTransient((p) => {
          const list = p.clips[c.id].kf.volume;
          list[d.kfIndex] = [t0, clampDb(v0 + dy * 0.5)];
        });
      } else {
        updateTransient((p) => (p.clips[c.id].props.volume = clampDb((c.props.volume || 0) + dy * 0.5)));
      }
      return;
    }
    if (d.kind === 'move') {
      const row = rowAt(e.clientY);
      // En gruppe med et klipp i hovedsporet flyttes ved å flytte det klippet; resten følger med.
      const lead = d.ids.length > 1 ? groupLead(d.originalProject, d.ids) : null;
      const c = lead ? d.originalProject.clips[lead] : d.clip;
      if (d.ids.length === 1 || lead) {
        const visual = isVisual(c);
        let lane = row.lane;
        if (c.type === 'caption') lane = CAPTION_LANE;
        else if (lane === CAPTION_LANE) lane = visual ? 1 : -1;
        else if (visual && lane < 0) lane = c.lane === 0 ? 0 : 1;
        else if (!visual && lane >= 0) lane = -1;
        if (lead) lane = 0;
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
        const anchored = new Set(d.originalProject.primary.map((id) => d.originalProject.clips[id].group).filter(Boolean));
        updateTransient((p) => {
          for (const o of d.originals) if (o.lane !== 0 && !anchored.has(o.group) && p.clips[o.id]) p.clips[o.id].start = Math.max(0, o.start + dt);
        });
      }
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    setSnapLine(null);
    if (d?.moved) endTransient(true);
  };

  const onContextMenu = async (e) => {
    e.preventDefault();
    const el = e.target.closest('[data-hit]');
    const clipId = el?.dataset.clip;
    if (el?.dataset.hit === 'marker') {
      const id = await window.api.popupMenu([{ id: 'del', label: 'Delete Marker' }]);
      if (id === 'del') commit((p) => (p.markers = p.markers.filter((m) => m.id !== el.dataset.id)));
      return;
    }
    if (el?.dataset.hit === 'kf') {
      const cid = el.dataset.clip;
      const t = Number(el.dataset.t);
      const c = project.value.clips[cid];
      const current = Object.values(c.kf).flatMap((l) => l.filter((k) => Math.abs(k[0] - t) < 1e-4)).map((k) => k[2] || 'linear');
      const id = await window.api.popupMenu([
        ...EASINGS.map((x) => ({ id: x.id, label: x.label, checked: current.includes(x.id) })),
        { separator: true },
        { id: 'delete', label: 'Delete Keyframe' },
      ]);
      if (!id) return;
      commit((p) => {
        const cc = p.clips[cid];
        for (const [prop, list] of Object.entries(cc.kf)) {
          if (prop === 'layout') continue;
          if (id === 'delete') {
            cc.kf[prop] = list.filter((k) => Math.abs(k[0] - t) > 1e-4);
            if (!cc.kf[prop].length) delete cc.kf[prop];
          } else if (list.some((k) => Math.abs(k[0] - t) < 1e-4)) setKeyframeEase(cc, prop, t, id);
        }
      });
      return;
    }
    if (clipId) {
      if (!selection.value.includes(clipId)) selection.value = [clipId];
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
    setGhost({ t: snap(timeAt(e.clientX)).t, row });
  };
  const onDrop = async (e) => {
    e.preventDefault();
    setGhost(null);
    const row = rowAt(e.clientY);
    const T = snap(timeAt(e.clientX)).t;
    await commands.handleDrop(e.dataTransfer, row.lane, T);
  };

  const rangeEl = p.range ? (
    <div class="tl-range" style={{ left: tx(p.range.in), width: (p.range.out - p.range.in) * z }} />
  ) : null;

  return (
    <div class="timeline">
      <TimelineToolbar />
      <div class="tl-body">
      <TrackHeaders rows={rows} p={p} scrollRef={scrollRef} />
      <div class="tl-scroll" ref={scrollRef}>
        <div
          class={`tl-content tool-${tool.value}`}
          ref={contentRef}
          style={{ width, height: height + RULER_H + 40 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            if (bladeRef.current) bladeRef.current.style.display = 'none';
            if (skimRef.current) skimRef.current.style.display = 'none';
            if (!dragRef.current) skim.value = null;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={onContextMenu}
          onDragOver={onDragOver}
          onDragLeave={() => setGhost(null)}
          onDrop={onDrop}
        >
          <Ruler width={width} />
          {rangeEl}
          <div class="tl-lanes" style={{ top: RULER_H }}>
            {rows.map((r) => (
              <LaneBg key={r.lane} row={r} p={p} />
            ))}
            {Object.values(p.clips).map((c) => {
              const row = rows.find((r) => r.lane === c.lane);
              if (!row) return null;
              return <Clip key={c.id} clip={c} row={row} media={p.media[c.mediaId]} selected={selection.value.includes(c.id)} z={z} />;
            })}
            {p.primary.map((id, i) => {
              const c = p.clips[id];
              if (!c?.transition) return null;
              const prevClip = i > 0 ? p.clips[p.primary[i - 1]] : null;
              const [a, b] = transitionWindow(c, Boolean(prevClip), prevClip);
              const row = rows.find((r) => r.lane === 0);
              return (
                <div
                  key={`t${id}`}
                  data-hit="transition"
                  data-id={id}
                  class={`tl-transition${selectedTransition.value === id ? ' selected' : ''}`}
                  style={{ left: tx(a), width: Math.max(10, (b - a) * z), top: row.y + 16, height: row.h - 32 }}
                  title={TRANSITIONS.find((t) => t.id === c.transition.type)?.label}
                >
                  <span>{TRANSITIONS.find((t) => t.id === c.transition.type)?.label}</span>
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
                <div key={`ax${c.id}`} data-hit="axfade" data-id={c.id} class={`tl-axfade${selectedTransition.value === `ax:${c.id}` ? ' selected' : ''}`} title={`Audio crossfade, ${c.axfade.toFixed(2)} s`} style={{ left: tx(xf.a), width: Math.max(8, (xf.b - xf.a) * z), top: row.y + 2, height: row.h - 4 }}>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                    <path d="M0 4 C 50 4, 50 36, 100 36" />
                    <path d="M0 36 C 50 36, 50 4, 100 4" />
                  </svg>
                </div>
              );
            })}
            {ghost && <div class="tl-ghost" style={{ left: tx(ghost.t), top: ghost.row.y, height: ghost.row.h }} />}
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
  const addTrack = (kind) =>
    commit((q) => {
      const rr = laneRows(q).rows;
      q.tracks = { video: q.tracks?.video || 1, audio: q.tracks?.audio || 1 };
      if (kind === 'video') q.tracks.video = Math.max(...rr.filter((r) => r.kind === 'video').map((r) => r.lane));
      else q.tracks.audio = -Math.min(...rr.filter((r) => r.kind === 'audio').map((r) => r.lane));
    });
  return (
    <div class="tl-headers">
      <div class="tl-headers-inner" ref={innerRef} style={{ paddingTop: RULER_H + 8 }}>
        {rows.map((r) => {
          const l = p.lanes?.[r.lane] || {};
          const name = r.kind === 'caption' ? 'Captions' : r.kind === 'primary' ? 'V1 Storyline' : r.kind === 'video' ? `V${r.lane + 1}` : `A${-r.lane}`;
          return (
            <div key={r.lane} class={`track-head ${r.kind}${r.spare ? ' spare' : ''}`} style={{ height: r.h, marginBottom: 2 }}>
              {r.spare ? (
                <button class="add-track" onClick={() => addTrack(r.kind)} title={r.kind === 'video' ? 'Add a video track. You can also drop clips here.' : 'Add an audio track. You can also drop clips here.'}>
                  + {r.kind === 'video' ? 'Video' : 'Audio'}
                </button>
              ) : (
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
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function clampDb(v) {
  return Math.round(Math.max(-60, Math.min(12, v)) * 10) / 10;
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

const Clip = memo(function Clip({ clip, row, media, selected, z }) {
  waveVersion.value;
  const x = PAD + clip.start * z;
  const w = Math.max(2, clip.dur * z);
  const { left, width: vw } = view.value;
  if (x > left + vw + 200 || x + w < left - 200) return null;

  const hasAudio = clipHasAudio(clip, media);
  const expanded = clip.expanded && hasAudio && clip.type !== 'audio';
  const speed = speedOf(clip);
  const visual = isVisual(clip) && clip.type !== 'title';
  const busy = media ? busyMedia.value.get(media.id) : null;
  const colorTag = CLIP_COLORS.find((c) => c.id === clip.colorLabel);
  const cls = ['tl-clip', `t-${clip.type}`, busy && 'busy', colorTag && 'labeled', selected && 'selected', !clip.enabled && 'disabled', row.kind === 'primary' && 'primary', clip.group && 'grouped', media?.offline && 'offline', audioComponents(clip, media).length > 0 && audioComponents(clip, media).every((c) => c.off) && 'audio-off'].filter(Boolean).join(' ');
  const label = clip.type === 'title' ? titleText(clip) : clip.type === 'caption' ? clip.props.text || 'Caption' : clip.name || media?.name || clip.type;
  const narrow = w < 24;
  const thumbStream = media?.streams?.screen || media?.streams?.main || media?.streams?.camera;
  const audioStream = clipAudioStream(clip, media);
  const bandH = expanded ? bandHeight(row, clip, media) : Math.round(row.h * 0.34);
  const boxH = expanded ? row.h - bandH - 3 : row.h;
  const waveH = expanded ? 0 : clip.type === 'audio' ? row.h - 16 : hasAudio && row.kind !== 'caption' ? bandH : 0;
  const stripH = boxH - 16 - waveH;
  const showStrip = visual && stripH > 12 && thumbStream?.thumbs;

  return (
    <div class={cls} data-hit="clip" data-clip={clip.id} style={{ left: x, width: w, top: row.y, height: boxH, ...(colorTag ? { '--label': colorTag.color } : {}) }} title={busy ? `${busy.title}${busy.queued ? ' (waiting)' : ` ${Math.round(busy.progress * 100)} %`}` : undefined}>
      {!narrow && (
        <div class="clip-label" data-hit="clip" data-clip={clip.id}>
          {clip.type === 'recording' && <span class="badge">REC</span>}
          {clip.reverse && <span class="badge speed" title="Reversed">Reverse</span>}
          {clip.ramp ? <span class="badge speed" title="Speed ramp">Ramp</span> : speed !== 1 && <span class="badge speed">{speed === 0 ? 'Freeze' : `${Math.round(speed * 100)}%`}</span>}
          {clip.solo && <span class="badge solo">S</span>}
          {clip.group && (
            <span class="badge group" title="Grouped. Option click to select one clip.">
              <Link2 size={9} strokeWidth={2.6} />
            </span>
          )}
          <span class="name">{label}</span>
        </div>
      )}
      {showStrip && <Filmstrip clip={clip} stream={thumbStream} x={x} w={w} h={stripH} z={z} media={media} />}
      {clip.type === 'recording' && !narrow && <RecBands clip={clip} media={media} />}
      {waveH > 0 && (
        <Wave clip={clip} stream={audioStream} x={x} w={w} h={waveH} z={z} offset={audioStream?.offset || 0} />
      )}
      {selected && <Keyframes clip={clip} z={z} />}
      {hasAudio && !expanded && !narrow && row.kind !== 'caption' && <FadeHandles clip={clip} z={z} h={waveH} />}
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
  const cam = media.streams.camera?.hasVideo && clip.props.showCamera !== false;
  return (
    <div class="rec-bands">
      {cam && <span class="band cam" title="Camera" />}
      {clip.props.showKeys && media.rec?.keys?.length > 0 && <span class="band keys" title="Keystrokes" />}
      {clip.props.cursorZoom && media.rec?.zooms?.length > 0 && <span class="band zoom" title="Cursor zoom" />}
    </div>
  );
}

function Wave({ clip, stream, x, w, h, z, offset, lead = 0 }) {
  const ref = useRef(null);
  const { left, width: vw } = view.value;
  const wave = getWave(stream?.wave);
  const visX = Math.max(0, left - x - 50);
  const visW = Math.max(1, Math.min(w, left + vw - x + 50) - visX);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(visW * dpr));
    cv.height = Math.max(1, Math.round(h * dpr));
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!wave) return;
    const gain = dbToGain(clip.props.volume ?? clip.props.micVolume ?? 0);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const mid = cv.height / 2;
    for (let px = 0; px < cv.width; px++) {
      // Kildetid for hver piksel (følger fart, ramper og baklengs).
      const a0 = sourceTime(clip, clip.start + (visX + px / dpr) / z - lead) - offset;
      const a1 = sourceTime(clip, clip.start + (visX + (px + 1) / dpr) / z - lead) - offset;
      const t0 = Math.min(a0, a1);
      const t1 = Math.max(a0, a1);
      let i0 = Math.floor(t0 * wave.rate);
      const i1 = Math.max(i0 + 1, Math.ceil(t1 * wave.rate));
      let m = 0;
      for (; i0 < i1; i0++) if (i0 >= 0 && wave.peaks[i0] > m) m = wave.peaks[i0];
      const v = Math.min(1, (m / 255) * gain);
      const hh = Math.max(0.5, v * mid * 0.95);
      g.fillRect(px, mid - hh, 1, hh * 2);
    }
  }, [wave, visX, visW, h, z, clip.in, clip.speed, clip.ramp, clip.reverse, lead, clip.props.volume, clip.props.micVolume]);
  const dbLine = volumeY(clip.props.volume ?? clip.props.micVolume ?? 0, h);
  const kfs = clip.kf?.volume || clip.kf?.micVolume;
  return (
    <div class="wave" style={{ height: h }}>
      <canvas ref={ref} style={{ left: visX, width: visW, height: h }} />
      {clip.type !== 'recording' && (
        <>
          {!kfs && <div class="vol-line" data-hit="vol" data-clip={clip.id} style={{ top: dbLine }} title={`${(clip.props.volume || 0).toFixed(1)} dB`} />}
          {kfs && (
            <svg class="vol-kf" width={w} height={h}>
              <polyline
                points={kfs.map(([t, v]) => `${((t - clip.in) / kfRate(clip) + lead) * z},${volumeY(v, h)}`).join(' ')}
                fill="none"
                stroke="#ffd60a"
                stroke-width="1.5"
              />
            </svg>
          )}
          {kfs?.map(([t, v], i) => (
            <div key={i} class="vol-kf-point" data-hit="vol" data-kf={i} data-clip={clip.id} style={{ left: ((t - clip.in) / kfRate(clip) + lead) * z - 4, top: volumeY(v, h) - 4 }} />
          ))}
        </>
      )}
    </div>
  );
}

function volumeY(db, h) {
  const k = (Math.max(-60, Math.min(12, db)) + 60) / 72;
  return Math.round((1 - k) * (h - 4)) + 2;
}

function Keyframes({ clip, z }) {
  // Nøkkelbildene kan dras for å endre tidspunkt, og høyreklikkes for myk overgang.
  const times = new Map();
  for (const [prop, list] of Object.entries(clip.kf || {})) {
    if (prop === 'volume' || prop === 'layout') continue;
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

function FadeHandles({ clip, z, h }) {
  const fi = (clip.props.aFadeIn || 0) * z;
  const fo = (clip.props.aFadeOut || 0) * z;
  return (
    <>
      <div class="fade-handle in" data-hit="fade" data-which="in" data-clip={clip.id} style={{ left: fi - 4, bottom: h - 8 }} title="Fade in" />
      <div class="fade-handle out" data-hit="fade" data-which="out" data-clip={clip.id} style={{ right: fo - 4, bottom: h - 8 }} title="Fade out" />
      {fi > 0 && <div class="fade-shape in" style={{ width: fi, height: h }} />}
      {fo > 0 && <div class="fade-shape out" style={{ width: fo, height: h }} />}
    </>
  );
}

// Lydstrømmen et klipp viser som lydbølge: den første lydkomponenten som er på.
function clipAudioStream(clip, media) {
  return primaryComponent(clip, media)?.stream || null;
}

// Høyden på utvidet lyd. Flere lydkomponenter får en stripe hver.
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
  const stream = clipAudioStream(clip, media);
  const sc = selectedComponent.value;
  return (
    <div class={`tl-audioband${selected ? ' selected' : ''}`} data-hit="clip" data-clip={clip.id} style={{ left: x, width: w, top: row.y + row.h - h, height: h }}>
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
              <Wave clip={clip} stream={c.stream} x={x} w={w} h={ch} z={z} offset={c.stream.offset || 0} lead={lead} />
              <span class="comp-label">{c.label}</span>
            </div>
          );
        })
      ) : (
        <Wave clip={clip} stream={stream} x={x} w={w} h={h} z={z} offset={stream?.offset || 0} lead={lead} />
      )}
      <div class="edge start" data-hit="aedge" data-edge="start" data-clip={clip.id} title="Drag to extend or shorten the audio" />
      <div class="edge end" data-hit="aedge" data-edge="end" data-clip={clip.id} title="Drag to extend or shorten the audio" />
    </div>
  );
}
