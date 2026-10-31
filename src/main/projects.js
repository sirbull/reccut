// Prosjekter: hvert prosjekt har sin egen mappe med prosjektfilen og undermapper for media.
// Eldre prosjekter (bare en fil i en felles Projects-mappe, og prosjekter fra da appen het
// OBSlite, med endelsen .obslite) kan fortsatt åpnes.
const LEGACY_NAME = 'OBSlite';
const EXTENSIONS = ['.reccut', '.obslite'];
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const SUBDIRS = { media: 'Media', recordings: 'Recordings', optimized: 'Optimized Media', exports: 'Exports' };

function legacyDir(base) {
  return path.join(base, 'Projects');
}

// Felles prosjektmapper: i Reccut-mappen og i den gamle OBSlite-mappen.
function legacyDirs(base) {
  return [legacyDir(base), path.join(path.dirname(base), LEGACY_NAME, 'Projects')];
}

function recentFile() {
  return path.join(app.getPath('userData'), 'recent-projects.json');
}

async function readRecent() {
  try {
    return JSON.parse(await fs.promises.readFile(recentFile(), 'utf8'));
  } catch {
    return [];
  }
}

async function writeRecent(list) {
  await fs.promises.writeFile(recentFile(), JSON.stringify(list.slice(0, 40)));
}

async function touchRecent(file) {
  const list = (await readRecent()).filter((f) => f !== file);
  await writeRecent([file, ...list]);
}

function safeName(name) {
  return (name || 'Untitled').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled';
}

// Lager prosjektmappen. Finnes navnet fra før, får den et nummer.
async function create(location, name) {
  await fs.promises.mkdir(location, { recursive: true });
  let dir = path.join(location, safeName(name));
  let n = 2;
  while (fs.existsSync(dir)) dir = path.join(location, `${safeName(name)} ${n++}`);
  await fs.promises.mkdir(dir, { recursive: true });
  for (const sub of Object.values(SUBDIRS)) await fs.promises.mkdir(path.join(dir, sub), { recursive: true });
  const file = path.join(dir, `${path.basename(dir)}.reccut`);
  await touchRecent(file);
  return { file, dir, name: path.basename(dir) };
}

// Mappene et prosjekt bruker. Eldre prosjekter uten egen mappe bruker felles mapper i basismappen.
async function folders(base, file) {
  const own = file && !legacyDirs(base).some((d) => path.dirname(file).startsWith(d));
  const root = own ? path.dirname(file) : base;
  const out = { root, own };
  for (const [key, sub] of Object.entries(SUBDIRS)) {
    out[key] = path.join(root, sub);
    await fs.promises.mkdir(out[key], { recursive: true }).catch(() => {});
  }
  return out;
}

async function info(file) {
  const st = await fs.promises.stat(file);
  const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  return { id: data.id, name: data.name, path: file, folder: path.dirname(file), modified: st.mtimeMs, duration: data.duration || 0 };
}

async function list(base) {
  const files = new Set((await readRecent()).filter((f) => fs.existsSync(f)));
  for (const dir of legacyDirs(base)) {
    if (fs.existsSync(dir)) for (const f of await fs.promises.readdir(dir)) if (EXTENSIONS.some((e) => f.endsWith(e))) files.add(path.join(dir, f));
  }
  const out = [];
  for (const f of files) out.push(await info(f).catch(() => null));
  return out.filter(Boolean).sort((a, b) => b.modified - a.modified);
}

// Stier til bufferen (miniatyrbilder, lydbølger, kopier) i den gamle OBSlite-mappen pekes til den nye.
function fixOldPaths(text) {
  const oldData = path.join(app.getPath('appData'), LEGACY_NAME);
  const newData = app.getPath('userData');
  const esc = (p) => JSON.stringify(p).slice(1, -1);
  return text.split(esc(oldData + path.sep)).join(esc(newData + path.sep));
}

// Hver mediefil lagres også med en sti i forhold til prosjektfilen. Er prosjektmappen flyttet
// eller kopiert (for eksempel en pakket mappe på en annen maskin), finnes filene likevel.
const LINK_FIELDS = ['path', 'proxy', 'optimized', 'reversed', 'motion', 'wave'];

function addRelative(project, dir) {
  for (const m of Object.values(project.media || {})) {
    if (m.path) m.rel = path.relative(dir, m.path);
    for (const st of Object.values(m.streams || {})) {
      st.rel = {};
      for (const f of LINK_FIELDS) if (typeof st[f] === 'string') st.rel[f] = path.relative(dir, st[f]);
    }
  }
}

function resolveRelative(project, dir) {
  const fix = (abs, rel) => {
    if (!rel || (abs && fs.existsSync(abs))) return abs;
    const cand = path.resolve(dir, rel.split(/[\\/]/).join(path.sep));
    return fs.existsSync(cand) ? cand : abs;
  };
  for (const m of Object.values(project.media || {})) {
    m.path = fix(m.path, m.rel);
    for (const st of Object.values(m.streams || {})) {
      for (const f of LINK_FIELDS) if (st.rel?.[f]) st[f] = fix(st[f], st.rel[f]);
      // Buffer som mangler (tømt buffer eller ny maskin), fjernes så den lages på nytt.
      for (const f of ['proxy', 'optimized', 'reversed', 'motion', 'wave']) if (typeof st[f] === 'string' && !fs.existsSync(st[f])) delete st[f];
      if (st.thumbs?.files?.length && !fs.existsSync(st.thumbs.files[0])) delete st.thumbs;
    }
  }
}

async function load(file) {
  const data = JSON.parse(fixOldPaths(await fs.promises.readFile(file, 'utf8')));
  resolveRelative(data, path.dirname(file));
  await touchRecent(file);
  return data;
}

// Lagrer atomisk, slik at et krasj midt i lagringen ikke ødelegger prosjektet.
async function save(base, project, file) {
  if (!file) file = (await create(path.join(base), project.name)).file;
  const tmp = file + '.tmp';
  const data = JSON.parse(JSON.stringify(project));
  addRelative(data, path.dirname(file));
  await fs.promises.writeFile(tmp, JSON.stringify(data));
  await fs.promises.rename(tmp, file);
  return file;
}

// Lagre som: en ny prosjektmappe med nytt navn og sted. Media blir der de er.
async function saveAs(project, location, name) {
  const created = await create(location, name);
  const p = { ...project, name: created.name };
  await save(null, p, created.file);
  return { file: created.file, name: created.name };
}

async function forget(file) {
  await writeRecent((await readRecent()).filter((f) => f !== file));
}

// Flytter prosjektet til papirkurven: hele mappen for nye prosjekter, bare filen for eldre.
async function trash(base, file) {
  const f = await folders(base, file);
  await forget(file);
  await shell.trashItem(f.own ? f.root : file).catch(() => fs.promises.unlink(file).catch(() => {}));
}

module.exports = { list, load, save, saveAs, create, folders, forget, trash, touchRecent };
