// Pakking av prosjekter for arkiv, som Collect Files og Reduce Project i After Effects.
// Først ryddes prosjektet (det som er slått av eller ikke brukes, fjernes), så listes alle
// filene som trengs. Selve kopieringen skjer i hovedprosessen.
import { relayoutPrimary, sourceTime } from './model.js';

/**
 * Lager en ryddet kopi av prosjektet. Valg:
 *  removeDisabled: klipp som er slått av fjernes (i hovedsporet blir de mellomrom, så ingenting flytter seg)
 *  removeHidden: klipp på skjulte spor fjernes
 *  removeOffAudio: lydspor som er slått av i alle klipp, fjernes fra mediet
 *  removeUnused: media som ikke brukes på tidslinjen, fjernes
 * Gir { project, removed: { clips, media, streams } }.
 */
export function reduceProject(src, opts = {}) {
  const p = structuredClone(src);
  const removed = { clips: [], media: [], streams: [] };
  const hiddenLane = (lane) => Boolean(p.lanes?.[lane]?.hidden);
  for (const c of Object.values(p.clips)) {
    const off = (opts.removeDisabled && c.enabled === false) || (opts.removeHidden && c.lane !== 0 && hiddenLane(c.lane));
    if (!off) continue;
    removed.clips.push(c.name || c.type);
    if (c.lane === 0) {
      // Et mellomrom med samme lengde, så resten av redigeringen står der den står.
      p.clips[c.id] = { id: c.id, type: 'gap', mediaId: null, lane: 0, start: c.start, in: 0, dur: c.dur, enabled: true, props: {}, kf: {}, name: 'Gap' };
    } else delete p.clips[c.id];
  }
  // Grupper med bare ett klipp igjen løses opp.
  const count = new Map();
  for (const c of Object.values(p.clips)) if (c.group) count.set(c.group, (count.get(c.group) || 0) + 1);
  for (const c of Object.values(p.clips)) if (c.group && count.get(c.group) < 2) delete c.group;

  const usedBy = new Map();
  for (const c of Object.values(p.clips)) if (c.mediaId) usedBy.set(c.mediaId, [...(usedBy.get(c.mediaId) || []), c]);

  if (opts.removeUnused) {
    for (const id of Object.keys(p.media)) {
      if (usedBy.has(id)) continue;
      removed.media.push(p.media[id].name);
      delete p.media[id];
    }
  }
  // Lydspor som er synket inn, men slått av i alle klipp som bruker mediet, trengs ikke.
  if (opts.removeOffAudio) {
    for (const m of Object.values(p.media)) {
      const clips = usedBy.get(m.id) || [];
      if (!clips.length) continue;
      for (const [key, st] of Object.entries(m.streams || {})) {
        if (!st.syncedFrom || st.hasVideo) continue;
        if (clips.every((c) => c.props?.audioOff?.[key])) {
          delete m.streams[key];
          if (m.audioOff) delete m.audioOff[key];
          for (const c of clips) delete c.props.audioOff?.[key];
          removed.streams.push(`${m.name}: ${st.label || key}`);
        }
      }
    }
  }
  relayoutPrimary(p);
  return { project: p, removed };
}

/**
 * Filene som må kopieres for hvert medium: { mediaId, kind, name, sources: [{ key, path }], dir }.
 * Opptak er en mappe (skjerm, kamera og recording.json), så hele mappen tas med.
 */
export function mediaFiles(p, { includeOptimized = false } = {}) {
  const out = [];
  for (const m of Object.values(p.media)) {
    if (m.kind === 'recording') {
      out.push({ mediaId: m.id, kind: m.kind, name: m.name, dir: m.path, sources: [] });
      continue;
    }
    const sources = [];
    const seen = new Set();
    const add = (key, file, field) => {
      if (!file || seen.has(file)) return;
      seen.add(file);
      sources.push({ key, path: file, field });
    };
    const trimmed = Object.values(m.streams || {}).some((st) => st.trim);
    if (!trimmed) add('main', m.path, 'path');
    for (const [key, st] of Object.entries(m.streams || {})) {
      if (st.trim) {
        // Kuttes med FFmpeg i stedet for å kopieres.
        sources.push({ key, path: st.trim.source, field: 'path', trim: { from: st.trim.from, to: st.trim.to, total: st.trim.total }, hasVideo: Boolean(st.hasVideo), hasAudio: Boolean(st.hasAudio), alpha: Boolean(st.alpha), bits: st.color?.bits || 8 });
        continue;
      }
      add(key, st.path, 'path');
      if (includeOptimized) add(key, st.optimized, 'optimized');
      // Bilder i formater som RAW, EXR og PSD vises fra en konvertert kopi, og TS-filer som
      // FFmpeg ikke åpner, fra en arbeidskopi. De tas med, så pakken virker med en gang.
      if ((m.kind === 'image' || st.tsFallback) && st.proxy) add(key, st.proxy, 'proxy');
    }
    out.push({ mediaId: m.id, kind: m.kind, name: m.name, sources });
  }
  return out;
}


/* Kutting: bare de delene av filene som brukes, med litt ekstra på hver side (handles). */


// Delene av hvert medium som brukes på tidslinjen, i mediets egen tid. { mediaId: [[a, b], ...] }
export function usedRanges(p, handles = 2) {
  const out = {};
  for (const c of Object.values(p.clips)) {
    const m = c.mediaId && p.media[c.mediaId];
    if (!m) continue;
    const lead = Math.max(0, c.props?.aLead || 0);
    const tail = Math.max(0, c.props?.aTail || 0);
    // Kildetiden ved start og slutt (fart, ramper og baklengs er tatt med i sourceTime).
    const s0 = sourceTime(c, c.start - lead);
    const s1 = sourceTime(c, c.start + c.dur + tail);
    let a = Math.min(s0, s1);
    let b = Math.max(s0, s1);
    if (c.speed === 0 && !c.ramp) b = a + 0.1;
    // Overganger bruker litt av nabomaterialet; handles dekker det.
    a = Math.max(0, a - handles);
    b = Math.min(m.duration || b + handles, b + handles);
    (out[m.id] ||= []).push([a, b]);
  }
  for (const id of Object.keys(out)) {
    const list = out[id].sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const r of list) {
      const last = merged[merged.length - 1];
      // Deler som nesten møtes, slås sammen (færre filer).
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    out[id] = merged;
  }
  return out;
}

const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Deler opp media i de brukte delene. Hver del blir et eget medium med en kutteinstruks
 * (stream.trim = { from, to } i filens tid), og klippene pekes til delen sin.
 * Opptak og stillbilder kopieres hele. Blir besparelsen liten, kopieres filen hel.
 * Gir { project, trimmed: [{ name, parts, saved }] }.
 */
export function trimProject(src, { handles = 2, minSaving = 0.25 } = {}) {
  const p = structuredClone(src);
  const ranges = usedRanges(p, handles);
  const trimmed = [];
  for (const [id, list] of Object.entries(ranges)) {
    const m = p.media[id];
    if (!m || m.kind === 'recording' || m.kind === 'image' || !(m.duration > 0)) continue;
    const used = list.reduce((s, [a, b]) => s + (b - a), 0);
    if (used > m.duration * (1 - minSaving)) continue;
    const base = m.name.replace(/\.[^.]+$/, '');
    const parts = list.map(([a, b], k) => {
      const pid = `${id}_p${k + 1}`;
      const streams = {};
      for (const [key, st] of Object.entries(m.streams || {})) {
        const off = st.offset || 0;
        const len = st.duration ?? m.duration;
        const f0 = Math.max(0, a - off);
        const f1 = Math.min(len, b - off);
        if (f1 - f0 < 0.05) continue;
        const { proxy, optimized, thumbs, wave, reversed, motion, rel, ...rest } = st;
        // TS-filer som FFmpeg ikke åpner direkte, kuttes fra arbeidskopien.
        streams[key] = { ...rest, ...(st.tsFallback ? { tsFallback: undefined } : {}), offset: round3(f0 + off - a), duration: round3(f1 - f0), trim: { source: st.tsFallback && proxy ? proxy : st.path, from: round3(f0), to: round3(f1), total: len } };
      }
      return { id: pid, a, b, media: { ...m, id: pid, trimmedFrom: { path: m.path, start: round3(a) }, name: list.length > 1 ? `${base} (part ${k + 1})` : `${base} (trimmed)`, duration: round3(b - a), streams } };
    });
    for (const part of parts) p.media[part.id] = part.media;
    // Klippene flyttes til delen som inneholder dem, og tidene i kilden forskyves.
    for (const c of Object.values(p.clips)) {
      if (c.mediaId !== id) continue;
      const s = Math.min(sourceTime(c, c.start), sourceTime(c, c.start + c.dur));
      const part = parts.find((x) => s >= x.a - 1e-6 && s <= x.b + 1e-6) || parts[0];
      const shift = part.a;
      c.mediaId = part.id;
      c.in = round3(c.in - shift);
      if (c.freezeAt != null) c.freezeAt = round3(c.freezeAt - shift);
      for (const list2 of Object.values(c.kf || {})) for (const k of list2) k[0] = round3(k[0] - shift);
    }
    delete p.media[id];
    trimmed.push({ name: m.name, parts: parts.length, saved: Math.max(0, m.duration - used) });
  }
  return { project: p, trimmed };
}
