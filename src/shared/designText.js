import { wrapText, fontFamily } from './render.js';

export function designFont(layer, size = layer.size) {
  return `${layer.weight} ${size}px ${fontFamily(layer.font)}`;
}
// Keep the editor's word wrapping, splitting long words by grapheme when necessary.
export function layoutDesignText(layer, measure) {
  const text = layer.uppercase ? layer.text.toLocaleUpperCase() : layer.text;
  const segments = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const layout = (size) => {
    const font = designFont(layer, size);
    const width = (t) => measure(t, font) + Math.max(0, Array.from(t).length - 1) * (layer.tracking || 0);
    const lines = [];
    for (const line of wrapText({ measureText: (t) => ({ width: width(t) }) }, text, layer.w)) {
      if (width(line) <= layer.w) { lines.push(line); continue; }
      let part = '';
      const chars = segments ? Array.from(segments.segment(line), (s) => s.segment) : Array.from(line);
      for (const char of chars) {
        if (part && width(part + char) > layer.w) { lines.push(part); part = ''; }
        part += char;
      }
      lines.push(part);
    }
    const lineHeight = size * layer.lineHeight;
    const height = lines.length * lineHeight;
    const overflow = height > layer.h + 0.01 || lines.some((l) => width(l) > layer.w + 0.01);
    return { size, font, lines, lineHeight, height, overflow };
  };
  let result = layout(layer.size);
  if (!layer.autofit || !result.overflow || layer.size <= 6) return result;
  let lo = 6, hi = layer.size;
  result = layout(lo);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2, next = layout(mid);
    if (next.overflow) hi = mid;
    else { lo = mid; result = next; }
  }
  return result;
}
