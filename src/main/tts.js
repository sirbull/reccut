// AI-stemmer i Voice Over Studio: Kokoro-82M (Apache 2.0) kjører lokalt og gratis, uten nøkkel.
// Ingenting lastes ned før brukeren ber om det. Alle filer er låst til en bestemt versjon og
// kontrolleres med sha256 (modellen) og sha512 (uttalepakken fra npm) før de tas i bruk.
// Uttalepakken (phonemizer.js) inneholder eSpeak NG, som er GPL. Den pakkes derfor aldri inn
// i installasjonsfilen, men hentes som et tillegg, på samme måte som Keystroke-tillegget.
const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const CATALOG = require('./ttsCatalog.json');

const PHONEMIZER_KEY = 'reccut-tts:phonemizer.js';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sri = (buf) => `sha512-${crypto.createHash('sha512').update(buf).digest('base64')}`;

// Leser én fil fra en npm-tarball (ustar, gzip). Bare vanlige filer, aldri lenker.
function untarFile(gz, wanted) {
  const tar = zlib.gunzipSync(gz);
  for (let o = 0; o + 512 <= tar.length; ) {
    const head = tar.subarray(o, o + 512);
    if (head.every((b) => b === 0)) break;
    const str = (a, b) => head.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const name = (str(345, 500) ? `${str(345, 500)}/` : '') + str(0, 100);
    const size = parseInt(str(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(head[156] || 48);
    if (name === wanted && (type === '0' || type === '\0')) return tar.subarray(o + 512, o + 512 + size);
    o += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

function createTts({ dir, fetchImpl = globalThis.fetch, catalog = CATALOG, onChange = () => {} }) {
  const model = catalog.model;
  const total = model.files.reduce((s, f) => s + f.size, 0) + catalog.phonemizer.size;
  let download = null; // { progress, ctrl }
  let installed = null; // null = ikke sjekket ennå

  const file = (rel) => path.join(dir, 'kokoro', ...rel.split('/'));
  const addonFile = () => path.join(dir, 'phonemizer.js');

  async function check() {
    try {
      const m = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8'));
      installed = m?.revision === model.revision && m?.phonemizer === catalog.phonemizer.version;
      if (installed) {
        // Rask sjekk av størrelser. Innholdet kontrolleres ved nedlasting.
        for (const f of model.files) if ((await fs.stat(file(f.path))).size !== f.size) installed = false;
        await fs.stat(addonFile());
      }
    } catch {
      installed = false;
    }
    return installed;
  }

  async function status() {
    if (installed === null) await check();
    const piper = {};
    for (const v of catalog.piper?.voices || []) piper[v.id] = { installed: await piperInstalled(v), downloading: piperDownloads.has(v.id), progress: piperDownloads.get(v.id)?.progress ?? 0 };
    return { installed, downloading: Boolean(download), progress: download?.progress ?? 0, sizeBytes: total, addonBytes: catalog.phonemizer.size, addon: await addonInstalled(), piper, license: catalog.phonemizer.license };
  }

  /* Uttaletillegget, delt av Kokoro og Piper */

  async function addonInstalled() {
    try {
      await fs.stat(addonFile());
      const mark = await fs.readFile(path.join(dir, 'addon.json'), 'utf8').then(JSON.parse, () => null);
      const kokoro = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8').then(JSON.parse, () => null);
      return mark?.version === catalog.phonemizer.version || kokoro?.phonemizer === catalog.phonemizer.version;
    } catch {
      return false;
    }
  }
  async function ensureAddon(signal) {
    if (await addonInstalled()) return 0;
    const tgz = await fetchBytes(catalog.phonemizer.tarball, signal);
    if (sri(tgz) !== catalog.phonemizer.integrity) throw new Error('The pronunciation add-on did not match its checksum.');
    const js = untarFile(tgz, catalog.phonemizer.entry);
    if (!js) throw new Error('The pronunciation add-on is incomplete.');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(addonFile() + '.tmp', js);
    await fs.rename(addonFile() + '.tmp', addonFile());
    await fs.writeFile(path.join(dir, 'addon.json'), JSON.stringify({ version: catalog.phonemizer.version }));
    return catalog.phonemizer.size;
  }

  /* Piper: én stemme per språk (norsk, svensk, dansk, tysk ...), lastet ned hver for seg */

  const piperDownloads = new Map();
  const piperVoice = (id) => (catalog.piper?.voices || []).find((v) => v.id === id) || null;
  const piperRoot = (v) => path.join(dir, 'piper', v.id);
  async function piperInstalled(v) {
    try {
      const mark = JSON.parse(await fs.readFile(path.join(piperRoot(v), 'verified.json'), 'utf8'));
      if (mark.revision !== catalog.piper.revision) return false;
      for (const f of v.files) if ((await fs.stat(path.join(piperRoot(v), path.basename(f.path)))).size !== f.size) return false;
      return true;
    } catch {
      return false;
    }
  }
  async function installPiper(id, onProgress = () => {}) {
    const v = piperVoice(id);
    if (!v) throw new Error('Unknown voice.');
    if (piperDownloads.has(id)) throw new Error('This voice is already downloading.');
    const ctrl = new AbortController();
    const d = { progress: 0, ctrl };
    piperDownloads.set(id, d);
    onChange();
    const total = v.sizeBytes + ((await addonInstalled()) ? 0 : catalog.phonemizer.size);
    let done = 0;
    const step = (n) => {
      done += n;
      d.progress = Math.min(1, done / total);
      onProgress(d.progress);
    };
    const staging = path.join(dir, `.staging-${crypto.randomBytes(4).toString('hex')}`);
    try {
      step(await ensureAddon(ctrl.signal));
      await fs.mkdir(staging, { recursive: true });
      for (const f of v.files) {
        if (ctrl.signal.aborted) throw new Error('Canceled');
        const buf = await fetchBytes(`https://huggingface.co/${catalog.piper.repository}/resolve/${catalog.piper.revision}/${f.path.split('/').map(encodeURIComponent).join('/')}`, ctrl.signal);
        if (buf.length !== f.size || sha256(buf) !== f.sha256) throw new Error(`${path.basename(f.path)} did not match its checksum.`);
        await fs.writeFile(path.join(staging, path.basename(f.path)), buf);
        step(f.size);
      }
      await fs.writeFile(path.join(staging, 'verified.json'), JSON.stringify({ revision: catalog.piper.revision, installed: Date.now() }));
      await fs.rm(piperRoot(v), { recursive: true, force: true });
      await fs.mkdir(path.dirname(piperRoot(v)), { recursive: true });
      await fs.rename(staging, piperRoot(v));
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      piperDownloads.delete(id);
      onChange();
    }
  }
  function cancelPiper(id) {
    piperDownloads.get(id)?.ctrl.abort(new Error('Canceled'));
  }
  async function removePiper(id) {
    const v = piperVoice(id);
    if (!v) return;
    cancelPiper(id);
    await fs.rm(piperRoot(v), { recursive: true, force: true });
    onChange();
  }

  async function fetchBytes(url, signal) {
    const res = await fetchImpl(url, { signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  }

  async function install(onProgress = () => {}) {
    if (download) throw new Error('The AI voices are already downloading.');
    const ctrl = new AbortController();
    download = { progress: 0, ctrl };
    onChange();
    let done = 0;
    const step = (n) => {
      done += n;
      download.progress = done / total;
      onProgress(download.progress);
    };
    const staging = path.join(dir, `.staging-${crypto.randomBytes(4).toString('hex')}`);
    try {
      await fs.mkdir(staging, { recursive: true });
      // Uttalepakken: npm-tarball låst med sha512, som i package-lock.
      const tgz = await fetchBytes(catalog.phonemizer.tarball, ctrl.signal);
      if (sri(tgz) !== catalog.phonemizer.integrity) throw new Error('The pronunciation add-on did not match its checksum.');
      const js = untarFile(tgz, catalog.phonemizer.entry);
      if (!js) throw new Error('The pronunciation add-on is incomplete.');
      await fs.writeFile(path.join(staging, 'phonemizer.js'), js);
      step(catalog.phonemizer.size);
      // Modellen og stemmene, fra en fast versjon.
      for (const f of model.files) {
        if (ctrl.signal.aborted) throw new Error('Canceled');
        const buf = await fetchBytes(`https://huggingface.co/${model.repository}/resolve/${model.revision}/${f.path}`, ctrl.signal);
        if (buf.length !== f.size || sha256(buf) !== f.sha256) throw new Error(`${f.path} did not match its checksum.`);
        const out = path.join(staging, 'kokoro', ...f.path.split('/'));
        await fs.mkdir(path.dirname(out), { recursive: true });
        await fs.writeFile(out, buf);
        step(f.size);
      }
      await fs.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ revision: model.revision, phonemizer: catalog.phonemizer.version, installed: Date.now() }));
      // Byttes inn til slutt, så en avbrutt nedlasting aldri etterlater en halv installasjon.
      await fs.rm(path.join(dir, 'kokoro'), { recursive: true, force: true });
      await fs.rename(path.join(staging, 'kokoro'), path.join(dir, 'kokoro'));
      await fs.rename(path.join(staging, 'phonemizer.js'), addonFile());
      await fs.rename(path.join(staging, 'manifest.json'), path.join(dir, 'manifest.json'));
      installed = true;
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      download = null;
      onChange();
    }
  }

  function cancel() {
    download?.ctrl.abort(new Error('Canceled'));
  }

  async function remove() {
    cancel();
    await fs.rm(path.join(dir, 'kokoro'), { recursive: true, force: true });
    await fs.rm(path.join(dir, 'manifest.json'), { force: true });
    // Uttaletillegget beholdes så lenge en Piper-stemme bruker det.
    const piperLeft = (await Promise.all((catalog.piper?.voices || []).map(piperInstalled))).some(Boolean);
    if (!piperLeft) {
      await fs.rm(addonFile(), { force: true });
      await fs.rm(path.join(dir, 'addon.json'), { force: true });
    } else await fs.writeFile(path.join(dir, 'addon.json'), JSON.stringify({ version: catalog.phonemizer.version }));
    installed = false;
    onChange();
  }

  // Filer til arbeidsvinduet: modellfilene (som Transformers.js ber om med adressen sin) og uttalepakken.
  async function readModelFile(key) {
    if (key === PHONEMIZER_KEY) return (await addonInstalled()) ? new Uint8Array(await fs.readFile(addonFile())) : null;
    const piperFile = await readPiperFile(key);
    if (piperFile) return piperFile;
    if (installed === null) await check();
    if (!installed) return null;
    let url;
    try {
      url = new URL(key);
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co') return null;
    const prefix = [`/${model.repository}/resolve/${model.revision}/`, `/${model.repository}/resolve/main/`].find((p) => url.pathname.startsWith(p));
    if (!prefix) return null;
    const name = decodeURIComponent(url.pathname.slice(prefix.length));
    if (!model.files.some((f) => f.path === name)) return null;
    return new Uint8Array(await fs.readFile(file(name)));
  }

  // Piper-filer: bare filene i katalogen, for stemmer som er lastet ned.
  async function readPiperFile(key) {
    if (!catalog.piper) return null;
    let url;
    try {
      url = new URL(key);
    } catch {
      return null;
    }
    const prefix = `/${catalog.piper.repository}/resolve/${catalog.piper.revision}/`;
    if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co' || !url.pathname.startsWith(prefix)) return null;
    const rel = decodeURIComponent(url.pathname.slice(prefix.length));
    const v = (catalog.piper.voices || []).find((x) => x.files.some((f) => f.path === rel));
    if (!v || !(await piperInstalled(v))) return null;
    return new Uint8Array(await fs.readFile(path.join(piperRoot(v), path.basename(rel))));
  }

  return { status, install, cancel, remove, installPiper, cancelPiper, removePiper, piperVoice, readModelFile, check, PHONEMIZER_KEY, repository: model.repository, revision: model.revision, piper: catalog.piper };
}

module.exports = { createTts, untarFile, PHONEMIZER_KEY, CATALOG };
