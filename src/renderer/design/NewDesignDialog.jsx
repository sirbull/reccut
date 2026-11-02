import { useState } from 'preact/hooks';
import { ArrowLeftRight, Link, Unlink } from 'lucide-preact';
import { DESIGN_SIZES, validDesignSize, resizeDesign } from '../../shared/design.js';
import { project } from '../editor/store.js';
import { Button, IconButton, Modal, NumberField, Row } from '../ui.jsx';
import { addDesign, designCommit, newDesignOpen } from './store.js';

export function NewDesignDialog({ design = null }) {
  const [preset, setPreset] = useState(design?.size || 'youtube');
  const [name, setName] = useState(design?.name || `${project.value.name} Thumbnail`);
  const [width, setWidth] = useState(design?.width || 1280), [height, setHeight] = useState(design?.height || 720);
  const [locked, setLocked] = useState(false);
  const valid = validDesignSize(width, height) && Boolean(name.trim());
  const close = () => (newDesignOpen.value = false);
  const choose = (size) => { setPreset(size.id); setWidth(size.width); setHeight(size.height); };
  const create = () => {
    if (!valid) return;
    if (design) designCommit((p) => { if (p.designs[design.id]) p.designs[design.id] = { ...resizeDesign(p.designs[design.id], width, height), size: preset, name: name.trim() }; });
    else addDesign({ name: name.trim(), width, height, size: preset });
    close();
  };
  return <Modal title={design ? 'Canvas Size' : 'New Design'} width={670} onClose={close} footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" disabled={!valid} onClick={create}>{design ? 'Apply' : 'Create Design'}</Button></>}>
    <Row label="Name" stacked><input class="text-input" value={name} onInput={(e) => setName(e.currentTarget.value)} /></Row>
    {['Video', 'Social', 'Other'].map((group) => <div key={group}><h3>{group}</h3><div class="dz-size-grid">{DESIGN_SIZES.filter((s) => s.group === group).map((s) => <button key={s.id} class={`dz-size-card${preset === s.id ? ' active' : ''}`} onClick={() => choose(s)}><span class="dz-aspect" style={{ width: 32 * Math.min(1, s.width / s.height), height: 32 * Math.min(1, s.height / s.width) }} /><span><b>{s.label}</b><small>{s.width} × {s.height}</small></span></button>)}</div></div>)}
    <div class="dz-size-grid"><Button onClick={() => choose({ id: 'sequence', width: project.value.width, height: project.value.height })}>Same as Sequence</Button><Button onClick={() => setPreset('custom')}>Custom</Button></div>
    <Row label="Pixels"><NumberField value={width} min={1} max={8192} width={85} onChange={(v) => { const w = Math.round(v); if (locked) setHeight(Math.round(height * w / width)); setWidth(w); setPreset('custom'); }} /><IconButton icon={locked ? Link : Unlink} title="Lock aspect ratio" active={locked} onClick={() => setLocked(!locked)} /><NumberField value={height} min={1} max={8192} width={85} onChange={(v) => { const h = Math.round(v); if (locked) setWidth(Math.round(width * h / height)); setHeight(h); setPreset('custom'); }} /><IconButton icon={ArrowLeftRight} title="Swap width and height" onClick={() => { setWidth(height); setHeight(width); setPreset('custom'); }} /></Row>
    {!valid && <p class="warn" role="alert">Enter a name and whole pixel sizes from 1 to 8192.</p>}
    <p class="hint">Sizes are starting points. Check the destination service before uploading.{design ? ' Resizing keeps layers around the canvas center.' : ''}</p>
  </Modal>;
}
