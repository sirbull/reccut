// Redigeringsoperasjoner på tidslinjen. Alle muterer et prosjektobjekt direkte;
// redigeringsvisningen kloner før og lagrer historikk for angre.
import {
  FRAME_RATES,
  deepClone,
  CAPTION_LANE,
  avgSpeed,
  instSpeed,
  rampOffset,
  srcLen,
  srcOffset,
  audioComponents,
  clipHasAudio,
  componentVolumeProp,
  isElastic,
  kfRate,
  kfTime,
  speedOf,
  sourceTime,
  isVisual,
  hasFreeTransitions,
  makeClip,
  mediaClipType,
  relayoutPrimary,
  round,
  uid,
  updateDuration,
  valueAt,
} from './model.js';

const MIN_DUR = 1 / 30;

export function recordingChildren(project, id) {
  return Object.values(project.clips).filter((c) => c.recordingPart === 'camera' && c.linkedTo === id);
}

// PiP og tastelaget. Begge følger skjermklippet i tid.
function linkedParts(project, id) {
  return Object.values(project.clips).filter((c) => c.linkedTo === id);
}

export function recordingEditId(project, id) {
  const c = project.clips[id];
  if (c?.slideshowParent && project.clips[c.slideshowParent]) return c.slideshowParent;
  return project.clips[c?.linkedTo] ? c.linkedTo : id;
}

function timingChildren(project, id) {
  return [...linkedParts(project, id), ...Object.values(project.clips).filter((c) => c.slideshowParent === id)];
}

function recordingTimingLocked(project, id) {
  const c = project.clips[id];
  return c && (project.lanes?.[c.lane]?.locked || timingChildren(project, id).some((camera) => project.lanes?.[camera.lane]?.locked));
}

// Bare tids- og kildeegenskapene følger skjermklippet. Farge, form og effekter er uavhengige.
export function syncRecordingTracks(project) {
  for (const c of Object.values(project.clips)) {
    if (!c.linkedTo && !c.slideshowParent) continue;
    const parent = project.clips[c.slideshowParent || c.linkedTo];
    if (!parent) {
      delete project.clips[c.id];
      continue;
    }
    for (const key of ['start', 'in', 'dur', 'speed', 'ramp', 'reverse', 'freezeAt']) {
      if (parent[key] === undefined) delete c[key];
      else if (JSON.stringify(c[key]) !== JSON.stringify(parent[key])) c[key] = deepClone(parent[key]);
    }
    if (c.lane <= parent.lane) c.lane = parent.lane + 1;
  }
  // Oppdater alle tidene før sporene løses, så gammel plassering ikke lager falske kollisjoner.
  for (const c of Object.values(project.clips)) {
    if (!c.linkedTo && !c.slideshowParent) continue;
    while (lanesOverlap(project, c, c.lane)) c.lane++;
  }
}

// Eldre opptak kan også få et eget PiP-spor, uten å endre kildefilene.
export function separateRecordingCamera(project, id) {
  const c = project.clips[id];
  const media = project.media[c?.mediaId];
  if (c?.type !== 'recording' || c.recordingPart || !media?.streams?.screen?.hasVideo || !media.streams.camera?.hasVideo) return null;
  const camera = deepClone(c);
  camera.id = uid();
  camera.recordingPart = 'camera';
  camera.linkedTo = c.id;
  camera.name = `${c.name || media.name || 'Recording'} · PiP`;
  delete camera.group;
  delete camera.transition;
  delete camera.transitionOut;
  camera.expanded = false;
  // Ankerpunktet regnes fra midten av PiP-rammen. Eldre PiP-klipp beholder midten av bildet, så de ikke flytter seg.
  camera.props.pipAnchor = true;
  camera.props.showKeys = false;
  camera.props.showClicks = false;
  camera.props.cursorZoom = false;
  camera.props.audioDetached = true;
  // Effekter som var målrettet mot skjermen skal ikke vises på kameraklippet.
  if (camera.props.vfx) camera.props.vfx = camera.props.vfx.filter((e) => e.target !== 'screen');
  if (c.props.vfx) c.props.vfx = c.props.vfx.filter((e) => e.target !== 'camera');
  c.recordingPart = 'screen';
  placeFree(project, camera, c.start, Math.max(1, c.lane + 1));
  if (camera.lane <= c.lane) {
    camera.lane = c.lane + 1;
    while (lanesOverlap(project, camera, camera.lane)) camera.lane++;
  }
  return camera.id;
}

// Tastene får et eget lag øverst, så de kan flyttes, skjules eller slettes uten å røre opptaket.
export function separateRecordingKeys(project, id) {
  const c = project.clips[id];
  const overlays = project.media[c?.mediaId]?.rec?.overlays;
  if (c?.type !== 'recording' || !(overlays?.keys || overlays?.inputs?.on)) return null;
  const keys = deepClone(c);
  keys.id = uid();
  keys.recordingPart = 'keys';
  keys.linkedTo = c.id;
  keys.name = `${c.name || project.media[c.mediaId].name || 'Recording'} · Keystrokes`;
  delete keys.group;
  delete keys.transition;
  delete keys.transitionOut;
  keys.expanded = false;
  keys.props.showClicks = false;
  keys.props.cursorZoom = false;
  keys.props.audioDetached = true;
  keys.props.vfx = [];
  c.props.showKeys = false;
  c.props.showInputs = false;
  const above = Math.max(c.lane, ...recordingChildren(project, id).map((x) => x.lane)) + 1;
  placeFree(project, keys, c.start, Math.max(1, above));
  if (keys.lane < above) {
    keys.lane = above;
    while (lanesOverlap(project, keys, keys.lane)) keys.lane++;
  }
  return keys.id;
}

export function detachRecordingCamera(project, id) {
  const c = project.clips[id];
  if (c?.recordingPart !== 'camera' || !c.linkedTo) return false;
  delete c.linkedTo;
  return true;
}

export function attachRecordingCamera(project, id, parentId) {
  const c = project.clips[id];
  const parent = project.clips[parentId];
  if (c?.recordingPart !== 'camera' || parent?.recordingPart !== 'screen' || c.mediaId !== parent.mediaId || recordingChildren(project, parentId).length) return false;
  c.linkedTo = parentId;
  syncRecordingTracks(project);
  updateDuration(project);
  return true;
}

function mediaLength(project, clip) {
  if (isElastic(clip)) return Infinity;
  const m = project.media[clip.mediaId];
  return m ? m.duration : Infinity;
}

/* Trimming som tar hensyn til fart, ramper og baklengs. */

export function shiftKeyframes(c, delta) {
  if (Math.abs(delta) < 1e-9) return;
  for (const expression of Object.values(c.expressions || {})) expression.timeOffset = (expression.timeOffset || 0) - delta / kfRate(c);
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
    const shift = c.in - oldIn - d * r;
    shiftKeyframes(c, shift);
    for (const camera of timingChildren(project, c.id)) shiftKeyframes(camera, shift);
  } else {
    if (c.reverse) c.in = round(c.in - d * av);
    c.dur = round(c.dur + d);
    const shift = c.in - oldIn;
    shiftKeyframes(c, shift);
    for (const camera of timingChildren(project, c.id)) shiftKeyframes(camera, shift);
  }
  return d;
}

// Frie klipp følger klippet i hovedsporet de ligger over, som tilkoblede klipp i Final Cut Pro.
// Grupperte klipp følger klippet i hovedsporet i samme gruppe, også utenfor kantene.
export function withSync(project, fn) {
  const before = new Map(project.primary.map((id) => [id, { start: project.clips[id].start, in: project.clips[id].in }]));
  const order = [...project.primary];
  const groupParent = new Map();
  for (const id of order) {
    const g = project.clips[id].group;
    if (g && !groupParent.has(g)) groupParent.set(g, id);
  }
  const anchors = [];
  for (const c of Object.values(project.clips)) {
    // PiP har en eksplisitt kobling. Frakoblet PiP beholder sin egen plassering.
    if (c.recordingPart === 'camera' || c.recordingPart === 'keys' || c.slideshowParent) continue;
    if (c.lane === 0 || project.lanes?.[c.lane]?.locked) continue;
    // Undertekster har egne tider. Bare eksplisitt gruppering kobler dem til hovedsporet.
    if (c.type === 'caption' && !(c.group && groupParent.has(c.group))) continue;
    const parentId =
      (c.group && groupParent.get(c.group)) ||
      order.find((id) => {
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
  cleanGroups(project);
  syncRecordingTracks(project);
  updateDuration(project);
  return result;
}

/* Grupper: klipp med samme clip.group flyttes og slettes sammen (Cmd/Ctrl+G). */

export function groupMembers(project, id) {
  const g = project.clips[id]?.group;
  if (!g) return project.clips[id] ? [id] : [];
  return Object.values(project.clips).filter((c) => c.group === g).map((c) => c.id);
}

// Rediger innholdet som vanlige klipp, uten at gruppens tidskobling tar med de andre.
// Vanlig magnetisk redigering utenfor gruppen og eksplisitte PiP-koblinger beholdes.
export function editGroupContents(project, group, ids, edit) {
  if (!group) return edit(project);
  const selected = new Set(ids);
  const members = Object.values(project.clips).filter((c) => c.group === group).map((c) => ({ id: c.id, start: c.start }));
  for (const { id } of members) delete project.clips[id].group;
  try {
    return edit(project);
  } finally {
    const remaining = members.filter(({ id }) => project.clips[id]);
    for (const { id, start } of remaining) {
      const c = project.clips[id];
      if (remaining.length > 1) c.group = group;
      if (!selected.has(id) && c.lane !== 0) c.start = start;
    }
    updateDuration(project);
  }
}

// Klippet i hovedsporet som styrer gruppen, eller null om alle er frie.
export function groupLead(project, ids) {
  const groups = new Set(ids.map((id) => project.clips[id]?.group));
  if (groups.size !== 1 || !ids.every((id) => project.clips[id]?.group)) return null;
  const [g] = groups;
  const members = Object.values(project.clips).filter((c) => c.group === g);
  if (members.length !== ids.length) return null;
  return project.primary.find((id) => project.clips[id].group === g) || null;
}

// Alle slags klipp kan grupperes: video, lyd, bilder, titler, sladding og undertekster.
// Er noen av klippene allerede i en gruppe, slås gruppene sammen til én.
export function groupClips(project, ids) {
  const old = new Set(ids.map((id) => project.clips[id]?.group).filter(Boolean));
  const all = new Set(ids);
  for (const c of Object.values(project.clips)) if (c.group && old.has(c.group)) all.add(c.id);
  const list = [...all].map((id) => project.clips[id]).filter(Boolean);
  if (list.length < 2) return null;
  const g = uid();
  list.forEach((c) => (c.group = g));
  return g;
}

export function ungroupClips(project, ids) {
  const groups = new Set(ids.map((id) => project.clips[id]?.group).filter(Boolean));
  for (const c of Object.values(project.clips)) if (groups.has(c.group)) delete c.group;
  return groups.size;
}

// Grupper med bare ett klipp igjen fjernes.
export function cleanGroups(project) {
  const count = new Map();
  for (const c of Object.values(project.clips)) if (c.group) count.set(c.group, (count.get(c.group) || 0) + 1);
  for (const c of Object.values(project.clips)) if (c.group && count.get(c.group) < 2) delete c.group;
}

export function lanesOverlap(project, clip, lane) {
  return Object.values(project.clips).some(
    (o) => o.id !== clip.id && o.lane === lane && o.start < clip.start + clip.dur - 1e-6 && clip.start < o.start + o.dur - 1e-6
  );
}

// Finn nærmeste ledige spor i samme retning, slik at klipp aldri overlapper.
// Over hovedsporet faller klippet ned til laveste ledige spor, som i Final Cut Pro, så det aldri svever over tomme spor.
export function resolveLane(project, clip) {
  if (clip.lane === 0 || clip.lane === CAPTION_LANE) return;
  const dir = clip.lane > 0 ? 1 : -1;
  if (dir > 0) clip.lane = 1;
  while (lanesOverlap(project, clip, clip.lane) || (dir > 0 && project.lanes?.[clip.lane]?.locked)) clip.lane += dir;
}

// Et klipp som starter etter slutten av hovedsporet har ingenting under seg å kobles til.
// Da legges det i hovedsporet i stedet, som i Final Cut Pro. Sladding hører ikke hjemme der.
function storylineIfAlone(project, clip) {
  if (clip.recordingPart === 'camera' || clip.recordingPart === 'keys') return;
  if (clip.lane <= 0 || clip.lane === CAPTION_LANE || !isVisual(clip) || ['redact', 'adjustment'].includes(clip.type)) return;
  const last = project.clips[project.primary.at(-1)];
  if (clip.start >= (last ? last.start + last.dur : 0) - 1e-6) moveClip(project, clip.id, { lane: 0 });
}

export function splitClip(project, id, T, independent = false) {
  if (!independent) id = recordingEditId(project, id);
  const c = project.clips[id];
  if (!independent && recordingTimingLocked(project, id)) return null;
  if (!c || T <= c.start + MIN_DUR || T >= c.start + c.dur - MIN_DUR) return null;
  const local = T - c.start;
  const r = kfRate(c);
  const off = srcOffset(c, local);
  const total = srcLen(c);
  const right = deepClone(c);
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
  c.transitionOut = undefined;
  right.axfade = undefined;
  delete right.group;
  right.props.vFadeIn = 0;
  right.props.aFadeIn = 0;
  right.props.aLead = 0;
  c.dur = round(local);
  c.props.vFadeOut = 0;
  c.props.aFadeOut = 0;
  c.props.aTail = 0;
  project.clips[right.id] = right;
  if (c.lane === 0) project.primary.splice(project.primary.indexOf(id) + 1, 0, right.id);
  for (const camera of linkedParts(project, id)) {
    const cameraRight = splitClip(project, camera.id, T, true);
    if (cameraRight) project.clips[cameraRight].linkedTo = right.id;
  }
  const fg = project.clips[c.slideshowForeground];
  if (fg?.slideshowParent === c.id) {
    const fgRight = splitClip(project, fg.id, T, true);
    if (fgRight) {
      right.slideshowForeground = fgRight; project.clips[fgRight].slideshowParent = right.id;
      right.group = project.clips[fgRight].group = uid();
    }
  }
  if (!independent) syncRecordingTracks(project);
  return right.id;
}

// Kutt alle (eller de valgte) klippene som ligger under tidspunktet.
export function bladeAt(project, T, ids = null) {
  if (ids) ids = [...new Set(ids.map((id) => recordingEditId(project, id)))];
  const targets = Object.values(project.clips).filter(
    (c) => !c.linkedTo && !c.slideshowParent && (!ids || ids.includes(c.id)) && !project.lanes?.[c.lane]?.locked && T > c.start && T < c.start + c.dur
  );
  const pieces = targets.map((c) => [c, splitClip(project, c.id, T)]).filter(([, r]) => r);
  // Kuttes alle klippene i en gruppe, blir høyre deler en egen gruppe.
  const fresh = new Map();
  for (const [c, r] of pieces) {
    if (!c.group || !groupMembers(project, c.id).every((id) => pieces.some(([x]) => x.id === id))) continue;
    if (!fresh.has(c.group)) fresh.set(c.group, uid());
    project.clips[r].group = fresh.get(c.group);
  }
  cleanGroups(project);
  return pieces.map(([, r]) => r);
}

export function deleteClips(project, ids, { ripple = true } = {}) {
  const set = new Set(ids);
  for (const id of ids) {
    const parent = project.clips[id]?.slideshowParent;
    if (parent) { set.add(parent); for (const child of timingChildren(project, parent)) set.add(child.id); }
    for (const child of timingChildren(project, id)) set.add(child.id);
  }
  // Slettes klippet i hovedsporet, forsvinner også klippene som er gruppert med det.
  for (const id of ids) {
    const c = project.clips[id];
    if (c?.lane === 0 && c.group) groupMembers(project, id).forEach((m) => project.clips[m].lane !== 0 && set.add(m));
  }
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
  id = recordingEditId(project, id);
  if (recordingTimingLocked(project, id)) return;
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
    syncRecordingTracks(project);
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
// opts: { in, dur, includeAudio } for et utvalg fra biblioteket.
export function mediaClip(media, opts = {}) {
  const type = mediaClipType(media);
  const clip = makeClip(type, { media, ...(opts.in != null ? { in: opts.in } : {}), ...(opts.dur ? { dur: opts.dur } : {}) });
  if (type !== 'audio' && (opts.includeAudio ?? media.includeAudio) === false) {
    clip.props.audioOff = { ...clip.props.audioOff, ...Object.fromEntries(Object.entries(media.streams).filter(([, stream]) => stream.hasAudio).map(([key]) => [key, true])) };
  }
  return clip;
}

// Lyd ligger under hovedsporet og bilde over. Media hører aldri hjemme i CC-sporet.
export function mediaLane(media, lane) {
  if (media.kind === 'audio') return lane < 0 ? lane : -1;
  return lane < 0 || lane === CAPTION_LANE ? 1 : lane;
}

export function addMediaClip(project, media, mode, T, laneHint, opts = {}) {
  const clip = mediaClip(media, opts);
  const audioOnly = clip.type === 'audio';
  laneHint = mediaLane(media, laneHint);
  if (mode === 'overwrite' && !audioOnly) {
    overwritePrimary(project, clip, T ?? 0);
  } else if (audioOnly || mode === 'connect') {
    placeFree(project, clip, T ?? 0, laneHint ?? (audioOnly ? -1 : 1));
    storylineIfAlone(project, clip);
  } else if (mode === 'append') {
    insertIntoPrimary(project, [clip], null);
  } else {
    insertIntoPrimary(project, [clip], T ?? 0);
  }
  separateRecordingCamera(project, clip.id);
  separateRecordingKeys(project, clip.id);
  return clip.id;
}

// Erstatter et klipp: det nye klippet tar plassen (og overgangene) til det gamle.
// Bilde erstatter bilde og lyd erstatter lyd, ellers skjer ingenting.
export function replaceClip(project, targetId, clip) {
  const old = project.clips[targetId];
  if (!old || old.type === 'gap' || old.type === 'caption' || project.lanes?.[old.lane]?.locked || isVisual(old) !== isVisual(clip)) return false;
  if (old.lane === 0) {
    withSync(project, () => {
      clip.lane = 0;
      if (old.transition) clip.transition = old.transition;
      if (old.transitionOut) clip.transitionOut = old.transitionOut;
      project.clips[clip.id] = clip;
      project.primary[project.primary.indexOf(targetId)] = clip.id;
      delete project.clips[targetId];
    });
  } else {
    delete project.clips[targetId];
    placeFree(project, clip, old.start, old.lane);
  }
  return true;
}

// Flytter et klipp mellom hovedspor og frie spor.
export function moveClip(project, id, { start, lane, primaryIndex }) {
  const lead = recordingEditId(project, id);
  if (lead !== id) {
    const parent = project.clips[lead];
    if (parent.lane === 0 && lane !== 0) {
      const at = start ?? parent.start;
      const order = project.primary.filter((key) => key !== lead);
      primaryIndex = order.findIndex((key) => at < project.clips[key].start + project.clips[key].dur / 2);
      if (primaryIndex < 0) primaryIndex = order.length;
    }
    id = lead;
    lane = parent.lane;
  }
  const c = project.clips[id];
  if (!c) return;
  const wasPrimary = c.lane === 0;
  if (recordingTimingLocked(project, id)) return;
  if (lane === 0) {
    // Sladding virker på det som ligger under, så den hører ikke hjemme i hovedsporet.
    if (!isVisual(c) || ['redact', 'adjustment'].includes(c.type)) return;
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
  syncRecordingTracks(project);
  updateDuration(project);
  storylineIfAlone(project, c);
}

export function setTransition(project, id, type, dur = 1, edge = 'start', audio) {
  const c = project.clips[id];
  if (!c || (c.lane !== 0 && !hasFreeTransitions(c))) return;
  const idx = project.primary.indexOf(id);
  const prev = edge === 'start' && idx > 0 ? project.clips[project.primary[idx - 1]] : null;
  const maxDur = Math.min(c.dur, prev ? prev.dur : c.dur, 4);
  const key = edge === 'end' ? 'transitionOut' : 'transition';
  c[key] = { ...c[key], type, dur: round(Math.min(maxDur, Math.max(0.1, dur))) };
  if (audio !== undefined) c[key].audio = audio;
}

export function removeTransition(project, id, edge = 'start') {
  const c = project.clips[id];
  if (c) delete c[edge === 'end' ? 'transitionOut' : 'transition'];
}

// Kopier og lim inn: tider lagres relativt til det første klippet.
export function copyClips(project, ids) {
  ids = [...new Set([...ids, ...ids.map((id) => project.clips[id]?.slideshowParent).filter(Boolean)])];
  ids = [...new Set([...ids, ...ids.flatMap((id) => timingChildren(project, id).map((c) => c.id))])];
  const clips = ids.map((id) => project.clips[id]).filter(Boolean);
  if (!clips.length) return null;
  const t0 = Math.min(...clips.map((c) => c.start));
  return clips.sort((a, b) => a.start - b.start).map((c) => ({ ...deepClone(c), start: c.start - t0 }));
}

export function pasteClips(project, items, T) {
  const ids = [];
  const primary = items.filter((c) => c.lane === 0);
  const free = items.filter((c) => c.lane !== 0);
  const groups = new Map();
  const copied = new Map();
  const fresh = (c) => {
    const n = { ...deepClone(c), id: uid(), transition: undefined };
    copied.set(c.id, n.id);
    if (c.group) {
      if (!groups.has(c.group)) groups.set(c.group, uid());
      n.group = groups.get(c.group);
    }
    return n;
  };
  if (primary.length) insertIntoPrimary(project, primary.map((c) => { const n = fresh(c); ids.push(n.id); return n; }), T);
  for (const c of free) {
    const n = fresh(c);
    placeFree(project, n, T + c.start, c.lane);
    ids.push(n.id);
  }
  cleanGroups(project);
  for (const id of ids) {
    const c = project.clips[id];
    for (const field of ['slideshowParent', 'slideshowForeground']) if (c[field]) {
      if (copied.has(c[field])) c[field] = copied.get(c[field]); else delete c[field];
    }
    if (c.slideshowParent && project.clips[c.slideshowParent]) project.clips[c.slideshowParent].group = c.group || (c.group = uid());
    if (!c.linkedTo) continue;
    if (copied.has(c.linkedTo)) c.linkedTo = copied.get(c.linkedTo);
    else delete c.linkedTo;
  }
  syncRecordingTracks(project);
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
    // Nær en vanlig frekvens (også variabel frekvens fra mobil): bruk den. Ellers klippets egen.
    const near = FRAME_RATES.find((f) => Math.abs(f - media.fps) / f < 0.03);
    project.fps = near ?? Math.min(120, Math.round(media.fps * 100) / 100);
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

// Endrer farten. Kildeområdet beholdes, så klippet blir lengre eller kortere på tidslinjen.
export function setSpeed(project, id, speed) {
  id = recordingEditId(project, id);
  if (recordingTimingLocked(project, id)) return;
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
    if (c.transitionOut) c.transitionOut.dur = Math.min(c.transitionOut.dur, c.dur);
  };
  if (c.lane === 0) withSync(project, apply);
  else {
    apply();
    syncRecordingTracks(project);
    resolveLane(project, c);
    updateDuration(project);
  }
}

// Fartsrampe: samme kildeområde, men farten endres gjennom klippet.
export function setRamp(project, id, ramp) {
  id = recordingEditId(project, id);
  if (recordingTimingLocked(project, id)) return;
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
    if (c.transitionOut) c.transitionOut.dur = Math.min(c.transitionOut.dur, c.dur);
  };
  if (c.lane === 0) withSync(project, apply);
  else {
    apply();
    syncRecordingTracks(project);
    resolveLane(project, c);
    updateDuration(project);
  }
}

// Baklengs: samme del av kilden, spilt fra slutt til start.
export function setReverse(project, id, on) {
  id = recordingEditId(project, id);
  if (recordingTimingLocked(project, id)) return;
  const c = project.clips[id];
  if (!c || !['video', 'recording', 'audio'].includes(c.type) || (c.speed === 0 && !c.ramp)) return;
  if (on) c.reverse = true;
  else delete c.reverse;
  syncRecordingTracks(project);
}

// Frosset bilde ved spillhodet: klippet deles og et stillbilde settes inn.
export function freezeFrame(project, T, dur = 2) {
  const p = Object.values(project.clips)
    .filter((c) => (c.type === 'video' || c.type === 'recording') && c.recordingPart !== 'keys' && c.speed !== 0 && c.enabled && T >= c.start && T < c.start + c.dur)
    .sort((a, b) => (b.lane === 0) - (a.lane === 0) || b.lane - a.lane)[0];
  if (!p) return null;
  const camera = recordingChildren(project, p.id)[0];
  const frozenCamera = camera ? deepClone(camera) : null;
  if (frozenCamera) {
    for (const key of Object.keys(camera.kf || {})) if (key !== 'layout') frozenCamera.props[key] = valueAt(camera, key, T);
    frozenCamera.kf = { layout: deepClone(camera.kf.layout || [[0, 6]]) };
  }
  const frameAt = sourceTime(p, T);
  const freeze = deepClone(p);
  freeze.id = uid();
  freeze.speed = 0;
  freeze.freezeAt = round(frameAt);
  freeze.in = round(frameAt);
  freeze.dur = dur;
  freeze.kf = {};
  freeze.transition = undefined;
  freeze.transitionOut = undefined;
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
  if (frozenCamera) {
    frozenCamera.id = uid();
    frozenCamera.linkedTo = freeze.id;
    frozenCamera.name = `${freeze.name} · PiP`;
    project.clips[frozenCamera.id] = frozenCamera;
  }
  syncRecordingTracks(project);
  updateDuration(project);
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
    if (c.props.audioMono?.[stream]) a.props.audioMono = { [stream]: true };
    if (c.kf[volumeProp]) a.kf.volume = deepClone(c.kf[volumeProp]);
    placeFree(project, a, c.start, -1);
    ids.push(a.id);
  };
  // Hver lydkomponent blir et eget lydklipp. Komponenter som var slått av, blir klipp som er slått av.
  for (const comp of audioComponents(c, m)) {
    make(comp.key, `${c.name || m.name} (${comp.label.toLowerCase()})`, componentVolumeProp(c, comp.key));
    if (comp.off) project.clips[ids[ids.length - 1]].enabled = false;
  }
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
  id = recordingEditId(project, id);
  if (recordingTimingLocked(project, id)) return;
  const c = project.clips[id];
  if (!c || isElastic(c)) return;
  const len = mediaLength(project, c);
  const maxIn = len - srcLen(c);
  const move = delta * avgSpeed(c) * (c.reverse ? -1 : 1);
  const next = Math.max(0, Math.min(maxIn, c.in + move));
  shiftKeyframes(c, next - c.in);
  for (const camera of linkedParts(project, id)) shiftKeyframes(camera, next - c.in);
  c.in = round(next);
  syncRecordingTracks(project);
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
