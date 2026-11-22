// Transcript Search (Option Space): search what is said in all media, and open the clip at that moment.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CornerDownLeft, MessageSquareText } from 'lucide-preact';
import { formatTimecode } from '../../shared/model.js';
import { searchTranscripts } from '../../shared/speech.js';
import { Button, Select, toast } from '../ui.jsx';
import { isMac } from '../registry.js';
import { handleMissingModel } from '../AiModels.jsx';
import { project } from './store.js';
import { openSource } from './playback.js';
import { LANGS } from './Browser.jsx';
import { speechStream, transcribeAll, transcribing, transcriptSearchOpen } from './transcripts.js';

function Marked({ text, query }) {
  const words = query.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  return text.split(new RegExp(`(${words.join('|')})`, 'gi')).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export function TranscriptSearch() {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [lang, setLang] = useState(localStorage.getItem('captionLang') || 'english');
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const p = project.value;
  const run = transcribing.value;
  const close = () => (transcriptSearchOpen.value = false);
  const speech = Object.values(p.media).filter((m) => speechStream(m));
  const missing = speech.filter((m) => !m.transcript);
  const hits = useMemo(() => searchTranscripts(p.media, query), [p.media, query]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => listRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }), [index]);

  const choose = (h) => {
    if (!h) return;
    close();
    openSource(h.mediaId, h.start);
  };
  const transcribe = (list) => {
    localStorage.setItem('captionLang', lang);
    transcribeAll(list.map((m) => m.id), lang).catch((e) => {
      if (!handleMissingModel(e) && e.message !== 'Canceled') toast(`Transcription failed: ${e.message}`, { kind: 'error' });
    });
  };
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.code === 'Space' && e.altKey)) {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(hits[index]);
    }
  };

  return (
    <div class="modal-backdrop palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div class="palette transcript-search" onKeyDown={onKey}>
        <div class="palette-input">
          <MessageSquareText size={16} />
          <input ref={inputRef} placeholder="Search what is said in your media" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          <span class="palette-target">{speech.length - missing.length} of {speech.length} transcribed</span>
        </div>
        <div class="transcript-bar">
          {run ? (
            <>
              <span>Transcribing {run.done + 1} of {run.total}: {run.name}</span>
              <Button onClick={run.abort}>Stop</Button>
            </>
          ) : (
            <>
              <Select value={lang} options={LANGS} onChange={setLang} title="Spoken language" />
              {missing.length > 0 && <Button variant="primary" onClick={() => transcribe(missing)}>Transcribe {missing.length} {missing.length === 1 ? 'clip' : 'clips'}</Button>}
              {speech.length > missing.length && <Button onClick={() => transcribe(speech)}>Transcribe all again</Button>}
            </>
          )}
        </div>
        <div class="palette-list" ref={listRef}>
          {!speech.length && <p class="dim">No media with sound in this project.</p>}
          {speech.length > 0 && !query && <div class="palette-hint">Type a word or phrase. Enter opens the clip at that moment.</div>}
          {query && hits.length === 0 && <p class="dim">Nothing found.</p>}
          {hits.map((h, i) => (
            <button key={`${h.mediaId}:${h.start}`} class={`palette-item${i === index ? ' active' : ''}`} onPointerMove={() => setIndex(i)} onClick={() => choose(h)}>
              <span class="where tc">{formatTimecode(h.start, p.fps)}</span>
              <span class="label"><Marked text={h.text} query={query} /></span>
              <span class="where">{h.name}</span>
            </button>
          ))}
        </div>
        <footer>
          <span><CornerDownLeft size={12} /> open clip at this moment</span>
          <span>{isMac ? '⌥Space' : 'Alt+Space'} opens and closes</span>
        </footer>
      </div>
    </div>
  );
}
