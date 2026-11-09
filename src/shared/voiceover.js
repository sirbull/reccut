// Voice Over Studio: manus, stemmedeteksjon og sammensying av opptak.
// Alt her er rene funksjoner, så de kan testes uten nettleser.

/* Manus */

const SCENE = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const CUE = /^[A-ZÆØÅÄÖÜ0-9][A-ZÆØÅÄÖÜ0-9 .'’\-]*(\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D|VO|OS)\))*\s*\^?$/;

// Markdown og Fountain-pynt fjernes, så teksten leses som den skal sies.
export function plainLine(s) {
  return String(s)
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_](\S(?:.*?\S)?)[*_](?=[^\w*]|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Setninger: deler etter punktum, spørsmålstegn og utropstegn når neste ord starter med stor bokstav eller tall.
export function splitSentences(text) {
  const out = [];
  let rest = String(text).trim();
  const re = /[.!?…]["”’)\]]*\s+(?=["“‘(\[]?[A-ZÆØÅÄÖÜ0-9])/g;
  let last = 0;
  for (const m of rest.matchAll(re)) {
    const end = m.index + m[0].length;
    const piece = rest.slice(last, end).trim();
    // Korte forkortelser (Mr. Dr. f.eks.) deler ikke.
    if (/\b(Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|f\.eks|bl\.a|ca|nr)\.\s*$/i.test(piece)) continue;
    if (piece) out.push(piece);
    last = end;
  }
  const tail = rest.slice(last).trim();
  if (tail) out.push(tail);
  return out;
}

// Enkel, stabil nøkkel for en linje, så opptak følger linjen selv om manuset endres rundt den.
export function blockKey(text, speaker = '') {
  const s = `${speaker}|${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/**
 * Deler manuset i blokker. split: 'paragraph' (avsnitt), 'sentence' (setning) eller 'line' (linje).
 * Blokker: { kind: 'title'|'heading'|'note'|'line', text, speaker?, direction?, para, section, key }.
 * Bare 'line' tas opp. Overskrifter fra Typeloom (#) og scener blir seksjoner, og "= " er synopsis.
 */
export function parseScript(text, { split = 'paragraph' } = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let para = 0,
    section = 0,
    speaker = '',
    direction = '',
    buf = [];
  const flush = () => {
    if (!buf.length) return;
    const joined = buf.join(split === 'line' ? '\n' : ' ').trim();
    buf = [];
    if (!joined) return;
    const pieces = split === 'sentence' ? splitSentences(joined) : split === 'line' ? joined.split('\n') : [joined];
    for (const t of pieces.map((x) => x.trim()).filter(Boolean)) blocks.push({ kind: 'line', text: t, speaker, direction, para, section, key: blockKey(t, speaker) });
    direction = '';
    para++;
  };
  const marker = (kind, t) => {
    flush();
    speaker = '';
    if (!t) return;
    if (kind === 'heading') section++;
    blocks.push({ kind, text: t, para, section, key: blockKey(t, kind) });
    para++;
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextLine = (lines[i + 1] || '').trim();
    if (!raw) {
      flush();
      speaker = '';
      continue;
    }
    if (i === 0 && /^title:\s*/i.test(raw)) {
      marker('title', plainLine(raw.replace(/^title:\s*/i, '')));
      continue;
    }
    if (/^#{1,6}\s+/.test(raw)) {
      marker('heading', plainLine(raw.replace(/^#+\s+/, '')));
      continue;
    }
    if (/^=\s/.test(raw) || /^\[\[.*\]\]$/.test(raw) || /^\/\*.*\*\/$/.test(raw)) {
      marker('note', plainLine(raw.replace(/^=\s/, '').replace(/^\[\[|\]\]$/g, '').replace(/^\/\*|\*\/$/g, '')));
      continue;
    }
    if (/^>\s*/.test(raw) && raw.toUpperCase() === raw && !/<$/.test(raw)) {
      marker('note', plainLine(raw.replace(/^>\s*/, '')));
      continue;
    }
    if ((prevBlank && SCENE.test(raw)) || /^\.[A-ZÆØÅ]/.test(raw)) {
      marker('heading', plainLine(raw.replace(/^\./, '')));
      continue;
    }
    if (prevBlank && nextLine && raw.length < 40 && /[A-ZÆØÅ]/.test(raw) && (CUE.test(raw) || /^@/.test(raw)) && !/^(FADE|CUT|DISSOLVE|SMASH)/.test(raw)) {
      flush();
      speaker = plainLine(raw.replace(/^@/, '').replace(/\^$/, '').replace(/\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D|CONT’D|VO|OS)\)/gi, ''));
      continue;
    }
    if (speaker && /^\(.*\)$/.test(raw)) {
      if (buf.length) flush();
      direction = raw.slice(1, -1).trim();
      continue;
    }
    // Punktlister og nummererte lister er egne linjer.
    if (/^([-*+]|\d+[.)])\s+/.test(raw)) {
      flush();
      buf.push(plainLine(raw.replace(/^([-*+]|\d+[.)])\s+/, '')));
      if (split !== 'line') flush();
      continue;
    }
    const t = plainLine(raw.replace(/^>\s*/, ''));
    if (t) buf.push(t);
  }
  flush();
  // Samme setning to ganger i manuset får hver sin nøkkel.
  const seen = new Map();
  return blocks.map((b, index) => {
    const n = seen.get(b.key) || 0;
    seen.set(b.key, n + 1);
    return { ...b, key: n ? `${b.key}.${n}` : b.key, index };
  });
}

export const recordable = (blocks) => blocks.filter((b) => b.kind === 'line');

// Opptak hører til en linje via nøkkelen. Finnes ikke linjen lenger, beholdes nummeret om det er gyldig.
export function blockForTake(blocks, take) {
  return blocks.find((b) => b.kind === 'line' && b.key === take.key) || null;
}

/* Lyd */

// RMS i dB per steg (standard 10 ms).
export function levelEnvelope(samples, rate, hop = 0.01) {
  const n = Math.max(1, Math.round(rate * hop));
  const frames = Math.ceil(samples.length / n);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const a = f * n,
      b = Math.min(samples.length, a + n);
    for (let i = a; i < b; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, b - a));
    env[f] = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
  }
  return env;
}

function percentile(arr, q) {
  const s = Array.from(arr).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : -120;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Finner hvor stemmen starter og slutter i et opptak, ut fra lydnivået.
 * floorDb: kjent støygulv (fra romlyd), ellers regnes det ut fra de stilleste delene.
 * Gir { start, end, floor, peak } i sekunder, eller null når ingenting blir sagt.
 */
export function detectSpeech(env, { hop = 0.01, floorDb = null, minSpeech = 0.06, minGap = 0.35 } = {}) {
  if (!env.length) return null;
  // Støygulvet fra romlyden brukes bare når det er lavere enn det stilleste i opptaket,
  // så en romlyd med lyd i aldri gjør stemmen usynlig.
  const own = percentile(env, 0.1);
  const floor = clamp(floorDb != null ? Math.min(floorDb, own) : own, -100, -25);
  const peak = percentile(env, 0.995);
  const range = peak - floor;
  if (range < 10) return null;
  const open = floor + clamp(range * 0.3, 9, 22);
  const soft = floor + clamp(range * 0.12, 4, 9);
  const k = Math.max(1, Math.round(minSpeech / hop));
  const run = (i, dir) => {
    for (let j = 0; j < k; j++) if (!(env[i + dir * j] > open)) return false;
    return true;
  };
  let s = -1;
  for (let i = 0; i + k <= env.length; i++)
    if (run(i, 1)) {
      s = i;
      break;
    }
  if (s < 0) return null;
  let e = s;
  for (let i = env.length - 1; i - k + 1 >= s; i--)
    if (run(i, -1)) {
      e = i;
      break;
    }
  // Myke kanter (f, s, h og pust inn i ordet) tas med til nivået faller mot støygulvet.
  const gap = Math.round(minGap / hop);
  const edge = (i, dir) => {
    let quiet = 0,
      last = i;
    for (let j = i + dir; j >= 0 && j < env.length; j += dir) {
      if (env[j] > soft) {
        last = j;
        quiet = 0;
      } else if (++quiet > Math.min(gap, 8)) break;
    }
    return last;
  };
  s = edge(s, -1);
  e = edge(e, 1);
  return { start: s * hop, end: (e + 1) * hop, floor, peak };
}

// Topp og klipping: mer enn tre prøver ved full styrke regnes som klipping.
export function peakInfo(samples) {
  let peak = 0,
    over = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
    if (a >= 0.995) over++;
  }
  return { peakDb: peak > 0 ? 20 * Math.log10(peak) : -120, clipped: over > 3 };
}

// Klippegrenser for et opptak: litt luft før stemmen og litt etter, innenfor filen.
export function trimFor(speech, duration, { preRoll = 0.12, postRoll = 0.3 } = {}) {
  if (!speech) return { in: 0, out: duration, found: false };
  const a = Math.max(0, speech.start - preRoll);
  const b = Math.min(duration, speech.end + postRoll);
  return b - a > 0.05 ? { in: round3(a), out: round3(b), found: true } : { in: 0, out: duration, found: false };
}
const round3 = (v) => Math.round(v * 1000) / 1000;

// 24-bit PCM WAV, mono eller flere kanaler (en Float32Array per kanal).
export function encodeWav(channels, rate, bits = 24) {
  const ch = channels.length;
  const len = channels[0]?.length || 0;
  const bytes = bits / 8;
  const data = len * ch * bytes;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * bytes, true);
  v.setUint16(32, ch * bytes, true);
  v.setUint16(34, bits, true);
  str(36, 'data');
  v.setUint32(40, data, true);
  let o = 44;
  const max = 2 ** (bits - 1) - 1;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.round(clamp(channels[c][i], -1, 1) * max);
      if (bits === 16) v.setInt16(o, s, true);
      else {
        v.setUint8(o, s & 0xff);
        v.setUint8(o + 1, (s >> 8) & 0xff);
        v.setUint8(o + 2, (s >> 16) & 0xff);
      }
      o += bytes;
    }
  return buf;
}

// Romlyd: støygulvet og om det var stille nok (ingen stemme eller lyder som stikker opp).
export function roomToneLevel(env) {
  const floor = percentile(env, 0.2);
  return { floor: Math.round(floor * 10) / 10, quiet: percentile(env, 0.95) - floor < 12 };
}

/* Sammensying */

export const DEFAULT_PACING = { sentence: 0.35, paragraph: 0.8, section: 1.6 };

// Valgt opptak for en linje: det brukeren har valgt, ellers stjernemerket, ellers det siste.
export function chosenTake(vo, key) {
  const takes = (vo?.takes || []).filter((t) => t.key === key && !t.bad);
  const pick = vo?.selected?.[key];
  return takes.find((t) => t.id === pick) || takes.filter((t) => t.star).at(-1) || takes.at(-1) || null;
}

/**
 * Plan for tidslinjen: linjene i manusrekkefølge med valgt opptak, etter hverandre.
 * Pausen etter en linje avhenger av hva som kommer etterpå: ny setning, nytt avsnitt eller ny seksjon.
 * room: pausen fylles først med opptakets egen romlyd så langt filen rekker.
 *   'fill': resten av pausen blir et tomrom (lyd). 'tight': resten droppes, så bildet aldri blir svart (video).
 * Gir { items: [{ take, block, at, in, dur }], gaps: [{ at, dur }], end }.
 */
export function planAssembly(blocks, vo, { start = 0, pacing = DEFAULT_PACING, room = false, from = 0 } = {}) {
  const lines = blocks.filter((b) => b.kind === 'line' && b.index >= from);
  const picked = lines.map((b) => ({ block: b, take: chosenTake(vo, b.key) })).filter((x) => x.take);
  const items = [],
    gaps = [];
  let t = start;
  picked.forEach(({ block, take }, i) => {
    const next = picked[i + 1]?.block;
    const pause = !next ? 0 : next.section !== block.section ? pacing.section : next.para !== block.para ? pacing.paragraph : pacing.sentence;
    let dur = Math.max(0.05, take.out - take.in);
    let rest = pause;
    if (room && pause > 0) {
      const more = Math.max(0, Math.min(pause, (take.duration ?? take.out) - take.out));
      dur += more;
      rest = room === 'tight' ? 0 : pause - more;
    }
    items.push({ take, block, at: round3(t), in: take.in, dur: round3(dur) });
    t += dur;
    if (rest > 0.001) {
      gaps.push({ at: round3(t), dur: round3(rest) });
      t += rest;
    }
  });
  return { items, gaps, end: round3(t) };
}

// Første ledige lydspor (under hovedsporet) for hele strekningen, så hele stemmen ligger på samme spor.
export function freeAudioLane(clips, from, to, ignore = new Set()) {
  for (let lane = -1; lane > -50; lane--) {
    const busy = Object.values(clips).some((c) => !ignore.has(c.id) && c.lane === lane && c.start < to - 1e-6 && from < c.start + c.dur - 1e-6);
    if (!busy) return lane;
  }
  return -50;
}

// Romlyd under pausene: biter av romlyden, med litt overlapp så overgangene ikke høres.
export function roomToneFill(gaps, toneDuration, overlap = 0.04) {
  if (!(toneDuration > 0.2)) return [];
  const out = [];
  let offset = 0;
  for (const g of gaps) {
    let at = Math.max(0, g.at - overlap),
      left = g.dur + overlap * 2;
    while (left > 0.02) {
      if (offset >= toneDuration - 0.1) offset = 0;
      const dur = Math.min(left, toneDuration - offset);
      out.push({ at: round3(at), in: round3(offset), dur: round3(dur) });
      offset += dur;
      at += dur;
      left -= dur;
    }
  }
  return out;
}

// Opptak følger linjen sin når manuset endres. Opptak uten linje beholdes, men vises som foreldreløse.
export function orphanTakes(blocks, vo) {
  const keys = new Set(blocks.filter((b) => b.kind === 'line').map((b) => b.key));
  return (vo?.takes || []).filter((t) => !keys.has(t.key));
}

// Fremdrift i manuset: hvor mange linjer som har et brukbart opptak.
export function progress(blocks, vo) {
  const lines = blocks.filter((b) => b.kind === 'line');
  const done = lines.filter((b) => chosenTake(vo, b.key)).length;
  return { done, total: lines.length };
}

// Neste linje uten opptak etter (eller fra) en posisjon. Brukes av "hopp til neste som mangler".
export function nextMissing(blocks, vo, from = -1) {
  const lines = blocks.filter((b) => b.kind === 'line');
  return (lines.find((b) => b.index > from && !chosenTake(vo, b.key)) || lines.find((b) => !chosenTake(vo, b.key)) || null)?.index ?? null;
}

// Lesetid: omtrent 150 ord i minuttet for fortellerstemme.
export function readingTime(blocks, wpm = 150) {
  const words = blocks.filter((b) => b.kind === 'line').reduce((n, b) => n + (b.text.match(/\S+/g)?.length || 0), 0);
  return (words / wpm) * 60;
}
