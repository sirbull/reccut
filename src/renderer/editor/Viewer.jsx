import { useEffect, useRef } from 'preact/hooks';
import { Maximize2, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-preact';
import { formatTimecode } from '../../shared/model.js';
import { playing, project, timeSig } from './store.js';
import * as playback from './playback.js';
import * as commands from './commands.js';
import { IconButton } from '../ui.jsx';

export function Viewer() {
  const p = project.value;
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

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
        <span class="dim">
          {p.width} × {p.height} · {p.fps} fps
        </span>
      </div>
      <div class="viewer-box" ref={boxRef} onDblClick={() => wrapRef.current.requestFullscreen?.()}>
        <canvas ref={canvasRef} />
      </div>
      <div class="transport">
        <div class="tc big">{formatTimecode(timeSig.value, p.fps)}</div>
        <div class="controls">
          <IconButton icon={SkipBack} title="Til start (Home)" onClick={commands.goHome} />
          <IconButton icon={StepBack} title="Forrige klipp (Pil opp)" onClick={() => commands.jumpEdit(-1)} />
          <button class="play-btn" title="Spill av eller pause (Mellomrom)" onClick={playback.toggle}>
            {playing.value ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <IconButton icon={StepForward} title="Neste klipp (Pil ned)" onClick={() => commands.jumpEdit(1)} />
          <IconButton icon={SkipForward} title="Til slutt (End)" onClick={commands.goEnd} />
        </div>
        <div class="right">
          <IconButton icon={Maximize2} title="Fullskjerm" onClick={() => wrapRef.current.requestFullscreen?.()} />
        </div>
      </div>
    </div>
  );
}
