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
  Plus,
  Rows3,
  Search,
  Sparkles,
  Trash2,
  Type,
  Video,
  Wand2,
} from 'lucide-preact';
import { CAPTION_LANE, EFFECTS, TITLE_TEMPLATES, TRANSITIONS, defaultProps, formatDuration, formatTimecode, makeClip, mediaClipType, newProject, workPath } from '../../shared/model.js';
import { drawFrame } from '../../shared/render.js';
import { parseSrt, toSrt, toVtt } from '../../shared/srt.js';
import { addMediaRecords, projectFolders, audioSkimming, commit, getWave, importPaths, makeCaptionClip, playing, project, selection, skim, skimming, tasks, timeSig, waveVersion } from './store.js';
import { fileUrl, scrubAudio, seek } from './playback.js';
import * as commands from './commands.js';
import { CaptionStyleEditor } from './Inspector.jsx';
import { Button, IconButton, Section, Select, toast } from '../ui.jsx';

const api = window.api;
const isMac = api.platform === 'darwin';

const TABS = [
  { id: 'media', label: 'Media', icon: Clapperboard },
  { id: 'titles', label: 'Titles', icon: Type },
  { id: 'transitions', label: 'Transitions', icon: Blend },
  { id: 'effects', label: 'Effects', icon: Wand2 },
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
        {tab === 'captions' && <CaptionsTab />}
      </div>
    </div>
  );
}

function dragData(e, item) {
  e.dataTransfer.setData('application/x-reccut', JSON.stringify(item));
  e.dataTransfer.effectAllowed = 'copy';
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
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setOver(false);
        const files = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
        await importPaths(files);
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
        <IconButton icon={Rows3} title="Filmstrip view" active={mode === 'filmstrip'} onClick={() => setView('filmstrip')} />
        <IconButton icon={LayoutGrid} title="Grid view" active={mode === 'grid'} onClick={() => setView('grid')} />
      </div>
      {Object.keys(p.media).length > 4 && (
        <div class="search">
          <Search size={13} />
          <input placeholder="Search media" value={query} onInput={(e) => setQuery(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
        </div>
      )}
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
              <FilmstripRow key={m.id} m={m} />
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
        Skim a clip to preview it, drag across it to select a range. Then press E to append, W to insert, Q to connect or D to overwrite at the playhead. Drag the clip name to the timeline.
      </p>
    </div>
  );
}

function MediaCard({ m }) {
  const selected = commands.browserPicked.value.includes(m.id);
  const stream = m.streams.screen || m.streams.main || m.streams.camera;
  const thumb = m.kind === 'image' ? m.streams.main?.proxy || m.path : stream?.thumbs?.files?.[Math.min(stream.thumbs.files.length - 1, 2)];
  const analyzing = tasks.value.some((t) => t.kind === 'analyze' && t.state === 'running' && t.title.includes(m.name));
  const used = Object.values(project.value.clips).some((c) => c.mediaId === m.id);
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
        {m.kind !== 'image' && <span class="dur">{formatDuration(m.duration)}</span>}
        {m.kind === 'recording' && <span class="kind">REC</span>}
        {used && <span class="used" title="Used in the project" />}
        {analyzing && <span class="busy" />}
        <span class="badges">
          <MediaBadges m={m} />
        </span>
      </div>
      <div class="name">{m.name}</div>
    </div>
  );
}

/* Filmstrip: klippet vises som en liten tidslinje du kan skumme og velge et område i */

const skimProjects = new WeakMap();
function skimProjectFor(m) {
  const main = project.value;
  const key = skimProjects.get(m);
  if (key && key.w === main.width && key.h === main.height) return key.p;
  const clip = makeClip(mediaClipType(m), { media: m, start: 0, in: 0, dur: m.kind === 'image' ? 5 : m.duration });
  clip.id = `skim-${m.id}`;
  clip.lane = 0;
  const p = { ...newProject(m.name), width: main.width, height: main.height, media: { [m.id]: m }, clips: { [clip.id]: clip }, primary: [clip.id], duration: clip.dur };
  skimProjects.set(m, { w: main.width, h: main.height, p });
  return p;
}

function fmt(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function FilmstripRow({ m }) {
  const stripRef = useRef(null);
  const lineRef = useRef(null);
  const [width, setWidth] = useState(240);
  const selected = commands.browserPicked.value.includes(m.id);
  const range = commands.browserRange.value?.mediaId === m.id ? commands.browserRange.value : null;
  const stream = m.streams.screen || m.streams.main || m.streams.camera;
  const audio = m.kind === 'recording' ? (m.streams.camera?.hasAudio ? m.streams.camera : m.streams.screen) : m.streams.main;
  const hasAudio = Boolean(audio?.hasAudio);
  const files = m.kind === 'image' ? [m.streams.main?.proxy || m.path] : stream?.thumbs?.files || [];
  const dur = m.kind === 'image' ? 5 : m.duration;
  const used = Object.values(project.value.clips).some((c) => c.mediaId === m.id);
  const lastScrub = useRef(0);
  const drag = useRef(null);

  useEffect(() => {
    const ro = new ResizeObserver(() => setWidth(stripRef.current?.clientWidth || 240));
    ro.observe(stripRef.current);
    return () => ro.disconnect();
  }, []);

  const tileW = 56;
  const n = Math.max(1, Math.floor(width / tileW));
  const tiles = [];
  if (m.kind !== 'audio' && files.length) {
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * dur;
      const idx = m.kind === 'image' ? 0 : Math.max(0, Math.min(files.length - 1, Math.floor(t / (stream.thumbs.interval || 1))));
      tiles.push(<img key={i} src={fileUrl(files[idx])} style={{ width: `${100 / n}%` }} draggable={false} />);
    }
  }
  const timeAt = (e) => {
    const r = stripRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(dur, ((e.clientX - r.left) / r.width) * dur));
  };
  const onMove = (e) => {
    const t = timeAt(e);
    if (lineRef.current) {
      lineRef.current.style.display = 'block';
      lineRef.current.style.left = `${(t / dur) * 100}%`;
    }
    if (drag.current) {
      if (Math.abs(e.clientX - drag.current.x) > 3) drag.current.moved = true;
      if (drag.current.moved) commands.browserRange.value = { mediaId: m.id, in: Math.min(drag.current.t, t), out: Math.max(drag.current.t, t) };
    }
    if (skimming.value && !playing.value) {
      skim.value = { project: skimProjectFor(m), T: Math.min(t, dur - 1e-3), mediaId: m.id };
      const now = performance.now();
      if (audioSkimming.value && hasAudio && now - lastScrub.current > 70) {
        lastScrub.current = now;
        scrubAudio();
      }
    }
  };
  const onLeave = () => {
    if (lineRef.current) lineRef.current.style.display = 'none';
    if (skim.value?.mediaId === m.id) skim.value = null;
  };
  const onDown = (e) => {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      commands.pickMedia(e, m.id, mediaOrder);
      return;
    }
    commands.pickMedia(null, m.id, mediaOrder);
    drag.current = { x: e.clientX, t: timeAt(e), moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onUp = () => {
    if (drag.current && !drag.current.moved) commands.browserRange.value = null;
    drag.current = null;
  };

  return (
    <div class={`film-row${selected ? ' selected' : ''}`} data-media={m.id} onContextMenu={(e) => mediaContextMenu(e, m, used)}>
      <div
        class="film-head"
        draggable
        onDragStart={(e) => dragData(e, { kind: 'media', id: m.id, ids: commands.browserPicked.value.includes(m.id) ? mediaOrder.filter((x) => commands.browserPicked.value.includes(x)) : [m.id] })}
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
        <span class="dur">{range ? `${fmt(range.in)} to ${fmt(range.out)}` : m.kind === 'image' ? 'Still' : formatDuration(m.duration)}</span>
      </div>
      <div class="film-strip" ref={stripRef} onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onDown} onPointerUp={onUp}>
        {m.kind !== 'audio' && <div class={`frames${tiles.length ? '' : ' empty'}`}>{tiles}</div>}
        {hasAudio && <MiniWave stream={audio} offset={audio.offset || 0} dur={dur} tall={m.kind === 'audio'} />}
        {range && <div class="film-range" style={{ left: `${(range.in / dur) * 100}%`, width: `${((range.out - range.in) / dur) * 100}%` }} />}
        <div class="film-skimmer" ref={lineRef} />
      </div>
    </div>
  );
}

function MiniWave({ stream, offset, dur, tall }) {
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
      for (let px = 0; px < cv.width; px++) {
        const t0 = (px / cv.width) * dur - offset;
        const t1 = ((px + 1) / cv.width) * dur - offset;
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
  }, [wave, dur, offset]);
  return <canvas ref={ref} class={`film-wave${tall ? ' tall' : ''}`} />;
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
  const inUse = picked.some((x) => Object.values(project.value.clips).some((c) => c.mediaId === x.id));
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

let samples = null;
function getSamples() {
  if (!samples) samples = { a: sampleCanvas(['#2f6fd6', '#18315f'], 'A'), b: sampleCanvas(['#e0892e', '#7a3f10'], 'B'), scene: sceneCanvas() };
  return samples;
}

const PREVIEW_PROJECT = { width: 320, height: 180, media: { a: { id: 'a', kind: 'image', streams: {} }, b: { id: 'b', kind: 'image', streams: {} }, scene: { id: 'scene', kind: 'image', streams: {} } }, captionStyle: {} };

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
      const img = clip.mediaId === 'b' ? s.b : clip.mediaId === 'scene' ? s.scene : s.a;
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
      const proj = { ...PREVIEW_PROJECT, width: 1920, height: 1080 };
      return { project: proj, frame: { layers: [{ clip: bg, T: t }, { clip: title, T: t }], captions: [] } };
    });
  }
  return titleFrames.get(tpl.id);
}

function TitlesTab() {
  return (
    <>
      <div class="card-grid">
        {TITLE_TEMPLATES.map((tpl) => (
          <button key={tpl.id} class="gen-card" draggable onDragStart={(e) => dragData(e, { kind: 'title', id: tpl.id })} onClick={() => commands.addTitle(tpl.id)} title="Click to add at the playhead, or drag to the timeline">
            <MiniPreview frameAt={titleFrameAt(tpl)} duration={3} still={0.5} label={tpl.label} />
            <span>{tpl.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Hover to preview the animation. Titles are added to the lane above the storyline.</p>
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
          <button key={t.id} class="gen-card" draggable onDragStart={(e) => dragData(e, { kind: 'transition', id: t.id })} onClick={() => commands.addTransition(t.id)} title="Click to add to the selected clip, or drag onto a cut">
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
      const props = { [fx.prop]: fx.def * (0.15 + 0.85 * k), fx: [fx.id] };
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

function EffectsTab() {
  return (
    <>
      <div class="card-grid">
        {EFFECTS.map((fx) => (
          <button key={fx.id} class="gen-card" draggable onDragStart={(e) => dragData(e, { kind: 'effect', id: fx.id })} onClick={() => commands.addEffect(fx.id)} title="Click to add to the selected clips, or drag onto a clip">
            <MiniPreview frameAt={effectFrameAt(fx)} duration={1} still={1} label={fx.label} />
            <span>{fx.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Effect amounts can be keyframed in the Effects tab of the inspector.</p>
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
    const sources = [];
    for (const c of Object.values(p.clips)) {
      if (!c.enabled || c.lane === CAPTION_LANE || !c.mediaId) continue;
      const m = p.media[c.mediaId];
      let stream = null;
      if (c.type === 'recording') stream = m.streams.camera?.hasAudio ? m.streams.camera : m.streams.screen?.hasAudio ? m.streams.screen : null;
      else if (m.streams.main?.hasAudio) stream = m.streams.main;
      if (!stream) continue;
      const off = stream.offset || 0;
      const inT = Math.max(0, c.in - off);
      sources.push({ path: workPath(stream), in: inT, dur: c.dur, start: c.start + Math.max(0, off - c.in) });
    }
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
