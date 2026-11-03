import { fontFamily } from './render.js';

export function designFont(layer, size = layer.size) {
  return `${layer.weight} ${size}px ${fontFamily(layer.font)}`;
}
// Single paired asterisks mark highlights. Consecutive stars and unmatched
// delimiters stay literal; escaping never starts or ends a highlight.
export function parseDesignText(text = '') {
  const chars = [], delimiters = [];
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && ['*', '\\'].includes(text[i + 1])) { chars.push({ text: text[i + 1], highlight: false }); i += 2; continue; }
    if (text[i] === '*') {
      let end = i + 1; while (text[end] === '*') end++;
      if (end === i + 1) delimiters.push(chars.length);
      for (; i < end; i++) chars.push({ text: '*', highlight: false });
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)); chars.push({ text: char, highlight: false }); i += char.length;
  }
  const removed = new Set();
  for (let i = 0; i + 1 < delimiters.length; i += 2) {
    const a = delimiters[i], b = delimiters[i + 1]; removed.add(a); removed.add(b);
    for (let j = a + 1; j < b; j++) chars[j].highlight = true;
  }
  const runs = [];
  chars.forEach((c, i) => {
    if (removed.has(i)) return;
    if (runs.at(-1)?.highlight === c.highlight) runs.at(-1).text += c.text;
    else runs.push({ ...c });
  });
  return runs;
}
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const graphemes = (text) => segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);

// Text measurement is supplied by the caller, keeping layout deterministic and
// usable in tests, thumbnails and export without a document or a canvas global.
export function layoutDesignText(layer, measure) {
  const runs = parseDesignText(layer.text).map((r) => ({ ...r, text: layer.uppercase ? r.text.toLocaleUpperCase() : r.text }));
  const chars = runs.flatMap((r) => graphemes(r.text).map((text) => ({ text, highlight: r.highlight })));
  const layout = (size) => {
    const font = designFont(layer, size), tracking = layer.tracking || 0;
    const width = (s) => measure(s, font) + Math.max(0, graphemes(s).length - 1) * tracking;
    const lines = [], rich = []; let line = [];
    const push = () => { rich.push(line); lines.push(line.map((c) => c.text).join('')); line = []; };
    // Keep words intact until a single word itself exceeds the box width.
    const tokens = []; let token = [];
    for (const c of chars) {
      if (c.text === '\n') { if (token.length) tokens.push(token); tokens.push([c]); token = []; }
      else if (token.length && /\s/u.test(token[0].text) !== /\s/u.test(c.text)) { tokens.push(token); token = [c]; }
      else token.push(c);
    }
    if (token.length) tokens.push(token);
    let pending = [];
    for (const word of tokens) {
      if (word[0].text === '\n') { push(); pending = []; continue; }
      if (/\s/u.test(word[0].text)) { pending = line.length ? [{ text: ' ', highlight: word[0].highlight }] : []; continue; }
      const combined = [...line, ...pending, ...word];
      if (line.length && width(combined.map((c) => c.text).join('')) > layer.w) { push(); pending = []; }
      if (line.length) line.push(...pending);
      pending = [];
      for (const c of word) {
        if (line.length && width([...line, c].map((c) => c.text).join('')) > layer.w) push();
        line.push(c);
      }
    }
    push();
    const lineHeight = size * layer.lineHeight, height = lines.length * lineHeight;
    const widths = lines.map(width);
    const overflow = height > layer.h + 0.01 || widths.some((w) => w > layer.w + 0.01);
    const lineRuns = rich.map((cs) => {
      const out = [];
      for (const c of cs) {
        if (out.at(-1)?.highlight === c.highlight) out.at(-1).text += c.text;
        else out.push({ ...c });
      }
      return out;
    });
    return { size, font, lines, lineRuns, widths, lineHeight, height, overflow };
  };
  let result = layout(layer.size);
  if (!layer.autofit || !result.overflow || layer.size <= 6) return result;
  let lo = 6, hi = layer.size; result = layout(lo);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2, next = layout(mid);
    if (next.overflow) hi = mid;
    else { lo = mid; result = next; }
  }
  return result;
}
