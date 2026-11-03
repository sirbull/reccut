import { Row, Button } from '../ui.jsx';
import { brandColors, saveBrandColor } from './brand.js';
import { setPrefs } from '../prefs.js';
export function BrandColors({value,onChange}){
  const colors=brandColors();
  return <div class="dz-brand-colors" aria-label="My Colors"><div class="dz-swatches">{colors.map(color=><button key={color} title={color} aria-label={`Use ${color}`} style={{background:color}} onClick={()=>onChange(color)} onContextMenu={async e=>{e.preventDefault();const action=await window.api.popupMenu([{id:'remove',label:'Remove Color'}]);if(action==='remove')setPrefs({designColors:colors.filter(c=>c!==color)});}}/>)}</div><Button class="small" onClick={()=>saveBrandColor(value)}>Save Color</Button></div>;
}
