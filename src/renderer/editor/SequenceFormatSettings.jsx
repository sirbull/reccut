// Felles formatvelger for nye sekvenser, sekvensinnstillinger og inspektøren.
import { useEffect, useState } from 'preact/hooks';
import { FRAME_RATES } from '../../shared/model.js';
import { NumberField, Row, Select } from '../ui.jsx';

export const FORMATS = [
  { value: '7680x4320', label: '8K UHD (7680 × 4320)' },
  { value: '3840x2160', label: '4K UHD (3840 × 2160)' },
  { value: '2560x1440', label: '1440p (2560 × 1440)' },
  { value: '1920x1080', label: '1080p HD (1920 × 1080)' },
  { value: '1280x720', label: '720p HD (1280 × 720)' },
  { value: '1080x1920', label: 'Vertical (1080 × 1920)' },
  { value: '1080x1350', label: 'Portrait 4:5 (1080 × 1350)' },
  { value: '1080x1080', label: 'Square (1080 × 1080)' },
];

export function SequenceFormatSettings({ settings: p, onChange, onStart, onPreview = onChange, onCommit }) {
  const [display, setDisplay] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () => window.api.currentDisplay().then((d) => { if (active) setDisplay(d); }).catch(() => {});
    refresh();
    const unsubscribe = window.api.onDisplaysChanged(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  const current = `${p.width}x${p.height}`;
  const fmt = !p.customFormat && FORMATS.some((f) => f.value === current) ? current
    : !p.customFormat && display && p.width === display.width && p.height === display.height ? 'screen' : 'custom';
  const fpsList = FRAME_RATES;
  return (
    <>
      <Row label="Format" stacked>
        <Select
          value={fmt}
          options={[...FORMATS, ...(display ? [{ value: 'screen', label: `Current Display (${display.width} × ${display.height})` }] : []), { value: 'custom', label: fmt === 'custom' ? `Custom (${p.width} × ${p.height})` : 'Custom size' }]}
          onChange={(v) => {
            const [w, h] = v === 'custom' ? [p.width, p.height] : v === 'screen' ? [display.width, display.height] : v.split('x').map(Number);
            onChange((q) => {
              q.width = w;
              q.height = h;
              q.autoFormat = false;
              if (v === 'custom') q.customFormat = true;
              else delete q.customFormat;
            });
          }}
        />
      </Row>
      {fmt === 'custom' && (
        <div class="wh-row">
          <NumberField value={p.width} min={16} max={8192} step={2} unit="W" width={84} onStart={onStart} onChange={(v) => onPreview((q) => (q.width = Math.max(16, Math.round(v / 2) * 2)))} onCommit={onCommit} />
          <span class="dim">×</span>
          <NumberField value={p.height} min={16} max={8192} step={2} unit="H" width={84} onStart={onStart} onChange={(v) => onPreview((q) => (q.height = Math.max(16, Math.round(v / 2) * 2)))} onCommit={onCommit} />
        </div>
      )}
      <Row label="Frame rate">
        <Select
          value={fpsList.includes(p.fps) ? String(p.fps) : 'custom'}
          options={[...fpsList.map((f) => ({ value: String(f), label: `${f} fps` })), { value: 'custom', label: fpsList.includes(p.fps) ? 'Custom' : `Custom (${p.fps})` }]}
          onChange={(v) => onChange((q) => (q.fps = v === 'custom' ? 15 : Number(v)))}
        />
      </Row>
      {!fpsList.includes(p.fps) && (
        <Row label="Custom frame rate">
          <NumberField value={p.fps} min={1} max={120} precision={2} onChange={(v) => onChange((q) => (q.fps = Math.round(v * 100) / 100))} />
        </Row>
      )}
    </>
  );
}
