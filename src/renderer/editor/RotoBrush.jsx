// Roto Brush: click on a subject in one frame, SAM 2.1 follows it through the clip, and the clip
// gets a transparent background. Runs in the Roto Brush add-on (src/main/roto.js).
import { useEffect, useRef, useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight, Wand2 } from 'lucide-preact';
import { sourceTime } from '../../shared/model.js';
import { Button, IconButton, Modal, Row, Section, Segmented, Slider, Toggle, toast } from '../ui.jsx';
import { modelBytes } from '../subtitleModels.js';
import { project, timeSig } from './store.js';
import { swapSource } from './ProcessorEffects.jsx';
import '../styles/subtitle-models.css';
import '../styles/roto.css';

const api = window.api;
const HANDLES = 0.5; // Seconds tracked on each side of the trim, so a small trim change still has a matte.

// The part of the source the clip uses, in frames of the source.
function rangeOf(clip) {
  const p = project.value,
    m = p.media[clip.mediaId],
    main = m.streams.main,
    fps = main.fps || p.fps,
    off = main.offset || 0;
  const a = sourceTime(clip, clip.start) - off,
    b = sourceTime(clip, clip.start + clip.dur) - off;
  const first = Math.max(0, Math.floor((Math.min(a, b) - HANDLES) * fps));
  const last = Math.min(Math.ceil(main.duration * fps), Math.ceil((Math.max(a, b) + HANDLES) * fps));
  const at = Math.round((sourceTime(clip, Math.min(Math.max(timeSig.value, clip.start), clip.start + clip.dur - 1e-3)) - off) * fps) - first;
  return { input: main.tsFallback ? main.proxy : main.path, fps, first, count: Math.max(1, last - first), at: Math.max(0, Math.min(last - first - 1, at)), frames: Math.round(main.duration * fps), sourceWidth: main.width };
}

export function RotoBrushSection({ clip }) {
  const [open, setOpen] = useState(false);
  if (clip.type !== 'video') return null;
  return (
    <Section title="Roto Brush" open={false}>
      <p class="hint">Click on a person or object, and it is followed through the clip. Everything else becomes transparent, so you can put anything behind it.</p>
      <Button icon={Wand2} onClick={() => setOpen(true)}>Open Roto Brush…</Button>
      {open && <RotoDialog clip={clip} onClose={() => setOpen(false)} />}
    </Section>
  );
}

const errorText = (e) => String(e?.message || e);

function RotoDialog({ clip, onClose }) {
  const range = useRef(rangeOf(clip)).current;
  const [status, setStatus] = useState(null);
  const [info, setInfo] = useState(null); // { count, tracked, keys, model, device }
  const [index, setIndex] = useState(range.at);
  const [frame, setFrame] = useState(null); // { index, image, mask, points }
  const [preview, setPreview] = useState(null); // refined mask for Matte and Cutout
  const [view, setView] = useState('overlay');
  const [edge, setEdge] = useState({ grow: 0, feather: 1, refine: true });
  const [busy, setBusy] = useState(null); // { stage, progress, cancel }
  const [stale, setStale] = useState(false); // Clicks changed after tracking.
  const [models, setModels] = useState(false);
  const latest = useRef(0);

  useEffect(() => api.onRotoProgress(({ progress, stage }) => setBusy((b) => b && { ...b, progress, stage })), []);
  useEffect(() => () => api.rotoClose(), []);

  const run = async (stage, fn, cancel = false) => {
    setBusy({ stage, progress: 0, cancel });
    try {
      return await fn();
    } catch (e) {
      if (errorText(e) !== 'Canceled') toast(errorText(e), { kind: 'error', timeout: 10000 });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const loadFrame = async (i) => {
    const ticket = ++latest.current;
    const r = await api.rotoCall('frame', { index: i }).catch((e) => toast(errorText(e), { kind: 'error' }));
    if (r && ticket === latest.current) setFrame(r);
  };

  const open = (model) =>
    run('Opening clip', async () => {
      const r = await api.rotoOpen({ input: range.input, fps: range.fps, first: range.first, count: range.count, model });
      setInfo(r);
      setStale(false);
      await loadFrame(Math.min(index, r.count - 1));
    });

  useEffect(() => {
    api.rotoStatus().then((s) => {
      setStatus(s);
      if (s.installed && s.model) open(s.model);
    });
  }, []);

  useEffect(() => {
    if (info) loadFrame(index);
  }, [index, info?.tracked]);

  // Matte and Cutout show the finished edge, with Grow, Feather and Refine applied.
  useEffect(() => {
    if (!info || view === 'overlay' || !frame?.mask) return setPreview(null);
    const t = setTimeout(() => api.rotoCall('preview', { index: frame.index, sourceWidth: range.sourceWidth, ...edge }).then((r) => setPreview(r.mask)).catch(() => {}), 120);
    return () => clearTimeout(t);
  }, [view, frame, edge]);

  const setPoints = async (points) => {
    const i = frame.index;
    setFrame({ ...frame, points });
    const r = await api.rotoCall('points', { index: i, points }).catch((e) => toast(errorText(e), { kind: 'error' }));
    if (!r) return;
    setFrame((f) => (f?.index === i ? { ...f, mask: r.mask, points: r.points } : f));
    setInfo((x) => ({ ...x, keys: r.keys }));
    if (info.tracked) setStale(true);
  };

  const track = () =>
    run('Tracking', async () => {
      await api.rotoCall('track');
      setInfo((x) => ({ ...x, tracked: x.count }));
      setStale(false);
      await loadFrame(index);
    }, true);

  const apply = () =>
    run('Rendering', async () => {
      const snapshot = project.value;
      const result = await api.rotoRender({ fps: range.fps, frames: range.frames, sourceWidth: range.sourceWidth, ...edge });
      swapSource(clip.id, snapshot, result);
      toast('Roto Brush applied. The original remains in the library; Undo restores it.', { kind: 'success' });
      onClose();
    }, true);

  const step = (d) => setIndex((i) => Math.max(0, Math.min((info?.count || 1) - 1, i + d)));
  const onKey = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      step((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
    }
  };

  const installed = status?.installed && status.model;
  const keys = info?.keys || [];
  const sec = (i) => ((range.first + i) / range.fps).toFixed(2);
  return (
    <Modal title="Roto Brush" width="min(1180px, 96vw)" class="roto-dialog" onClose={busy && busy.stage !== 'Opening clip' ? undefined : onClose} footer={installed && info && <>
      <span class="hint roto-footer-hint">{stale ? 'You changed clicks after tracking. Track again to use them in every frame.' : info.tracked ? `Tracked ${info.count} frames.` : 'Click on the subject, then Track.'}</span>
      <Button onClick={onClose} disabled={Boolean(busy)}>Cancel</Button>
      <Button onClick={track} disabled={Boolean(busy) || !keys.length}>{info.tracked ? 'Track Again' : 'Track'}</Button>
      <Button variant="primary" onClick={apply} disabled={Boolean(busy) || !info.tracked}>Apply to Clip</Button>
    </>}>
      {!status && <p class="hint">Checking Roto Brush…</p>}
      {status && !installed && <Install status={status} onDone={(s) => { setStatus(s); open(s.model); }} />}
      {installed && (
        <div class="roto-layout" tabIndex={0} onKeyDown={onKey}>
          <div class="roto-stage">
            <RotoCanvas frame={frame} preview={preview} view={view} onPoints={busy ? null : setPoints} />
            {busy && (
              <div class="roto-busy" role="status" aria-live="polite">
                <p>{busy.stage}{busy.progress ? ` ${Math.round(busy.progress * 100)}%` : '…'}</p>
                <progress max="1" value={busy.progress || undefined} />
                {busy.cancel && <Button onClick={() => api.rotoCancel()}>Stop</Button>}
              </div>
            )}
            <div class="roto-scrub">
              <IconButton icon={ChevronLeft} title="Previous frame (←)" onClick={() => step(-1)} disabled={!info} />
              <div class="roto-track">
                <input type="range" min="0" max={(info?.count || 1) - 1} value={index} disabled={!info} onInput={(e) => setIndex(Number(e.currentTarget.value))} aria-label="Frame" />
                {info && keys.map((k) => <span key={k} class="roto-key" style={{ left: `${(k / Math.max(1, info.count - 1)) * 100}%` }} title={`Clicks at ${sec(k)} s`} onClick={() => setIndex(k)} />)}
              </div>
              <IconButton icon={ChevronRight} title="Next frame (→)" onClick={() => step(1)} disabled={!info} />
              <span class="hint roto-time">{info ? `${index + 1} / ${info.count} · ${sec(index)} s` : ''}</span>
            </div>
          </div>
          <aside class="roto-side">
            <Segmented value={view} onChange={setView} options={[{ value: 'overlay', label: 'Overlay' }, { value: 'matte', label: 'Matte' }, { value: 'cutout', label: 'Cutout' }]} />
            <p class="hint">Click to add what belongs to the subject. {api.platform === 'darwin' ? 'Option' : 'Alt'}-click or right-click to remove a part. Click a dot to delete it.</p>
            <p class="hint">Where the mask goes wrong, go to that frame, click to correct it, and Track again.</p>
            <Button disabled={!frame?.points?.length || Boolean(busy)} onClick={() => setPoints([])}>Clear Clicks on This Frame</Button>
            <h4>Edge</h4>
            <Row label="Grow" stacked><Slider value={edge.grow} min={-20} max={20} step={1} center={0} onInput={(v) => setEdge({ ...edge, grow: v })} /><span class="hint">{edge.grow} px</span></Row>
            <Row label="Feather" stacked><Slider value={edge.feather} min={0} max={20} step={0.5} onInput={(v) => setEdge({ ...edge, feather: v })} /><span class="hint">{edge.feather} px</span></Row>
            <Row label="Follow edges in the picture"><Toggle checked={edge.refine} onChange={(refine) => setEdge({ ...edge, refine })} /></Row>
            <h4>Model</h4>
            <p class="hint">{status.models.find((m) => m.id === info?.model)?.label || '…'}{info?.device === 'cpu' ? ' · on the processor (slow)' : ''}</p>
            <Button disabled={Boolean(busy)} onClick={() => setModels(true)}>Change Model…</Button>
          </aside>
        </div>
      )}
      {models && <Models status={status} current={info?.model} onStatus={setStatus} onUse={(id) => { setModels(false); open(id); }} onClose={() => setModels(false)} />}
    </Modal>
  );
}

// Draws the frame with the mask, and turns clicks into points (0..1 of the frame).
function RotoCanvas({ frame, preview, view, onPoints }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!frame) return;
    let alive = true;
    const load = (src) => src && new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
    Promise.all([load(frame.image), load(view === 'overlay' ? frame.mask : preview || frame.mask)]).then(([img, mask]) => {
      const cv = canvas.current;
      if (!alive || !cv || !img) return;
      const w = (cv.width = img.naturalWidth),
        h = (cv.height = img.naturalHeight),
        cx = cv.getContext('2d', { willReadFrequently: true });
      const alpha = () => {
        cx.drawImage(mask, 0, 0, w, h);
        return cx.getImageData(0, 0, w, h).data;
      };
      if (view === 'matte') {
        if (mask) cx.drawImage(mask, 0, 0, w, h);
        else cx.clearRect(0, 0, w, h);
      } else if (view === 'cutout' && mask) {
        const a = alpha();
        cx.clearRect(0, 0, w, h);
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, w, h);
        for (let i = 3; i < d.data.length; i += 4) d.data[i] = a[i - 3];
        cx.putImageData(d, 0, 0);
      } else {
        let a = null;
        if (mask) a = alpha();
        cx.drawImage(img, 0, 0);
        if (a) {
          const d = cx.getImageData(0, 0, w, h);
          // Outside the subject is darkened and tinted, so the edge is easy to judge.
          for (let i = 0; i < d.data.length; i += 4) {
            const k = 1 - a[i] / 255;
            d.data[i] -= d.data[i] * 0.55 * k;
            d.data[i + 1] -= d.data[i + 1] * 0.55 * k;
            d.data[i + 2] += (160 - d.data[i + 2]) * 0.35 * k;
          }
          cx.putImageData(d, 0, 0);
        }
      }
      for (const [x, y, on] of frame.points || []) {
        cx.beginPath();
        cx.arc(x * w, y * h, Math.max(5, w / 200), 0, Math.PI * 2);
        cx.fillStyle = on ? '#3ddc84' : '#ff5c5c';
        cx.fill();
        cx.lineWidth = 2;
        cx.strokeStyle = '#000';
        cx.stroke();
      }
    });
    return () => (alive = false);
  }, [frame, preview, view]);

  const click = (e) => {
    e.preventDefault();
    if (!onPoints || !frame) return;
    const r = canvas.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width,
      y = (e.clientY - r.top) / r.height;
    const points = frame.points || [];
    const near = points.findIndex(([px, py]) => Math.hypot((px - x) * r.width, (py - y) * r.height) < 10);
    if (near >= 0) return onPoints(points.filter((_, i) => i !== near));
    onPoints([...points, [x, y, e.altKey || e.button === 2 ? 0 : 1]]);
  };
  return <canvas ref={canvas} class={`roto-canvas${view === 'cutout' ? ' checker' : ''}`} onClick={click} onContextMenu={click} />;
}

function Install({ status, onDone }) {
  const [model, setModel] = useState('base');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => api.onTasks((list) => {
    const t = list.find((x) => x.title === 'Installing Roto Brush' && x.state === 'running');
    if (t) setBusy({ progress: t.progress, stage: t.stage });
  }), []);
  if (!status.supported) return <p>Roto Brush is not available for this computer. It needs a Mac with Apple Silicon, or Windows or Linux on x64.</p>;
  const m = status.models.find((x) => x.id === model);
  const total = status.needed + m.bytes;
  const install = async () => {
    setBusy({ progress: 0, stage: 'Starting' });
    setError('');
    try {
      onDone(await api.rotoInstall({ consent: true, model }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div class="roto-install">
      <p>Roto Brush needs an add-on that is not part of Reccut. Read what it downloads before you install it.</p>
      <ul class="keys-facts">
        <li>It uses SAM 2.1 from Meta, an open AI model for following objects in video, under the Apache 2.0 license. Everything runs on this computer; no video leaves it.</li>
        <li>It downloads uv, a private copy of Python, PyTorch, the SAM 2 source and the model you choose, about {modelBytes(total)} in all. Files with a known checksum are checked before they are used. Nothing is installed outside Reccut's own folder.</li>
        <li>It is fastest on Apple Silicon and on NVIDIA graphics cards. Tracking takes about a second per frame on a recent Mac.</li>
        <li>You can change model, download more models or remove everything later.</li>
      </ul>
      <h4>Choose a model</h4>
      <div class="roto-models">
        {status.models.map((x) => (
          <label key={x.id} class={`roto-model${model === x.id ? ' active' : ''}`}>
            <input type="radio" name="roto-model" checked={model === x.id} disabled={Boolean(busy)} onChange={() => setModel(x.id)} />
            <span><b>{x.label}</b>{x.id === 'base' && <em> Recommended</em>} · {modelBytes(x.bytes)}<br /><span class="hint">{x.about}</span></span>
          </label>
        ))}
      </div>
      {status.free != null && status.free < total && <p class="warn">There is not enough free disk space ({modelBytes(status.free)} free, about {modelBytes(total)} needed).</p>}
      <label class="keys-agree">
        <input type="checkbox" checked={agreed} disabled={Boolean(busy)} onChange={(e) => setAgreed(e.currentTarget.checked)} />
        I understand what Roto Brush downloads. <a href="#" onClick={(e) => { e.preventDefault(); api.openExternal(status.licenseUrl); }}>SAM 2 license</a>
      </label>
      {busy && <div class="subtitle-model-progress" role="status" aria-live="polite"><progress max="1" value={busy.progress} /><p class="hint">{busy.stage} · {Math.round(busy.progress * 100)}%</p></div>}
      {error && <p class="warn">{error}</p>}
      <Button variant="primary" disabled={!agreed || Boolean(busy)} onClick={install}>{busy ? 'Installing…' : `Download and Install (${modelBytes(total)})`}</Button>
    </div>
  );
}

// Pick, download, switch and delete models. Only one model is used at a time.
function Models({ status, current, onStatus, onUse, onClose }) {
  const [pending, setPending] = useState(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => api.onTasks((list) => {
    const t = list.find((x) => x.title === 'Downloading a Roto Brush model' && x.state === 'running');
    if (t) setProgress(t.progress);
  }), []);
  const act = async (id, fn) => {
    setPending(id);
    setProgress(0);
    try {
      onStatus(await fn());
    } catch (e) {
      if (errorText(e) !== 'Canceled') toast(errorText(e), { kind: 'error' });
    } finally {
      setPending(null);
    }
  };
  return (
    <Modal title="Roto Brush Models" width={620} class="subtitle-model-manager" onClose={pending ? undefined : onClose} footer={<Button onClick={onClose} disabled={Boolean(pending)}>Done</Button>}>
      <p class="hint">Bigger models follow hard subjects better but track more slowly. Switching keeps your clicks; track again with the new model.</p>
      <div class="subtitle-model-list">
        {status.models.map((m) => (
          <article key={m.id} class={`subtitle-model-card${current === m.id ? ' active' : ''}`}>
            <div class="subtitle-model-heading"><h3>{m.label}</h3><div class="subtitle-model-badges">
              {m.id === 'base' && <span>Recommended</span>}
              <span class={current === m.id ? 'active' : ''}>{current === m.id ? 'In use' : m.installed ? 'Downloaded' : 'Not downloaded'}</span>
            </div></div>
            <p class="hint">{modelBytes(m.bytes)} · SAM 2.1 · Apache 2.0</p>
            <p>{m.about}</p>
            {pending === m.id && !m.installed && <div class="subtitle-model-progress" role="status" aria-live="polite"><progress max="1" value={progress} /><p class="hint">{Math.round(progress * 100)}%</p></div>}
            <div class="subtitle-model-actions">
              {m.installed ? <>
                {current !== m.id && <Button variant="primary" disabled={Boolean(pending)} onClick={() => onUse(m.id)}>Use This Model</Button>}
                <Button disabled={Boolean(pending) || current === m.id} title={current === m.id ? 'Choose another model before deleting this one.' : undefined} onClick={() => act(m.id, () => api.rotoRemoveModel(m.id))}>Delete</Button>
              </> : <Button variant="primary" disabled={Boolean(pending)} onClick={() => act(m.id, () => api.rotoDownloadModel(m.id))}>{pending === m.id ? 'Downloading…' : 'Download'}</Button>}
            </div>
          </article>
        ))}
      </div>
      <p class="hint"><a href="#" onClick={(e) => { e.preventDefault(); if (confirm('Remove Roto Brush and all its models? Clips you already applied it to keep their result.')) api.rotoRemove().then(onStatus).then(onClose); }}>Remove Roto Brush from this computer</a></p>
    </Modal>
  );
}
