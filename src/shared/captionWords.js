// Ordtider i undertekster: grunnlaget for animerte undertekster i kortformat (ord for ord).
//
// props.words på et undertekstklipp er [[start, slutt], ...], ett par per ord i teksten, i klippets
// kildetid (in + lokal tid), som nøkkelbildene. Da følger ordene innholdet når klippet trimmes eller deles.
// Stemmer ikke antallet med teksten (teksten er endret for hånd, eller importert fra SRT),
// fordeles ordene over klippets lengde etter hvor lange de er.

const r2 = (v) => Math.round(v * 100) / 100;

export const CAPTION_ANIMATIONS = [
  { value: 'none', label: 'None' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'pop', label: 'Pop' },
  { value: 'box', label: 'Box' },
  { value: 'reveal', label: 'Reveal' },
];

export const CAPTION_ENTRANCES = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'pop', label: 'Pop' },
];

// Ferdige stiler, i to grupper: vanlige undertekster og stiler for sosiale medier.
// Hver stil bygger på STYLE_BASE, så et bytte alltid nullstiller animasjon, boks og plassering.
// Stilene for sosiale medier er laget for 9:16, med teksten litt under midten,
// så den ikke havner under knappene og beskrivelsen i TikTok, Reels og Shorts.
export const CAPTION_PRESET_GROUPS = [
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'social', label: 'Social' },
];

const STYLE_BASE = {
  font: 'sans', size: 44, weight: 700, color: '#ffffff', outlineColor: '#000000', outlineWidth: 0,
  bg: false, bgColor: '#000000', bgOpacity: 0.72, shadow: false, align: 'center', position: 'bottom', x: 50, y: 90,
  maxLines: 2, uppercase: false, anim: 'none', highlightColor: '#ffd60a', entrance: 'none', chunkWords: 0,
};
const SOCIAL = { position: 'custom', x: 50, y: 68, maxLines: 3, weight: 800, shadow: true };
const preset = (group, id, label, desc, style) => ({ group, id, label, desc, style: { ...STYLE_BASE, ...(group === 'social' ? SOCIAL : {}), ...style } });

export const CAPTION_PRESETS = [
  preset('subtitles', 'classic', 'Classic', 'White text on a dark box at the bottom.', { weight: 600, bg: true, maxLines: 3 }),
  preset('subtitles', 'yellow-outline', 'Yellow Outline', 'Yellow text with a black outline, like DVD subtitles.', { color: '#ffe14d', outlineWidth: 3, shadow: true }),
  preset('subtitles', 'white-outline', 'White Outline', 'White text with a black outline, readable on any picture.', { outlineWidth: 3, shadow: true }),
  preset('subtitles', 'soft-shadow', 'Soft Shadow', 'Clean white text with a soft shadow.', { weight: 600, shadow: true }),
  preset('subtitles', 'cinema', 'Cinema', 'Light serif text, as in a cinema release.', { font: 'serif', size: 42, weight: 400, shadow: true }),
  preset('subtitles', 'solid-black', 'Solid Black', 'White text on solid black boxes, as on TV.',{ weight: 600, bg: true, bgOpacity: 1 }),

  preset('social', 'bold-pop', 'Bold Pop', 'Big capitals, the spoken word pops up in yellow.', { size: 60, outlineWidth: 5, uppercase: true, anim: 'pop', highlightColor: '#ffd60a', entrance: 'pop', chunkWords: 3 }),
  preset('social', 'yellow-bold', 'Yellow Bold', 'Yellow capitals with a thick outline, the spoken word turns white.', { size: 60, color: '#ffd60a', outlineWidth: 6, uppercase: true, anim: 'pop', highlightColor: '#ffffff', entrance: 'pop', chunkWords: 3 }),
  preset('social', 'karaoke', 'Karaoke', 'The spoken word lights up in green.', { font: 'rounded', size: 54, outlineWidth: 4, y: 70, anim: 'highlight', highlightColor: '#30d158', entrance: 'fade', chunkWords: 4 }),
  preset('social', 'word-box', 'Word Box', 'A coloured box follows the spoken word.', { size: 56, uppercase: true, anim: 'box', highlightColor: '#ff375f', entrance: 'pop', chunkWords: 3 }),
  preset('social', 'reveal', 'Reveal', 'Words appear one by one as they are said.', { size: 56, outlineWidth: 5, y: 66, anim: 'reveal', highlightColor: '#ffffff', chunkWords: 4 }),
  preset('social', 'one-word', 'One Word', 'One huge word at a time in the middle.', { size: 84, outlineWidth: 6, position: 'middle', maxLines: 1, uppercase: true, anim: 'pop', highlightColor: '#ffffff', entrance: 'pop', chunkWords: 1 }),
  preset('social', 'text-box', 'Text Box', 'Black text on white boxes, like the text in TikTok and Reels.', { font: 'rounded', size: 50, weight: 700, color: '#111111', bg: true, bgColor: '#ffffff', bgOpacity: 1, shadow: false, entrance: 'pop', chunkWords: 4 }),
  preset('social', 'highlighter', 'Highlighter', 'Black text marked with a yellow highlighter.', { size: 52, color: '#111111', bg: true, bgColor: '#ffe14d', bgOpacity: 1, shadow: false, uppercase: true, entrance: 'fade', chunkWords: 3 }),
  preset('social', 'neon', 'Neon Pink', 'White capitals, the spoken word glows pink.', { size: 58, outlineWidth: 4, outlineColor: '#2a0033', uppercase: true, anim: 'highlight', highlightColor: '#ff4fd8', entrance: 'pop', chunkWords: 3 }),
];

export function captionTokens(text) {
  return String(text || '').split(/\s+/).filter(Boolean);
}

// Ordene i teksten med start og slutt i kildetid. Uten (gyldige) lagrede tider fordeles de etter lengde.
export function captionWordTimes(clip) {
  const tokens = captionTokens(clip.props?.text);
  if (!tokens.length) return [];
  const stored = clip.props?.words;
  if (Array.isArray(stored) && stored.length === tokens.length) {
    return tokens.map((text, i) => ({ text, a: stored[i][0], b: stored[i][1] }));
  }
  const a0 = clip.in || 0;
  const total = tokens.reduce((s, t) => s + t.length + 1, 0);
  let acc = 0;
  return tokens.map((text) => {
    const a = a0 + (acc / total) * clip.dur;
    acc += text.length + 1;
    return { text, a: r2(a), b: r2(a0 + (acc / total) * clip.dur) };
  });
}

// Ordet som blir sagt ved kildetid s: det siste som har startet. -1 før det første.
// I en kort pause mellom to ord står det forrige ordet fortsatt markert.
export function activeWordIndex(times, s) {
  let k = -1;
  for (let i = 0; i < times.length; i++) {
    if (times[i].a <= s + 1e-3) k = i;
    else break;
  }
  return k;
}

// Whisper-ord (sekvenstid) til props.words for et klipp som starter ved start.
// Et ord med mellomrom i (sjeldent) deles, så antallet alltid stemmer med teksten.
export function wordsForCaption(start, words) {
  const out = [];
  for (const w of words || []) {
    const parts = captionTokens(w.text);
    const step = (w.end - w.start) / Math.max(1, parts.length);
    parts.forEach((_, i) => out.push([r2(Math.max(0, w.start + i * step - start)), r2(Math.max(0, w.start + (i + 1) * step - start))]));
  }
  return out;
}

// Deler en undertekst i korte biter for kortformat: høyst maxWords ord og maxChars tegn,
// og alltid ved punktum, komma og pauser. Hver bit får sine egne ordtider.
// Returnerer [{ start, dur, text, words }] i sekvenstid, eller null hvis klippet allerede er kort nok.
export function splitCaptionWords(clip, maxWords = 3, maxChars = 24) {
  const srcStart = clip.in || 0;
  const srcEnd = srcStart + clip.dur;
  // Ord som er trimmet bort, er ikke med.
  const times = captionWordTimes(clip).filter((w) => w.b > srcStart && w.a < srcEnd);
  if (times.length <= 1) return null;
  const chunks = [];
  let cur = null;
  for (const w of times) {
    const last = cur?.words.at(-1);
    const brk =
      !cur ||
      cur.words.length >= maxWords ||
      cur.chars + 1 + w.text.length > maxChars ||
      /[.!?,;:…]$/.test(last.text) ||
      w.a - last.b >= 0.4;
    if (brk) {
      if (cur) chunks.push(cur);
      cur = { words: [w], chars: w.text.length };
    } else {
      cur.words.push(w);
      cur.chars += 1 + w.text.length;
    }
  }
  chunks.push(cur);
  if (chunks.length < 2) return null;
  const toSeq = (s) => clip.start + (s - srcStart);
  return chunks.map((c, i) => {
    const next = chunks[i + 1];
    // Den første biten starter der klippet startet, de andre når det første ordet deres blir sagt.
    const base = i === 0 ? srcStart : Math.max(srcStart, c.words[0].a);
    const lastEnd = c.words.at(-1).b;
    let b = next ? (next.words[0].a - lastEnd < 0.5 ? next.words[0].a : lastEnd + 0.25) : srcEnd;
    b = Math.min(srcEnd, Math.max(b, base + 0.2));
    return {
      start: r2(toSeq(base)),
      dur: r2(Math.max(0.2, b - base)),
      text: c.words.map((w) => w.text).join(' '),
      words: c.words.map((w) => [r2(Math.max(0, w.a - base)), r2(Math.max(0, w.b - base))]),
    };
  });
}

// Bladet midt i en undertekst med ordtider: ordene fordeles på hver side av kuttet (ved kildetid s).
// Returnerer null når en av sidene blir tom eller tidene ikke er ekte, så teksten blir som før.
export function splitCaptionAt(clip, s) {
  const stored = clip.props?.words;
  const tokens = captionTokens(clip.props?.text);
  if (!Array.isArray(stored) || stored.length !== tokens.length) return null;
  const left = [];
  const right = [];
  tokens.forEach((text, i) => ((stored[i][0] + stored[i][1]) / 2 < s ? left : right).push({ text, t: stored[i] }));
  if (!left.length || !right.length) return null;
  return {
    left: { text: left.map((w) => w.text).join(' '), words: left.map((w) => w.t) },
    right: { text: right.map((w) => w.text).join(' '), words: right.map((w) => w.t) },
  };
}
