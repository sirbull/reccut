import { signal, effect } from '@preact/signals';
import { currentDesign, selection, changeDesign } from './store.js';
import { projectEpoch } from '../editor/store.js';
import { uid } from '../../shared/model.js';
export const maskEditing=signal(null);
export function fillTextWithImage() {
  const d=currentDesign.value,layers=d?.layers.filter(l=>selection.value.includes(l.id)&&!l.locked)||[];
  const text=layers.find(l=>l.type==='text'),image=layers.find(l=>l.type==='image');
  if(layers.length!==2||!text||!image)return;
  const group=uid();
  changeDesign(d=>{const top=Math.max(d.layers.findIndex(l=>l.id===text.id),d.layers.findIndex(l=>l.id===image.id)),before=d.layers.slice(0,top+1).filter(l=>l.id!==text.id&&l.id!==image.id),after=d.layers.slice(top+1);
    d.layers=[...before,{...text,clip:false,group,groupName:'Image Text'},{...image,x:text.x,y:text.y,w:text.w,h:text.h,rotation:text.rotation,flipX:text.flipX,flipY:text.flipY,fit:'cover',clip:true,group},...after];
  });
}
effect(()=>{projectEpoch.value;const id=maskEditing.value;if(id&&(!selection.value.includes(id)||!currentDesign.value?.layers.some(l=>l.id===id&&l.mask&&!l.locked)))maskEditing.value=null;});
