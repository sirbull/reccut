import { brandColors } from './brand.js';
import { setPrefs } from '../prefs.js';
export function BrandColors({onChange}){
  const colors=brandColors();
  if(!colors.length)return null;
  return <div class="dz-brand-colors" aria-label="My Colors"><div class="dz-swatches">{colors.map(color=><button key={color} title={color} aria-label={`Use ${color}`} style={{background:color}} onClick={()=>onChange(color)} onContextMenu={async e=>{e.preventDefault();const action=await window.api.popupMenu([{id:'remove',label:'Remove Color'}]);if(action==='remove')setPrefs({designColors:colors.filter(c=>c!==color)});}}/>)}</div></div>;
}
