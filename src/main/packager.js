// Pakker et prosjekt for arkiv, som Collect Files i After Effects: prosjektfilen og ALLE filene
// den bruker kopieres til én mappe, så mappen inneholder alt som trengs for å åpne prosjektet
// på en annen maskin eller om mange år. Til slutt skrives en rapport over hva som ble gjort.
const fs = require('fs');
const path = require('path');
const projects = require('./projects');
const ff = require('./ffmpeg');

// Kutter en del av en fil med høy kvalitet. Video: H.264 nesten tapsfritt (10-bit som HEVC,
// gjennomsiktighet som ProRes 4444). Bare lyd: FLAC, som er tapsfritt. Gir filendelsen.
function trimSpec(s) {
  if (!s.hasVideo) return { ext: '.flac', args: ['-vn', '-c:a', 'flac'] };
  const audio = s.hasAudio ? ['-c:a', 'aac', '-b:a', '320k'] : ['-an'];
  if (s.alpha) return { ext: '.mov', args: ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', ...(s.hasAudio ? ['-c:a', 'pcm_s16le'] : ['-an'])] };
  if (s.bits > 8) return { ext: '.mp4', args: ['-c:v', 'libx265', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p10le', '-tag:v', 'hvc1', ...audio, '-movflags', '+faststart'] };
  return { ext: '.mp4', args: ['-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', ...audio, '-movflags', '+faststart'] };
}

async function trimFile(s, to, onSeconds, setCancel) {
  const spec = trimSpec(s);
  const args = ['-ss', String(s.trim.from), '-i', s.path, '-t', String(s.trim.to - s.trim.from), '-map', '0:v:0?', '-map', '0:a:0?', '-map_metadata', '-1', ...spec.args, to];
  const job = ff.run(args, { onProgress: onSeconds });
  setCancel?.(() => job.proc?.kill?.('SIGKILL'));
  await job.promise;
}

// Buffer som lages på nytt automatisk, og derfor ikke trengs i pakken.
const CACHE_FIELDS = ['proxy', 'thumbs', 'wave', 'reversed', 'motion', 'optimized'];

function safeName(name) {
  return (name || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled';
}

// Et navn som ikke finnes fra før i mappen (også blant navn vi allerede har brukt).
function uniquePath(dir, base, taken) {
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let name = base;
  let n = 2;
  while (taken.has(name.toLowerCase()) || fs.existsSync(path.join(dir, name))) name = `${stem} ${n++}${ext}`;
  taken.add(name.toLowerCase());
  return path.join(dir, name);
}

async function sizeOf(p) {
  try {
    const st = await fs.promises.stat(p);
    if (!st.isDirectory()) return st.size;
    let sum = 0;
    for (const f of await fs.promises.readdir(p)) sum += await sizeOf(path.join(p, f));
    return sum;
  } catch {
    return 0;
  }
}

// Størrelsen på filene, til oppsummeringen før pakkingen starter.
async function sizes(paths) {
  const out = {};
  for (const p of paths) out[p] = fs.existsSync(p) ? await sizeOf(p) : -1;
  return out;
}

const fmtBytes = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

/**
 * { project, files, dest, name, removed } fra grensesnittet. files er listen fra mediaFiles():
 * { mediaId, kind, name, dir?, sources: [{ key, path, field }] }.
 */
async function packageProject({ project, files, dest, name, removed }, ctx) {
  const p = JSON.parse(JSON.stringify(project));
  const root = uniquePath(dest, safeName(name), new Set());
  const footage = path.join(root, 'Footage');
  const recDir = path.join(root, 'Recordings');
  await fs.promises.mkdir(footage, { recursive: true });

  // Hva skal kopieres, og er det plass?
  const jobs = [];
  const missing = [];
  for (const f of files) {
    if (f.dir) {
      if (fs.existsSync(f.dir)) jobs.push({ f, from: f.dir, dir: true, size: await sizeOf(f.dir) });
      else missing.push(`${f.name}: ${f.dir}`);
      continue;
    }
    for (const s of f.sources) {
      if (!fs.existsSync(s.path)) {
        missing.push(`${f.name}: ${s.path}`);
        continue;
      }
      const size = (await fs.promises.stat(s.path)).size;
      // En kuttet del tar omtrent sin andel av filen (brukes til plass og fremdrift).
      if (s.trim) jobs.push({ f, s, from: s.path, trim: s.trim, size: Math.round(size * Math.min(1, (s.trim.to - s.trim.from) / Math.max(0.1, s.trim.total || s.trim.to))), seconds: s.trim.to - s.trim.from });
      else jobs.push({ f, s, from: s.path, size });
    }
  }
  const total = jobs.reduce((a, j) => a + j.size, 0);
  try {
    const st = await fs.promises.statfs(dest);
    if (st.bavail * st.bsize < total * 1.02 + 50e6) throw new Error(`Not enough free space. The package needs ${fmtBytes(total)}, but only ${fmtBytes(st.bavail * st.bsize)} is free.`);
  } catch (err) {
    if (err.message.startsWith('Not enough')) {
      await fs.promises.rm(root, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  // Kopier, og husk hvor hver fil havnet.
  const taken = { footage: new Set(), rec: new Set() };
  const moved = new Map();
  const log = [];
  let done = 0;
  for (const j of jobs) {
    if (ctx.isCanceled()) {
      await fs.promises.rm(root, { recursive: true, force: true }).catch(() => {});
      throw new Error('Canceled');
    }
    ctx.progress(total ? done / total : 0, `Copying ${path.basename(j.from)}`);
    if (j.dir) {
      await fs.promises.mkdir(recDir, { recursive: true });
      const to = uniquePath(recDir, path.basename(j.from), taken.rec);
      await fs.promises.cp(j.from, to, { recursive: true });
      moved.set(j.from, to);
      log.push(`${path.relative(root, to)}${path.sep}  (${fmtBytes(j.size)}, from ${j.from})`);
    } else if (j.trim) {
      const spec = trimSpec(j.s);
      const stem = path.basename(j.f.name, path.extname(j.f.name));
      const to = uniquePath(footage, `${stem}${spec.ext}`, taken.footage);
      await trimFile(j.s, to, (sec) => ctx.progress(total ? (done + j.size * Math.min(1, sec / j.seconds)) / total : 0, `Trimming ${j.f.name}`), ctx.setCancel);
      moved.set(`${j.from}|${j.trim.from}`, to);
      log.push(`${path.relative(root, to)}  (${(j.trim.to - j.trim.from).toFixed(1)} s from ${j.trim.from.toFixed(1)} s in ${j.from})`);
    } else if (!moved.has(j.from)) {
      const to = uniquePath(footage, path.basename(j.from), taken.footage);
      await fs.promises.copyFile(j.from, to);
      // Kontroll: kopien skal være like stor som originalen.
      if ((await fs.promises.stat(to)).size !== j.size) throw new Error(`The copy of ${j.from} is incomplete.`);
      moved.set(j.from, to);
      log.push(`${path.relative(root, to)}  (${fmtBytes(j.size)}, from ${j.from})`);
    }
    done += j.size;
  }

  // Pek prosjektet til kopiene, og fjern buffer som lages på nytt.
  for (const f of files) {
    const m = p.media[f.mediaId];
    if (!m) continue;
    delete m.offline;
    if (f.dir) {
      const to = moved.get(f.dir);
      if (!to) continue;
      m.path = to;
      for (const st of Object.values(m.streams || {})) if (st.path) st.path = path.join(to, path.relative(f.dir, st.path));
    } else if (moved.has(m.path)) m.path = moved.get(m.path);
    // Kuttede deler: strømmen pekes til sin del, og mediet til hoveddelen.
    for (const [key, st] of Object.entries(m.streams || {})) {
      if (!st.trim) continue;
      const to = moved.get(`${st.trim.source}|${st.trim.from}`);
      if (to) {
        st.path = to;
        if (key === 'main' || !m.streams.main) m.path = to;
      }
      delete st.trim;
      st.needsProxy = false;
    }
    for (const st of Object.values(m.streams || {})) {
      // Filer som ble kopiert, pekes til kopien. Resten av bufferfeltene fjernes.
      const kept = new Set();
      for (const field of ['path', ...CACHE_FIELDS]) {
        if (typeof st[field] === 'string' && moved.has(st[field])) {
          st[field] = moved.get(st[field]);
          kept.add(field);
        }
      }
      for (const field of CACHE_FIELDS) if (!kept.has(field)) delete st[field];
    }
  }
  p.name = path.basename(root);
  const file = path.join(root, `${path.basename(root)}.reccut`);
  await projects.save(null, p, file, { history: false });

  // Rapporten, som i After Effects.
  const lines = [
    `Reccut package report`,
    `Project: ${project.name}`,
    `Packaged: ${new Date().toLocaleString('en-GB')}`,
    `Folder: ${root}`,
    '',
    `${log.length} files and folders copied, ${fmtBytes(total)} in total.`,
    '',
    'Copied:',
    ...log.map((l) => `  ${l}`),
  ];
  if (removed) {
    lines.push('', 'Removed from the packaged project (the original project is not changed):');
    if (removed.clips?.length) lines.push(`  ${removed.clips.length} disabled or hidden clips: ${removed.clips.join(', ')}`);
    if (removed.media?.length) lines.push(`  ${removed.media.length} unused media: ${removed.media.join(', ')}`);
    if (removed.streams?.length) lines.push(`  ${removed.streams.length} switched off audio: ${removed.streams.join(', ')}`);
    if (removed.trimmed?.length) lines.push(`  ${removed.trimmed.length} files trimmed to the parts that are used: ${removed.trimmed.map((t) => `${t.name} (${t.parts} part${t.parts > 1 ? 's' : ''}, ${Math.round(t.saved)} s left out)`).join(', ')}`);
    if (!removed.clips?.length && !removed.media?.length && !removed.streams?.length && !removed.trimmed?.length) lines.push('  Nothing.');
  }
  if (missing.length) lines.push('', 'MISSING (could not be copied, shown as Media Offline):', ...missing.map((m) => `  ${m}`));
  lines.push(
    '',
    'Not included, made again automatically when the project is opened: thumbnails, waveforms, proxies, optimized media, reversed copies and motion analysis.',
    'Titles, captions, masks, effects and title templates are stored in the project file.'
  );
  await fs.promises.writeFile(path.join(root, 'Package Report.txt'), lines.join('\n'));
  ctx.progress(1, 'Done');
  return { file, root, copied: log.length, bytes: total, missing: missing.length };
}

module.exports = { packageProject, sizes };
