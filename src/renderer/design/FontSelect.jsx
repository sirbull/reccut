import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { RefreshCw } from 'lucide-preact';
import { FontPicker,Button,IconButton } from '../ui.jsx';
import { fontAvailable,refreshDesignFonts } from './fonts.js';
const installed=signal(null),defaults=[{value:'sans',label:'System Sans'},{value:'rounded',label:'System Rounded'},{value:'serif',label:'Serif'},{value:'mono',label:'Monospace'}];
let enumerated=false,loading=false;
async function load(){if(loading)return;loading=true;try{const fonts=await window.queryLocalFonts();if(!fonts.length)throw new Error('Font list is not available yet.');enumerated=true;installed.value=[...new Set(fonts.map(f=>f.family))].sort((a,b)=>a.localeCompare(b));refreshDesignFonts();}catch{installed.value=['Arial','Helvetica Neue','Verdana','Georgia','Times New Roman','Impact','Avenir Next','Segoe UI','Calibri','Roboto','Inter'].filter(fontAvailable);}finally{loading=false;}}
export function DesignFontSelect({value,onChange,sample}){
  useEffect(()=>{if(!installed.value)load()},[]);
  const all=[...defaults,...(installed.value||[]).map(font=>({value:font,label:font}))];if(!all.some(f=>f.value===value))all.push({value,label:value});
  return <div class="dz-font-select" onPointerDown={()=>{if(!enumerated)load()}}><div class="dz-font-choice"><FontPicker value={value} options={all} onChange={onChange} sample={sample}/><IconButton icon={RefreshCw} title="Refresh Installed Fonts" onClick={load}/></div><span class="hint">Fonts installed on this computer. Install downloaded Google Fonts to use them here.</span><Button class="small" onClick={()=>window.api.openExternal('https://fonts.google.com/')}>Browse Google Fonts…</Button></div>;
}
