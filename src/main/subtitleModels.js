// Main-process registry. Network access occurs only in downloadModel(), never in init().
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const catalog = require('./subtitleCatalog');

async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const canceled = () => new Error('Canceled');
const required = new Set(['config.json', 'generation_config.json', 'tokenizer.json', 'tokenizer_config.json', 'preprocessor_config.json']);

class SubtitleModelManager {
  constructor({ dir, bundleDir, legacyDir, models = catalog, fetchImpl = globalThis.fetch, freeSpace, onChange = () => {}, unload = () => {}, ram = os.totalmem(), platform = process.platform, arch = process.arch, timeoutMs = 30000 }) {
    Object.assign(this, { dir, bundleDir, legacyDir, models, fetchImpl, onChange, unload, ram, platform, arch, timeoutMs });
    this.freeSpace = freeSpace || (async () => { const s = await fs.statfs(dir); return s.bavail * s.bsize; });
    this.installed = new Map(); this.downloads = new Map(); this.states = new Map(); this.leases = new Map();
    this.active = 'whisper-base'; this.writes = Promise.resolve(); this.mutations = Promise.resolve(); this.closed = false;
    this.ready = this.init();
  }
  model(id) { const m = this.models.find(m => m.id === id); if (!m) throw new Error('Unknown subtitle model.'); return m; }
  compatible(m) { return m.compatiblePlatforms.includes(this.platform) && m.minimumRequirements.arch.includes(this.arch) && this.ram >= m.minimumRequirements.ramGB * 1024 ** 3; }
  legacyPath(m, file) { return path.join(this.legacyDir, crypto.createHash('sha1').update(`https://huggingface.co/${m.repository}/resolve/main/${file.path}`).digest('hex')); }
  async validate(m, root, source = 'managed', profile = 'cpu') {
    try { const stat = await fs.lstat(root); if (!stat.isDirectory() || stat.isSymbolicLink()) return null; } catch { return null; }
    const specs = source === 'legacy' ? [...m.files.filter(f => required.has(f.path)), ...(profile === 'gpu' ? m.legacyGpuFiles || [] : m.files.filter(f => f.path.startsWith('onnx/')))] : m.files;
    if (!specs.some(f => f.path.startsWith('onnx/'))) return null;
    let size = 0;
    for (const f of specs) {
      const file = source === 'legacy' ? this.legacyPath(m, f) : path.join(root, f.path);
      try {
        const realRoot = await fs.realpath(root), realFile = await fs.realpath(file);
        if (!realFile.startsWith(realRoot + path.sep)) return null;
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== f.size || await digest(file) !== f.sha256) return null;
        size += stat.size;
      } catch { return null; }
    }
    return { id: m.id, name: m.name, family: m.family, version: m.version, backend: m.backend, localPath: root, installedSizeBytes: size, expectedDownloadSize: m.downloadSizeBytes, status: 'installed', sourceRepository: m.repository, source, profile, integrity: specs.map(f => ({ path: f.path, size: f.size, sha256: f.sha256 })) };
  }
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    let previous = {};
    try { previous = JSON.parse(await fs.readFile(path.join(this.dir, 'manifest.json'), 'utf8')); } catch {}
    if (!previous || typeof previous !== 'object') previous = {};
    if (!Array.isArray(previous.installed)) previous.installed = [];
    // Staging names are generated internally. Never follow manifest-provided paths.
    for (const name of await fs.readdir(this.dir)) if (/^\.staging-[a-z0-9-]+$/.test(name)) await fs.rm(path.join(this.dir, name), { recursive: true, force: true });
    for (const m of this.models) {
      let record = null;
      if (m.bundled && this.bundleDir) record = await this.validate(m, path.join(this.bundleDir, m.id), 'bundled');
      record ||= await this.validate(m, path.join(this.dir, m.id));
      if (!record && this.legacyDir && ['whisper-base', 'whisper-small'].includes(m.id)) {
        record = await this.validate(m, this.legacyDir, 'legacy');
        record ||= await this.validate(m, this.legacyDir, 'legacy', 'gpu');
      }
      if (record?.profile === 'cpu' && this.legacyDir && m.legacyGpuFiles?.length === 2) {
        const gpu = await this.validate(m, this.legacyDir, 'legacy', 'gpu');
        if (gpu) record.gpu = gpu;
      }
      if (record) this.installed.set(m.id, record);
      else if (previous.installed.some(r => r?.id === m.id)) this.states.set(m.id, { status: 'failed', error: 'Model files are missing or failed integrity verification. Download again to repair.' });
    }
    if (this.installed.has(previous.active) && this.compatible(this.model(previous.active))) this.active = previous.active;
    await this.persist(); this.emit();
  }
  persist() {
    const data = JSON.stringify({ schema: 1, active: this.active, installed: [...this.installed.values()].map(record => ({ ...record, installedSizeBytes: this.recordSize(record) })) }, null, 2);
    this.writes = this.writes.catch(() => {}).then(async () => {
      const file = path.join(this.dir, 'manifest.json');
      await fs.writeFile(file + '.tmp', data); await fs.rename(file + '.tmp', file);
    });
    return this.writes;
  }
  snapshot() {
    return { active: this.installed.has(this.active) ? this.active : null, storageBytes: [...this.installed.values()].reduce((s, r) => s + this.recordSize(r), 0), hardware: { platform: this.platform, arch: this.arch, ramGB: Math.round(this.ram / 1024 ** 3), backend: 'Local ONNX · CPU; existing WebGPU installations supported' }, models: this.models.map(m => {
      const record = this.installed.get(m.id), state = this.states.get(m.id), compatible = this.compatible(m);
      return { ...m, files: undefined, legacyGpuFiles: undefined, installedSizeBytes: record && this.recordSize(record), installed: Boolean(record), usable: Boolean(record) && compatible, inUse: Boolean(this.leases.get(m.id)), removable: m.removable && record?.source !== 'bundled', status: state?.status || (!compatible ? 'unsupported' : record ? (this.active === m.id ? 'active' : 'installed') : 'not-installed'), ...state };
    }) };
  }
  recordSize(record) {
    const files = new Map(), model = this.model(record.id);
    for (const r of [record, record.gpu].filter(Boolean)) for (const f of r.integrity) files.set(r.source === 'legacy' ? this.legacyPath(model, f) : path.join(r.localPath, f.path), f.size);
    return [...files.values()].reduce((total, bytes) => total + bytes, 0);
  }
  emit() { this.onChange(this.snapshot()); }
  async listAvailableModels() { await this.ready; return this.snapshot(); }
  async getActiveModel() { await this.ready; return this.active; }
  async setActiveModel(id) {
    await this.ready; const m = this.model(id);
    if (!this.installed.has(id) || !this.compatible(m)) throw new Error('Install a compatible model before selecting it.');
    this.active = id; await this.persist(); await this.unload(); this.emit(); return this.snapshot();
  }
  async acquireActiveModel() {
    await this.ready;
    let id = this.active, m = this.model(id), r = this.installed.get(id);
    // Revalidate at use as files can disappear while the app is open.
    if (r && !await this.validate(m, r.localPath, r.source, r.profile)) { this.installed.delete(id); r = null; }
    if (!r) {
      id = this.models.find(m => m.bundled)?.id; m = this.model(id); r = this.installed.get(id);
      if (r && !await this.validate(m, r.localPath, r.source, r.profile)) { this.installed.delete(id); r = null; }
      this.active = id; await this.persist(); this.emit();
    }
    if (!r) throw new Error('Install Whisper Base in Settings → AI → Manage Models before generating captions.');
    if (!this.compatible(m)) throw new Error('This model requires more memory or a supported device. Select a smaller model.');
    if (r.gpu && !await this.validate(m, r.gpu.localPath, r.gpu.source, 'gpu')) delete r.gpu;
    this.leases.set(id, (this.leases.get(id) || 0) + 1); this.emit();
    let released = false;
    return { model: { id, repository: m.repository, version: m.version, profile: r.profile, legacyGpu: Boolean(r.gpu), cpuAvailable: r.profile === 'cpu' }, release: () => { if (released) return; released = true; this.leases.set(id, this.leases.get(id) - 1); this.emit(); } };
  }
  async readModelFile(key) {
    let url; try { url = new URL(key); } catch { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'huggingface.co') return null;
    for (const m of this.models) {
      // Transformers.js v4's tokenizer metadata probe does not forward revision.
      // Its `main` lookup is an OFFLINE alias to these exact verified pinned bytes.
      const prefix = [`/${m.repository}/resolve/${m.version}/`, `/${m.repository}/resolve/main/`].find(prefix => url.pathname.startsWith(prefix));
      if (!prefix) continue;
      await this.ready;
      const name = url.pathname.slice(prefix.length), record = this.installed.get(m.id);
      const r = [record, record?.gpu].find(r => r?.integrity.some(f => f.path === name));
      if (!r) return null;
      const spec = r.integrity.find(f => f.path === name);
      const file = r.source === 'legacy' ? this.legacyPath(m, spec) : path.join(r.localPath, name);
      return new Uint8Array(await fs.readFile(file));
    }
    return null;
  }
  async downloadModel(id) {
    await this.ready; const m = this.model(id);
    if (this.closed) throw new Error('Application is shutting down.');
    if (!this.compatible(m)) throw new Error('Unsupported on this device. Choose a smaller model.');
    if (this.downloads.has(id)) return this.snapshot();
    if (this.installed.has(id)) {
      const record = this.installed.get(id);
      if (await this.validate(m, record.localPath, record.source, record.profile)) return this.snapshot();
      this.installed.delete(id); this.emit();
    }
    if (this.downloads.has(id)) return this.snapshot();
    if (this.leases.get(id)) throw new Error('This model is in use. Wait or cancel the transcription before repairing it.');
    if (this.downloads.size >= 2) throw new Error('Two models are already downloading. Wait or cancel one first.');
    const control = new AbortController();
    // Reserve space synchronously before the first disk query so concurrent downloads cannot overcommit.
    const operation = { control, reserved: m.downloadSizeBytes, done: null };
    this.downloads.set(id, operation);
    this.states.set(id, { status: 'downloading', downloadedBytes: 0, totalBytes: m.downloadSizeBytes, bytesPerSecond: 0 }); this.emit();
    operation.done = this.install(m, operation).finally(() => { this.downloads.delete(id); this.emit(); });
    operation.done.catch(() => {});
    return this.snapshot();
  }
  async install(m, operation) {
    const { control } = operation, signal = control.signal;
    const staging = path.join(this.dir, `.staging-${m.id}`);
    try {
      const reserved = [...this.downloads.values()].reduce((n, d) => n + d.reserved, 0);
      if (await this.freeSpace() < reserved + 64 * 1024 ** 2) throw new Error('Insufficient free disk space for this model. Free some space and retry.');
      if (signal.aborted) throw canceled();
      await fs.mkdir(staging, { recursive: true });
      let completed = 0, lastEmit = 0; const started = Date.now();
      for (const file of m.files) {
        if (signal.aborted) throw canceled();
        const target = path.join(staging, file.path); await fs.mkdir(path.dirname(target), { recursive: true });
        let succeeded = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const timeout = new AbortController(); let timer;
          const resetTimer = () => { clearTimeout(timer); timer = setTimeout(() => timeout.abort(new Error('Download timed out.')), this.timeoutMs); timer.unref?.(); };
          let handle;
          try {
            resetTimer();
            const response = await this.fetchImpl(file.url, { signal: AbortSignal.any([signal, timeout.signal]) });
            if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}). Retry when your connection is available.`);
            handle = await fs.open(target, 'w'); const hash = crypto.createHash('sha256'); let count = 0;
            for await (const chunk of response.body) {
              if (signal.aborted) throw canceled(); resetTimer();
              const bytes = Buffer.from(chunk); count += bytes.length;
              if (count > file.size) throw new Error('Downloaded file exceeds verified size.');
              hash.update(bytes); await handle.writeFile(bytes);
              const now = Date.now();
              if (now - lastEmit >= 150) {
                this.states.set(m.id, { status: 'downloading', downloadedBytes: completed + count, totalBytes: m.downloadSizeBytes, bytesPerSecond: (completed + count) / Math.max(0.001, (now - started) / 1000) }); this.emit(); lastEmit = now;
              }
            }
            if (count !== file.size || hash.digest('hex') !== file.sha256) throw new Error('Model integrity verification failed. Retry the download.');
            succeeded = true; break;
          } catch (e) {
            if (signal.aborted) throw canceled();
            if (attempt === 2 || /integrity|verified size|ENOSPC/.test(e.message)) throw e;
          } finally { clearTimeout(timer); await handle?.close(); }
        }
        if (!succeeded) throw new Error('Download failed.');
        completed += file.size;
      }
      this.states.set(m.id, { status: 'installing', downloadedBytes: completed, totalBytes: m.downloadSizeBytes }); this.emit();
      const record = await this.validate(m, staging);
      if (!record) throw new Error('Model integrity verification failed.');
      if (signal.aborted || this.closed) throw canceled();
      const destination = path.join(this.dir, m.id);
      // Only a known, invalid application-managed installation can be replaced.
      await fs.rm(destination, { recursive: true, force: true });
      await fs.rename(staging, destination);
      record.localPath = destination; this.installed.set(m.id, record); this.states.delete(m.id);
      await this.persist();
    } catch (e) {
      this.states.set(m.id, signal.aborted ? { status: 'not-installed' } : { status: 'failed', error: String(e.message || e) });
      throw e;
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
  async cancelDownload(id) {
    await this.ready; const operation = this.downloads.get(id);
    if (operation) { operation.control.abort(); await operation.done.catch(() => {}); }
    return this.snapshot();
  }
  async removeModel(id) {
    await this.ready; const m = this.model(id), r = this.installed.get(id);
    if (!m.removable || r?.source === 'bundled') throw new Error('The default Whisper Base model is protected.');
    if (this.active === id) throw new Error('Select another installed model before deleting this model.');
    if (this.leases.get(id)) throw new Error('This model is being used by a transcription. Wait or cancel the task first.');
    if (this.downloads.has(id)) throw new Error('Cancel the download before deleting this model.');
    await this.unload();
    if (r?.source === 'legacy') for (const f of r.integrity) await fs.rm(this.legacyPath(m, f), { force: true });
    else if (r) await fs.rm(path.join(this.dir, id), { recursive: true, force: true });
    if (r?.gpu) for (const f of r.gpu.integrity) await fs.rm(this.legacyPath(m, f), { force: true });
    this.installed.delete(id); this.states.delete(id); await this.persist(); this.emit(); return this.snapshot();
  }
  async shutdown() {
    this.closed = true;
    for (const d of this.downloads.values()) d.control.abort();
    await this.ready.catch(() => {});
    await Promise.allSettled([...this.downloads.values()].map(d => d.done)); await this.mutations; await this.writes;
  }
}
// Keep selection, lease acquisition and deletion serialized across asynchronous disk
// verification/unloading. A queued transcription owns a lease before it is scheduled.
for (const method of ['setActiveModel', 'acquireActiveModel', 'removeModel']) {
  const implementation = SubtitleModelManager.prototype[method];
  SubtitleModelManager.prototype[method] = function (...args) {
    const result = this.mutations.catch(() => {}).then(() => implementation.apply(this, args));
    this.mutations = result.catch(() => {});
    return result;
  };
}
module.exports = { SubtitleModelManager, digest };
