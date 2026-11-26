// .reccut-brand files: one Brand profile with its titles, lower thirds, effect presets, Design
// elements and logo. Images are embedded, so the file works on another computer.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IMAGE = /^\.(png|jpe?g|webp|svg|gif|bmp|avif)$/i;
const MAX_IMAGE = 50 * 1024 * 1024;
const MAX_FILE = 400 * 1024 * 1024;
const REF = 'reccut-brand:';
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Every image record in the Design elements (assets and Edit media), as [record] objects to rewrite.
function imageRecords(pack) {
  const out = [];
  for (const element of Array.isArray(pack.elements) ? pack.elements : []) {
    for (const group of [element.assets, element.media]) {
      if (!plain(group)) continue;
      for (const record of Object.values(group)) if (plain(record)) out.push(record);
    }
  }
  return out;
}

async function exportBrandPack(file, pack, logo = null) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Choose where to save the Brand file.');
  if (!plain(pack) || pack.format !== 'reccut-brand') throw new Error('Nothing to export.');
  const out = structuredClone(pack), files = {}, seen = new Map();
  const embed = async (source) => {
    if (seen.has(source)) return seen.get(source);
    if (typeof source !== 'string' || !path.isAbsolute(source) || !IMAGE.test(path.extname(source))) return null;
    const stat = await fs.promises.stat(source).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_IMAGE) return null;
    const key = `f${seen.size + 1}`;
    files[key] = { name: path.basename(source), data: (await fs.promises.readFile(source)).toString('base64') };
    seen.set(source, key);
    return key;
  };
  let missing = 0;
  for (const record of imageRecords(out)) {
    if (typeof record.path !== 'string' || record.path.startsWith('data:')) continue;
    const key = await embed(record.path);
    if (key) record.path = `${REF}${key}`;
    else { missing++; record.path = ''; record.missing = true; }
  }
  if (logo?.path) {
    const key = await embed(logo.path);
    if (key) out.logo = { name: String(logo.name || 'My Logo').slice(0, 200), file: key };
  }
  out.files = files;
  const temporary = `${file}.tmp`;
  await fs.promises.writeFile(temporary, JSON.stringify(out));
  await fs.promises.rename(temporary, file);
  return { images: Object.keys(files).length, missing };
}

// Reads a Brand file and writes its images to dir. Gives the pack with absolute image paths,
// and the logo as { path, name } for the new profile.
async function importBrandPack(file, dir) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new Error('Choose a Brand file.');
  const stat = await fs.promises.stat(file);
  if (stat.size > MAX_FILE) throw new Error('The Brand file is too large.');
  let pack;
  try { pack = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { throw new Error('The Brand file is not valid.'); }
  if (!plain(pack) || pack.format !== 'reccut-brand') throw new Error('This is not a Reccut Brand file.');
  const files = plain(pack.files) ? pack.files : {}, written = new Map();
  const target = path.join(dir, crypto.randomUUID());
  const write = async (key) => {
    if (written.has(key)) return written.get(key);
    const entry = files[key];
    const ext = path.extname(String(entry?.name || '')).toLowerCase();
    if (!plain(entry) || typeof entry.data !== 'string' || !IMAGE.test(ext)) return null;
    const data = Buffer.from(entry.data, 'base64');
    if (!data.length || data.length > MAX_IMAGE) return null;
    await fs.promises.mkdir(target, { recursive: true });
    const stem = path.basename(String(entry.name), ext).replace(/[^\w .-]/g, '_').slice(0, 80) || 'image';
    let out = path.join(target, `${stem}${ext}`), n = 2;
    while (fs.existsSync(out)) out = path.join(target, `${stem} ${n++}${ext}`);
    await fs.promises.writeFile(out, data);
    written.set(key, out);
    return out;
  };
  for (const record of imageRecords(pack)) {
    if (typeof record.path !== 'string' || !record.path.startsWith(REF)) { if (typeof record.path === 'string' && !record.path.startsWith('data:')) { record.path = ''; record.missing = true; } continue; }
    const out = await write(record.path.slice(REF.length));
    if (out) { record.path = out; record.copied = true; record.missing = false; }
    else { record.path = ''; record.missing = true; }
  }
  const logoPath = pack.logo ? await write(pack.logo.file) : null;
  delete pack.files;
  pack.logo = logoPath ? { path: logoPath, name: String(pack.logo.name || 'My Logo').slice(0, 200) } : null;
  return pack;
}

module.exports = { exportBrandPack, importBrandPack };
