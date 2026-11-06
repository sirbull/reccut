// Filbrowseren i importvinduet, litt som Finder: steder til venstre, mappen i midten med miniatyrbilder,
// og forhåndsvisning til høyre. Kryss av filene som skal importeres, også fra flere mapper.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowUp, Check, FileAudio, Film, Folder, HardDrive, House, Image as ImageIcon } from 'lucide-preact';
import { formatDuration } from '../../shared/model.js';
import { fileUrl } from './playback.js';
import { isTyping } from '../keyboard.js';
import { audioSink } from '../prefs.js';
import { Select } from '../ui.jsx';

const api = window.api;
const infos = new Map(); // fil -> { thumb, duration, width, height } fra main, gjelder hele økten
const KIND_ICON = { folder: Folder, video: Film, audio: FileAudio, image: ImageIcon };
const WEB_IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;

// Mapper først når man sorterer på navn eller type, ellers blandet med filene slik som i Finder.
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });
const foldersFirst = (a, b) => (b.kind === 'folder') - (a.kind === 'folder');
const SORTS = {
  name: { label: 'Name', cmp: (a, b) => foldersFirst(a, b) || byName(a, b) },
  newest: { label: 'Newest first', cmp: (a, b) => b.modified - a.modified || byName(a, b) },
  oldest: { label: 'Oldest first', cmp: (a, b) => a.modified - b.modified || byName(a, b) },
  largest: { label: 'Largest first', cmp: (a, b) => -foldersFirst(a, b) || b.size - a.size || byName(a, b) },
  smallest: { label: 'Smallest first', cmp: (a, b) => -foldersFirst(a, b) || a.size - b.size || byName(a, b) },
  kind: { label: 'Kind', cmp: (a, b) => foldersFirst(a, b) || a.kind.localeCompare(b.kind) || byName(a, b) },
};
const SORT_OPTIONS = Object.entries(SORTS).map(([value, s]) => ({ value, label: s.label }));

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function crumbs(dir) {
  const sep = dir.includes('\\') ? '\\' : '/';
  const parts = dir.split(/[\\/]/).filter(Boolean);
  const out = [];
  let acc = sep === '/' ? '' : `${parts.shift()}\\`;
  if (sep === '/') out.push({ label: '/', path: '/' });
  else out.push({ label: acc, path: acc });
  for (const p of parts) {
    acc = sep === '/' ? `${acc}/${p}` : `${acc}${acc.endsWith('\\') ? '' : '\\'}${p}`;
    out.push({ label: p, path: acc });
  }
  return out;
}

const formatSize = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(0)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

function useInfo(entry, ref) {
  const [info, setInfo] = useState(() => infos.get(entry.path) || null);
  useEffect(() => {
    if (entry.kind === 'folder' || infos.has(entry.path)) return;
    const el = ref.current;
    // Miniatyrbildet lages først når ruten er synlig, så store mapper ikke starter hundrevis av FFmpeg.
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      api.browseThumb(entry.path).then((r) => {
        infos.set(entry.path, r || {});
        setInfo(r || {});
      });
    });
    io.observe(el);
    return () => io.disconnect();
  }, [entry.path]);
  return info;
}

function Tile({ entry, checked, focused, onPick, onToggle, onOpen }) {
  const ref = useRef(null);
  const info = useInfo(entry, ref);
  const Icon = KIND_ICON[entry.kind];
  const folder = entry.kind === 'folder';
  const thumb = info?.thumb ? fileUrl(info.thumb) : entry.kind === 'image' && WEB_IMAGE.test(entry.name) ? fileUrl(entry.path) : null;
  return (
    <div
      ref={ref}
      class={`ib-tile${checked ? ' checked' : ''}${focused ? ' focused' : ''}${folder ? ' folder' : ''}`}
      title={entry.path}
      onClick={(e) => (folder ? onOpen(entry.path) : onPick(entry, e))}
      onDblClick={() => !folder && onToggle(entry.path)}
    >
      <div class="ib-thumb">
        {thumb ? <img src={thumb} alt="" loading="lazy" draggable={false} /> : <Icon size={folder ? 40 : 28} />}
        {!folder && (
          <button
            class="ib-check"
            aria-label={checked ? `Do not import ${entry.name}` : `Import ${entry.name}`}
            aria-pressed={checked}
            onClick={(e) => {
              e.stopPropagation();
              onPick(entry, e, true);
            }}
          >
            {checked && <Check size={13} strokeWidth={3} />}
          </button>
        )}
        {info?.duration > 0 && entry.kind !== 'image' && <span class="ib-dur">{formatDuration(info.duration)}</span>}
      </div>
      <span class="ib-name">{entry.name}</span>
    </div>
  );
}

const applySink = (el) => el?.setSinkId(audioSink.value).catch(() => {});

function Preview({ entry }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [entry?.path]);
  if (!entry) return <div class="ib-preview empty">Click a file to preview it.</div>;
  const info = infos.get(entry.path);
  const thumb = info?.thumb ? fileUrl(info.thumb) : null;
  let view;
  if (entry.kind === 'video' && !failed) view = <video key={entry.path} ref={applySink} src={fileUrl(entry.path)} poster={thumb} controls autoPlay onError={() => setFailed(true)} />;
  else if (entry.kind === 'audio') view = <audio key={entry.path} ref={applySink} src={fileUrl(entry.path)} controls autoPlay />;
  else if (entry.kind === 'image' && WEB_IMAGE.test(entry.name)) view = <img src={fileUrl(entry.path)} alt="" />;
  else view = thumb ? <img src={thumb} alt="" /> : <Film size={32} />;
  const meta = [info?.width ? `${info.width} × ${info.height}` : null, info?.duration > 0 && entry.kind !== 'image' ? formatDuration(info.duration) : null, formatSize(entry.size)].filter(Boolean).join(' · ');
  return (
    <div class="ib-preview">
      <div class="ib-preview-view">{view}</div>
      <b title={entry.path}>{entry.name}</b>
      <span>{meta}</span>
    </div>
  );
}

export function ImportBrowser({ paths, onChange, children }) {
  const [places, setPlaces] = useState({ places: [], volumes: [] });
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [focused, setFocused] = useState(null);
  const [sort, setSort] = useState(() => (SORTS[readStored('importSort')] ? readStored('importSort') : 'name'));
  const changeSort = (value) => {
    setSort(value);
    try {
      localStorage.setItem('importSort', value);
    } catch {}
  };

  const open = async (dir) => {
    try {
      setListing(await api.browseDir(dir));
      setError(null);
      setFocused(null);
      try {
        localStorage.setItem('importDir', dir);
      } catch {}
    } catch (err) {
      setError(`Could not open ${dir}: ${err.message}`);
    }
  };

  useEffect(() => {
    api.browsePlaces().then(async (p) => {
      setPlaces(p);
      const fallback = p.start;
      const stored = readStored('importDir');
      // Mappen fra sist kan være på en disk som ikke er koblet til lenger.
      const ok = stored && (await api.browseDir(stored).then(() => true, () => false));
      open(ok ? stored : fallback);
    });
  }, []);

  const checked = new Set(paths);
  const toggle = (path) => onChange(checked.has(path) ? paths.filter((x) => x !== path) : [...paths, path]);
  const entries = listing ? [...listing.entries].sort(SORTS[sort].cmp) : [];
  const files = entries.filter((e) => e.kind !== 'folder');
  const allChecked = files.length > 0 && files.every((e) => checked.has(e.path));
  const add = (list) => onChange([...new Set([...paths, ...list.map((e) => e.path)])]);
  const setAll = () => (allChecked ? onChange(paths.filter((x) => !files.some((e) => e.path === x))) : add(files));

  // Som i Finder: Shift-klikk merker alt fra forrige klikk, Cmd/Ctrl-klikk (og avkrysningsboksen) slår av og på én fil.
  const anchor = useRef(null);
  const pick = (entry, e, box = false) => {
    const from = files.findIndex((f) => f.path === anchor.current);
    if (e.shiftKey && from >= 0) {
      const to = files.findIndex((f) => f.path === entry.path);
      add(files.slice(Math.min(from, to), Math.max(from, to) + 1));
      return;
    }
    anchor.current = entry.path;
    if (box || e.metaKey || e.ctrlKey) toggle(entry.path);
    if (!box) setFocused(entry);
  };

  const onKeyDown = (e) => {
    if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && !isTyping(e)) {
      e.preventDefault();
      add(files);
    } else if (e.key === ' ' && focused) {
      e.preventDefault();
      toggle(focused.path);
    } else if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey) && listing?.parent) {
      open(listing.parent);
    }
  };

  const place = (p, Icon) => (
    <button key={p.path} class={`ib-place${listing?.dir === p.path ? ' on' : ''}`} onClick={() => open(p.path)} title={p.path}>
      <Icon size={14} />
      <span>{p.label}</span>
    </button>
  );

  return (
    <div class="ib" tabIndex={0} onKeyDown={onKeyDown}>
      <aside class="ib-places">
        <h4>Favorites</h4>
        {places.places.map((p) => place(p, p.path === places.home ? House : Folder))}
        {places.volumes.length > 0 && <h4>Devices</h4>}
        {places.volumes.map((p) => place(p, HardDrive))}
      </aside>
      <div class="ib-main">
        <div class="ib-bar">
          <button class="ib-up" disabled={!listing?.parent} onClick={() => open(listing.parent)} title="Enclosing folder">
            <ArrowUp size={14} />
          </button>
          <div class="ib-crumbs">
            {listing &&
              crumbs(listing.dir).map((c, i, all) => (
                <button key={c.path} class={i === all.length - 1 ? 'on' : ''} onClick={() => open(c.path)}>
                  {c.label}
                </button>
              ))}
          </div>
          <Select value={sort} options={SORT_OPTIONS} onChange={changeSort} title="Sort by" />
          <button class="link" disabled={!files.length} onClick={setAll}>
            {allChecked ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div class="ib-grid">
          {error && <p class="hint">{error}</p>}
          {listing && !listing.entries.length && <p class="hint">No folders or media files here.</p>}
          {entries.map((e) => (
            <Tile key={e.path} entry={e} checked={checked.has(e.path)} focused={focused?.path === e.path} onPick={pick} onToggle={toggle} onOpen={open} />
          ))}
        </div>
      </div>
      <div class="ib-side">
        <Preview entry={focused} />
        <div class="ib-selected">
          <span>{paths.length ? `${paths.length} file${paths.length === 1 ? '' : 's'} to import` : 'Check the files to import.'}</span>
          {paths.length > 0 && (
            <button class="link" onClick={() => onChange([])}>
              Clear
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
