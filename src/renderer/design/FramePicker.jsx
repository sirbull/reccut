import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { Loader2, Play, Pause, RotateCcw, RotateCw } from 'lucide-preact';
import { createPlayer, fileUrl } from '../player.js';
import { mediaPreviewProject } from '../editor/playback.js';
import { project, projectEpoch } from '../editor/store.js';
import { frameSourceProject, frameThumbnails, cameraFrameProject } from '../../shared/design.js';
import { designFrameTime, stepDesignFrame, formatDesignTimecode, parseDesignTimecode } from '../../shared/designPlayback.js';
import { currentDesignId, designCommit } from './store.js';
import { removeBackground } from './cutout.js';
import { captureFrame } from './assets.js';
import { rememberVideoFrame } from './videoLibrary.js';
import { Button, IconButton, Select, toast } from '../ui.jsx';

export function FramePicker({ active }) {
  const p = project.value, epoch = projectEpoch.value;
  const [source, setSource] = useState('sequence'), [time, setTime] = useState(0), [busy, setBusy] = useState(false), [draft,setDraft]=useState(null), [timeError,setTimeError]=useState(false);
  const cancelBlur=useRef(false),playing=useMemo(()=>signal(false),[]);
  const sourceProject = useMemo(() => source === 'sequence' || !p.media[source] ? p : frameSourceProject(mediaPreviewProject(p.media[source]), p.media[source]), [p, source]);
  const thumbnails = frameThumbnails(sourceProject);
  const sourceRef = useRef(sourceProject), timeRef = useRef(0), cv = useRef(null), host = useRef(null);
  const playbackProject=useMemo(()=>({...sourceProject,range:null}),[sourceProject]);
  sourceRef.current = playbackProject;
  const player = useMemo(() => createPlayer({ getProject: () => sourceRef.current, playing, getTime: () => timeRef.current, setTime: (t) => { timeRef.current = t; setTime(t); } }), []);
  const hasVideo = Object.values(sourceProject.clips).some((c) => c.enabled !== false && ['video', 'recording', 'image'].includes(c.type));
  const fps=sourceProject.fps,duration=sourceProject.duration,max=designFrameTime(duration,duration,fps),isPlaying=playing.value;
  const seek = t => player.seek(designFrameTime(t,duration,fps));
  const step = frames => {player.pause();player.seek(stepDesignFrame(timeRef.current,frames,duration,fps));};
  const skip = (direction,alternate=false) => seek(timeRef.current+direction*(alternate?10:5));
  const toggle = () => {if(!busy&&hasVideo)player.toggle();};
  const finishTimecode = () => {const at=parseDesignTimecode(draft??formatDesignTimecode(timeRef.current,fps),fps);if(at===null){setTimeError(true);return false;}player.pause();seek(at);setDraft(null);setTimeError(false);return true;};
  useEffect(() => { setSource('sequence'); }, [epoch]);
  useEffect(() => { player.pause();player.seek(0);setDraft(null);setTimeError(false); }, [source, epoch]);
  useEffect(() => { player.invalidate(); }, [p]);
  useEffect(() => { if(!isPlaying)seek(timeRef.current); }, [max,isPlaying]);
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
  useEffect(()=>{if(active)rememberVideoFrame(sourceProject,time);},[active,sourceProject.clips,sourceProject.media,source,time,epoch]);
  const cameraProject=cameraFrameProject(sourceProject,time);
  const useCamera=async(camera=true)=>{
    player.pause();
    const at=designFrameTime(timeRef.current,duration,fps),source=camera?cameraFrameProject(sourceProject,at):sourceProject;
    player.seek(at);
    if(busy||!source)return;
    const target=currentDesignId.value;setBusy(true);
    try{const l=await captureFrame(source,at,{createDesign:true});if(l){
      const designId=target||currentDesignId.value;
      designCommit(p=>{const d=p.designs[designId],image=d?.layers.find(a=>a.id===l.id);if(image)d.layers=[...d.layers.filter(a=>a.id!==l.id),image];});
      await removeBackground(l.id,designId);
    }}catch(err){toast(`Could not cut out frame: ${err.message}`,{kind:'error'});}finally{setBusy(false);}
  };
  const useFrame = async () => {
    if (busy) return;
    player.pause();const at=designFrameTime(timeRef.current,duration,fps);player.seek(at);setBusy(true);
    try {
      await captureFrame(sourceProject,at,{createDesign:true});
    } catch (err) { toast(`Could not capture frame: ${err.message}`, { kind: 'error' }); }
    finally { setBusy(false); }
  };
  return <div class="dz-video" tabIndex={0} aria-label="Video frame picker" onKeyDown={e => {
    const target=e.target;
    if(target.tagName==='SELECT'||target.isContentEditable||(target.tagName==='INPUT'&&target.type!=='range')||e.metaKey||e.ctrlKey||e.altKey)return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();if(hasVideo&&!busy)step((e.key==='ArrowLeft'?-1:1)*(e.shiftKey?Math.round(fps):1));}
    if(e.code==='Space'&&target.tagName!=='BUTTON'){e.preventDefault();e.stopPropagation();toggle();}
  }}>
    <Select value={source} options={[{ value: 'sequence', label: 'Sequence' }, ...Object.values(p.media).filter((m) => m.kind === 'video' || m.kind === 'recording').map((m) => ({ value: m.id, label: m.name }))]} onChange={setSource} />
    <div class="dz-video-preview" ref={host}><canvas ref={cv} /></div>
    {thumbnails.length > 0 && <div class="dz-filmstrip">{thumbnails.map((thumb, i) => <button key={i} title={formatDesignTimecode(thumb.time,fps)} onClick={() => seek(thumb.time)}><img src={fileUrl(thumb.path)} draggable={false} alt="" /></button>)}</div>}
    {hasVideo ? <><input class="slider" aria-label="Video frame" type="range" min={0} max={max} step={1/fps} value={Math.min(time,max)} disabled={busy} onInput={e=>{player.pause();seek(Number(e.currentTarget.value));}}/>
      <div class="dz-video-transport">
        <IconButton icon={RotateCcw} title="Back 5 seconds (Shift: 10 seconds)" disabled={busy} onClick={e=>skip(-1,e.shiftKey)}/>
        <IconButton icon={isPlaying?Pause:Play} title={isPlaying?'Pause Preview (Space)':'Play Preview (Space)'} disabled={busy} aria-pressed={isPlaying} onClick={toggle}/>
        <IconButton icon={RotateCw} title="Forward 5 seconds (Shift: 10 seconds)" disabled={busy} onClick={e=>skip(1,e.shiftKey)}/>
      </div>
      <div class="dz-timecode"><input class="dz-timecode-input" aria-label="Preview timecode" aria-invalid={timeError} aria-describedby={timeError?'dz-timecode-error':undefined} title="Enter HH:MM:SS:FF, HH:MM:SS, MM:SS or seconds" spellcheck={false} disabled={busy} value={draft??formatDesignTimecode(Math.min(time,max),fps)} onFocus={e=>{player.pause();cancelBlur.current=false;setDraft(formatDesignTimecode(timeRef.current,fps));setTimeError(false);e.currentTarget.select();}} onInput={e=>{setDraft(e.currentTarget.value);setTimeError(false);}} onBlur={()=>{if(!cancelBlur.current&&!finishTimecode())setDraft(null);cancelBlur.current=false;}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();if(finishTimecode()){cancelBlur.current=true;e.currentTarget.closest('.dz-video')?.focus();}}if(e.key==='Escape'){e.preventDefault();cancelBlur.current=true;setDraft(null);setTimeError(false);e.currentTarget.closest('.dz-video')?.focus();}}}/></div>
      {timeError&&<p class="hint warn" id="dz-timecode-error" role="alert">Enter HH:MM:SS:FF or a time in seconds.</p>}
    </> : <p class="hint">Add video to the timeline in Edit to pick a frame. You can still place your own images.</p>}
    <Button variant="primary" disabled={!hasVideo || busy} onClick={useFrame}>{busy && <Loader2 size={14} class="spin" />}{busy ? 'Capturing Frame…' : 'Use This Frame'}</Button>
    <Button disabled={!cameraProject||busy} onClick={()=>useCamera(true)}>Cut Out Camera</Button>
    <Button disabled={!hasVideo||busy} onClick={()=>useCamera(false)}>Cut Out This Frame</Button>
    <p class="hint">Captures a full-quality PNG. Left/Right: one frame. Space: play/pause. Skip: 5 seconds, or 10 with Shift.</p>
  </div>;
}
