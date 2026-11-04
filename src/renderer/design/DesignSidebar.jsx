import { useEffect,useRef,useState } from 'preact/hooks';
import { prefs,setPrefs } from '../prefs.js';
import { currentDesign } from './store.js';
import { LayersPanel } from './LayersPanel.jsx';
import { Properties } from './Properties.jsx';
export function DesignSidebar(){
  const host=useRef(null),drag=useRef(null),[available,setAvailable]=useState(700),[draft,setDraft]=useState(null),d=currentDesign.value;
  const max=Math.max(64,available-240),clamp=v=>Math.max(64,Math.min(max,v)),automatic=Math.min(240,56+(d?.layers.length||0)*36),height=clamp(draft??prefs.value.designLayersHeight??automatic);
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.height>0)setAvailable(entry.contentRect.height)});observer.observe(host.current);return()=>observer.disconnect()},[]);
  const save=value=>{setDraft(null);setPrefs({designLayersHeight:clamp(value)});};
  return <aside ref={host} class="dz-right dz-sidebar panel"><div class="dz-sidebar-layers" style={{height:d?height:0}}><LayersPanel/></div>{d&&<div class="dz-sidebar-divider" role="separator" aria-label="Resize Layers panel" aria-orientation="horizontal" aria-valuemin={64} aria-valuemax={max} aria-valuenow={height} tabIndex={0}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,height};}}
    onPointerMove={e=>{if(drag.current)setDraft(clamp(drag.current.height+e.clientY-drag.current.y));}}
    onPointerUp={e=>{if(!drag.current)return;save(drag.current.height+e.clientY-drag.current.y);drag.current=null;}}
    onPointerCancel={()=>{drag.current=null;setDraft(null)}}
    onDblClick={()=>{setDraft(null);setPrefs({designLayersHeight:null})}}
    onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();save(e.key==='Home'?64:e.key==='End'?max:height+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?64:16));}}}/>}<div class="dz-properties" aria-label="Properties"><Properties/></div></aside>;
}
