import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Loader2 } from 'lucide-preact';
import { createPlayer, fileUrl } from '../player.js';
import { mediaPreviewProject } from '../editor/playback.js';
import { project, projectEpoch } from '../editor/store.js';
import { frameSourceProject, frameThumbnails } from '../../shared/design.js';
import { formatTimecode } from '../../shared/model.js';
import { currentDesign } from './store.js';
import { captureFrame } from './assets.js';
import { Button, Select, toast } from '../ui.jsx';

export function FramePicker({ active }) {
  const p = project.value, epoch = projectEpoch.value;
  const [source, setSource] = useState('sequence'), [time, setTime] = useState(0), [busy, setBusy] = useState(false);
  const sourceProject = useMemo(() => source === 'sequence' || !p.media[source] ? p : frameSourceProject(mediaPreviewProject(p.media[source]), p.media[source]), [p, source]);
  const thumbnails = frameThumbnails(sourceProject);
  const sourceRef = useRef(sourceProject), timeRef = useRef(0), cv = useRef(null), host = useRef(null);
  sourceRef.current = sourceProject;
  const player = useMemo(() => createPlayer({ getProject: () => sourceRef.current, playing: signal(false), getTime: () => timeRef.current, setTime: (t) => { timeRef.current = t; setTime(t); } }), []);
  const hasVideo = Object.values(sourceProject.clips).some((c) => c.enabled !== false && ['video', 'recording', 'image'].includes(c.type));
  const max = Math.max(0, (Math.ceil(sourceProject.duration * sourceProject.fps - 1e-7) - 1) / sourceProject.fps);
  const seek = (t) => player.seek(Math.max(0, Math.min(max, t)));
  useEffect(() => { setSource('sequence'); }, [epoch]);
  useEffect(() => { player.seek(0); }, [source, epoch]);
  useEffect(() => { player.invalidate(); }, [p]);
  useEffect(() => { player.seek(Math.min(max, timeRef.current)); }, [max]);
  useEffect(() => {
    if (!active) { player.stopLoop(); return; }
    player.attachCanvas(cv.current); player.start();
    let resizeFrame = 0, previousWidth = -1;
    const resize = () => {
      if (!host.current || host.current.clientWidth === previousWidth) return;
      previousWidth = host.current.clientWidth;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => player.resizeCanvas(previousWidth, 170));
    };
    const observer = new ResizeObserver(resize); observer.observe(host.current); resize();
    return () => { observer.disconnect(); cancelAnimationFrame(resizeFrame); player.stopLoop(); };
  }, [active, sourceProject.width, sourceProject.height]);
  useEffect(() => () => player.dispose(), []);
  const useFrame = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await captureFrame(sourceProject, time);
    } catch (err) { toast(`Could not capture frame: ${err.message}`, { kind: 'error' }); }
    finally { setBusy(false); }
  };
  return <div class="dz-video" tabIndex={0} onKeyDown={(e) => {
    if (e.target.tagName === 'SELECT') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); seek(time + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / sourceProject.fps)); }
  }}>
    <Select value={source} options={[{ value: 'sequence', label: 'Sequence' }, ...Object.values(p.media).filter((m) => m.kind === 'video' || m.kind === 'recording').map((m) => ({ value: m.id, label: m.name }))]} onChange={setSource} />
    <div class="dz-video-preview" ref={host}><canvas ref={cv} /></div>
    {thumbnails.length > 0 && <div class="dz-filmstrip">{thumbnails.map((thumb, i) => <button key={i} title={formatTimecode(thumb.time, sourceProject.fps)} onClick={() => seek(thumb.time)}><img src={fileUrl(thumb.path)} draggable={false} alt="" /></button>)}</div>}
    {hasVideo ? <><input class="slider" aria-label="Video frame" type="range" min={0} max={max} step={1 / sourceProject.fps} value={time} onInput={(e) => seek(Number(e.currentTarget.value))} /><div class="dz-timecode">{formatTimecode(time, sourceProject.fps)}</div></> : <p class="hint">Add video to the timeline in Edit to pick a frame. You can still place your own images.</p>}
    <Button variant="primary" disabled={!hasVideo || !currentDesign.value || busy} onClick={useFrame}>{busy && <Loader2 size={14} class="spin" />}{busy ? 'Capturing Frame…' : 'Use This Frame'}</Button>
    <p class="hint">Captures the full quality composite as an independent PNG. Arrow keys step frames here.</p>
  </div>;
}
