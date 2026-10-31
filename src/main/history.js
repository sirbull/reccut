// Versjonshistorikk: automatiske kopier av prosjektfilen i mappen Auto-Save ved siden av
// prosjektet, som i After Effects. En kopi lages når prosjektet har endret seg og det har gått
// noen minutter siden forrige, og når appen lukkes. Eldre kopier tynnes ut, men noen beholdes
// alltid fra hver dag og uke, så du kan gå langt tilbake. Kopiene er komprimert.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INTERVAL = 5 * 60 * 1000;
const EXT = '.reccut.gz';
const last = new Map(); // prosjektfil -> { time, hash }

function historyDir(projectFile) {
  return path.join(path.dirname(projectFile), 'Auto-Save');
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}

// En enkel sjekksum, så like versjoner ikke lagres to ganger.
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 7) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${h >>> 0}`;
}

async function list(projectFile) {
  const dir = historyDir(projectFile);
  const base = path.basename(projectFile, path.extname(projectFile));
  let files = [];
  try {
    files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith(EXT) && f.startsWith(base + ' '));
  } catch {
    return [];
  }
  const out = [];
  for (const f of files) {
    const st = await fs.promises.stat(path.join(dir, f)).catch(() => null);
    if (!st) continue;
    const m = f.slice(base.length + 1, -EXT.length).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})\.(\d{2})(?: (.+))?$/);
    const time = m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : st.mtimeMs;
    out.push({ file: path.join(dir, f), time, size: st.size, reason: m?.[7] || '' });
  }
  return out.sort((a, b) => b.time - a.time);
}

/**
 * Lager en kopi om det trengs. force: lag kopi selv om det er kort tid siden (ved lukking og
 * før gjenoppretting). Gir filen som ble laget, eller null.
 */
async function snapshot(projectFile, text, { force = false, reason = '' } = {}) {
  if (!projectFile) return null;
  if (text == null) text = await fs.promises.readFile(projectFile, 'utf8').catch(() => null);
  if (!text) return null;
  const now = Date.now();
  const h = hash(text);
  let prev = last.get(projectFile);
  if (!prev) {
    const l = await list(projectFile);
    prev = l.length ? { time: l[0].time, hash: null } : { time: 0, hash: null };
    last.set(projectFile, prev);
  }
  if (prev.hash === h) return null;
  if (!force && now - prev.time < INTERVAL) return null;
  const dir = historyDir(projectFile);
  await fs.promises.mkdir(dir, { recursive: true });
  const base = path.basename(projectFile, path.extname(projectFile));
  const file = path.join(dir, `${base} ${stamp(new Date(now))}${reason ? ` ${reason}` : ''}${EXT}`);
  await fs.promises.writeFile(file + '.tmp', zlib.gzipSync(text));
  await fs.promises.rename(file + '.tmp', file);
  last.set(projectFile, { time: now, hash: h });
  await prune(projectFile).catch(() => {});
  return file;
}

// Tynning: alt fra de siste to timene, én per time de siste to dagene, én per dag den siste
// måneden, én per uke det siste året, og én per måned etter det.
async function prune(projectFile) {
  const items = await list(projectFile);
  const now = Date.now();
  const H = 3600e3;
  const D = 24 * H;
  const keep = new Set();
  const seen = new Set();
  for (const it of items) {
    const age = now - it.time;
    let bucket;
    if (age < 2 * H) bucket = `all:${it.file}`;
    else if (age < 2 * D) bucket = `h:${Math.floor(it.time / H)}`;
    else if (age < 30 * D) bucket = `d:${Math.floor(it.time / D)}`;
    else if (age < 365 * D) bucket = `w:${Math.floor(it.time / (7 * D))}`;
    else bucket = `m:${new Date(it.time).getFullYear()}-${new Date(it.time).getMonth()}`;
    // Listen er nyest først, så den nyeste i hver bøtte beholdes.
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    keep.add(it.file);
  }
  for (const it of items) if (!keep.has(it.file)) await fs.promises.unlink(it.file).catch(() => {});
}

async function read(file) {
  return JSON.parse(zlib.gunzipSync(await fs.promises.readFile(file)).toString('utf8'));
}

module.exports = { list, snapshot, read, prune, historyDir };
