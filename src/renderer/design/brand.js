import { signal } from '@preact/signals';
import { prefs, setPrefs } from '../prefs.js';
import { ensureImage } from './assets.js';
import { toast } from '../ui.jsx';
import {designBrand,brandLayer} from '../../shared/designBrand.js';
import {styleWholeTextLayer} from '../../shared/designRichText.js';
import {currentDesign,changeDesign} from './store.js';
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
