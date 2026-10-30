// Avspillingsmotor. Hvert aktivt klipp får sitt eget video- eller lydelement,
// som holdes i takt med spillhodet. Bildet tegnes med samme kode som eksporten.
// Redigeringen og eksportfanen har hver sin spiller.
import { computeAudio, computeFrame, instSpeed, sourceTime } from '../shared/model.js';
import { drawFrame } from '../shared/render.js';

const PRELOAD = 1.5;
const KEEP = 6;

export const fileUrl = (p) => `media://file/${encodeURIComponent(p)}`;

const audioCtx = new AudioContext({ latencyHint: 'interactive' });

/**
 * getProject: gir prosjektet som skal spilles.
 * playing: signal med true/false. getTime/setTime: spillhodet.
 */
export function createPlayer({ getProject, playing, getTime, setTime }) {
  const master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  const pool = new Map();
  const images = new Map();
  let canvas = null;
  let ctx = null;
  let rate = 1;
  let clockStart = 0;
  let clockBase = 0;
  let raf = 0;
  let dirty = true;

  function streamFor(clip, key) {
    const m = getProject().media[clip.mediaId];
    const s = m?.streams?.[key];
    if (!s) return null;
    // Baklengs klipp spiller den baklengs kopien framover når den er klar.
    // Spilles tidslinjen bakover, brukes kopien for vanlige klipp, så bilde og lyd går jevnt.
    const backward = playing.value && rate < 0;
    const plain = s.proxy || s.path;
    if (Boolean(clip.reverse) !== backward && s.reversed) return { path: s.reversed, alt: plain, rev: true, D: s.duration, hasVideo: s.hasVideo && m.kind !== 'image', hasAudio: s.hasAudio };
    return { path: plain, alt: s.reversed, rev: false, hasVideo: s.hasVideo && m.kind !== 'image', hasAudio: s.hasAudio };
  }

  function getEl(clip, key) {
    const id = `${clip.id}:${key}`;
    let entry = pool.get(id);
    const stream = streamFor(clip, key);
    if (!stream) return null;
    // Stillestående kan begge kopiene vise riktig bilde, så elementet byttes ikke unødvendig.
    if (entry && entry.path !== stream.path && !(entry.path === stream.alt && !playing.value)) {
      disposeEntry(id, entry);
      entry = null;
    }
    if (!entry) {
      const el = document.createElement(stream.hasVideo ? 'video' : 'audio');
      el.preload = 'auto';
      el.playsInline = true;
      el.crossOrigin = 'anonymous';
      el.src = fileUrl(stream.path);
      el.addEventListener('seeked', () => (dirty = true));
      el.addEventListener('loadeddata', () => (dirty = true));
      let gain = null;
      if (stream.hasAudio) {
        const src = audioCtx.createMediaElementSource(el);
        gain = audioCtx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(master);
      } else el.muted = true;
      entry = { el, gain, path: stream.path, rev: stream.rev, D: stream.D, lastUsed: performance.now(), target: 0 };
      pool.set(id, entry);
    }
    entry.lastUsed = performance.now();
    return entry;
  }

  function disposeEntry(id, entry) {
    entry.el.pause();
    entry.el.removeAttribute('src');
    entry.el.load();
    entry.gain?.disconnect();
    pool.delete(id);
  }

  function getImage(path) {
    let img = images.get(path);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = () => (dirty = true);
      img.src = fileUrl(path);
      images.set(path, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // Kilde for tegnemotoren: elementet som allerede står på riktig sted.
  function getSource(clip, key) {
    const m = getProject().media[clip.mediaId];
    if (m?.kind === 'image') {
      const img = getImage(m.streams?.main?.proxy || m.path);
      return img ? { img, w: img.naturalWidth, h: img.naturalHeight } : null;
    }
    const entry = pool.get(`${clip.id}:${key}`);
    const el = entry?.el;
    if (!el || el.readyState < 2 || !el.videoWidth) return null;
    return { img: el, w: el.videoWidth, h: el.videoHeight };
  }

  // Hvilke strømmer som trengs ved tid T, med kildetid for hver.
  function neededAt(p, T) {
    const out = new Map();
    const frame = computeFrame(p, T, { captions: false });
    const addVisual = (clip, t) => {
      const m = p.media[clip.mediaId];
      if (!m || m.kind === 'image') return;
      const s = sourceTime(clip, t);
      const sp = instSpeed(clip, t - clip.start) * (clip.reverse ? -1 : 1);
      for (const [key, st] of Object.entries(m.streams)) {
        if (st.hasVideo) out.set(`${clip.id}:${key}`, { clip, key, src: s - (st.offset || 0), gain: 0, speed: clip.speed === 0 && !clip.ramp ? 0 : sp });
      }
    };
    for (const l of frame.layers) {
      if (l.transition) {
        if (l.a) addVisual(l.a.clip, T);
        if (l.b) addVisual(l.b.clip, T);
      } else addVisual(l.clip, T);
    }
    for (const a of computeAudio(p, T)) {
      const id = `${a.clip.id}:${a.stream}`;
      const prev = out.get(id);
      out.set(id, { clip: a.clip, key: a.stream, src: a.src, gain: a.gain + (prev?.gain || 0), speed: a.speed ?? 1 });
    }
    return out;
  }

  function sync(T, isPlaying) {
    const p = getProject();
    const active = neededAt(p, T);
    const upcoming = isPlaying ? neededAt(p, T + PRELOAD * Math.sign(rate)) : new Map();
    const seen = new Set();

    const scrubbing = !isPlaying && performance.now() < scrubUntil;
    for (const [id, n] of active) {
      seen.add(id);
      const entry = getEl(n.clip, n.key);
      if (!entry) continue;
      const el = entry.el;
      const dur = el.duration || Infinity;
      // I en baklengs kopi er tiden speilet.
      const src = entry.rev ? (entry.D ?? dur) - n.src : n.src;
      const target = Math.max(0, src);
      // Utenfor filen (for eksempel et J-kutt forbi starten) er det stille.
      const outside = src < -0.01 || target >= dur - 0.01;
      let speed = n.speed ?? 1;
      if (entry.rev) speed = -speed;
      // Elementet spiller framover når retningen i filen er framover. Ellers vises riktig bilde, men stille.
      const eff = rate * speed;
      const moving = isPlaying && eff > 0;
      el.preservesPitch = n.clip.props?.preservePitch !== false;
      if (scrubbing && entry.gain && !outside) {
        // Lyd mens du skummer: et kort utdrag fra der pekeren er.
        if (entry.scrubId !== scrubId) {
          entry.scrubId = scrubId;
          el.playbackRate = 1;
          el.currentTime = target;
          el.play().catch(() => {});
        }
        entry.gain.gain.setTargetAtTime(n.gain, audioCtx.currentTime, 0.005);
        continue;
      }
      if (entry.gain) entry.gain.gain.setTargetAtTime(moving && !outside ? n.gain : 0, audioCtx.currentTime, 0.015);
      if (moving) {
        if (outside) {
          if (!el.paused) el.pause();
          continue;
        }
        const pr = Math.min(16, Math.max(0.0625, eff));
        if (Math.abs(el.playbackRate - pr) > 1e-3) el.playbackRate = pr;
        const drift = Math.abs(el.currentTime - target);
        if (el.paused) {
          if (drift > 0.05) el.currentTime = target;
          el.play().catch(() => {});
        } else if (drift > 0.25 * Math.max(1, eff)) {
          el.currentTime = target;
        }
      } else {
        if (!el.paused) el.pause();
        const t = Math.min(target, Math.max(0, dur - 0.04));
        if (Math.abs(el.currentTime - t) > 0.5 / 60) {
          if (el.seeking) entry.pending = t;
          else el.currentTime = t;
        }
      }
    }
    // Forhåndslast klipp som snart starter, så kuttet blir sømløst.
    for (const [id, n] of upcoming) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = getEl(n.clip, n.key);
      if (!entry) continue;
      if (entry.gain) entry.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
      if (!entry.el.paused) entry.el.pause();
      const base = entry.rev ? (entry.D ?? 0) - n.src : n.src;
      const start = Math.max(0, base - PRELOAD);
      if (Math.abs(entry.el.currentTime - start) > 0.3 && !entry.el.seeking) entry.el.currentTime = start;
    }
    const now = performance.now();
    for (const [id, entry] of pool) {
      if (seen.has(id)) continue;
      if (entry.gain) entry.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
      if (!entry.el.paused) entry.el.pause();
      if (now - entry.lastUsed > KEEP * 1000) disposeEntry(id, entry);
    }
    for (const entry of pool.values()) {
      if (entry.pending != null && !entry.el.seeking) {
        entry.el.currentTime = entry.pending;
        entry.pending = null;
      }
    }
  }

  let scrubUntil = 0;
  let scrubId = 0;
  function scrubAudio(ms = 110) {
    audioCtx.resume();
    scrubId++;
    scrubUntil = performance.now() + ms;
    dirty = true;
  }

  function attachCanvas(el) {
    canvas = el;
    ctx = el ? el.getContext('2d', { alpha: false }) : null;
    dirty = true;
  }

  function resizeCanvas(cssW, cssH) {
    if (!canvas) return;
    const p = getProject();
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(cssW / p.width, cssH / p.height);
    const w = Math.max(2, Math.round(p.width * fit * dpr));
    const h = Math.max(2, Math.round(p.height * fit * dpr));
    const cap = Math.min(1, p.width / w);
    const W = Math.round(w * cap);
    const H = Math.round(h * cap);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    canvas.style.width = `${Math.round(p.width * fit)}px`;
    canvas.style.height = `${Math.round(p.height * fit)}px`;
    dirty = true;
  }

  function draw(T) {
    if (!ctx) return;
    const p = getProject();
    const frame = computeFrame(p, T);
    drawFrame(ctx, p, frame, getSource, { scale: canvas.width / p.width });
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const p = getProject();
    let T = getTime();
    if (playing.value) {
      const now = performance.now();
      T = clockBase + ((now - clockStart) / 1000) * rate;
      if (rate > 0) {
        const end = p.range ? p.range.out : p.duration;
        if (T >= end) {
          T = end;
          pause();
        }
      } else if (T <= 0) {
        T = 0;
        pause();
      }
      setTime(T);
      sync(T, true);
      draw(T);
      dirty = false;
      return;
    }
    sync(T, false);
    if (dirty) {
      draw(T);
      dirty = false;
    }
  }

  function start() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function stopLoop() {
    cancelAnimationFrame(raf);
    raf = 0;
    pause();
  }

  function play(r = 1) {
    audioCtx.resume();
    const p = getProject();
    let T = getTime();
    const end = p.range ? p.range.out : p.duration;
    if (r > 0 && T >= end - 0.05) T = p.range ? p.range.in : 0;
    rate = r;
    clockBase = T;
    clockStart = performance.now();
    setTime(T, { force: true });
    playing.value = true;
  }

  function pause() {
    if (!playing.value) return;
    playing.value = false;
    for (const entry of pool.values()) {
      entry.el.pause();
      entry.gain?.gain.setTargetAtTime(0, audioCtx.currentTime, 0.01);
    }
    setTime(getTime(), { force: true });
    dirty = true;
  }

  function toggle() {
    if (playing.value) pause();
    else play(1);
  }

  function getRate() {
    return playing.value ? rate : 0;
  }

  // J, K og L som i Final Cut Pro: flere trykk gir høyere hastighet.
  function shuttle(dir) {
    if (dir === 0) return pause();
    const cur = getRate();
    let next = dir;
    if (Math.sign(cur) === dir) next = Math.min(8, Math.abs(cur) * 2) * dir;
    play(next);
  }

  function seek(T) {
    const wasPlaying = playing.value;
    setTime(Math.max(0, T), { force: true });
    if (wasPlaying) {
      clockBase = getTime();
      clockStart = performance.now();
    }
    dirty = true;
  }

  function invalidate() {
    dirty = true;
  }

  return { attachCanvas, resizeCanvas, start, stopLoop, play, pause, toggle, getRate, shuttle, seek, scrubAudio, invalidate: () => (dirty = true), dispose };

  function dispose() {
    stopLoop();
    for (const [id, entry] of pool) disposeEntry(id, entry);
  }
}
