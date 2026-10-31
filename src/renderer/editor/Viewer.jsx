import { useEffect, useRef, useState } from 'preact/hooks';
import { Maximize2, Settings2, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-preact';
import { formatTimecode, isVisual, setKeyframe, sourceTime, valueAt } from '../../shared/model.js';
import { captionLayout, redactShape, wrapText } from '../../shared/render.js';
import { beginTransient, endTransient, getTime, playing, project, selectedClips, selectedTransition, selection, timeSig, updateTransient } from './store.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { IconButton } from '../ui.jsx';
import { prefs } from '../prefs.js';

// Spill bakover: avspillingsikonet speilet.
const PlayBackward = ({ size }) => <Play size={size} fill="currentColor" style={{ transform: 'scaleX(-1)' }} />;

export function Viewer() {
  const p = project.value;
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  // Dra valgt klipp, tittel eller undertekst direkte i bildet.
  const sel = selectedClips.value.length === 1 ? selectedClips.value[0] : null;
  const draggable = sel && (sel.type === 'caption' || (isVisual(sel) && sel.type !== 'gap'));
  const onCanvasDown = (e) => {
    if (!draggable || e.button !== 0) return;
    // Sladding: dra utenfor boksen for å tegne et nytt område.
    if (sel.type === 'redact') return drawRedactBox(e, sel, canvasRef.current, p);
    e.preventDefault();
    const canvas = canvasRef.current;
    const k = p.width / canvas.getBoundingClientRect().width;
    const T = getTime();
    const start = { x: e.clientX, y: e.clientY };
    const base = structuredClone(sel);
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
    const move = (ev) => {
      const dx = (ev.clientX - start.x) * k;
      const dy = (ev.clientY - start.y) * k;
      updateTransient((q) => {
        const c = q.clips[base.id];
        if (base.type === 'caption') {
          c.props.pos = { x: Math.round(Math.min(100, Math.max(0, origin.x + (dx / p.width) * 100)) * 10) / 10, y: Math.round(Math.min(100, Math.max(0, origin.y + (dy / p.height) * 100)) * 10) / 10 };
        } else {
          for (const [prop, v] of [['x', origin.x + dx], ['y', origin.y + dy]]) {
            if (c.kf?.[prop]?.length) setKeyframe(c, prop, sourceTime(c, T), Math.round(v));
            else c.props[prop] = Math.round(v);
          }
        }
      });
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      endTransient(true);
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
  };

  useEffect(() => {
    playback.attachCanvas(canvasRef.current);
    playback.start();
    const ro = new ResizeObserver(() => {
      const r = boxRef.current.getBoundingClientRect();
      playback.resizeCanvas(r.width - 24, r.height - 24);
    });
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      playback.stopLoop();
      playback.attachCanvas(null);
    };
  }, []);

  useEffect(() => {
    const r = boxRef.current.getBoundingClientRect();
    playback.resizeCanvas(r.width - 24, r.height - 24);
  }, [p.width, p.height, prefs.value.viewerQuality]);

  return (
    <div class="viewer" ref={wrapRef}>
      <div class="viewer-head">
        <span class="title">{p.name}</span>
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
      <div class="viewer-box" ref={boxRef} onDblClick={() => wrapRef.current.requestFullscreen?.()}>
        <canvas ref={canvasRef} class={draggable ? (sel.type === 'redact' ? 'drawable' : 'movable') : ''} onPointerDown={onCanvasDown} />
        {sel?.type === 'redact' && <RedactOverlay clip={sel} canvasRef={canvasRef} />}
      </div>
      <div class="transport">
        <div class="tc big">{formatTimecode(timeSig.value, p.fps)}</div>
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
          <IconButton icon={Maximize2} title="Full screen" onClick={() => wrapRef.current.requestFullscreen?.()} />
        </div>
      </div>
    </div>
  );
}

/* Sladdeboksen i bildet: flytt ved å dra midt i, endre størrelse med hjørnene og kantene. */

// Skriver en verdi på klippet; har egenskapen nøkkelbilder, settes et nøkkelbilde ved spillhodet.
function putValue(c, prop, v, T) {
  if (c.kf?.[prop]?.length) setKeyframe(c, prop, sourceTime(c, T), v);
  else c.props[prop] = v;
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

const HANDLES = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function RedactOverlay({ clip, canvasRef }) {
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
  const k = box.width / p.width;
  const Tc = clipTime(clip);
  const s = redactShape(clip, Tc, p.width, p.height);

  const start = (e, hx, hy) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const s0 = redactShape(clip, Tc, p.width, p.height);
    const cos = Math.cos(s0.rot);
    const sin = Math.sin(s0.rot);
    const x0 = e.clientX;
    const y0 = e.clientY;
    beginTransient();
    const move = (ev) => {
      const dx = (ev.clientX - x0) / k;
      const dy = (ev.clientY - y0) / k;
      let { cx, cy, w, h } = s0;
      if (!hx && !hy) {
        cx += dx;
        cy += dy;
      } else {
        // Mål bevegelsen langs boksens egne akser, så det virker også når den er rotert.
        const du = dx * cos + dy * sin;
        const dv = -dx * sin + dy * cos;
        const nw = hx ? Math.max(8, w + hx * du) : w;
        const nh = hy ? Math.max(8, h + hy * dv) : h;
        // Motsatt kant blir stående (Alt endrer fra midten).
        const sx = ev.altKey ? 0 : (hx * (nw - w)) / 2;
        const sy = ev.altKey ? 0 : (hy * (nh - h)) / 2;
        cx += sx * cos - sy * sin;
        cy += sx * sin + sy * cos;
        w = ev.altKey && hx ? Math.max(8, w + 2 * hx * du) : nw;
        h = ev.altKey && hy ? Math.max(8, h + 2 * hy * dv) : nh;
      }
      updateTransient((q) => {
        const c = q.clips[clip.id];
        putValue(c, 'x', Math.round(cx - p.width / 2), Tc);
        putValue(c, 'y', Math.round(cy - p.height / 2), Tc);
        if (hx || hy) {
          putValue(c, 'w', Math.round(w), Tc);
          putValue(c, 'h', Math.round(h), Tc);
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
    <div
      class={`redact-box ${clip.props.shape || 'rect'}`}
      title="Drag to move. Drag a corner or edge to resize, hold Option (Alt) to resize from the center. Drag outside the box to draw a new area."
      style={{
        left: box.left + (s.cx - s.w / 2) * k,
        top: box.top + (s.cy - s.h / 2) * k,
        width: s.w * k,
        height: s.h * k,
        transform: s.rot ? `rotate(${s.rot}rad)` : undefined,
      }}
      onPointerDown={(e) => start(e, 0, 0)}
    >
      {HANDLES.map(([hx, hy]) => (
        <span key={`${hx}${hy}`} class="redact-handle" data-h={`${hx},${hy}`} style={{ left: `${(hx + 1) * 50}%`, top: `${(hy + 1) * 50}%`, cursor: hx && hy ? (hx === hy ? 'nwse-resize' : 'nesw-resize') : hx ? 'ew-resize' : 'ns-resize' }} onPointerDown={(e) => start(e, hx, hy)} />
      ))}
    </div>
  );
}
