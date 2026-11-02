import { signal } from '@preact/signals';
import { formatTimecode, kfTime, setKeyframe, sourceTime, uid, valueAt, workPath } from '../../shared/model.js';
import { streamOf, trackSample, videoMatrix } from '../../shared/follow.js';
import { groupClips } from '../../shared/ops.js';
import { clipMatrix, shapeAt } from '../../shared/shapes.js';
import { commit, getTime, project } from './store.js';
import { toast } from '../ui.jsx';

const api = window.api;

// Sporing i to steg:
//   1. Et område i et video- eller opptaksklipp følges (src/main/motion.js). Sporet lagres på
//      klippet (props.tracks), i kildefilens tid og bilde, så det kan brukes senere.
//   2. Et annet klipp (sladd, tittel, bilde, video) festes til sporet, enten som lineære
//      nøkkelbilder for posisjon, rotasjon og skala, eller som levende kobling (props.follow,
//      se src/shared/follow.js) som alltid bruker sporet slik det er nå.

// Klippet som viser sporingsområdet i bildet. Sladding bruker sin egen form som område.
export const trackArea = signal(null);

const isSource = (p, c) => c.type === 'video' || (c.type === 'recording' && c.recordingPart !== 'camera' && Boolean(p.media[c.mediaId]?.streams?.screen));

// Det øverste video- eller skjermopptaksklippet under klippet ved tid T.
function baseClip(p, clip, T) {
  let best = null;
  for (const c of Object.values(p.clips)) {
    if (c.enabled === false || c.lane < 0 || c.lane >= clip.lane || T < c.start || T >= c.start + c.dur || !isSource(p, c)) continue;
    if (!best || c.lane > best.lane) best = c;
  }
  return best;
}

// Området som følges, i prosjektets bilde: { cx, cy, w, h, a }. Sladding bruker sin form,
// andre klipp området "track." (i klippets rom, så det følger klippet).
function regionAt(p, clip, T) {
  const W = p.width;
  const H = p.height;
  if (clip.type === 'redact') {
    const g = shapeAt(clip, '', clip.props.shape || 'rect', T, W, H);
    const flat = g.shape === 'path' ? valueAt(clip, 'points', T) : null;
    if (!flat) return { cx: g.cx, cy: g.cy, w: g.w, h: g.h, a: g.rot };
    const ext = (o) => 2 * Math.max(...flat.filter((_, i) => i % 2 === o).map(Math.abs));
    return { cx: g.cx, cy: g.cy, w: ext(0), h: ext(1), a: g.rot };
  }
  const g = shapeAt(clip, 'track.', 'rect', T, W, H);
  const m = clipMatrix(clip, T, W, H);
  const c = m.transformPoint(new DOMPoint(g.cx, g.cy));
  const k = Math.hypot(m.a, m.b);
  return { cx: c.x, cy: c.y, w: g.w * k, h: g.h * k, a: g.rot + Math.atan2(m.b, m.a) };
}

// Indeksene som trengs for at rette linjer mellom dem holder seg innenfor tol (Ramer-Douglas-Peucker).
export function simplify(ts, vs, tol) {
  const out = new Set([0, ts.length - 1]);
  const rec = (i, j) => {
    let worst = -1;
    let d = tol;
    for (let k = i + 1; k < j; k++) {
      const e = Math.abs(vs[i] + ((vs[j] - vs[i]) * (ts[k] - ts[i])) / (ts[j] - ts[i]) - vs[k]);
      if (e > d) {
        d = e;
        worst = k;
      }
    }
    if (worst < 0) return;
    out.add(worst);
    rec(i, worst);
    rec(worst, j);
  };
  rec(0, ts.length - 1);
  return [...out].sort((a, b) => a - b);
}

/** Alle spor som et klipp kan festes til: spor på video- og opptaksklipp under det, som overlapper i tid. */
export function tracksFor(p, clip) {
  const out = [];
  for (const v of Object.values(p.clips)) {
    if (v.id === clip.id || v.lane < 0 || v.lane >= clip.lane || v.start >= clip.start + clip.dur || v.start + v.dur <= clip.start) continue;
    for (const t of v.props.tracks || []) out.push({ value: `${v.id}/${t.id}`, label: `${v.name || p.media[v.mediaId]?.name || 'Video'} · ${t.name}` });
  }
  return out;
}

/**
 * Følger et område i videoklippet fra spillehodet til slutten av klippet og lagrer sporet på
 * klippet. region er området i prosjektets bilde (fra en sladd), ellers klippets eget sporingsområde.
 * Gir sporets id, eller null.
 */
export async function trackForward(videoId, region = null, until = Infinity) {
  const p = project.value;
  const v = p.clips[videoId];
  if (!v || !isSource(p, v)) return null;
  if (v.reverse) return toast('Tracking does not work on reversed clips yet.', { kind: 'error' }), null;
  const T0 = Math.min(Math.max(getTime(), v.start), v.start + v.dur - 1 / p.fps);
  const T1 = Math.min(v.start + v.dur, until);
  const { stream, st, off } = streamOf(p, v);
  const M0 = videoMatrix(p, v, st, T0);
  const k0 = Math.hypot(M0.a, M0.b);
  const R = region || regionAt(p, v, T0);
  const c0 = M0.inverse().transformPoint(new DOMPoint(R.cx, R.cy));
  const box = { cx: c0.x, cy: c0.y, w: R.w / k0, h: R.h / k0, a: R.a - Math.atan2(M0.b, M0.a) };
  let res;
  try {
    res = await api.mediaTrack(workPath(stream), { start: sourceTime(v, T0) - off, end: sourceTime(v, T1) - off, fps: p.fps, box });
  } catch (err) {
    if (!/cancel/i.test(err.message)) toast(`Tracking failed: ${err.message}`, { kind: 'error' });
    return null;
  }
  if (!res || res.frames.length < 2) return toast('Could not follow anything in that area. Try an area with more detail.', { kind: 'error' }), null;
  const id = uid().slice(0, 6);
  commit((q) => {
    const c = q.clips[videoId];
    if (!c) return;
    const list = c.props.tracks || [];
    c.props.tracks = [...list, { id, name: `Track ${list.length + 1}`, start: res.start, fps: res.fps, frames: res.frames }];
  });
  const end = v.start + (res.frames.length - 1) / res.fps;
  toast(res.lost ? `Lost the object at ${formatTimecode(end, p.fps)}. The track ends there.` : 'Tracking done. Select a clip above the video and attach it to the track under Follow Track.', { timeout: 6000 });
  return id;
}

/** Fester klippet til et spor: klippet beholder sin plass i forhold til objektet ved spillehodet. */
export function attachToTrack(clipId, videoId, trackId, { rotation = true, scale = false, live = false } = {}) {
  const p = project.value;
  const clip = p.clips[clipId];
  const v = p.clips[videoId];
  const tr = v?.props.tracks?.find((t) => t.id === trackId);
  if (!clip || !tr) return toast('The track no longer exists.', { kind: 'error' });
  const W = p.width;
  const H = p.height;
  const { st, off } = streamOf(p, v);
  const sample = (T) => trackSample(p, v, tr, st, off, T);
  const lo = Math.max(clip.start, v.start);
  const hi = Math.min(clip.start + clip.dur, v.start + v.dur);
  const rows = [];
  for (let i = 0; lo + i / p.fps <= hi + 1e-6; i++) {
    const r = sample(lo + i / p.fps);
    if (r) rows.push(r);
  }
  if (rows.length < 2) return toast('The clip and the track do not overlap in time.', { kind: 'error' });
  // Referansen: spillehodet hvis sporet finnes der, ellers starten på sporet.
  const ref = sample(Math.min(Math.max(getTime(), lo), hi)) || rows[0];
  const T0 = ref.T;
  const dx = W / 2 + (valueAt(clip, 'x', T0) || 0) - ref.x;
  const dy = H / 2 + (valueAt(clip, 'y', T0) || 0) - ref.y;
  if (live) {
    commit((q) => {
      q.clips[clipId].props.follow = { clipId: videoId, trackId, rotation, scale, x: ref.x, y: ref.y, a: ref.a, s: ref.s };
      // Gruppert med videoen, så de flyttes sammen i tidslinjen.
      groupClips(q, [clipId, videoId]);
    });
    return toast('The clip now follows the track and is grouped with the video, so they move together. Move the clip to change where it sits relative to the object.', { timeout: 5000 });
  }
  const rot0 = valueAt(clip, 'rotation', T0) || 0;
  const da = rows.map((r) => (rotation ? r.a - ref.a : 0));
  const ss = rows.map((r) => (scale ? r.s / ref.s : 1));
  const ts = rows.map((r) => r.T);
  const series = [
    ['x', rows.map((r, i) => r.x + ss[i] * (dx * Math.cos(da[i]) - dy * Math.sin(da[i])) - W / 2), 0.5],
    ['y', rows.map((r, i) => r.y + ss[i] * (dx * Math.sin(da[i]) + dy * Math.cos(da[i])) - H / 2), 0.5],
  ];
  if (rotation) series.push(['rotation', da.map((a) => rot0 + (a * 180) / Math.PI), 0.1]);
  if (scale) {
    const scaled = (prop, d) => {
      const v0 = valueAt(clip, prop, T0) ?? d;
      return Array.isArray(v0) ? ss.map((s) => v0.map((x) => x * s)) : ss.map((s) => v0 * s);
    };
    if (clip.type !== 'redact') series.push(['scale', scaled('scale', 1), 0.002]);
    else if (clip.props.shape === 'path') series.push(['points', scaled('points', null), null]);
    else series.push(['w', scaled('w', 480), 0.5], ['h', scaled('h', 120), 0.5]);
  }
  commit((q) => {
    const c = q.clips[clipId];
    delete c.props.follow;
    const k0 = kfTime(c, ts[0]);
    const k1 = kfTime(c, ts[ts.length - 1]);
    for (const [prop, vals, tol] of series) {
      if (prop === 'points' && !vals[0]) continue;
      if (c.kf[prop]) c.kf[prop] = c.kf[prop].filter(([t]) => t < k0 - 1e-4 || t > k1 + 1e-4);
      const keep = tol == null ? simplify(ts, ss, 0.002) : simplify(ts, vals, tol);
      for (const i of keep) setKeyframe(c, prop, kfTime(c, ts[i]), Array.isArray(vals[i]) ? vals[i].map(Math.round) : Math.round(vals[i] * 100) / 100, 'linear');
    }
    // Husk hva sporingen skrev, så det kan fjernes igjen uten å røre andre nøkkelbilder.
    c.props.trackedKeys = [...(c.props.trackedKeys || []), { props: series.map(([prop]) => prop), from: k0, to: k1 }];
    groupClips(q, [clipId, videoId]);
  });
  toast('The clip now follows the track and is grouped with the video, so they move together. Adjust the keyframes if needed.', { timeout: 5000 });
}

/** Snarvei for sladding: følg det sladden dekker i videoen under, og fest sladden til sporet. */
export async function trackRedaction(clipId, opts) {
  const p = project.value;
  const clip = p.clips[clipId];
  const T0 = Math.min(Math.max(getTime(), clip.start), clip.start + clip.dur - 1 / p.fps);
  const v = baseClip(p, clip, T0);
  if (!v) return toast('Put the redaction on a track above a video, and move the playhead to where it should start following.', { kind: 'error' });
  const id = await trackForward(v.id, regionAt(p, clip, T0), clip.start + clip.dur);
  if (id) attachToTrack(clipId, v.id, id, opts);
}

/** Fjerner nøkkelbildene som sporingen har skrevet. Nøkkelbilder utenfor de sporede tidsrommene blir stående. */
export function removeTrackingKeyframes(clipId) {
  commit((q) => {
    const c = q.clips[clipId];
    for (const { props, from, to } of c.props.trackedKeys || []) {
      for (const prop of props) {
        if (!c.kf[prop]) continue;
        c.kf[prop] = c.kf[prop].filter(([t]) => t < from - 1e-4 || t > to + 1e-4);
        if (!c.kf[prop].length) delete c.kf[prop];
      }
    }
    delete c.props.trackedKeys;
  });
}

export function detach(clipId) {
  commit((q) => {
    delete q.clips[clipId].props.follow;
  });
}

export function deleteTrack(videoId, trackId) {
  commit((q) => {
    const c = q.clips[videoId];
    c.props.tracks = (c.props.tracks || []).filter((t) => t.id !== trackId);
    if (!c.props.tracks.length) delete c.props.tracks;
  });
}
