import { signal, effect } from '@preact/signals';
import { projectEpoch } from '../editor/store.js';
import { readLayers, extractLayered } from '../editor/layers.js';

export const designLayerImport = signal(null);
export function finishLayerImport(choice = null) {
  const pending=designLayerImport.value;if(!pending)return;
  designLayerImport.value=null;pending.resolve(choice);
}
effect(()=>{const req=designLayerImport.value;if(req&&req.epoch!==projectEpoch.value)finishLayerImport();});
let queue = Promise.resolve();
export function prepareDesignLayers(file, dir, epoch) {
  const run=async()=>{
    if(epoch!==projectEpoch.value)return null;
    const req=await readLayers(file);if(epoch!==projectEpoch.value)return null;
    let choice={indices:req.layers.filter(l=>l.visible).map(l=>l.index),mode:'merged'};
    if(req.layers.length>1)choice=await new Promise(resolve=>{designLayerImport.value={...req,epoch,resolve};});
    if(!choice||epoch!==projectEpoch.value)return null;
    if(req.kind==='svg'&&choice.mode==='merged'&&choice.indices.length===req.layers.length) return {files:[{path:file,name:file.split(/[\\/]/).pop(),owned:false}]};
    const files=await extractLayered(req,choice.indices,choice.mode,dir,Math.min(8192,Math.max(req.width,req.height)));
    return {files:files.map(f=>({...f,owned:true})),width:req.width,height:req.height};
  };
  const result=queue.then(run,run);queue=result.catch(()=>{});return result;
}
