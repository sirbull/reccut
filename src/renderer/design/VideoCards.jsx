import { useEffect, useRef } from 'preact/hooks';
import { project, room } from '../editor/store.js';
import { formatDesignTimecode as formatTimecode } from '../../shared/designPlayback.js';
import { suggestionTemplates } from '../../shared/thumbScore.js';
import { BUILTIN_DESIGN_TEMPLATES, applyTemplate } from '../../shared/designTemplates.js';
import { LibraryCard, LibraryPreview } from './LibraryPanel.jsx';
import { videoFrames, ensureVideoFrames, hasDesignVideo, previewVideoFrame, applyVideoFrame } from './videoLibrary.js';
import { templateContext } from './library.js';
export function useVideoLibrary(){const p=project.value,active=room.value==='design';useEffect(()=>{if(active)ensureVideoFrames();},[active,p.clips,p.media,p.lanes,p.primary,p.width,p.height,p.duration,p.fps]);}
export function VideoFrameCard({frame,template,title,size}){
  const session=videoFrames.value,ref=useRef(null),name=template?template.name:formatTimecode(frame.time,session.source.fps);
  useEffect(()=>{const ctx=ref.current?.getContext('2d');if(ctx){ctx.clearRect(0,0,216,122);const k=Math.min(216/frame.canvas.width,122/frame.canvas.height);ctx.drawImage(frame.canvas,(216-frame.canvas.width*k)/2,(122-frame.canvas.height*k)/2,frame.canvas.width*k,frame.canvas.height*k);}},[frame]);
  const d=template?applyTemplate(template,{...templateContext(),title,width:size?.width||template.design.width,height:size?.height||template.design.height,frame:{asset:'preview-video-frame'}}):null;
  return <LibraryCard id={`video:${frame.time}:${template?.id||'frame'}`} preview={()=>previewVideoFrame(frame,template,title,size)} apply={(_,point)=>applyVideoFrame(frame,{template,title,size,point})} title={`${name}. Click or press Enter to use this frame.`}>{d?<LibraryPreview design={d} images={{'preview-video-frame':frame.canvas}}/>:<canvas ref={ref} width={216} height={122}/>}<b>{name}</b>{template&&<small>{formatTimecode(frame.time,session.source.fps)}</small>}</LibraryCard>;
}
export function videoSection({templates=false,size,title,offset=0}={}){
  if(!hasDesignVideo())return null;
  const session=videoFrames.value,choices=templates?suggestionTemplates(BUILTIN_DESIGN_TEMPLATES,size?.width||1280,size?.height||720,offset):[null],items=(session?.frames||[]).flatMap(frame=>choices.map(template=>({id:`${frame.time}-${template?.id||'frame'}`,frame,template})));
  const progress=session?.progress;
  return{id:templates?'for-video':'best-frames',title:templates?'For This Video':'Best Frames',items,empty:session?.phase==='error'?'Frames could not be analyzed. Reopen the panel to try again.':session?.phase==='ready'?'No suitable frames found. Use Pick a Frame to choose one.':`Analyzing frames locally${progress?` (${progress.attempted}/${progress.total})`:''}…`,render:item=><VideoFrameCard key={item.id} frame={item.frame} template={item.template} title={title} size={size}/>};
}
