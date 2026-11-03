import { signal, effect } from '@preact/signals';
import { project, projectEpoch } from '../editor/store.js';
import { currentDesign, designCommit, historyNavigation, selection } from './store.js';
import { designDir, imagePath, ensureImage } from './assets.js';
import { uid } from '../../shared/model.js';
import { alphaPixels } from '../../shared/designMasks.js';
import { toast } from '../ui.jsx';

export const backgroundJobs = signal({});
const running = new Map();
const api = window.api, sep = api.platform === 'win32' ? '\\' : '/';
const state = (job, value) => { backgroundJobs.value = { ...backgroundJobs.value, [job.layerId]: value }; };
const valid = (job) => {
  const l = project.value.designs?.[job.designId]?.layers.find((l) => l.id === job.layerId);
  return !job.canceled && job.epoch === projectEpoch.value && job.history === historyNavigation.value && l?.type === 'image' && l.asset === job.asset && l.media === job.media && l.cutout === job.cutout;
};
export function cancelBackground(layerId) { running.get(layerId)?.cancel(); }
export async function saveMaskCanvas(canvas, label, { width = canvas.width, height = canvas.height } = {}) {
  let output = canvas;
  if (width !== canvas.width || height !== canvas.height) {
    output = new OffscreenCanvas(width,height);output.getContext('2d').drawImage(canvas,0,0,width,height);
  }
  const blob = await output.convertToBlob({ type:'image/png' });
  const path = await api.writeDesignImage(`${await designDir('Cutouts')}${sep}reccut-cutout-${uid()}.png`,new Uint8Array(await blob.arrayBuffer()));
  const image = await ensureImage(path);
  if (!image) throw new Error('Could not read the saved cutout mask.');
  return {id:uid(),name:`${label} cutout`,path,width,height,copied:true,origin:'cutout'};
}
export async function removeBackground(layerId = selection.value[0]) {
  const d = currentDesign.value, layer = d?.layers.find(l=>l.id===layerId);
  if (!layer || layer.type !== 'image' || layer.locked) return;
  cancelBackground(layerId);
  const job = { layerId,designId:d.id,epoch:projectEpoch.value,history:historyNavigation.value,asset:layer.asset,media:layer.media,cutout:layer.cutout,canceled:false,id:null };
  const early=[];let resolveResult,rejectResult,timeout;
  const promise=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
  promise.catch(()=>{});
  // Completion can arrive before the start IPC response, especially in tests.
  const receive=(result)=>{if(job.id===null)early.push(result);else if(result.id===job.id)result.error?rejectResult(new Error(result.error)):resolveResult(result.result);};
  const off=api.onDesignSegmentDone(receive);
  const offTasks=api.onTasks(list=>{const t=list.find(t=>t.id===job.id);if(t&&!job.canceled)state(job,{id:job.id,progress:t.progress,stage:t.stage||'Removing background'});});
  job.cancel=()=>{if(job.canceled)return;job.canceled=true;if(job.id!==null)api.cancelTask(job.id);rejectResult(new Error('Canceled'));};
  running.set(layerId,job);state(job,{progress:0,stage:'Waiting to remove background'});
  try {
    job.id=await api.startDesignSegment({path:imagePath(layer),maxSide:1024});
    if(job.canceled){api.cancelTask(job.id);return;}
    early.forEach(receive);
    timeout=setTimeout(job.cancel,180000);
    const result=await promise;
    if(!valid(job))return;
    const original=await ensureImage(imagePath(layer));if(!original||!valid(job))return;
    if(!Number.isInteger(result.width)||!Number.isInteger(result.height)||result.width<1||result.height<1||result.width>2048||result.height>2048||result.mask?.length!==result.width*result.height)throw new Error('The background model returned an invalid mask.');
    const canvas=new OffscreenCanvas(result.width,result.height),ctx=canvas.getContext('2d'),data=ctx.createImageData(result.width,result.height);
    data.data.set(alphaPixels(result.mask));ctx.putImageData(data,0,0);state(job,{progress:0.95,stage:'Saving cutout'});
    const asset=await saveMaskCanvas(canvas,layer.name,{width:original.naturalWidth||original.width,height:original.naturalHeight||original.height});
    if(!valid(job)){api.discardDesignCutout?.(asset.path);return;}
    job.done=true;
    designCommit(p=>{const l=p.designs[job.designId]?.layers.find(l=>l.id===layerId);if(!l)return;p.designAssets[asset.id]=asset;l.cutout={asset:asset.id,enabled:true,feather:0,shift:0};});
  } catch(err) { if(!job.canceled&&job.epoch===projectEpoch.value)toast(`Could not remove background: ${err.message}`,{kind:'error'}); }
  finally {
    clearTimeout(timeout);off();offTasks();
    if(running.get(layerId)===job){running.delete(layerId);const next={...backgroundJobs.value};delete next[layerId];backgroundJobs.value=next;}
  }
}
effect(()=>{
  projectEpoch.value;historyNavigation.value;project.value;
  for(const job of running.values())if(!job.done&&!valid(job))job.cancel();
});
