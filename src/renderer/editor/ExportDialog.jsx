// Eksport: velg en forhåndsinnstilling, juster om du vil, og trykk Eksporter.
import { useMemo, useState } from 'preact/hooks';
import { Apple, Feather, FileVideo, Film, FolderOpen, Gem, Globe, Image as ImageIcon, Music } from 'lucide-preact';
import { CAPTION_LANE, formatDuration } from '../../shared/model.js';
import { AUDIO_FORMATS, CAPTION_EXPORT, CAPTION_EXPORT_AUDIO, PRESETS, QUALITIES, VIDEO_FORMATS, estimateSize, formatBytes, outputSize } from '../../shared/formats.js';
import { project, room } from './store.js';
import { exportOpen } from './commands.js';
import { Button, Modal, Row, Segmented, Select, toast } from '../ui.jsx';

const api = window.api;
const ICONS = { film: Film, globe: Globe, feather: Feather, apple: Apple, gem: Gem, image: ImageIcon, music: Music };

function loadLast() {
  try {
    return JSON.parse(localStorage.getItem('exportSettings') || 'null');
  } catch {
    return null;
  }
}

export async function startExport(p, settings) {
  const id = await api.startExport({ project: p, settings });
  return id;
}

export async function defaultExportDir() {
  return `${await api.baseDir()}${api.platform === 'win32' ? '\\' : '/'}Exports`;
}

api.onExportDone(({ file }) => {
  toast(`Export finished: ${file.split(/[\\/]/).pop()}`, {
    kind: 'success',
    timeout: 12000,
    actions: [
      { label: api.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder', onClick: () => api.reveal(file) },
      { label: 'Open', primary: true, onClick: () => api.openPath(file) },
    ],
  });
});

export function ExportDialog() {
  const p = project.value;
  const last = loadLast();
  const [preset, setPreset] = useState(last?.preset || 'standard');
  const base = PRESETS.find((x) => x.id === preset) || PRESETS[0];
  const [format, setFormat] = useState(last?.format || base.format || 'mp4-h264');
  const [audioFormat, setAudioFormat] = useState(last?.audioFormat || 'mp3');
  const [quality, setQuality] = useState(last?.quality || base.quality);
  const [res, setRes] = useState(last?.res ?? base.res ?? 0);
  const [fps, setFps] = useState(base.fps || p.fps);
  const [useRange, setUseRange] = useState(Boolean(p.range));
  const hasCaptions = Object.values(p.clips).some((c) => c.lane === CAPTION_LANE);
  const [captions, setCaptions] = useState(hasCaptions ? 'burn' : 'none');
  const [name, setName] = useState(p.name);
  const [dir, setDir] = useState(last?.dir || null);
  const audioOnly = Boolean(base.audioOnly);

  const pickPreset = (id) => {
    const pr = PRESETS.find((x) => x.id === id);
    setPreset(id);
    if (pr.format) setFormat(pr.format);
    if (pr.audioFormat) setAudioFormat(pr.audioFormat);
    setQuality(pr.quality);
    setRes(pr.res || 0);
    setFps(pr.fps || p.fps);
  };

  const fmt = VIDEO_FORMATS.find((f) => f.id === format);
  const afmt = AUDIO_FORMATS.find((f) => f.id === audioFormat);
  const { w, h } = outputSize(p, res);
  const a = useRange && p.range ? p.range.in : 0;
  const b = useRange && p.range ? p.range.out : p.duration;
  const duration = Math.max(0, b - a);
  const settingsObj = { preset, format, audioFormat, quality, res, fps, audioOnly };
  const size = useMemo(() => estimateSize(settingsObj, duration, w, h), [preset, format, audioFormat, quality, res, fps, duration, w, h]);
  const ext = audioOnly ? afmt.ext : fmt.ext;

  const resOptions = [{ value: 0, label: `Original (${p.width} × ${p.height})` }];
  for (const r of [2160, 1440, 1080, 720, 480]) if (r < Math.min(p.width, p.height)) resOptions.push({ value: r, label: `${r}p` });

  const doExport = async () => {
    if (duration <= 0) {
      toast('The timeline is empty. Add some clips first.');
      return;
    }
    const folder = dir || (await defaultExportDir());
    const sep = api.platform === 'win32' ? '\\' : '/';
    const safe = (name || p.name).replace(/[\\/:*?"<>|]/g, '_');
    let output = `${folder}${sep}${safe}.${ext}`;
    localStorage.setItem('exportSettings', JSON.stringify({ ...settingsObj, dir }));
    await startExport(p, {
      ...settingsObj,
      output,
      range: useRange && p.range ? p.range : null,
      captions: audioOnly ? (captions.includes('srt') ? 'srt' : captions === 'vtt' ? 'vtt' : 'none') : captions,
    });
    exportOpen.value = false;
    toast('Exporting in the background. You can keep editing.', { timeout: 5000 });
  };

  return (
    <Modal
      title="Export Project"
      width={860}
      class="export-modal"
      onClose={() => (exportOpen.value = false)}
      footer={
        <>
          <div class="export-summary">
            <FileVideo size={16} />
            <span>
              {audioOnly ? afmt.label : `${w} × ${h} · ${fps} fps · ${fmt.label}`} · {formatDuration(duration)} · about {formatBytes(size)}
            </span>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              exportOpen.value = false;
              import('../export/state.js').then((m) => (m.selectedId.value = m.PROJECT_SOURCE));
              room.value = 'export';
            }}
          >
            More Options
          </Button>
          <Button variant="secondary" onClick={() => (exportOpen.value = false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={doExport}>
            Export
          </Button>
        </>
      }
    >
      <div class="export-grid">
        <div class="presets">
          {PRESETS.map((pr) => {
            const Icon = ICONS[pr.icon] || Film;
            return (
              <button key={pr.id} class={`preset${preset === pr.id ? ' active' : ''}`} onClick={() => pickPreset(pr.id)}>
                <Icon size={20} />
                <div>
                  <b>{pr.label}</b>
                  <span>{pr.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div class="export-form">
          <Row label="File name" stacked>
            <div class="name-row">
              <input class="text-input" value={name} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
              <span class="ext">.{ext}</span>
            </div>
          </Row>
          <Row label="Save to" stacked>
            <button
              class="path-btn"
              onClick={async () => {
                const d = await api.chooseDir(dir || (await defaultExportDir()));
                if (d) setDir(d);
              }}
            >
              <FolderOpen size={14} />
              <span>{dir || 'Movies/OBSlite/Exports'}</span>
            </button>
          </Row>
          {audioOnly ? (
            <Row label="Audio format">
              <Select value={audioFormat} options={AUDIO_FORMATS.map((f) => ({ value: f.id, label: `${f.label}, ${f.note.toLowerCase()}` }))} onChange={setAudioFormat} />
            </Row>
          ) : (
            <>
              <Row label="Format">
                <Select value={format} options={VIDEO_FORMATS.map((f) => ({ value: f.id, label: f.label }))} onChange={setFormat} />
              </Row>
              <p class="hint right">{fmt.note}</p>
              <Row label="Resolution">
                <Select value={String(res)} options={resOptions.map((o) => ({ value: String(o.value), label: o.label }))} onChange={(v) => setRes(Number(v))} />
              </Row>
              <Row label="Frame rate">
                <Select value={String(fps)} options={[...new Set([p.fps, 15, 24, 25, 30, 50, 60])].sort((x, y) => x - y).map((f) => ({ value: String(f), label: f === p.fps ? `${f} (project)` : String(f) }))} onChange={(v) => setFps(Number(v))} />
              </Row>
            </>
          )}
          {!(audioOnly && (audioFormat === 'wav' || audioFormat === 'flac')) && format !== 'mov-prores' && (
            <Row label="Quality">
              <Segmented value={quality} onChange={setQuality} options={QUALITIES.map((q) => ({ value: q.id, label: q.label }))} />
            </Row>
          )}
          {p.range && (
            <Row label="Range">
              <Segmented
                value={useRange}
                onChange={setUseRange}
                options={[
                  { value: false, label: 'Entire project' },
                  { value: true, label: 'In to out' },
                ]}
              />
            </Row>
          )}
          {hasCaptions && (
            <Row label="Captions">
              <Select
                value={captions}
                onChange={setCaptions}
                options={audioOnly ? CAPTION_EXPORT_AUDIO : fmt.id === 'gif' ? CAPTION_EXPORT.filter((o) => !o.value.includes('embed')) : CAPTION_EXPORT}
              />
            </Row>
          )}
          <p class="hint">Exports run in the background with hardware acceleration when available. You will be notified when the file is ready.</p>
        </div>
      </div>
    </Modal>
  );
}
