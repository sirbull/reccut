// Tale i tid: pauser fra lydnivået, ordtider fra Whisper rettet mot pausene, og ord samlet til undertekster.
// Whisper strekker ofte siste ord før en pause inn i stillheten; lydnivået er mer presist.

// Stillhet målt i 20 ms-vinduer. Terskelen ligger mellom bakgrunnsstøy og tale, så den virker
// både i stille rom og med vifte eller romklang. Returnerer [[start, slutt], ...] i sekunder.
export function findPauses(pcm, rate, { minPause = 0.25 } = {}) {
  const hop = Math.round(rate * 0.02),
    n = Math.floor(pcm.length / hop);
  if (!n) return [];
  const db = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) sum += pcm[j] * pcm[j];
    db[i] = 10 * Math.log10(sum / hop + 1e-12);
  }
  const sorted = Float32Array.from(db).sort();
  const noise = sorted[Math.floor(n * 0.1)],
    speech = sorted[Math.floor(n * 0.95)];
  const threshold = Math.max(noise + 6, noise + (speech - noise) * 0.35);
  const out = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && db[i] < threshold;
    if (quiet && start < 0) start = i;
    if (!quiet && start >= 0) {
      if ((i - start) * 0.02 >= minPause) out.push([r2(start * 0.02), r2(i * 0.02)]);
      start = -1;
    }
  }
  return out;
}
const r2 = (v) => Math.round(v * 100) / 100;

// Flytter ordkanter som havner inne i en pause ut til kanten av pausen.
export function alignWords(words, pauses) {
  let k = 0;
  return words.map((w) => {
    let { start, end } = w;
    while (k < pauses.length && pauses[k][1] <= start) k++;
    for (let i = Math.max(0, k - 1); i < pauses.length && pauses[i][0] < end; i++) {
      const [a, b] = pauses[i];
      if (start >= a && start < b) start = b;
      if (end > a && end <= b) end = a;
    }
    return end - start >= 0.05 ? { ...w, start: r2(start), end: r2(end) } : { ...w, start: r2(w.start), end: r2(w.end) };
  });
}

// Samler ord til lesbare undertekster: brudd ved pauser, ved slutten av en setning og ved 84 tegn.
export function groupWords(words, maxChars = 84) {
  const out = [];
  let cur = null;
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    const prev = cur?.words.at(-1);
    const brk =
      !cur ||
      w.start - prev.end >= 0.5 ||
      (cur.text.length + text.length + 1 > maxChars) ||
      (/[.!?]$/.test(prev.text.trim()) && cur.text.length >= 20);
    if (brk) {
      if (cur) out.push(cur);
      cur = { start: w.start, end: w.end, text, words: [w] };
    } else {
      cur.text += ` ${text}`;
      cur.end = w.end;
      cur.words.push(w);
    }
  }
  if (cur) out.push(cur);
  return out.map(({ start, end, text }) => ({ start, end: Math.max(end, start + 0.6), text }));
}
