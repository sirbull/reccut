import { signal, effect } from '@preact/signals';
import { project, projectEpoch, room } from '../editor/store.js';
import { currentDesign, selection, designCommit } from './store.js';
import { ensureImage } from './assets.js';
import { saveMaskCanvas } from './cutout.js';
import { layerToSourcePoint } from '../../shared/designMasks.js';
import { toast } from '../ui.jsx';

export const refineSession=signal(null);
export const brushSettings=signal({mode:'erase',size:40,hardness:0.8});
export async function startRefine() {
  const d=currentDesign.value,l=d?.layers.find(l=>selection.value.includes(l.id)&&l.type==='image'&&!l.locked&&l.cutout?.enabled);
  if(!l)return;
  const epoch=projectEpoch.value,image=await ensureImage(project.value.designAssets[l.cutout.asset]?.path);
  if(!image||epoch!==projectEpoch.value||currentDesign.value?.id!==d.id)return;
  const canvas=new OffscreenCanvas(image.naturalWidth||image.width,image.naturalHeight||image.height);canvas.getContext('2d').drawImage(image,0,0);
  refineSession.value={layer:l,designId:d.id,epoch,asset:l.cutout.asset,canvas,version:0,busy:false};
}
export function stopRefine(){refineSession.value=null;}
export function paintRefine(point, previous=null) {
  const s=refineSession.value;if(!s||s.busy)return;
  const l=s.layer,w=s.canvas.width,h=s.canvas.height,p=layerToSourcePoint(l,point,w,h);
  if(!p.inside)return;
  const b=brushSettings.value,ctx=s.canvas.getContext('2d');
  const q=layerToSourcePoint(l,{x:point.x+1,y:point.y},w,h),r=layerToSourcePoint(l,{x:point.x,y:point.y+1},w,h);
  const rx=Math.max(0.5,b.size/2*Math.hypot(q.x-p.x,r.x-p.x)),ry=Math.max(0.5,b.size/2*Math.hypot(q.y-p.y,r.y-p.y));
  const old=previous?layerToSourcePoint(l,previous,w,h):p,steps=Math.min(1000,Math.max(1,Math.ceil(Math.hypot(p.x-old.x,p.y-old.y)/Math.max(1,Math.min(rx,ry)*0.2))));
  for(let i=1;i<=steps;i++){
    ctx.save();ctx.globalCompositeOperation=b.mode==='erase'?'destination-out':'source-over';ctx.translate(old.x+(p.x-old.x)*i/steps,old.y+(p.y-old.y)*i/steps);ctx.scale(rx,ry);
    const gradient=ctx.createRadialGradient(0,0,Math.min(0.999,b.hardness),0,0,1);gradient.addColorStop(0,'#ffffff');gradient.addColorStop(1,'#ffffff00');ctx.fillStyle=gradient;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  s.canvas._designRevision=(s.canvas._designRevision||0)+1;refineSession.value={...s,version:s.version+1};
}
export async function saveRefineStroke() {
  const s=refineSession.value;if(!s||s.busy)return;
  refineSession.value={...s,busy:true};
  try {
    const asset=await saveMaskCanvas(s.canvas,s.layer.name);
    const live=refineSession.value;
    if(!live||live.canvas!==s.canvas||s.epoch!==projectEpoch.value){window.api.discardDesignCutout?.(asset.path);return;}
    // End preview before replacing the layer, so stale-session cleanup is inert.
    refineSession.value=null;
    designCommit(p=>{const l=p.designs[s.designId]?.layers.find(l=>l.id===s.layer.id);if(l?.cutout?.asset!==s.asset)return;p.designAssets[asset.id]=asset;l.cutout.asset=asset.id;});
    const layer=currentDesign.value?.layers.find(l=>l.id===s.layer.id);
    if(layer?.cutout?.asset===asset.id)refineSession.value={...s,layer,asset:asset.id,version:s.version+1,busy:false};
  }catch(err){stopRefine();toast(`Could not save mask: ${err.message}`,{kind:'error'});}
}
effect(()=>{const s=refineSession.value;if(s&&(s.epoch!==projectEpoch.value||s.designId!==currentDesign.value?.id||room.value!=='design'||!selection.value.includes(s.layer.id)||currentDesign.value.layers.find(l=>l.id===s.layer.id)!==s.layer))stopRefine();});

export async function navigateRefineHistory(redo=false){
  const s=refineSession.value;if(!s||s.busy)return;
  stopRefine();
  const {designUndo,designRedo}=await import('./store.js');(redo?designRedo:designUndo)();
  await startRefine();
}
