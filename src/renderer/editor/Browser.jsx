// Mediebibliotek, titler, overganger og undertekster, som nettleseren i Final Cut Pro.
import { useState } from 'preact/hooks';
import {
  Blend,
  Captions,
  Clapperboard,
  FileAudio,
  FileDown,
  FileUp,
  Film,
  Image as ImageIcon,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Video,
} from 'lucide-preact';
import { CAPTION_LANE, TITLE_STYLES, TRANSITIONS, formatDuration, formatTimecode } from '../../shared/model.js';
import { parseSrt, toSrt } from '../../shared/srt.js';
import { addMediaRecords, commit, getTime, importPaths, makeCaptionClip, project, selection, tasks, timeSig } from './store.js';
import { fileUrl, seek } from './playback.js';
import * as commands from './commands.js';
import { Button, IconButton, Segmented, Select, toast } from '../ui.jsx';

const api = window.api;

const TABS = [
  { id: 'media', label: 'Medier', icon: Clapperboard },
  { id: 'titles', label: 'Titler', icon: Type },
  { id: 'transitions', label: 'Overganger', icon: Blend },
  { id: 'captions', label: 'Undertekster', icon: Captions },
];

export function Browser() {
  const [tab, setTab] = useState('media');
  return (
    <div class="browser panel">
      <div class="panel-tabs">
        {TABS.map((t) => (
          <button key={t.id} class={tab === t.id ? 'active' : ''} title={t.label} onClick={() => setTab(t.id)}>
            <t.icon size={15} />
            {tab === t.id && <span>{t.label}</span>}
          </button>
        ))}
      </div>
      <div class="browser-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'titles' && <TitlesTab />}
        {tab === 'transitions' && <TransitionsTab />}
        {tab === 'captions' && <CaptionsTab />}
      </div>
    </div>
  );
}

function dragData(e, item) {
  e.dataTransfer.setData('application/x-obslite', JSON.stringify(item));
  e.dataTransfer.effectAllowed = 'copy';
}

function MediaTab() {
  const p = project.value;
  const items = Object.values(p.media);
  const [over, setOver] = useState(false);

  const addRecording = async () => {
    const recs = await api.listRecordings();
    if (!recs.length) return toast('Ingen opptak funnet ennå.');
    const id = await api.popupMenu(recs.slice(0, 20).map((r) => ({ id: r.path, label: r.name })));
    if (!id) return;
    const media = await api.importRecording(id);
    addMediaRecords([media]);
  };

  return (
    <div
      class={`media-tab${over ? ' drop' : ''}`}
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
          Importer
        </Button>
        <Button variant="ghost" icon={Video} onClick={addRecording}>
          Opptak
        </Button>
      </div>
      {items.length === 0 ? (
        <div class="empty">
          <Film size={28} />
          <p>Dra filer hit, eller trykk Importer.</p>
          <p class="dim">Video, lyd og bilder. Ta opp i Opptak-fanen for å få skjerm og kamera hver for seg.</p>
        </div>
      ) : (
        <div class="media-grid">
          {items.map((m) => (
            <MediaCard key={m.id} m={m} />
          ))}
        </div>
      )}
      <p class="hint small">Velg et klipp og trykk E for å legge til på slutten, W for å sette inn ved spillhodet eller Q for å koble det på over.</p>
    </div>
  );
}

function MediaCard({ m }) {
  const selected = commands.browserSelection.value === m.id;
  const stream = m.streams.screen || m.streams.main || m.streams.camera;
  const thumb = m.kind === 'image' ? m.path : stream?.thumbs?.files?.[Math.min(stream.thumbs.files.length - 1, 2)];
  const analyzing = tasks.value.some((t) => t.kind === 'analyze' && t.state === 'running' && t.title.includes(m.name));
  const Icon = m.kind === 'audio' ? FileAudio : m.kind === 'image' ? ImageIcon : m.kind === 'recording' ? Video : Film;
  const onContext = async (e) => {
    e.preventDefault();
    const used = Object.values(project.value.clips).some((c) => c.mediaId === m.id);
    const id = await api.popupMenu([
      { id: 'append', label: 'Legg til på slutten', accelerator: 'E' },
      { id: 'insert', label: 'Sett inn ved spillhodet', accelerator: 'W' },
      { id: 'connect', label: 'Koble på over', accelerator: 'Q' },
      { separator: true },
      { id: 'reveal', label: api.platform === 'darwin' ? 'Vis i Finder' : 'Vis i Utforsker' },
      { id: 'remove', label: 'Fjern fra prosjektet', enabled: !used },
    ]);
    if (['append', 'insert', 'connect'].includes(id)) {
      commands.browserSelection.value = m.id;
      commands.addBrowserSelection(id);
    } else if (id === 'reveal') api.reveal(m.path);
    else if (id === 'remove') commit((p) => delete p.media[m.id]);
  };
  return (
    <div
      class={`media-card${selected ? ' selected' : ''}`}
      draggable
      onDragStart={(e) => dragData(e, { kind: 'media', id: m.id })}
      onClick={() => (commands.browserSelection.value = m.id)}
      onDblClick={() => {
        commands.browserSelection.value = m.id;
        commands.addBrowserSelection('append');
      }}
      onContextMenu={onContext}
      title={m.path}
    >
      <div class={`thumb k-${m.kind}`}>
        {thumb ? <img src={fileUrl(thumb)} draggable={false} /> : <Icon size={26} />}
        {m.kind !== 'image' && <span class="dur">{formatDuration(m.duration)}</span>}
        {m.kind === 'recording' && <span class="kind">REC</span>}
        {analyzing && <span class="busy" />}
      </div>
      <div class="name">{m.name}</div>
    </div>
  );
}

function TitlesTab() {
  return (
    <div class="card-grid">
      {TITLE_STYLES.map((s) => (
        <button
          key={s.id}
          class="gen-card"
          draggable
          onDragStart={(e) => dragData(e, { kind: 'title', id: s.id })}
          onClick={() => commands.addTitle(s.id)}
          title="Klikk for å legge til ved spillhodet, eller dra til tidslinjen"
        >
          <div class={`title-preview s-${s.id}`}>
            <span class="l1">{s.id === 'lower' ? 'Navn Navnesen' : s.id === 'card' ? 'Kapittel 1' : 'Tittel'}</span>
            {(s.id === 'lower' || s.id === 'card') && <span class="l2">Undertekst</span>}
          </div>
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

function TransitionsTab() {
  return (
    <>
      <div class="card-grid">
        {TRANSITIONS.map((t) => (
          <button
            key={t.id}
            class="gen-card"
            draggable
            onDragStart={(e) => dragData(e, { kind: 'transition', id: t.id })}
            onClick={() => commands.addTransition(t.id)}
            title="Klikk for å legge til på valgt klipp, eller dra til et kutt"
          >
            <div class={`trans-preview tr-${t.id}`}>
              <div class="a" />
              <div class="b" />
            </div>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <p class="hint small">Cmd T legger til krysstoning på valgt klipp. Overganger ligger midt over kuttet.</p>
    </>
  );
}

const LANGS = [
  { value: 'norwegian', label: 'Norsk' },
  { value: 'english', label: 'Engelsk' },
  { value: 'swedish', label: 'Svensk' },
  { value: 'danish', label: 'Dansk' },
  { value: 'german', label: 'Tysk' },
  { value: 'auto', label: 'Oppdag automatisk' },
];

function CaptionsTab() {
  const p = project.value;
  const T = timeSig.value;
  const caps = Object.values(p.clips)
    .filter((c) => c.lane === CAPTION_LANE)
    .sort((a, b) => a.start - b.start);
  const [lang, setLang] = useState(localStorage.getItem('captionLang') || 'norwegian');
  const [model, setModel] = useState(localStorage.getItem('captionModel') || 'base');
  const st = p.captionStyle;
  const running = tasks.value.find((t) => t.kind === 'transcribe' && (t.state === 'running' || t.state === 'queued'));

  const setStyle = (patch) => commit((q) => (q.captionStyle = { ...q.captionStyle, ...patch }));

  const generate = async () => {
    const sources = [];
    for (const c of Object.values(p.clips)) {
      if (!c.enabled || c.lane === CAPTION_LANE || !c.mediaId) continue;
      const m = p.media[c.mediaId];
      let stream = null;
      if (c.type === 'recording') stream = m.streams.camera?.hasAudio ? m.streams.camera : m.streams.screen?.hasAudio ? m.streams.screen : null;
      else if (m.streams.main?.hasAudio) stream = m.streams.main;
      if (!stream) continue;
      const off = c.type === 'recording' ? stream.offset || 0 : 0;
      const inT = Math.max(0, c.in - off);
      sources.push({ path: stream.proxy || stream.path, in: inT, dur: c.dur, start: c.start + Math.max(0, off - c.in) });
    }
    if (!sources.length) return toast('Fant ingen lyd på tidslinjen.');
    if (caps.length && !confirm('Erstatte eksisterende undertekster med nye?')) return;
    localStorage.setItem('captionLang', lang);
    localStorage.setItem('captionModel', model);
    await api.startTranscribe({ sources, duration: p.duration, language: lang, model, projectId: p.id });
    toast('Lager undertekster i bakgrunnen. Første gang lastes talemodellen ned.');
  };

  const importSrt = async () => {
    const file = await api.openFileDialog({ title: 'Importer undertekster', filters: [{ name: 'SRT', extensions: ['srt', 'vtt'] }] });
    if (!file) return;
    const items = parseSrt(await api.readText(file));
    commit((q) => {
      for (const it of items) {
        const c = makeCaptionClip(it.start, it.text, it.end - it.start);
        q.clips[c.id] = c;
      }
    });
    toast(`${items.length} undertekster importert.`);
  };

  const exportSrt = async () => {
    const file = await api.saveFileDialog({ title: 'Eksporter undertekster', defaultPath: `${p.name}.srt`, filters: [{ name: 'SRT', extensions: ['srt'] }] });
    if (!file) return;
    await api.writeText(file, toSrt(caps.map((c) => ({ start: c.start, end: c.start + c.dur, text: c.props.text }))));
    toast('Undertekstene er lagret.', { actions: [{ label: 'Vis', onClick: () => api.reveal(file) }] });
  };

  return (
    <div class="captions-tab">
      <div class="cap-tools">
        <div class="auto-box">
          <div class="auto-head">
            <Sparkles size={15} />
            <b>Automatisk teksting</b>
          </div>
          <div class="auto-row">
            <Select value={lang} options={LANGS} onChange={setLang} />
            <Select
              value={model}
              options={[
                { value: 'base', label: 'Rask' },
                { value: 'small', label: 'Nøyaktig' },
              ]}
              onChange={setModel}
            />
          </div>
          <Button variant="primary" icon={Sparkles} disabled={Boolean(running)} onClick={generate}>
            {running ? `Lager undertekster ${Math.round((running.progress || 0) * 100)} %` : 'Lag undertekster'}
          </Button>
        </div>
        <div class="tab-actions">
          <Button variant="secondary" icon={Plus} onClick={() => commands.addCaption()}>
            Ny
          </Button>
          <IconButton icon={FileUp} title="Importer SRT" onClick={importSrt} />
          <IconButton icon={FileDown} title="Eksporter SRT" onClick={exportSrt} />
        </div>
        <div class="cap-style">
          <Segmented value={st.size} onChange={(v) => setStyle({ size: v })} options={[{ value: 36, label: 'S' }, { value: 44, label: 'M' }, { value: 56, label: 'L' }]} />
          <Segmented value={st.position} onChange={(v) => setStyle({ position: v })} options={[{ value: 'bottom', label: 'Nede' }, { value: 'top', label: 'Oppe' }]} />
          <Segmented value={st.bg !== false} onChange={(v) => setStyle({ bg: v })} options={[{ value: true, label: 'Boks' }, { value: false, label: 'Skygge' }]} />
        </div>
      </div>
      <div class="cap-list">
        {caps.length === 0 && <p class="dim center">Ingen undertekster ennå. Trykk Option C for å legge til ved spillhodet.</p>}
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
                rows={Math.min(3, Math.max(1, Math.ceil((c.props.text || '').length / 32)))}
                value={c.props.text}
                placeholder="Skriv tekst"
                onFocus={() => {
                  selection.value = [c.id];
                  seek(c.start);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onChange={(e) => {
                  const text = e.currentTarget.value;
                  commit((q) => q.clips[c.id] && (q.clips[c.id].props.text = text));
                }}
              />
              <IconButton icon={Trash2} title="Slett" size={13} onClick={() => commit((q) => delete q.clips[c.id])} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
