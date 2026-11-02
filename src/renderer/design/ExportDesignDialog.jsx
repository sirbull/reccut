import { useEffect, useState } from 'preact/hooks';
import { FolderOpen } from 'lucide-preact';
import { FRAME_FORMATS } from '../../shared/frameExport.js';
import { DESIGN_SIZES } from '../../shared/design.js';
import { designFileName, fitToSize } from '../../shared/designExport.js';
import { drawDesign } from '../../shared/designRender.js';
import { project } from '../editor/store.js';
import { defaultExportDir } from '../editor/ExportDialog.jsx';
import { ensureImage, imagePath } from './assets.js';
import { currentDesign, exportDesignOpen } from './store.js';
import { Button, Modal, Row, Select, Slider, Toggle, NumberField, toast } from '../ui.jsx';

export function ExportDesignDialog() {
  const d = currentDesign.value;
  const [format, setFormat] = useState('jpeg'), [quality, setQuality] = useState(0.92), [transparent, setTransparent] = useState(false);
  const [width, setWidth] = useState(d?.width || 1280), [name, setName] = useState(d?.name || 'Design'), [dir, setDir] = useState('');
  const [limit, setLimit] = useState(DESIGN_SIZES.find((s) => s.id === d?.size)?.maxBytes ? 2 : 0), [busy, setBusy] = useState(false), [error, setError] = useState('');
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
      const snapshot = d, p = project.value;
      const loaded = new Map();
      await Promise.all(snapshot.layers.filter((l) => l.type === 'image' && !l.hidden).map(async (l) => {
        const img = await ensureImage(imagePath(l, p));
        if (!img) throw new Error(`Locate the missing image "${l.name}" before exporting.`);
        loaded.set(l.id, img);
      }));
      await document.fonts.ready;
      const cv = new OffscreenCanvas(width, height), ctx = cv.getContext('2d');
      const alpha = fmt.alpha && transparent;
      if (!alpha) { ctx.fillStyle = snapshot.background?.color || '#ffffff'; ctx.fillRect(0, 0, width, height); }
      drawDesign(ctx, snapshot, (l) => loaded.get(l.id), { scale: width / snapshot.width, transparent: alpha });
      const encode = (q) => cv.convertToBlob({ type: fmt.mime, quality: q });
      let blob;
      if (limit > 0 && format !== 'png') {
        const result = await fitToSize(encode, Math.round(limit * 1e6), { max: quality, min: Math.min(0.4, quality) });
        if (result.over) throw new Error('This image exceeds the size limit. Reduce its width or increase the limit.');
        blob = result.data;
      } else blob = await encode(quality);
      if (limit > 0 && blob.size > limit * 1e6) throw new Error('This PNG exceeds the size limit. Choose JPEG or reduce its width.');
      const path = await window.api.writeDesignImage(`${dir}${window.api.platform === 'win32' ? '\\' : '/'}${designFileName(name)}.${fmt.ext}`, new Uint8Array(await blob.arrayBuffer()));
      exportDesignOpen.value = false;
      toast(`Design saved: ${path.split(/[\\/]/).pop()}`, { kind: 'success', actions: [{ label: 'Reveal', onClick: () => window.api.reveal(path) }, { label: 'Open', onClick: () => window.api.openPath(path) }] });
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <Modal title="Export Design" width={480} onClose={close} footer={<><Button disabled={busy} onClick={close}>Cancel</Button><Button variant="primary" disabled={busy || !valid} onClick={run}>{busy ? 'Saving…' : 'Export Design'}</Button></>}>
    <Row label="Format"><Select value={format} options={FRAME_FORMATS.map((f) => ({ value: f.id, label: f.label }))} onChange={setFormat} /></Row>
    {format !== 'png' && <Row label="Quality"><Slider min={0.1} max={1} step={0.01} value={quality} onInput={setQuality} /><span>{Math.round(quality * 100)}%</span></Row>}
    {fmt.alpha && <Row label="Transparent background"><Toggle checked={transparent} onChange={setTransparent} /></Row>}
    <Row label="Scale"><Select value={String(width === d.width ? 1 : width === d.width * 2 ? 2 : 'custom')} options={[{ value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: 'custom', label: 'Exact width' }]} onChange={(v) => setWidth(v === 'custom' ? Math.max(1, d.width - 1) : d.width * Number(v))} /></Row>
    <Row label="Width"><NumberField value={width} min={1} max={8192} width={90} onChange={(v) => setWidth(Math.round(v))} /><span>× {height} px</span></Row>
    {height > 8192 && <p class="warn">The exported height must be at most 8192 pixels.</p>}
    <Row label="Keep under"><NumberField value={limit} min={0} max={1000} step={0.5} precision={1} unit="MB" width={95} onChange={setLimit} /><span class="hint">0 = no limit</span></Row>
    <Row label="File name" stacked><input class="text-input" value={name} onInput={(e) => setName(e.currentTarget.value)} /></Row>
    <Row label="Save to" stacked><Button icon={FolderOpen} disabled={busy} onClick={async () => { const path = await window.api.chooseDir(dir); if (path) setDir(path); }}>{dir || 'Choose folder…'}</Button></Row>
    {error && <p class="warn" role="alert">{error}</p>}
  </Modal>;
}
