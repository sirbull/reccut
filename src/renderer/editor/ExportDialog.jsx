// Eksport: velg en forhåndsinnstilling, juster om du vil, og trykk Eksporter.
import { useMemo, useState } from 'preact/hooks';
import { Apple, Feather, FileVideo, Film, FolderOpen, Gem, Globe, Image as ImageIcon, Music } from 'lucide-preact';
import { CAPTION_LANE, formatDuration } from '../../shared/model.js';
import { AUDIO_FORMATS, CAPTION_EXPORT, CAPTION_EXPORT_AUDIO, PRESETS, QUALITIES, VIDEO_FORMATS, estimateSize, formatBytes, frameRateCheck, mediaCopies, outputSize } from '../../shared/formats.js';
import { project, projectFolders, room } from './store.js';
import { prefs } from '../prefs.js';
import { exportOpen } from './commands.js';
import { captionItems, toSrt, toVtt } from '../../shared/srt.js';
import { startExportWithThumbnail } from '../design/videoThumbnail.js';
import { ThumbnailChoice } from '../design/ThumbnailChoice.jsx';
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

export async function startExport(p, settings, thumbnailId = null) {
  const id = await startExportWithThumbnail(p, settings, thumbnailId);
  return id;
}

// Eksporter legges i prosjektets Exports-mappe.
export async function defaultExportDir() {
  if (prefs.value.exportDirMode === 'custom' && prefs.value.exportDir) return prefs.value.exportDir;
  return projectFolders.value?.exports || `${await api.baseDir()}${api.platform === 'win32' ? '\\' : '/'}Exports`;
}

// Bare undertekstfila, uten å rendre video. VTT når det er valgt alene, ellers SRT.
export async function exportCaptionsOnly(p, { range, captions, name, dir }) {
  const items = captionItems(p, range ? range.in : 0, range ? range.out : p.duration);
  if (!items.length) {
    toast('There are no captions in the part you are exporting.');
    return;
  }
  const kind = captions.includes('vtt') && !captions.includes('srt') ? 'vtt' : 'srt';
  const filters = [{ name: 'SRT', extensions: ['srt'] }, { name: 'WebVTT', extensions: ['vtt'] }];
  const sep = api.platform === 'win32' ? '\\' : '/';
  const safe = (name || p.name).replace(/[\\/:*?"<>|]/g, '_');
  const file = await api.saveFileDialog({ title: 'Export Captions', defaultPath: `${dir || (await defaultExportDir())}${sep}${safe}.${kind}`, filters: kind === 'vtt' ? filters.reverse() : filters });
  if (!file) return;
  await api.writeText(file, /\.vtt$/i.test(file) ? toVtt(items) : toSrt(items));
  toast('Captions saved.', { actions: [{ label: api.platform === 'darwin' ? 'Reveal' : 'Show', onClick: () => api.reveal(file) }] });
}

api.onExportDone(({ file, quiet }) => {
  if (quiet) return;
  toast(`Export finished: ${file.split(/[\\/]/).pop()}`, {
    kind: 'success',
    timeout: 12000,
    actions: [
      { label: api.platform === 'darwin' ? 'Reveal in Finder' : 'Show in Folder', onClick: () => api.reveal(file) },
      { label: 'Open', primary: true, onClick: () => api.openPath(file) },
    ],
  });
});

// Varsel når klipp har en bildefrekvens som ikke går opp i eksportens, med forslag til en bedre.
export function FrameRateWarning({ project: p, fps, candidates, onUse }) {
  const { clips, suggest } = useMemo(() => frameRateCheck(p, fps, candidates), [p, fps]);
  if (!clips.length) return null;
  const names = clips.slice(0, 3).map((c) => `${c.name} (${c.fps} fps)`).join(', ') + (clips.length > 3 ? ` and ${clips.length - 3} more` : '');
  return (
    <div class="callout" role="status">
      <p>
        Motion may stutter in {names}. The frame rate does not divide evenly into {fps} fps, so some frames are shown twice or skipped.
        {!suggest && ' No other frame rate suits the clips better.'}
      </p>
      {suggest && (
        <Button class="small" onClick={() => onUse(suggest)}>
          Use {suggest} fps
        </Button>
      )}
    </div>
  );
}

// Originalene eller kopiene (optimalisert media og proxyer). Vises bare når sekvensen har kopier.
export function SourceMediaChoice({ project: p, value, onChange }) {
  const { optimized, proxies } = useMemo(() => mediaCopies(p), [p]);
  if (!optimized && !proxies) return null;
  const clips = (n) => `${n} file${n > 1 ? 's' : ''}`;
  return (
    <>
      <Row label="Source media">
        <Segmented value={value} onChange={onChange} options={[{ value: 'original', label: 'Originals' }, { value: 'optimized', label: 'Optimized media' }]} />
      </Row>
      <p class="hint">
        {value === 'original'
          ? 'Full quality from the original files. ProRes, DNxHD and similar formats are decoded during the export, so it takes longer. Colors match the preview, also for HDR, which is tone mapped the same way.'
          : `Faster, using the copies you edit with.${optimized ? ` ${clips(optimized)} use optimized media, at full resolution.` : ''}${proxies ? ` ${clips(proxies)} only have a proxy of at most 1920 pixels and will be softer in a larger export. Use Optimize Media first to avoid this.` : ''}`}
      </p>
    </>
  );
}

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
  const [sourceMedia, setSourceMedia] = useState(last?.sourceMedia || 'original');
  const [useRange, setUseRange] = useState(Boolean(p.range));
  const hasCaptions = Object.values(p.clips).some((c) => c.lane === CAPTION_LANE);
  const [captions, setCaptions] = useState(hasCaptions ? 'burn' : 'none');
  const [name, setName] = useState(p.name);
  const [thumbnailId,setThumbnailId]=useState(null),[preparing,setPreparing]=useState(false);
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
  const settingsObj = { preset, format, audioFormat, quality, res, fps, audioOnly, sourceMedia };
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
    if(preparing)return;setPreparing(true);
    try { await startExport(p, {
      ...settingsObj,
      output,
      range: useRange && p.range ? p.range : null,
      captions: audioOnly ? (captions.includes('srt') ? 'srt' : captions === 'vtt' ? 'vtt' : 'none') : captions,
    }, audioOnly?null:thumbnailId);
    exportOpen.value = false;
    toast('Exporting in the background. You can keep editing.', { timeout: 5000 }); } catch(err) { toast(`Could not start export: ${err.message}`,{kind:'error'}); } finally { setPreparing(false); }
  };

  return (
    <Modal
      title="Easy Export"
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
          {hasCaptions && (
            <Button variant="secondary" onClick={() => exportCaptionsOnly(p, { range: useRange && p.range ? p.range : null, captions, name, dir })}>
              Captions Only
            </Button>
          )}
          <Button variant="primary" disabled={preparing} onClick={doExport}>
            {preparing?'Preparing Export…':'Export'}
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
          <ThumbnailChoice project={p} value={thumbnailId} onChange={setThumbnailId} disabled={audioOnly}/><Row label="File name" stacked>
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
              <span>{dir || 'Movies/Reccut/Exports'}</span>
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
              <FrameRateWarning project={p} fps={fps} candidates={[p.fps, 24, 25, 30, 50, 60]} onUse={setFps} />
              <SourceMediaChoice project={p} value={sourceMedia} onChange={setSourceMedia} />
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
