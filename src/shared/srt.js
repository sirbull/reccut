// Lese og skrive SRT-undertekster.
import { CAPTION_LANE, workPath } from './model.js';

function ts(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

// Undertekstene som er med i utsnittet a–b, med tider regnet fra a.
export function captionItems(project, a, b) {
  return Object.values(project.clips)
    .filter((c) => c.lane === CAPTION_LANE && c.enabled && c.start < b && c.start + c.dur > a && String(c.props.text || '').trim())
    .map((c) => ({ start: Math.max(0, c.start - a), end: Math.min(b, c.start + c.dur) - a, text: c.props.text || '' }));
}

export function toSrt(items) {
  return items
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text.trim()}\n`)
    .join('\n');
}

function parseTs(s) {
  const m = /(?:(\d+):)?(\d+):(\d+)[,.](\d+)/.exec(s);
  if (!m) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
}

// WebVTT: samme innhold som SRT, men med punktum i tidskoden og eget hode.
export function toVtt(items) {
  const body = items
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c) => `${ts(c.start).replace(',', '.')} --> ${ts(c.end).replace(',', '.')}\n${c.text.trim()}\n`)
    .join('\n');
  return `WEBVTT\n\n${body}`;
}

export function parseSrt(text) {
  const out = [];
  const blocks = String(text).replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    const idx = lines.findIndex((l) => l.includes('-->'));
    if (idx < 0) continue;
    const [a, z] = lines[idx].split('-->');
    const start = parseTs(a);
    const end = parseTs(z);
    if (start == null || end == null || end <= start) continue;
    out.push({ start, end, text: lines.slice(idx + 1).join('\n').replace(/<[^>]+>/g, '') });
  }
  return out;
}

// Lyden på tidslinjen som skal transkriberes, med tider på tidslinjen.
export function speechSources(p) {
  const sources = [];
  for (const c of Object.values(p.clips)) {
    if (!c.enabled || c.lane === CAPTION_LANE || !c.mediaId) continue;
    const m = p.media[c.mediaId];
    let stream = null;
    if (c.type === 'recording') stream = m.streams.camera?.hasAudio ? m.streams.camera : m.streams.screen?.hasAudio ? m.streams.screen : null;
    else if (m.streams.main?.hasAudio) stream = m.streams.main;
    if (!stream) continue;
    const off = stream.offset || 0;
    sources.push({ path: workPath(stream), in: Math.max(0, c.in - off), dur: c.dur, start: c.start + Math.max(0, off - c.in) });
  }
  return sources;
}

// Vanlige regler for undertekster (som hos Netflix og NRK): lesetid, minste og største varighet,
// et lite opphold mellom tekstene og høyst to linjer à 42 tegn.
export const CAPTION_RULES = { minDur: 1, maxDur: 7, maxCps: 17, lineChars: 42, lines: 2 };

// Justerer tidene innenfor reglene og rapporterer det som må skrives om (for lang eller for rask tekst).
// En kort tekst forlenges inn i stillheten etter seg, aldri over neste tekst.
export function fitCaptions(items, { fps = 30, maxCps = CAPTION_RULES.maxCps } = {}) {
  const { minDur, maxDur, lineChars, lines } = CAPTION_RULES;
  const gap = Math.max(2 / fps, 0.08);
  const out = items.map((c) => ({ start: c.start, end: c.end, text: c.text.trim() })).sort((a, b) => a.start - b.start);
  const warnings = [];
  out.forEach((c, i) => {
    const next = out[i + 1];
    const limit = next ? next.start - gap : Infinity;
    const chars = c.text.replace(/\n/g, '').length;
    const need = Math.min(maxDur, Math.max(minDur, chars / maxCps));
    if (c.end - c.start < need) c.end = Math.min(c.start + need, limit);
    if (c.end > limit) c.end = limit;
    c.end = Math.max(c.end, c.start + 0.3);
    c.start = Math.round(c.start * 1000) / 1000;
    c.end = Math.round(c.end * 1000) / 1000;
    const dur = c.end - c.start;
    const problem = [];
    if (next && c.end > next.start - gap + 1e-6) problem.push('starts almost together with the next caption: merge them');
    if (chars / dur > maxCps + 0.05)
      problem.push(`too fast to read (${(chars / dur).toFixed(1)} characters/s): shorten to about ${Math.floor(dur * maxCps)} characters or merge`);
    if (chars > lineChars * lines) problem.push(`too long (${chars} characters, at most ${lineChars * lines}): shorten or split`);
    if (dur > maxDur + 0.05) problem.push(`on screen ${dur.toFixed(1)} s, at most ${maxDur}: split it`);
    if (problem.length) warnings.push({ index: i, start: c.start, text: c.text, problem: problem.join('; ') });
  });
  return { items: out, warnings };
}
