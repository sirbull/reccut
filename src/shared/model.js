// Prosjektmodell og rene funksjoner for å regne ut hva som vises og høres
// på et gitt tidspunkt. Brukes av forhåndsvisning, eksport og tester.

export const LAYOUT_ANIM = 0.32;
export const PIP_SIZES = { small: 0.17, medium: 0.23, large: 0.31 };
export const CAPTION_LANE = 1000;

export const TRANSITIONS = [
  { id: 'dissolve', label: 'Krysstoning' },
  { id: 'dip', label: 'Via svart' },
  { id: 'slideLeft', label: 'Skyv til venstre' },
  { id: 'slideRight', label: 'Skyv til høyre' },
  { id: 'wipe', label: 'Tørk' },
  { id: 'zoom', label: 'Zoom' },
];

export const TITLE_STYLES = [
  { id: 'center', label: 'Tittel' },
  { id: 'lower', label: 'Nedre tredjedel' },
  { id: 'top', label: 'Overskrift' },
  { id: 'card', label: 'Tittelkort' },
];

export const FONTS = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'Menlo, Consolas, "Courier New", monospace',
  rounded: '"SF Pro Rounded", ui-rounded, "Arial Rounded MT Bold", "Segoe UI", sans-serif',
};

export const COLOR_LOOKS = [
  { id: 'none', label: 'Ingen', v: { exposure: 0, contrast: 0, saturation: 0, temperature: 0 } },
  { id: 'warm', label: 'Varm', v: { exposure: 0.02, contrast: 0.05, saturation: 0.08, temperature: 0.45 } },
  { id: 'cool', label: 'Kald', v: { exposure: 0, contrast: 0.05, saturation: -0.05, temperature: -0.45 } },
  { id: 'vivid', label: 'Levende', v: { exposure: 0.03, contrast: 0.15, saturation: 0.35, temperature: 0 } },
  { id: 'muted', label: 'Dempet', v: { exposure: 0, contrast: -0.1, saturation: -0.35, temperature: 0.1 } },
  { id: 'bw', label: 'Svart-hvitt', v: { exposure: 0, contrast: 0.2, saturation: -1, temperature: 0 } },
];

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dbToGain = (db) => (db <= -60 ? 0 : Math.pow(10, db / 20));

export function isVisual(clip) {
  return clip.type === 'video' || clip.type === 'image' || clip.type === 'recording' || clip.type === 'title' || clip.type === 'gap';
}

export function clipHasAudio(clip, media) {
  if (clip.type === 'audio') return true;
  if (clip.type === 'video') return Boolean(media?.streams?.main?.hasAudio);
  if (clip.type === 'recording') return Object.values(media?.streams || {}).some((s) => s.hasAudio);
  return false;
}

// Klipp som kan forlenges uten grense (de har ingen kildefil med fast lengde).
export function isElastic(clip) {
  return clip.type === 'image' || clip.type === 'title' || clip.type === 'gap' || clip.type === 'caption';
}

export function newProject(name = 'Nytt prosjekt') {
  return {
    version: 1,
    id: uid(),
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    autoFormat: true,
    media: {},
    clips: {},
    primary: [],
    markers: [],
    range: null,
    lanes: {},
    captionStyle: { size: 44, position: 'bottom', bg: true, color: '#ffffff', font: 'sans' },
    duration: 0,
  };
}

export function defaultProps(type, media) {
  const visual = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, exposure: 0, contrast: 0, saturation: 0, temperature: 0, vFadeIn: 0, vFadeOut: 0 };
  const audio = { volume: 0, aFadeIn: 0, aFadeOut: 0 };
  switch (type) {
    case 'video':
      return { ...visual, ...audio };
    case 'image':
      return { ...visual };
    case 'audio':
      return { ...audio };
    case 'recording': {
      const rec = media?.rec || {};
      return {
        ...visual,
        aFadeIn: 0,
        aFadeOut: 0,
        micVolume: 0,
        sysVolume: 0,
        showCamera: true,
        pipSize: rec.pip?.size || 'medium',
        pipShape: rec.pip?.shape || 'rect',
        mirror: Boolean(rec.pip?.mirror),
        showKeys: rec.overlays?.keys ?? true,
        cursorZoom: rec.overlays?.cursorZoom ?? true,
        showClicks: rec.overlays?.clicks ?? false,
      };
    }
    case 'title':
      return {
        ...visual,
        text: 'Tittel',
        subtext: '',
        style: 'center',
        font: 'sans',
        size: 96,
        weight: 700,
        color: '#ffffff',
        accent: '#0a84ff',
        bg: false,
        bgColor: '#000000',
        anim: 'fade',
      };
    case 'caption':
      return { text: '' };
    default:
      return {};
  }
}

export function makeClip(type, opts = {}) {
  const media = opts.media;
  const clip = {
    id: uid(),
    type,
    mediaId: media?.id ?? null,
    lane: opts.lane ?? 0,
    start: opts.start ?? 0,
    in: opts.in ?? 0,
    dur: opts.dur ?? (media && media.kind !== 'image' ? media.duration : 4),
    enabled: true,
    props: { ...defaultProps(type, media), ...(opts.props || {}) },
    kf: {},
    name: opts.name ?? media?.name ?? null,
  };
  if (type === 'recording' && media?.rec?.layouts) clip.kf.layout = media.rec.layouts.map(([t, v]) => [t, v]);
  return clip;
}

export function mediaClipType(media) {
  return media.kind === 'recording' ? 'recording' : media.kind;
}

/* Nøkkelbilder. Tider lagres i kildetid, slik at de følger innholdet når klippet trimmes. */

export function sourceTime(clip, T) {
  return clip.in + (T - clip.start);
}

export function valueAt(clip, prop, T) {
  const list = clip.kf?.[prop];
  if (!list || !list.length) return clip.props[prop];
  const s = sourceTime(clip, T);
  if (typeof list[0][1] !== 'number' || prop === 'layout') return stepValue(list, s);
  if (s <= list[0][0]) return list[0][1];
  const last = list[list.length - 1];
  if (s >= last[0]) return last[1];
  let lo = 0;
  let hi = list.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const [t0, v0] = list[lo];
  const [t1, v1] = list[hi];
  const k = t1 === t0 ? 0 : (s - t0) / (t1 - t0);
  return v0 + (v1 - v0) * k;
}

function stepValue(list, s) {
  let v = list[0][1];
  for (const [t, val] of list) {
    if (t <= s) v = val;
    else break;
  }
  return v;
}

export function keyframeIndexAt(clip, prop, s, tol = 1 / 60) {
  const list = clip.kf?.[prop];
  if (!list) return -1;
  return list.findIndex(([t]) => Math.abs(t - s) <= tol);
}

export function setKeyframe(clip, prop, s, value) {
  const list = (clip.kf[prop] = clip.kf[prop] || []);
  const i = keyframeIndexAt(clip, prop, s);
  if (i >= 0) list[i][1] = value;
  else {
    list.push([s, value]);
    list.sort((a, b) => a[0] - b[0]);
  }
}

export function removeKeyframe(clip, prop, s) {
  const list = clip.kf?.[prop];
  if (!list) return;
  const i = keyframeIndexAt(clip, prop, s);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) delete clip.kf[prop];
}

/* Oppsett for bilde i bilde, felles for opptak og redigering. */

export function pipRect(layout, lastCorner, W, H, size, shape) {
  if (layout === 1) return { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };
  const base = W * (PIP_SIZES[size] || PIP_SIZES.medium);
  const w = shape === 'rect' || !shape ? base : base * 0.7;
  const h = shape === 'rect' || !shape ? (w * 9) / 16 : w;
  const r = shape === 'circle' ? w / 2 : w * 0.06;
  const m = Math.min(W, H) * 0.025;
  const corner = layout === 2 ? lastCorner : layout;
  const x = corner === 3 || corner === 5 ? m : W - m - w;
  const y = corner === 3 || corner === 4 ? m : H - m - h;
  return { x, y, w, h, r, a: layout === 2 ? 0 : 1 };
}

export function lerpRect(a, b, t) {
  const l = (p, q) => p + (q - p) * t;
  return { x: l(a.x, b.x), y: l(a.y, b.y), w: l(a.w, b.w), h: l(a.h, b.h), r: l(a.r, b.r), a: l(a.a, b.a) };
}

// Kamerarammen ved kildetid s, med myk overgang rett etter hvert oppsettsbytte.
export function cameraRectAt(clip, s, W, H) {
  const list = clip.kf?.layout?.length ? clip.kf.layout : [[0, 6]];
  let idx = 0;
  for (let i = 0; i < list.length; i++) if (list[i][0] <= s) idx = i;
  const cur = list[idx][1];
  const prev = idx > 0 ? list[idx - 1][1] : cur;
  const cornerBefore = (i) => {
    for (let j = i; j >= 0; j--) if (list[j][1] >= 3) return list[j][1];
    return 6;
  };
  const { pipSize, pipShape } = clip.props;
  const to = pipRect(cur, cornerBefore(idx), W, H, pipSize, pipShape);
  const t = idx > 0 || list[0][0] > 0 ? clamp((s - list[idx][0]) / LAYOUT_ANIM, 0, 1) : 1;
  if (t >= 1 || prev === cur) return to;
  const from = pipRect(prev, cornerBefore(idx - 1), W, H, pipSize, pipShape);
  return lerpRect(from, to, easeOutCubic(t));
}

/* Hendelser fra opptaket: musepeker, forstørring, klikk og taster. */

export function cursorAt(list, s) {
  if (!list?.length) return null;
  if (s <= list[0][0]) return [list[0][1], list[0][2]];
  let lo = 0;
  let hi = list.length - 1;
  if (s >= list[hi][0]) return [list[hi][1], list[hi][2]];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (list[mid][0] <= s) lo = mid;
    else hi = mid;
  }
  const a = list[lo];
  const b = list[hi];
  // Lange pauser mellom punkter betyr at pekeren sto stille.
  if (b[0] - a[0] > 0.1) return [a[1], a[2]];
  const k = (s - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export const ZOOM_RAMP = 0.18;

export function zoomAmountAt(zooms, s) {
  let p = 0;
  for (const [a, b] of zooms || []) {
    if (s < a || s > b + ZOOM_RAMP) continue;
    const up = clamp((s - a) / ZOOM_RAMP, 0, 1);
    const down = s > b ? 1 - clamp((s - b) / ZOOM_RAMP, 0, 1) : 1;
    p = Math.max(p, easeOutCubic(Math.min(up, down)));
  }
  return p;
}

export const KEY_LIFE = 1.6;

export function keysAt(keys, s) {
  const out = [];
  for (const [t, label] of keys || []) {
    if (t > s) break;
    if (s - t < KEY_LIFE) out.push({ label, age: s - t });
  }
  return out.slice(-3);
}

export function clicksAt(clicks, s) {
  const out = [];
  for (const [t, x, y] of clicks || []) {
    if (t > s) break;
    if (s - t < 0.5) out.push({ x, y, age: s - t });
  }
  return out;
}

/* Tidslinjen */

export function primaryClips(project) {
  return project.primary.map((id) => project.clips[id]).filter(Boolean);
}

export function relayoutPrimary(project) {
  let t = 0;
  for (const id of project.primary) {
    const c = project.clips[id];
    if (!c) continue;
    c.start = t;
    c.lane = 0;
    t += c.dur;
  }
  updateDuration(project);
}

export function updateDuration(project) {
  let end = 0;
  for (const c of Object.values(project.clips)) end = Math.max(end, c.start + c.dur);
  project.duration = end;
}

export function laneHidden(project, lane) {
  return Boolean(project.lanes?.[lane]?.hidden);
}

export function laneMuted(project, lane) {
  return Boolean(project.lanes?.[lane]?.muted);
}

// En overgang ligger midt over kuttet. Første klipp tones inn fra svart.
export function transitionWindow(clip, hasPrev = true) {
  const d = clip.transition.dur;
  return hasPrev ? [clip.start - d / 2, clip.start + d / 2] : [clip.start, clip.start + d];
}

// Hvilke klipp i hovedsporet som er aktive, med eventuell overgang.
export function primaryAt(project, T) {
  const list = project.primary;
  for (let i = 0; i < list.length; i++) {
    const c = project.clips[list[i]];
    if (!c?.transition) continue;
    const prev = i > 0 ? project.clips[list[i - 1]] : null;
    const [a, b] = transitionWindow(c, Boolean(prev));
    if (T >= a && T < b) {
      const p = clamp((T - a) / (b - a), 0, 1);
      return { transition: { type: c.transition.type, p }, a: prev, b: c };
    }
  }
  for (const id of list) {
    const c = project.clips[id];
    if (c && T >= c.start && T < c.start + c.dur) return { clip: c };
  }
  return null;
}

function fadeEnvelope(clip, T, fin, fout) {
  const local = T - clip.start;
  let g = 1;
  if (fin > 0) g *= clamp(local / fin, 0, 1);
  if (fout > 0) g *= clamp((clip.dur - local) / fout, 0, 1);
  return g;
}

export function visualOpacity(clip, T) {
  const o = valueAt(clip, 'opacity', T) ?? 1;
  return o * fadeEnvelope(clip, T, clip.props.vFadeIn || 0, clip.props.vFadeOut || 0);
}

// Lagene som skal tegnes ved tid T, nederst først.
export function computeFrame(project, T, { captions = true } = {}) {
  const layers = [];
  if (!laneHidden(project, 0)) {
    const p = primaryAt(project, T);
    if (p?.transition) {
      layers.push({
        transition: p.transition,
        a: p.a && p.a.enabled ? { clip: p.a, T } : null,
        b: p.b.enabled ? { clip: p.b, T } : null,
      });
    } else if (p?.clip && p.clip.enabled && p.clip.type !== 'gap') {
      layers.push({ clip: p.clip, T });
    }
  }
  const free = [];
  for (const c of Object.values(project.clips)) {
    if (c.lane > 0 && c.lane < CAPTION_LANE && c.enabled && isVisual(c) && T >= c.start && T < c.start + c.dur && !laneHidden(project, c.lane)) {
      free.push(c);
    }
  }
  free.sort((a, b) => a.lane - b.lane || a.start - b.start);
  for (const c of free) layers.push({ clip: c, T });

  const caps = [];
  if (captions && !laneHidden(project, CAPTION_LANE)) {
    for (const c of Object.values(project.clips)) {
      if (c.type === 'caption' && c.enabled && T >= c.start && T < c.start + c.dur) caps.push(c);
    }
  }
  return { layers, captions: caps };
}

// Lydkilder ved tid T: hvilken fil, hvor i filen og hvor høyt.
export function computeAudio(project, T) {
  const out = [];
  const addClip = (clip, factor) => {
    if (!clip.enabled || laneMuted(project, clip.lane)) return;
    const media = project.media[clip.mediaId];
    if (!media) return;
    const s = sourceTime(clip, T);
    const env = fadeEnvelope(clip, T, clip.props.aFadeIn || 0, clip.props.aFadeOut || 0) * factor;
    if (env <= 0) return;
    if (clip.type === 'recording') {
      for (const [key, stream] of Object.entries(media.streams)) {
        if (!stream.hasAudio) continue;
        const db = valueAt(clip, key === 'camera' ? 'micVolume' : 'sysVolume', T);
        out.push({ clip, stream: key, src: s - (stream.offset || 0), gain: dbToGain(db) * env });
      }
    } else if (clipHasAudio(clip, media)) {
      out.push({ clip, stream: 'main', src: s, gain: dbToGain(valueAt(clip, 'volume', T)) * env });
    }
  };

  if (!laneMuted(project, 0)) {
    const p = primaryAt(project, T);
    if (p?.transition) {
      if (p.a) addClip(p.a, 1 - p.transition.p);
      addClip(p.b, p.transition.p);
    } else if (p?.clip) addClip(p.clip, 1);
  }
  for (const c of Object.values(project.clips)) {
    if (c.lane !== 0 && c.lane < CAPTION_LANE && T >= c.start && T < c.start + c.dur) addClip(c, 1);
  }
  return out;
}

// Alle tidspunkt der noe begynner eller slutter, for navigering og festing.
export function editPoints(project) {
  const set = new Set([0]);
  for (const c of Object.values(project.clips)) {
    set.add(round(c.start));
    set.add(round(c.start + c.dur));
  }
  return [...set].sort((a, b) => a - b);
}

export function round(v, d = 6) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function formatTimecode(t, fps = 30) {
  const sign = t < 0 ? '-' : '';
  t = Math.abs(t);
  const totalFrames = Math.round(t * fps);
  const f = totalFrames % fps;
  const s = Math.floor(totalFrames / fps);
  const p = (n) => String(n).padStart(2, '0');
  return `${sign}${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f)}`;
}

export function formatDuration(t) {
  const s = Math.round(t);
  const p = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h ? `${h}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`;
}
