import { useEffect, useRef, useState } from 'preact/hooks';
import { Plus, ChevronDown } from 'lucide-preact';
import { project, projectEpoch } from '../editor/store.js';
import { IconButton, Button, Modal, toast } from '../ui.jsx';
import { designList, duplicateDesign } from '../../shared/design.js';
import { drawDesign } from '../../shared/designRender.js';
import { currentDesign, openDesign, newDesignOpen, exportDesignOpen, designCommit } from './store.js';
import { makeVariant, batchExportOpen, compareOpen } from './tools.js';
import { refineSession } from './refine.js';
import { imageVersion, getImage, loadDesignImages } from './assets.js';
import { fontAvailable, fontVersion } from './fonts.js';
import { quickExportPNG } from './export.js';
import { clearLibraryPreview } from './library.js';
function StripThumbnail({ design, active }) {
  const ref = useRef(null), version = `${imageVersion.value}:${fontVersion.value}`;
  useEffect(() => { if (active) loadDesignImages(design); }, [active, design]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const ctx = ref.current?.getContext('2d'); if (!ctx) return;
      const k = Math.min(96 / design.width, 54 / design.height);
      ctx.clearRect(0, 0, 96, 54); ctx.save(); ctx.translate((96 - design.width * k) / 2, (54 - design.height * k) / 2);
      drawDesign(ctx, design, getImage, { scale: k, fontAvailable }); ctx.restore();
    }); return () => cancelAnimationFrame(frame);
  }, [active, design, version]);
  return <canvas ref={ref} width={96} height={54}/>;
}
export function DesignStrip({ active }) {
  const p = project.value, d = currentDesign.value, epoch = projectEpoch.value;
  const canceled=useRef(false);
  const [rename, setRename] = useState(null), [name, setName] = useState(''), [deleting, setDeleting] = useState(null);
  useEffect(() => { setRename(null); setDeleting(null); }, [epoch]);
  const activate = id => { clearLibraryPreview(); openDesign(id); };
  const menu = async (e, item) => {
    e.preventDefault();
    const id = await window.api.popupMenu([{ id: 'open', label: 'Open Design' }, { id: 'rename', label: 'Rename Design…' }, { id: 'duplicate', label: 'Duplicate Design' }, { id: 'variant', label: 'Make Variant' }, { id: 'delete', label: 'Delete Design' }]);
    if (id === 'open') activate(item.id);
    if (id === 'rename') { canceled.current=false;setRename(item.id); setName(item.name); }
    if (id === 'delete') setDeleting(item.id);
    if (id === 'variant') { activate(item.id); makeVariant(); }
    if (id === 'duplicate') { const copy = duplicateDesign(item); designCommit(p => { p.designs[copy.id] = copy; }); activate(copy.id); }
  };
  const exportMenu = async () => {
    const id = await window.api.popupMenu([{ id: 'as', label: 'Export As…' }, { id: 'quick', label: 'Quick Export as PNG' }, { id: 'all', label: 'Export All Sizes…' }, { id: 'compare', label: 'Compare Variants' }]);
    if (id === 'as') exportDesignOpen.value = true;
    if (id === 'quick') quickExportPNG().catch(err => toast(err.message, { kind: 'error' }));
    if (id === 'all') batchExportOpen.value = true;
    if (id === 'compare') compareOpen.value = true;
  };
  return <div class="dz-design-strip" aria-label="Designs"><div class="dz-strip-pages">{designList(p).map((item, index) => <div key={item.id} class={`dz-strip-page${item.id === d?.id ? ' active' : ''}`}>
    {rename === item.id ? <input class="text-input" aria-label="Design name" value={name} autoFocus onInput={e => setName(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); canceled.current=true;setRename(null); } if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={() => { if (!canceled.current&&name.trim()) designCommit(p => { if (p.designs[item.id]) p.designs[item.id].name = name.trim(); }); setRename(null); }}/>
      : <button title={`${item.name}${item.favorite ? ' (Favorite)' : ''}`} aria-label={`Open design ${index + 1}: ${item.name}`} aria-pressed={item.id === d?.id} onClick={() => activate(item.id)} onDblClick={() => { canceled.current=false;setRename(item.id); setName(item.name); }} onContextMenu={e => menu(e, item)}><StripThumbnail design={item} active={active}/><span>{index + 1}. {item.name}</span>{item.favorite && <small class="dz-favorite">Favorite</small>}</button>}
  </div>)}<IconButton icon={Plus} title="New Design" class="dz-strip-add" onClick={() => newDesignOpen.value = true}/></div><Button disabled={!d || !!refineSession.value} class="dz-strip-export" onClick={exportMenu}>Export <ChevronDown size={13}/></Button>
    {deleting && <Modal title="Delete Design" width={420} onClose={() => setDeleting(null)} footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="primary" onClick={() => { designCommit(p => { delete p.designs[deleting]; }); setDeleting(null); }}>Delete</Button></>}><p>Delete "{p.designs[deleting]?.name}"? You can undo this.</p></Modal>}
  </div>;
}
