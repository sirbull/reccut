import {credits} from '../../shared/stockSources.cjs';
import {project} from '../editor/store.js';
import {toast} from '../ui.jsx';
import { useEffect, useState } from 'preact/hooks';
import { FolderOpen } from 'lucide-preact';
import { FRAME_FORMATS } from '../../shared/frameExport.js';
import { DESIGN_SIZES } from '../../shared/design.js';
import { defaultExportDir } from '../editor/ExportDialog.jsx';
import { saveDesignImage, designSaved } from './export.js';
import { currentDesign, exportDesignOpen } from './store.js';
import { Button, Modal, Row, Select, Slider, Toggle, NumberField } from '../ui.jsx';

export function ExportDesignDialog() {
  const d = currentDesign.value;
  const [format, setFormat] = useState('jpeg'), [quality, setQuality] = useState(0.92), [transparent, setTransparent] = useState(!d?.background);
  const [width, setWidth] = useState(d?.width || 1280), [name, setName] = useState(d?.name || 'Design'), [dir, setDir] = useState('');
  const [scaleMode, setScaleMode] = useState('1');
  const [limit, setLimit] = useState((DESIGN_SIZES.find((s) => s.id === d?.size)?.maxBytes || 0) / 1e6), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const height = d ? Math.max(1, Math.round(width * d.height / d.width)) : 1;
  const close = () => { if (!busy) exportDesignOpen.value = false; };
  useEffect(() => { let alive = true; defaultExportDir().then((v) => { if (alive) setDir(v); }).catch((err) => { if (alive) setError(err.message); }); return () => { alive = false; }; }, []);
  if (!d) return null;
  const fmt = FRAME_FORMATS.find((f) => f.id === format);
  const valid = Number.isInteger(width) && width >= 1 && height >= 1 && width <= 8192 && height <= 8192 && Boolean(dir);
  const run = async () => {
    if (busy || !valid) return;
    setBusy(true); setError('');
    try {
      const path = await saveDesignImage(d, { format, quality, transparent, width, limit, name, dir });
      exportDesignOpen.value = false;
      designSaved(path);
    } catch (err) { setError(/EACCES|EPERM|EROFS/.test(err.message) ? 'This folder is read only. Choose another folder.' : /ENOSPC/.test(err.message) ? 'There is not enough free space to save this image.' : err.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Export As" width={480} onClose={close} footer={<><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="primary" disabled={busy || !valid} onClick={run}>{busy ? 'Saving…' : 'Export'}</Button></>}>
    <Row label="Format"><Select value={format} options={FRAME_FORMATS.map((f) => ({ value: f.id, label: f.label }))} onChange={setFormat} /></Row>
    {format !== 'png' && <Row label="Quality"><Slider min={0.1} max={1} step={0.01} value={quality} onInput={setQuality} /><span>{Math.round(quality * 100)}%</span></Row>}
    {fmt.alpha && <Row label="Transparent background"><Toggle checked={transparent} onChange={setTransparent} /></Row>}
    <Row label="Scale"><Select value={scaleMode} options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: 'custom', label: 'Exact width' }]} onChange={(v) => { setScaleMode(v); if (v !== 'custom') setWidth(d.width * Number(v)); }} /></Row>
    <Row label="Width"><NumberField value={width} min={1} max={8192} width={90} onChange={(v) => { setWidth(Math.round(v)); setScaleMode('custom'); }} /><span>× {height} px</span></Row>
    {(width > 8192 || height > 8192) && <p class="warn">Export width and height must be at most 8192 pixels.</p>}
    <Row label="Keep under"><NumberField value={limit} min={0} max={1000} step={0.5} precision={1} unit="MB" width={95} onChange={setLimit} /><span class="hint">0 = no limit</span></Row>
    <Row label="File name" stacked><input class="text-input" value={name} onInput={(e) => setName(e.currentTarget.value)} /></Row>
    <Row label="Save to" stacked><Button icon={FolderOpen} disabled={busy} onClick={async () => { const path = await window.api.chooseDir(dir); if (path) setDir(path); }}>{dir || 'Choose folder…'}</Button></Row>
    <Button onClick={async()=>{const sources=[...new Set(d.layers.filter(l=>!l.hidden).map(l=>l.asset))].map(id=>project.value.designAssets[id]?.source).filter(Boolean);const text=credits(sources);if(text){await window.api.writeDesignClipboard(text);toast('Credits copied.')}else toast('This design has no third-party image credits.')}}>Copy Credits</Button>
    {error && <p class="warn" role="alert">{error}</p>}
  </Modal>;
}
