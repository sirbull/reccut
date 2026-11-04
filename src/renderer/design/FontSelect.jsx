import { useEffect,useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { RefreshCw } from 'lucide-preact';
import { Select,Button,IconButton } from '../ui.jsx';
import { fontAvailable,refreshDesignFonts } from './fonts.js';
const installed=signal(null),defaults=[{value:'sans',label:'System Sans'},{value:'rounded',label:'System Rounded'},{value:'serif',label:'Serif'},{value:'mono',label:'Monospace'}];
let enumerated=false,loading=false;
async function load(){if(loading)return;loading=true;try{const fonts=await window.queryLocalFonts();if(!fonts.length)throw new Error('Font list is not available yet.');enumerated=true;installed.value=[...new Set(fonts.map(f=>f.family))].sort((a,b)=>a.localeCompare(b));refreshDesignFonts();}catch{installed.value=['Arial','Helvetica Neue','Verdana','Georgia','Times New Roman','Impact','Avenir Next','Segoe UI','Calibri','Roboto','Inter'].filter(fontAvailable);}finally{loading=false;}}
export function DesignFontSelect({value,onChange}){
  const [query,setQuery]=useState('');useEffect(()=>{if(!installed.value)load()},[]);
  const all=[...defaults,...(installed.value||[]).map(font=>({value:font,label:font}))];if(!all.some(f=>f.value===value))all.push({value,label:value});
  const options=all.filter(f=>f.label.toLowerCase().includes(query.toLowerCase())||f.value===value);
  return <div class="dz-font-select" onPointerDown={()=>{if(!enumerated)load()}}><input class="text-input" type="search" aria-label="Search installed fonts" placeholder="Search installed fonts" value={query} onInput={e=>setQuery(e.currentTarget.value)}/><div class="dz-font-choice"><Select value={value} options={options} onChange={onChange}/><IconButton icon={RefreshCw} title="Refresh Installed Fonts" onClick={load}/></div><span class="hint">Fonts installed on this computer. Install downloaded Google Fonts to use them here.</span><Button class="small" onClick={()=>window.api.openExternal('https://fonts.google.com/')}>Browse Google Fonts…</Button></div>;
}
