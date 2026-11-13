// Multicam: flere kameravinkler som er synket mot hverandre, og en liste med kutt som sier
// hvilken vinkel som vises når. På tidslinjen blir resultatet vanlige klipp i en gruppe,
// ett klipp per kutt, og (som standard) ett lydklipp fra vinkelen som har lyden.
//
// Prosjektet lagrer definisjonen i project.multicams[id]:
//   { id, name, angles: [{ id, mediaId, offset }], cuts: [{ t, angle }], audio, range }
// offset er tiden i multicam-klippet der filens start (mediatid 0) ligger.
// cuts er sortert etter t. Hvert kutt gjelder fram til neste.
// Nye oppsett har programMode: 'selected'. Der har hvert kutt en end-tid,
// og bare intervallet [t, end) er valgt. Eldre oppsett beholder hele programmet.
// audio er id-en til vinkelen som har lyden, eller 'follow' for lyd fra vinkelen som vises.
// range er { in, out } i multicam-tid, eller null for hele lengden.
// fallback er vinkelen som brukes der den valgte ikke har bilde: 'auto' (første kamera med
// bilde), 'none' (et hull) eller id-en til en vinkel.
// angle.sound er lydinnstillingene for kilden (nivå, kanal, gain, EQ), se SOUND_DEFAULTS.

import { EQ_PRESETS, makeEffect } from './audiofx.js';
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

// Kameraene nummereres 1, 2, 3 og lydkildene A1, A2, hver for seg. Talltastene gjelder kameraene.
export const videoAngles = (project, mc) => mc.angles.filter((a) => isVideoAngle(project, a));
export const audioOnlyAngles = (project, mc) => mc.angles.filter((a) => !isVideoAngle(project, a));
export function angleLabel(project, mc, angleId) {
  const a = mc.angles.find((x) => x.id === angleId);
  if (!a) return '';
  return isVideoAngle(project, a) ? String(videoAngles(project, mc).indexOf(a) + 1) : `A${audioOnlyAngles(project, mc).indexOf(a) + 1}`;
}
export function angleTitle(project, mc, angleId) {
  const a = mc.angles.find((x) => x.id === angleId);
  if (!a) return '';
  const name = project.media[a.mediaId]?.name || 'missing file';
  return isVideoAngle(project, a) ? `camera ${angleLabel(project, mc, angleId)} (${name})` : `audio ${angleLabel(project, mc, angleId)} (${name})`;
}

/* Lyd: enkle innstillinger per kilde som blir vanlige lydeffekter på klippene. */

// volumeKf: nøkkelbilder for nivået, [[tid i multicam-klippet, dB]], sortert. Tomt betyr fast nivå (volume).
// clean: AI Clean Voice, styrke 0 til 1, eller null når det er av. Samme Clean Voice som i redigeringen.
export const SOUND_DEFAULTS = { volume: 0, volumeKf: [], clean: null, channels: 'both', gain: 0, eqPreset: 'flat', bass: 0, mid: 0, treble: 0, rumble: false, noise: false };
export const CHANNEL_MODES = [
  { id: 'both', label: 'Both channels (as recorded)', mode: 0 },
  { id: 'left', label: 'Left channel only', mode: 1 },
  { id: 'right', label: 'Right channel only', mode: 2 },
  { id: 'swap', label: 'Swap left and right', mode: 3 },
  { id: 'mono', label: 'Mix to mono', mode: 4 },
];
// Hvor mye Bass, Mid og Treble løfter hvert av de ti EQ-båndene (31 Hz til 16 kHz).
const EQ_WEIGHTS = {
  bass: [1, 1, 0.8, 0.4, 0.1, 0, 0, 0, 0, 0],
  mid: [0, 0, 0.1, 0.4, 0.8, 1, 0.7, 0.3, 0, 0],
  treble: [0, 0, 0, 0, 0, 0, 0.3, 0.7, 1, 1],
};

export function angleSound(angle) {
  return { ...SOUND_DEFAULTS, ...(angle?.sound || {}) };
}

export function soundBands(sound) {
  const base = EQ_PRESETS.find((x) => x.id === sound.eqPreset)?.g || EQ_PRESETS[0].g;
  return base.map((g, i) => Math.max(-18, Math.min(18, Math.round((g + sound.bass * EQ_WEIGHTS.bass[i] + sound.mid * EQ_WEIGHTS.mid[i] + sound.treble * EQ_WEIGHTS.treble[i]) * 2) / 2)));
}

// Effektene for innstillingene, i fast rekkefølge og med faste id-er (mc-...), så de kan byttes
// ut senere uten å røre effekter brukeren har lagt til selv i redigeringen.
export function soundEffects(sound) {
  const s = { ...SOUND_DEFAULTS, ...sound };
  const out = [];
  const add = (id, type, p) => out.push({ ...makeEffect(type, p), id: `mc-${id}` });
  const ch = CHANNEL_MODES.find((x) => x.id === s.channels);
  if (ch && ch.mode) add('channels', 'channels', { mode: ch.mode });
  if (s.rumble) add('rumble', 'highpass', { freq: 80 });
  if (s.noise) add('noise', 'denoise', { amount: 0.6 });
  if (s.gain) add('gain', 'gain', { db: s.gain });
  const bands = soundBands(s);
  if (bands.some((g) => g !== 0)) add('eq', 'eq', Object.fromEntries(bands.map((g, i) => [`b${i}`, g])));
  return out;
}

export const isSoundDefault = (sound) => soundEffects(sound).length === 0 && !(sound?.volume) && sound?.clean == null && !sound?.volumeKf?.length;

// Lydstrømmene i en fil som har lyd. Clean Voice renser hver av dem.
export function soundKeys(media) {
  return Object.entries(media?.streams || {}).filter(([, s]) => s.hasAudio).map(([k]) => k);
}

// Legger lydinnstillingene på et klipp: nivået blir klippets volum, resten blir effekter først i kjeden.
// Nivået ved tiden t i multicam-klippet, med rette linjer mellom nøkkelbildene.
export function soundLevelAt(sound, t) {
  const list = sound?.volumeKf || [];
  if (!list.length) return sound?.volume ?? 0;
  if (t <= list[0][0]) return list[0][1];
  for (let i = 1; i < list.length; i++) {
    const [t0, v0] = list[i - 1];
    const [t1, v1] = list[i];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0 || 1);
  }
  return list[list.length - 1][1];
}

// Legger lydinnstillingene på et klipp: nivået blir klippets volum (med nøkkelbilder i kildetid),
// resten blir effekter først i kjeden.
export function applySound(clip, sound, offset = 0, keys = [clip.stream || 'main']) {
  const s = { ...SOUND_DEFAULTS, ...sound };
  clip.props.volume = s.volume;
  // AI Clean Voice: samme innstilling som Audio-fanen i redigeringen (props.cleanVoice per lydstrøm).
  if (s.clean != null) clip.props.cleanVoice = Object.fromEntries(keys.map((k) => [k, s.clean]));
  else delete clip.props.cleanVoice;
  if (s.volumeKf.length) clip.kf = { ...clip.kf, volume: s.volumeKf.map(([t, v]) => [r6(t - offset), v, 'linear']) };
  else if (clip.kf?.volume) delete clip.kf.volume;
  clip.props.afx = [...soundEffects(s), ...(clip.props.afx || []).filter((e) => !String(e.id).startsWith('mc-'))];
  return clip;
}

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
  return { id: uid(), name, angles: [], cuts: [], audio: null, range: null, fallback: 'auto', programMode: 'selected' };
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
      errors.push(`${m.name} is already added.`);
      continue;
    }
    const ext = mc.angles.length ? multicamExtent(project, mc) : { start: 0 };
    const angle = { id: uid(), mediaId: id, offset: at ?? ext.start };
    mc.angles.push(angle);
    added.push(angle.id);
    // Lyd tatt opp for seg (en ekstern opptaker) er vanligvis den beste lyden, så den tas i bruk.
    if (m.kind === 'audio') mc.audio = angle.id;
  }
  tidy(project, mc);
  return { added, errors };
}

// Flytter et spor opp eller ned. Kameraene og lydsporene har hver sin rekkefølge (1, 2, 3 og A1, A2),
// så sporet flyttes bare blant sine egne. Kuttene peker på id-er og følger med.
export function moveAngle(project, mc, angleId, index) {
  const a = mc.angles.find((x) => x.id === angleId);
  if (!a) return false;
  const video = isVideoAngle(project, a);
  const same = mc.angles.filter((x) => x.id !== angleId && isVideoAngle(project, x) === video);
  same.splice(Math.max(0, Math.min(same.length, index)), 0, a);
  let k = 0;
  const next = mc.angles.map((x) => (isVideoAngle(project, x) === video ? same[k++] : x));
  if (next.every((x, i) => x === mc.angles[i])) return false;
  mc.angles = next;
  return true;
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
  const selectedOnly = mc.programMode === 'selected';
  let cuts = (mc.cuts || []).filter((c) => ids.has(c.angle) && isVideoAngle(project, mc.angles.find((a) => a.id === c.angle)));
  cuts.sort((a, b) => a.t - b.t);
  if (!fallback) cuts = [];
  else if (!selectedOnly && !cuts.length) cuts = [{ t: ext.start, angle: fallback }];
  else if (!selectedOnly && cuts.length) cuts[0] = { ...cuts[0], t: Math.min(cuts[0].t, ext.start) };
  // Kutt med samme vinkel etter hverandre slås sammen, unntatt kutt laget med bladet.
  const keep = (c) => ({ t: r6(c.t), angle: c.angle,
    ...(c.blade ? { blade: true } : {}), ...(c.end != null ? { end: r6(c.end) } : {}) });
  const merged = [];
  for (const c of cuts) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(prev.t - c.t) < EPS) merged[merged.length - 1] = { ...keep(c), t: prev.t };
    else if (selectedOnly || !prev || prev.angle !== c.angle || c.blade) merged.push(keep(c));
  }
  // Etter en sammenslåing kan to like naboer ha oppstått.
  mc.cuts = selectedOnly ? merged : merged.filter((c, i) => i === 0 || c.blade || merged[i - 1].angle !== c.angle);
  if (mc.audio !== 'follow' && !(mc.audio && ids.has(mc.audio) && angleHasAudio(project, mc.angles.find((a) => a.id === mc.audio)))) {
    mc.audio = firstAudioAngle(project, mc);
  }
  if (mc.range && !(mc.range.out > mc.range.in)) mc.range = null;
  if (!['auto', 'none'].includes(mc.fallback) && !(ids.has(mc.fallback) && isVideoAngle(project, mc.angles.find((a) => a.id === mc.fallback)))) mc.fallback = 'auto';
  return mc;
}

// Flytter alt slik at den tidligste vinkelen starter på 0.
export function normalize(project, mc) {
  if (!mc.angles.length) return mc;
  const { start } = multicamExtent(project, mc);
  if (Math.abs(start) < EPS) return mc;
  for (const a of mc.angles) a.offset = r6(a.offset - start);
  for (const c of mc.cuts) {
    c.t = r6(c.t - start);
    if (c.end != null) c.end = r6(c.end - start);
  }
  for (const a of mc.angles) if (a.sound?.volumeKf?.length) a.sound.volumeKf = a.sound.volumeKf.map(([t, v]) => [r6(t - start), v]);
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
  const cut = mc.cuts[cutIndexAt(mc, t)];
  if (mc.programMode === 'selected' && (!cut || t < cut.t - EPS || t >= (cut.end ?? Infinity) - EPS)) return null;
  return cut?.angle || null;
}

// Kutter ved t og viser en annen vinkel derfra (talltastene). Gir false om ingenting endret seg.
export function cutAndSwitch(project, mc, t, angleId, { frame = 1 / 30, preserveCuts = false } = {}) {
  const angle = mc.angles.find((a) => a.id === angleId);
  if (!angle || !isVideoAngle(project, angle)) return false;
  const T = r6(Math.round(t / frame) * frame);
  const selectedOnly = mc.programMode === 'selected';
  const i = selectedOnly && mc.cuts[0]?.t > T + EPS ? -1 : cutIndexAt(mc, T);
  const cur = mc.cuts[i];
  if (selectedOnly) {
    const ext = multicamExtent(project, mc);
    if (T < ext.start - EPS || T >= ext.end - EPS) return false;
    const covered = angleAt(mc, T);
    if (covered === angleId) return false;
    const next = mc.cuts[i + 1];
    const end = r6(Math.min(ext.end, next?.t ?? Infinity, covered ? cur.end ?? ext.end : T + frame));
    if (end <= T) return false;
    if (cur && Math.abs(cur.t - T) < frame / 2) {
      cur.angle = angleId;
      cur.end = end;
    } else {
      if (cur && covered) cur.end = T;
      mc.cuts.splice(i + 1, 0, { t: T, angle: angleId, end });
    }
    tidy(project, mc);
    return true;
  }
  if (!cur) {
    mc.cuts = [{ t: T, angle: angleId }];
    return tidy(project, mc), true;
  }
  if (cur.angle === angleId) return false;
  // Kutt som ligger nesten på samme sted erstattes, så det ikke blir bitte små biter.
  const replace = Math.abs(cur.t - T) < frame / 2 || i === 0 && T <= cur.t;
  if (replace) cur.angle = angleId;
  else mc.cuts.splice(i + 1, 0, { t: T, angle: angleId });
  if (preserveCuts) keepSegmentBoundaries(mc, replace ? i : i + 1);
  tidy(project, mc);
  return true;
}

// Bytter vinkel i biten der t ligger, uten å kutte (Shift og talltast).
export function switchSegment(project, mc, t, angleId, { preserveCuts = false, frame = 1 / 30 } = {}) {
  if (mc.programMode === 'selected' && !angleAt(mc, t)) return cutAndSwitch(project, mc, t, angleId, { frame, preserveCuts });
  const angle = mc.angles.find((a) => a.id === angleId);
  if (!angle || !isVideoAngle(project, angle) || !mc.cuts.length) return false;
  const i = cutIndexAt(mc, t);
  if (mc.cuts[i].angle === angleId) return false;
  mc.cuts[i].angle = angleId;
  if (preserveCuts) keepSegmentBoundaries(mc, i);
  tidy(project, mc);
  return true;
}

// Extend only camera choices reached during review. Seeking through an empty
// area alone never chooses a camera. Existing later cuts bound every extension.
export function extendProgram(project, mc, from, to) {
  if (mc.programMode !== 'selected' || Math.abs(to - from) < EPS) return false;
  const extent = multicamExtent(project, mc);
  let changed = false;
  for (let i = 0; i < mc.cuts.length; i++) {
    const cut = mc.cuts[i];
    if (to < from) {
      if (cut.t > from + EPS || cut.end <= to + EPS) continue;
      const start = r6(Math.max(to, extent.start, mc.cuts[i - 1]?.end ?? -Infinity));
      if (start < cut.t - EPS) {
        cut.t = start;
        changed = true;
      }
      continue;
    }
    if (cut.t >= to || (cut.end ?? Infinity) < from - EPS) continue;
    const end = r6(Math.min(to, extent.end, mc.cuts[i + 1]?.t ?? Infinity));
    if (cut.end != null && end > cut.end + EPS) {
      cut.end = end;
      changed = true;
    }
  }
  return changed;
}

// Paused angle auditions must keep both edges, even when neighbouring angles
// become equal. Otherwise a second choice at the same playhead edits those
// neighbours too. Like blade cuts, these boundaries survive tidy and saving.
function keepSegmentBoundaries(mc, index) {
  if (index > 0) mc.cuts[index].blade = true;
  if (mc.cuts[index + 1]) mc.cuts[index + 1].blade = true;
}

// Bladet: deler biten ved t, med samme vinkel på begge sider.
export function bladeAt(mc, t, { frame = 1 / 30 } = {}) {
  const T = r6(Math.round(t / frame) * frame);
  const i = cutIndexAt(mc, T);
  if (!mc.cuts[i] || mc.cuts.some((c) => Math.abs(c.t - T) < frame / 2)) return -1;
  if (mc.programMode === 'selected' && !angleAt(mc, T)) return -1;
  const cut = { t: T, angle: mc.cuts[i].angle, blade: true };
  if (mc.cuts[i].end != null) {
    cut.end = mc.cuts[i].end;
    mc.cuts[i].end = T;
  }
  mc.cuts.splice(i + 1, 0, cut);
  return i + 1;
}

// Fjerner et kutt. Biten før fortsetter der det var.
export function removeCut(project, mc, index) {
  if (mc.programMode === 'selected') {
    const cut = mc.cuts[index];
    if (!cut) return false;
    const prev = mc.cuts[index - 1];
    if (prev && prev.end >= cut.t - EPS) prev.end = Math.max(prev.end, cut.end);
    mc.cuts.splice(index, 1);
    tidy(project, mc);
    return true;
  }
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
  const next = r6(Math.max(lo, Math.min(hi, T)));
  if (mc.programMode === 'selected') {
    const cut = mc.cuts[index], prev = mc.cuts[index - 1];
    if (prev.end >= cut.t - EPS) prev.end = next;
    cut.end = Math.max(cut.end, next + frame);
  }
  mc.cuts[index].t = next;
  return true;
}

// Bitene som vises, innenfor området som havner på tidslinjen.
export function segments(project, mc) {
  const { in: a, out: b } = multicamRange(project, mc);
  const out = [];
  for (let i = 0; i < mc.cuts.length; i++) {
    const s = Math.max(a, i === 0 && mc.programMode !== 'selected' ? -Infinity : mc.cuts[i].t);
    const e = Math.min(b, mc.cuts[i + 1]?.t ?? Infinity, mc.cuts[i].end ?? Infinity);
    if (e - s > EPS) out.push({ start: s, end: e, angle: mc.cuts[i].angle, index: i });
  }
  return out;
}

function covers(project, a, t) {
  if (!a || !isVideoAngle(project, a)) return false;
  const e = angleExtent(project, a);
  return e.start <= t + EPS && t < e.end - EPS;
}

// Vinkelen som vises ved t når chosenId er valgt: den valgte, så reservesporet (mc.fallback),
// så det første kameraet med bilde. Med fallback 'none' blir det et hull.
function useAngle(project, mc, chosenId, t) {
  if (!chosenId) return null;
  const chosen = mc.angles.find((a) => a.id === chosenId);
  if (covers(project, chosen, t)) return chosen;
  if (mc.fallback === 'none') return null;
  const fb = mc.angles.find((a) => a.id === mc.fallback);
  if (covers(project, fb, t)) return fb;
  return mc.angles.find((a) => covers(project, a, t)) || null;
}

// Bitene som faktisk vises. Har den valgte vinkelen ikke bilde et sted (den startet senere
// eller sluttet før), brukes reservesporet, så det ikke blir svart.
// fallback: true betyr at en annen vinkel enn den valgte vises. angle er null når ingen har bilde.
export function programPieces(project, mc) {
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
      const use = useAngle(project, mc, seg.angle, mid);
      const piece = { start: s, end: e, angle: use?.id || null, chosen: seg.angle, fallback: Boolean(use && use.id !== seg.angle), index: seg.index };
      const prev = out[out.length - 1];
      // Bare biter fra samme kutt slås sammen. Kutt med samme kamera på begge sider er laget med bladet.
      if (prev && prev.index === piece.index && prev.angle === piece.angle && prev.chosen === piece.chosen && Math.abs(prev.end - s) < EPS) prev.end = e;
      else out.push(piece);
    }
  }
  return out;
}

// Vinkelen som vises ved t, med reserve som over.
export function pictureAngleAt(project, mc, t) {
  return useAngle(project, mc, angleAt(mc, t), t)?.id || null;
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
// only: synk bare den vinkelen mot de andre, som blir stående der de er (høyreklikk › Synchronize to Audio).
export function planMulticamSync(project, mc, waveFor, { only = null } = {}) {
  const failures = [];
  const offsets = {};
  const env = new Map();
  const label = (a) => angleTitle(project, mc, a.id);
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
  if (only) {
    const target = mc.angles.find((a) => a.id === only);
    const own = failures.filter((f) => f.angleId === only);
    if (!target || own.length) return { offsets: {}, failures: own, reference: null };
    const others = usable.filter((a) => a.id !== only);
    if (!others.length) return { offsets: {}, failures: [{ angleId: only, number: angleNumber(mc, only), name: project.media[target.mediaId]?.name || '', reason: `Could not synchronize ${label(target)}: none of the other files have sound to compare with.` }], reference: null };
    let best = null;
    for (const s of others) {
      const r = findOffset(env.get(s.id).x, env.get(only).x);
      if (isConfident(r) && (!best || r.score > best.r.score)) best = { r, s };
    }
    if (!best) return { offsets: {}, failures: [{ angleId: only, number: angleNumber(mc, only), name: project.media[target.mediaId]?.name || '', reason: `Could not synchronize ${label(target)}: no matching sound was found in the other files. Make sure it was recorded at the same time, or drag it into place in the timeline.` }], reference: null };
    const off = r6(best.s.offset + env.get(best.s.id).so - env.get(only).so - best.r.lag / ENV_RATE);
    return { offsets: { [only]: off }, failures: [], reference: best.s.id };
  }
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
      for (const a of next) fail(a, `Could not synchronize ${label(a)}: no matching sound was found in the other files. Make sure they were recorded at the same time, or drag it into place in the timeline.`);
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
  // These choices already exist on the editing timeline and must be preserved.
  delete mc.programMode;
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
export function buildMulticamClips(project, mc, { previous = [], previousMc = null } = {}) {
  const range = multicamOutputRange(project, mc);
  if (!range) return { video: [], audio: [], duration: 0 };
  const follow = mc.audio === 'follow';
  const video = [];
  const audio = [];
  const oldProps = new Map();
  const oldAudio = new Map();
  // Tidligere klipp med sin plass i multicam-tid (med forskyvningene de ble laget med).
  const oldOffset = (id) => (previousMc || mc).angles.find((a) => a.id === id)?.offset ?? mc.angles.find((a) => a.id === id)?.offset ?? 0;
  const oldVideo = [];
  for (const c of previous) {
    const key = c.multicam?.angle;
    if (!key) continue;
    if (c.type === 'audio') {
      if (!oldAudio.has(`${key}:${c.stream || 'main'}`)) oldAudio.set(`${key}:${c.stream || 'main'}`, c);
      continue;
    }
    if (!oldProps.has(key)) oldProps.set(key, c);
    const s = c.in + oldOffset(key);
    oldVideo.push({ c, angle: key, start: s, end: s + c.dur });
  }
  // Klippet en ny bit kommer fra: samme vinkel og mest felles tid. Det gir tilbake effekter,
  // nøkkelbilder (de står i kildetid), farge, overganger og av/på, også etter trimming i redigeringen.
  const source = (angleId, s, e) => {
    let best = null;
    for (const o of oldVideo) {
      if (o.angle !== angleId) continue;
      const overlap = Math.min(e, o.end) - Math.max(s, o.start);
      if (overlap > EPS && (!best || overlap > best.overlap)) best = { ...o, overlap };
    }
    return best;
  };
  const gap = (start, dur) => {
    const g = makeClip('gap', { start, dur, name: 'Gap' });
    g.multicam = { id: mc.id };
    return g;
  };
  // Biter etter hverandre med samme vinkel blir ett klipp, selv om det var en annen vinkel som var valgt.
  const pieces = [];
  for (const piece of programPieces(project, mc)) {
    const prev = pieces[pieces.length - 1];
    // Et kutt laget med bladet (også i redigeringen) blir stående, selv med samme kamera på begge sider.
    const cut = mc.cuts[piece.index];
    const bladed = (cut?.blade || mc.programMode === 'selected') && Math.abs(cut.t - piece.start) < EPS;
    if (prev && prev.angle === piece.angle && Math.abs(prev.end - piece.start) < EPS && !bladed) prev.end = piece.end;
    else pieces.push({ ...piece });
  }
  let cursor = range.in;
  for (const seg of pieces) {
    if (seg.start > cursor + EPS) video.push(gap(r6(cursor - range.in), r6(seg.start - cursor)));
    cursor = seg.end;
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
      const match = source(angle.id, s, e);
      const prev = match?.c || oldProps.get(angle.id);
      if (prev) c.props = { ...c.props, ...deepClone(prev.props) };
      if (match) {
        const o = match.c;
        if (o.kf) c.kf = deepClone(o.kf);
        if (o.expressions) c.expressions = deepClone(o.expressions);
        if (o.colorLabel) c.colorLabel = o.colorLabel;
        if (o.enabled === false) c.enabled = false;
        if (o.transition && Math.abs(match.start - s) < 1e-3) c.transition = deepClone(o.transition);
        if (o.transitionOut && Math.abs(match.end - e) < 1e-3) c.transitionOut = deepClone(o.transitionOut);
      }
      c.name = `${mc.name} · Camera ${angleLabel(project, mc, angle.id)}`;
      c.multicam = { id: mc.id, angle: angle.id };
      if (!follow) c.props.audioOff = { ...(c.props.audioOff || {}), ...Object.fromEntries(audioStreamKeys(m).map((k) => [k, true])) };
      else {
        if (prev) c.props.audioOff = { ...(m.audioOff || {}) };
        applySound(c, angleSound(angle), angle.offset, soundKeys(m));
      }
      video.push(c);
    }
  }
  if (!follow && mc.audio) {
    const angle = mc.angles.find((a) => a.id === mc.audio);
    const m = project.media[angle?.mediaId];
    if (m) {
      const ext = angleExtent(project, angle);
      const probe = makeClip(mediaClipType(m), { media: m });
      const comps = m.kind === 'audio' ? [{ key: 'main', label: 'Audio', off: false }] : audioComponents(probe, m);
      for (const comp of comps) {
        const prev = oldAudio.get(`${angle.id}:${comp.key}`);
        // Et lydklipp som er trimmet i redigeringen, beholder lengden sin.
        let s = Math.max(range.in, ext.start);
        let e = Math.min(range.out, ext.end);
        if (prev && (prev.speed ?? 1) === 1 && !prev.ramp && !prev.reverse) {
          const ps = prev.in + oldOffset(angle.id);
          s = Math.max(s, ps);
          e = Math.min(e, ps + prev.dur);
        }
        if (e - s > EPS) {
          const a = makeClip('audio', { media: m, start: r6(s - range.in), in: r6(s - angle.offset), dur: r6(e - s), lane: -1 });
          a.stream = comp.key;
          if (prev) a.props = { ...a.props, ...deepClone(prev.props) };
          a.name = `${mc.name} audio${comps.length > 1 ? ` (${comp.label.toLowerCase()})` : ''}`;
          a.multicam = { id: mc.id, angle: angle.id };
          applySound(a, angleSound(angle), angle.offset);
          if (comp.off || prev?.enabled === false) a.enabled = false;
          if (prev?.colorLabel) a.colorLabel = prev.colorLabel;
          audio.push(a);
        }
      }
    }
  }
  // Mellomrom til slutt har ingen funksjon.
  while (video.length && video[video.length - 1].type === 'gap') video.pop();
  return { video, audio, duration: r6(range.out - range.in) };
}

function multicamOutputRange(project, mc) {
  const range = multicamRange(project, mc);
  if (mc.programMode !== 'selected') return range;
  const chosen = segments(project, mc);
  return chosen.length ? { in: chosen[0].start, out: chosen[chosen.length - 1].end } : null;
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
  const previousMc = project.multicams?.[mc.id] ? deepClone(project.multicams[mc.id]) : null;
  const old = replace.map((id) => project.clips[id]).filter(Boolean);
  const oldIds = new Set(old.flatMap((c) => groupMembers(project, c.id)));
  for (const c of old) oldIds.add(c.id);
  const previous = [...oldIds].map((id) => deepClone(project.clips[id]));
  const { video, audio } = buildMulticamClips(project, mc, { previous, previousMc });
  if (!video.length && !audio.length) return [];
  const stored = deepClone(mc);
  if (stored.programMode === 'selected') stored.range = multicamOutputRange(project, mc);
  project.multicams = { ...(project.multicams || {}), [mc.id]: stored };
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

// Tiden i multicam-klippet midt i et klipp på tidslinjen (for Active Video Angle i høyreklikkmenyen).
export function multicamTimeOfClip(project, mc, clip) {
  const angle = mc.angles.find((a) => a.id === clip?.multicam?.angle);
  if (angle && clip.type !== 'gap') return clip.in + clip.dur / 2 + angle.offset;
  // Mellomrom har ingen kilde: regn ut fra plasseringen i gruppen.
  const members = Object.values(project.clips).filter((c) => c.multicam?.id === mc.id && c.type !== 'audio');
  const first = members.sort((a, b) => a.start - b.start)[0];
  const range = multicamRange(project, mc);
  return range.in + (clip.start - (first?.start ?? clip.start)) + clip.dur / 2;
}

/* Endringer i redigeringen: klippene på tidslinjen er sannheten for kutt og trimming. */

const plainClip = (c) => (c.speed ?? 1) === 1 && !c.ramp && !c.reverse;

/**
 * Leser klippene i gruppen tilbake inn i definisjonen før den endres: kuttene (også flyttede,
 * delte og trimmede), området og lydnivået. Svar: { mc, ok }. ok er false når noe ikke kan
 * beskrives som kutt i multicam-klippet, for eksempel en bit midt i som er slettet, eller endret fart.
 */
export function absorbTimeline(project, mc) {
  const clips = Object.values(project.clips).filter((c) => c.multicam?.id === mc.id);
  const vids = clips.filter((c) => c.type !== 'audio').sort((a, b) => a.start - b.start);
  const offsetOf = (id) => mc.angles.find((a) => a.id === id)?.offset;
  let delta = null;
  for (const c of vids) {
    if (c.type === 'gap') continue;
    const o = offsetOf(c.multicam.angle);
    if (o == null || !plainClip(c)) return { mc, ok: false };
    const d = c.start - (c.in + o);
    if (delta == null) delta = d;
    else if (Math.abs(d - delta) > 1e-3) return { mc, ok: false };
  }
  if (delta == null) return { mc, ok: true };
  const next = deepClone(mc);
  const first = vids[0];
  const last = vids[vids.length - 1];
  next.range = { in: r6(first.start - delta), out: r6(last.start + last.dur - delta) };
  const cuts = [];
  for (const c of vids) {
    const t = r6(c.start - delta);
    const mid = t + c.dur / 2;
    // En bit der et annet kamera ble vist som reserve, beholder kameraet som var valgt.
    const angle = c.type === 'gap' || pictureAngleAt(project, mc, mid) === c.multicam.angle ? angleAt(mc, mid) : c.multicam.angle;
    if (next.programMode === 'selected' && !angle) continue;
    const prev = cuts[cuts.length - 1];
    // To klipp etter hverandre med samme kamera (delt med bladet i redigeringen) holdes fra hverandre.
    const cut = prev && prev.angle === angle ? { t, angle, blade: true } : { t, angle };
    if (next.programMode === 'selected') cut.end = r6(t + c.dur);
    cuts.push(cut);
  }
  // Kutt etter området beholdes, så det ikke endrer seg om området gjøres lengre igjen.
  next.cuts = [...cuts, ...mc.cuts.filter((c) => c.t > next.range.out + EPS)];
  // Lyden: nivå, nøkkelbilder og Clean Voice fra lydklippet, tilbake til kilden i Properties.
  if (mc.audio && mc.audio !== 'follow') {
    const a = clips.find((c) => c.type === 'audio' && c.multicam?.angle === mc.audio && plainClip(c));
    const angle = next.angles.find((x) => x.id === mc.audio);
    if (a && angle) {
      const cur = angleSound(angle);
      const kf = (a.kf?.volume || []).map(([s, v]) => [r6(s + angle.offset), v]);
      const clean = a.props.cleanVoice?.[a.stream || 'main'];
      angle.sound = { ...cur, volume: a.props.volume ?? 0, volumeKf: kf, clean: clean > 0 ? clean : null };
    }
  }
  return { mc: tidy(project, next), ok: true };
}

/**
 * Active Video Angle for ett klipp i redigeringen: klippet får samme tid og lengde, men
 * kilden byttes til et annet kamera. Trimming, effekter og overganger blir som de var.
 * Gir { ok, reason }.
 */
export function switchClipAngle(project, clipId, angleId) {
  const clip = project.clips[clipId];
  const mc = project.multicams?.[clip?.multicam?.id];
  if (!clip || !mc || clip.type === 'gap' || clip.type === 'audio') return { ok: false, reason: 'Choose a video clip from the multicam clip.' };
  const from = mc.angles.find((a) => a.id === clip.multicam.angle);
  const to = mc.angles.find((a) => a.id === angleId);
  const m = project.media[to?.mediaId];
  if (!from || !to || !m || !isVideoAngle(project, to)) return { ok: false, reason: 'That camera is no longer in the multicam clip.' };
  if (from.id === to.id) return { ok: false };
  const newIn = r6(clip.in + from.offset - to.offset);
  if (!plainClip(clip) || newIn < -EPS || newIn + clip.dur > m.duration + EPS) {
    return { ok: false, reason: `Camera ${angleLabel(project, mc, to.id)} has no picture for the whole clip. Open Edit Multicam Clip to cut to it where it has.` };
  }
  const shift = newIn - clip.in;
  clip.mediaId = m.id;
  clip.in = Math.max(0, newIn);
  // Nøkkelbilder står i kildetid, så de flyttes like mye som kilden.
  for (const list of Object.values(clip.kf || {})) for (const k of list) k[0] = r6(k[0] + shift);
  clip.multicam = { ...clip.multicam, angle: to.id };
  clip.name = `${mc.name} · Camera ${angleLabel(project, mc, to.id)}`;
  if (mc.audio === 'follow') clip.props.audioOff = { ...(m.audioOff || {}) };
  else clip.props.audioOff = Object.fromEntries(audioStreamKeys(m).map((k) => [k, true]));
  // Definisjonen følger med, så multicam-vinduet viser det samme neste gang.
  const { mc: next, ok } = absorbTimeline(project, mc);
  if (ok) project.multicams = { ...project.multicams, [mc.id]: next };
  return { ok: true };
}
