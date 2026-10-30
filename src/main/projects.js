// Prosjekter lagres som JSON-filer i Filmer/OBSlite/Prosjekter.
const fs = require('fs');
const path = require('path');

function projectsDir(base) {
  return path.join(base, 'Prosjekter');
}

async function list(base) {
  const dir = projectsDir(base);
  await fs.promises.mkdir(dir, { recursive: true });
  const files = (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.obslite'));
  const out = [];
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const st = await fs.promises.stat(full);
      const data = JSON.parse(await fs.promises.readFile(full, 'utf8'));
      out.push({ id: data.id, name: data.name, path: full, modified: st.mtimeMs, duration: data.duration || 0 });
    } catch {}
  }
  return out.sort((a, b) => b.modified - a.modified);
}

async function load(file) {
  return JSON.parse(await fs.promises.readFile(file, 'utf8'));
}

function safeName(name) {
  return (name || 'Uten navn').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Uten navn';
}

// Lagrer atomisk, slik at et krasj midt i lagringen ikke ødelegger prosjektet.
async function save(base, project, previousPath) {
  const dir = projectsDir(base);
  await fs.promises.mkdir(dir, { recursive: true });
  let file = previousPath;
  const wanted = path.join(dir, `${safeName(project.name)}.obslite`);
  if (!file || path.basename(file) !== path.basename(wanted)) {
    file = wanted;
    let n = 2;
    while (fs.existsSync(file) && file !== previousPath) {
      const existing = await load(file).catch(() => null);
      if (existing?.id === project.id) break;
      file = path.join(dir, `${safeName(project.name)} ${n++}.obslite`);
    }
  }
  const tmp = file + '.tmp';
  await fs.promises.writeFile(tmp, JSON.stringify(project));
  await fs.promises.rename(tmp, file);
  if (previousPath && previousPath !== file && fs.existsSync(previousPath)) {
    await fs.promises.unlink(previousPath).catch(() => {});
  }
  return file;
}

async function remove(file) {
  await fs.promises.unlink(file).catch(() => {});
}

module.exports = { list, load, save, remove, projectsDir };
