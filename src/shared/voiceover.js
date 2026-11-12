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

// Undertekster fra manuset: hver linje legges over klippet sitt (parts: [{ text, start, dur }]).
// Sikt mot én linje per undertekst (42 tegn). Hver setning starter i en ny undertekst;
// lange setninger deles helst ved komma, ellers mellom ord. Tiden fordeles etter antall tegn.
// Retningslinjer i [klammer] er ikke med.
export function scriptCaptions(parts, { maxChars = 42 } = {}) {
  const out = [];
  for (const { text, start, dur } of parts) {
    const clean = plainLine(text).replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    if (!clean || !(dur > 0)) continue;
    const chunks = [];
    for (const sentence of splitSentences(clean)) {
      let rest = sentence;
      while (rest.length > maxChars) {
        const head = rest.slice(0, maxChars + 1);
        const comma = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '));
        let cut = comma > maxChars * 0.4 ? comma + 1 : head.lastIndexOf(' ');
        if (cut <= 0) cut = maxChars;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) chunks.push(rest);
    }
    const total = chunks.reduce((a, c) => a + c.length, 0);
    let t = start;
    for (const c of chunks) {
      const d = (dur * c.length) / total;
      out.push({ start: round3(t), end: round3(t + d), text: c });
      t += d;
    }
  }
  return out;
}

// Enkel, stabil nøkkel for en linje, så opptak følger linjen selv om manuset endres rundt den.
export function blockKey(text, speaker = '') {
  const s = `${speaker}|${String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// Formatert tekst fra utklippstavlen (Word, Google Docs, nettsider) blir manus:
// overskrifter blir seksjoner (#), avsnitt skilles med en tom linje og linjeskift beholdes.
// ponytail: regex, ikke DOM, så det kan testes i node. Tabeller og nestede lister blir bare linjer.
export function htmlToScript(html) {
  const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return String(html)
    .replace(/<(head|style|script)[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n\n${'#'.repeat(n)} `)
    .replace(/<br[^>]*>|<\/li>/gi, '\n')
    .replace(/<\/(h[1-6]|p|div|ul|ol|blockquote|tr|table)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] !== '#' ? entities[e.toLowerCase()] ?? m
      : String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))))
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/^#+ *$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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
// skipStart/skipEnd (sekunder): kantene der det ikke letes etter tale (klikk fra Record og stopp).
// Tale som fortsetter inn i kantene tas likevel med av de myke kantene under.
// maxEdge: hvor langt de myke kantene (s, f, pust) kan gå ut fra der stemmen tydelig starter og slutter.
export function detectSpeech(env, { hop = 0.01, floorDb = null, minSpeech = 0.06, minGap = 0.35, skipStart = 0, skipEnd = 0, maxEdge = 0.2 } = {}) {
  if (!env.length) return null;
  // Støygulvet er det stilleste i selve opptaket. Romlyden kan senke det litt (opptak med lite stillhet),
  // men aldri mer enn 6 dB: ble romlyden målt stillere, ville støyen i opptaket ellers regnes som stemme.
  const own = percentile(env, 0.1);
  const floor = clamp(floorDb != null ? Math.max(Math.min(floorDb, own), own - 6) : own, -100, -25);
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
  const first = Math.round(skipStart / hop);
  const last = env.length - 1 - Math.round(skipEnd / hop);
  let s = -1;
  for (let i = first; i + k <= last + 1; i++)
    if (run(i, 1)) {
      s = i;
      break;
    }
  if (s < 0) return null;
  let e = s;
  for (let i = last; i - k + 1 >= s; i--)
    if (run(i, -1)) {
      e = i;
      break;
    }
  // Myke kanter (f, s, h og pust inn i ordet) tas med til nivået faller mot støygulvet.
  const gap = Math.round(minGap / hop);
  const edge = (i, dir) => {
    let quiet = 0,
      last = i;
    const stop = i + dir * Math.round(maxEdge / hop);
    for (let j = i + dir; j >= 0 && j < env.length && j !== stop; j += dir) {
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

// Toppnivå per 10 ms (0 til 1), til bølgeformen i studioets tidslinje.
export function peaks(samples, rate, hop = 0.01) {
  const n = Math.max(1, Math.round(rate * hop));
  const out = new Float32Array(Math.ceil(samples.length / n));
  for (let f = 0; f < out.length; f++) {
    let m = 0;
    for (let i = f * n, e = Math.min(samples.length, i + n); i < e; i++) {
      const a = samples[i] < 0 ? -samples[i] : samples[i];
      if (a > m) m = a;
    }
    out[f] = m;
  }
  return out;
}

// Forsterkning (dB) som løfter eller senker et klipp til en topp på target dB, begrenset til +-24 dB.
export function normalizeGain(peakDb, target = -3) {
  if (!(peakDb > -120)) return 0;
  return Math.round(clamp(target - peakDb, -24, 24) * 10) / 10;
}

// Høyeste topp i et utsnitt av toppene (sekunder inn og ut), i dB.
export function peakDbIn(pk, from, to, hop = 0.01) {
  let m = 0;
  for (let i = Math.max(0, Math.floor(from / hop)), e = Math.min(pk.length, Math.ceil(to / hop)); i < e; i++) if (pk[i] > m) m = pk[i];
  return m > 0 ? 20 * Math.log10(m) : -120;
}

/* Sammensying */

export const DEFAULT_PACING = { sentence: 0.35, paragraph: 0.8, section: 1.6 };

// Personer: hver person har egne opptak, valg og effekter, og blir et eget spor.
// Opptak og valg fra før det fantes personer hører til den første (p1).
export const FIRST_PERSON = 'p1';
export const personOf = (t) => t?.person || FIRST_PERSON;
export const pickKey = (person, key) => (person === FIRST_PERSON ? key : `${person}|${key}`);
export const isSkipped = (vo, person, key) => Boolean(vo?.skip?.[pickKey(person, key)]);

// Valgt opptak for en linje: det brukeren har valgt, ellers stjernemerket, ellers det siste.
// person: bare den personens opptak. Uten person gjelder alle (eldre bruk).
export function chosenTake(vo, key, person = null) {
  const takes = (vo?.takes || []).filter((t) => t.key === key && !t.bad && (person == null || personOf(t) === person));
  const pick = vo?.selected?.[pickKey(person ?? FIRST_PERSON, key)];
  return takes.find((t) => t.id === pick) || takes.filter((t) => t.star).at(-1) || takes.at(-1) || null;
}

/* Kutt i et opptak (take.cuts): områder i kildetid som er tatt bort, [[fra, til], ...]. Et kutt med
   lik start og slutt er bare en deling. Delene (takeParts) er det som er igjen mellom take.in og take.out. */
export function addCut(cuts = [], a, b = a) {
  const list = [...cuts.map((c) => [...c]), [round3(Math.min(a, b)), round3(Math.max(a, b))]].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const c of list) {
    const last = out.at(-1);
    // Kutt som overlapper eller møtes, slås sammen. En ren deling inni et kutt forsvinner i det.
    if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]);
    else out.push(c);
  }
  return out;
}
export function takeParts(take) {
  const parts = [];
  let a = take.in;
  for (const [x, y] of take.cuts || []) {
    if (y <= a || x >= take.out) continue;
    if (x - a > 0.01) parts.push([round3(a), round3(Math.min(x, take.out))]);
    a = Math.max(a, y);
  }
  if (take.out - a > 0.01) parts.push([round3(a), round3(take.out)]);
  return parts;
}
export const takeLength = (take) => takeParts(take).reduce((s, [a, b]) => s + b - a, 0);
// Fade-lengdene må få plass i kantdelene også etter at et opptak er delt eller kuttet.
export function takeFades(take) {
  const parts = takeParts(take);
  const length = (p) => p ? (p[1] - p[0]) / 2 : 0;
  return {
    fadeIn: Math.max(0, Math.min(take.fadeIn ?? 0.02, length(parts[0]))),
    fadeOut: Math.max(0, Math.min(take.fadeOut ?? 0.04, length(parts.at(-1)))),
  };
}

// Opptaket beholdes som kilde og som valg i take-listen. Etter en deling har det egne,
// vedvarende tidslinjeklipp med uavhengige innstillinger og kildeområder.
export const studioClips = (take) => (take.clips || [take]).filter((c) => !c.deleted);
export const allStudioTakes = (vo) => (vo.takes || []).flatMap((t) => [t, ...(t.clips || [])]);
export const studioGapKey = (take) => take.sourceTakeId ? take.id : take.key;

export function splitStudioClip(vo, plan, id, time, ids) {
  const it = plan.items.find((x) => x.take.id === id);
  if (!it || !Number.isFinite(time)) return null;
  const parts = itemParts(it);
  const part = parts.find((p) => time >= p.at && time <= p.at + p.dur);
  if (!part || time - it.at < 0.05 || it.at + it.dur - time < 0.05) return null;
  const source = vo.takes.find((t) => t.id === (it.take.sourceTakeId || id));
  if (!source) return null;
  const at = round3(part.in + time - part.at);
  const base = it.take;
  const clone = (id) => ({ ...base, id, sourceTakeId: source.id,
    ...(base.cuts ? { cuts: base.cuts.map((c) => [...c]) } : {}),
    ...(base.volKf ? { volKf: base.volKf.map((k) => [...k]) } : {}),
  });
  const left = clone(ids[0]), right = clone(ids[1]);
  delete left.clips;
  delete right.clips;
  left.out = at;
  left.pause = 0;
  left.fadeOut = 0.006;
  right.in = at;
  if (it.at + takeLength(base) - time < 0.05) {
    // Klippet kan vise opptakets romlyd etter stemmen. Når det kuttes i denne halen,
    // blir romlyden en virkelig del av klippet og trekkes fra pausen til neste linje.
    right.out = Math.max(base.out, parts.at(-1).in + parts.at(-1).dur);
    const next = plan.items.find((x) => x.block.index > it.block.index);
    right.pause = next ? round3(Math.max(0, next.at - it.at - it.dur)) : 0;
  }
  right.fadeIn = 0.006;
  Object.assign(left, takeFades(left));
  Object.assign(right, takeFades(right));
  if (source.clips) {
    const index = source.clips.findIndex((c) => c.id === id);
    if (index < 0) return null;
    source.clips.splice(index, 1, left, right);
  } else source.clips = [left, right];
  const gap = studioGapKey(base);
  if (vo.toneOff?.[gap]) {
    vo.toneOff[right.id] = true;
    delete vo.toneOff[gap];
  }
  return [left.id, right.id];
}

export function deleteStudioClips(vo, ids) {
  const wanted = new Set(ids);
  vo.skip ||= {};
  for (const source of vo.takes) {
    if (!source.clips) {
      if (wanted.has(source.id)) vo.skip[pickKey(personOf(source), source.key)] = true;
      continue;
    }
    const last = studioClips(source).at(-1);
    for (const clip of source.clips) if (wanted.has(clip.id)) clip.deleted = true;
    const remaining = studioClips(source);
    if (!remaining.length) vo.skip[pickKey(personOf(source), source.key)] = true;
    else if (last && wanted.has(last.id)) {
      // Pausen til neste manuslinje beholdes når slutten av en linje slettes.
      if (last.pause == null) delete remaining.at(-1).pause;
      else remaining.at(-1).pause = last.pause;
    }
  }
}

// Flytt et klipp og klippene etter det. Mellom oppdelte klipp endres bare den interne pausen;
// før en ny manuslinje endres pausen etter den foregående linjen.
export function moveStudioClip(vo, plan, takeId, delta) {
  const live = plan.items;
  const it = live.find((it) => it.take.id === takeId);
  if (!it || !Number.isFinite(delta)) return;
  let before;
  const own = live.filter((x) => x.person === it.person && x.block.key === it.block.key && x.at < it.at - 1e-6);
  if (own.length) before = [own.at(-1)];
  else {
    const prev = live.filter((x) => x.block.key !== it.block.key && x.at < it.at - 1e-6).sort((a, b) => b.at - a.at)[0];
    if (!prev) {
      vo.leadIn = round3(Math.max(0, it.at + delta));
      return;
    }
    const byPerson = new Map();
    for (const x of live.filter((x) => x.block.key === prev.block.key)) byPerson.set(x.person, x);
    before = [...byPerson.values()];
  }
  const end = Math.max(...before.map((x) => x.at + takeLength(x.take)));
  const pause = round3(Math.max(0, it.at - end + delta));
  const ids = new Set(before.map((x) => x.take.id));
  for (const t of allStudioTakes(vo)) if (ids.has(t.id)) t.pause = pause;
}
// Delene av et klipp i tidslinjen: { at, in, dur } for hver, etter hverandre fra it.at. Den siste får
// med det klippet er forlenget med (romlyd fra selve opptaket).
export function itemParts(it) {
  const parts = takeParts(it.take);
  if (!parts.length) return [{ at: it.at, in: it.in, dur: it.dur }];
  const out = [];
  let t = it.at;
  parts.forEach(([a, b], k) => {
    const dur = k === parts.length - 1 ? Math.max(0.01, it.at + it.dur - t) : b - a;
    out.push({ at: round3(t), in: a, dur: round3(dur) });
    t += b - a;
  });
  return out;
}

/**
 * Plan for tidslinjen med ett spor per person. Linjene ligger i manusrekkefølge i felles plasser,
 * så to personer som leser samme linje ligger rett over hverandre (sammenligning), og en dialog
 * flettes etter manuset. Plassen er så lang som det lengste opptaket, også på deaktiverte spor.
 * active styrer bare av/på, aldri plasseringen. Pausen etter følger manuset.
 * room: 'fill' fyller pausen med opptakets egen romlyd så langt filen rekker, og resten blir et
 * tomrom (gaps, der romlyden kan legges). 'tight' bruker bare det som finnes og lar aldri et tomrom
 * stå igjen (video i hovedsporet).
 * people: [{ id, active }]. Et klipp med take.disabled (V) er av, men beholder plassen.
 * people: [{ id, active }]. Gir { items: [{ take, block, person, active, at, in, dur }], gaps, end }.
 */
export function planStudio(blocks, vo, { start = 0, pacing = DEFAULT_PACING, room = false, from = 0, people = [{ id: FIRST_PERSON, active: true }] } = {}) {
  const lines = blocks.filter((b) => b.kind === 'line' && b.index >= from);
  const slots = [];
  for (const block of lines) {
    const takes = people.map((p) => ({ p, take: isSkipped(vo, p.id, block.key) ? null : chosenTake(vo, block.key, p.id) })).filter((x) => x.take && studioClips(x.take).length).map((x) => ({ ...x, clips: studioClips(x.take) }));
    if (takes.length) slots.push({ block, takes });
  }
  const items = [];
  const spans = [];
  let t = start + (slots.length && from === 0 ? Math.max(0, Number(vo.leadIn) || 0) : 0);
  const length = (clips) => clips.reduce((sum, c, i) => sum + Math.max(0.05, takeLength(c)) + (i < clips.length - 1 ? Math.max(0, c.pause || 0) : 0), 0);
  for (const slot of slots) {
    const { block } = slot;
    const next = slots[slots.indexOf(slot) + 1]?.block;
    const auto = !next ? 0 : next.section !== block.section ? pacing.section : next.para !== block.para ? pacing.paragraph : pacing.sentence;
    const manual = slot.takes.map((x) => x.clips.at(-1).pause).filter((v) => v != null);
    const pause = !next ? 0 : manual.length ? Math.max(0, ...manual) : auto;
    const len = Math.max(...slot.takes.map((x) => length(x.clips)));
    let longest = 0;
    for (const { p, clips } of slot.takes) {
      let offset = 0;
      clips.forEach((take, k) => {
        let dur = Math.max(0.05, takeLength(take));
        if (room && k === clips.length - 1) {
          const want = room === 'tight' ? pause : len - length(clips) + pause;
          dur += Math.max(0, Math.min(want, (take.duration ?? take.out) - take.out));
        }
        const at = round3(t + offset);
        items.push({ take, block, person: p.id, active: p.active && !take.disabled, at, in: takeParts(take)[0]?.[0] ?? take.in, dur: round3(dur) });
        spans.push([at, at + dur, studioGapKey(take), p.id]);
        longest = Math.max(longest, offset + dur);
        offset += dur + (k < clips.length - 1 ? Math.max(0, take.pause || 0) : 0);
      });
    }
    t += room === 'tight' ? longest : len + pause;
  }
  // Tomrom mellom klippene beholdes også når et spor er deaktivert.
  const gaps = [];
  spans.sort((a, b) => a[0] - b[0]);
  // after: linjen før pausen, så en pause kan kjennes igjen (romlyd som er slettet).
  // person: hvem som snakket før pausen. Romlyden i pausen ligger på den personens romlydspor.
  let reach = start;
  let after = null;
  let person = spans[0]?.[3] ?? null;
  for (const [a, b, key, who] of spans) {
    if (a - reach > 0.001) gaps.push({ at: round3(reach), dur: round3(a - reach), after, person });
    if (b >= reach) {
      after = key;
      person = who;
    }
    reach = Math.max(reach, b);
  }
  if (t - reach > 0.001 && slots.length) gaps.push({ at: round3(reach), dur: round3(t - reach), after, person });
  return { items, gaps, end: round3(t) };
}

// Én person (eldre bruk og tester).
export function planAssembly(blocks, vo, opts = {}) {
  return planStudio(blocks, vo, { ...opts, people: [{ id: FIRST_PERSON, active: true }] });
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
// Begge ender av romlyden (edge sekunder) brukes aldri: der ligger klikket fra start og stopp.
export function roomToneFill(gaps, toneDuration, overlap = 0.04, edge = 0.5) {
  const cut = Math.min(edge, toneDuration * 0.15);
  const first = cut;
  const last = toneDuration - cut;
  if (!(last - first > 0.2)) return [];
  const out = [];
  let offset = first;
  for (const g of gaps) {
    let at = Math.max(0, g.at - overlap),
      left = g.dur + overlap * 2;
    while (left > 0.02) {
      if (offset >= last - 0.1) offset = first;
      const dur = Math.min(left, last - offset);
      out.push({ at: round3(at), in: round3(offset), dur: round3(dur), ...(g.after !== undefined ? { after: g.after } : {}), ...(g.person ? { person: g.person } : {}) });
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
export function progress(blocks, vo, person = null) {
  const lines = blocks.filter((b) => b.kind === 'line');
  const done = lines.filter((b) => chosenTake(vo, b.key, person)).length;
  return { done, total: lines.length };
}

// Neste linje uten opptak etter (eller fra) en posisjon. Brukes av "hopp til neste som mangler".
export function nextMissing(blocks, vo, from = -1, person = null) {
  const lines = blocks.filter((b) => b.kind === 'line');
  return (lines.find((b) => b.index > from && !chosenTake(vo, b.key, person)) || lines.find((b) => !chosenTake(vo, b.key, person)) || null)?.index ?? null;
}

// Lesetid: omtrent 150 ord i minuttet for fortellerstemme.
export function readingTime(blocks, wpm = 150) {
  const words = blocks.filter((b) => b.kind === 'line').reduce((n, b) => n + (b.text.match(/\S+/g)?.length || 0), 0);
  return (words / wpm) * 60;
}
