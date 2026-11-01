// Bibliotek med medier, titler, overganger, effekter og undertekster, som i Final Cut Pro.
// Forhåndsvisningene tegnes med den ekte tegnemotoren, så de ser ut akkurat som resultatet.
import { useEffect, useRef, useState } from 'preact/hooks';
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
} from 'lucide-preact';
import { findTemplate, templateDefaults } from '../../shared/titletemplates.js';
import { renameSequence, sequenceList, timelines, CAPTION_LANE, EFFECTS, REDACT_MODES, TITLE_TEMPLATES, TRANSITIONS, defaultProps, formatDuration, formatTimecode, makeClip, newProject } from '../../shared/model.js';
import { drawFrame } from '../../shared/render.js';
import { parseSrt, speechSources, toSrt, toVtt } from '../../shared/srt.js';
import { addMediaRecords, switchSequence, usedMedia, projectFolders, audioSkimming, commit, endPreview, getWave, makeCaptionClip, playing, project, selection, skim, skimming, tasks, timeSig, waveVersion } from './store.js';
import { droppedPaths, hasFiles } from '../fileDrop.js';
import { fileUrl, mediaPreviewProject, openSource, scrubAudio, seek } from './playback.js';
import * as commands from './commands.js';
import { FILM_LOOKS } from '../../shared/filmLooks.js';
import { startLibraryDrag } from './libraryDrag.js';
import { CaptionStyleEditor } from './Inspector.jsx';
import { Button, IconButton, Section, Select, toast } from '../ui.jsx';
import { prefs } from '../prefs.js';
import { AUDIO_EFFECTS, AUDIO_FX_CATEGORIES, AUDIO_PRESETS } from '../../shared/audiofx.js';
import { BROWSER_VIDEO_EFFECTS, makeVideoEffect } from '../../shared/videoEffects.js';

const api = window.api;
const isMac = api.platform === 'darwin';

const TABS = [
  { id: 'media', label: 'Media', icon: Clapperboard },
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'transitions', label: 'Transitions', icon: Blend },
  { id: 'effects', label: 'Effects', icon: Wand2 },
  { id: 'audio', label: 'Audio Effects', icon: AudioLines },
  { id: 'captions', label: 'Captions', icon: Captions },
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
      </div>
    </div>
  );
}

function dragData(e, item) {
  if (item.kind === 'media') {
    const ids = item.ids || [item.id];
    item = { ...item, clips: ids.map((id) => ({ id, opts: commands.browserClipOpts(project.value.media[id], ids.length === 1) })) };
  }
  startLibraryDrag(e, item);
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
  const items = Object.values(p.media).filter((m) => !query || m.name.toLowerCase().includes(query.toLowerCase()));
  mediaOrder = items.map((m) => m.id);
  const [over, setOver] = useState(false);
  const [mode, setMode] = useState(localStorage.getItem('browserView') || 'filmstrip');
  const setView = (v) => {
    setMode(v);
    localStorage.setItem('browserView', v);
  };
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
          { id: 'sequence', label: 'New Sequence', accelerator: 'Alt+CmdOrCtrl+N' },
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
        <IconButton icon={Rows3} title="Filmstrip view" active={mode === 'filmstrip'} onClick={() => setView('filmstrip')} />
        <IconButton icon={LayoutGrid} title="Grid view" active={mode === 'grid'} onClick={() => setView('grid')} />
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
            {items.map((m) => (
              <FilmstripRow key={m.id} m={m} span={SPANS[spanIdx]} height={stripH} />
            ))}
          </div>
        ) : (
          <div class="media-grid">
            {items.map((m) => (
              <MediaCard key={m.id} m={m} />
            ))}
          </div>
        )
      )}
      <p class="hint small">
        Skim a clip and press I and O to mark a range, or drag across it. Press E to append, W to insert, Q to connect or D to overwrite at the playhead, or drag the range to the timeline.
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
  const inUse = picked.some((x) => timelines(project.value).some((t) => Object.values(t.clips).some((c) => c.mediaId === x.id)));
  const id = await api.popupMenu([
    { id: 'append', label: 'Append to Storyline', accelerator: 'E' },
    { id: 'insert', label: 'Insert at Playhead', accelerator: 'W' },
    { id: 'connect', label: 'Connect to Storyline', accelerator: 'Q' },
    { id: 'overwrite', label: 'Overwrite at Playhead', accelerator: 'D' },
    { separator: true },
    { id: 'sync', label: 'Synchronize Audio', accelerator: 'Alt+CmdOrCtrl+G', enabled: hasVideo && hasAudio },
    { id: 'unsync', label: 'Remove Synchronized Audio', enabled: synced },
    { id: 'optimize', label: n > 1 ? `Optimize ${n} Clips` : 'Optimize Media', accelerator: 'Shift+CmdOrCtrl+O', enabled: hasVideo },
    { separator: true },
    { id: 'relink', label: m.offline ? 'Relink Missing File…' : 'Relink File…', enabled: n === 1 },
    { id: 'reveal', label: isMac ? 'Reveal in Finder' : 'Show in Explorer', enabled: !m.offline },
    { id: 'remove', label: n > 1 ? `Remove ${n} Clips from Project` : 'Remove from Project', enabled: !inUse },
  ]);
  if (['append', 'insert', 'connect', 'overwrite'].includes(id)) commands.addBrowserSelection(id);
  else if (id === 'sync') commands.syncMediaAudio();
  else if (id === 'unsync') commands.removeSyncedAudio();
  else if (id === 'optimize') commands.optimizeMedia();
  else if (id === 'reveal') api.reveal(m.path);
  else if (id === 'relink') commands.relinkDialog(m.id);
  else if (id === 'remove') {
    commit((p) => picked.forEach((x) => delete p.media[x.id]));
    commands.browserPicked.value = [];
  }
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
      return;
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
    ['Titles', TITLE_TEMPLATES.filter((t) => t.category !== 'Lower Thirds')],
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
      const props = BROWSER_VIDEO_EFFECTS.some((e) => e.type === fx.id)
        ? { vfx: [makeVideoEffect(fx.id)] }
        : { [fx.prop]: fx.def * (0.15 + 0.85 * k), fx: [fx.id] };
      const framed = ['radius', 'shadow', 'border'].includes(fx.id);
      if (framed) props.scale = 0.72;
      const clip = imageClip('scene', 0, 2, props);
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
const FRAME_FX = [
  { id: 'blur', label: 'Blur', desc: 'Blurs the whole picture.' },
  { id: 'pixelate', label: 'Pixelate', desc: 'Pixelates the whole picture.' },
  { id: 'frosted', label: 'Frosted Glass', desc: 'Blur and blocks together.' },
];

function EffectsTab() {
  return (
    <>
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
  const presetCats = ['Repair', 'Space', 'Creative', 'Lo-fi'];
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
      <b>{item.label}</b>
      <span>{item.desc}</span>
    </button>
  );
  return (
    <>
      <div class="search">
        <Search size={13} />
        <input placeholder="Search audio effects" value={q} onInput={(e) => setQ(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      {presetCats.map((cat) => {
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

const LANGS = [
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
  const [model, setModel] = useState(localStorage.getItem('captionModel') || 'base');
  const running = tasks.value.find((t) => t.kind === 'transcribe' && (t.state === 'running' || t.state === 'queued'));
  const maxLines = p.captionStyle?.maxLines || 3;

  const generate = async () => {
    const sources = speechSources(p);
    if (!sources.length) return toast('There is no audio on the timeline to transcribe.');
    if (caps.length && !confirm('Replace the existing captions with new ones?')) return;
    localStorage.setItem('captionLang', lang);
    localStorage.setItem('captionModel', model);
    await api.startTranscribe({ sources, duration: p.duration, language: lang, model, projectId: p.id });
    toast('Transcribing in the background. The speech model is downloaded the first time.');
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
            value={model}
            options={[
              { value: 'base', label: 'Fast' },
              { value: 'small', label: 'Accurate' },
            ]}
            onChange={setModel}
          />
        </div>
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
