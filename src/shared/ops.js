// Redigeringsoperasjoner på tidslinjen. Alle muterer et prosjektobjekt direkte;
// redigeringsvisningen kloner før og lagrer historikk for angre.
import {
  CAPTION_LANE,
  isElastic,
  isVisual,
  makeClip,
  mediaClipType,
  relayoutPrimary,
  round,
  uid,
  updateDuration,
} from './model.js';

const MIN_DUR = 1 / 30;

function mediaLength(project, clip) {
  if (isElastic(clip)) return Infinity;
  const m = project.media[clip.mediaId];
  return m ? m.duration : Infinity;
}

// Frie klipp følger klippet i hovedsporet de ligger over, som tilkoblede klipp i Final Cut Pro.
export function withSync(project, fn) {
  const before = new Map(project.primary.map((id) => [id, { start: project.clips[id].start, in: project.clips[id].in }]));
  const order = [...project.primary];
  const anchors = [];
  for (const c of Object.values(project.clips)) {
    if (c.lane === 0) continue;
    const parentId = order.find((id) => {
      const p = project.clips[id];
      return c.start >= p.start - 1e-6 && c.start < p.start + p.dur - 1e-6;
    });
    if (parentId) {
      const p = project.clips[parentId];
      anchors.push({ c, parentId, src: p.in + (c.start - p.start), offset: c.start - p.start });
    }
  }
  const result = fn();
  relayoutPrimary(project);
  for (const a of anchors) {
    const p = project.clips[a.parentId];
    if (project.clips[a.c.id] !== a.c || a.c.lane === 0) continue;
    if (p && project.primary.includes(a.parentId)) {
      a.c.start = Math.max(0, round(p.start + (a.src - p.in)));
    } else {
      // Klippet under ble slettet: flytt med neste klipp som fortsatt finnes.
      const idx = order.indexOf(a.parentId);
      const next = order.slice(idx + 1).find((id) => project.primary.includes(id));
      if (next) {
        const delta = project.clips[next].start - before.get(next).start;
        a.c.start = Math.max(0, round(a.c.start + delta));
      }
    }
  }
  updateDuration(project);
  return result;
}

export function lanesOverlap(project, clip, lane) {
  return Object.values(project.clips).some(
    (o) => o.id !== clip.id && o.lane === lane && o.start < clip.start + clip.dur - 1e-6 && clip.start < o.start + o.dur - 1e-6
  );
}

// Finn nærmeste ledige spor i samme retning, slik at klipp aldri overlapper.
export function resolveLane(project, clip) {
  if (clip.lane === 0 || clip.lane === CAPTION_LANE) return;
  const dir = clip.lane > 0 ? 1 : -1;
  while (lanesOverlap(project, clip, clip.lane)) clip.lane += dir;
}

export function splitClip(project, id, T) {
  const c = project.clips[id];
  if (!c || T <= c.start + MIN_DUR || T >= c.start + c.dur - MIN_DUR) return null;
  const local = T - c.start;
  const right = structuredClone(c);
  right.id = uid();
  right.start = round(T);
  right.in = round(c.in + local);
  right.dur = round(c.dur - local);
  right.transition = undefined;
  right.props.vFadeIn = 0;
  right.props.aFadeIn = 0;
  c.dur = round(local);
  c.props.vFadeOut = 0;
  c.props.aFadeOut = 0;
  project.clips[right.id] = right;
  if (c.lane === 0) project.primary.splice(project.primary.indexOf(id) + 1, 0, right.id);
  return right.id;
}

// Kutt alle (eller de valgte) klippene som ligger under tidspunktet.
export function bladeAt(project, T, ids = null) {
  const targets = Object.values(project.clips).filter(
    (c) => (!ids || ids.includes(c.id)) && T > c.start && T < c.start + c.dur
  );
  return targets.map((c) => splitClip(project, c.id, T)).filter(Boolean);
}

export function deleteClips(project, ids, { ripple = true } = {}) {
  const set = new Set(ids);
  withSync(project, () => {
    for (const id of set) {
      const c = project.clips[id];
      if (!c) continue;
      if (c.lane === 0) {
        if (ripple) {
          project.primary = project.primary.filter((x) => x !== id);
          delete project.clips[id];
        } else {
          // Erstatt med mellomrom, slik at resten blir liggende der det er.
          const gap = makeClip('gap', { dur: c.dur, name: 'Mellomrom' });
          gap.start = c.start;
          project.clips[gap.id] = gap;
          project.primary[project.primary.indexOf(id)] = gap.id;
          delete project.clips[id];
        }
      } else {
        delete project.clips[id];
      }
    }
    mergeGaps(project);
  });
}

function mergeGaps(project) {
  const out = [];
  for (const id of project.primary) {
    const c = project.clips[id];
    const prev = project.clips[out[out.length - 1]];
    if (c.type === 'gap' && prev?.type === 'gap') {
      prev.dur = round(prev.dur + c.dur);
      delete project.clips[id];
    } else out.push(id);
  }
  // Mellomrom helt til slutt har ingen funksjon.
  while (out.length && project.clips[out[out.length - 1]].type === 'gap') {
    delete project.clips[out.pop()];
  }
  project.primary = out;
}

// Trimmer en kant med delta sekunder. Hovedsporet lukker seg automatisk (rippel).
export function trimClip(project, id, edge, delta) {
  const c = project.clips[id];
  if (!c) return;
  const apply = () => {
    const maxLen = mediaLength(project, c);
    if (edge === 'end') {
      const max = maxLen === Infinity ? Infinity : maxLen - c.in;
      c.dur = round(Math.max(MIN_DUR, Math.min(max, c.dur + delta)));
    } else {
      const minIn = isElastic(c) ? -Infinity : 0;
      let d = Math.max(minIn - c.in, Math.min(c.dur - MIN_DUR, delta));
      if (c.lane !== 0) d = Math.max(d, -c.start);
      c.in = round(c.in + d);
      c.dur = round(c.dur - d);
      if (c.lane !== 0) c.start = round(c.start + d);
    }
  };
  if (c.lane === 0) withSync(project, apply);
  else {
    apply();
    updateDuration(project);
  }
}

export function setClipDuration(project, id, dur) {
  const c = project.clips[id];
  if (c) trimClip(project, id, 'end', dur - c.dur);
}

// Indeksen i hovedsporet der et klipp settes inn ved tid T. Deler klippet under T.
export function primaryInsertIndex(project, T, { split = true } = {}) {
  let idx = project.primary.length;
  for (let i = 0; i < project.primary.length; i++) {
    const c = project.clips[project.primary[i]];
    if (T <= c.start + 1e-6) return i;
    if (T < c.start + c.dur - 1e-6) {
      if (split) {
        const r = splitClip(project, c.id, T);
        return r ? i + 1 : T - c.start < c.dur / 2 ? i : i + 1;
      }
      return T - c.start < c.dur / 2 ? i : i + 1;
    }
  }
  return idx;
}

export function insertIntoPrimary(project, clips, T, { split = true } = {}) {
  withSync(project, () => {
    const idx = T == null ? project.primary.length : primaryInsertIndex(project, T, { split });
    clips.forEach((c, i) => {
      c.lane = 0;
      project.clips[c.id] = c;
      project.primary.splice(idx + i, 0, c.id);
    });
  });
}

export function placeFree(project, clip, start, lane) {
  clip.start = Math.max(0, round(start));
  clip.lane = lane;
  project.clips[clip.id] = clip;
  resolveLane(project, clip);
  updateDuration(project);
}

// Legger til media på tidslinjen: append (E), insert (W) eller connect (Q).
export function addMediaClip(project, media, mode, T, laneHint) {
  const type = mediaClipType(media);
  const clip = makeClip(type, { media });
  const audioOnly = type === 'audio';
  if (audioOnly || mode === 'connect') {
    placeFree(project, clip, T ?? 0, laneHint ?? (audioOnly ? -1 : 1));
  } else if (mode === 'append') {
    insertIntoPrimary(project, [clip], null);
  } else {
    insertIntoPrimary(project, [clip], T ?? 0);
  }
  return clip.id;
}

// Flytter et klipp mellom hovedspor og frie spor.
export function moveClip(project, id, { start, lane, primaryIndex }) {
  const c = project.clips[id];
  if (!c) return;
  const wasPrimary = c.lane === 0;
  if (lane === 0) {
    if (!isVisual(c)) return;
    withSync(project, () => {
      project.primary = project.primary.filter((x) => x !== id);
      const idx = Math.max(0, Math.min(primaryIndex ?? project.primary.length, project.primary.length));
      project.primary.splice(idx, 0, id);
      c.lane = 0;
      mergeGaps(project);
    });
    return;
  }
  if (wasPrimary) {
    withSync(project, () => {
      project.primary = project.primary.filter((x) => x !== id);
      mergeGaps(project);
    });
  }
  c.start = Math.max(0, round(start));
  c.lane = lane;
  resolveLane(project, c);
  updateDuration(project);
}

export function setTransition(project, id, type, dur = 1) {
  const c = project.clips[id];
  if (!c || c.lane !== 0) return;
  const idx = project.primary.indexOf(id);
  const prev = idx > 0 ? project.clips[project.primary[idx - 1]] : null;
  const maxDur = Math.min(c.dur, prev ? prev.dur : c.dur, 4);
  c.transition = { type, dur: round(Math.max(0.1, Math.min(dur, maxDur))) };
}

export function removeTransition(project, id) {
  const c = project.clips[id];
  if (c) delete c.transition;
}

// Kopier og lim inn: tider lagres relativt til det første klippet.
export function copyClips(project, ids) {
  const clips = ids.map((id) => project.clips[id]).filter(Boolean);
  if (!clips.length) return null;
  const t0 = Math.min(...clips.map((c) => c.start));
  return clips.sort((a, b) => a.start - b.start).map((c) => ({ ...structuredClone(c), start: c.start - t0 }));
}

export function pasteClips(project, items, T) {
  const ids = [];
  const primary = items.filter((c) => c.lane === 0);
  const free = items.filter((c) => c.lane !== 0);
  const fresh = (c) => ({ ...structuredClone(c), id: uid(), transition: undefined });
  if (primary.length) insertIntoPrimary(project, primary.map((c) => { const n = fresh(c); ids.push(n.id); return n; }), T);
  for (const c of free) {
    const n = fresh(c);
    placeFree(project, n, T + c.start, c.lane);
    ids.push(n.id);
  }
  return ids;
}

// Gir prosjektet samme format som første video, slik Final Cut Pro gjør.
export function autoFormat(project, media) {
  if (!project.autoFormat || !media || media.kind === 'audio') return;
  const hasVisual = Object.values(project.clips).some((c) => c.type === 'video' || c.type === 'recording' || c.type === 'image');
  if (hasVisual) return;
  if (media.width && media.height) {
    project.width = media.width - (media.width % 2);
    project.height = media.height - (media.height % 2);
  }
  if (media.fps && media.kind !== 'image') {
    const common = [24, 25, 30, 50, 60];
    project.fps = common.reduce((best, f) => (Math.abs(f - media.fps) < Math.abs(best - media.fps) ? f : best), 30);
  }
  project.autoFormat = false;
}

/* Posisjonsverktøyet (P): flytt og trim i hovedsporet uten å lukke mellomrom. */

function gapAt(project, idx) {
  const c = project.clips[project.primary[idx]];
  return c?.type === 'gap' ? c : null;
}

function setGapBefore(project, idx, dur) {
  const gap = gapAt(project, idx - 1);
  if (gap) {
    if (dur < 1e-3) {
      project.primary.splice(idx - 1, 1);
      delete project.clips[gap.id];
    } else gap.dur = round(dur);
  } else if (dur >= 1e-3) {
    const g = makeClip('gap', { dur: round(dur), name: 'Gap' });
    project.clips[g.id] = g;
    project.primary.splice(idx, 0, g.id);
  }
}

// Flytter et klipp i hovedsporet. Klippene bak følger med, og det blir et mellomrom foran.
export function positionMove(project, id, dt) {
  withSync(project, () => {
    const idx = project.primary.indexOf(id);
    if (idx < 0) return;
    const before = gapAt(project, idx - 1)?.dur || 0;
    setGapBefore(project, idx, Math.max(0, before + dt));
    mergeGaps(project);
  });
}

// Trimmer uten å flytte resten: det som fjernes blir mellomrom, og forlengelse bruker opp mellomrom.
export function positionTrim(project, id, edge, delta) {
  const c = project.clips[id];
  if (!c || c.lane !== 0) return;
  withSync(project, () => {
    const idx = project.primary.indexOf(id);
    const maxLen = mediaLength(project, c);
    if (edge === 'end') {
      const after = gapAt(project, idx + 1);
      const isLast = idx === project.primary.length - 1;
      let d = delta;
      const max = maxLen === Infinity ? Infinity : maxLen - c.in;
      d = Math.min(d, max - c.dur);
      d = Math.max(d, MIN_DUR - c.dur);
      if (d > 0 && !isLast) d = Math.min(d, after ? after.dur : 0);
      c.dur = round(c.dur + d);
      if (!isLast) {
        if (after) {
          after.dur = round(after.dur - d);
          if (after.dur < 1e-3) {
            project.primary.splice(idx + 1, 1);
            delete project.clips[after.id];
          }
        } else if (d < 0) {
          const g = makeClip('gap', { dur: round(-d), name: 'Gap' });
          project.clips[g.id] = g;
          project.primary.splice(idx + 1, 0, g.id);
        }
      }
    } else {
      const before = gapAt(project, idx - 1)?.dur || 0;
      const minIn = isElastic(c) ? -Infinity : 0;
      let d = Math.max(minIn - c.in, Math.min(c.dur - MIN_DUR, delta));
      d = Math.max(d, -before);
      c.in = round(c.in + d);
      c.dur = round(c.dur - d);
      setGapBefore(project, idx, before + d);
    }
    mergeGaps(project);
  });
}
