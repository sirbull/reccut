// Avspillingsmotor. Hvert aktivt klipp får sitt eget video- eller lydelement,
// som holdes i takt med spillhodet. Bildet tegnes med samme kode som eksporten.
// Redigeringen og eksportfanen har hver sin spiller.
import { audioWindow, computeAudio, computeFrame, instSpeed, sideBackgroundMedia, sourceTime, transitionWindow, visualStreams, workPath } from '../shared/model.js';
import { drawFrame } from '../shared/render.js';
import { activeEffects } from '../shared/audiofx.js';
import { prefs, previewResolutionScale } from './prefs.js';

const PRELOAD = 1.5;
const KEEP = 6;

export const fileUrl = (p) => `media://file/${encodeURIComponent(p)}`;

const audioCtx = new AudioContext({ latencyHint: 'interactive' });

// Lydeffektene lastes én gang. Til de er klare, spilles lyden uten effekter.
let fxReady = false;
audioCtx.audioWorklet
  .addModule('audiofx-worklet.js')
  .then(() => (fxReady = true))
  .catch((err) => console.warn('Could not load audio effects', err));

// Kobler effektkjeden til klippet inn mellom kilden og volumet, og sender nye innstillinger.
function applyFx(entry, clip) {
  if (!entry.srcNode) return;
  const list = activeEffects(clip);
  const key = JSON.stringify(list);
  if (key === entry.fxKey) return;
  if (list.length && !entry.fx) {
    if (!fxReady) return;
    entry.fx = new AudioWorkletNode(audioCtx, 'reccut-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    entry.srcNode.disconnect();
    entry.srcNode.connect(entry.fx).connect(entry.gain);
  }
  entry.fxKey = key;
  entry.fx?.port.postMessage(list);
}

/**
 * getProject: gir prosjektet som skal spilles.
 * playing: signal med true/false. getTime/setTime: spillhodet.
 */
export function createPlayer({ getProject, playing, getTime, setTime }) {
  const master = audioCtx.createGain();
  master.connect(audioCtx.destination);
  const pool = new Map();
  const images = new Map();
  const previewSources = new WeakMap();
  let canvas = null;
  let ctx = null;
  let rate = 1;
  let clockStart = 0;
  let clockBase = 0;
  let raf = 0;
  let dirty = true;
  let staging = null;
  let canvasProjectId = null;
  let preloadProject = null;
  let preloadPoints = [];

  function streamFor(clip, key) {
    const m = getProject().media[clip.mediaId];
    const s = m?.streams?.[key];
    if (!s) return null;
    // Baklengs klipp spiller den baklengs kopien framover når den er klar.
    // Spilles tidslinjen bakover, brukes kopien for vanlige klipp, så bilde og lyd går jevnt.
    const backward = playing.value && rate < 0;
    const plain = workPath(s);
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
      let gain = null;
      let srcNode = null;
      if (stream.hasAudio) {
        srcNode = audioCtx.createMediaElementSource(el);
        gain = audioCtx.createGain();
        gain.gain.value = 0;
        srcNode.connect(gain).connect(master);
      } else el.muted = true;
      entry = { el, gain, srcNode, fx: null, fxKey: '[]', path: stream.path, rev: stream.rev, D: stream.D, lastUsed: performance.now(), target: null, frame: null, hasFrame: false };
      pool.set(id, entry);
      el.addEventListener('seeked', () => {
        rememberFrame(entry);
        dirty = true;
      });
      el.addEventListener('loadeddata', () => {
        if (entry.target != null && Math.abs(el.currentTime - entry.target) < 0.05) rememberFrame(entry);
        dirty = true;
      });
      el.addEventListener('error', () => (dirty = true));
    }
    entry.lastUsed = performance.now();
    return entry;
  }

  function disposeEntry(id, entry) {
    entry.el.pause();
    entry.el.removeAttribute('src');
    entry.el.load();
    entry.gain?.disconnect();
    entry.fx?.disconnect();
    entry.srcNode?.disconnect();
    if (entry.frame) entry.frame.width = entry.frame.height = 0;
    pool.delete(id);
  }

  // Videoelementet kan miste det tegnbare bildet under søking. Behold et bilde i
  // visningsoppløsning, og erstatt det når dekoderen har levert neste bilde.
  function rememberFrame(entry) {
    const el = entry.el;
    if (el.seeking || el.readyState < 2 || !el.videoWidth) return;
    const fit = Math.min(1, (canvas?.width || 1280) / el.videoWidth, (canvas?.height || 720) / el.videoHeight);
    const w = Math.max(2, Math.round(el.videoWidth * fit));
    const h = Math.max(2, Math.round(el.videoHeight * fit));
    const frame = entry.frame ||= document.createElement('canvas');
    if (frame.width !== w || frame.height !== h) {
      frame.width = w;
      frame.height = h;
    }
    frame.getContext('2d').drawImage(el, 0, 0, w, h);
    entry.hasFrame = true;
  }

  function seekEntry(entry, target, tolerance = 0.5 / 60) {
    const el = entry.el;
    entry.target = target;
    // Bare ett søk om gangen. Neste runde bruker alltid nyeste pekertid, slik at
    // et gammelt ventende søk aldri kan flytte elementet tilbake igjen.
    if (el.seeking || Math.abs(el.currentTime - target) <= tolerance) return;
    if (entry.hasFrame) rememberFrame(entry);
    el.currentTime = target;
  }

  function getImage(path) {
    let img = images.get(path);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = () => (dirty = true);
      img.onerror = () => (dirty = true);
      img.src = fileUrl(path);
      images.set(path, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // Skaler før fargekorrigering og kildeeffekter, så også disse behandler færre piksler.
  function previewSource(src) {
    if (!canvas || previewResolutionScale() === 1) return src;
    const scale = Math.min(1, canvas.width / src.w, canvas.height / src.h);
    if (scale >= 1) return src;
    const w = Math.max(2, Math.round(src.w * scale));
    const h = Math.max(2, Math.round(src.h * scale));
    let frame = previewSources.get(src.img);
    if (!frame) {
      frame = document.createElement('canvas');
      previewSources.set(src.img, frame);
    }
    if (frame.width !== w || frame.height !== h) {
      frame.width = w;
      frame.height = h;
    }
    const g = frame.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.drawImage(src.img, 0, 0, w, h);
    return { img: frame, w, h, pixelScale: (src.pixelScale ?? 1) * scale };
  }

  // Kilde for tegnemotoren: elementet som allerede står på riktig sted.
  function getSource(clip, key) {
    const m = key === 'background' ? sideBackgroundMedia(getProject(), clip) : getProject().media[clip.mediaId];
    if (m?.kind === 'image') {
      const img = getImage(m.streams?.main?.proxy || m.path);
      return img ? previewSource({ img, w: img.naturalWidth, h: img.naturalHeight }) : null;
    }
    const entry = pool.get(`${clip.id}:${key}`);
    const el = entry?.el;
    if (!el) return null;
    // En proxy er mindre enn originalen. Effekter i piksler (blur) skaleres, så de ser ut som i eksporten.
    const sh = m?.streams?.[key]?.height;
    const proxyScale = sh && el.videoHeight ? el.videoHeight / sh : 1;
    if (!el.seeking && el.readyState >= 2 && el.videoWidth) {
      entry.hasFrame = true;
      return previewSource({ img: el, w: el.videoWidth, h: el.videoHeight, pixelScale: proxyScale });
    }
    return entry.frame ? previewSource({ img: entry.frame, w: entry.frame.width, h: entry.frame.height, pixelScale: (proxyScale * entry.frame.width) / (el.videoWidth || entry.frame.width) }) : null;
  }

  function upcomingAt(p, T) {
    if (preloadProject !== p) {
      preloadProject = p;
      const points = new Set();
      for (const clip of Object.values(p.clips)) {
        points.add(clip.start);
        points.add(clip.start + clip.dur);
        for (const t of audioWindow(clip)) points.add(t);
      }
      p.primary.forEach((id, i) => {
        const c = p.clips[id];
        if (c?.transition) for (const t of transitionWindow(c, i > 0, p.clips[p.primary[i - 1]])) points.add(t);
        if (c?.transitionOut) for (const t of transitionWindow(c, false, null, 'end')) points.add(t);
      });
      preloadPoints = [...points].sort((a, b) => a - b);
    }
    const dir = Math.sign(rate) || 1;
    const horizon = PRELOAD * Math.max(1, Math.abs(rate));
    const from = Math.min(T, T + dir * horizon);
    const to = Math.max(T, T + dir * horizon);
    let lo = 0;
    let hi = preloadPoints.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (preloadPoints[mid] < from) lo = mid + 1;
      else hi = mid;
    }
    const points = [];
    for (let i = lo; i < preloadPoints.length && preloadPoints[i] <= to; i++) {
      if (preloadPoints[i] !== T) points.push(preloadPoints[i]);
    }
    if (dir < 0) points.reverse();
    const out = new Map();
    for (const t of points) {
      // Last første bildet som faktisk brukes, også for korte, trimmede og
      // hastighetsendrede klipp, overganger og avspilling bakover.
      for (const [id, n] of neededAt(p, t + dir * 1e-6)) if (!out.has(id)) out.set(id, n);
    }
    return out;
  }

  // Hvilke strømmer som trengs ved tid T, med kildetid for hver.
  function neededAt(p, T) {
    const out = new Map();
    const frame = computeFrame(p, T, { captions: false });
    const addVisual = (clip, t) => {
      const m = p.media[clip.mediaId];
      if (!m || m.kind === 'image' || m.offline) return;
      const s = sourceTime(clip, t);
      const sp = instSpeed(clip, t - clip.start) * (clip.reverse ? -1 : 1);
      for (const [key, st] of visualStreams(clip, m)) {
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
    const upcoming = upcomingAt(p, T);
    const seen = new Set();

    const scrubbing = !isPlaying && performance.now() < scrubUntil;
    for (const [id, n] of active) {
      seen.add(id);
      const entry = getEl(n.clip, n.key);
      if (!entry) continue;
      if (entry.gain) applyFx(entry, n.clip);
      const el = entry.el;
      const dur = el.duration || Infinity;
      // I en baklengs kopi er tiden speilet.
      const src = entry.rev ? (entry.D ?? dur) - n.src : n.src;
      const target = Math.min(Math.max(0, src), Math.max(0, dur - 0.001));
      // Utenfor filen (for eksempel et J-kutt forbi starten) er det stille.
      const outside = src < -0.01 || src >= dur - 0.01;
      let speed = n.speed ?? 1;
      if (entry.rev) speed = -speed;
      // Elementet spiller framover når retningen i filen er framover. Ellers vises riktig bilde, men stille.
      const eff = rate * speed;
      const moving = isPlaying && eff > 0;
      el.preservesPitch = n.clip.props?.preservePitch !== false;
      if (scrubbing && entry.gain && !outside) {
        // Lyd mens du skummer: et kort utdrag fra der pekeren er.
        seekEntry(entry, target);
        if (entry.scrubId !== scrubId) {
          entry.scrubId = scrubId;
          el.playbackRate = 1;
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
          seekEntry(entry, target, 0.05);
          el.play().catch(() => {});
        } else if (drift > 0.25 * Math.max(1, eff)) {
          seekEntry(entry, target);
        }
      } else {
        if (!el.paused) el.pause();
        seekEntry(entry, target);
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
      const dur = entry.el.duration || Infinity;
      const base = entry.rev ? (entry.D ?? dur) - n.src : n.src;
      seekEntry(entry, Math.min(Math.max(0, base), Math.max(0, dur - 0.001)));
    }
    const now = performance.now();
    for (const [id, entry] of pool) {
      if (seen.has(id)) continue;
      if (entry.gain) entry.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.015);
      if (!entry.el.paused) entry.el.pause();
      if (now - entry.lastUsed > KEEP * 1000) disposeEntry(id, entry);
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

  // cap: høyeste skala mot prosjektet, så eksportvisningen ikke tegner skarpere enn filen blir.
  function resizeCanvas(cssW, cssH, cap = 1) {
    if (!canvas) return;
    const p = getProject();
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(cssW / p.width, cssH / p.height);
    // Reduser etter at full oppløsning er begrenset, også i fullskjerm på Retina.
    const scale = Math.min(1, fit * dpr, cap) * previewResolutionScale();
    const W = Math.max(2, Math.round(p.width * scale));
    const H = Math.max(2, Math.round(p.height * scale));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    canvas.style.width = `${Math.round(p.width * fit)}px`;
    canvas.style.height = `${Math.round(p.height * fit)}px`;
    dirty = true;
  }

  function draw(T) {
    if (!ctx) return false;
    const p = getProject();
    // Ved bytte mellom kilde og tidslinje skal forrige video aldri bli stående
    // mens den nye dekodes. Innen samme prosjekt beholdes bildet ved scrubbing.
    if (canvasProjectId !== p.id) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvasProjectId = p.id;
    }
    const frame = computeFrame(p, T);
    staging ||= document.createElement('canvas');
    if (staging.width !== canvas.width || staging.height !== canvas.height) {
      staging.width = canvas.width;
      staging.height = canvas.height;
    }
    let waiting = false;
    drawFrame(staging.getContext('2d', { alpha: false }), p, frame, (clip, key) => {
      const src = getSource(clip, key);
      if (!src) {
        const media = key === 'background' ? sideBackgroundMedia(p, clip) : p.media[clip.mediaId];
        const el = pool.get(`${clip.id}:${key}`)?.el;
        if (media?.kind === 'image') {
          const image = images.get(media.streams?.main?.proxy || media.path);
          if (image && !image.complete) waiting = true;
        } else if (el && !el.error) waiting = true;
      }
      return src;
    }, { scale: canvas.width / p.width });
    // Ikke tøm det synlige bildet før alle lagene er klare. Tomme områder og
    // bevisste toninger til svart tegnes som normalt.
    if (waiting) return false;
    ctx.drawImage(staging, 0, 0);
    return true;
  }

  // Området avspillingen holder seg innenfor. Et område på et par bilder (O helt i starten gir ett)
  // ville hoppet til start og stoppet med en gang, så det gjelder ikke for avspilling.
  function playRange(p) {
    return p.range && p.range.out - p.range.in > 0.05 ? p.range : { in: 0, out: p.duration };
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const p = getProject();
    let T = getTime();
    if (playing.value) {
      const now = performance.now();
      T = clockBase + ((now - clockStart) / 1000) * rate;
      if (rate > 0) {
        const r = playRange(p);
        const end = r.out;
        if (T >= end) {
          if (prefs.value.loopPlayback && end > 0) {
            // Avspilling i løkke: tilbake til starten av området eller tidslinjen.
            T = r.in;
            clockBase = T;
            clockStart = now;
          } else {
            T = end;
            pause();
          }
        }
      } else if (T <= 0) {
        T = 0;
        pause();
      }
      setTime(T);
      sync(T, true);
      dirty = !draw(T);
      return;
    }
    sync(T, false);
    if (dirty) {
      dirty = !draw(T);
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
    const range = playRange(p);
    if (r > 0 && T >= range.out - 0.05) T = range.in;
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

  // snapshot: the viewer canvas once the current time is fully drawn, for AI previews.
  return { attachCanvas, resizeCanvas, start, stopLoop, play, pause, toggle, getRate, shuttle, seek, scrubAudio, invalidate: () => (dirty = true), snapshot: () => (!dirty && canvas) || null, dispose };

  function dispose() {
    stopLoop();
    for (const [id, entry] of pool) disposeEntry(id, entry);
    images.clear();
    staging = null;
    preloadProject = null;
  }
}
