import { signal,effect } from '@preact/signals';
import { project,projectEpoch,room } from '../editor/store.js';
import { currentDesign,designCommit,openDesign,changeDesign,endDesignTransient,tool,selection } from './store.js';
import { duplicateDesign,designVariants,resizeDesignContent,cropDesignCanvas,rotateDesignCanvas,flipDesignCanvas } from '../../shared/design.js';
import { presetCrop,cropViewport } from '../../shared/designCrop.js';
import { finishCrop, cropSession } from './crop.js';
import { stopRefine, refineSession } from './refine.js';
import { maskEditing } from './masks.js';
export const feedPreview=signal(false),showSafeZones=signal(false),compareOpen=signal(false),resizeOpen=signal(false),batchExportOpen=signal(false),canvasCrop=signal(null);
export const canFeedPreview=()=>Boolean(currentDesign.value)&&!cropSession.value&&!refineSession.value&&!canvasCrop.value;
export function toggleFeedPreview(){if(!canFeedPreview())return;endDesignTransient();feedPreview.value=!feedPreview.value;}
export function toggleSafeZones(){if(currentDesign.value)showSafeZones.value=!showSafeZones.value;}
export function makeVariant(){const d=currentDesign.value;if(!d)return;const copy=duplicateDesign(d,{variant:true});designCommit(p=>{p.designs[d.id].variantOf=copy.variantOf;p.designs[copy.id]=copy});openDesign(copy.id);}
export function keepVariant(id){const d=project.value.designs[id];if(!d)return;const ids=designVariants(project.value.designs,d).map(v=>v.id);designCommit(p=>{for(const id of ids)p.designs[id].favorite=id===d.id});}
export function makeSizes(targets,inPlace=false){const d=currentDesign.value;if(!d||!targets.length)return;const copies=targets.map(size=>{const next=resizeDesignContent(d,size.width,size.height);next.size=size.id||'custom';return inPlace?next:{...duplicateDesign(next),name:`${d.name} ${size.width}×${size.height}`};});designCommit(p=>{for(const copy of copies)p.designs[copy.id]=copy});openDesign(copies[0].id);resizeOpen.value=false;}
export function transformCanvas(action){finishCanvasCrop(false);finishCrop(false);stopRefine();maskEditing.value=null;changeDesign(d=>Object.assign(d,action==='left'?rotateDesignCanvas(d,-1):action==='right'?rotateDesignCanvas(d,1):flipDesignCanvas(d,action==='horizontal'?'x':'y')));}
export function startCanvasCrop(){const d=currentDesign.value;if(!d)return;finishCrop(false);stopRefine();maskEditing.value=null;endDesignTransient();feedPreview.value=false;tool.value='select';selection.value=[];canvasCrop.value={design:d,epoch:projectEpoch.value,ratio:'free',crop:{x:0,y:0,w:1,h:1}};}
export function canvasCropRatio(ratio){const s=canvasCrop.value;if(s)canvasCrop.value={...s,ratio,crop:presetCrop({x:0,y:0,w:s.design.width,h:s.design.height},s.crop,ratio==='free'?null:Number(ratio))};}
export function finishCanvasCrop(keep=true){const s=canvasCrop.value;if(!s)return;canvasCrop.value=null;if(keep&&s.epoch===projectEpoch.value&&currentDesign.value===s.design){const rect=cropViewport({x:0,y:0,w:s.design.width,h:s.design.height},s.crop);changeDesign(d=>Object.assign(d,cropDesignCanvas(d,rect)));}}
effect(()=>{const s=canvasCrop.value;if(s&&(s.epoch!==projectEpoch.value||currentDesign.value!==s.design||room.value!=='design'))canvasCrop.value=null;});
effect(()=>{projectEpoch.value;feedPreview.value=false;compareOpen.value=resizeOpen.value=batchExportOpen.value=false;showSafeZones.value=false;});
if(typeof window!=='undefined')window.addEventListener('keydown',e=>{if(canvasCrop.value&&(e.key==='Enter'||e.key==='Escape')){e.preventDefault();e.stopImmediatePropagation();finishCanvasCrop(e.key==='Enter');}},true);
