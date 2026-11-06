import { fontAvailable, fontVersion } from './fonts.js';
import { memo } from 'preact/compat';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { Eye, EyeOff, Lock, Unlock, Image, Type, Square, TriangleAlert, Link, ChevronDown, ChevronRight, Folder, CornerDownRight } from 'lucide-preact';
import { Section, IconButton, toast } from '../ui.jsx';
import { project } from '../editor/store.js';
import { currentDesign, selection, selectLayer, groupSelection, changeDesign, duplicateSelection, deleteSelection, orderSelection } from './store.js';
import { drawDesign } from '../../shared/designRender.js';
import { imageMissing, imageVersion, getImage, locateImage } from './assets.js';
import { effectMargin, groupSelectionIds } from '../../shared/design.js';
import { designLayerBlocks, layerInsertionIndex, reorderDesignBlock } from '../../shared/designLayerOrder.js';

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
const LayerRow = memo(function LayerRow({ layer: l, active, indented, onSelect, onBeginDrag, missing, linked }) {
  const [renaming, setRenaming] = useState(false), [name, setName] = useState('');
  const Icon = l.type === 'text' ? Type : l.type === 'image' ? Image : Square;
  const live = () => currentDesign.value?.layers.find((r) => r.id === l.id);
  return <div class={`dz-layer${indented || l.clip ? ' dz-group-member' : ''}${active ? ' active' : ''}${l.hidden ? ' dz-hidden' : ''}`} draggable={!renaming}
    onDragStart={(e) => onBeginDrag(e, l.id)} onClick={(e) => onSelect(e, l.id)} onContextMenu={(e) => layerContext(e, l.id)}>
    {l.clip && <CornerDownRight size={12} aria-label="Clipped to layer below" />}<LayerPreview layer={l} /><Icon size={12} />
    {l.type === 'text' && !fontAvailable(l.font) && <span title={`Font not installed: ${l.font}`} aria-label={`Font not installed: ${l.font}`}><TriangleAlert size={12} /></span>}
    {linked && <Link size={11} aria-label="Linked image" />}
    {renaming ? <input class="text-input" autoFocus value={name} onClick={(e) => e.stopPropagation()} onInput={(e) => setName(e.currentTarget.value)} onBlur={() => { if (name.trim()) patchLayer(l.id, { name: name.trim() }); setRenaming(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false); }} /> : <span class="dz-layer-name" onDblClick={(e) => { e.stopPropagation(); selectLayer(l.id, { single: true }); setRenaming(true); setName(l.name); }}>{l.name}</span>}
    {missing && <IconButton icon={TriangleAlert} title="Missing linked image. Relink file" onClick={(e) => { e.stopPropagation(); locateImage(live()); }} />}
    <IconButton icon={l.hidden ? EyeOff : Eye} title={l.hidden ? 'Show layer' : 'Hide layer'} onClick={(e) => { e.stopPropagation(); const l = live(); if (l) patchLayer(l.id, { hidden: !l.hidden }); }} />
    <IconButton icon={l.locked ? Lock : Unlock} title={l.locked ? 'Unlock layer' : 'Lock layer'} onClick={(e) => { e.stopPropagation(); const l = live(); if (l) patchLayer(l.id, { locked: !l.locked }); }} />
  </div>;
}, (a,b) => a.active === b.active && a.indented === b.indented && a.version === b.version && a.missing === b.missing && a.linked === b.linked && a.onSelect === b.onSelect && a.onBeginDrag === b.onBeginDrag && (a.layer === b.layer || Object.keys(a.layer).length === Object.keys(b.layer).length && Object.keys(a.layer).every((k) => ['x','y','rotation'].includes(k) || a.layer[k] === b.layer[k])));

export function LayersPanel() {
  const d = currentDesign.value, ids = selection.value, version = `${imageVersion.value}:${fontVersion.value}`;
  const anchor = useRef(null), host = useRef(null), list = useRef(null), drag = useRef(null), scrollFrame = useRef(0);
  const [collapsed, setCollapsed] = useState(new Set()), [renaming, setRenaming] = useState(null), [name, setName] = useState('');
  const [placement, setPlacement] = useState(null);
  const stopScroll = useCallback(() => { cancelAnimationFrame(scrollFrame.current); scrollFrame.current = 0; }, []);
  const cancelDrag = useCallback(() => { stopScroll(); drag.current = null; setPlacement(null); list.current?.classList.remove('is-reordering'); }, []);
  useEffect(() => {
    const escape = e => { if (drag.current && e.key === 'Escape') { e.stopPropagation(); cancelDrag(); } };
    window.addEventListener('dragend', cancelDrag);
    window.addEventListener('drop', cancelDrag);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancelDrag);
    return () => {
      stopScroll(); drag.current = null;
      window.removeEventListener('dragend', cancelDrag); window.removeEventListener('drop', cancelDrag);
      window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', cancelDrag);
    };
  }, []);
  useEffect(() => { if (drag.current && drag.current.base !== d) cancelDrag(); }, [d]);
  const onBeginDrag = useCallback((e, id) => {
    const base = currentDesign.value, blocks = designLayerBlocks(base.layers), source = blocks.find(b => b.layers.some(l => l.id === id));
    if (!source || source.layers.some(l => l.locked)) { e.preventDefault(); toast('Unlock the layer or group before changing its order.'); return; }
    e.stopPropagation();
    e.dataTransfer.setData('application/x-reccut-layer', id); e.dataTransfer.effectAllowed = 'move';
    // Materialize off-screen row heights once. Keep the DOM order fixed during the
    // native drag so moving a group never removes the browser's drag source.
    list.current.classList.add('is-reordering');
    const heights = new Map([...list.current.children].filter(el => el.dataset.layerBlock).map(el => [el.dataset.layerBlock, el.getBoundingClientRect().height]));
    const index = blocks.indexOf(source);
    drag.current = { base, blocks, source, heights, index, inside: true, y: e.clientY };
    setPlacement({ source: source.id, index });
  }, []);
  const placeAt = y => {
    const active = drag.current;
    if (!active || active.base !== currentDesign.value) { cancelDrag(); return; }
    const index = layerInsertionIndex(active.blocks, active.source.id, active.heights, y - list.current.getBoundingClientRect().top);
    active.index = index;
    setPlacement(previous => previous?.index === index && previous.source === active.source.id ? previous : { source: active.source.id, index });
  };
  const scroll = () => {
    scrollFrame.current = 0;
    const active = drag.current;
    if (!active?.inside || !host.current) return;
    const box = host.current.getBoundingClientRect(), distance = active.y < box.top + 32 ? active.y - box.top - 32 : active.y > box.bottom - 32 ? active.y - box.bottom + 32 : 0;
    if (!distance) return;
    const before = host.current.scrollTop;
    host.current.scrollTop += Math.sign(distance) * Math.min(12, Math.max(1, Math.abs(distance) / 3));
    if (host.current.scrollTop !== before) { placeAt(active.y); scrollFrame.current = requestAnimationFrame(scroll); }
  };
  const onDragOver = e => {
    if (!drag.current || !Array.from(e.dataTransfer.types).includes('application/x-reccut-layer')) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move';
    drag.current.inside = true; drag.current.y = e.clientY; placeAt(e.clientY);
    if (!scrollFrame.current) scrollFrame.current = requestAnimationFrame(scroll);
  };
  const onDrop = e => {
    const active = drag.current;
    if (!active || active.base !== currentDesign.value || !e.dataTransfer.getData('application/x-reccut-layer')) { cancelDrag(); return; }
    e.preventDefault(); e.stopPropagation();
    const next = reorderDesignBlock(active.base.layers, active.source.id, active.index);
    cancelDrag();
    if (next !== active.base.layers) changeDesign(design => { design.layers = next; });
  };
  const onSelect = useCallback((e, id) => {
    const rows = [...currentDesign.value.layers].reverse();
    if (e.shiftKey && anchor.current && rows.some((l) => l.id === anchor.current)) {
      const a = rows.findIndex((l) => l.id === anchor.current), b = rows.findIndex((l) => l.id === id);
      selection.value = groupSelectionIds(currentDesign.value.layers, rows.slice(Math.min(a,b),Math.max(a,b)+1).map((l) => l.id));
    } else selectLayer(id, { toggle: e.metaKey || e.ctrlKey, single: e.altKey });
    anchor.current = id;
  }, []);
  if (!d) return null;
  const blocks = designLayerBlocks(d.layers), active = placement && drag.current?.base === d ? drag.current : null, offsets = new Map();
  let gapTop = 0;
  if (active) {
    const ordered = blocks.filter(b => b.id !== active.source.id); ordered.splice(placement.index, 0, active.source);
    let top = 0; for (const block of ordered) { offsets.set(block.id, top); top += active.heights.get(block.id); }
    gapTop = offsets.get(active.source.id);
    let original = 0; for (const block of blocks) { const height = active.heights.get(block.id); offsets.set(block.id, offsets.get(block.id) - original); original += height; }
  }
  return <div ref={host} class="dz-layers" onDragEnter={onDragOver} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={cancelDrag} onDragLeave={e => {
    const box = e.currentTarget.getBoundingClientRect();
    if (drag.current && (e.clientX < box.left || e.clientX >= box.right || e.clientY < box.top || e.clientY >= box.bottom)) { drag.current.inside = false; stopScroll(); setPlacement(null); }
  }}><Section title={`Layers (${d.layers.length})`} collapsible={false}><div ref={list} class={`dz-layer-list${active ? ' is-reordering' : ''}`}>
    {!blocks.length && <p class="hint">Place an image, add text or draw a shape.</p>}
    {blocks.map(block => {
      const members = block.layers, l = members[0], groupName = members.find(r => r.groupName)?.groupName || 'Group';
      return <div key={block.id} data-layer-block={block.id} class={`dz-layer-block${active?.source.id === block.id ? ' drag-source' : ''}`} style={active ? { transform: `translateY(${offsets.get(block.id)}px)` } : undefined}>
        {l.group && <div class={`dz-layer dz-group${members.every((r) => ids.includes(r.id)) ? ' active' : ''}`} draggable={renaming !== l.group} onDragStart={(e) => onBeginDrag(e, l.id)} onContextMenu={(e) => layerContext(e, l.id)} onClick={(e) => selectLayer(l.id, { toggle: e.metaKey || e.ctrlKey })}>
          <IconButton icon={collapsed.has(l.group) ? ChevronRight : ChevronDown} title={collapsed.has(l.group) ? 'Expand group' : 'Collapse group'} onClick={(e) => { e.stopPropagation(); const next = new Set(collapsed); next.has(l.group) ? next.delete(l.group) : next.add(l.group); setCollapsed(next); }} /><Folder size={14} />
          {renaming === l.group ? <input class="text-input" autoFocus value={name} onInput={(e) => setName(e.currentTarget.value)} onClick={(e) => e.stopPropagation()} onBlur={() => { if (name.trim()) changeDesign((d) => { const member = d.layers.find((r) => r.group === l.group); if (member) member.groupName = name.trim(); }); setRenaming(null); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} /> : <span class="dz-layer-name" onDblClick={() => { setRenaming(l.group); setName(groupName); }}>{groupName}</span>}
        </div>}
        {(!l.group || !collapsed.has(l.group)) && members.map(layer => <LayerRow key={layer.id} layer={layer} active={ids.includes(layer.id)} indented={Boolean(layer.group)} version={version} missing={layer.type === 'image' && imageMissing(layer)} linked={layer.type === 'image' && Boolean(layer.media || project.value.designAssets?.[layer.asset]?.copied === false)} onSelect={onSelect} onBeginDrag={onBeginDrag} />)}
      </div>;
    })}
    {active && <div class="dz-layer-insertion" aria-hidden="true" style={{ top: gapTop, height: active.heights.get(active.source.id) }}>
      {active.source.layers.length > 1 ? `${active.source.layers.length} layers` : active.source.layers[0].name}
    </div>}
  </div></Section></div>;
}
