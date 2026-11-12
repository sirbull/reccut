import { useEffect, useRef, useState } from 'preact/hooks';
import { Activity, Maximize2, Minimize2, Settings2, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-preact';
import { deepClone, formatTimecode, isVisual, kfTime, valueAt } from '../../shared/model.js';
import { captionLayout, wrapText } from '../../shared/render.js';
import { clipBox, clipMatrix, clipPivot, maskList, shapeAt } from '../../shared/shapes.js';
import { followMatrix } from '../../shared/follow.js';
import { sourceMediaId } from './store.js';
import { dragData } from './Browser.jsx';
import { beginTransient, browserPlayhead, commit, endTransient, getTime, playing, project, selectedClips, room, selectedTransition, selection, skim, timeSig, updateTransient } from './store.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { IconButton } from '../ui.jsx';
import { PREVIEW_RESOLUTIONS, prefs, setPrefs } from '../prefs.js';
import { setKeyframe } from './keyframes.js';
import { toggleViewerFullscreen } from './fullscreen.js';
import { trackArea } from './track.js';
import { VideoScopes } from './VideoScopes.jsx';
import { commandsBlocked } from '../keyboard.js';

// Spill bakover: avspillingsikonet speilet.
const PlayBackward = ({ size }) => <Play size={size} fill="currentColor" style={{ transform: 'scaleX(-1)' }} />;

export function Viewer() {
  const p = project.value;
  const source = playback.sourceProject.value;
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = () => toggleViewerFullscreen(wrapRef.current);
  const resize = () => {
    const box = boxRef.current;
    const r = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    playback.resizeCanvas(r.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), r.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
  };

  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);

  // Dra valgt klipp, tittel eller undertekst direkte i bildet.
  const sel = !source && !skim.value?.project && selectedClips.value.length === 1 ? selectedClips.value[0] : null;
  const draggable = sel && (sel.type === 'caption' || (isVisual(sel) && sel.type !== 'gap' && sel.type !== 'adjustment'));
  const sm = commands.selectedMask.value;
  const pen = commands.penMode.value;
  const editMask = sel && sm?.clipId === sel.id ? maskList(sel).find((m) => m.id === sm.id) : null;
  const onCanvasDown = (e) => {
    if (!draggable || e.button !== 0) return;
    // Sladding: dra utenfor boksen for å tegne et nytt område.
    if (sel.type === 'redact') return sel.props.shape === 'path' || sel.props.shape === 'full' ? undefined : drawRedactBox(e, sel, canvasRef.current, p);
    if (isTyping()) document.activeElement?.blur();
    e.preventDefault();
    const canvas = canvasRef.current;
    const k = p.width / canvas.getBoundingClientRect().width;
    const T = getTime();
    const start = { x: e.clientX, y: e.clientY };
    const base = deepClone(sel);
    let origin;
    if (sel.type === 'caption') {
      const g = document.createElement('canvas').getContext('2d');
      const L = captionLayout(p, sel, (font, text, maxW) => {
        g.font = font;
        return maxW == null ? g.measureText(text).width : wrapText(g, text, maxW);
      });
      origin = { x: (L.ax / p.width) * 100, y: (L.cy / p.height) * 100 };
    } else origin = { x: valueAt(sel, 'x', T) || 0, y: valueAt(sel, 'y', T) || 0 };
    beginTransient();
    canvas.setPointerCapture(e.pointerId);
    // Med levende kobling flyttes klippet i forhold til objektet, så musen roteres og skaleres tilbake.
    const F = sel.type === 'caption' ? null : followMatrix(p, sel, T);
    const move = (ev) => {
      let dx = (ev.clientX - start.x) * k;
      let dy = (ev.clientY - start.y) * k;
      if (F) {
        const d = F.inverse().transformPoint(new DOMPoint(dx, dy, 0, 0));
        dx = d.x;
        dy = d.y;
      }
      updateTransient((q) => {
        const c = q.clips[base.id];
        if (base.type === 'caption') {
          c.props.pos = { x: Math.round(Math.min(100, Math.max(0, origin.x + (dx / p.width) * 100)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, origin.y + (dy / p.height) * 100)) * 10) / 10 };
        } else {
          for (const [prop, v] of [['x', origin.x + dx], ['y', origin.y + dy]]) {
            if (c.kf?.[prop]?.length) setKeyframe(c, prop, kfTime(c, T), Math.round(v));
            else c.props[prop] = Math.round(v);
          }
        }
      });
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      endTransient(true);
    };
    const cancel = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      endTransient(false);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
  };

  useEffect(() => {
    playback.attachCanvas(canvasRef.current);
    playback.start();
    const ro = new ResizeObserver(resize);
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      playback.stopLoop();
      playback.attachCanvas(null);
    };
  }, []);

  useEffect(() => {
    resize();
  }, [p.width, p.height, source, prefs.value.viewerQuality]);

  return (
    <div class="viewer" ref={wrapRef}>
      <div class="viewer-head">
        <span class="title">{source ? source.name : p.name}</span>
        <button
          class="fmt-btn"
          title="Project settings"
          onClick={() => {
            selection.value = [];
            selectedTransition.value = null;
          }}
        >
          {p.width} × {p.height} · {p.fps} fps
          <Settings2 size={13} />
        </button>
      </div>
      <div class="viewer-box" ref={boxRef} onDblClick={toggleFullscreen}>
        <canvas
          ref={canvasRef}
          class={draggable ? (sel.type === 'redact' ? 'drawable' : 'movable') : source ? 'source-drag' : ''}
          onPointerDown={onCanvasDown}
          draggable={Boolean(source)}
          title={source ? 'Drag the picture to the timeline to add the marked part' : undefined}
          onDragStart={(e) => {
            const id = sourceMediaId.value;
            if (!source || !id) return e.preventDefault();
            dragData(e, { kind: 'media', id, ids: [id] });
          }}
        />
        {pen && sel?.id === pen.clipId && <PenOverlay clip={sel} canvasRef={canvasRef} />}
        {sel?.type === 'redact' && sel.props.shape !== 'full' && !pen && <ShapeEditor clip={sel} prefix="" shape={sel.props.shape || 'rect'} smooth={sel.props.smooth === true} canvasRef={canvasRef} label="Redaction. Drag to move, drag the handles to resize." />}
        {sel && sel.type !== 'redact' && trackArea.value === sel.id && !pen && <ShapeEditor clip={sel} prefix="track." shape="rect" smooth={false} canvasRef={canvasRef} label="Tracking area. Put it over what the clip should follow." />}
        {draggable && sel.type !== 'redact' && sel.type !== 'caption' && (commands.shownInspectorTab.value === 'video' || (commands.shownInspectorTab.value === 'recording' && sel.recordingPart === 'camera')) && !pen && !editMask && trackArea.value !== sel.id && <TransformBox clip={sel} canvasRef={canvasRef} />}
        {editMask && !pen && <ShapeEditor clip={sel} prefix={`mask.${editMask.id}.`} shape={editMask.shape} smooth={Boolean(editMask.smooth)} canvasRef={canvasRef} label={`${editMask.name}. Drag to move.`} />}
      </div>
      {source && !fullscreen && <SourceBar mediaId={sourceMediaId.value} duration={source.duration} fps={p.fps} />}
      {prefs.value.videoScopesVisible && !fullscreen && <VideoScopes sourceRef={canvasRef} onClose={() => setPrefs({ videoScopesVisible: false })} />}
      <div class="transport">
        <div class="tc big">{formatTimecode(source ? (skim.value?.mediaId === browserPlayhead.value?.mediaId ? skim.value.T : browserPlayhead.value?.t || 0) : timeSig.value, p.fps)}</div>
        <div class="controls">
          <IconButton icon={SkipBack} title="Go to start (Home)" onClick={commands.goHome} />
          <IconButton icon={StepBack} title="Previous edit (Up Arrow)" onClick={() => commands.jumpEdit(-1)} />
          <IconButton icon={PlayBackward} title="Play reverse (Shift Space)" active={playing.value && playback.getRate() < 0} onClick={playback.playReverse} />
          <button class="play-btn" title="Play or pause (Space)" onClick={playback.toggle}>
            {playing.value ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <IconButton icon={StepForward} title="Next edit (Down Arrow)" onClick={() => commands.jumpEdit(1)} />
          <IconButton icon={SkipForward} title="Go to end (End)" onClick={commands.goEnd} />
        </div>
        <div class="right">
          <IconButton icon={Activity} title={`${prefs.value.videoScopesVisible ? 'Hide' : 'Show'} video scopes`} active={prefs.value.videoScopesVisible} aria-pressed={Boolean(prefs.value.videoScopesVisible)} onClick={() => setPrefs({ videoScopesVisible: !prefs.value.videoScopesVisible })} />
          <select
            class="select preview-resolution"
            aria-label="Preview resolution"
            title="Preview resolution. Half and Third reduce rendering work for smoother playback."
            value={prefs.value.viewerQuality}
            onChange={(e) => {
              setPrefs({ viewerQuality: e.currentTarget.value });
              e.currentTarget.blur();
            }}
          >
            {PREVIEW_RESOLUTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <IconButton icon={fullscreen ? Minimize2 : Maximize2} title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'} aria-pressed={fullscreen} onClick={toggleFullscreen} />
        </div>
      </div>
    </div>
  );
}

/* Kildeklippet i visningen (fra liste- eller ikonvisningen): en enkel tidslinje fra start til slutt.
   Skrubb ved å dra, marker med I og O (eller dra kantene på området), og dra bildet til tidslinjen. */

function SourceBar({ mediaId, duration, fps }) {
  const barRef = useRef(null);
  const headRef = useRef(null);
  const range = commands.browserRange.value?.mediaId === mediaId ? commands.browserRange.value : null;
  const dur = Math.max(1e-3, duration || 0);
  const frame = 1 / (fps || 30);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = playback.getViewerTime();
      if (headRef.current) headRef.current.style.left = `${Math.max(0, Math.min(1, t / dur)) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dur]);
  const timeAt = (x) => {
    const r = barRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((x - r.left) / Math.max(1, r.width)) * dur));
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    commands.browserFocus.value = true;
    const edge = e.target.dataset?.edge;
    const bar = barRef.current;
    bar.setPointerCapture(e.pointerId);
    const apply = (ev) => {
      const t = timeAt(ev.clientX);
      const cur = commands.browserRange.value?.mediaId === mediaId ? commands.browserRange.value : null;
      if (edge === 'in' && cur) commands.browserRange.value = { ...cur, in: Math.min(t, cur.out - frame) };
      else if (edge === 'out' && cur) commands.browserRange.value = { ...cur, out: Math.max(t, cur.in + frame) };
      playback.seekViewer(t);
    };
    apply(e);
    const up = () => {
      bar.removeEventListener('pointermove', apply);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', apply);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  };
  return (
    <div class="source-bar">
      <span class="source-bar-time">{range ? formatTimecode(range.in, fps) : '00:00:00:00'}</span>
      <div class="source-bar-track" ref={barRef} onPointerDown={onDown} title="Scrub the clip. Press I and O to mark what to keep.">
        {range && (
          <div class="source-bar-range" style={{ left: `${(range.in / dur) * 100}%`, width: `${((range.out - range.in) / dur) * 100}%` }}>
            <span class="source-bar-edge in" data-edge="in" title="Drag to change the start (I)" />
            <span class="source-bar-edge out" data-edge="out" title="Drag to change the end (O)" />
          </div>
        )}
        <div class="source-bar-head" ref={headRef} />
      </div>
      <span class="source-bar-time">{formatTimecode(range ? range.out - range.in : dur, fps)}</span>
      <button class="link-btn" title="Mark start (I)" onClick={() => commands.browserMark('in')}>In</button>
      <button class="link-btn" title="Mark end (O)" onClick={() => commands.browserMark('out')}>Out</button>
    </div>
  );
}

/* Sladdeboksen i bildet: flytt ved å dra midt i, endre størrelse med hjørnene og kantene. */

// Skriver en verdi på klippet; har egenskapen nøkkelbilder, settes et nøkkelbilde ved spillhodet.
function putValue(c, prop, v, T) {
  if (c.kf?.[prop]?.length) setKeyframe(c, prop, kfTime(c, T), v);
  else c.props[prop] = v;
}

// Klippets rom i bildet, med levende kobling til et spor (se follow.js).
function viewMatrix(p, clip, T) {
  const M = clipMatrix(clip, T, p.width, p.height, p);
  const F = followMatrix(p, clip, T);
  return F ? F.multiply(M) : M;
}

function clipTime(clip) {
  const T = getTime();
  return Math.min(Math.max(T, clip.start), clip.start + clip.dur - 1e-3);
}

function drawRedactBox(e, clip, canvas, p) {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const k = p.width / r.width;
  const T = clipTime(clip);
  const x0 = (e.clientX - r.left) * k;
  const y0 = (e.clientY - r.top) * k;
  beginTransient();
  canvas.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const x1 = (ev.clientX - r.left) * k;
    const y1 = (ev.clientY - r.top) * k;
    const w = Math.abs(x1 - x0);
    const h = Math.abs(y1 - y0);
    if (w < 6 && h < 6) return;
    updateTransient((q) => {
      const c = q.clips[clip.id];
      putValue(c, 'x', Math.round((x0 + x1) / 2 - p.width / 2), T);
      putValue(c, 'y', Math.round((y0 + y1) / 2 - p.height / 2), T);
      putValue(c, 'w', Math.round(Math.max(8, w)), T);
      putValue(c, 'h', Math.round(Math.max(8, h)), T);
      putValue(c, 'rotation', 0, T);
    });
  };
  const up = () => {
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    endTransient(true);
  };
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
}

/* Transform i bildet: hjørnene skalerer, det runde håndtaket roterer, og krysset flytter ankerpunktet.
   Krysset flytter ikke bildet: posisjonen justeres, så klippet blir stående der det er. */

export function TransformBox({ clip, canvasRef }) {
  const p = project.value;
  const T = timeSig.value;
  const [box, setBox] = useState(null);
  useEffect(() => {
    const cv = canvasRef.current;
    const measure = () => setBox({ left: cv.offsetLeft, top: cv.offsetTop, width: cv.offsetWidth, height: cv.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  if (!box || T < clip.start || T > clip.start + clip.dur) return null;
  const W = p.width;
  const H = p.height;
  const k = box.width / W;
  const Tc = clipTime(clip);
  const M = viewMatrix(p, clip, Tc);
  const F = followMatrix(p, clip, Tc);
  const view = (x, y) => {
    const q = M.transformPoint(new DOMPoint(x, y));
    return [q.x, q.y];
  };
  const b = clipBox(clip, Tc, W, H, p);
  const P = clipPivot(clip, Tc, W, H, p);
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]].map(([x, y]) => view(x, y));
  const [ax, ay] = view(P.x, P.y);
  // Det runde håndtaket står rett utenfor toppen av rammen, i samme retning som klippet er rotert.
  const [tx, ty] = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2];
  const [bx, by] = [(corners[2][0] + corners[3][0]) / 2, (corners[2][1] + corners[3][1]) / 2];
  const len = Math.hypot(tx - bx, ty - by) || 1;
  const rx = tx + ((tx - bx) / len) * (24 / k);
  const ry = ty + ((ty - by) / len) * (24 / k);
  const r = 5.5 / k;
  const arm = 11 / k;

  const drag = (e, kind) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const svg = el.ownerSVGElement;
    el.setPointerCapture(e.pointerId);
    // Punkter regnes uten levende kobling, så de kan sammenlignes med klippets egne verdier.
    const toFrame = (ev) => {
      const s = svg.getBoundingClientRect();
      const q = new DOMPoint(((ev.clientX - s.left) / s.width) * W, ((ev.clientY - s.top) / s.height) * H);
      return F ? F.inverse().transformPoint(q) : q;
    };
    const M0 = clipMatrix(clip, Tc, W, H, p);
    const inv0 = M0.inverse();
    const a0 = M0.transformPoint(new DOMPoint(P.x, P.y));
    const start = toFrame(e);
    const from = { scale: valueAt(clip, 'scale', Tc) ?? 1, rotation: valueAt(clip, 'rotation', Tc) || 0, anchorX: valueAt(clip, 'anchorX', Tc) || 0, anchorY: valueAt(clip, 'anchorY', Tc) || 0 };
    const startDist = Math.hypot(start.x - a0.x, start.y - a0.y) || 1;
    const startAngle = Math.atan2(start.y - a0.y, start.x - a0.x);
    beginTransient();
    const move = (ev) => {
      const now = toFrame(ev);
      updateTransient((q) => {
        const c = q.clips[clip.id];
        if (kind === 'scale') {
          putValue(c, 'scale', Math.max(0.01, Math.round(from.scale * (Math.hypot(now.x - a0.x, now.y - a0.y) / startDist) * 1000) / 1000), Tc);
        } else if (kind === 'rotate') {
          const v = from.rotation + ((Math.atan2(now.y - a0.y, now.x - a0.x) - startAngle) * 180) / Math.PI;
          putValue(c, 'rotation', ev.shiftKey ? Math.round(v / 15) * 15 : Math.round(v * 10) / 10, Tc);
        } else {
          // Det nye ankeret i klippets rom. Posisjonen settes slik at det havner under musen, og da står bildet stille.
          const l = inv0.transformPoint(now);
          const nx = Math.round(from.anchorX + l.x - P.x);
          const ny = Math.round(from.anchorY + l.y - P.y);
          putValue(c, 'anchorX', nx, Tc);
          putValue(c, 'anchorY', ny, Tc);
          putValue(c, 'x', Math.round(now.x - (P.x + nx - from.anchorX)), Tc);
          putValue(c, 'y', Math.round(now.y - (P.y + ny - from.anchorY)), Tc);
        }
      });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      endTransient(true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  return (
    <svg class="shape-editor transform-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} viewBox={`0 0 ${W} ${H}`}>
      <path d={`M${corners.map((q) => q.join(',')).join('L')}Z`} class="transform-outline" style={{ strokeWidth: 1.5 / k }} />
      <line x1={tx} y1={ty} x2={rx} y2={ry} class="transform-outline" style={{ strokeWidth: 1.5 / k }} />
      {corners.map(([x, y], i) => (
        <rect key={i} x={x - r} y={y - r} width={r * 2} height={r * 2} class="shape-handle" style={{ strokeWidth: 1 / k, cursor: i % 2 ? 'nesw-resize' : 'nwse-resize' }} onPointerDown={(e) => drag(e, 'scale')}>
          <title>Drag to scale from the anchor point.</title>
        </rect>
      ))}
      <circle cx={rx} cy={ry} r={r} class="shape-handle" style={{ strokeWidth: 1 / k, cursor: 'grab' }} onPointerDown={(e) => drag(e, 'rotate')}>
        <title>Drag to rotate around the anchor point. Hold Shift for 15° steps.</title>
      </circle>
      <g class="transform-anchor" onPointerDown={(e) => drag(e, 'anchor')}>
        <title>Anchor point. Drag to move it without moving the clip.</title>
        <circle cx={ax} cy={ay} r={arm} class="transform-anchor-hit" />
        <circle cx={ax} cy={ay} r={r} style={{ strokeWidth: 1.5 / k }} />
        <path d={`M${ax - arm},${ay}H${ax + arm}M${ax},${ay - arm}V${ay + arm}`} style={{ strokeWidth: 1.5 / k }} />
      </g>
    </svg>
  );
}

/* Formredigering i bildet, felles for sladding og masker. Tegnes som SVG i bildets koordinater.
   Rektangel og ellipse: dra for å flytte, dra håndtakene for å endre størrelse (Alt fra midten).
   Fri form: dra punktene, dobbeltklikk på kanten for et nytt punkt, Alt klikk for å fjerne et. */

const HANDLES = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

// Punktlister i alle nøkkelbilder endres likt, så formen kan animeres videre.
function editPointLists(c, prop, fn) {
  if (Array.isArray(c.props[prop])) c.props[prop] = fn([...c.props[prop]]);
  for (const k of c.kf?.[prop] || []) k[1] = fn([...k[1]]);
}

function outlinePoints(g) {
  if (g.shape === 'path') return g.pts;
  const n = g.shape === 'ellipse' ? 48 : 4;
  const c = Math.cos(g.rot);
  const s = Math.sin(g.rot);
  const out = [];
  for (let i = 0; i < n; i++) {
    let u;
    let v;
    if (g.shape === 'ellipse') {
      const a = (i / n) * Math.PI * 2;
      [u, v] = [(Math.cos(a) * g.w) / 2, (Math.sin(a) * g.h) / 2];
    } else [u, v] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][i].map((q, j) => (q * (j ? g.h : g.w)) / 2);
    out.push([g.cx + u * c - v * s, g.cy + u * s + v * c]);
  }
  return out;
}

export function ShapeEditor({ clip, prefix, shape, smooth, canvasRef, label }) {
  const p = project.value;
  const T = timeSig.value;
  const [box, setBox] = useState(null);
  useEffect(() => {
    const cv = canvasRef.current;
    const measure = () => setBox({ left: cv.offsetLeft, top: cv.offsetTop, width: cv.offsetWidth, height: cv.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  if (!box || T < clip.start || T > clip.start + clip.dur) return null;
  const W = p.width;
  const H = p.height;
  const k = box.width / W;
  const Tc = clipTime(clip);
  const M = viewMatrix(p, clip, Tc);
  const inv = M.inverse();
  const g = shapeAt(clip, prefix, shape, Tc, W, H);
  const toView = ([x, y]) => {
    const q = M.transformPoint(new DOMPoint(x, y));
    return [q.x, q.y];
  };
  const outline = outlinePoints(g).map(toView);
  const r = 5.5 / k;
  // Skjermpunkt til klippets rom.
  const toClip = (ev, svg) => {
    const b = svg.getBoundingClientRect();
    const q = inv.transformPoint(new DOMPoint(((ev.clientX - b.left) / b.width) * W, ((ev.clientY - b.top) / b.height) * H));
    return [q.x, q.y];
  };
  const ptsKey = prefix + 'points';
  const localOf = ([x, y], cx, cy, rot) => {
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);
    return [Math.round((x - cx) * c - (y - cy) * s), Math.round((x - cx) * s + (y - cy) * c)];
  };

  const drag = (e, kind, a, b) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
    const el = e.currentTarget;
    // Alt klikk på et punkt i en fri form fjerner punktet.
    if (kind === 'point' && e.altKey) {
      if (g.pts.length <= 3) return;
      commit((q) => editPointLists(q.clips[clip.id], ptsKey, (arr) => (arr.splice(a * 2, 2), arr)));
      return;
    }
    el.setPointerCapture(e.pointerId);
    const start = toClip(e, svg);
    const g0 = g;
    const c0 = Math.cos(g0.rot);
    const s0 = Math.sin(g0.rot);
    beginTransient();
    const move = (ev) => {
      const now = toClip(ev, svg);
      const dx = now[0] - start[0];
      const dy = now[1] - start[1];
      updateTransient((q) => {
        const c = q.clips[clip.id];
        if (kind === 'move') {
          putValue(c, prefix + 'x', Math.round(g0.cx + dx - W / 2), Tc);
          putValue(c, prefix + 'y', Math.round(g0.cy + dy - H / 2), Tc);
        } else if (kind === 'point') {
          const flat = [...(valueAt(c, ptsKey, Tc) || [])];
          const [u, v] = localOf(now, g0.cx, g0.cy, g0.rot);
          flat[a * 2] = u;
          flat[a * 2 + 1] = v;
          putValue(c, ptsKey, flat, Tc);
        } else {
          const hx = a;
          const hy = b;
          const du = dx * c0 + dy * s0;
          const dv = -dx * s0 + dy * c0;
          const alt = ev.altKey;
          let w = hx ? Math.max(8, g0.w + (alt ? 2 : 1) * hx * du) : g0.w;
          let h = hy ? Math.max(8, g0.h + (alt ? 2 : 1) * hy * dv) : g0.h;
          // Shift beholder formen: den aksen som endres mest bestemmer skalaen.
          if (ev.shiftKey) {
            const fw = w / g0.w;
            const fh = h / g0.h;
            const f = Math.max(hx && hy ? (Math.abs(fw - 1) > Math.abs(fh - 1) ? fw : fh) : hx ? fw : fh, 8 / g0.w, 8 / g0.h);
            w = g0.w * f;
            h = g0.h * f;
          }
          const sx = alt ? 0 : (hx * (w - g0.w)) / 2;
          const sy = alt ? 0 : (hy * (h - g0.h)) / 2;
          putValue(c, prefix + 'x', Math.round(g0.cx + sx * c0 - sy * s0 - W / 2), Tc);
          putValue(c, prefix + 'y', Math.round(g0.cy + sx * s0 + sy * c0 - H / 2), Tc);
          putValue(c, prefix + 'w', Math.round(w), Tc);
          putValue(c, prefix + 'h', Math.round(h), Tc);
        }
      });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      endTransient(true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // Dobbeltklikk på kanten av en fri form: nytt punkt på nærmeste kant.
  const addPoint = (e) => {
    if (shape !== 'path') return;
    e.preventDefault();
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement || e.currentTarget;
    const [px, py] = toClip(e, svg);
    const pts = g.pts;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      const L = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L));
      const d = (ax + t * (bx - ax) - px) ** 2 + (ay + t * (by - ay) - py) ** 2;
      if (d < bestD) [bestD, best] = [d, i];
    }
    const [u, v] = localOf([px, py], g.cx, g.cy, g.rot);
    commit((q) => {
      const c = q.clips[clip.id];
      // Alle nøkkelbilder får punktet midt mellom naboene, så formen ikke endres der.
      editPointLists(c, ptsKey, (arr) => {
        const n = arr.length / 2;
        const j = (best + 1) % n;
        arr.splice((best + 1) * 2, 0, (arr[best * 2] + arr[j * 2]) / 2, (arr[best * 2 + 1] + arr[j * 2 + 1]) / 2);
        return arr;
      });
      // Ved spillhodet havner punktet der du klikket.
      const flat = [...(valueAt(c, ptsKey, Tc) || [])];
      flat[(best + 1) * 2] = u;
      flat[(best + 1) * 2 + 1] = v;
      putValue(c, ptsKey, flat, Tc);
    });
  };

  const handles = shape === 'path' ? g.pts.map(toView) : HANDLES.map(([hx, hy]) => toView([g.cx + (hx * g.w * Math.cos(g.rot)) / 2 - (hy * g.h * Math.sin(g.rot)) / 2, g.cy + (hx * g.w * Math.sin(g.rot)) / 2 + (hy * g.h * Math.cos(g.rot)) / 2]));
  const d = smooth && shape === 'path' && outline.length > 2 ? smoothD(outline) : `M${outline.map((q) => q.join(',')).join('L')}Z`;
  return (
    <svg class="shape-editor" style={{ left: box.left, top: box.top, width: box.width, height: box.height }} viewBox={`0 0 ${W} ${H}`}>
      <path d={d} class="shape-fill" style={{ strokeWidth: 1.5 / k }} onPointerDown={(e) => drag(e, 'move')} onDblClick={addPoint}>
        <title>{label}</title>
      </path>
      <path d={d} class="shape-edge" style={{ strokeWidth: 10 / k }} onDblClick={addPoint} onPointerDown={(e) => drag(e, 'move')} />
      {handles.map(([x, y], i) =>
        shape === 'path' ? (
          <circle key={i} cx={x} cy={y} r={r} class="shape-handle point" style={{ strokeWidth: 1 / k }} onPointerDown={(e) => drag(e, 'point', i)}>
            <title>Drag to move. Option (Alt) click to remove.</title>
          </circle>
        ) : (
          <rect key={i} x={x - r} y={y - r} width={r * 2} height={r * 2} class="shape-handle" style={{ strokeWidth: 1 / k, cursor: HANDLES[i][0] && HANDLES[i][1] ? (HANDLES[i][0] === HANDLES[i][1] ? 'nwse-resize' : 'nesw-resize') : HANDLES[i][0] ? 'ew-resize' : 'ns-resize' }} onPointerDown={(e) => drag(e, 'size', HANDLES[i][0], HANDLES[i][1])} />
        )
      )}
    </svg>
  );
}

function smoothD(pts) {
  const n = pts.length;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d + 'Z';
}

/* Pennen: klikk for punkter, dra mens du klikker for myke kurver. Lukk ved å klikke på det
   første punktet, dobbeltklikke eller trykke Retur. Rettetasten fjerner siste punkt, Escape avbryter. */
function PenOverlay({ clip, canvasRef }) {
  const p = project.value;
  const W = p.width;
  const H = p.height;
  const [box, setBox] = useState(null);
  const [pts, setPts] = useState([]);
  const [hover, setHover] = useState(null);
  const [smooth, setSmooth] = useState(false);
  const down = useRef(null);
  const ptsRef = useRef(pts);
  ptsRef.current = pts;
  const smoothRef = useRef(smooth);
  smoothRef.current = smooth;
  useEffect(() => {
    const cv = canvasRef.current;
    const measure = () => setBox({ left: cv.offsetLeft, top: cv.offsetTop, width: cv.offsetWidth, height: cv.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    // Tastene fanges før hurtigtastene, så Retur, Escape og rettetasten bare virker på pennen.
    const onKey = (e) => {
      if (room.value !== 'edit' || commandsBlocked(e)) return;
      if (!['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') commands.penMode.value = null;
      else if (e.key === 'Enter') finish();
      else setPts((list) => list.slice(0, -1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);
  if (!box) return null;
  const k = box.width / W;
  const M = viewMatrix(p, clip, clipTime(clip));
  const inv = M.inverse();
  const toClip = (ev, svg) => {
    const b = svg.getBoundingClientRect();
    const q = inv.transformPoint(new DOMPoint(((ev.clientX - b.left) / b.width) * W, ((ev.clientY - b.top) / b.height) * H));
    return [q.x, q.y];
  };
  const view = ([x, y]) => {
    const q = M.transformPoint(new DOMPoint(x, y));
    return [q.x, q.y];
  };
  function finish() {
    // Dobbeltklikk legger inn to like punkter; de slås sammen.
    const list = ptsRef.current.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 2);
    if (list.length < 3) {
      commands.penMode.value = null;
      return;
    }
    commands.finishPen(list, smoothRef.current);
  }
  const onDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const svg = e.currentTarget;
    const q = toClip(e, svg);
    if (pts.length >= 3) {
      const [fx, fy] = view(pts[0]);
      const [hx, hy] = view(q);
      if (Math.hypot(fx - hx, fy - hy) * k < 9) return finish();
    }
    down.current = { x: e.clientX, y: e.clientY };
    setPts([...pts, q]);
  };
  const onMove = (e) => {
    setHover(toClip(e, e.currentTarget));
    if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 4) setSmooth(true);
  };
  const vp = pts.map(view);
  const hv = hover ? view(hover) : null;
  const d = vp.length ? `M${vp.map((q) => q.join(',')).join('L')}${hv ? `L${hv.join(',')}` : ''}` : '';
  return (
    <svg
      class="pen-overlay"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      viewBox={`0 0 ${W} ${H}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (down.current = null)}
      onDblClick={(e) => {
        e.preventDefault();
        finish();
      }}
    >
      {d && <path d={d} class="pen-line" style={{ strokeWidth: 1.5 / k }} />}
      {vp.length >= 3 && <path d={`M${vp.map((q) => q.join(',')).join('L')}Z`} class="pen-fill" />}
      {vp.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={(i === 0 && vp.length >= 3 ? 7 : 4.5) / k} class={`pen-point${i === 0 ? ' first' : ''}`} style={{ strokeWidth: 1 / k }} />
      ))}
      <text x={8 / k} y={20 / k} class="pen-hint" style={{ fontSize: `${12 / k}px` }}>
        {pts.length < 3 ? 'Click to place points' : 'Click the first point or press Return to close'}
        {smooth ? ' (smooth)' : ''}
      </text>
    </svg>
  );
}
