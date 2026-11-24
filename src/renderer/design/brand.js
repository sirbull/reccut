import { signal } from '@preact/signals';
import { prefs, setPrefs } from '../prefs.js';
import { ensureImage, layerPayload, placeLayerPayload } from './assets.js';
import { toast } from '../ui.jsx';
import {designBrand,brandLayer} from '../../shared/designBrand.js';
import {styleWholeTextLayer} from '../../shared/designRichText.js';
import {currentDesign,changeDesign,designCommit,openDesign,selection,tool} from './store.js';
import { groupSelectionIds, newDesign } from '../../shared/design.js';
import { uid } from '../../shared/model.js';
import { project } from '../editor/store.js';
import { BRAND_LIMIT, designBrandLayers } from '../../shared/brandLibrary.js';
import { clearLibraryPreview } from './library.js';
export function currentBrand(){return designBrand(prefs.value.designBrand);}
export function updateBrand(patch){setPrefs({designBrand:designBrand({...currentBrand(),...patch})});}
export function setBrandFont(kind,font){
 const fonts={...prefs.value.designBrandFonts,[kind]:font};setPrefs({designBrandFonts:fonts});
 if(currentDesign.value)changeDesign(d=>{d.layers=d.layers.map(l=>{
  const body=l.placeholder==='subtitle'||['body','accent'].includes(l.colorRole);
  return l.type==='text'&&!l.emoji&&!l.locked&&!(l.group&&d.layers.some(s=>s.group===l.group&&s.locked))&&body===(kind==='body')?styleWholeTextLayer(l,{font}):l;
 })});
}
export function applyCurrentBrand(){const brand=currentBrand();if(currentDesign.value)changeDesign(d=>{d.layers=d.layers.map(l=>l.locked||l.hidden||l.group&&d.layers.some(s=>s.group===l.group&&s.locked)?l:brandLayer(l,brand,prefs.value.designBrandFonts))});}
export const brandLogo=signal(null);
export function brandColors(){return(Array.isArray(prefs.value.designColors)?prefs.value.designColors:[]).filter(c=>/^#[0-9a-f]{6}$/i.test(c)).slice(0,20);}
export function saveBrandColor(color){if(!/^#[0-9a-f]{6}$/i.test(color))return;const colors=brandColors();if(colors.some(c=>c.toLowerCase()===color.toLowerCase()))return;if(colors.length>=20)return toast('My Colors can hold up to 20 colors.');setPrefs({designColors:[...colors,color]});}
export async function loadBrandLogo(){const logo=await window.api.getDesignLogo();if(logo)await ensureImage(logo.path);brandLogo.value=logo;}
export async function chooseBrandLogo(){const path=await window.api.openFileDialog({title:'Choose My Logo',filters:[{name:'Images',extensions:['png','jpg','jpeg','webp','svg','gif','bmp']}]});if(!path)return;if(!await ensureImage(path)){toast('Could not read that logo.',{kind:'error'});return;}brandLogo.value=await window.api.setDesignLogo(path);await ensureImage(brandLogo.value.path);}

/* Brand Elements: layers the user styled (titles, lower thirds, badges, logos), saved across projects. */
export const brandLayersDialog = signal(null);
export function brandLayerSets() { return designBrandLayers(prefs.value.designBrandLayers); }
function selectedForBrand() {
  const d = currentDesign.value;
  if (!d) return [];
  const ids = new Set(groupSelectionIds(d.layers, selection.value));
  return d.layers.filter((l) => ids.has(l.id));
}
export function openSaveBrandLayers() {
  const layers = selectedForBrand();
  if (!layers.length) return toast('Select the layers to save to Brand.');
  if (brandLayerSets().length >= BRAND_LIMIT) return toast(`Brand can hold up to ${BRAND_LIMIT} elements. Delete one first.`);
  const first = layers.find((l) => l.groupName) || layers.find((l) => l.type === 'text') || layers[0];
  brandLayersDialog.value = { name: first.groupName || (first.type === 'text' ? String(first.text || '').split('\n')[0].slice(0, 60) : first.name) || 'Brand Element' };
}
// Saves the selected layers (whole groups) with copies of their images in Reccut's own Brand folder,
// so the element still works when the project is moved or deleted.
export async function saveBrandLayers(name) {
  const d = currentDesign.value, layers = selectedForBrand();
  if (!d || !layers.length) throw new Error('Select the layers to save to Brand.');
  const sets = brandLayerSets();
  if (sets.length >= BRAND_LIMIT) throw new Error(`Brand can hold up to ${BRAND_LIMIT} elements. Delete one first.`);
  const payload = structuredClone(layerPayload(d, layers.map((l) => ({ ...l, locked: false, hidden: false }))));
  const files = [...Object.values(payload.assets), ...Object.values(payload.media)].filter((a) => typeof a?.path === 'string' && !a.path.startsWith('data:') && !a.missing);
  if (files.length) {
    const sep = window.api.platform === 'win32' ? '\\' : '/';
    const copies = await window.api.copyIntoProject(files.map((a) => a.path), `${await window.api.baseDir()}${sep}Brand${sep}Design`, { unique: true });
    files.forEach((a, i) => { if (copies?.[i]) { a.path = copies[i]; a.copied = true; } });
  }
  const set = { ...payload, id: uid(), name: String(name || '').trim().slice(0, 120) || 'Brand Element', created: Date.now(), project: null, design: null };
  if (JSON.stringify(set).length > 4e6) throw new Error('These layers are too large to save to Brand. Use images from files instead of pasted pictures.');
  setPrefs({ designBrandLayers: [...brandLayerSets(), set] });
  return set;
}
// Places a saved element, scaled to the canvas. A new design is made when none is open.
export async function placeBrandLayers(set, point = null) {
  if (!currentDesign.value) {
    const d = newDesign({ name: `${project.value.name} Thumbnail` });
    designCommit((p) => { p.designs[d.id] = d; });
    openDesign(d.id);
  }
  clearLibraryPreview();
  const placed = await placeLayerPayload(set, { scale: true, point });
  tool.value = 'select';
  return placed;
}
export function renameBrandLayers(id, name) {
  setPrefs({ designBrandLayers: brandLayerSets().map((s) => (s.id === id ? { ...s, name: String(name || '').trim().slice(0, 120) || s.name } : s)) });
}
export function deleteBrandLayers(id) {
  setPrefs({ designBrandLayers: brandLayerSets().filter((s) => s.id !== id) });
}
