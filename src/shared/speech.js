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

// Manus mot tagninger, som ScriptSync: for hver replikk finnes alle stedene i opptakene der den blir sagt,
// også når den er sagt flere ganger i samme fil, med hvor godt det stemmer og hvor mye nøling det er.
const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

// Replikkene i et manus. I et filmmanus (rollenavn over replikken) er bare replikkene tale; scenebeskrivelser,
// sceneoverskrifter, overganger og regi i parentes hoppes over, og hver replikk får rollen sin.
// Uten rollenavn (et voiceover-manus eller en tekst) er alle setninger tale.
const HEADING = /^(INT|EXT|INT\/EXT|I\/E|EST)[. ]/i;
const isCue = (line, next) =>
  Boolean(line && next) && line === line.toUpperCase() && /\p{Lu}/u.test(line) && !HEADING.test(line) && !/^[>#=]|TO:$/.test(line) &&
  line.replace(/\(.*?\)/g, '').trim().split(/\s+/).length <= 4;
export function scriptLines(text) {
  const rows = String(text).replace(/\r/g, '').split('\n').map((l) => l.trim());
  // A screenplay repeats character names, or has scene headings; a title in capitals alone is not one.
  const cues = rows.filter((l, i) => isCue(l, rows[i + 1])).map((l) => l.replace(/\(.*?\)/g, '').trim());
  const screenplay = cues.length > 0 && (new Set(cues).size < cues.length || rows.some((l) => HEADING.test(l)));
  const out = [];
  let speaker = null;
  rows.forEach((line, i) => {
    if (!line) return void (speaker = null);
    if (screenplay && isCue(line, rows[i + 1])) return void (speaker = line.replace(/\s*\(.*?\)\s*/g, ' ').trim());
    if (HEADING.test(line) || /^\(.*\)$/.test(line) || /^(#|=|>|\[\[|Title:)/.test(line) || (screenplay && !speaker)) return;
    if (!screenplay && line === line.toUpperCase() && line.split(/\s+/).length <= 4 && /\p{L}/u.test(line)) return;
    for (const s of line.match(/[^.!?]+[.!?]*["”»]?/g) || []) if (norm(s).length >= 2) out.push(speaker ? { text: s.trim(), speaker } : { text: s.trim() });
  });
  return out.slice(0, 1500);
}

// Semi-global alignment: the whole line against any stretch of words in a take. Word +2, near word +1,
// missing or extra word -1. Every good, non-overlapping place a line is said becomes a candidate.
export function matchScript(lines, takes, { minMatch = 0.5, perLine = 6 } = {}) {
  const prepared = takes.map((t) => ({ ...t, tokens: t.words.map((w) => norm(w.text)[0] || '') }));
  return lines.map((entry, index) => {
    const text = typeof entry === 'string' ? entry : entry.text;
    const L = norm(text),
      n = L.length,
      found = [];
    for (const take of prepared) {
      const W = take.tokens,
        m = W.length;
      if (!n || !m) continue;
      let prev = new Float64Array(m + 1),
        prevStart = Int32Array.from({ length: m + 1 }, (_, j) => j);
      for (let i = 1; i <= n; i++) {
        const cur = new Float64Array(m + 1),
          curStart = new Int32Array(m + 1);
        cur[0] = -i;
        curStart[0] = 0;
        for (let j = 1; j <= m; j++) {
          const a = L[i - 1],
            b = W[j - 1];
          const same = a === b ? 2 : a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4) ? 1 : -1;
          const diag = prev[j - 1] + same,
            up = prev[j] - 1,
            left = cur[j - 1] - 1;
          if (diag >= up && diag >= left) [cur[j], curStart[j]] = [diag, prevStart[j - 1]];
          else if (up >= left) [cur[j], curStart[j]] = [up, prevStart[j]];
          else [cur[j], curStart[j]] = [left, curStart[j - 1]];
        }
        prev = cur;
        prevStart = curStart;
      }
      const ends = [];
      for (let j = 1; j <= m; j++) if (prev[j] / (2 * n) >= minMatch && prev[j] >= (prev[j - 1] ?? -Infinity) && prev[j] >= (prev[j + 1] ?? -Infinity)) ends.push(j);
      ends.sort((x, y) => prev[y] - prev[x]);
      const used = [];
      for (const j of ends) {
        const s = prevStart[j];
        if (s >= j || used.some(([a, b]) => s < b && j > a)) continue;
        used.push([s, j]);
        const words = take.words.slice(s, j);
        const start = words[0].start,
          end = words.at(-1).end;
        found.push({
          mediaId: take.mediaId,
          sourceIn: start,
          sourceOut: end,
          match: Math.round((prev[j] / (2 * n)) * 100) / 100,
          hesitations: (take.pauses || []).filter(([a, b]) => a > start && b < end && b - a >= 0.4).length,
          spokenWords: j - s,
        });
      }
    }
    found.sort((a, b) => b.match - a.match || a.hesitations - b.hesitations);
    return { line: index, text, ...(entry.speaker ? { speaker: entry.speaker } : {}), takes: found.slice(0, perLine) };
  });
}
