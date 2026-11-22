import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Play, Pause, LoaderCircle } from 'lucide-preact';
import { signal } from '@preact/signals';
import { fileUrl } from '../player.js';

const activeVideo = signal('');

const clock = time => {
  const s = Math.max(0, Math.floor(time || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Clicking opts into a local video download. Moving over a loaded preview seeks
// without sound; queued seeks always finish at the latest pointer position.
export function StockVideoPreview({ item, children }) {
  const [src, setSrc] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const active = activeVideo.value;
  const video = useRef(null), alive = useRef(true), busy = useRef(false);
  const target = useRef(null), frame = useRef(0);
  const attachVideo = useCallback(el => {
    const previous = video.current;
    if (previous && previous !== el) { previous.pause(); previous.removeAttribute('src'); previous.load(); }
    video.current = el;
  }, []);
  useEffect(() => { if (active !== item.token) video.current?.pause(); }, [active]);
  useEffect(() => () => {
    alive.current = false;
    cancelAnimationFrame(frame.current);
  }, []);

  const flushSeek = () => {
    const el = video.current;
    if (!el || !el.readyState || el.seeking || target.current === null) return;
    const next = target.current;
    target.current = null;
    if (Math.abs(el.currentTime - next) > .01) el.currentTime = next;
  };
  const seek = next => {
    const el = video.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.pause();
    target.current = Math.max(0, Math.min(Math.max(0, el.duration - .05), next));
    setTime(target.current);
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; flushSeek(); });
  };
  const activate = async () => {
    if (busy.current) return;
    activeVideo.value = item.token;
    const el = video.current;
    if (src && el) {
      target.current = null;
      if (el.paused) el.play().catch(() => {}); else el.pause();
      return;
    }
    busy.current = true; setLoading(true); setError('');
    try {
      const path = await window.api.stockVideoPreview(item.token);
      if (alive.current) setSrc(fileUrl(path));
    } catch (e) {
      if (alive.current) setError(`${e.message} Click to retry.`);
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  };
  const move = e => {
    const el = video.current;
    if (!el || !el.readyState) return;
    const bounds = e.currentTarget.getBoundingClientRect();
    if (bounds.width > 0) seek((e.clientX - bounds.left) / bounds.width * el.duration);
  };
  const label = loading ? 'Downloading video preview…' : !src ? 'Preview video' : playing ? 'Pause preview' : 'Play preview';
  return <div class={`stock-thumb stock-video${src ? ' loaded' : ''}`} role="button" tabIndex={0}
    aria-label={`${label}: ${item.title || 'Stock video'}`} aria-busy={loading}
    title={src ? 'Move left or right to skim. Click to play or pause. Arrow keys step through the video.' : 'Click to download a video preview'}
    onClick={activate} onPointerMove={move}
    onKeyDown={e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); activate(); }
      else if (src && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        const el = video.current;
        seek(e.key === 'Home' ? 0 : e.key === 'End' ? el.duration : (target.current ?? el.currentTime) + (e.key === 'ArrowRight' ? 1 : -1));
      }
    }}>
    {src ? <video ref={attachVideo} src={src} muted loop playsInline crossOrigin="anonymous" preload="auto" draggable={false}
      onLoadedMetadata={e => { const el = e.currentTarget; setDuration(Number.isFinite(el.duration) ? el.duration : 0); }}
      onLoadedData={e => { e.currentTarget.muted = true; if (activeVideo.peek() === item.token) e.currentTarget.play().catch(() => {}); }}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onTimeUpdate={e => { if (target.current === null) setTime(e.currentTarget.currentTime); }}
      onSeeked={e => { if (target.current === null) setTime(e.currentTarget.currentTime); flushSeek(); }}
      onError={() => { setSrc(''); setPlaying(false); setError('This video preview could not be played. Open its source page to watch it.'); }}
    /> : children}
    <span class="stock-video-control" aria-hidden="true">{loading ? <LoaderCircle size={18} class="stock-video-spinner" /> : playing ? <Pause size={18} /> : <Play size={18} />}{!src && <span>{loading ? 'Loading preview…' : 'Preview video'}</span>}</span>
    {src && duration > 0 && <><span class="stock-video-time">{clock(time)} / {clock(duration)}</span><span class="stock-video-progress" style={{ width: `${Math.min(100, time / duration * 100)}%` }} /></>}
    {error && <span class="stock-video-error" role="status">{error}</span>}
  </div>;
}
