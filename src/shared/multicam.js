// Multicam: flere kameravinkler som er synket mot hverandre, og en liste med kutt som sier
// hvilken vinkel som vises når. På tidslinjen blir resultatet vanlige klipp i en gruppe,
// ett klipp per kutt, og (som standard) ett lydklipp fra vinkelen som har lyden.
//
// Prosjektet lagrer definisjonen i project.multicams[id]:
//   { id, name, angles: [{ id, mediaId, offset }], cuts: [{ t, angle }], audio, range }
// offset er tiden i multicam-klippet der filens start (mediatid 0) ligger.
// cuts er sortert etter t. Hvert kutt gjelder fram til neste.
// audio er id-en til vinkelen som har lyden, eller 'follow' for lyd fra vinkelen som vises.
// range er { in, out } i multicam-tid, eller null for hele lengden.

import { audioComponents, deepClone, makeClip, mediaClipType, uid, updateDuration, relayoutPrimary } from './model.js';
import { ENV_RATE, findOffset, isConfident, mediaReference, prepareEnvelope } from './sync.js';
import { deleteClips, groupMembers, withSync } from './ops.js';

export const MAX_HOTKEY_ANGLES = 9;
const EPS = 1e-6;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// Farger for vinklene, slik at kuttene på tidslinjen kan skilles fra hverandre.
export const ANGLE_COLORS = ['#0a84ff', '#ff9f0a', '#bf5af2', '#30d158', '#ff453a', '#64d2ff', '#ffd60a', '#ff6fae', '#a2845e', '#98989d'];
export const angleColor = (index) => ANGLE_COLORS[index % ANGLE_COLORS.length];

/* Vinkler */

// Bare video og lyd kan være vinkler. Lydfiler gir lyd, men kan ikke vises.
export function canBeAngle(media) {
  if (!media) return false;
  if (media.kind === 'audio') return Boolean(media.streams?.main?.hasAudio);
  return media.kind === 'video' && Object.values(media.streams || {}).some((s) => s.hasVideo);
}

export function angleRejectReason(media) {
  if (!media) return 'The file is no longer in the project.';
  if (media.kind === 'image') return `${media.name} is a still image. Multicam angles must be video or audio.`;
  if (media.kind === 'recording') return `${media.name} is a Reccut recording. Recordings already switch between screen and camera, so they cannot be used as a multicam angle.`;
  if (!canBeAngle(media)) return `${media.name} has no picture or sound that can be used.`;
  return null;
}

export const isVideoAngle = (project, angle) => project.media[angle?.mediaId]?.kind === 'video';
export const angleIndex = (mc, angleId) => mc.angles.findIndex((a) => a.id === angleId);
export const angleNumber = (mc, angleId) => angleIndex(mc, angleId) + 1;

export function angleHasAudio(project, angle) {
  return Object.values(project.media[angle?.mediaId]?.streams || {}).some((s) => s.hasAudio);
}

export function angleExtent(project, angle) {
  const m = project.media[angle.mediaId];
  return { start: angle.offset, end: angle.offset + (m?.duration || 0) };
}

// Hele lengden: fra den første vinkelen starter til den siste slutter.
export function multicamExtent(project, mc) {
  let start = Infinity;
  let end = -Infinity;
  for (const a of mc.angles) {
    const e = angleExtent(project, a);
    start = Math.min(start, e.start);
    end = Math.max(end, e.end);
  }
  return Number.isFinite(start) ? { start, end } : { start: 0, end: 0 };
}

// Delen som havner på tidslinjen (satt med I og O), eller hele lengden.
export function multicamRange(project, mc) {
  const ext = multicamExtent(project, mc);
  if (!mc.range) return { in: ext.start, out: ext.end };
  const a = Math.max(ext.start, mc.range.in);
  const b = Math.min(ext.end, mc.range.out);
  return b > a ? { in: a, out: b } : { in: ext.start, out: ext.end };
}

export function newMulticam(name = 'Multicam Clip') {
  return { id: uid(), name, angles: [], cuts: [], audio: null, range: null };
}

// Den første vinkelen med bilde. Brukes når et kutt peker på noe som er borte.
function firstVideoAngle(project, mc) {
  return mc.angles.find((a) => isVideoAngle(project, a))?.id || null;
}

function firstAudioAngle(project, mc) {
  return mc.angles.find((a) => angleHasAudio(project, a))?.id || null;
}

export function addAngles(project, mc, mediaIds, { at = null } = {}) {
  const added = [];
  const errors = [];
  for (const id of mediaIds) {
    const m = project.media[id];
    const reason = angleRejectReason(m);
    if (reason) {
      errors.push(reason);
      continue;
    }
    if (mc.angles.some((a) => a.mediaId === id)) {
      errors.push(`${m.name} is already an angle.`);
      continue;
    }
    const ext = mc.angles.length ? multicamExtent(project, mc) : { start: 0 };
    const angle = { id: uid(), mediaId: id, offset: at ?? ext.start };
    mc.angles.push(angle);
    added.push(angle.id);
  }
  tidy(project, mc);
  return { added, errors };
}

export function removeAngle(project, mc, angleId) {
  mc.angles = mc.angles.filter((a) => a.id !== angleId);
  tidy(project, mc);
}

// Holder definisjonen gyldig: kutt peker på vinkler med bilde, lyden på en vinkel med lyd.
export function tidy(project, mc) {
  const fallback = firstVideoAngle(project, mc);
  const ids = new Set(mc.angles.map((a) => a.id));
  const ext = multicamExtent(project, mc);
  let cuts = (mc.cuts || []).filter((c) => ids.has(c.angle) && isVideoAngle(project, mc.angles.find((a) => a.id === c.angle)));
  cuts.sort((a, b) => a.t - b.t);
  if (!fallback) cuts = [];
  else if (!cuts.length) cuts = [{ t: ext.start, angle: fallback }];
  else cuts[0] = { ...cuts[0], t: Math.min(cuts[0].t, ext.start) };
  // Kutt med samme vinkel etter hverandre slås sammen, unntatt kutt laget med bladet.
  const keep = (c) => (c.blade ? { t: r6(c.t), angle: c.angle, blade: true } : { t: r6(c.t), angle: c.angle });
  const merged = [];
  for (const c of cuts) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.t - c.t) < EPS) merged[merged.length - 1] = { ...keep(c), t: prev.t };
    else if (!prev || prev.angle !== c.angle || c.blade) merged.push(keep(c));
  }
  // Etter en sammenslåing kan to like naboer ha oppstått.
  mc.cuts = merged.filter((c, i) => i === 0 || c.blade || merged[i - 1].angle !== c.angle);
  if (mc.audio !== 'follow' && !(mc.audio && ids.has(mc.audio) && angleHasAudio(project, mc.angles.find((a) => a.id === mc.audio)))) {
    mc.audio = firstAudioAngle(project, mc);
  }
  if (mc.range && !(mc.range.out > mc.range.in)) mc.range = null;
  return mc;
}

// Flytter alt slik at den tidligste vinkelen starter på 0.
export function normalize(project, mc) {
  if (!mc.angles.length) return mc;
  const { start } = multicamExtent(project, mc);
  if (Math.abs(start) < EPS) return mc;
  for (const a of mc.angles) a.offset = r6(a.offset - start);
  for (const c of mc.cuts) c.t = r6(c.t - start);
  if (mc.range) mc.range = { in: r6(mc.range.in - start), out: r6(mc.range.out - start) };
  return tidy(project, mc);
}

export function setAngleOffset(project, mc, angleId, offset) {
  const a = mc.angles.find((x) => x.id === angleId);
  if (a) a.offset = r6(offset);
  return tidy(project, mc);
}

/* Kutt */

export function cutIndexAt(mc, t) {
  let idx = -1;
  for (let i = 0; i < mc.cuts.length; i++) {
    if (mc.cuts[i].t <= t + EPS) idx = i;
    else break;
  }
  return Math.max(0, idx);
}

export function angleAt(mc, t) {
  return mc.cuts[cutIndexAt(mc, t)]?.angle || null;
}

// Kutter ved t og viser en annen vinkel derfra (talltastene). Gir false om ingenting endret seg.
export function cutAndSwitch(project, mc, t, angleId, { frame = 1 / 30 } = {}) {
  const angle = mc.angles.find((a) => a.id === angleId);
  if (!angle || !isVideoAngle(project, angle)) return false;
  const T = r6(Math.round(t / frame) * frame);
  const i = cutIndexAt(mc, T);
  const cur = mc.cuts[i];
  if (!cur) {
    mc.cuts = [{ t: T, angle: angleId }];
    return tidy(project, mc), true;
  }
  if (cur.angle === angleId) return false;
  // Kutt som ligger nesten på samme sted erstattes, så det ikke blir bitte små biter.
  if (Math.abs(cur.t - T) < frame / 2 || i === 0 && T <= cur.t) cur.angle = angleId;
  else mc.cuts.splice(i + 1, 0, { t: T, angle: angleId });
  tidy(project, mc);
  return true;
}

// Bytter vinkel i biten der t ligger, uten å kutte (Shift og talltast).
export function switchSegment(project, mc, t, angleId) {
  const angle = mc.angles.find((a) => a.id === angleId);
  if (!angle || !isVideoAngle(project, angle) || !mc.cuts.length) return false;
  const i = cutIndexAt(mc, t);
  if (mc.cuts[i].angle === angleId) return false;
  mc.cuts[i].angle = angleId;
  tidy(project, mc);
  return true;
}

// Bladet: deler biten ved t, med samme vinkel på begge sider.
export function bladeAt(mc, t, { frame = 1 / 30 } = {}) {
  const T = r6(Math.round(t / frame) * frame);
  const i = cutIndexAt(mc, T);
  if (!mc.cuts[i] || mc.cuts.some((c) => Math.abs(c.t - T) < frame / 2)) return -1;
  mc.cuts.splice(i + 1, 0, { t: T, angle: mc.cuts[i].angle, blade: true });
  return i + 1;
}

// Fjerner et kutt. Biten før fortsetter der det var.
export function removeCut(project, mc, index) {
  if (index <= 0 || index >= mc.cuts.length) return false;
  mc.cuts.splice(index, 1);
  tidy(project, mc);
  return true;
}

// Trimming: flytter et kutt (rull), men aldri forbi naboene.
export function moveCut(mc, index, t, { frame = 1 / 30 } = {}) {
  if (index <= 0 || index >= mc.cuts.length) return false;
  const lo = mc.cuts[index - 1].t + frame;
  const hi = index + 1 < mc.cuts.length ? mc.cuts[index + 1].t - frame : Infinity;
  const T = Math.round(t / frame) * frame;
  mc.cuts[index].t = r6(Math.max(lo, Math.min(hi, T)));
  return true;
}

// Bitene som vises, innenfor området som havner på tidslinjen.
export function segments(project, mc) {
  const { in: a, out: b } = multicamRange(project, mc);
  const out = [];
  for (let i = 0; i < mc.cuts.length; i++) {
    const s = Math.max(a, i === 0 ? -Infinity : mc.cuts[i].t);
    const e = Math.min(b, mc.cuts[i + 1]?.t ?? Infinity);
    if (e - s > EPS) out.push({ start: s, end: e, angle: mc.cuts[i].angle, index: i });
  }
  return out;
}

// Bitene som faktisk vises. Har den valgte vinkelen ikke bilde et sted (den startet senere
// eller sluttet før), brukes den første vinkelen som har bilde der, så det ikke blir svart.
// fallback: true betyr at en annen vinkel enn den valgte vises. angle er null når ingen har bilde.
export function programPieces(project, mc) {
  const covers = (a, t) => {
    const e = angleExtent(project, a);
    return isVideoAngle(project, a) && e.start <= t + EPS && t < e.end - EPS;
  };
  const edges = new Set();
  for (const a of mc.angles) {
    const e = angleExtent(project, a);
    edges.add(e.start);
    edges.add(e.end);
  }
  const out = [];
  for (const seg of segments(project, mc)) {
    const cuts = [seg.start, ...[...edges].filter((x) => x > seg.start + EPS && x < seg.end - EPS).sort((a, b) => a - b), seg.end];
    for (let i = 0; i < cuts.length - 1; i++) {
      const s = cuts[i];
      const e = cuts[i + 1];
      const mid = (s + e) / 2;
      const chosen = mc.angles.find((a) => a.id === seg.angle);
      const use = chosen && covers(chosen, mid) ? chosen : mc.angles.find((a) => covers(a, mid)) || null;
      const piece = { start: s, end: e, angle: use?.id || null, chosen: seg.angle, fallback: Boolean(use && use.id !== seg.angle), index: seg.index };
      const prev = out[out.length - 1];
      if (prev && prev.angle === piece.angle && prev.chosen === piece.chosen && Math.abs(prev.end - s) < EPS) prev.end = e;
      else out.push(piece);
    }
  }
  return out;
}

// Vinkelen som vises ved t, med reserve som over.
export function pictureAngleAt(project, mc, t) {
  const covers = (a) => {
    const e = angleExtent(project, a);
    return isVideoAngle(project, a) && e.start <= t + EPS && t < e.end - EPS;
  };
  const chosen = mc.angles.find((a) => a.id === angleAt(mc, t));
  if (chosen && covers(chosen)) return chosen.id;
  return mc.angles.find(covers)?.id || null;
}

/* Automatisk synk: lyden i hver vinkel sammenlignes med de vinklene som allerede er synket. */

function angleAudioRef(project, angle) {
  const m = project.media[angle.mediaId];
  if (!m) return null;
  if (m.kind === 'audio') return m.streams.main?.hasAudio ? { stream: m.streams.main } : null;
  const ref = mediaReference(m);
  return ref ? { stream: ref.stream } : null;
}

/**
 * Finner forskyvningen for hver vinkel. waveFor(path) gir { peaks } eller null.
 * Svar: { offsets: { [angleId]: offset }, failures: [{ angleId, number, name, reason }] }.
 * Den første vinkelen med lyd er referansen og blir stående der den er.
 */
export function planMulticamSync(project, mc, waveFor) {
  const failures = [];
  const offsets = {};
  const env = new Map();
  const label = (a) => `angle ${angleNumber(mc, a.id)} (${project.media[a.mediaId]?.name || 'missing file'})`;
  const fail = (a, reason) => failures.push({ angleId: a.id, number: angleNumber(mc, a.id), name: project.media[a.mediaId]?.name || '', reason });
  for (const a of mc.angles) {
    const ref = angleAudioRef(project, a);
    if (!ref) {
      fail(a, `Could not synchronize ${label(a)}: it has no audio to compare with.`);
      continue;
    }
    if (!ref.stream.wave) {
      fail(a, `Could not synchronize ${label(a)}: the audio is still being analyzed. Try again in a moment.`);
      continue;
    }
    const w = waveFor(ref.stream.wave);
    if (!w?.peaks?.length) {
      fail(a, `Could not synchronize ${label(a)}: the audio could not be read.`);
      continue;
    }
    env.set(a.id, { x: prepareEnvelope(w.peaks), so: ref.stream.offset || 0 });
  }
  const usable = mc.angles.filter((a) => env.has(a.id));
  if (!usable.length) return { offsets, failures, reference: null };
  const reference = usable[0];
  offsets[reference.id] = reference.offset;
  const synced = [reference];
  let pending = usable.slice(1);
  // Vinkler som ikke passer mot referansen, kan passe mot en annen som allerede er synket.
  while (pending.length) {
    const next = [];
    let progress = false;
    for (const a of pending) {
      let best = null;
      for (const s of synced) {
        const r = findOffset(env.get(s.id).x, env.get(a.id).x);
        if (isConfident(r) && (!best || r.score > best.r.score)) best = { r, s };
      }
      if (!best) {
        next.push(a);
        continue;
      }
      const { r, s } = best;
      offsets[a.id] = r6(offsets[s.id] + env.get(s.id).so - env.get(a.id).so - r.lag / ENV_RATE);
      synced.push(a);
      progress = true;
    }
    if (!progress) {
      for (const a of next) fail(a, `Could not synchronize ${label(a)}: no matching sound was found in the other angles. Make sure the angles were recorded at the same time, or drag it into place in the timeline.`);
      break;
    }
    pending = next;
  }
  failures.sort((x, y) => x.number - y.number);
  return { offsets, failures, reference: reference.id };
}

export function applyMulticamSync(project, mc, offsets) {
  // Kuttene står i multicam-tid. Når referansen står fast, blir de stående.
  for (const a of mc.angles) if (offsets[a.id] != null) a.offset = offsets[a.id];
  return normalize(project, tidy(project, mc));
}

/* Fra tidslinjen: valgte klipp over hverandre blir vinkler, og det som vises nå blir kuttene. */

export function multicamFromClips(project, ids, { name } = {}) {
  const clips = ids.map((id) => project.clips[id]).filter((c) => c && (c.type === 'video' || c.type === 'audio') && project.media[c.mediaId]);
  const mc = newMulticam(name || nextMulticamName(project));
  const byMedia = new Map();
  for (const c of [...clips].sort((a, b) => (b.type === 'video') - (a.type === 'video') || b.lane - a.lane || a.start - b.start)) {
    if (byMedia.has(c.mediaId)) continue;
    if (angleRejectReason(project.media[c.mediaId])) continue;
    const plain = (c.speed ?? 1) === 1 && !c.ramp && !c.reverse;
    const angle = { id: uid(), mediaId: c.mediaId, offset: r6(c.start - (plain ? c.in : 0)) };
    byMedia.set(c.mediaId, angle);
  }
  // Vinkel 1 er den nederste: vanligvis hovedkameraet i hovedsporet.
  mc.angles = [...byMedia.values()].sort((a, b) => {
    const ca = clips.find((c) => c.mediaId === a.mediaId);
    const cb = clips.find((c) => c.mediaId === b.mediaId);
    return (ca.type === 'audio') - (cb.type === 'audio') || ca.lane - cb.lane || ca.start - cb.start;
  });
  const visual = clips.filter((c) => c.type === 'video' && byMedia.has(c.mediaId));
  if (visual.length) {
    // Kuttene følger det som synes øverst, som i et lagdelt oppsett.
    const times = [...new Set(visual.flatMap((c) => [c.start, c.start + c.dur]))].sort((a, b) => a - b);
    const cuts = [];
    for (let i = 0; i < times.length - 1; i++) {
      const mid = (times[i] + times[i + 1]) / 2;
      const top = visual.filter((c) => c.start <= mid && mid < c.start + c.dur).sort((a, b) => b.lane - a.lane)[0];
      if (top) cuts.push({ t: times[i], angle: byMedia.get(top.mediaId).id });
    }
    mc.cuts = cuts;
    const start = Math.min(...clips.map((c) => c.start));
    const end = Math.max(...clips.map((c) => c.start + c.dur));
    mc.range = { in: start, out: end };
  }
  // Lyden: et eget lydklipp blant de valgte, ellers vinkel 1.
  const audioClip = clips.find((c) => c.type === 'audio' && byMedia.has(c.mediaId));
  mc.audio = audioClip ? byMedia.get(audioClip.mediaId).id : null;
  tidy(project, mc);
  return normalize(project, mc);
}

export function nextMulticamName(project) {
  const used = new Set(Object.values(project.multicams || {}).map((m) => m.name));
  let n = 1;
  while (used.has(`Multicam ${n}`)) n++;
  return `Multicam ${n}`;
}

/* Til tidslinjen */

export function multicamOfClip(project, clipId) {
  const id = project.clips[clipId]?.multicam?.id;
  return id && project.multicams?.[id] ? project.multicams[id] : null;
}

// Klippene i den åpne sekvensen som kommer fra multicam-klippet.
export function multicamClips(project, mcId) {
  return Object.values(project.clips).filter((c) => c.multicam?.id === mcId).map((c) => c.id);
}

function audioStreamKeys(media) {
  return Object.entries(media.streams || {}).filter(([, s]) => s.hasAudio).map(([k]) => k);
}

/**
 * Lager klippene: ett videoklipp per bit (mellomrom der vinkelen mangler bilde) og lydklipp
 * fra vinkelen som har lyden. Tidene regnes fra starten av området. Klipp som fantes fra før,
 * gir egenskapene sine (effekter, farge, posisjon) videre til nye biter fra samme vinkel.
 */
export function buildMulticamClips(project, mc, { previous = [] } = {}) {
  const range = multicamRange(project, mc);
  const follow = mc.audio === 'follow';
  const video = [];
  const audio = [];
  const oldProps = new Map();
  const oldAudio = new Map();
  for (const c of previous) {
    const key = c.multicam?.angle;
    if (!key) continue;
    if (c.type === 'audio') oldAudio.set(`${key}:${c.stream || 'main'}`, c);
    else if (!oldProps.has(key)) oldProps.set(key, c);
  }
  const gap = (start, dur) => {
    const g = makeClip('gap', { start, dur, name: 'Gap' });
    g.multicam = { id: mc.id };
    return g;
  };
  // Biter etter hverandre med samme vinkel blir ett klipp, selv om det var en annen vinkel som var valgt.
  const pieces = [];
  for (const piece of programPieces(project, mc)) {
    const prev = pieces[pieces.length - 1];
    if (prev && prev.angle === piece.angle && Math.abs(prev.end - piece.start) < EPS) prev.end = piece.end;
    else pieces.push({ ...piece });
  }
  for (const seg of pieces) {
    const angle = mc.angles.find((a) => a.id === seg.angle);
    const m = project.media[angle?.mediaId];
    const t0 = seg.start - range.in;
    if (!m) {
      video.push(gap(r6(t0), r6(seg.end - seg.start)));
      continue;
    }
    const s = seg.start;
    const e = seg.end;
    {
      const c = makeClip(mediaClipType(m), { media: m, start: r6(s - range.in), in: r6(s - angle.offset), dur: r6(e - s) });
      const prev = oldProps.get(angle.id);
      if (prev) c.props = { ...c.props, ...deepClone(prev.props) };
      c.name = `${mc.name} · Angle ${angleNumber(mc, angle.id)}`;
      c.multicam = { id: mc.id, angle: angle.id };
      if (!follow) c.props.audioOff = { ...(c.props.audioOff || {}), ...Object.fromEntries(audioStreamKeys(m).map((k) => [k, true])) };
      else if (prev) c.props.audioOff = { ...(m.audioOff || {}) };
      video.push(c);
    }
  }
  if (!follow && mc.audio) {
    const angle = mc.angles.find((a) => a.id === mc.audio);
    const m = project.media[angle?.mediaId];
    if (m) {
      const ext = angleExtent(project, angle);
      const s = Math.max(range.in, ext.start);
      const e = Math.min(range.out, ext.end);
      if (e - s > EPS) {
        const probe = makeClip(mediaClipType(m), { media: m });
        const comps = m.kind === 'audio' ? [{ key: 'main', label: 'Audio', off: false }] : audioComponents(probe, m);
        for (const comp of comps) {
          const a = makeClip('audio', { media: m, start: r6(s - range.in), in: r6(s - angle.offset), dur: r6(e - s), lane: -1 });
          a.stream = comp.key;
          const prev = oldAudio.get(`${angle.id}:${comp.key}`);
          if (prev) a.props = { ...a.props, ...deepClone(prev.props) };
          a.name = `${mc.name} audio${comps.length > 1 ? ` (${comp.label.toLowerCase()})` : ''}`;
          a.multicam = { id: mc.id, angle: angle.id };
          if (comp.off) a.enabled = false;
          audio.push(a);
        }
      }
    }
  }
  // Mellomrom til slutt har ingen funksjon.
  while (video.length && video[video.length - 1].type === 'gap') video.pop();
  return { video, audio, duration: range.out - range.in };
}

// Finn et spor over hovedsporet der hele området er ledig.
function freeLaneFor(project, start, end, from = 1) {
  for (let lane = Math.max(1, from); ; lane++) {
    if (project.lanes?.[lane]?.locked) continue;
    const busy = Object.values(project.clips).some((c) => c.lane === lane && c.start < end - EPS && start < c.start + c.dur - EPS);
    if (!busy) return lane;
  }
}

function freeAudioLane(project, start, end) {
  for (let lane = -1; ; lane--) {
    if (project.lanes?.[lane]?.locked) continue;
    const busy = Object.values(project.clips).some((c) => c.lane === lane && c.start < end - EPS && start < c.start + c.dur - EPS);
    if (!busy) return lane;
  }
}

/**
 * Legger multicam-klippet på tidslinjen som en gruppe. replace er klippene det skal erstatte:
 * de valgte klippene det ble laget av, eller en tidligere versjon av samme multicam-klipp.
 * Lå noen av dem i hovedsporet, kommer resultatet dit. Ellers legges det i et ledig spor der
 * de lå, og uten noe å erstatte legges det til slutt i hovedsporet. Gir id-ene til de nye klippene.
 */
export function placeMulticam(project, mc, { replace = [], at = null } = {}) {
  project.multicams = { ...(project.multicams || {}), [mc.id]: deepClone(mc) };
  const old = replace.map((id) => project.clips[id]).filter(Boolean);
  const oldIds = new Set(old.flatMap((c) => groupMembers(project, c.id)));
  for (const c of old) oldIds.add(c.id);
  const previous = [...oldIds].map((id) => deepClone(project.clips[id]));
  const { video, audio } = buildMulticamClips(project, mc, { previous });
  if (!video.length && !audio.length) return [];
  const group = uid();
  for (const c of [...video, ...audio]) c.group = group;

  const inPrimary = project.primary.filter((id) => oldIds.has(id));
  let primaryIdx = null;
  let start = at;
  let lane = 1;
  if (old.length) {
    start = Math.min(...previous.map((c) => c.start));
    lane = Math.min(...previous.filter((c) => c.lane > 0).map((c) => c.lane), Infinity);
    if (!Number.isFinite(lane)) lane = 1;
    if (inPrimary.length) {
      const first = project.primary.indexOf(inPrimary[0]);
      primaryIdx = project.primary.slice(0, first).filter((id) => !oldIds.has(id)).length;
    }
    deleteClips(project, [...oldIds], { ripple: true });
    if (primaryIdx != null) primaryIdx = Math.min(primaryIdx, project.primary.length);
  } else if (at == null) {
    primaryIdx = project.primary.length;
  }

  if (primaryIdx != null) {
    withSync(project, () => {
      video.forEach((c, i) => {
        c.lane = 0;
        project.clips[c.id] = c;
        project.primary.splice(primaryIdx + i, 0, c.id);
      });
    });
    relayoutPrimary(project);
    const base = video.length ? project.clips[video[0].id].start : project.duration;
    for (const a of audio) {
      a.start = r6(base + a.start);
      a.lane = freeAudioLane(project, a.start, a.start + a.dur);
      project.clips[a.id] = a;
    }
  } else {
    const s0 = Math.max(0, start ?? 0);
    const real = video.filter((c) => c.type !== 'gap');
    const end = s0 + Math.max(0, ...video.map((c) => c.start + c.dur));
    const L = freeLaneFor(project, s0, end, lane);
    for (const c of real) {
      c.start = r6(s0 + c.start);
      c.lane = L;
      project.clips[c.id] = c;
    }
    for (const a of audio) {
      a.start = r6(s0 + a.start);
      a.lane = freeAudioLane(project, a.start, a.start + a.dur);
      project.clips[a.id] = a;
    }
    video.length = 0;
    video.push(...real);
  }
  updateDuration(project);
  return [...video, ...audio].map((c) => c.id).filter((id) => project.clips[id]);
}

// Medier som brukes av multicam-klipp i prosjektet, også vinkler som ikke vises nå.
export function multicamMedia(project) {
  const set = new Set();
  for (const mc of Object.values(project.multicams || {})) for (const a of mc.angles) set.add(a.mediaId);
  return set;
}
