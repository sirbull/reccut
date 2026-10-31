// Pakking av prosjekter for arkiv, som Collect Files og Reduce Project i After Effects.
// Først ryddes prosjektet (det som er slått av eller ikke brukes, fjernes), så listes alle
// filene som trengs. Selve kopieringen skjer i hovedprosessen.
import { relayoutPrimary } from './model.js';

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
    add('main', m.path, 'path');
    for (const [key, st] of Object.entries(m.streams || {})) {
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

