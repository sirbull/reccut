import { signal, effect } from '@preact/signals';
import { project, projectEpoch, room } from '../editor/store.js';
import { currentDesign, historyNavigation, designCommit, openDesign, selection } from './store.js';
import { analyzeDesignFrames } from '../../shared/designSuggest.js';
import { frameSampleTimes } from '../../shared/thumbScore.js';
import { applyTemplate } from '../../shared/designTemplates.js';
import { newDesign, newLayer, fitBox } from '../../shared/design.js';
import { createFrameSampler } from './frameSampler.js';
import { captureFrameAsset } from './assets.js';
import { templateContext, showLibraryPreview, clearLibraryPreview, createFromTemplate, libraryPreviewImages } from './library.js';

export const videoFrames=signal(null),framePalette=signal(null);
export function sameVideoSource(a,b){return a&&b&&['id','clips','media','lanes','width','height','fps','duration','primary'].every(key=>a[key]===b[key]);}
let knownSource=null,knownVideo=false,paletteSource=null;
export function hasDesignVideo(source=project.value){if(!sameVideoSource(knownSource,source)){knownSource=source;knownVideo=frameSampleTimes(source).length>0;}return knownVideo;}
export function clearVideoFrames(){if(libraryPreviewImages.peek()['preview-video-frame'])clearLibraryPreview();videoFrames.peek()?.controller.abort();videoFrames.value=null;framePalette.value=null;}
function current(session){return videoFrames.peek()?.id===session.id&&!session.controller.signal.aborted&&session.epoch===projectEpoch.value&&room.value==='design'&&sameVideoSource(session.source,project.value);}
export async function ensureVideoFrames(makeSampler=createFrameSampler){
  const previous=videoFrames.peek();if(previous&&sameVideoSource(previous.source,project.value)&&previous.epoch===projectEpoch.value&&previous.phase!=='error')return;
  clearVideoFrames();const source=project.value;if(!hasDesignVideo(source))return;
  const session={id:Symbol(),source,epoch:projectEpoch.value,controller:new AbortController(),phase:'analyzing',frames:[],progress:null};videoFrames.value=session;let sampler;
  try{sampler=makeSampler(source);const result=await analyzeDesignFrames(source,(time,opts)=>sampler.sample(time,opts),{signal:session.controller.signal,progress:progress=>{if(current(session))videoFrames.value={...videoFrames.peek(),progress}}});if(current(session))videoFrames.value={...videoFrames.peek(),...result,phase:'ready'};}
  catch(err){if(current(session))videoFrames.value={...videoFrames.peek(),phase:'error',message:err.message};}
  finally{sampler?.dispose();}
}
export function previewVideoFrame(frame,template,title,size){
  const session=videoFrames.value;if(!session||!current(session)||!session.frames.includes(frame))return;
  const d=currentDesign.value||newDesign({name:`${project.value.name} Thumbnail`});
  if(template){const preview=applyTemplate(template,{...templateContext(),title,width:size?.width||template.design.width,height:size?.height||template.design.height,frame:{asset:'preview-video-frame'}});showLibraryPreview(preview,{'preview-video-frame':frame.canvas});}
  else{const box=fitBox(session.source.width,session.source.height,d.width,d.height),l=newLayer('image',{asset:'preview-video-frame',name:'Video frame',...box,fit:'contain'});showLibraryPreview({...d,layers:[l,...d.layers]},{'preview-video-frame':frame.canvas});}
}
export async function applyVideoFrame(frame,{template,title,size,point}={}){
  const session=videoFrames.value;if(!session||!current(session)||!session.frames.includes(frame))return;
  const base=currentDesign.value,epoch=projectEpoch.value,navigation=historyNavigation.value,asset=await captureFrameAsset(session.source,frame.time,{signal:session.controller.signal});
  if(!asset||!current(session)||epoch!==projectEpoch.value||navigation!==historyNavigation.value||base!==currentDesign.value)return;
  clearLibraryPreview();
  if(template)return createFromTemplate(template,'template',{epoch,signal:session.controller.signal,width:size?.width||template.design.width,height:size?.height||template.design.height,assets:[asset],context:{frame:{asset:asset.id,crop:{x:0,y:0,w:1,h:1}},title}});
  const d=base||newDesign({name:`${project.value.name} Thumbnail`}),box=fitBox(asset.width,asset.height,d.width,d.height),l=newLayer('image',{asset:asset.id,name:'Video frame',...box,fit:'contain'});
  if(point){l.x=point.x-l.w/2;l.y=point.y-l.h/2;}
  designCommit(p=>{p.designAssets[asset.id]=asset;p.designs[d.id]={...d,layers:[l,...d.layers]}});if(!base)openDesign(d.id);selection.value=[l.id];return project.value.designs[d.id];
}
effect(()=>{const p=project.value,epoch=projectEpoch.value,active=room.value,s=videoFrames.value;if(s&&(s.epoch!==epoch||active!=='design'||!sameVideoSource(s.source,p)))clearVideoFrames();if(framePalette.value&&(!paletteSource||paletteSource.epoch!==epoch||!sameVideoSource(paletteSource.source,p)))framePalette.value=null;});

export const pickedVideoFrame=signal(null);
export function rememberVideoFrame(source,time){pickedVideoFrame.value={source,time,sequence:project.value,epoch:projectEpoch.value};framePalette.value=null;}
export function canSampleFrame(){const picked=pickedVideoFrame.value;return hasDesignVideo(picked?.epoch===projectEpoch.value&&sameVideoSource(picked.sequence,project.value)?picked.source:project.value);}
export async function sampleCurrentPalette(signal){
  const epoch=projectEpoch.value,sequence=project.value,picked=pickedVideoFrame.value,valid=picked?.epoch===epoch&&sameVideoSource(picked.sequence,sequence),source=valid?picked.source:sequence,time=valid?picked.time:videoFrames.value?.frames[0]?.time||0;
  const sampler=createFrameSampler(source);
  try{const sampled=await sampler.sample(time,{signal,timeoutMs:1500});if(!sampled||signal?.aborted||epoch!==projectEpoch.value||!sameVideoSource(sequence,project.value)||picked!==pickedVideoFrame.value)return null;const {paletteFromPixels}=await import('../../shared/designContent.js');const palette=paletteFromPixels(sampled.pixels);paletteSource={source:sequence,epoch};framePalette.value=palette;return palette;}
  finally{sampler.dispose();}
}
