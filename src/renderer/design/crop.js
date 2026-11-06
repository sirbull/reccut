import { signal, effect } from '@preact/signals';
import { projectEpoch, room } from '../editor/store.js';
import { currentDesign, selection, selectedLayers, tool, changeDesign, endDesignTransient } from './store.js';
import { getImage } from './assets.js';
import { cropSourceGeometry, applyCropGeometry, presetCrop, resetImageCrop, fitImageToCanvas } from '../../shared/designCrop.js';
import { toast } from '../ui.jsx';

export const cropSession = signal(null);
export function startCrop() {
  const d=currentDesign.value, layer=d?.layers.find((l)=>selection.value.includes(l.id)&&l.type==='image'&&!l.hidden&&!l.locked);
  if(!layer){toast('Select an image layer to crop.');return;}
  const image=getImage(layer,true);if(!image){toast('Wait for the image to load, or relink the missing file.');return;}
  if(cropSession.value)finishCrop(false);
  endDesignTransient();tool.value='select';selection.value=[layer.id];
  cropSession.value={ designId:d.id,epoch:projectEpoch.value,layer,image,ratio:'free',...cropSourceGeometry(layer,image.naturalWidth||image.width,image.naturalHeight||image.height) };
}
export function setCropRatio(value) {
  const s=cropSession.value;if(!s)return;
  const d=currentDesign.value,ratio=value==='design'?d.width/d.height:value==='free'?null:Number(value);
  cropSession.value={...s,ratio:value,crop:presetCrop(s.full,s.crop,ratio)};
}
export function finishCrop(keep=true) {
  const s=cropSession.value;if(!s)return;
  cropSession.value=null;
  if(s.epoch!==projectEpoch.value||s.designId!==currentDesign.value?.id)return;
  // Draft crop state never changes the project. Apply it in one commit, so
  // canceling cannot roll back another panel's edit or a project switch.
  if(keep)changeDesign(d=>{const i=d.layers.findIndex(l=>l.id===s.layer.id);if(i>=0)d.layers[i]=applyCropGeometry(s.layer,s.full,s.crop)});
}
export function resetCrop() {
  const replacements = new Map();
  for (const layer of selectedLayers().filter(l=>l.type==='image')) {
    const image = getImage(layer, true);
    if (image) replacements.set(layer.id, resetImageCrop(layer, image.naturalWidth || image.width, image.naturalHeight || image.height));
  }
  if (!replacements.size) { toast('Wait for the image to load, or relink the missing file.'); return; }
  changeDesign(d=>{d.layers=d.layers.map(l=>replacements.get(l.id)||l);});
}
export function fitImages(mode) {
  if (!['contain', 'cover'].includes(mode)) return;
  const ids = new Set(selectedLayers().filter(l=>l.type==='image').map(l=>l.id));
  changeDesign(d=>{d.layers=d.layers.map(l=>ids.has(l.id)?fitImageToCanvas(l,d.width,d.height,mode):l);});
}
effect(()=>{const s=cropSession.value;if(s&&(s.epoch!==projectEpoch.value||s.designId!==currentDesign.value?.id||room.value!=='design'||currentDesign.value.layers.find(l=>l.id===s.layer.id)!==s.layer))finishCrop(false);});

if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (!cropSession.value) return;
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault(); e.stopImmediatePropagation(); finishCrop(e.key === 'Enter');
  }
}, true);
