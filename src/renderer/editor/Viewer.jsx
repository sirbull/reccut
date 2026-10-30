import { useEffect, useRef } from 'preact/hooks';
import { Maximize2, Settings2, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-preact';
import { formatTimecode, isVisual, setKeyframe, sourceTime, valueAt } from '../../shared/model.js';
import { captionLayout, wrapText } from '../../shared/render.js';
import { beginTransient, endTransient, getTime, playing, project, selectedClips, selectedTransition, selection, timeSig, updateTransient } from './store.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { IconButton } from '../ui.jsx';

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
  }, [p.width, p.height]);

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
        <canvas ref={canvasRef} class={draggable ? 'movable' : ''} onPointerDown={onCanvasDown} />
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
