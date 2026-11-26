// Bibliotek med medier, titler, overganger, effekter og undertekster, som i Final Cut Pro.
// Forhåndsvisningene tegnes med den ekte tegnemotoren, så de ser ut akkurat som resultatet.
import { useEffect, useRef, useState } from 'preact/hooks';
import { modelAction, useSubtitleModels } from '../subtitleModels.js';
import { SubtitleModelManager } from '../SubtitleModels.jsx';
import {
  Blend,
  Captions,
  Clapperboard,
  FileAudio,
  FileDown,
  FileUp,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  List,
  ListVideo,
  Plus,
  Rows3,
  Search,
  Sparkles,
  AudioLines,
  Trash2,
  Type,
  Video,
  Wand2,
  ChevronRight,
  Globe,
  BadgeCheck,
} from 'lucide-preact';
import { StockBrowser, StockCard, StockPoppedOut, StockWindow, stockPopout } from '../design/Online.jsx';
import { findTemplate, templateDefaults } from '../../shared/titletemplates.js';
import { AudioFxIcon } from './audioIcons.jsx';
import { renameSequence, sequenceList, timelines, CAPTION_LANE, EFFECTS, FRAME_FX, REDACT_MODES, HIGHLIGHT_DEFAULTS, TITLE_TEMPLATES, TRANSITIONS, defaultProps, formatDuration, formatTimecode, makeClip, newProject, vfxProp } from '../../shared/model.js';
import { drawFrame } from '../../shared/render.js';
import { onFlareSprites } from '../../shared/lensFlareRender.js';
import { parseSrt, speechSources, toSrt, toVtt } from '../../shared/srt.js';
import { addMediaRecords, importPaths, switchSequence, usedMedia, projectFolders, audioSkimming, commit, endPreview, getWave, makeCaptionClip, playing, project, selection, skim, skimming, tasks, timeSig, waveVersion } from './store.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';
import { fileUrl, mediaPreviewProject, openSource, scrubAudio, seek } from './playback.js';
import * as commands from './commands.js';
import { FILM_LOOKS } from '../../shared/filmLooks.js';
import { startLibraryDrag } from './libraryDrag.js';
import { newMulticamClip } from './multicam.js';
import { CaptionPresets, CaptionStyleEditor } from './Inspector.jsx';
import { Button, IconButton, Modal, Row, Section, Segmented, Select, toast } from '../ui.jsx';
import { prefs } from '../prefs.js';
import { AUDIO_EFFECTS, AUDIO_FX_CATEGORIES, AUDIO_PRESETS, AUDIO_PRESET_CATEGORIES } from '../../shared/audiofx.js';
import { BROWSER_VIDEO_EFFECTS, makeVideoEffect } from '../../shared/videoEffects.js';
import { ATTRIBUTE_GROUPS } from '../../shared/attributes.js';
import { BRAND_LIMIT, BRAND_SECTIONS, activeProfileId, applyBrandEffects, brandSection, isLowerThird } from '../../shared/brandLibrary.js';
import { BrandProfileBar } from '../BrandProfiles.jsx';
import { profiles } from '../brandProfiles.js';

const api = window.api;
const isMac = api.platform === 'darwin';

const TABS = [
  { id: 'media', label: 'Media', icon: Clapperboard },
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'transitions', label: 'Transitions', icon: Blend },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'audio', label: 'Audio Effects', icon: AudioLines },
  { id: 'captions', label: 'Captions', icon: Captions },
  { id: 'stock', label: 'Stock', icon: Globe },
  { id: 'brand', label: 'Brand', icon: BadgeCheck },
];

export function Browser() {
  const tab = commands.browserTab.value;
  const setTab = (t) => (commands.browserTab.value = t);
  return (
    <div class="browser panel">
      <div class="panel-tabs">
        {TABS.map((t) => (
          <button key={t.id} data-tab={t.id} class={tab === t.id ? 'active' : ''} title={t.label} onClick={() => setTab(t.id)}>
            <t.icon size={15} />
            {tab === t.id && <span>{t.label}</span>}
          </button>
        ))}
      </div>
      <div class="browser-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'titles' && <TitlesTab />}
        {tab === 'transitions' && <TransitionsTab />}
        {tab === 'effects' && <EffectsTab />}
        {tab === 'audio' && <AudioFxTab />}
        {tab === 'captions' && <CaptionsTab />}
        {tab === 'stock' && <StockTab />}
        {tab === 'brand' && <BrandTab />}
      </div>
    </div>
  );
}

export function dragData(e, item) {
  if (item.kind === 'media') {
    const ids = item.ids || [item.id];
    const media = project.value.media[item.id || ids[0]];
    item = { ...item, label: media?.name, mediaKind: media?.kind, clips: ids.map((id) => ({ id, opts: commands.browserClipOpts(project.value.media[id], ids.length === 1) })) };
  }
  startLibraryDrag(e, item);
}

/* Stock */

// Stock files are saved in the project's media folder, or Reccut's own folder for unsaved projects,
// and imported where they are. The credit stays on the media for attribution.
const sep = api.platform === 'win32' ? '\\' : '/';
async function useStock(item, placement) {
  const folders = projectFolders.value;
  const dir = folders?.own ? folders.media : `${await api.baseDir()}${sep}Stock`;
  const result = await api.stockDownload(item.token, dir);
  const [media] = await importPaths([result.path], placement, { copy: false });
  if (!media) return;
  commit((p) => { if (p.media[media.id]) p.media[media.id].stock = result.source; });
  toast(`${result.name} was added to ${placement ? 'the timeline' : 'Media'}.`);
}
const STOCK_ACTIONS = [
  { label: 'Add to Media', run: (item) => useStock(item, null) },
  { label: 'Add to Timeline', run: (item) => useStock(item, { mode: 'append' }) },
];
const EDIT_STOCK_KINDS = ['video', 'music', 'sfx', 'photo', 'illustration', 'vector'];
const editStock = () => <StockBrowser room="edit" kinds={EDIT_STOCK_KINDS} grid="stock-grid" renderCard={(item) => <StockCard key={item.token} item={item} actions={STOCK_ACTIONS} />} />;
function StockTab() {
  return <div class="stock-tab">{stockPopout.value.includes('edit') ? <StockPoppedOut room="edit" /> : editStock()}</div>;
}
export function EditStockWindow() {
  return <StockWindow room="edit">{editStock()}</StockWindow>;
}

/* Media */

let mediaOrder = [];

// Små merker for HDR, 10-bit, optimalisert media og synket lyd.
function MediaBadges({ m }) {
  const streams = Object.values(m.streams);
  const color = streams.find((x) => x.color)?.color;
  const synced = streams.filter((x) => x.syncedFrom).length;
  const optimized = streams.some((x) => x.optimized);
  return (
    <>
      {m.offline && <span class="mbadge offline" title="The file is missing. Right click and choose Relink File.">OFFLINE</span>}
      {color?.hdr && <span class="mbadge hdr" title={`HDR (${color.hdr === 'pq' ? 'PQ' : 'HLG'}). Shown tone mapped to SDR.`}>HDR</span>}
      {!color?.hdr && color?.bits > 8 && <span class="mbadge" title={`${color.bits}-bit color`}>{color.bits}-bit</span>}
      {m.raw && <span class="mbadge" title="Camera RAW photo">RAW</span>}
      {optimized && <span class="mbadge opt" title="Optimized media">OPT</span>}
      {synced > 0 && <span class="mbadge sync" title="Synchronized audio from an external recorder">+{synced} audio</span>}
    </>
  );
}

function MediaTab() {
  const p = project.value;
  const [query, setQuery] = useState('');
  const found = Object.values(p.media).filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));
  // Opptak fra Voice Over Studio ligger øverst i en egen kategori, med innstillingene fra studioet.
  const voice = found.filter((m) => m.voiceover);
  const others = found.filter((m) => !m.voiceover);
  const items = [...voice, ...others];
  mediaOrder = items.map((m) => m.id);
  const [voiceOpen, setVoiceOpen] = useState(() => localStorage.getItem('browserVoiceOpen') !== '0');
  const toggleVoice = () => {
    setVoiceOpen(!voiceOpen);
    localStorage.setItem('browserVoiceOpen', voiceOpen ? '0' : '1');
  };
  const section = voice.length > 0 && (
    <button class="media-section" onClick={toggleVoice} aria-expanded={voiceOpen} title="Takes from the Voice Over Studio, with the trim, volume, fades and effects from the studio. Drag one out and it sounds like the stitched clips.">
      <ChevronRight size={12} class={voiceOpen ? 'open' : ''} /> Voice Over <span class="dim">· {voice.length}</span>
    </button>
  );
  const shown = (list) => (voiceOpen ? list : list.filter((m) => !m.voiceover));
  const othersHead = voice.length > 0 && others.length > 0 && <div class="media-section static">All media <span class="dim">· {others.length}</span></div>;
  const [over, setOver] = useState(false);
  const mode = commands.browserView.value;
  const setView = commands.setBrowserView;
  // Utseende på filmstripene: hvor mye tid hver rad viser, og hvor høye bildene er.
  const [spanIdx, setSpanIdx] = useState(() => Math.max(0, Math.min(SPANS.length - 1, Number(localStorage.getItem('browserSpan')) || 0)));
  const [stripH, setStripH] = useState(() => Math.max(24, Math.min(96, Number(localStorage.getItem('browserStripH')) || 40)));
  const changeSpan = (i) => {
    setSpanIdx(i);
    localStorage.setItem('browserSpan', String(i));
  };
  const changeH = (h) => {
    setStripH(h);
    localStorage.setItem('browserStripH', String(h));
  };

  const addRecording = async () => {
    const recs = await api.listRecordings(projectFolders.value?.recordings);
    if (!recs.length) return toast('No recordings yet. Make one in the Record tab.');
    const id = await api.popupMenu(recs.slice(0, 20).map((r) => ({ id: r.path, label: r.name })));
    if (!id) return;
    const media = await api.importRecording(id);
    addMediaRecords([media]);
  };

  return (
    <div
      class={`media-tab${over ? ' drop' : ''}`}
      onPointerDown={() => (commands.browserFocus.value = true)}
      onContextMenu={async (e) => {
        if (e.defaultPrevented) return;
        e.preventDefault();
        const id = await api.popupMenu([
          { id: 'sequence', label: 'New Sequence…', accelerator: 'Alt+CmdOrCtrl+N' },
          { id: 'import', label: 'Import Media…', accelerator: 'CmdOrCtrl+I' },
        ]);
        if (id === 'sequence') commands.newSequence();
        else if (id === 'import') commands.importDialog();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e.dataTransfer)) return;
        e.preventDefault();
        setOver(false);
        commands.importDroppedFiles(droppedPaths(e.dataTransfer, api.pathForFile));
      }}
    >
      <div class="tab-actions">
        <Button variant="secondary" icon={Plus} onClick={() => commands.importDialog()}>
          Import
        </Button>
        <Button variant="ghost" icon={Video} onClick={addRecording}>
          Recordings
        </Button>
        <span class="spacer" />
        <IconButton icon={ListVideo} title={`New Sequence (${isMac ? '⌥⌘N' : 'Ctrl+Alt+N'})`} onClick={() => commands.newSequence()} />
        <span class="view-btns">
        <IconButton icon={Rows3} title="Filmstrip view" active={mode === 'filmstrip'} onClick={() => setView('filmstrip')} />
        <IconButton icon={LayoutGrid} title="Icon view. Click a clip to show it in the viewer." active={mode === 'grid'} onClick={() => setView('grid')} />
        <IconButton icon={List} title="List view. Click a clip to show it in the viewer." active={mode === 'list'} onClick={() => setView('list')} />
        </span>
      </div>
      {mode === 'filmstrip' && Object.keys(p.media).length > 0 && (
        <div class="film-controls">
          <label title="How much time each filmstrip row shows. Long clips wrap over several rows.">
            <span>Row</span>
            <input type="range" min="0" max={SPANS.length - 1} step="1" value={spanIdx} onInput={(e) => changeSpan(Number(e.currentTarget.value))} />
            <span class="val">{spanLabel(SPANS[spanIdx])}</span>
          </label>
          <label title="Height of the filmstrips">
            <span>Height</span>
            <input type="range" min="24" max="96" step="4" value={stripH} onInput={(e) => changeH(Number(e.currentTarget.value))} />
          </label>
        </div>
      )}
      {Object.keys(p.media).length > 4 && (
        <div class="search">
          <Search size={13} />
          <input placeholder="Search media" value={query} onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
      )}
      <Sequences />
      {Object.keys(p.media).length === 0 ? (
        <div class="empty">
          <Film size={28} />
          <p>Drop files here or click Import.</p>
          <p class="dim">Almost any video, audio or image format works. Files the app cannot play directly are converted in the background.</p>
        </div>
      ) : (
        mode === 'filmstrip' ? (
          <div class="media-list">
            {section}
            {shown(voice).map((m) => (
              <FilmstripRow key={m.id} m={m} span={SPANS[spanIdx]} height={stripH} />
            ))}
            {othersHead}
            {others.map((m) => (
              <FilmstripRow key={m.id} m={m} span={SPANS[spanIdx]} height={stripH} />
            ))}
          </div>
        ) : mode === 'list' ? (
          <div class="media-rows" role="list">
            <div class="media-rows-head" aria-hidden="true">
              <span />
              <span>Name</span>
              <span>Duration</span>
              <span>Format</span>
            </div>
            {items.map((m) => (
              <MediaListRow key={m.id} m={m} />
            ))}
          </div>
        ) : (
          <div class="media-grid">
            {section}
            {shown(voice).map((m) => (
              <MediaCard key={m.id} m={m} />
            ))}
            {othersHead}
            {others.map((m) => (
              <MediaCard key={m.id} m={m} />
            ))}
          </div>
        )
      )}
      <p class="hint small">
        {mode === 'filmstrip'
          ? 'Skim a clip and press I and O to mark a range, or drag across it. Press E to append, W to insert, Q to connect or D to overwrite at the playhead, or drag the range to the timeline.'
          : 'Click a clip to show it in the viewer. Scrub under the picture and press I and O to mark what to keep, then drag the picture to the timeline, or press E, W, Q or D.'}
      </p>
    </div>
  );
}

/* Sekvenser vises når prosjektet har mer enn én. Dobbeltklikk åpner. */

function Sequences() {
  const list = sequenceList(project.value);
  if (list.length < 2) return null;
  return (
    <div class="seq-list">
      {list.map((s) => (
        <SequenceItem key={s.id} s={s} />
      ))}
    </div>
  );
}

function SequenceItem({ s }) {
  const renaming = commands.renamingSequence.value === s.id;
  const finish = (name) => {
    commands.renamingSequence.value = null;
    name = name.trim();
    if (name && name !== s.name) commit((p) => renameSequence(p, s.id, name));
  };
  const menu = async (e) => {
    e.preventDefault();
    const id = await api.popupMenu([
      { id: 'open', label: 'Open Sequence', enabled: !s.active },
      { id: 'rename', label: 'Rename' },
      { id: 'duplicate', label: 'Duplicate Sequence' },
      { separator: true },
      { id: 'delete', label: 'Delete Sequence' },
    ]);
    if (id === 'open') switchSequence(s.id);
    else if (id === 'rename') commands.renamingSequence.value = s.id;
    else if (id === 'duplicate') commands.duplicateSequence(s.id);
    else if (id === 'delete') commands.removeSequence(s.id);
  };
  return (
    <div class={`seq-item${s.active ? ' active' : ''}`} title={s.active ? 'Open in the timeline' : 'Double click to open'} onDblClick={() => !renaming && switchSequence(s.id)} onContextMenu={menu}>
      <ListVideo size={16} />
      <div class="seq-text">
        {renaming ? (
          <input
            class="text-input"
            value={s.name}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') commands.renamingSequence.value = null;
            }}
            onBlur={(e) => commands.renamingSequence.value === s.id && finish(e.currentTarget.value)}
          />
        ) : (
          <b>{s.name}</b>
        )}
        <span>
          {formatDuration(s.duration || 0)} · {s.width} × {s.height} · {s.fps} fps
        </span>
      </div>
    </div>
  );
}

function MediaCard({ m }) {
  const selected = commands.browserPicked.value.includes(m.id);
  const stream = m.streams.screen || m.streams.main || m.streams.camera;
  const thumb = m.kind === 'image' ? m.streams.main?.proxy || m.path : stream?.thumbs?.files?.[Math.min(stream.thumbs.files.length - 1, 2)];
  const analyzing = tasks.value.some((t) => t.kind === 'analyze' && t.state === 'running' && t.title.includes(m.name));
  const used = usedMedia.value.has(m.id);
  const Icon = m.kind === 'audio' ? FileAudio : m.kind === 'image' ? ImageIcon : m.kind === 'recording' ? Video : Film;
  const onContext = (e) => mediaContextMenu(e, m, used);
  return (
    <div
      class={`media-card${selected ? ' selected' : ''}`}
      data-media={m.id}
      draggable
      onDragStart={(e) => dragData(e, { kind: 'media', id: m.id, ids: commands.browserPicked.value.includes(m.id) ? mediaOrder.filter((x) => commands.browserPicked.value.includes(x)) : [m.id] })}
      onClick={(e) => commands.pickMedia(e, m.id, mediaOrder)}
      onDblClick={() => {
        commands.pickMedia(null, m.id, mediaOrder);
        commands.addBrowserSelection('append');
      }}
      onContextMenu={onContext}
      title={m.path}
    >
      <div class={`thumb k-${m.kind}`}>
        {thumb ? <img src={fileUrl(thumb)} draggable={false} /> : <Icon size={26} />}
        {m.kind === 'audio' && <span class="dur">{formatDuration(m.duration)}</span>}
        {m.kind === 'audio' && used && <span class="used" title="Used in the project" />}
        {analyzing && <span class="busy" />}
        {m.kind === 'audio' && <span class="badges">
          <MediaBadges m={m} />
        </span>}
      </div>
      {m.kind === 'audio' && <div class="name">{m.name}</div>}
    </div>
  );
}

/* Listevisning: én rad per fil med navn, lengde og format. Klikk viser klippet i visningen. */

function mediaFormat(m) {
  const v = Object.values(m.streams || {}).find((s) => s.hasVideo);
  if (m.kind === 'audio') {
    const a = m.streams?.main;
    return a?.sampleRate ? `Audio · ${Math.round(a.sampleRate / 100) / 10} kHz` : 'Audio';
  }
  if (m.kind === 'image') return v?.width ? `Image · ${v.width} × ${v.height}` : 'Image';
  const size = v?.width ? `${v.width} × ${v.height}` : m.kind === 'recording' ? 'Recording' : 'Video';
  return v?.fps ? `${size} · ${Math.round(v.fps * 100) / 100} fps` : size;
}

function MediaListRow({ m }) {
  const selected = commands.browserPicked.value.includes(m.id);
  const stream = m.streams.screen || m.streams.main || m.streams.camera;
  const thumb = m.kind === 'image' ? m.streams.main?.proxy || m.path : stream?.thumbs?.files?.[Math.min(stream.thumbs.files.length - 1, 2)];
  const used = usedMedia.value.has(m.id);
  const range = commands.browserRange.value?.mediaId === m.id ? commands.browserRange.value : null;
  const Icon = m.kind === 'audio' ? FileAudio : m.kind === 'image' ? ImageIcon : m.kind === 'recording' ? Video : Film;
  // Skumming: raden er klippet fra start (venstre) til slutt (høyre). I og O markerer under skummeren.
  const [skimAt, setSkimAt] = useState(null);
  const dur = m.kind === 'image' ? prefs.value.stillDur : m.duration || 0.04;
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.max(0, Math.min(dur, ((e.clientX - r.left) / Math.max(1, r.width)) * dur));
    setSkimAt(t);
    commands.browserSkimPos.mediaId = m.id;
    commands.browserSkimPos.t = t;
    if (skimming.value && !playing.value) skim.value = { project: mediaPreviewProject(m), T: Math.min(t, dur - 1e-3), mediaId: m.id };
  };
  const onLeave = () => {
    setSkimAt(null);
    if (commands.browserSkimPos.mediaId === m.id) commands.browserSkimPos.mediaId = null;
    if (skim.value?.mediaId === m.id) skim.value = null;
  };
  return (
    <div
      class={`media-row${selected ? ' selected' : ''}`}
      role="listitem"
      data-media={m.id}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      draggable
      onDragStart={(e) => dragData(e, { kind: 'media', id: m.id, ids: commands.browserPicked.value.includes(m.id) ? mediaOrder.filter((x) => commands.browserPicked.value.includes(x)) : [m.id] })}
      onClick={(e) => commands.pickMedia(e, m.id, mediaOrder)}
      onDblClick={() => {
        commands.pickMedia(null, m.id, mediaOrder);
        commands.addBrowserSelection('append');
      }}
      onContextMenu={(e) => mediaContextMenu(e, m, used)}
      title={m.path}
    >
      <span class={`row-thumb k-${m.kind}`}>{thumb ? <img src={fileUrl(thumb)} draggable={false} /> : <Icon size={14} />}</span>
      <span class="row-name">
        {used && <span class="used" title="Used in the project" />}
        <span class="name">{m.name}</span>
        <MediaBadges m={m} />
      </span>
      <span class="row-dur">{range ? `${formatDuration(range.out - range.in)} of ${formatDuration(m.duration || 0)}` : m.kind === 'image' ? 'Still' : formatDuration(m.duration || 0)}</span>
      <span class="row-fmt">{mediaFormat(m)}</span>
      {skimAt != null && m.kind !== 'image' && <div class="film-skimmer" style={{ left: `${(skimAt / dur) * 100}%` }} />}
    </div>
  );
}

/* Filmstrip: klippet vises som en liten tidslinje du kan skumme og velge et område i */

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

// Hvor mange sekunder hver rad i filmstripen viser. 0 betyr hele klippet på én rad.
const SPANS = [0, 300, 120, 60, 30, 10, 5];
const spanLabel = (s) => (s === 0 ? 'All' : s >= 60 ? `${s / 60} min` : `${s} s`);

function FilmstripRow({ m, span, height }) {
  const segRefs = useRef([]);
  const [width, setWidth] = useState(240);
  const wrapRef = useRef(null);
  const selected = commands.browserPicked.value.includes(m.id);
  const range = commands.browserRange.value?.mediaId === m.id ? commands.browserRange.value : null;
  const head = commands.browserPlayhead.value?.mediaId === m.id ? commands.browserPlayhead.value.t : null;
  const stream = m.streams.screen || m.streams.main || m.streams.camera;
  const audio = m.kind === 'recording' ? (m.streams.camera?.hasAudio ? m.streams.camera : m.streams.screen) : m.streams.main;
  const hasAudio = Boolean(audio?.hasAudio);
  const files = m.kind === 'image' ? [m.streams.main?.proxy || m.path] : stream?.thumbs?.files || [];
  const dur = m.kind === 'image' ? prefs.value.stillDur : m.duration || 0.04;
  const used = usedMedia.value.has(m.id);
  const lastScrub = useRef(0);
  const drag = useRef(null);
  const [skimAt, setSkimAt] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(wrapRef.current?.clientWidth || 240));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Klippet deles i rader som i Final Cut Pro. Siste rad blir kortere.
  const rowSpan = span > 0 && m.kind !== 'image' ? span : dur;
  const segs = [];
  for (let t0 = 0; t0 < dur - 1e-6; t0 += rowSpan) segs.push([t0, Math.min(dur, t0 + rowSpan)]);
  if (!segs.length) segs.push([0, dur]);
  const aspect = stream?.width && stream?.height ? stream.width / stream.height : 16 / 9;
  const frameH = m.kind === 'audio' ? 0 : height;
  const waveH = m.kind === 'audio' ? Math.max(28, height) : 0;
  const tileW = Math.max(16, frameH * aspect);

  // Tid for et punkt på skjermen. Over eller under radene gir første eller siste rad.
  const timeAtPoint = (x, y) => {
    let best = null;
    for (let i = 0; i < segs.length; i++) {
      const el = segRefs.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (!best || dy < best.dy) best = { dy, r, i };
    }
    if (!best) return 0;
    const [t0, t1] = segs[best.i];
    const f = Math.max(0, Math.min(1, (x - best.r.left) / best.r.width));
    return Math.max(0, Math.min(dur, t0 + f * (t1 - t0)));
  };

  const skimTo = (t) => {
    setSkimAt(t);
    commands.browserSkimPos.mediaId = m.id;
    commands.browserSkimPos.t = t;
    if (drag.current) openSource(m.id, t);
    if ((skimming.value || drag.current) && !playing.value) {
      skim.value = { project: mediaPreviewProject(m), T: Math.min(t, dur - 1e-3), mediaId: m.id };
      const now = performance.now();
      if (audioSkimming.value && hasAudio && now - lastScrub.current > 70) {
        lastScrub.current = now;
        scrubAudio();
      }
    }
  };
  const onMove = (e) => {
    const t = timeAtPoint(e.clientX, e.clientY);
    skimTo(t);
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
    if (!d.moved) return;
    const f = 1 / project.value.fps;
    const cur = commands.browserRange.value;
    if (d.edge === 'in' && cur) commands.browserRange.value = { ...cur, in: Math.min(t, cur.out - f) };
    else if (d.edge === 'out' && cur) commands.browserRange.value = { ...cur, out: Math.max(t, cur.in + f) };
    else if (!d.edge) commands.browserRange.value = { mediaId: m.id, in: Math.min(d.t, t), out: Math.max(d.t, t) };
  };
  const onLeave = () => {
    if (drag.current) return;
    setSkimAt(null);
    if (commands.browserSkimPos.mediaId === m.id) commands.browserSkimPos.mediaId = null;
    if (skim.value?.mediaId === m.id) skim.value = null;
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    commands.browserFocus.value = true;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      commands.pickMedia(e, m.id, mediaOrder);
      return;
    }
    const edge = e.target.dataset?.edge || null;
    commands.pickMedia(null, m.id, mediaOrder);
    const t = timeAtPoint(e.clientX, e.clientY);
    openSource(m.id, t);
    drag.current = { x: e.clientX, y: e.clientY, t, moved: false, edge };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    // Et klikk uten å dra flytter bibliotekets spillhode og velger hele klippet, som i Final Cut Pro,
    // så det kan dras rett til tidslinjen uten In og Out.
    if (!d.moved && !d.edge) {
      commands.browserRange.value = { mediaId: m.id, in: 0, out: dur };
      openSource(m.id, d.t);
    }
    const r = wrapRef.current?.getBoundingClientRect();
    if (r && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) onLeave();
  };
  const ids = () => (commands.browserPicked.value.includes(m.id) ? mediaOrder.filter((x) => commands.browserPicked.value.includes(x)) : [m.id]);
  const pct = (t, t0, t1) => `${((t - t0) / (t1 - t0)) * 100}%`;

  return (
    <div class={`film-row${selected ? ' selected' : ''}`} data-media={m.id} aria-label={m.name} onContextMenu={(e) => mediaContextMenu(e, m, used)}>
      {m.kind === 'audio' && <div
        class="film-head"
        draggable
        onDragStart={(e) => dragData(e, { kind: 'media', id: m.id, ids: ids() })}
        onClick={(e) => {
          commands.pickMedia(e, m.id, mediaOrder);
          commands.browserRange.value = null;
        }}
        onDblClick={() => commands.addBrowserSelection('append')}
        title={`${m.path}. Drag to the timeline.`}
      >
        {m.kind === 'recording' ? <span class="kind-dot rec">REC</span> : m.kind === 'audio' ? <FileAudio size={12} /> : m.kind === 'image' ? <ImageIcon size={12} /> : <Film size={12} />}
        <span class="name">{m.name}</span>
        {used && <span class="used-dot" title="Used in the project" />}
        <MediaBadges m={m} />
        <span class="dur">{range ? `${fmt(range.in)} to ${fmt(range.out)} (${formatDuration(range.out - range.in)})` : m.kind === 'image' ? 'Still' : formatDuration(m.duration)}</span>
      </div>}
      <div class="film-rows" ref={wrapRef} onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={onUp} onDblClick={() => commands.addBrowserSelection('append')}>
        {segs.map(([t0, t1], i) => {
          const segW = ((t1 - t0) / rowSpan) * width;
          const n = Math.max(1, Math.ceil(segW / tileW));
          const tiles = [];
          if (frameH && files.length) {
            for (let k = 0; k < n; k++) {
              const t = t0 + ((k + 0.5) * tileW / segW) * (t1 - t0);
              const idx = m.kind === 'image' ? 0 : Math.max(0, Math.min(files.length - 1, Math.floor(t / (stream.thumbs.interval || 1))));
              tiles.push(<img key={k} src={fileUrl(files[idx])} loading="lazy" style={{ width: tileW, flex: `0 0 ${tileW}px` }} draggable={false} />);
            }
          }
          const rIn = range ? Math.max(range.in, t0) : 0;
          const rOut = range ? Math.min(range.out, t1) : 0;
          const showRange = range && rOut > rIn;
          return (
            <div key={i} class="film-strip" ref={(el) => (segRefs.current[i] = el)} style={{ width: `${((t1 - t0) / rowSpan) * 100}%` }}>
              {frameH > 0 && (
                <div class={`frames${tiles.length ? '' : ' empty'}`} style={{ height: frameH }}>
                  {tiles}
                </div>
              )}
              {waveH > 0 && <MiniWave stream={audio} offset={audio?.offset || 0} from={t0} to={t1} h={waveH} />}
              {!range && <div
                class="film-drag-handle"
                draggable
                title="Drag the clip to the timeline"
                aria-label={`Drag ${m.name} to the timeline`}
                onPointerDown={(e) => { e.stopPropagation(); commands.pickMedia(e, m.id, mediaOrder); }}
                onDragStart={(e) => dragData(e, { kind: 'media', id: m.id, ids: ids() })}
              ><span>⋮⋮</span></div>}
              {showRange && (
                <div
                  class="film-range"
                  style={{ left: pct(rIn, t0, t1), width: `${((rOut - rIn) / (t1 - t0)) * 100}%` }}
                  draggable
                  title="Drag the range to the timeline, or drag its edges to adjust it"
                  onPointerDown={(e) => {
                    // Midten av området dras til tidslinjen. Kantene justerer området.
                    if (!e.target.dataset?.edge) {
                      e.stopPropagation();
                      commands.pickMedia(e, m.id, mediaOrder);
                      openSource(m.id, timeAtPoint(e.clientX, e.clientY));
                    }
                  }}
                  onDragStart={(e) => {
                    if (drag.current?.edge) return e.preventDefault();
                    dragData(e, { kind: 'media', id: m.id, ids: [m.id] });
                  }}
                >
                  {range.in >= t0 && range.in <= t1 && <span class="film-edge in" data-edge="in" />}
                  {range.out >= t0 && range.out <= t1 && <span class="film-edge out" data-edge="out" />}
                </div>
              )}
              {head != null && head >= t0 && head <= t1 && <div class="film-head-line" style={{ left: pct(head, t0, t1) }} />}
              {skimAt != null && skimAt >= t0 && skimAt <= t1 && (
                <div class="film-skimmer" style={{ left: pct(skimAt, t0, t1) }}>
                  {segs.length > 1 || span > 0 ? <span>{fmt(skimAt)}</span> : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniWave({ stream, offset, from, to, h }) {
  const ref = useRef(null);
  waveVersion.value;
  const wave = getWave(stream?.wave);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(cv.clientWidth * dpr));
      cv.height = Math.max(1, Math.round(cv.clientHeight * dpr));
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      if (!wave) return;
      g.fillStyle = 'rgba(160, 235, 180, 0.85)';
      const mid = cv.height / 2;
      const len = to - from;
      for (let px = 0; px < cv.width; px++) {
        const t0 = from + (px / cv.width) * len - offset;
        const t1 = from + ((px + 1) / cv.width) * len - offset;
        let i0 = Math.floor(t0 * wave.rate);
        const i1 = Math.max(i0 + 1, Math.ceil(t1 * wave.rate));
        let mx = 0;
        for (; i0 < i1; i0++) if (i0 >= 0 && wave.peaks[i0] > mx) mx = wave.peaks[i0];
        const hh = Math.max(0.5, (mx / 255) * mid * 0.95);
        g.fillRect(px, mid - hh, 1, hh * 2);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [wave, from, to, offset]);
  return <canvas ref={ref} class="film-wave" style={{ height: h }} />;
}

async function mediaContextMenu(e, m, used) {
  e.preventDefault();
  if (!commands.browserPicked.value.includes(m.id)) commands.pickMedia(null, m.id, mediaOrder);
  commands.browserFocus.value = true;
  const picked = commands.browserPicked.value.map((id) => project.value.media[id]).filter(Boolean);
  const n = picked.length;
  const hasVideo = picked.some((x) => x.kind === 'video' || x.kind === 'recording');
  const hasAudio = picked.some((x) => x.kind === 'audio');
  const synced = picked.some((x) => Object.values(x.streams).some((st) => st.syncedFrom));
  const id = await api.popupMenu([
    { id: 'append', label: 'Append to Storyline', accelerator: 'E' },
    { id: 'insert', label: 'Insert at Playhead', accelerator: 'W' },
    { id: 'connect', label: 'Connect to Storyline', accelerator: 'Q' },
    { id: 'overwrite', label: 'Overwrite at Playhead', accelerator: 'D' },
    { id: 'slideshow', label: 'Add as Slideshow…', enabled: picked.every((x) => x.kind === 'image' && !x.offline) },
    { id: 'multicam', label: n > 1 ? 'New Multicam Clip from Selection…' : 'New Multicam Clip…', enabled: hasVideo },
    { separator: true },
    { id: 'sync', label: 'Synchronize Audio', accelerator: 'Alt+CmdOrCtrl+G', enabled: hasVideo && hasAudio },
    { id: 'unsync', label: 'Remove Synchronized Audio', enabled: synced },
    { id: 'optimize', label: n > 1 ? `Optimize ${n} Clips` : 'Optimize Media', accelerator: 'Shift+CmdOrCtrl+O', enabled: hasVideo },
    { separator: true },
    { id: 'relink', label: m.offline ? 'Relink Missing File…' : 'Relink File…', enabled: n === 1 },
    { id: 'reveal', label: isMac ? 'Reveal in Finder' : 'Show in Explorer', enabled: !m.offline },
    { id: 'remove', label: n > 1 ? `Remove ${n} Clips from Project` : 'Remove from Project', accelerator: 'Backspace' },
    { id: 'deleteDisk', label: 'Delete from Disk…' },
  ]);
  if (['append', 'insert', 'connect', 'overwrite'].includes(id)) commands.addBrowserSelection(id);
  else if (id === 'slideshow') commands.openSlideshow(mediaOrder);
  else if (id === 'multicam') newMulticamClip(mediaOrder.filter((x) => picked.some((m) => m.id === x)));
  else if (id === 'sync') commands.syncMediaAudio();
  else if (id === 'unsync') commands.removeSyncedAudio();
  else if (id === 'optimize') commands.optimizeMedia();
  else if (id === 'reveal') api.reveal(m.path);
  else if (id === 'relink') commands.relinkDialog(m.id);
  else if (id === 'remove') commands.removeBrowserMedia(picked.map((x) => x.id));
  else if (id === 'deleteDisk') commands.removeBrowserMedia(picked.map((x) => x.id), { forceDialog: true });
}

/* Små forhåndsvisninger tegnet med tegnemotoren */

function sampleCanvas(colors, label) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 320, 180);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 320, 180);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(250, 60, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 130, 320, 50);
  g.fillStyle = '#fff';
  g.font = '700 54px system-ui, sans-serif';
  g.fillText(label, 24, 104);
  return c;
}

// Nøytral bakgrunn for titler og effekter: et lite landskap med himmel, sol og åser.
function sceneCanvas() {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 180);
  sky.addColorStop(0, '#3a5f9e');
  sky.addColorStop(1, '#c98a5a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 320, 180);
  g.fillStyle = 'rgba(255, 230, 170, 0.95)';
  g.beginPath();
  g.arc(230, 92, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2d3b4f';
  g.beginPath();
  g.moveTo(0, 130);
  g.quadraticCurveTo(80, 92, 170, 126);
  g.quadraticCurveTo(250, 150, 320, 118);
  g.lineTo(320, 180);
  g.lineTo(0, 180);
  g.fill();
  g.fillStyle = '#1d2533';
  g.beginPath();
  g.moveTo(0, 158);
  g.quadraticCurveTo(140, 128, 320, 160);
  g.lineTo(320, 180);
  g.lineTo(0, 180);
  g.fill();
  return c;
}

// Et påloggingsvindu med passord, til forhåndsvisning av sladding.
function loginCanvas() {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 180;
  const g = c.getContext('2d');
  g.fillStyle = '#e9edf3';
  g.fillRect(0, 0, 320, 180);
  g.fillStyle = '#ffffff';
  g.fillRect(60, 28, 200, 124);
  g.strokeStyle = '#c7cfdb';
  g.strokeRect(60.5, 28.5, 199, 123);
  g.fillStyle = '#1b2433';
  g.font = '600 13px system-ui, sans-serif';
  g.fillText('Sign in', 76, 50);
  g.font = '10px system-ui, sans-serif';
  g.fillStyle = '#5b6678';
  g.fillText('Email', 76, 68);
  g.fillText('Password', 76, 102);
  for (const y of [72, 106]) {
    g.strokeStyle = '#aab4c3';
    g.strokeRect(76.5, y + 0.5, 168, 18);
  }
  g.fillStyle = '#1b2433';
  g.font = '11px ui-monospace, monospace';
  g.fillText('kari@example.com', 81, 85);
  g.fillText('Hemmelig#2026', 81, 119);
  g.fillStyle = '#2f6fd6';
  g.fillRect(76, 130, 60, 15);
  return c;
}

let samples = null;
function getSamples() {
  if (!samples) samples = { a: sampleCanvas(['#2f6fd6', '#18315f'], 'A'), b: sampleCanvas(['#e0892e', '#7a3f10'], 'B'), scene: sceneCanvas(), login: loginCanvas() };
  return samples;
}

const PREVIEW_PROJECT = { width: 320, height: 180, media: { a: { id: 'a', kind: 'image', streams: {} }, b: { id: 'b', kind: 'image', streams: {} }, scene: { id: 'scene', kind: 'image', streams: {} }, login: { id: 'login', kind: 'image', streams: {} } }, captionStyle: {} };

function imageClip(id, start, dur, props = {}) {
  return { id, type: 'image', mediaId: id, lane: 0, start, in: 0, dur, enabled: true, kf: {}, props: { ...defaultProps('image'), ...props } };
}

function MiniPreview({ frameAt, duration = 1.6, still = 0.5, label }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const cv = ref.current;
    const g = cv.getContext('2d');
    const s = getSamples();
    const getSource = (clip) => {
      const img = clip.mediaId === 'b' ? s.b : clip.mediaId === 'scene' ? s.scene : clip.mediaId === 'login' ? s.login : s.a;
      return { img, w: img.width, h: img.height };
    };
    const draw = (t) => {
      const { project: proj, frame } = frameAt(t);
      drawFrame(g, proj, frame, getSource, { scale: cv.width / proj.width });
    };
    if (!hover) {
      draw(still * duration);
      // Lens flare-teksturer kommer litt etter; tegn stillbildet på nytt når de er klare.
      return onFlareSprites(() => draw(still * duration));
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const t = (((performance.now() - t0) / 1000) % (duration + 0.6)) - 0.3;
      draw(Math.max(0, Math.min(duration - 1e-3, t)));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [hover, frameAt]);
  return <canvas ref={ref} class="mini-preview" width={320} height={180} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)} aria-label={label} />;
}

/* Titler */

const titleFrames = new Map();
function titleFrameAt(tpl) {
  if (!titleFrames.has(tpl.id)) {
    titleFrames.set(tpl.id, (t) => {
      const bg = imageClip('scene', 0, 3);
      const title = { id: 't', type: 'title', lane: 1, start: 0, in: 0, dur: 3, enabled: true, kf: {}, props: { ...defaultProps('title'), ...tpl.props } };
      // Supringer er små i en liten forhåndsvisning: zoom inn på hjørnet de står i.
      const anchor = tpl.props.template ? findTemplate(tpl.props.template, project.value.templates || {})?.anchor || '' : tpl.category === 'Lower Thirds' ? 'bottom-left' : '';
      if (anchor.includes('bottom')) Object.assign(title.props, { scale: 2, x: anchor.includes('right') ? -820 : anchor.includes('left') ? 820 : 0, y: -420 });
      const proj = { ...PREVIEW_PROJECT, width: 1920, height: 1080, templates: project.value.templates || {} };
      return { project: proj, frame: { layers: [{ clip: bg, T: t }, { clip: title, T: t }], captions: [] } };
    });
  }
  return titleFrames.get(tpl.id);
}

// Titler og supringer i grupper. Egne maler (importert fra After Effects eller en .reccut-title fil) ligger under Custom.
function TitlesTab() {
  const custom = Object.values(project.value.templates || {}).map((t) => ({ id: t.id, label: t.name, category: 'Custom', props: { template: t.id, ...templateDefaults(t) } }));
  const groups = [
    ['Lower Thirds', TITLE_TEMPLATES.filter((t) => t.category === 'Lower Thirds')],
    ['Titles', TITLE_TEMPLATES.filter((t) => !['Lower Thirds', 'Backgrounds'].includes(t.category))],
    ['Backgrounds', TITLE_TEMPLATES.filter((t) => t.category === 'Backgrounds')],
    ['Custom', custom],
  ];
  return (
    <>
      {groups.map(([name, list]) =>
        list.length || name === 'Custom' ? (
          <div key={name} class="title-group">
            <h4 class="group-head">{name}</h4>
            <div class="card-grid">
              {list.map((tpl) => (
                <button key={tpl.id} class="gen-card" draggable onDragStart={(e) => dragData(e, { kind: 'title', id: tpl.id })} onClick={() => commands.addTitle(tpl.id)} title="Click to add at the playhead, or drag to the timeline">
                  <MiniPreview frameAt={titleFrameAt(tpl)} duration={3} still={0.5} label={tpl.label} />
                  <span>{tpl.label}</span>
                </button>
              ))}
            </div>
            {name === 'Custom' && (
              <div class="tab-actions">
                <Button variant="secondary" icon={Plus} onClick={() => commands.importTitleTemplate()}>
                  Import Template
                </Button>
                <Button variant="ghost" onClick={() => commands.downloadTemplateKit()}>
                  Get the Template Kit
                </Button>
              </div>
            )}
          </div>
        ) : null
      )}
      <p class="hint small">Hover to preview the animation. Lower thirds animate in at the start and out at the end of the clip, so just set the length on the timeline. Type the name and title in the inspector.</p>
    </>
  );
}

/* Brand: titler, supringer og effekter som brukeren har lagret (commands.brandList). */

const brandFrames = new Map();
function brandTitleFrameAt(item) {
  const key = `${item.id}:${item.created}`;
  if (!brandFrames.has(key)) {
    const saved = item.clip;
    const dur = Math.max(0.5, saved.dur || 3);
    brandFrames.set(key, (t) => {
      const bg = imageClip('scene', 0, dur);
      const title = { id: 't', type: 'title', lane: 1, start: 0, in: saved.in || 0, dur, enabled: true, kf: saved.kf || {}, expressions: saved.expressions, props: { ...defaultProps('title'), ...saved.props } };
      const templates = { ...(project.value.templates || {}), ...(item.template ? { [item.template.id]: item.template } : {}) };
      // A lower third that was not moved is shown up close in its corner, like in Titles.
      const moved = (saved.props.x || 0) !== 0 || (saved.props.y || 0) !== 0 || (saved.props.scale ?? 1) !== 1 || Object.keys(saved.kf || {}).some((k) => ['x', 'y', 'scale'].includes(k));
      const anchor = saved.props.template ? findTemplate(saved.props.template, templates)?.anchor || '' : item.section === 'lowerThird' ? 'bottom-left' : '';
      if (!moved && anchor.includes('bottom')) Object.assign(title.props, { scale: 2, x: anchor.includes('right') ? -820 : anchor.includes('left') ? 820 : 0, y: -420 });
      const proj = { ...PREVIEW_PROJECT, width: 1920, height: 1080, templates };
      return { project: proj, frame: { layers: [{ clip: bg, T: t }, { clip: title, T: t }], captions: [] } };
    });
  }
  return brandFrames.get(key);
}
function brandEffectsFrameAt(item) {
  const key = `${item.id}:${item.created}`;
  if (!brandFrames.has(key)) {
    const clip = imageClip('scene', 0, Math.max(0.5, item.clip.dur || 2));
    clip.in = item.clip.in || 0;
    const visual = applyBrandEffects({ ...item, groups: item.groups.filter((g) => ATTRIBUTE_GROUPS.find((x) => x.id === g)?.kind === 'video') }, clip) > 0;
    brandFrames.set(key, visual ? (t) => ({ project: { ...PREVIEW_PROJECT }, frame: { layers: [{ clip, T: t }], captions: [] } }) : null);
  }
  return brandFrames.get(key);
}
function brandMenu(item) {
  return async (e) => {
    e.preventDefault();
    const others = profiles().filter((p) => p.id !== activeProfileId(prefs.value));
    const id = await api.popupMenu([
      { id: 'apply', label: item.kind === 'title' ? 'Add at Playhead' : 'Apply to Selected Clips' },
      { id: 'update', label: 'Update from Selected Clip', enabled: commands.canUpdateBrandItem(item) },
      { id: 'rename', label: 'Rename…' },
      ...(others.length ? [{ label: 'Move to Profile', submenu: others.map((p) => ({ id: `move:${p.id}`, label: p.name })) }] : []),
      { separator: true },
      { id: 'delete', label: 'Delete from Brand' },
    ]);
    try {
      if (id === 'apply') commands.applyBrandItem(item.id);
      else if (id === 'update') toast(`${commands.updateBrandItem(item.id).name} was updated.`, { timeout: 2500 });
      else if (id === 'rename') commands.brandDialog.value = { rename: item.id, name: item.name };
      else if (id?.startsWith('move:')) commands.moveBrandItem(item.id, id.slice(5));
      else if (id === 'delete' && confirm(`Delete “${item.name}” from Brand? Clips that use it keep their look.`)) commands.deleteBrand(item.id);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    }
  };
}
function BrandCard({ item }) {
  const title = item.kind === 'title';
  const frameAt = title ? brandTitleFrameAt(item) : brandEffectsFrameAt(item);
  const groups = title ? '' : item.groups.map((g) => ATTRIBUTE_GROUPS.find((x) => x.id === g)?.label).filter(Boolean).join(', ');
  return (
    <button
      class="gen-card"
      data-brand={item.id}
      draggable
      onDragStart={(e) => dragData(e, { kind: title ? 'brandTitle' : 'brandEffects', id: item.id, label: item.name })}
      onPointerEnter={title ? undefined : () => commands.previewBrandItem(item.id)}
      onClick={() => commands.applyBrandItem(item.id)}
      onContextMenu={brandMenu(item)}
      title={title ? 'Click to add at the playhead, or drag to the timeline. Right click to rename or delete.' : `${groups}. Point to preview on the selected clips. Click to apply, or drag onto a clip. Right click to rename or delete.`}
    >
      {frameAt ? <MiniPreview frameAt={frameAt} duration={Math.min(5, Math.max(1, item.clip.dur || 2))} still={title ? 0.5 : 0.9} label={item.name} /> : <div class="mini-preview brand-audio" aria-hidden="true"><AudioLines size={28} /></div>}
      <span>{item.name}</span>
    </button>
  );
}
function BrandTab() {
  const items = commands.brandList();
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = items.filter((i) => words.every((w) => i.name.toLowerCase().includes(w)));
  const selected = selection.value.map((id) => project.value.clips[id]).filter((c) => c && !['gap', 'caption'].includes(c.type));
  const hints = { title: 'Style a title, select it and choose Save to Brand.', lowerThird: 'Style a lower third, select it and choose Save to Brand.', effects: 'Select a clip with effects, color or audio effects and choose Save to Brand.' };
  return (
    <div class="brand-tab">
      <BrandProfileBar />
      <div class="tab-actions">
        <Button variant="secondary" icon={Plus} disabled={!selected.length || items.length >= BRAND_LIMIT} onClick={() => commands.openSaveToBrand()} title="Save the selected title, lower third or the effects of the selected clip">
          Save to Brand
        </Button>
      </div>
      {items.length > 6 && <input class="text-input" type="search" placeholder="Search Brand" aria-label="Search Brand" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />}
      {BRAND_SECTIONS.map((sec) => {
        const list = brandSection(found, sec.id);
        return (
          <div key={sec.id} class="title-group" onPointerLeave={sec.id === 'effects' ? endPreview : undefined}>
            <h4 class="group-head">{sec.label}</h4>
            {list.length ? (
              <div class="card-grid">
                {list.map((item) => <BrandCard key={item.id} item={item} />)}
              </div>
            ) : (
              <p class="hint small">{query ? 'No matching items.' : hints[sec.id]}</p>
            )}
          </div>
        );
      })}
      <p class="hint small">Brand keeps your own titles, lower thirds and effect presets in every project. Right click a clip and choose Save to Brand. Saved titles keep their text, font, colors, animation and length. Effect presets keep the parts you choose, with their keyframes. Right click an item to update it from the selected clip. Use a profile for each channel or client, and export a profile to use it on another computer.</p>
    </div>
  );
}

// Save to Brand and Rename for Brand items.
export function BrandDialog() {
  const d = commands.brandDialog.value;
  const close = () => (commands.brandDialog.value = null);
  const [name, setName] = useState(d.name || '');
  const [kind, setKind] = useState(d.kind || 'title');
  const [groups, setGroups] = useState(() => new Set(d.preferred || []));
  const effects = !d.rename && kind === 'effects';
  const ok = () => {
    if (!name.trim() || (effects && !groups.size)) return;
    if (d.rename) {
      commands.renameBrand(d.rename, name);
      close();
    } else commands.confirmSaveToBrand({ kind, name, groups: [...groups] });
  };
  const clip = d.clipId ? project.value.clips[d.clipId] : null;
  return (
    <Modal
      title={d.rename ? 'Rename Brand Item' : 'Save to Brand'}
      width={440}
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!name.trim() || (effects && !groups.size)} onClick={ok}>
            {d.rename ? 'Rename' : 'Save'}
          </Button>
        </>
      }
    >
      <Row label="Name" stacked>
        <input class="text-input" autoFocus maxLength={120} value={name} onInput={(e) => setName(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      </Row>
      {!d.rename && clip?.type === 'title' && d.available.length > 0 && (
        <Row label="Save as">
          <Segmented
            value={kind}
            onChange={(next) => {
              // Follow the kind with the suggested name until the user types their own.
              const suggested = (k) => (k === 'effects' ? `${d.name} Effects` : d.name);
              if (name === suggested(kind)) setName(suggested(next));
              setKind(next);
            }}
            options={[{ value: 'title', label: 'Title' }, { value: 'effects', label: 'Effect Preset' }]}
          />
        </Row>
      )}
      {!d.rename && kind === 'title' && <p class="sync-lead">The title is saved with its text, font, colors, animation, keyframes and length. It appears under {clip && isLowerThirdClip(clip) ? 'Lower Thirds' : 'Titles'} in Brand.</p>}
      {effects && (
        <>
          <p class="sync-lead">Choose what the preset keeps. Applying it replaces these parts of the clips you apply it to.</p>
          <div class="attr-cols">
            <div class="attr-col">
              {ATTRIBUTE_GROUPS.filter((g) => d.available.includes(g.id)).map((g) => (
                <label key={g.id} class="attr-row" title={g.desc}>
                  <input
                    type="checkbox"
                    checked={groups.has(g.id)}
                    onChange={(e) => {
                      const n = new Set(groups);
                      e.currentTarget.checked ? n.add(g.id) : n.delete(g.id);
                      setGroups(n);
                    }}
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
function isLowerThirdClip(clip) {
  return isLowerThird(clip.props, project.value.templates || {});
}

/* Overganger */

const transFrames = new Map();
function transitionFrameAt(type) {
  if (!transFrames.has(type)) {
    transFrames.set(type, (t) => {
      const a = imageClip('a', 0, 1);
      const b = imageClip('b', 1, 1);
      const p = Math.min(1, Math.max(0, t / 1.6));
      const proj = { ...PREVIEW_PROJECT, width: 320, height: 180 };
      return { project: proj, frame: { layers: [{ transition: { type, p }, a: { clip: a, T: 0.5 }, b: { clip: b, T: 1.5 } }], captions: [] } };
    });
  }
  return transFrames.get(type);
}

function TransitionsTab() {
  return (
    <>
      <div class="card-grid">
        {TRANSITIONS.map((t) => (
          <button key={t.id} class="gen-card" draggable onDragStart={(e) => dragData(e, { kind: 'transition', id: t.id })} onClick={() => commands.addTransition(t.id)} title="Click to add to the selected clip, or drag onto a clip edge or cut">
            <MiniPreview frameAt={transitionFrameAt(t.id)} duration={1.6} still={0.5} label={t.label} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Hover to preview. {isMac ? 'Cmd' : 'Ctrl'} T adds a cross dissolve to the selected clip.</p>
    </>
  );
}

/* Effekter */

const fxFrames = new Map();
function effectFrameAt(fx) {
  if (!fxFrames.has(fx.id)) {
    fxFrames.set(fx.id, (t) => {
      const k = Math.min(1, t / 1);
      const props = fx.id === 'kenBurns'
        ? { kenBurns: true, kenBurnsMode: 'in', kenBurnsAmount: 0.22 }
        : BROWSER_VIDEO_EFFECTS.some((e) => e.type === fx.id)
        ? { vfx: [makeVideoEffect(fx.id)] }
        : { [fx.prop]: fx.def * (0.15 + 0.85 * k), fx: [fx.id] };
      // The actual mixer starts neutral; the browser thumbnail demonstrates it.
      if (fx.id === 'hueSaturation') Object.assign(props.vfx[0].p, { redHue: 100 * k, blueSaturation: -0.8 * k });
      const framed = ['radius', 'shadow', 'border'].includes(fx.id);
      if (framed) props.scale = 0.72;
      const clip = imageClip('scene', 0, 2, props);
      // Lens Flare: lyset glir over bildet, så refleksjonene beveger seg motsatt vei.
      if (fx.id === 'lensFlare') clip.kf[vfxProp(props.vfx[0].id, 'x')] = [[0, 0.3, 'easeInOut'], [2, 0.78]];
      const proj = { ...PREVIEW_PROJECT, width: 320, height: 180 };
      const layers = framed ? [{ clip: imageClip('scene', 0, 2, { exposure: -0.45, blur: 6 }), T: t }, { clip, T: t }] : [{ clip, T: t }];
      return { project: proj, frame: { layers, captions: [] } };
    });
  }
  return fxFrames.get(fx.id);
}

const filmFrames = new Map();
function filmFrameAt(id) {
  if (!filmFrames.has(id)) filmFrames.set(id, (t) => ({ project: { ...PREVIEW_PROJECT }, frame: { layers: [{ clip: imageClip('scene', 0, 2, { film: id, filmMix: 1 }), T: t }], captions: [] } }));
  return filmFrames.get(id);
}

// Sladding: et passordfelt som pikseleres, gjøres uskarpt eller dekkes til.
const redactFrames = new Map();
function redactFrameAt(mode) {
  if (!redactFrames.has(mode)) {
    redactFrames.set(mode, (t) => {
      const bg = imageClip('login', 0, 2);
      const r = { id: 'r', type: 'redact', lane: 1, start: 0, in: 0, dur: 2, enabled: true, kf: {}, props: { ...defaultProps('redact'), mode, x: 0, y: 115 - 90, w: 176, h: 26, amount: 0.25 + 0.25 * Math.min(1, t) } };
      return { project: { ...PREVIEW_PROJECT }, frame: { layers: [{ clip: bg, T: t }, { clip: r, T: t }], captions: [] } };
    });
  }
  return redactFrames.get(mode);
}

// Highlight Area: streken tegnes opp, området forstørres og bakgrunnen blir mørkere.
let highlightFrames = null;
function highlightFrameAt() {
  if (!highlightFrames) {
    highlightFrames = (t) => {
      const bg = imageClip('login', 0, 3);
      const r = { id: 'r', type: 'redact', lane: 1, start: 0, in: 0, dur: 3, enabled: true, kf: {}, props: { ...defaultProps('redact'), ...HIGHLIGHT_DEFAULTS, mode: 'highlight', x: 0, y: 115 - 90, w: 190, h: 40, strokeWidth: 3, speed: 0.8 } };
      return { project: { ...PREVIEW_PROJECT }, frame: { layers: [{ clip: bg, T: t }, { clip: r, T: t }], captions: [] } };
    };
  }
  return highlightFrames;
}

// Effekter som dekker hele bildet, med en maske tegnet med pennen i forhåndsvisningen.
const frameFxFrames = new Map();
function frameFxFrameAt(mode) {
  if (!frameFxFrames.has(mode)) {
    frameFxFrames.set(mode, (t) => {
      const bg = imageClip('login', 0, 2);
      const r = { id: 'r', type: 'redact', lane: 1, start: 0, in: 0, dur: 2, enabled: true, kf: {}, props: { ...defaultProps('redact'), mode, shape: 'full', amount: 0.2 + 0.3 * Math.min(1, t) } };
      return { project: { ...PREVIEW_PROJECT }, frame: { layers: [{ clip: bg, T: t }, { clip: r, T: t }], captions: [] } };
    });
  }
  return frameFxFrames.get(mode);
}

function EffectsTab() {
  return (
    <>
      <div class="sub-head">Photo motion</div>
      <div class="card-grid" onPointerLeave={endPreview}>
        <button class="gen-card" data-photo-effect="kenBurns" draggable
          onDragStart={(e) => dragData(e, { kind: 'effect', id: 'kenBurns' })}
          onPointerEnter={() => commands.previewEffect('kenBurns')} onClick={() => commands.addEffect('kenBurns')}
          title="Slow pan and zoom for still images. Adjust framing and motion in Video, or select images in Media and choose Add as Slideshow.">
          <MiniPreview frameAt={effectFrameAt({ id: 'kenBurns' })} duration={2} still={1} label="Ken Burns" />
          <span>Ken Burns</span>
        </button>
      </div>
      <div class="sub-head">Adjustment layers</div>
      <div class="card-grid">
        <button class="gen-card" data-adjustment="empty" draggable
          onDragStart={(e) => dragData(e, { kind: 'adjustment', id: 'empty' })}
          onClick={() => commands.addAdjustmentLayer()} title="Add an empty layer above the picture. Apply effects, color and masks; trim it to cover several clips.">
          <div class="adjustment-preview"><span>ADJ</span><small>Effects · Color · Masks</small></div>
          <span>Adjustment layer</span>
        </button>
      </div>
      <p class="hint small">Affects all video tracks below it. Trim or extend the layer across clips, then add Color, Effects or Masks in the inspector. Video → Layer strength blends the result.</p>
      <div class="sub-head">Color correction</div>
      <div class="card-grid" onPointerLeave={endPreview}>
        {BROWSER_VIDEO_EFFECTS.filter((fx) => fx.category === 'Color correction').map((fx) => (
          <button key={fx.type} class="gen-card" data-colorfx={fx.type} draggable
            onDragStart={(e) => dragData(e, { kind: 'effect', id: fx.type })}
            onClick={() => commands.addEffect(fx.type)}
            title="Adjust hue and saturation for individual color ranges. Click to add to selected clips, or drag onto a clip or an adjustment layer.">
            <MiniPreview frameAt={effectFrameAt({ id: fx.type })} duration={2} still={1} label={fx.label} />
            <span>{fx.label}</span>
          </button>
        ))}
      </div>
      <div class="sub-head">Color fills</div>
      <div class="card-grid" onPointerLeave={endPreview}>
        {BROWSER_VIDEO_EFFECTS.filter((fx) => fx.category === 'Color fills').map((fx) => (
          <button key={fx.type} class="gen-card" data-fillfx={fx.type} draggable
            onDragStart={(e) => dragData(e, { kind: 'effect', id: fx.type })}
            onPointerEnter={() => commands.previewEffect(fx.type)} onClick={() => commands.addEffect(fx.type)}
            title="Click to add to selected clips, or drag onto a video, image or recording clip. Adjust colors in the Effects inspector.">
            <MiniPreview frameAt={effectFrameAt({ id: fx.type })} duration={1} still={1} label={fx.label} />
            <span>{fx.label}</span>
          </button>
        ))}
      </div>
      <div class="sub-head">Blur</div>
      <div class="card-grid" onPointerLeave={endPreview}>
        {BROWSER_VIDEO_EFFECTS.filter(fx=>fx.category==='Blur').map(fx=><button key={fx.type} class="gen-card" data-blurfx={fx.type} draggable
          onDragStart={e=>dragData(e,{kind:'effect',id:fx.type})}
          onPointerEnter={()=>commands.previewEffect(fx.type)} onClick={()=>commands.addEffect(fx.type)}
          title={fx.type==='naturalMotionBlur'?'Reconstruct motion blur from neighbouring video frames. Apply to a video or recording clip.':'Directional, Zoom and Spin blur. Apply to a clip or adjustment layer, then add masks.'}>
          {fx.type==='naturalMotionBlur'?<div class="adjustment-preview"><span>Natural</span><small>Motion from video frames</small></div>:<MiniPreview frameAt={effectFrameAt({id:fx.type})} duration={2} still={.5} label={fx.label}/>}
          <span>{fx.label}</span>
        </button>)}
      </div>
      <div class="sub-head">Stylize</div>
      <div class="card-grid" onPointerLeave={endPreview}>
        {BROWSER_VIDEO_EFFECTS.filter((fx) => fx.category === 'Stylize').map((fx) => (
          <button key={fx.type} class="gen-card" data-stylize={fx.type} draggable
            onDragStart={(e) => dragData(e, { kind: 'effect', id: fx.type })}
            onPointerEnter={() => commands.previewEffect(fx.type)}
            onClick={() => selection.value.some((id) => ['video', 'image', 'recording', 'adjustment'].includes(project.value.clips[id]?.type))
              ? commands.addEffect(fx.type) : commands.addAdjustmentLayer(fx.type)}
            title="Apply to selected clips or an adjustment layer. With no eligible selection, creates an adjustment layer. Drag onto a clip, or onto an empty video track for a new layer.">
            <MiniPreview frameAt={effectFrameAt({ id: fx.type })} duration={2} still={0.5} label={fx.label} />
            <span>{fx.label}</span>
          </button>
        ))}
      </div>
      <div class="sub-head">Whole Frame</div>
      <div class="card-grid">
        {FRAME_FX.map((m) => (
          <button key={m.id} class="gen-card" data-framefx={m.id} draggable onDragStart={(e) => dragData(e, { kind: 'frameFx', id: m.id })} onClick={() => commands.addFrameEffect(m.id)} title={`${m.desc} It covers everything below it. Draw a mask with the pen to limit where it works.`}>
            <MiniPreview frameAt={frameFxFrameAt(m.id)} duration={1} still={1} label={m.label} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Covers the whole picture, like an adjustment layer. Draw a mask with the pen ({window.api.platform === 'darwin' ? 'Option Cmd M' : 'Ctrl Alt M'}) to choose where it works, and animate the mask with keyframes.</p>
      <div class="sub-head">Highlight</div>
      <div class="card-grid">
        <button class="gen-card" data-highlight="area" draggable onDragStart={(e) => dragData(e, { kind: 'redact', id: 'highlight' })} onClick={() => commands.addHighlight()} title="Outline an area, zoom in on it and darken the rest. Click to add above everything at the playhead, or drag to the timeline. Draw the area in the viewer.">
          <MiniPreview frameAt={highlightFrameAt()} duration={1.6} still={1.4} label="Highlight Area" />
          <span>Highlight Area</span>
        </button>
      </div>
      <p class="hint small">The outline draws in, the area zooms and the background darkens. It animates back out at the end of the clip, so the clip length sets how long it is shown.</p>
      <div class="sub-head">Redact</div>
      <div class="card-grid">
        {REDACT_MODES.map((m) => (
          <button key={m.id} class="gen-card" data-redact={m.id} draggable onDragStart={(e) => dragData(e, { kind: 'redact', id: m.id })} onClick={() => commands.addRedact(m.id)} title={`${m.desc} Click to add above everything at the playhead, or drag to the timeline.`}>
            <MiniPreview frameAt={redactFrameAt(m.id)} duration={1} still={1} label={m.label} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Hide passwords, faces and other private details. Move and resize the box in the viewer.</p>
      <div class="sub-head">Effects</div>
      <div class="card-grid" onPointerLeave={endPreview}>
        {EFFECTS.map((fx) => (
          <button key={fx.id} class="gen-card" draggable onDragStart={(e) => dragData(e, { kind: 'effect', id: fx.id })} onPointerEnter={() => commands.previewEffect(fx.id)} onClick={() => commands.addEffect(fx.id)} title="Point to preview on the selected clips. Click to add, or drag onto a clip">
            <MiniPreview frameAt={effectFrameAt(fx)} duration={1} still={1} label={fx.label} />
            <span>{fx.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Effect amounts can be keyframed in the Effects tab of the inspector.</p>
      {[...new Set(FILM_LOOKS.map((f) => f.group))].map((g) => (
        <div key={g}>
          <div class="sub-head">Film Looks: {g}</div>
          <div class="card-grid" onPointerLeave={endPreview}>
            {FILM_LOOKS.filter((f) => f.group === g).map((f) => (
              <button key={f.id} class="gen-card" data-film={f.id} onPointerEnter={() => commands.previewFilm(f.id)} onClick={() => commands.applyFilm(f.id)} title="Point to preview on the selected clips, and click to use it. Strength is in the Color tab of the inspector.">
                <MiniPreview frameAt={filmFrameAt(f.id)} duration={1} still={1} label={f.label} />
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <p class="hint small">Select clips and point at an effect or a film look to see it in the viewer before you click.</p>
    </>
  );
}

/* Lydeffekter: maler (ferdige kjeder) og enkelteffekter, sortert etter bruk. */

function AudioFxTab() {
  const [q, setQ] = useState('');
  const match = (x) => !q || `${x.label} ${x.desc} ${x.category}`.toLowerCase().includes(q.toLowerCase());
  const card = (kind, id, item) => (
    <button
      key={`${kind}${id}`}
      class="afx-card"
      data-afx={id}
      draggable
      onDragStart={(e) => dragData(e, { kind, id })}
      onClick={() => (kind === 'apreset' ? commands.applyAudioPreset(id) : commands.addAudioEffect(id))}
      title={`${item.desc} Click to add to the selected clips, or drag onto a clip.`}
    >
      <b>
        <AudioFxIcon kind={kind} id={id} size={14} /> {item.label}
      </b>
      <span>{item.desc}</span>
    </button>
  );
  return (
    <>
      <div class="search">
        <Search size={13} />
        <input placeholder="Search audio effects" value={q} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      {AUDIO_PRESET_CATEGORIES.map((cat) => {
        const list = AUDIO_PRESETS.filter((x) => x.category === cat && match(x));
        if (!list.length) return null;
        return (
          <div key={`p${cat}`}>
            <div class="sub-head">{cat === 'Repair' ? 'Fix and Enhance' : cat} Templates</div>
            <div class="afx-grid">{list.map((x) => card('apreset', x.id, x))}</div>
          </div>
        );
      })}
      {AUDIO_FX_CATEGORIES.map((cat) => {
        const list = Object.entries(AUDIO_EFFECTS).filter(([, x]) => x.category === cat && match(x));
        if (!list.length) return null;
        return (
          <div key={`e${cat}`}>
            <div class="sub-head">{cat} Effects</div>
            <div class="afx-grid">{list.map(([id, x]) => card('afx', id, x))}</div>
          </div>
        );
      })}
      <p class="hint small">Templates add a ready made chain of effects that you can adjust in the Audio tab of the inspector. Effects are heard right away when you play.</p>
    </>
  );
}

/* Undertekster */

export const LANGS = [
  { value: 'english', label: 'English' },
  { value: 'norwegian', label: 'Norwegian' },
  { value: 'swedish', label: 'Swedish' },
  { value: 'danish', label: 'Danish' },
  { value: 'german', label: 'German' },
  { value: 'french', label: 'French' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'auto', label: 'Detect automatically' },
];

function CaptionsTab() {
  const p = project.value;
  const T = timeSig.value;
  const caps = Object.values(p.clips)
    .filter((c) => c.lane === CAPTION_LANE)
    .sort((a, b) => a.start - b.start);
  const [lang, setLang] = useState(localStorage.getItem('captionLang') || 'english');
  const models = useSubtitleModels();
  const [manageModels, setManageModels] = useState(false);
  const running = tasks.value.find((t) => t.kind === 'transcribe' && (t.state === 'running' || t.state === 'queued'));
  const maxLines = p.captionStyle?.maxLines || 3;

  const generate = async () => {
    const sources = speechSources(p);
    if (!sources.length) return toast('There is no audio on the timeline to transcribe.');
    if (caps.length && !confirm('Replace the existing captions with new ones?')) return;
    localStorage.setItem('captionLang', lang);
    try {
      await api.startTranscribe({ sources, duration: p.duration, language: lang, projectId: p.id });
      toast('Transcribing locally in the background.');
    } catch (e) { toast(e.message, { kind: 'error' }); }
  };

  const importFile = async () => {
    const file = await api.openFileDialog({ title: 'Import Captions', filters: [{ name: 'Captions', extensions: ['srt', 'vtt'] }] });
    if (!file) return;
    const items = parseSrt(await api.readText(file));
    commit((q) => {
      for (const it of items) {
        const c = makeCaptionClip(it.start, it.text, it.end - it.start);
        q.clips[c.id] = c;
      }
    });
    toast(`Imported ${items.length} captions.`);
  };

  const exportFile = async (kind) => {
    const ext = kind === 'vtt' ? 'vtt' : 'srt';
    const file = await api.saveFileDialog({ title: 'Export Captions', defaultPath: `${p.name}.${ext}`, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!file) return;
    const items = caps.map((c) => ({ start: c.start, end: c.start + c.dur, text: c.props.text }));
    await api.writeText(file, kind === 'vtt' ? toVtt(items) : toSrt(items));
    toast('Captions saved.', { actions: [{ label: isMac ? 'Reveal' : 'Show', onClick: () => api.reveal(file) }] });
  };

  return (
    <div class="captions-tab">
      <div class="auto-box">
        <div class="auto-head">
          <Sparkles size={15} />
          <b>Auto captions</b>
        </div>
        <div class="auto-row">
          <Select value={lang} options={LANGS} onChange={setLang} />
          <Select
            value={models?.active || ''}
            options={models?.models.some(m => m.usable) ? models.models.filter(m => m.usable).map(m => ({ value: m.id, label: `${m.name}${m.recommended ? ' · Recommended' : ''}` })) : [{ value: '', label: 'Install a subtitle model' }]}
            onChange={id => modelAction('selectSubtitleModel', id)}
            disabled={!models?.models.some(m => m.usable)}
          />
        </div>
        <Button onClick={() => setManageModels(true)}>Manage Models</Button>
        {manageModels && <SubtitleModelManager state={models} onClose={() => setManageModels(false)} />}
        <Button variant="primary" icon={Sparkles} disabled={Boolean(running)} onClick={generate}>
          {running ? `Transcribing ${Math.round((running.progress || 0) * 100)} %` : 'Generate captions'}
        </Button>
      </div>
      <div class="tab-actions">
        <Button variant="secondary" icon={Plus} onClick={() => commands.addCaption()}>
          New
        </Button>
        <IconButton icon={FileUp} title="Import SRT or VTT" onClick={importFile} />
        <IconButton icon={FileDown} title="Export SRT" onClick={() => exportFile('srt')} />
        <button class="link" onClick={() => exportFile('vtt')}>
          VTT
        </button>
      </div>
      <Section title="Styles">
        <CaptionPresets />
      </Section>
      <div class="cap-list">
        {caps.length === 0 && <p class="dim center">No captions yet. Press {isMac ? 'Option' : 'Alt'} C to add one at the playhead.</p>}
        {caps.map((c) => {
          const current = T >= c.start && T < c.start + c.dur;
          return (
            <div key={c.id} class={`cap-item${current ? ' current' : ''}${selection.value.includes(c.id) ? ' selected' : ''}`}>
              <button
                class="cap-time"
                onClick={() => {
                  seek(c.start);
                  selection.value = [c.id];
                }}
              >
                {formatTimecode(c.start, p.fps).slice(3, 8)}
              </button>
              <textarea
                rows={Math.min(maxLines, Math.max(1, String(c.props.text || '').split('\n').length))}
                value={c.props.text}
                placeholder="Type caption text"
                onFocus={() => {
                  selection.value = [c.id];
                  seek(c.start);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  // Return gir ny linje (opptil maks antall linjer), Cmd/Ctrl Return lagrer.
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || String(e.currentTarget.value).split('\n').length >= maxLines)) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onChange={(e) => {
                  const text = e.currentTarget.value.split('\n').slice(0, maxLines).join('\n');
                  commit((q) => q.clips[c.id] && (q.clips[c.id].props.text = text));
                }}
              />
              <IconButton icon={Trash2} title="Delete caption" size={13} onClick={() => commit((q) => delete q.clips[c.id])} />
            </div>
          );
        })}
      </div>
      <Section title="Caption style" open={false}>
        <CaptionStyleEditor />
      </Section>
    </div>
  );
}
