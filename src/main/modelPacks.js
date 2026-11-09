// Modeller som lastes ned når de trengs, i stedet for å følge med installasjonsfilen.
// Hver modell har faste filer med SHA-256. Filene legges i en midlertidig mappe og byttes inn
// først når alt stemmer, så en avbrutt nedlasting aldri etterlater en halv modell.
// Mappen er <dir>/<modell-id>/<fil>, som Transformers.js leser med env.localModelPath.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function createModelPacks({ dir, models, fetchImpl = globalThis.fetch, onChange = () => {} }) {
  const downloads = new Map(); // id -> { progress, ctrl }
  const known = new Map(); // id -> true/false
  const model = (id) => {
    const m = models.find((x) => x.id === id);
    if (!m) throw new Error('Unknown model.');
    return m;
  };
  const root = (m) => path.join(dir, ...m.id.split('/'));
  const marker = (m) => path.join(root(m), '.reccut-verified.json');

  // Rask sjekk ved oppstart: merket fra nedlastingen og at filene finnes med riktig størrelse.
  async function isInstalled(m) {
    try {
      const mark = JSON.parse(await fs.readFile(marker(m), 'utf8'));
      if (mark.revision !== m.revision) return false;
      for (const f of m.files) {
        const st = await fs.stat(path.join(root(m), ...f.file.split('/')));
        if (!st.isFile() || (mark.sizes?.[f.file] != null && st.size !== mark.sizes[f.file])) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async function status() {
    const out = [];
    for (const m of models) {
      if (!known.has(m.id)) known.set(m.id, await isInstalled(m));
      const d = downloads.get(m.id);
      out.push({ id: m.id, label: m.label, description: m.description, gpu: Boolean(m.gpu), license: m.license, sizeBytes: m.sizeBytes, installed: known.get(m.id), downloading: Boolean(d), progress: d?.progress ?? 0 });
    }
    return out;
  }
  const installed = async (id) => {
    await status();
    return Boolean(known.get(id));
  };

  async function install(id, onProgress = () => {}) {
    const m = model(id);
    if (downloads.has(id)) throw new Error('This model is already downloading.');
    const ctrl = new AbortController();
    const d = { progress: 0, ctrl };
    downloads.set(id, d);
    onChange();
    const total = m.files.reduce((s, f) => s + (f.size || 0), 0) || 1;
    let done = 0;
    const staging = path.join(dir, `.staging-${crypto.randomBytes(4).toString('hex')}`);
    try {
      const sizes = {};
      for (const f of m.files) {
        if (ctrl.signal.aborted) throw new Error('Canceled');
        const res = await fetchImpl(f.url, { signal: ctrl.signal, redirect: 'follow' });
        if (!res.ok) throw new Error(`Download failed (${res.status}).`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (sha256(buf) !== f.sha256) throw new Error(`${f.file} did not match its checksum.`);
        const out = path.join(staging, ...f.file.split('/'));
        await fs.mkdir(path.dirname(out), { recursive: true });
        await fs.writeFile(out, buf);
        sizes[f.file] = buf.length;
        done += f.size || buf.length;
        d.progress = Math.min(1, done / total);
        onProgress(d.progress);
      }
      await fs.writeFile(path.join(staging, '.reccut-verified.json'), JSON.stringify({ revision: m.revision, sizes, installed: Date.now() }));
      await fs.rm(root(m), { recursive: true, force: true });
      await fs.mkdir(path.dirname(root(m)), { recursive: true });
      await fs.rename(staging, root(m));
      known.set(id, true);
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
      downloads.delete(id);
      onChange();
    }
  }

  function cancel(id) {
    downloads.get(id)?.ctrl.abort(new Error('Canceled'));
  }

  async function remove(id) {
    const m = model(id);
    cancel(id);
    await fs.rm(root(m), { recursive: true, force: true });
    known.set(id, false);
    onChange();
  }

  return { dir, status, installed, install, cancel, remove };
}

module.exports = { createModelPacks };
