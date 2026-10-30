// Eksportfanen: velg kilde (prosjektet eller filer du vil konvertere), juster størrelse,
// beskjæring og kvalitet med forhåndsinnstillinger eller egne verdier, og eksporter.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import {
  Apple,
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  Feather,
  FileVideo,
  Film,
  FolderOpen,
  Gem,
  Globe,
  Image as ImageIcon,
  Link,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Unlink,
  X,
} from 'lucide-preact';
import { formatDuration, formatTimecode } from '../../shared/model.js';
import {
  AUDIO_FORMATS,
  CAPTION_EXPORT,
  CAPTION_EXPORT_AUDIO,
  CROP_ASPECTS,
  FIT_MODES,
  PRESETS,
  QUALITIES,
  SIZE_PRESETS,
  VIDEO_FORMATS,
  cropForAspect,
  estimateSize,
  formatBytes,
  outputGeometry,
} from '../../shared/formats.js';
import { createPlayer } from '../player.js';
import { tasks } from '../editor/store.js';
import { defaultExportDir } from '../editor/ExportDialog.jsx';
import { Button, IconButton, NumberField, Row, Section, Segmented, Select, toast } from '../ui.jsx';
import {
  PROJECT_SOURCE,
  addFiles,
  applyPreset,
  files,
  hasCaptions,
  removeFile,
  selectedId,
  selectedProject,
  setSettings,
  setSourceOptions,
  settings,
  sourceOptions,
  sourceProject,
  sources,
} from './state.js';

const api = window.api;
const ICONS = { film: Film, globe: Globe, feather: Feather, apple: Apple, gem: Gem, image: ImageIcon, music: Music };

/* Egen spiller for forhåndsvisningen i eksportfanen */
const previewPlaying = signal(false);
const previewTime = signal(0);
let previewT = 0;
const player = createPlayer({
  getProject: () => selectedProject.value,
  playing: previewPlaying,
  getTime: () => previewT,
  setTime: (t) => {
    previewT = Math.max(0, t);
    previewTime.value = previewT;
  },
});

function resolvedSettings(id) {
  const s = settings.value;
  const p = sourceProject(id);
  const so = sourceOptions(id);
  return {
    preset: s.preset,
    format: s.format,
    audioOnly: s.audioOnly,
    audioFormat: s.audioFormat,
    quality: s.quality,
    bitrate: s.quality === 'custom' ? s.bitrate : 0,
    audioKbps: s.audioKbps,
    size: s.size,
    fit: s.fit,
    crop: so.crop,
    fps: s.fpsMode === 'source' ? p.fps : s.fps,
    range: so.range,
    captions: hasCaptions(p) ? (s.audioOnly ? (s.captions.includes('srt') ? 'srt' : s.captions === 'vtt' ? 'vtt' : 'none') : s.captions) : 'none',
  };
}

function extFor(s) {
  return s.audioOnly ? AUDIO_FORMATS.find((f) => f.id === s.audioFormat).ext : VIDEO_FORMATS.find((f) => f.id === s.format).ext;
}

async function exportSource(id, name) {
  const p = sourceProject(id);
  const rs = resolvedSettings(id);
  const folder = settings.value.dir || (await defaultExportDir());
  const sep = api.platform === 'win32' ? '\\' : '/';
  const safe = (name || p.name).replace(/[\\/:*?"<>|]/g, '_');
  const range = rs.range;
  if ((range ? range.out - range.in : p.duration) <= 0) {
    toast(`${p.name} is empty and was not exported.`);
    return false;
  }
  await api.startExport({ project: p, settings: { ...rs, output: `${folder}${sep}${safe}.${extFor(rs)}` } });
  return true;
}

export function ExportRoom({ active }) {
  const [over, setOver] = useState(false);
  const p = selectedProject.value;
  const s = settings.value;
  const id = selectedId.value;
  const so = sourceOptions(id);
  const rs = resolvedSettings(id);
  const geo = useMemo(() => outputGeometry(p, rs), [p, s, so]);
  const a = so.range ? so.range.in : 0;
  const b = so.range ? so.range.out : p.duration;
  const duration = Math.max(0, b - a);
  const size = estimateSize({ ...rs }, duration, geo.w, geo.h);
  const [name, setName] = useState(p.name);

  useEffect(() => setName(p.name), [id, p.name]);
  useEffect(() => {
    if (!active) player.pause();
  }, [active]);
  useEffect(() => {
    player.pause();
    player.seek(0);
    player.invalidate();
  }, [id]);

  const onDrop = async (e) => {
    e.preventDefault();
    setOver(false);
    const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
    await addFiles(paths);
  };

  const doExport = async () => {
    if (await exportSource(id, name)) toast('Export started. Follow the progress in the queue on the left.', { timeout: 4000 });
  };
  const exportAll = async () => {
    let n = 0;
    for (const f of files.value) if (await exportSource(f.id, f.project.name)) n++;
    toast(`Added ${n} files to the export queue.`, { timeout: 4000 });
  };

  return (
    <div
      class={`export-room${over ? ' drop' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={onDrop}
    >
      <aside class="panel ex-sources">
        <Section title="Source" collapsible={false}>
          <div class="source-list">
            {sources.value.map((src) => (
              <button key={src.id} class={`source${id === src.id ? ' active' : ''}`} onClick={() => (selectedId.value = src.id)}>
                {src.kind === 'project' ? <Clapperboard size={16} /> : src.media.kind === 'audio' ? <Music size={16} /> : <FileVideo size={16} />}
                <div>
                  <b>{src.kind === 'project' ? 'Current Project' : src.name}</b>
                  <span>
                    {src.kind === 'project' ? src.name : `${src.media.width ? `${src.media.width} × ${src.media.height} · ` : ''}${formatDuration(src.media.duration)}`}
                  </span>
                </div>
                {src.kind === 'file' && (
                  <span
                    class="remove"
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(src.id);
                    }}
                  >
                    <X size={13} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            icon={Plus}
            onClick={async () => {
              const paths = await api.openMediaDialog();
              await addFiles(paths);
            }}
          >
            Import Files to Convert
          </Button>
          <p class="hint">You can also drop files here. They are converted with the settings on the right, without going through the editor.</p>
        </Section>
        <ExportQueue />
      </aside>

      <section class="ex-stage">
        <CropPreview project={p} id={id} crop={so.crop} aspect={s.cropAspect} />
        <div class="ex-transport">
          <button class="play-btn small" onClick={player.toggle} title="Play or pause">
            {previewPlaying.value ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
          </button>
          <input
            type="range"
            class="slider scrub"
            min={0}
            max={Math.max(0.01, p.duration)}
            step={1 / p.fps}
            value={previewTime.value}
            style={{ '--lo': `${(a / Math.max(0.01, p.duration)) * 100}%`, '--hi': `${(b / Math.max(0.01, p.duration)) * 100}%` }}
            onInput={(e) => player.seek(Number(e.currentTarget.value))}
          />
          <span class="tc">{formatTimecode(previewTime.value, p.fps)}</span>
        </div>
        <div class="ex-out">
          <span>
            In: {p.width} × {p.height}
          </span>
          <span class="arrow">→</span>
          <span>
            Out: <b>{s.audioOnly ? 'audio only' : `${geo.w} × ${geo.h}`}</b>
            {!s.audioOnly && ` · ${rs.fps} fps`} · {formatDuration(duration)} · about {formatBytes(size)}
          </span>
        </div>
      </section>

      <aside class="panel ex-settings">
        <div class="ex-scroll">
          <Section title="Preset">
            <div class="preset-chips">
              {PRESETS.map((pr) => {
                const Icon = ICONS[pr.icon] || Film;
                return (
                  <button key={pr.id} class={`chip${s.preset === pr.id ? ' active' : ''}`} title={pr.desc} onClick={() => applyPreset(pr.id)}>
                    <Icon size={14} />
                    {pr.label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Format">
            <Row label="Type">
              <Segmented
                value={s.audioOnly}
                onChange={(v) => setSettings({ audioOnly: v, preset: 'custom' })}
                options={[
                  { value: false, label: 'Video' },
                  { value: true, label: 'Audio only' },
                ]}
              />
            </Row>
            {s.audioOnly ? (
              <Row label="Audio format" stacked>
                <Select value={s.audioFormat} options={AUDIO_FORMATS.map((f) => ({ value: f.id, label: `${f.label}, ${f.note.toLowerCase()}` }))} onChange={(v) => setSettings({ audioFormat: v, preset: 'custom' })} />
              </Row>
            ) : (
              <Row label="Format and codec" stacked>
                <Select value={s.format} options={VIDEO_FORMATS.map((f) => ({ value: f.id, label: `${f.label}, ${f.note.toLowerCase()}` }))} onChange={(v) => setSettings({ format: v, preset: 'custom' })} />
              </Row>
            )}
          </Section>

          {!s.audioOnly && (
            <>
              <Section title="Size">
                <Segmented value={s.size.preset} size="wrap" onChange={(v) => setSettings({ size: { ...s.size, preset: v, ...(v === 'custom' ? { w: geo.w, h: geo.h } : {}) }, preset: 'custom' })} options={SIZE_PRESETS} />
                {s.size.preset === 'custom' && (
                  <div class="wh-row">
                    <NumberField
                      value={s.size.w}
                      min={16}
                      max={8192}
                      step={2}
                      unit="B"
                      width={84}
                      onChange={(w) => {
                        const k = geo.crop.h / geo.crop.w;
                        setSettings({ size: { ...s.size, w: Math.round(w), h: s.lockAspect ? Math.round(w * k) : s.size.h } });
                      }}
                    />
                    <IconButton
                      icon={s.lockAspect ? Link : Unlink}
                      title={s.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                      active={s.lockAspect}
                      onClick={() => setSettings({ lockAspect: !s.lockAspect })}
                    />
                    <NumberField
                      value={s.size.h}
                      min={16}
                      max={8192}
                      step={2}
                      unit="H"
                      width={84}
                      onChange={(h) => {
                        const k = geo.crop.w / geo.crop.h;
                        setSettings({ size: { ...s.size, h: Math.round(h), w: s.lockAspect ? Math.round(h * k) : s.size.w } });
                      }}
                    />
                  </div>
                )}
                <Row label="Fit">
                  <Segmented value={s.fit} onChange={(v) => setSettings({ fit: v })} options={FIT_MODES} />
                </Row>
              </Section>

              <Section title="Crop">
                <Segmented
                  value={s.cropAspect}
                  size="wrap"
                  onChange={(v) => {
                    setSettings({ cropAspect: v });
                    setSourceOptions(id, { crop: v === null ? null : v === 'free' ? so.crop || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } : cropForAspect(p, v) });
                  }}
                  options={CROP_ASPECTS}
                />
                {so.crop && <CropFields project={p} id={id} crop={so.crop} />}
                <p class="hint">Drag the frame in the preview to move or resize the crop.</p>
              </Section>

              <Section title="Frame rate">
                <Segmented
                  value={s.fpsMode === 'source' ? 'source' : [24, 25, 30, 50, 60].includes(s.fps) ? s.fps : 'custom'}
                  size="wrap"
                  onChange={(v) => setSettings(v === 'source' ? { fpsMode: 'source' } : v === 'custom' ? { fpsMode: 'custom', fps: 15 } : { fpsMode: 'custom', fps: v })}
                  options={[{ value: 'source', label: `Source (${Math.round(p.fps * 100) / 100})` }, ...[24, 25, 30, 50, 60].map((f) => ({ value: f, label: String(f) })), { value: 'custom', label: 'Custom' }]}
                />
                {s.fpsMode === 'custom' && ![24, 25, 30, 50, 60].includes(s.fps) && (
                  <Row label="Frames per second">
                    <NumberField value={s.fps} min={1} max={120} step={1} onChange={(v) => setSettings({ fps: Math.round(v) })} />
                  </Row>
                )}
              </Section>
            </>
          )}

          <Section title="Quality">
            {!s.audioOnly && s.format !== 'mov-prores' && (
              <>
                <Segmented
                  value={s.quality}
                  size="wrap"
                  onChange={(v) => setSettings({ quality: v, preset: 'custom', ...(v === 'custom' && !s.bitrate ? { bitrate: 12 } : {}) })}
                  options={[...QUALITIES.map((q) => ({ value: q.id, label: q.label })), { value: 'custom', label: 'Custom' }]}
                />
                {s.quality === 'custom' && (
                  <Row label="Video bitrate">
                    <NumberField value={s.bitrate} min={0.2} max={400} step={0.5} precision={1} unit="Mbit/s" width={110} onChange={(v) => setSettings({ bitrate: v })} />
                  </Row>
                )}
              </>
            )}
            {!(s.audioOnly && (s.audioFormat === 'wav' || s.audioFormat === 'flac')) && (
              <Row label="Audio bitrate">
                <Select
                  value={String(s.audioKbps)}
                  options={[{ value: '0', label: 'Automatic' }, ...[96, 128, 160, 192, 256, 320].map((k) => ({ value: String(k), label: `${k} kbit/s` }))]}
                  onChange={(v) => setSettings({ audioKbps: Number(v) })}
                />
              </Row>
            )}
          </Section>

          <Section title="Range">
            <Segmented
              value={Boolean(so.range)}
              onChange={(v) => setSourceOptions(id, { range: v ? { in: 0, out: p.duration } : null })}
              options={[
                { value: false, label: 'Everything' },
                { value: true, label: 'Custom' },
              ]}
            />
            {so.range && (
              <>
                <Row label="From">
                  <NumberField value={so.range.in} min={0} max={so.range.out - 0.1} step={0.1} precision={2} unit="s" width={90} onChange={(v) => setSourceOptions(id, { range: { ...so.range, in: v } })} />
                  <button class="link" onClick={() => setSourceOptions(id, { range: { ...so.range, in: Math.min(previewTime.value, so.range.out - 0.1) } })}>
                    Use playhead
                  </button>
                </Row>
                <Row label="To">
                  <NumberField value={so.range.out} min={so.range.in + 0.1} max={p.duration} step={0.1} precision={2} unit="s" width={90} onChange={(v) => setSourceOptions(id, { range: { ...so.range, out: v } })} />
                  <button class="link" onClick={() => setSourceOptions(id, { range: { ...so.range, out: Math.max(previewTime.value, so.range.in + 0.1) } })}>
                    Use playhead
                  </button>
                </Row>
              </>
            )}
          </Section>

          {hasCaptions(p) && (
            <Section title="Captions">
              <Select
                value={s.captions}
                onChange={(v) => setSettings({ captions: v })}
                options={s.audioOnly ? CAPTION_EXPORT_AUDIO : s.format === 'gif' ? CAPTION_EXPORT.filter((o) => !o.value.includes('embed')) : CAPTION_EXPORT}
              />
            </Section>
          )}

          <Section title="File">
            <Row label="File name" stacked>
              <div class="name-row">
                <input class="text-input" value={name} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
                <span class="ext">.{extFor(s)}</span>
              </div>
            </Row>
            <Row label="Save to" stacked>
              <button
                class="path-btn"
                onClick={async () => {
                  const d = await api.chooseDir(s.dir || (await defaultExportDir()));
                  if (d) setSettings({ dir: d });
                }}
              >
                <FolderOpen size={14} />
                <span>{s.dir || 'Movies/OBSlite/Exports'}</span>
              </button>
            </Row>
          </Section>
        </div>
        <footer class="ex-footer">
          <Button variant="primary" class="big" onClick={doExport}>
            {id === PROJECT_SOURCE ? 'Export Project' : 'Convert File'}
          </Button>
          {files.value.length > 1 && (
            <Button variant="secondary" onClick={exportAll}>
              Convert All {files.value.length} Files
            </Button>
          )}
        </footer>
      </aside>
    </div>
  );
}

function CropFields({ project: p, id, crop }) {
  const W = p.width;
  const H = p.height;
  const set = (patch) => {
    const c = { ...crop, ...patch };
    c.w = Math.min(c.w, 1 - c.x);
    c.h = Math.min(c.h, 1 - c.y);
    setSourceOptions(id, { crop: c });
  };
  return (
    <div class="crop-fields">
      <label>
        X <NumberField value={Math.round(crop.x * W)} min={0} max={W - 2} width={70} onChange={(v) => set({ x: v / W })} />
      </label>
      <label>
        Y <NumberField value={Math.round(crop.y * H)} min={0} max={H - 2} width={70} onChange={(v) => set({ y: v / H })} />
      </label>
      <label>
        B <NumberField value={Math.round(crop.w * W)} min={2} max={W} width={70} onChange={(v) => set({ w: v / W })} />
      </label>
      <label>
        H <NumberField value={Math.round(crop.h * H)} min={2} max={H} width={70} onChange={(v) => set({ h: v / H })} />
      </label>
    </div>
  );
}

// Forhåndsvisning med beskjæringsramme som kan flyttes og skaleres.
function CropPreview({ project: p, id, crop, aspect }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const [cssSize, setCssSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    player.attachCanvas(canvasRef.current);
    player.start();
    const resize = () => {
      const r = boxRef.current.getBoundingClientRect();
      player.resizeCanvas(r.width - 32, r.height - 32);
      setCssSize({ w: canvasRef.current.offsetWidth, h: canvasRef.current.offsetHeight });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(boxRef.current);
    return () => {
      ro.disconnect();
      player.stopLoop();
    };
  }, []);

  useEffect(() => {
    const r = boxRef.current.getBoundingClientRect();
    player.resizeCanvas(r.width - 32, r.height - 32);
    setCssSize({ w: canvasRef.current.offsetWidth, h: canvasRef.current.offsetHeight });
    player.invalidate();
  }, [p.width, p.height, id]);

  const onPointerDown = (e) => {
    const handle = e.target.dataset.h;
    if (!handle || !crop) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = hostRef.current.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, c: { ...crop } };
    const ratio = typeof aspect === 'number' ? (aspect * p.height) / p.width : null;
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / rect.width;
      const dy = (ev.clientY - start.y) / rect.height;
      let { x, y, w, h } = start.c;
      if (handle === 'move') {
        x = Math.min(1 - w, Math.max(0, x + dx));
        y = Math.min(1 - h, Math.max(0, y + dy));
      } else {
        const left = handle.includes('w');
        const top = handle.includes('n');
        let nx = x;
        let ny = y;
        let nw = w;
        let nh = h;
        if (handle.includes('e')) nw = w + dx;
        if (left) {
          nw = w - dx;
          nx = x + dx;
        }
        if (handle.includes('s')) nh = h + dy;
        if (top) {
          nh = h - dy;
          ny = y + dy;
        }
        if (ratio) {
          // Låst sideforhold: høyden følger bredden.
          nh = nw / ratio;
          if (top) ny = y + h - nh;
        }
        const min = 0.03;
        if (nw < min || nh < min) return;
        if (nx < 0 || ny < 0 || nx + nw > 1.0001 || ny + nh > 1.0001) return;
        [x, y, w, h] = [nx, ny, nw, nh];
      }
      setSourceOptions(id, { crop: { x, y, w, h } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const locked = typeof aspect === 'number';
  const handles = locked ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  return (
    <div class="ex-preview" ref={boxRef}>
      <div class="crop-host" ref={hostRef} style={{ width: cssSize.w, height: cssSize.h }} onPointerDown={onPointerDown}>
        <canvas ref={canvasRef} />
        {crop && (
          <div class="crop-box" data-h="move" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}>
            <div class="thirds" />
            {handles.map((h) => (
              <span key={h} class={`ch ch-${h}`} data-h={h} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportQueue() {
  const list = tasks.value.filter((t) => t.kind === 'export');
  return (
    <Section title={`Export Queue${list.length ? ` (${list.length})` : ''}`} collapsible={false} actions={list.some((t) => t.state !== 'running' && t.state !== 'queued') && <button class="link" onClick={() => api.clearTasks()}>Clear finished</button>}>
      {list.length === 0 && <p class="dim">No exports yet.</p>}
      <div class="queue">
        {list.map((t) => (
          <div key={t.id} class={`task ${t.state}`}>
            <div class="task-head">
              {t.state === 'done' ? <CheckCircle2 size={14} class="ok" /> : t.state === 'error' ? <CircleAlert size={14} class="err" /> : <Loader2 size={14} class="spin" />}
              <span class="title">{t.title.replace(/^Eksporterer /, '')}</span>
              {(t.state === 'running' || t.state === 'queued') && <IconButton icon={X} size={13} title="Cancel" onClick={() => api.cancelTask(t.id)} />}
              {t.state === 'done' && t.result && (
                <>
                  <button class="link" onClick={() => api.reveal(t.result)}>
                    Reveal
                  </button>
                  <button class="link" onClick={() => api.openPath(t.result)}>
                    Open
                  </button>
                </>
              )}
            </div>
            {(t.state === 'running' || t.state === 'queued') && (
              <div class="bar">
                <div style={{ width: `${Math.round((t.progress || 0) * 100)}%` }} />
              </div>
            )}
            <div class="task-sub">{t.state === 'error' ? t.error : t.state === 'queued' ? 'Waiting' : t.state === 'canceled' ? 'Canceled' : t.state === 'done' ? 'Done' : `${t.stage || ''} ${Math.round((t.progress || 0) * 100)} %`}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}
