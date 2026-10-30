// Prosjekter: hvert prosjekt har sin egen mappe med prosjektfilen og undermapper for media.
// Eldre prosjekter (bare en fil i Filmer/OBSlite/Projects) kan fortsatt åpnes.
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const SUBDIRS = { media: 'Media', recordings: 'Recordings', optimized: 'Optimized Media', exports: 'Exports' };

function legacyDir(base) {
  return path.join(base, 'Projects');
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
  const file = path.join(dir, `${path.basename(dir)}.obslite`);
  await touchRecent(file);
  return { file, dir, name: path.basename(dir) };
}

// Mappene et prosjekt bruker. Eldre prosjekter uten egen mappe bruker felles mapper i basismappen.
async function folders(base, file) {
  const own = file && !path.dirname(file).startsWith(legacyDir(base));
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
  const dir = legacyDir(base);
  if (fs.existsSync(dir)) for (const f of await fs.promises.readdir(dir)) if (f.endsWith('.obslite')) files.add(path.join(dir, f));
  const out = [];
  for (const f of files) out.push(await info(f).catch(() => null));
  return out.filter(Boolean).sort((a, b) => b.modified - a.modified);
}

async function load(file) {
  const data = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  await touchRecent(file);
  return data;
}

// Lagrer atomisk, slik at et krasj midt i lagringen ikke ødelegger prosjektet.
async function save(base, project, file) {
  if (!file) file = (await create(path.join(base), project.name)).file;
  const tmp = file + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(project));
  await fs.promises.rename(tmp, file);
  return file;
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

module.exports = { list, load, save, create, folders, forget, trash, touchRecent };
