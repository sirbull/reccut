import { useEffect,useRef,useState } from 'preact/hooks';
import { prefs,setPrefs } from '../prefs.js';
import { currentDesign } from './store.js';
import { LayersPanel } from './LayersPanel.jsx';
import { Properties } from './Properties.jsx';
import { designSidebarWidth,setPanelWidth,keepDesignZoom } from './panels.js';
const CENTER_MIN=360;
// Vertical edge of a design panel. edge 'right' grows when dragged right, 'left' when dragged left.
// The canvas keeps at least CENTER_MIN px. Double click returns to the default width.
export function PanelResizer({edge,prefKey,width,min,label}){
  const drag=useRef(null),dir=edge==='right'?1:-1;
  const room=el=>el.closest('.dz-room')?.querySelector('.dz-center')?.clientWidth??CENTER_MIN;
  const clamp=(v,max)=>Math.round(Math.max(min,Math.min(max,v)));
  const at=e=>clamp(drag.current.width+dir*(e.clientX-drag.current.x),drag.current.max);
  return <div class={`dz-col-resizer ${edge}`} role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={width} aria-valuemin={min} tabIndex={0}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,width,max:width+room(e.currentTarget)-CENTER_MIN};}}
    onPointerMove={e=>{if(drag.current&&e.clientX!==drag.current.x){keepDesignZoom();setPanelWidth(prefKey,at(e));}}}
    onPointerUp={e=>{if(!drag.current)return;if(e.clientX!==drag.current.x)setPanelWidth(prefKey,at(e),true);drag.current=null;}}
    onPointerCancel={()=>{drag.current=null;setPanelWidth(prefKey,null);}}
    onDblClick={()=>{keepDesignZoom();setPanelWidth(prefKey,null,true);}}
    onKeyDown={e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();e.stopPropagation();keepDesignZoom();setPanelWidth(prefKey,clamp(width+dir*(e.key==='ArrowRight'?1:-1)*(e.shiftKey?64:16),width+room(e.currentTarget)-CENTER_MIN),true);}}/>;
}
export function DesignSidebar(){
  const host=useRef(null),drag=useRef(null),[available,setAvailable]=useState(700),[draft,setDraft]=useState(null),d=currentDesign.value;
  const max=Math.max(64,available-240),clamp=v=>Math.max(64,Math.min(max,v)),automatic=Math.min(240,56+(d?.layers.length||0)*36),height=clamp(draft??prefs.value.designLayersHeight??automatic);
  useEffect(()=>{const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.height>0)setAvailable(entry.contentRect.height)});observer.observe(host.current);return()=>observer.disconnect()},[]);
  const save=value=>{setDraft(null);setPrefs({designLayersHeight:clamp(value)});};
  return <aside ref={host} class="dz-right dz-sidebar panel"><PanelResizer edge="left" prefKey="designSidebarWidth" width={designSidebarWidth.value} min={240} label="Resize Layers and Properties"/><div class="dz-sidebar-layers" style={{height:d?height:0}}><LayersPanel/></div>{d&&<div class="dz-sidebar-divider" role="separator" aria-label="Resize Layers panel" aria-orientation="horizontal" aria-valuemin={64} aria-valuemax={max} aria-valuenow={height} tabIndex={0}
    onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,height};}}
    onPointerMove={e=>{if(drag.current)setDraft(clamp(drag.current.height+e.clientY-drag.current.y));}}
    onPointerUp={e=>{if(!drag.current)return;save(drag.current.height+e.clientY-drag.current.y);drag.current=null;}}
    onPointerCancel={()=>{drag.current=null;setDraft(null)}}
    onDblClick={()=>{setDraft(null);setPrefs({designLayersHeight:null})}}
    onKeyDown={e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();save(e.key==='Home'?64:e.key==='End'?max:height+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?64:16));}}}/>}<div class="dz-properties" aria-label="Properties"><Properties/></div></aside>;
}
