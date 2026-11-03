import { useEffect, useRef, useState } from 'preact/hooks';
import { Copy, Hand, ImagePlus, MousePointer2, Plus, Square, Trash2, Type, ZoomIn, ZoomOut, Palette, Crop } from 'lucide-preact';
import { DESIGN_SIZES, DESIGN_SHAPES, designList, duplicateDesign } from '../../shared/design.js';
import { drawDesign } from '../../shared/designRender.js';
import { uid } from '../../shared/model.js';
import { project, projectEpoch } from '../editor/store.js';
import { prefs } from '../prefs.js';
import { Button, IconButton, Modal, Segmented, toast } from '../ui.jsx';
import { currentDesign, openDesign, addDesign, selection, tool, shapeType, zoom, viewScale, setZoom, newDesignOpen, exportDesignOpen, designCommit, endDesignTransient } from './store.js';
import { fontAvailable, fontVersion } from './fonts.js';
import { startCrop, cropSession } from './crop.js';
import { imageVersion, getImage, loadDesignImages, chooseImage, requestPlace, placeProjectImage, chooseOpenImage, openImageFiles } from './assets.js';
import { StylesPanel, TemplatesPanel, DesignLibraryDialogs } from './LibraryPanel.jsx';
import { refreshTemplates } from './library.js';
import { loadBrandLogo } from './brand.js';
import { SuggestionsDialog } from './SuggestionsDialog.jsx';
import { openSuggestions } from './suggest.js';
import { DesignLayerImportDialog } from './LayerImportDialog.jsx';
import { NewDesignDialog } from './NewDesignDialog.jsx';
import { ExportDesignDialog } from './ExportDesignDialog.jsx';
import { DesignCanvas } from './Canvas.jsx';
import { FramePicker } from './FramePicker.jsx';
import { Properties } from './Properties.jsx';
import { LayersPanel } from './LayersPanel.jsx';
import { FeedPreview, CompareDialog } from './Preview.jsx';
import { ReadabilityPanel } from './Readability.jsx';
import { DesignToolsDialogs } from './ToolsDialogs.jsx';
import { feedPreview, showSafeZones, compareOpen, resizeOpen, batchExportOpen, makeVariant, startCanvasCrop, transformCanvas, canvasCrop } from './tools.js';
import { refineSession } from './refine.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';

function Thumbnail({ design, active }) {
  const ref = useRef(null), version = `${imageVersion.value}:${fontVersion.value}`;
  useEffect(() => { if (active) loadDesignImages(design); }, [design, active]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const ctx = ref.current?.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, 132, 78);
      const k = Math.min(132 / design.width, 78 / design.height);
      ctx.save(); ctx.translate((132 - design.width * k) / 2, (78 - design.height * k) / 2);
      drawDesign(ctx, design, getImage, { scale: k, fontAvailable }); ctx.restore();
    });
    return () => cancelAnimationFrame(frame);
  }, [design, version, active]);
  return <canvas class="dz-thumb" ref={ref} width={132} height={78} />;
}
export function DesignRoom({ active }) {
  const p = project.value, epoch = projectEpoch.value, d = currentDesign.value, list = designList(p);
  const [tab, setTab] = useState('designs'), [renaming, setRenaming] = useState(null), [name, setName] = useState(''), [deleting, setDeleting] = useState(null);
  useEffect(()=>{if(active){refreshTemplates();loadBrandLogo().catch(err=>toast(err.message,{kind:'error'}));}},[active,epoch]);
  useEffect(() => { if (active && !d && list.length) openDesign(list[0].id); }, [active, p.designs, d]);
  useEffect(() => { setDeleting(null); setRenaming(null); }, [epoch]);
  useEffect(() => { if (!active) endDesignTransient(); }, [active]);
  const duplicate = (item) => {
    const copy = duplicateDesign(item);
    designCommit((p) => { p.designs[copy.id] = copy; }); openDesign(copy.id);
  };
  const place = (paths, alternate) => {
    if (!d && paths.every(path => /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(path))) { openImageFiles(paths,{copy:alternate?!prefs.value.importCopy:prefs.value.importCopy}); return; }
    if (!d) addDesign({ name: `${p.name} Thumbnail` });
    requestPlace(paths, null, alternate).catch((err) => toast(err.message, { kind: 'error' }));
  };
  return <div class="dz-room" onDragOver={(e) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={(e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); place(droppedPaths(e.dataTransfer, window.api.pathForFile), e.altKey); }}>
    <aside class="dz-left panel">
      <div class="dz-panel-head"><b>Design</b><IconButton icon={Plus} title="New Design" onClick={() => (newDesignOpen.value = true)} /></div>
      <div class="dz-tabs"><Segmented value={tab} options={[{ value: 'designs', label: 'Designs' }, { value: 'video', label: 'Video' }, { value: 'project', label: 'From Project' }, {value:'styles',label:'Styles'}, {value:'templates',label:'Templates'}]} onChange={setTab} /></div>
      <div class="dz-left-content">
        {tab === 'designs' && list.map((item) => <div key={item.id} class={`dz-design-card${item.id === d?.id ? ' active' : ''}`} onClick={() => openDesign(item.id)}>
          <Thumbnail design={item} active={active} />{item.favorite&&<small class="dz-favorite">Favorite</small>}
          {renaming === item.id ? <input class="text-input" value={name} autoFocus onClick={(e) => e.stopPropagation()} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => { if (name.trim()) designCommit((p) => { if (p.designs[item.id]) p.designs[item.id].name = name.trim(); }); setRenaming(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} /> : <b onDblClick={() => { setRenaming(item.id); setName(item.name); }}>{item.name}</b>}
          <div class="dz-design-meta"><small>{item.width} × {item.height}</small><span class="spacer" /><IconButton icon={Copy} title="Duplicate design" onClick={(e) => { e.stopPropagation(); duplicate(item); }} /><IconButton icon={Trash2} title="Delete design" onClick={(e) => { e.stopPropagation(); setDeleting(item.id); }} /></div>
        </div>)}
        {tab === 'styles' && <StylesPanel/>}
        {tab === 'templates' && <TemplatesPanel/>}
        {tab === 'video' && <FramePicker active={active} />}
        {tab === 'project' && <><p class="hint">Images here are shared with Edit. Use the Video tab to pick a video frame.</p>{Object.values(p.media).filter((m) => m.kind === 'image').map((m) => <Button key={m.id} disabled={!d} onClick={() => placeProjectImage(m)}>{m.name}</Button>)}</>}
      </div>
      <div class="dz-panel-footer"><Button onClick={chooseOpenImage}>Open Image…</Button><Button icon={Plus} onClick={() => (newDesignOpen.value = true)}>New Design</Button><div class="dz-place"><Button icon={ImagePlus} disabled={!d} onClick={() => chooseImage().catch((err) => toast(err.message, { kind: 'error' }))}>{prefs.value.importCopy ? 'Place Embedded…' : 'Place Linked…'}</Button><Button disabled={!d} title="Place options" aria-label="Place options" onClick={async () => { const id = await window.api.popupMenu([{ id: 'embedded', label: 'Place Embedded…' }, { id: 'linked', label: 'Place Linked…' }]); if (id) chooseImage(id === 'embedded').catch((err) => toast(err.message, { kind: 'error' })); }}>▾</Button></div></div>
    </aside>
    <div class="dz-center">
      <div class="dz-toolbar">
        {[['select', MousePointer2, 'Move Tool (V)'], ['text', Type, 'Type Tool (T)'], ['shape', Square, `${DESIGN_SHAPES.find((s) => s.value === shapeType.value)?.label} Tool (U)`], ['hand', Hand, 'Hand Tool (H)']].map(([value, icon, title]) => <IconButton key={value} icon={icon} title={title} active={tool.value === value} disabled={!d} onClick={() => { tool.value = value; }} />)}
        <IconButton icon={Crop} title="Crop Tool (C)" active={Boolean(cropSession.value)} disabled={!d} onClick={startCrop} />
        <Button class="small" disabled={!d} title="Shape tools (Shift+U cycles)" onClick={async () => { const next = await window.api.popupMenu(DESIGN_SHAPES.map((s) => ({ id: s.value, label: `${s.label} Tool`, checked: shapeType.value === s.value }))); if (next) { shapeType.value = next; tool.value = 'shape'; } }}>{DESIGN_SHAPES.find((s) => s.value === shapeType.value)?.label} ▾</Button>
        <Button class="small" disabled={!d||Boolean(cropSession.value||refineSession.value||canvasCrop.value)} onClick={()=>{endDesignTransient();feedPreview.value=!feedPreview.value}}>{feedPreview.value?'Edit Canvas':'Preview'}</Button>
        <Button class="small" disabled={!d} onClick={()=>showSafeZones.value=!showSafeZones.value} aria-pressed={showSafeZones.value}>Safe Zones</Button>
        <Button class="small" disabled={!d||refineSession.value?.busy} onClick={async()=>{const action=await window.api.popupMenu([{id:'variant',label:'Make Variant'},{id:'compare',label:'Compare Variants'},{id:'resize',label:'Resize…'},{id:'export',label:'Export All Sizes…',enabled:!refineSession.value},{id:'crop',label:'Crop Canvas'},{id:'left',label:'Rotate Canvas Left'},{id:'right',label:'Rotate Canvas Right'},{id:'horizontal',label:'Flip Canvas Horizontally'},{id:'vertical',label:'Flip Canvas Vertically'}]);if(action==='variant')makeVariant();else if(action==='compare')compareOpen.value=true;else if(action==='resize')resizeOpen.value=true;else if(action==='export')batchExportOpen.value=true;else if(action==='crop')startCanvasCrop();else if(action)transformCanvas(action);}}>Canvas…</Button>
        <span class="spacer" /><IconButton icon={ZoomOut} title="Zoom out" onClick={() => setZoom((zoom.value === 'fit' ? viewScale.value : zoom.value) / 1.25)} /><button class="link" onClick={() => setZoom('fit')}>{zoom.value === 'fit' ? 'Fit on Screen' : `${Math.round(zoom.value * 100)}%`}</button><IconButton icon={ZoomIn} title="Zoom in" onClick={() => setZoom((zoom.value === 'fit' ? viewScale.value : zoom.value) * 1.25)} />
      </div>
      {d ? <>{feedPreview.value?<FeedPreview/>:<DesignCanvas active={active}/>} <div class="dz-status"><span>{d.name} · {d.width} × {d.height}</span><span>{selection.value.length ? `${selection.value.length} selected` : `${d.layers.length} layers`}</span></div></> : <div class="dz-empty"><Palette size={36} /><h2>Make something worth clicking.</h2><p class="dim">Create a thumbnail or an image, with layers of your own.</p><Button variant="primary" icon={Plus} onClick={() => (newDesignOpen.value = true)}>New Design</Button><Button onClick={openSuggestions}>Suggestions</Button><Button onClick={chooseOpenImage}>Open Image…</Button><div class="dz-size-grid">{DESIGN_SIZES.slice(0, 6).map((s) => <button class="dz-size-card" key={s.id} onClick={() => addDesign({ ...s, name: `${p.name} ${s.label}`, size: s.id })}><b>{s.label}</b><small>{s.width} × {s.height}</small></button>)}</div><p class="hint">You can also drop an image here to get started.</p></div>}
    </div>
    <aside class="dz-right panel"><div class="dz-properties" aria-label="Properties"><Properties /><ReadabilityPanel/></div><LayersPanel /></aside>
    <DesignLayerImportDialog /><DesignLibraryDialogs/><SuggestionsDialog/><CompareDialog/><DesignToolsDialogs/>
    {newDesignOpen.value && <NewDesignDialog design={p.designs?.[newDesignOpen.value.designId] || null} />}
    {exportDesignOpen.value && <ExportDesignDialog />}
    {deleting && <Modal title="Delete Design" width={420} onClose={() => setDeleting(null)} footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="primary" onClick={() => { designCommit((p) => { delete p.designs[deleting]; }); setDeleting(null); }}>Delete</Button></>}><p>Delete "{p.designs?.[deleting]?.name}"? You can undo this.</p></Modal>}
  </div>;
}
