import { Fragment } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Hand, MousePointer2, Plus, Square, Type, ZoomIn, ZoomOut, Palette, Crop, ChevronDown, Eye, Scan, Frame, Circle, Pentagon, Star, Minus, MoveUpRight, LayoutTemplate, Clapperboard, SquareArrowUp, BadgeCheck, Minimize2, Maximize2, X, Scaling, ScanText, Search, Shapes } from 'lucide-preact';
import { DESIGN_SIZES, DESIGN_SHAPES, designList } from '../../shared/design.js';
import { project, projectEpoch } from '../editor/store.js';
import { Button, IconButton, Modal, toast } from '../ui.jsx';
import { currentDesign, openDesign, addDesign, selection, tool, shapeType, zoom, viewScale, setZoom, newDesignOpen, exportDesignOpen, endDesignTransient } from './store.js';
import { startCrop, cropSession } from './crop.js';
import { TemplatesPanel, DesignLibraryDialogs } from './LibraryPanel.jsx';
import { refreshTemplates, libraryPreview, endLibraryDrag } from './library.js';
import { loadBrandLogo } from './brand.js';
import { ContentPanel, TextPanel, BrandPanel, ImportImageButton, importDesignFiles } from './ContentPanel.jsx';
import { activeDesignPanel, wideDesignPanel, openDesignPanel, toggleDesignPanel, expandDesignPanel } from './panels.js';
import { SearchPanel, ElementsPanel, DesignStylesPanel, VideoPanel } from './OfflinePanels.jsx';
import { DesignStrip } from './DesignStrip.jsx';
import { SuggestionsDialog } from './SuggestionsDialog.jsx';
import { openSuggestions } from './suggest.js';
import { DesignLayerImportDialog } from './LayerImportDialog.jsx';
import { NewDesignDialog } from './NewDesignDialog.jsx';
import { ExportDesignDialog } from './ExportDesignDialog.jsx';
import { DesignCanvas } from './Canvas.jsx';
import { FramePicker } from './FramePicker.jsx';
import { DesignSidebar } from './DesignSidebar.jsx';
import { FeedPreview, CompareDialog } from './Preview.jsx';
import { ReadabilityPanel, useReadability, readabilityStatus } from './Readability.jsx';
import { DesignToolsDialogs } from './ToolsDialogs.jsx';
import { feedPreview, showSafeZones, canFeedPreview, toggleFeedPreview, toggleSafeZones, compareOpen, resizeOpen, makeVariant, startCanvasCrop, transformCanvas } from './tools.js';
import { refineSession } from './refine.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';

const SHAPE_ICONS = { rect: Square, ellipse: Circle, polygon: Pentagon, star: Star, line: Minus, arrow: MoveUpRight };
export function DesignRoom({ active }) {
  const p = project.value, epoch = projectEpoch.value, d = currentDesign.value, list = designList(p);
  const panel=activeDesignPanel.value,wide=wideDesignPanel.value;
  useReadability(d,active);
  const warnings=readabilityStatus.value?.design===d?readabilityStatus.value.warnings:[];
  const [query,setQuery]=useState(''),[readability,setReadability]=useState(false);
  useEffect(()=>{if(active){refreshTemplates();loadBrandLogo().catch(err=>toast(err.message,{kind:'error'}));}},[active,epoch]);
  useEffect(() => { if (active && !d && list.length) openDesign(list[0].id); }, [active, p.designs, d]);
  useEffect(() => { setReadability(false); }, [epoch]);
  useEffect(() => { setQuery(''); endLibraryDrag(); }, [panel]);
  useEffect(() => { if (!active) { endDesignTransient(); endLibraryDrag(); } }, [active]);
  const importPaths=(paths,alternate)=>importDesignFiles(paths,alternate).catch(err=>toast(err.message,{kind:'error'}));
  const panels=[{id:'search',label:'Search',icon:Search},{id:'templates',label:'Templates',icon:LayoutTemplate},{id:'video',label:'Video',icon:Clapperboard},{id:'text',label:'Text',icon:Type},{id:'content',label:'Add Content',icon:SquareArrowUp},{id:'elements',label:'Elements',icon:Shapes},{id:'styles',label:'Styles',icon:Palette},{id:'brand',label:'Brand',icon:BadgeCheck}];
  const view=libraryPreview.value||d;
  return <div class={`dz-room dz-redesign${panel?'':' dz-panel-closed'}${wide?' dz-panel-wide':''}`} onDragOver={(e) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={(e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); importPaths(droppedPaths(e.dataTransfer, window.api.pathForFile), e.altKey); }}>
    <nav class="dz-rail" aria-label="Design panels">{panels.map(({id,label,icon:Icon})=><button key={id} title={label} aria-label={label} aria-pressed={panel===id} onClick={()=>toggleDesignPanel(id)}><Icon size={21}/><span>{label}</span></button>)}</nav>
    {panel&&<aside class="dz-library-panel panel" aria-label={`${panels.find(p=>p.id===panel)?.label} library`}>
      <header class="dz-library-panel-head"><b>{panels.find(p=>p.id===panel)?.label}</b><span class="spacer"/><IconButton icon={wide?Minimize2:Maximize2} title={wide?'Narrow panel':'Expand panel'} onClick={expandDesignPanel}/><IconButton icon={X} title="Close panel" onClick={()=>openDesignPanel(null)}/></header>
      {panel!=='video'&&<div class="dz-panel-search"><input type="search" class="text-input" placeholder={panel==='search'?'Search all content':`Search ${panels.find(p=>p.id===panel)?.label.toLowerCase()}`} aria-label={panel==='search'?'Search all content':'Search current library'} value={query} onInput={e=>setQuery(e.currentTarget.value)}/></div>}
      <div class="dz-library-panel-body">
        {panel==='search'&&<SearchPanel query={query}/>}
        {panel==='elements'&&<ElementsPanel query={query}/>}
        {panel==='styles'&&<DesignStylesPanel query={query}/>}
        {panel==='templates'&&<TemplatesPanel query={query}/>}
        {panel==='video'&&<VideoPanel><section class="dz-library-section"><header><h3>Pick a Frame</h3></header><FramePicker active={active}/></section></VideoPanel>}
        {panel==='text'&&<TextPanel query={query}/>}
        {panel==='content'&&<ContentPanel query={query}/>}
        {panel==='brand'&&<BrandPanel query={query}/>}
      </div>
    </aside>}
    <div class="dz-center">
      <div class="dz-toolbar">
        {[['select', MousePointer2, 'Move Tool (V)'], ['text', Type, 'Type Tool (T)'], ['shape', SHAPE_ICONS[shapeType.value] || Square, `${DESIGN_SHAPES.find((s) => s.value === shapeType.value)?.label} Tool (U)`], ['hand', Hand, 'Hand Tool (H)']].map(([value, icon, title]) => <Fragment key={value}><IconButton icon={icon} title={title} active={tool.value === value} disabled={!d} onClick={() => { tool.value = value; }} />{value === 'shape' && <IconButton icon={ChevronDown} class="dz-shape-menu" size={12} title="Choose Shape (Shift+U)" disabled={!d} onClick={async () => { const next = await window.api.popupMenu(DESIGN_SHAPES.map((s) => ({ id: s.value, label: `${s.label} Tool`, checked: shapeType.value === s.value }))); if (next) { shapeType.value = next; tool.value = 'shape'; } }} />}</Fragment>)}
        <IconButton icon={Crop} title="Crop Tool (C)" active={Boolean(cropSession.value)} disabled={!d} onClick={startCrop} />
        <IconButton icon={Scaling} title="Resize Design" disabled={!d} onClick={()=>resizeOpen.value=true}/>
        <span class="dz-readability-tool"><IconButton icon={ScanText} title={warnings.length?`Readability: ${warnings.length} warnings`:"Readability"} disabled={!d} onClick={()=>setReadability(true)}/>{warnings.length>0&&<i class="dz-warning-dot" aria-label="Readability warnings"/>}</span>
        <IconButton icon={Eye} title={feedPreview.value?'Back to Canvas (F)':'Feed Preview (F)'} active={feedPreview.value} aria-pressed={feedPreview.value} disabled={!canFeedPreview()} onClick={toggleFeedPreview} />
        <IconButton icon={Scan} title="Safe Zones (G)" active={showSafeZones.value} aria-pressed={showSafeZones.value} disabled={!d} onClick={toggleSafeZones} />
        <IconButton icon={Frame} title="Canvas: variants, crop, rotate" disabled={!d||refineSession.value?.busy} onClick={async()=>{const action=await window.api.popupMenu([{id:'variant',label:'Make Variant'},{id:'compare',label:'Compare Variants'},{id:'crop',label:'Crop Canvas'},{id:'left',label:'Rotate Canvas Left'},{id:'right',label:'Rotate Canvas Right'},{id:'horizontal',label:'Flip Canvas Horizontally'},{id:'vertical',label:'Flip Canvas Vertically'}]);if(action==='variant')makeVariant();else if(action==='compare')compareOpen.value=true;else if(action==='crop')startCanvasCrop();else if(action)transformCanvas(action);}} />
        <span class="spacer" /><IconButton icon={ZoomOut} title="Zoom out" onClick={() => setZoom((zoom.value === 'fit' ? viewScale.value : zoom.value) / 1.25)} /><button class="link" onClick={() => setZoom('fit')}>{zoom.value === 'fit' ? 'Fit on Screen' : `${Math.round(zoom.value * 100)}%`}</button><IconButton icon={ZoomIn} title="Zoom in" onClick={() => setZoom((zoom.value === 'fit' ? viewScale.value : zoom.value) * 1.25)} />
      </div>
      {view ? <>{feedPreview.value&&d?<FeedPreview/>:<DesignCanvas active={active}/>} <div class="dz-status"><span>{view.name} · {view.width} × {view.height}</span><span>{selection.value.length ? `${selection.value.length} selected` : `${view.layers.length} layers`}</span></div></> : <div class="dz-empty"><Palette size={36} /><h2>Make something worth clicking.</h2><p class="dim">Create a thumbnail or an image, with layers of your own.</p><Button variant="primary" icon={Plus} onClick={() => (newDesignOpen.value = true)}>New Design</Button><Button onClick={openSuggestions}>Suggestions</Button><ImportImageButton/><div class="dz-size-grid">{DESIGN_SIZES.slice(0, 6).map((s) => <button class="dz-size-card" key={s.id} onClick={() => addDesign({ ...s, name: `${p.name} ${s.label}`, size: s.id })}><b>{s.label}</b><small>{s.width} × {s.height}</small></button>)}</div><p class="hint">You can also drop an image here to get started.</p></div>}
      <DesignStrip active={active}/>
    </div>
    <DesignSidebar/>
    <DesignLayerImportDialog /><DesignLibraryDialogs/><SuggestionsDialog/><CompareDialog/><DesignToolsDialogs/>
    {newDesignOpen.value && <NewDesignDialog design={p.designs?.[newDesignOpen.value.designId] || null} />}
    {exportDesignOpen.value && <ExportDesignDialog />}
    {readability&&d&&<Modal title="Readability" width={440} onClose={()=>setReadability(false)}><ReadabilityPanel/></Modal>}
  </div>;
}
