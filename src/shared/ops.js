// Redigeringsoperasjoner på tidslinjen. Alle muterer et prosjektobjekt direkte;
// redigeringsvisningen kloner før og lagrer historikk for angre.
import {
  CAPTION_LANE,
  avgSpeed,
  instSpeed,
  rampOffset,
  srcLen,
  srcOffset,
  clipHasAudio,
  isElastic,
  kfRate,
  kfTime,
  speedOf,
  sourceTime,
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

/* Trimming som tar hensyn til fart, ramper og baklengs. */

function shiftKeyframes(c, delta) {
  if (Math.abs(delta) < 1e-9) return;
  for (const [prop, list] of Object.entries(c.kf || {})) {
    if (prop === 'layout') continue;
    for (const k of list) k[0] = round(k[0] + delta);
  }
}

// Hvor mye kanten kan flyttes uten å gå utenfor kildefilen.
function trimLimits(project, c, edge) {
  const len = mediaLength(project, c);
  const av = avgSpeed(c) || 0;
  const min = -(c.dur - MIN_DUR);
  if (isElastic(c) || len === Infinity || av === 0) return edge === 'start' ? [-Infinity, c.dur - MIN_DUR] : [min, Infinity];
  const before = c.in / av; // kilde før klippet
  const after = (len - c.in - srcLen(c)) / av; // kilde etter klippet
  // Baklengs: starten på tidslinjen er slutten i kilden.
  if (edge === 'start') return [-(c.reverse ? after : before), c.dur - MIN_DUR];
  return [min, c.reverse ? before : after];
}

// Flytter en kant d sekunder (positiv d flytter mot høyre). Returnerer faktisk flytting.
function applyTrim(project, c, edge, d) {
  const [lo, hi] = trimLimits(project, c, edge);
  d = Math.max(lo, Math.min(hi, d));
  const av = avgSpeed(c);
  const r = kfRate(c);
  const oldIn = c.in;
  if (edge === 'start') {
    if (!c.reverse && !(c.speed === 0 && !c.ramp)) c.in = round(c.in + d * av);
    else if (c.speed === 0 && !c.ramp) c.in = round(c.in + d);
    c.dur = round(c.dur - d);
    // Nøkkelbildene skal bli liggende på samme sted i bildet.
    shiftKeyframes(c, c.in - oldIn - d * r);
  } else {
    if (c.reverse) c.in = round(c.in - d * av);
    c.dur = round(c.dur + d);
    shiftKeyframes(c, c.in - oldIn);
  }
  return d;
}

// Frie klipp følger klippet i hovedsporet de ligger over, som tilkoblede klipp i Final Cut Pro.
export function withSync(project, fn) {
  const before = new Map(project.primary.map((id) => [id, { start: project.clips[id].start, in: project.clips[id].in }]));
  const order = [...project.primary];
  const anchors = [];
  for (const c of Object.values(project.clips)) {
    if (c.lane === 0 || project.lanes?.[c.lane]?.locked) continue;
    const parentId = order.find((id) => {
      const p = project.clips[id];
      return c.start >= p.start - 1e-6 && c.start < p.start + p.dur - 1e-6;
    });
    if (parentId) {
      const p = project.clips[parentId];
      anchors.push({ c, parentId, src: kfTime(p, c.start), offset: c.start - p.start });
    }
  }
  const result = fn();
  relayoutPrimary(project);
  for (const a of anchors) {
    const p = project.clips[a.parentId];
    if (project.clips[a.c.id] !== a.c || a.c.lane === 0) continue;
    if (p && project.primary.includes(a.parentId)) {
      a.c.start = Math.max(0, round(p.start + (a.src - p.in) / kfRate(p)));
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
  const r = kfRate(c);
  const off = srcOffset(c, local);
  const total = srcLen(c);
  const right = structuredClone(c);
  right.id = uid();
  right.start = round(T);
  right.dur = round(c.dur - local);
  // Fartsrampen deles i to, hver del skalert til sin egen lengde.
  if (c.ramp) {
    const u = local / c.dur;
    const at = [u, instSpeed(c, local)];
    const leftPts = [...c.ramp.filter(([x]) => x < u), at].map(([x, v]) => [round(x / u), v]);
    const rightPts = [at, ...c.ramp.filter(([x]) => x > u)].map(([x, v]) => [round((x - u) / (1 - u)), v]);
    c.ramp = leftPts;
    right.ramp = rightPts;
  }
  const oldIn = c.in;
  if (c.speed === 0 && !c.ramp) right.in = round(c.in + local);
  else if (c.reverse) {
    // Baklengs: venstre del spiller slutten av kilden, høyre del starten.
    right.in = c.in;
    c.in = round(c.in + total - off);
  } else right.in = round(c.in + off);
  // Nøkkelbildene beholder plassen sin i bildet: kfTime = in + lokal tid * kfRate.
  shiftKeyframes(right, right.in - oldIn - local * r);
  shiftKeyframes(c, c.in - oldIn);
  right.transition = undefined;
  right.axfade = undefined;
  right.props.vFadeIn = 0;
  right.props.aFadeIn = 0;
  right.props.aLead = 0;
  c.dur = round(local);
  c.props.vFadeOut = 0;
  c.props.aFadeOut = 0;
  c.props.aTail = 0;
  project.clips[right.id] = right;
  if (c.lane === 0) project.primary.splice(project.primary.indexOf(id) + 1, 0, right.id);
  return right.id;
}

// Kutt alle (eller de valgte) klippene som ligger under tidspunktet.
export function bladeAt(project, T, ids = null) {
  const targets = Object.values(project.clips).filter(
    (c) => (!ids || ids.includes(c.id)) && !project.lanes?.[c.lane]?.locked && T > c.start && T < c.start + c.dur
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
    let d = delta;
    if (edge === 'start' && c.lane !== 0) d = Math.max(d, -c.start);
    d = applyTrim(project, c, edge, d);
    if (edge === 'start' && c.lane !== 0) c.start = round(c.start + d);
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
// opts: { in, dur } for et utvalg fra biblioteket, eller lengde på stillbilder.
export function addMediaClip(project, media, mode, T, laneHint, opts = {}) {
  const type = mediaClipType(media);
  const clip = makeClip(type, { media, ...(opts.in != null ? { in: opts.in } : {}), ...(opts.dur ? { dur: opts.dur } : {}) });
  const audioOnly = type === 'audio';
  if (mode === 'overwrite' && !audioOnly) {
    overwritePrimary(project, clip, T ?? 0);
  } else if (audioOnly || mode === 'connect') {
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
    if (edge === 'end') {
      const after = gapAt(project, idx + 1);
      const isLast = idx === project.primary.length - 1;
      let d = delta;
      if (d > 0 && !isLast) d = Math.min(d, after ? after.dur : 0);
      d = applyTrim(project, c, 'end', d);
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
      const d = applyTrim(project, c, 'start', Math.max(delta, -before));
      setGapBefore(project, idx, before + d);
    }
    mergeGaps(project);
  });
}


/* Hastighet */

export const SPEED_PRESETS = [0.1, 0.25, 0.5, 1, 2, 4, 8, 20];

// Endrer farten. Kildeområdet beholdes, så klippet blir lengre eller kortere på tidslinjen.
export function setSpeed(project, id, speed) {
  const c = project.clips[id];
  if (!c || (c.speed === 0 && !c.ramp) || !['video', 'recording', 'audio'].includes(c.type)) return;
  const sp = Math.max(0.02, Math.min(50, speed));
  const length = srcLen(c);
  const apply = () => {
    delete c.ramp;
    c.speed = sp === 1 ? undefined : sp;
    if (c.speed === undefined) delete c.speed;
    c.dur = round(Math.max(MIN_DUR, length / sp));
    if (c.transition) c.transition.dur = Math.min(c.transition.dur, c.dur);
  };
  if (c.lane === 0) withSync(project, apply);
  else {
    apply();
    resolveLane(project, c);
    updateDuration(project);
  }
}

// Fartsrampe: samme kildeområde, men farten endres gjennom klippet.
export function setRamp(project, id, ramp) {
  const c = project.clips[id];
  if (!c || (c.speed === 0 && !c.ramp) || !['video', 'recording', 'audio'].includes(c.type)) return;
  const length = srcLen(c);
  const apply = () => {
    if (!ramp) {
      const av = avgSpeed(c);
      delete c.ramp;
      c.speed = av;
      if (Math.abs(av - 1) < 1e-6) delete c.speed;
      return;
    }
    delete c.speed;
    c.ramp = ramp.map(([u, v]) => [u, Math.max(0.02, v)]);
    c.dur = round(Math.max(MIN_DUR, length / rampOffset(c.ramp, 1)));
    if (c.transition) c.transition.dur = Math.min(c.transition.dur, c.dur);
  };
  if (c.lane === 0) withSync(project, apply);
  else {
    apply();
    resolveLane(project, c);
    updateDuration(project);
  }
}

// Baklengs: samme del av kilden, spilt fra slutt til start.
export function setReverse(project, id, on) {
  const c = project.clips[id];
  if (!c || !['video', 'recording', 'audio'].includes(c.type) || (c.speed === 0 && !c.ramp)) return;
  if (on) c.reverse = true;
  else delete c.reverse;
}

// Frosset bilde ved spillhodet: klippet deles og et stillbilde settes inn.
export function freezeFrame(project, T, dur = 2) {
  const p = Object.values(project.clips)
    .filter((c) => (c.type === 'video' || c.type === 'recording') && c.speed !== 0 && c.enabled && T >= c.start && T < c.start + c.dur)
    .sort((a, b) => (b.lane === 0) - (a.lane === 0) || b.lane - a.lane)[0];
  if (!p) return null;
  const frameAt = sourceTime(p, T);
  const freeze = structuredClone(p);
  freeze.id = uid();
  freeze.speed = 0;
  freeze.freezeAt = round(frameAt);
  freeze.in = round(frameAt);
  freeze.dur = dur;
  freeze.kf = {};
  freeze.transition = undefined;
  freeze.name = `${p.name || 'Clip'} (freeze)`;
  freeze.props.audioDetached = false;
  if (p.lane === 0) {
    withSync(project, () => {
      const right = splitClip(project, p.id, T);
      const idx = project.primary.indexOf(p.id) + 1;
      project.clips[freeze.id] = freeze;
      project.primary.splice(T <= p.start + 1e-6 ? idx - 1 : idx, 0, freeze.id);
      return right;
    });
  } else {
    splitClip(project, p.id, T);
    const after = Object.values(project.clips).filter((c) => c.lane === p.lane && c.start >= T - 1e-6 && c.id !== freeze.id);
    for (const c of after) c.start = round(c.start + dur);
    placeFree(project, freeze, T, p.lane);
  }
  return freeze.id;
}

/* Lyd */

// Kobler lyden fra et video- eller opptaksklipp til egne lydklipp under hovedsporet.
export function detachAudio(project, id) {
  const c = project.clips[id];
  const m = c && project.media[c.mediaId];
  if (!m || !clipHasAudio(c, m) || c.type === 'audio') return [];
  const ids = [];
  const make = (stream, name, volumeProp) => {
    const a = makeClip('audio', { media: m, start: c.start, in: c.in, dur: c.dur, lane: -1, name });
    a.stream = stream;
    if (c.speed) a.speed = c.speed;
    a.props.volume = c.props[volumeProp] ?? 0;
    a.props.aFadeIn = c.props.aFadeIn || 0;
    a.props.aFadeOut = c.props.aFadeOut || 0;
    a.props.aLead = c.props.aLead || 0;
    a.props.aTail = c.props.aTail || 0;
    a.props.preservePitch = c.props.preservePitch;
    if (c.kf[volumeProp]) a.kf.volume = structuredClone(c.kf[volumeProp]);
    placeFree(project, a, c.start, -1);
    ids.push(a.id);
  };
  if (c.type === 'recording') {
    if (m.streams.camera?.hasAudio) make('camera', `${c.name || m.name} (microphone)`, 'micVolume');
    if (m.streams.screen?.hasAudio) make('screen', `${c.name || m.name} (system audio)`, 'sysVolume');
  } else make('main', `${c.name || m.name} (audio)`, 'volume');
  c.props.audioDetached = true;
  c.props.aLead = 0;
  c.props.aTail = 0;
  c.expanded = false;
  return ids;
}

// Kryssfade mellom to lydklipp som ligger rett etter hverandre i samme spor.
export function setAudioCrossfade(project, firstId, secondId, dur) {
  const a = project.clips[firstId];
  const b = project.clips[secondId];
  if (!a || !b || a.lane !== b.lane || Math.abs(a.start + a.dur - b.start) > 1 / 60) return false;
  b.axfade = round(Math.max(0.05, Math.min(dur, a.dur, b.dur)));
  return true;
}

// Finn par av lydklipp som ligger inntil hverandre blant de valgte.
export function adjacentAudioPairs(project, ids) {
  const clips = ids.map((id) => project.clips[id]).filter((c) => c && c.lane < 0);
  const pairs = [];
  for (const a of clips) {
    for (const b of clips) {
      if (a !== b && a.lane === b.lane && Math.abs(a.start + a.dur - b.start) < 1 / 60) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

/* Trimverktøyet: roll, slip og slide */

// Flytter kuttet mellom to klipp i hovedsporet. Total lengde er uendret.
export function rollEdit(project, aId, bId, delta) {
  const a = project.clips[aId];
  const b = project.clips[bId];
  if (!a || !b) return;
  const [, aHi] = trimLimits(project, a, 'end');
  const [aLo] = trimLimits(project, a, 'end');
  const [bLo, bHi] = trimLimits(project, b, 'start');
  const d = Math.max(Math.max(aLo, bLo), Math.min(Math.min(aHi, bHi), delta));
  withSync(project, () => {
    applyTrim(project, a, 'end', d);
    applyTrim(project, b, 'start', d);
  });
}

// Viser en annen del av kildefilen uten å flytte klippet.
export function slipClip(project, id, delta) {
  const c = project.clips[id];
  if (!c || isElastic(c)) return;
  const len = mediaLength(project, c);
  const maxIn = len - srcLen(c);
  const move = delta * avgSpeed(c) * (c.reverse ? -1 : 1);
  const next = Math.max(0, Math.min(maxIn, c.in + move));
  shiftKeyframes(c, next - c.in);
  c.in = round(next);
}

// Flytter et klipp mellom naboene. Naboene forlenges og forkortes, så resten står stille.
export function slideClip(project, id, delta) {
  const idx = project.primary.indexOf(id);
  if (idx <= 0 || idx >= project.primary.length - 1) return;
  const prev = project.clips[project.primary[idx - 1]];
  const next = project.clips[project.primary[idx + 1]];
  const [pLo, pHi] = trimLimits(project, prev, 'end');
  const [nLo, nHi] = trimLimits(project, next, 'start');
  const d = Math.max(Math.max(pLo, nLo), Math.min(Math.min(pHi, nHi), delta));
  withSync(project, () => {
    applyTrim(project, prev, 'end', d);
    applyTrim(project, next, 'start', d);
  });
}

/* Hovedsporet */

// Skriver over hovedsporet fra T: det som ligger der blir erstattet (D i Final Cut Pro).
export function overwritePrimary(project, clip, T) {
  withSync(project, () => {
    const end = T + clip.dur;
    if (T > project.primary.reduce((s, id) => s + project.clips[id].dur, 0)) {
      const total = project.primary.reduce((s, id) => s + project.clips[id].dur, 0);
      const g = makeClip('gap', { dur: round(T - total), name: 'Gap' });
      project.clips[g.id] = g;
      project.primary.push(g.id);
    }
    relayoutPrimary(project);
    for (const id of [...project.primary]) {
      const c = project.clips[id];
      if (T > c.start && T < c.start + c.dur) splitClip(project, id, T);
    }
    relayoutPrimary(project);
    for (const id of [...project.primary]) {
      const c = project.clips[id];
      if (end > c.start && end < c.start + c.dur) splitClip(project, id, end);
    }
    relayoutPrimary(project);
    const removed = project.primary.filter((id) => {
      const c = project.clips[id];
      return c.start >= T - 1e-6 && c.start + c.dur <= end + 1e-6;
    });
    let idx = project.primary.findIndex((id) => project.clips[id].start >= T - 1e-6);
    if (idx < 0) idx = project.primary.length;
    project.primary = project.primary.filter((id) => !removed.includes(id));
    for (const id of removed) delete project.clips[id];
    clip.lane = 0;
    project.clips[clip.id] = clip;
    project.primary.splice(Math.min(idx, project.primary.length), 0, clip.id);
    mergeGaps(project);
  });
}

// Løfter klipp ut av hovedsporet og lar et mellomrom stå igjen (Option Cmd Opp).
export function liftFromStoryline(project, ids) {
  const lifted = [];
  withSync(project, () => {
    for (const id of ids) {
      const c = project.clips[id];
      if (!c || c.lane !== 0 || c.type === 'gap') continue;
      const gap = makeClip('gap', { dur: c.dur, name: 'Gap' });
      project.clips[gap.id] = gap;
      project.primary[project.primary.indexOf(id)] = gap.id;
      lifted.push({ c, start: c.start });
    }
  });
  for (const { c, start } of lifted) {
    c.start = start;
    c.lane = 1;
    resolveLane(project, c);
  }
  updateDuration(project);
}

export function insertGap(project, T, dur = 3) {
  const g = makeClip('gap', { dur, name: 'Gap' });
  insertIntoPrimary(project, [g], T);
  return g.id;
}
