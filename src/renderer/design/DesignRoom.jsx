import { useEffect, useRef, useState } from 'preact/hooks';
import { Copy, Hand, ImagePlus, MousePointer2, Plus, Square, Trash2, Type, ZoomIn, ZoomOut, Palette } from 'lucide-preact';
import { DESIGN_SIZES, designList } from '../../shared/design.js';
import { drawDesign } from '../../shared/designRender.js';
import { uid } from '../../shared/model.js';
import { project, projectEpoch } from '../editor/store.js';
import { setPrefs } from '../prefs.js';
import { Button, IconButton, Modal, Segmented, Toggle, Row, toast } from '../ui.jsx';
import { currentDesign, openDesign, addDesign, selection, tool, zoom, viewScale, setZoom, newDesignOpen, exportDesignOpen, placeRequest, designCommit, endDesignTransient } from './store.js';
import { imageVersion, getImage, loadDesignImages, chooseImage, requestPlace, placeFiles, placeProjectImage } from './assets.js';
import { NewDesignDialog } from './NewDesignDialog.jsx';
import { ExportDesignDialog } from './ExportDesignDialog.jsx';
import { DesignCanvas } from './Canvas.jsx';
import { FramePicker } from './FramePicker.jsx';
import { Properties } from './Properties.jsx';
import { LayersPanel } from './LayersPanel.jsx';
import { droppedPaths, hasFiles } from '../fileDrop.js';

function Thumbnail({ design, active }) {
  const ref = useRef(null), version = imageVersion.value;
  useEffect(() => { if (active) loadDesignImages(design); }, [design, active]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const ctx = ref.current?.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, 132, 78);
      const k = Math.min(132 / design.width, 78 / design.height);
      ctx.save(); ctx.translate((132 - design.width * k) / 2, (78 - design.height * k) / 2);
      drawDesign(ctx, design, getImage, { scale: k }); ctx.restore();
    });
    return () => cancelAnimationFrame(frame);
  }, [design, version, active]);
  return <canvas class="dz-thumb" ref={ref} width={132} height={78} />;
}
function PlaceDialog({ request }) {
  const [copy, setCopy] = useState(request.copy), [remember, setRemember] = useState(false), [busy, setBusy] = useState(false);
  const close = () => { if (!busy) placeRequest.value = null; };
  const place = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (remember) setPrefs({ importCopy: copy, designImportRemember: true });
      await placeFiles(request.paths, { ...request, copy });
      placeRequest.value = null;
    } catch (err) { toast(err.message, { kind: 'error' }); }
    finally { setBusy(false); }
  };
  return <Modal title="Place Images" width={430} onClose={close} footer={<><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="primary" disabled={busy} onClick={place}>{busy ? 'Placing…' : 'Place'}</Button></>}>
    <p>{request.paths.length} image{request.paths.length === 1 ? '' : 's'}</p>
    <Segmented value={copy} onChange={setCopy} options={[{ value: true, label: 'Copy into project' }, { value: false, label: 'Leave in place' }]} />
    <p class="hint">Copied files go into Designs/Assets. Files left in place must remain accessible at their original location.</p>
    <Row label="Remember this choice"><Toggle checked={remember} onChange={setRemember} /></Row>
  </Modal>;
}
export function DesignRoom({ active }) {
  const p = project.value, epoch = projectEpoch.value, d = currentDesign.value, list = designList(p), request = placeRequest.value;
  const [tab, setTab] = useState('designs'), [renaming, setRenaming] = useState(null), [name, setName] = useState(''), [deleting, setDeleting] = useState(null);
  useEffect(() => { if (active && !d && list.length) openDesign(list[0].id); }, [active, p.designs, d]);
  useEffect(() => { setDeleting(null); setRenaming(null); }, [epoch]);
  useEffect(() => { if (!active) endDesignTransient(); }, [active]);
  const duplicate = (item) => {
    const copy = { ...item, id: uid(), name: `${item.name} copy`, created: Date.now(), layers: item.layers.map((l) => ({ ...l, id: uid() })) };
    designCommit((p) => { p.designs[copy.id] = copy; }); openDesign(copy.id);
  };
  const place = (paths) => {
    if (!d) addDesign({ name: `${p.name} Thumbnail` });
    requestPlace(paths);
  };
  return <div class="dz-room" onDragOver={(e) => { if (hasFiles(e.dataTransfer)) { e.preventDefault(); e.stopPropagation(); } }} onDrop={(e) => { if (!hasFiles(e.dataTransfer)) return; e.preventDefault(); e.stopPropagation(); place(droppedPaths(e.dataTransfer, window.api.pathForFile)); }}>
    <aside class="dz-left panel">
      <div class="dz-panel-head"><b>Design</b><IconButton icon={Plus} title="New Design" onClick={() => (newDesignOpen.value = true)} /></div>
      <div class="dz-tabs"><Segmented value={tab} options={[{ value: 'designs', label: 'Designs' }, { value: 'video', label: 'Video' }, { value: 'project', label: 'From Project' }]} onChange={setTab} /></div>
      <div class="dz-left-content">
        {tab === 'designs' && list.map((item) => <div key={item.id} class={`dz-design-card${item.id === d?.id ? ' active' : ''}`} onClick={() => openDesign(item.id)}>
          <Thumbnail design={item} active={active} />
          {renaming === item.id ? <input class="text-input" value={name} autoFocus onClick={(e) => e.stopPropagation()} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => { if (name.trim()) designCommit((p) => { p.designs[item.id].name = name.trim(); }); setRenaming(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} /> : <b onDblClick={() => { setRenaming(item.id); setName(item.name); }}>{item.name}</b>}
          <div class="dz-design-meta"><small>{item.width} × {item.height}</small><span class="spacer" /><IconButton icon={Copy} title="Duplicate design" onClick={(e) => { e.stopPropagation(); duplicate(item); }} /><IconButton icon={Trash2} title="Delete design" onClick={(e) => { e.stopPropagation(); setDeleting(item.id); }} /></div>
        </div>)}
        {tab === 'video' && <FramePicker active={active} />}
        {tab === 'project' && <><p class="hint">Images here are shared with Edit. Use the Video tab to pick a video frame.</p>{Object.values(p.media).filter((m) => m.kind === 'image').map((m) => <Button key={m.id} disabled={!d} onClick={() => placeProjectImage(m)}>{m.name}</Button>)}</>}
      </div>
      <div class="dz-panel-footer"><Button icon={Plus} onClick={() => (newDesignOpen.value = true)}>New Design</Button><Button icon={ImagePlus} disabled={!d} onClick={chooseImage}>Place Image…</Button></div>
    </aside>
    <div class="dz-center">
      <div class="dz-toolbar">
        {[['select', MousePointer2, 'Select (V)'], ['text', Type, 'Text (T)'], ['shape', Square, 'Rectangle (U)'], ['hand', Hand, 'Hand (H)']].map(([value, icon, title]) => <IconButton key={value} icon={icon} title={title} active={tool.value === value} disabled={!d} onClick={() => { tool.value = value; }} />)}
        <span class="spacer" /><IconButton icon={ZoomOut} title="Zoom out" onClick={() => setZoom((zoom.value === 'fit' ? viewScale.value : zoom.value) / 1.25)} /><button class="link" onClick={() => setZoom('fit')}>{zoom.value === 'fit' ? 'Fit' : `${Math.round(zoom.value * 100)}%`}</button><IconButton icon={ZoomIn} title="Zoom in" onClick={() => setZoom((zoom.value === 'fit' ? viewScale.value : zoom.value) * 1.25)} />
      </div>
      {d ? <><DesignCanvas active={active} /><div class="dz-status"><span>{d.name} · {d.width} × {d.height}</span><span>{selection.value.length ? `${selection.value.length} selected` : `${d.layers.length} layers`}</span></div></> : <div class="dz-empty"><Palette size={36} /><h2>Make something worth clicking.</h2><p class="dim">Create a thumbnail or an image, with layers of your own.</p><Button variant="primary" icon={Plus} onClick={() => (newDesignOpen.value = true)}>New Design</Button><div class="dz-size-grid">{DESIGN_SIZES.slice(0, 6).map((s) => <button class="dz-size-card" key={s.id} onClick={() => addDesign({ ...s, name: `${p.name} ${s.label}`, size: s.id })}><b>{s.label}</b><small>{s.width} × {s.height}</small></button>)}</div><p class="hint">You can also drop an image here to get started.</p></div>}
    </div>
    <aside class="dz-right panel"><div class="dz-properties"><Properties /></div><LayersPanel /></aside>
    {newDesignOpen.value && <NewDesignDialog design={p.designs?.[newDesignOpen.value.designId] || null} />}
    {exportDesignOpen.value && <ExportDesignDialog />}
    {request && request.epoch === epoch && <PlaceDialog request={request} />}
    {deleting && <Modal title="Delete Design" width={420} onClose={() => setDeleting(null)} footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="primary" onClick={() => { designCommit((p) => { delete p.designs[deleting]; }); setDeleting(null); }}>Delete</Button></>}><p>Delete "{p.designs?.[deleting]?.name}"? You can undo this.</p></Modal>}
  </div>;
}
