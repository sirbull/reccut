// Lese og skrive SRT-undertekster.

function ts(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

export function toSrt(items) {
  return items
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text.trim()}\n`)
    .join('\n');
}

function parseTs(s) {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0').slice(0, 3)) / 1000;
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
