import { fontAvailable, fontVersion } from './fonts.js';
import { memo } from 'preact/compat';
import { Fragment } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { Eye, EyeOff, Lock, Unlock, Image, Type, Square, TriangleAlert, Link, ChevronDown, ChevronRight, Folder, CornerDownRight } from 'lucide-preact';
import { Section, IconButton, toast } from '../ui.jsx';
import { project } from '../editor/store.js';
import { currentDesign, selection, selectLayer, groupSelection, changeDesign, duplicateSelection, deleteSelection, orderSelection } from './store.js';
import { drawDesign } from '../../shared/designRender.js';
import { imageMissing, imageVersion, getImage, locateImage } from './assets.js';
import { effectMargin, groupSelectionIds } from '../../shared/design.js';

function LayerPreview({ layer }) {
  const ref = useRef(null), version = `${imageVersion.value}:${fontVersion.value}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const ctx = ref.current?.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 30, 24);
      const margin = effectMargin(layer), w = layer.w + margin * 2, h = layer.h + margin * 2;
      const scale = Math.min(30 / w, 24 / h);
      ctx.save(); ctx.translate((30 - w * scale) / 2, (24 - h * scale) / 2);
      drawDesign(ctx, { width: w, height: h, background: null, layers: [{ ...layer, x: margin, y: margin, rotation: 0, hidden: false }] }, getImage, { scale, fontAvailable, cacheLayers: false });
      ctx.restore();
    });
    return () => cancelAnimationFrame(frame);
  }, [layer, version]);
  return <canvas class="dz-layer-preview" ref={ref} width={30} height={24} />;
}

function patchLayer(id, props) { changeDesign((d) => { const l = d.layers.find((l) => l.id === id); if (l) Object.assign(l, props); }); }
function beginLayerDrag(e, id) {
  const d = currentDesign.value, moving = new Set(groupSelectionIds(d.layers, [id]));
  if (d.layers.some((l) => moving.has(l.id) && l.locked)) { e.preventDefault(); toast('Unlock the group before changing its order.'); return; }
  e.dataTransfer.setData('application/x-reccut-layer', id);
}
function dropLayer(e, id) {
  const dragged = e.dataTransfer.getData('application/x-reccut-layer');
  if (!dragged || dragged === id) return;
  e.preventDefault(); e.stopPropagation();
  changeDesign((d) => {
    const target = d.layers.find((l) => l.id === id), moving = new Set(groupSelectionIds(d.layers, [dragged]));
    if (!target || moving.has(id) || d.layers.some((l) => moving.has(l.id) && l.locked)) return;
    const block = d.layers.filter((l) => moving.has(l.id)), rest = d.layers.filter((l) => !moving.has(l.id));
    const index = rest.findIndex((l) => target.group ? l.group === target.group : l.id === id);
    rest.splice(index, 0, ...block); d.layers = rest;
  });
}
async function layerContext(e, id) {
  e.preventDefault(); const l = currentDesign.value.layers.find((l) => l.id === id); if (!l) return;
  if (!selection.value.includes(id)) selectLayer(id);
  const action = await window.api.popupMenu([{ id: 'group', label: 'Group Layers' }, { id: 'ungroup', label: 'Ungroup Layers', enabled: Boolean(l.group) }, { id: 'duplicate', label: 'Duplicate' }, { id: 'delete', label: 'Delete' }, { id: 'front', label: 'Bring to Front' }, { id: 'back', label: 'Send to Back' }, { id: 'hidden', label: l.hidden ? 'Show' : 'Hide' }, { id: 'locked', label: l.locked ? 'Unlock' : 'Lock' }]);
  if (action === 'group' || action === 'ungroup') groupSelection(action === 'ungroup');
  else if (action === 'duplicate') duplicateSelection();
  else if (action === 'delete') deleteSelection();
  else if (action === 'front' || action === 'back') orderSelection(action);
  else if (action) { const live = currentDesign.value?.layers.find((l) => l.id === id); if (live) patchLayer(id, { [action]: !live[action] }); }
}
// Positions do not change a row or its local preview. Memoize rows so dragging
// one layer does not rebuild hundreds of SVG icons and event handlers per frame.
const LayerRow = memo(function LayerRow({ layer: l, active, indented, onSelect, missing, linked }) {
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const Icon = l.type === 'text' ? Type : l.type === 'image' ? Image : Square;
  const live = () => currentDesign.value?.layers.find((r) => r.id === l.id);
  return <div class={`dz-layer${indented || l.clip ? ' dz-group-member' : ''}${active ? ' active' : ''}${l.hidden ? ' dz-hidden' : ''}`} draggable={!renaming}
    onDragStart={(e) => beginLayerDrag(e, l.id)} onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('application/x-reccut-layer')) e.preventDefault(); }} onDrop={(e) => dropLayer(e, l.id)} onClick={(e) => onSelect(e, l.id)} onContextMenu={(e) => layerContext(e, l.id)}>
    {l.clip && <CornerDownRight size={12} aria-label="Clipped to layer below" />}<LayerPreview layer={l} /><Icon size={12} />
    {l.type === 'text' && !fontAvailable(l.font) && <span title={`Font not installed: ${l.font}`} aria-label={`Font not installed: ${l.font}`}><TriangleAlert size={12} /></span>}
    {linked && <Link size={11} aria-label="Linked image" />}
    {renaming ? <input class="text-input" autoFocus value={name} onClick={(e) => e.stopPropagation()} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => { if (name.trim()) patchLayer(l.id, { name: name.trim() }); setRenaming(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span class="dz-layer-name" onDblClick={(e) => { e.stopPropagation(); selectLayer(l.id, { single: true }); setRenaming(true); setName(l.name); }}>{l.name}</span>}
    {missing && <IconButton icon={TriangleAlert} title="Missing linked image. Relink file" onClick={(e) => { e.stopPropagation(); locateImage(live()); }} />}
    <IconButton icon={l.hidden ? EyeOff : Eye} title={l.hidden ? 'Show layer' : 'Hide layer'} onClick={(e) => { e.stopPropagation(); const l = live(); if (l) patchLayer(l.id, { hidden: !l.hidden }); }} />
    <IconButton icon={l.locked ? Lock : Unlock} title={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => { e.stopPropagation(); const l = live(); if (l) patchLayer(l.id, { locked: !l.locked }); }} />
  </div>;
}, (a,b) => a.active === b.active && a.indented === b.indented && a.version === b.version && a.missing === b.missing && a.linked === b.linked && a.onSelect === b.onSelect && (a.layer === b.layer || Object.keys(a.layer).length === Object.keys(b.layer).length && Object.keys(a.layer).every((k) => ['x','y','rotation'].includes(k) || a.layer[k] === b.layer[k])));

export function LayersPanel() {
  const d = currentDesign.value, ids = selection.value, version = `${imageVersion.value}:${fontVersion.value}`;
  const anchor = useRef(null);
  const [collapsed, setCollapsed] = useState(new Set()), [renaming, setRenaming] = useState(null), [name, setName] = useState('');
  const onSelect = useCallback((e, id) => {
    const rows = [...currentDesign.value.layers].reverse();
    if (e.shiftKey && anchor.current && rows.some((l) => l.id === anchor.current)) {
      const a = rows.findIndex((l) => l.id === anchor.current), b = rows.findIndex((l) => l.id === id);
      selection.value = groupSelectionIds(currentDesign.value.layers, rows.slice(Math.min(a,b),Math.max(a,b)+1).map((l) => l.id));
    } else selectLayer(id, { toggle: e.metaKey || e.ctrlKey, single: e.altKey });
    anchor.current = id;
  }, []);
  if (!d) return null;
  const rows = [...d.layers].reverse(), seen = new Set(), groups = new Map();
  for (const l of d.layers) if (l.group) { if (!groups.has(l.group)) groups.set(l.group, []); groups.get(l.group).push(l); }
  return <div class="dz-layers"><Section title={`Layers (${rows.length})`} collapsible={false}><div class="dz-layer-list">
    {!rows.length && <p class="hint">Place an image, add text or draw a shape.</p>}
    {rows.map((l) => {
      const first = l.group && !seen.has(l.group); if (l.group) seen.add(l.group);
      const members = groups.get(l.group) || [], groupName = members.find((r) => r.groupName)?.groupName || 'Group';
      return <Fragment key={l.id}>
        {first && <div class={`dz-layer dz-group${members.every((r) => ids.includes(r.id)) ? ' active' : ''}`} draggable onDragStart={(e) => beginLayerDrag(e, l.id)} onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes('application/x-reccut-layer')) e.preventDefault(); }} onDrop={(e) => dropLayer(e, l.id)} onContextMenu={(e) => layerContext(e, l.id)} onClick={(e) => selectLayer(l.id, { toggle: e.metaKey || e.ctrlKey })}>
          <IconButton icon={collapsed.has(l.group) ? ChevronRight : ChevronDown} title={collapsed.has(l.group) ? 'Expand group' : 'Collapse group'} onClick={(e) => { e.stopPropagation(); const next = new Set(collapsed); next.has(l.group) ? next.delete(l.group) : next.add(l.group); setCollapsed(next); }} /><Folder size={14} />
          {renaming === l.group ? <input class="text-input" autoFocus value={name} onInput={(e) => setName(e.currentTarget.value)} onClick={(e) => e.stopPropagation()} onBlur={() => { if (name.trim()) changeDesign((d) => { const member = d.layers.find((r) => r.group === l.group); if (member) member.groupName = name.trim(); }); setRenaming(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} /> : <span class="dz-layer-name" onDblClick={() => { setRenaming(l.group); setName(groupName); }}>{groupName}</span>}
        </div>}
        {(!l.group || !collapsed.has(l.group)) && <LayerRow layer={l} active={ids.includes(l.id)} indented={Boolean(l.group)} version={version} missing={l.type === 'image' && imageMissing(l)} linked={l.type === 'image' && Boolean(l.media || project.value.designAssets?.[l.asset]?.copied === false)} onSelect={onSelect} />}
      </Fragment>;
    })}
  </div></Section></div>;
}
