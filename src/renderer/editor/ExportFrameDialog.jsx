import { useState } from 'preact/hooks';
import { FolderOpen } from 'lucide-preact';
import { formatTimecode } from '../../shared/model.js';
import { FRAME_FORMATS, frameExportSettings } from '../../shared/frameExport.js';
import { frameExportOpen } from './commands.js';
import { defaultExportDir, startExport } from './ExportDialog.jsx';
import { Button, Modal, Row, Select, toast } from '../ui.jsx';

const api = window.api;

export function ExportFrameDialog({ request }) {
  const { project: p, time } = request;
  const [width, setWidth] = useState(String(p.width));
  const [height, setHeight] = useState(String(p.height));
  const [linked, setLinked] = useState(true);
  const [format, setFormat] = useState('png');
  const [alpha, setAlpha] = useState(false);
  const [dir, setDir] = useState(null);
  const [busy, setBusy] = useState(false);
  const fmt = FRAME_FORMATS.find((f) => f.id === format);
  let frame, error;
  try {
    frame = frameExportSettings(p, { time, width: Number(width), height: Number(height), format, alpha });
  } catch (e) {
    error = e.message;
  }
  const timestamp = formatTimecode(frame?.time ?? time, p.fps);
  const [name, setName] = useState(`${p.name} - ${timestamp.replace(/:/g, '-')}`);
  const close = () => { if (!busy) frameExportOpen.value = null; };

  const resize = (axis, value) => {
    if (axis === 'width') setWidth(value);
    else setHeight(value);
    if (linked && Number(value) > 0) {
      if (axis === 'width') setHeight(String(Math.max(1, Math.round(Number(value) * p.height / p.width))));
      else setWidth(String(Math.max(1, Math.round(Number(value) * p.width / p.height))));
    }
  };

  const doExport = async () => {
    if (!frame || busy) return;
    setBusy(true);
    try {
      const folder = dir || await defaultExportDir();
      const sep = api.platform === 'win32' ? '\\' : '/';
      const safe = (name.trim() || p.name).replace(/[\\/:*?"<>|]/g, '_');
      const output = await api.saveFileDialog({
        title: 'Export Frame',
        defaultPath: `${folder}${sep}${safe}.${fmt.ext}`,
        filters: [{ name: fmt.label, extensions: fmt.id === 'jpeg' ? ['jpg', 'jpeg'] : [fmt.ext] }],
      });
      if (!output) return;
      // Keep the selected encoding and filename extension in agreement on every platform.
      const matchingExtension = fmt.id === 'jpeg' ? /\.jpe?g$/i : new RegExp(`\\.${fmt.ext}$`, 'i');
      const file = matchingExtension.test(output) ? output : output.replace(/\.(png|jpe?g|webp)$/i, '') + `.${fmt.ext}`;
      await startExport(p, { frame, output: file, sourceMedia: 'original' });
      frameExportOpen.value = null;
      toast('Exporting the frame in the background. You will be notified when it is ready.');
    } catch (e) {
      toast(`Could not export the frame: ${e.message}`, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Export Frame" width={560} onClose={busy ? undefined : close} class="frame-export-modal" footer={
      <>
        <Button onClick={close} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={doExport} disabled={busy || !frame}>{busy ? 'Preparing…' : 'Export Frame…'}</Button>
      </>
    }>
      <div class="frame-export-form">
        <p class="hint">Timeline frame at {timestamp}. Includes visible layers, titles, captions, masks and effects.</p>
        <Row label="File name">
          <div class="name-row">
            <input class="text-input" aria-label="File name" value={name} disabled={busy} onInput={(e) => setName(e.currentTarget.value)} />
            <span class="ext">.{fmt.ext}</span>
          </div>
        </Row>
        <Row label="Format">
          <Select value={format} onChange={setFormat} disabled={busy} options={FRAME_FORMATS.map((f) => ({ value: f.id, label: f.label }))} />
        </Row>
        <Row label="Resolution">
          <div class="frame-export-size">
            <input class="text-input" type="number" aria-label="Width in pixels" min="1" max="8192" step="1" value={width} disabled={busy} onInput={(e) => resize('width', e.currentTarget.value)} />
            <span>×</span>
            <input class="text-input" type="number" aria-label="Height in pixels" min="1" max="8192" step="1" value={height} disabled={busy} onInput={(e) => resize('height', e.currentTarget.value)} />
            <span>px</span>
          </div>
        </Row>
        <Row>
          <label><input type="checkbox" checked={linked} disabled={busy} onChange={(e) => {
            const on = e.currentTarget.checked;
            setLinked(on);
            if (on && Number(width) > 0) setHeight(String(Math.max(1, Math.round(Number(width) * p.height / p.width))));
          }} /> Keep sequence aspect ratio</label>
        </Row>
        <Row label="Transparency">
          <label><input type="checkbox" checked={alpha && fmt.alpha} disabled={busy || !fmt.alpha} onChange={(e) => setAlpha(e.currentTarget.checked)} /> Include alpha channel</label>
        </Row>
        <p class="hint">{fmt.alpha
          ? 'Alpha preserves transparent areas from masks, cropping and chroma key. Visible layers underneath are included. With alpha off, empty areas are black.'
          : 'JPEG does not support alpha. Choose PNG or WebP to keep transparency. Empty areas are black.'}</p>
        <Row label="Save to">
          <button class="path-btn" disabled={busy} onClick={async () => {
            try {
              const folder = await api.chooseDir(dir || await defaultExportDir());
              if (folder) setDir(folder);
            } catch (e) { toast(e.message, { kind: 'error' }); }
          }}><FolderOpen size={14} /><span>{dir || 'Project export folder'}</span></button>
        </Row>
        <p class="hint">Choose the final file name and location when you click Export Frame. A different aspect ratio fits the picture inside the chosen size.</p>
        {error && <p class="hint" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
