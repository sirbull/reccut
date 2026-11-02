import { useState } from 'preact/hooks';
import { Eye, EyeOff, Lock, Unlock, Image, Type, Square, TriangleAlert } from 'lucide-preact';
import { Section, IconButton } from '../ui.jsx';
import { currentDesign, selection, changeDesign, duplicateSelection, deleteSelection, orderSelection } from './store.js';
import { imageMissing, imageVersion, locateImage } from './assets.js';

export function LayersPanel() {
  const d = currentDesign.value, ids = selection.value;
  imageVersion.value;
  const [anchor, setAnchor] = useState(null), [renaming, setRenaming] = useState(null), [name, setName] = useState(''), [dragged, setDragged] = useState(null);
  if (!d) return null;
  const rows = [...d.layers].reverse();
  const patch = (id, props) => changeDesign((d) => { const l = d.layers.find((l) => l.id === id); if (l) Object.assign(l, props); });
  const select = (e, l) => {
    if (e.shiftKey && anchor) { const a = rows.findIndex((l) => l.id === anchor), b = rows.findIndex((r) => r.id === l.id); selection.value = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id); }
    else if (e.metaKey || e.ctrlKey) selection.value = ids.includes(l.id) ? ids.filter((id) => id !== l.id) : [...ids, l.id];
    else selection.value = [l.id];
    setAnchor(l.id);
  };
  const context = async (e, l) => {
    e.preventDefault(); if (!ids.includes(l.id)) selection.value = [l.id];
    const id = await window.api.popupMenu([{ id: 'duplicate', label: 'Duplicate' }, { id: 'delete', label: 'Delete' }, { id: 'front', label: 'Bring to Front' }, { id: 'back', label: 'Send to Back' }, { id: 'hidden', label: l.hidden ? 'Show' : 'Hide' }, { id: 'locked', label: l.locked ? 'Unlock' : 'Lock' }]);
    if (id === 'duplicate') duplicateSelection();
    else if (id === 'delete') deleteSelection();
    else if (id === 'front' || id === 'back') orderSelection(id);
    else if (id) patch(l.id, { [id]: !l[id] });
  };
  return <Section title={`Layers (${rows.length})`} collapsible={false} class="dz-layers"><div class="dz-layer-list">
    {!rows.length && <p class="hint">Place an image, add text or draw a rectangle.</p>}
    {rows.map((l) => { const Icon = l.type === 'text' ? Type : l.type === 'image' ? Image : Square; const missing = l.type === 'image' && imageMissing(l); return <div key={l.id} class={`dz-layer${ids.includes(l.id) ? ' active' : ''}${l.hidden ? ' dz-hidden' : ''}`} draggable={renaming !== l.id} onDragStart={(e) => { e.dataTransfer.setData('application/x-reccut-layer', l.id); setDragged(l.id); }} onDragEnd={() => setDragged(null)} onDragOver={(e) => { if (dragged) e.preventDefault(); }} onDrop={(e) => { if (!dragged || dragged === l.id) return; e.preventDefault(); e.stopPropagation(); changeDesign((d) => { const from = d.layers.findIndex((r) => r.id === dragged), to = d.layers.findIndex((r) => r.id === l.id); const [item] = d.layers.splice(from, 1); d.layers.splice(to, 0, item); }); setDragged(null); }} onClick={(e) => select(e, l)} onContextMenu={(e) => context(e, l)}>
      <Icon size={14} />
      {renaming === l.id ? <input class="text-input" autoFocus value={name} onClick={(e) => e.stopPropagation()} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => { if (name.trim()) patch(l.id, { name: name.trim() }); setRenaming(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} /> : <span class="dz-layer-name" onDblClick={() => { setRenaming(l.id); setName(l.name); }}>{l.name}</span>}
      {missing && <IconButton icon={TriangleAlert} title="Missing image. Locate file" onClick={(e) => { e.stopPropagation(); locateImage(l); }} />}
      <IconButton icon={l.hidden ? EyeOff : Eye} title={l.hidden ? 'Show layer' : 'Hide layer'} onClick={(e) => { e.stopPropagation(); patch(l.id, { hidden: !l.hidden }); }} />
      <IconButton icon={l.locked ? Lock : Unlock} title={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => { e.stopPropagation(); patch(l.id, { locked: !l.locked }); }} />
    </div>; })}
  </div></Section>;
}
