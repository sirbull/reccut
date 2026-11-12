// Optional VoxCPM2 engine and models. No network access occurs during synthesis.
// Synthetic references are separate release assets, downloaded only on request.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createVoxcpmProcess, verifyVoxcpmProtocol, PROTOCOL } = require('./voxcpmProcess');
const { downloadFile, hashFile } = require('./downloadFile');
const CATALOG = require('./ttsCatalog.json');

const fingerprint = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const missing = () => new Error('MODEL_MISSING:voices Download the VoxCPM2 model and voice package first.');
const canceled = () => new Error('Canceled');
function assetName(platform = process.platform, arch = process.arch) {
  return platform === 'darwin' && arch === 'arm64' ? 'reccut-voxcpm-mac' : null;
}
function localFile(dir, rel) {
  if (typeof rel !== 'string' || !rel || rel.split(/[\\/]/).some((s) => !s || s === '.' || s === '..') || path.isAbsolute(rel)) throw new Error('Invalid catalog path.');
  return path.join(dir, rel);
}
const resolveUrl = (pack, file) => `https://huggingface.co/${pack.repository}/resolve/${pack.revision}/${file.path.split('/').map(encodeURIComponent).join('/')}`;

// The pinned CLI writes mono, 16-bit PCM WAV. Walk chunks instead of assuming
// a 44-byte header, and reject malformed output before returning it to the studio.
function readWav(buf) {
  const fail = () => { throw new Error('The voice engine returned an invalid WAV file.'); };
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE' || buf.readUInt32LE(4) + 8 !== buf.length) fail();
  let rate, data;
  for (let at = 12; at + 8 <= buf.length;) {
    const id = buf.toString('ascii', at, at + 4), size = buf.readUInt32LE(at + 4), start = at + 8;
    if (start + size > buf.length) fail();
    if (id === 'fmt ') {
      if (size < 16 || buf.readUInt16LE(start) !== 1 || buf.readUInt16LE(start + 2) !== 1 || buf.readUInt16LE(start + 14) !== 16 || buf.readUInt16LE(start + 12) !== 2) fail();
      rate = buf.readUInt32LE(start + 4);
      if (rate < 8000 || rate > 192000 || buf.readUInt32LE(start + 8) !== rate * 2) fail();
    }
    if (id === 'data') data = buf.subarray(start, start + size);
    at = start + size + (size % 2);
  }
  if (!rate || !data?.length || data.length % 2) fail();
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = data.readInt16LE(i * 2) / 32768;
  return { samples, rate };
}

function createVoxcpm({ dir, version, repo = { owner: 'sirbull', name: 'reccut' }, catalog = CATALOG.voxcpm,
  platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch, spawnImpl = spawn, onChange = () => {}, idleTimeoutMs, startupTimeoutMs, requestTimeoutMs }) {
  const asset = assetName(platform, arch);
  const engineDir = path.join(dir, 'engine', version);
  const modelDir = path.join(dir, 'models', fingerprint(catalog.model));
  const releaseBase = `https://github.com/${repo.owner}/${repo.name}/releases/download/v${version}/`;
  const language = (lang) => catalog.languages.find((l) => l.lang === lang);
  const languagePack = (l) => l.source === 'release'
    ? { source: 'release', files: l.voices.map((v) => v.reference) }
    : { repository: l.repository, revision: l.revision, files: l.voices.map((v) => v.reference) };
  const languageDir = (l) => path.join(dir, 'languages', l.lang, fingerprint(languagePack(l)));
  let active = null, speaking = null, removing = false;
  const processor = createVoxcpmProcess({ spawnImpl, idleTimeoutMs, startupTimeoutMs, requestTimeoutMs });

  async function installed(pack, dest, verify = false) {
    try {
      const mark = JSON.parse(await fs.readFile(path.join(dest, 'verified.json'), 'utf8'));
      if (mark.fingerprint !== fingerprint(pack)) return false;
      for (const f of pack.files) {
        const file = localFile(dest, f.path);
        if ((await fs.stat(file)).size !== f.size || (verify && await hashFile(file) !== f.sha256)) return false;
      }
      return true;
    } catch { return false; }
  }
  async function engineInfo(verify = false) {
    if (!asset) return null;
    try {
      const info = JSON.parse(await fs.readFile(path.join(engineDir, 'verified.json'), 'utf8'));
      const file = path.join(engineDir, asset);
      if (info.version !== version || info.revision !== catalog.engine.revision || info.asset !== asset || info.protocol !== PROTOCOL ||
          !/^[a-f0-9]{64}$/.test(info.sha256) || (await fs.stat(file)).size !== info.size) return null;
      if (verify && await hashFile(file) !== info.sha256) return null;
      return { ...info, file };
    } catch { return null; }
  }
  async function status() {
    const languages = {};
    for (const l of catalog.languages) languages[l.lang] = {
      installed: await installed(languagePack(l), languageDir(l), true),
      sizeBytes: l.voices.reduce((n, v) => n + v.reference.size, 0),
    };
    return { supported: Boolean(asset), installed: await installed(catalog.model, modelDir), engine: Boolean(await engineInfo()),
      sizeBytes: catalog.model.files.reduce((n, f) => n + f.size, 0), license: catalog.license,
      running: processor.running(), downloading: Boolean(active), target: active?.target || null, progress: active?.progress || 0, languages };
  }
  async function installPack(pack, dest, signal, progress, verify = false) {
    if (await installed(pack, dest, verify)) { progress(pack.files.reduce((n, f) => n + f.size, 0)); return; }
    const staging = path.join(dir, '.downloads', fingerprint(pack));
    await fs.mkdir(staging, { recursive: true });
    let done = 0;
    for (const f of pack.files) {
      signal.throwIfAborted();
      const url = pack.source === 'release' ? releaseBase + encodeURIComponent(f.path) : resolveUrl(pack, f);
      await downloadFile({ url, file: localFile(staging, f.path), size: f.size, sha256: f.sha256, signal, fetchImpl,
        onProgress: (bytes) => progress(done + bytes) });
      done += f.size;
    }
    signal.throwIfAborted();
    await fs.writeFile(path.join(staging, 'verified.json'), JSON.stringify({ fingerprint: fingerprint(pack) }));
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.rm(dest, { recursive: true, force: true });
    await fs.rename(staging, dest);
  }
  async function installEngine(signal) {
    if (await engineInfo(true)) return;
    const base = releaseBase;
    const res = await fetchImpl(base + asset + '.sha256', { signal });
    if (!res.ok) throw new Error(res.status === 404 ? `The VoxCPM2 engine is not published for Reccut ${version} yet.` : `Download failed (${res.status}).`);
    // Release checksums are tiny. Bound the response just like the executable.
    let text = '';
    if (!res.body) throw new Error('The engine checksum is missing.');
    for await (const chunk of res.body) {
      text += Buffer.from(chunk).toString('utf8');
      if (text.length > 512) throw new Error('The engine checksum is invalid.');
    }
    const match = /^([a-f0-9]{64})[ \t]+\*?([^\r\n]+)\s*$/i.exec(text);
    if (!match || match[2] !== asset) throw new Error('The engine checksum is invalid.');
    const sha256 = match[1].toLowerCase();
    const staging = path.join(dir, '.downloads', `engine-${version}`);
    const file = path.join(staging, asset);
    const size = await downloadFile({ url: base + asset, file, sha256, maxBytes: 64 * 1024 * 1024, signal, fetchImpl });
    signal.throwIfAborted();
    await fs.chmod(file, 0o755);
    await verifyVoxcpmProtocol(file, { spawnImpl, signal });
    await fs.writeFile(path.join(staging, 'verified.json'), JSON.stringify({ version, revision: catalog.engine.revision, asset, sha256, size, protocol: PROTOCOL }));
    await fs.mkdir(path.dirname(engineDir), { recursive: true });
    await fs.rm(engineDir, { recursive: true, force: true });
    await fs.rename(staging, engineDir);
  }
  function install(lang, onProgress = () => {}) {
    if (!asset) return Promise.reject(new Error('VoxCPM2 currently requires an Apple Silicon Mac.'));
    const l = lang === null ? null : language(lang);
    if (lang !== null && !l) return Promise.reject(new Error('Unknown VoxCPM2 language.'));
    if (active) return Promise.reject(new Error('VoxCPM2 is already downloading.'));
    if (speaking || removing) return Promise.reject(new Error('The VoxCPM2 engine is busy.'));
    const ctrl = new AbortController();
    const operation = { ctrl, target: lang || 'model', progress: 0, done: null };
    active = operation;
    const total = catalog.model.files.reduce((n, f) => n + f.size, 0) + (l ? l.voices.reduce((n, v) => n + v.reference.size, 0) : 0);
    const progress = (n) => {
      operation.progress = Math.min(1, n / total);
      onProgress(operation.progress);
    };
    operation.done = Promise.resolve().then(async () => {
      onChange();
      await processor.stop();
      await installEngine(ctrl.signal);
      await installPack(catalog.model, modelDir, ctrl.signal, progress);
      if (l) {
        const modelBytes = catalog.model.files.reduce((n, f) => n + f.size, 0);
        await installPack(languagePack(l), languageDir(l), ctrl.signal, (n) => progress(modelBytes + n), true);
      }
      ctrl.signal.throwIfAborted();
      progress(total);
    }).finally(() => { active = null; onChange(); });
    return operation.done;
  }
  function cancel() { active?.ctrl.abort(canceled()); }
  async function stopDownload() {
    const pending = active;
    if (pending) { cancel(); await pending.done.catch(() => {}); }
  }
  async function removeFiles(work) {
    if (speaking || removing) throw new Error('The VoxCPM2 engine is busy.');
    removing = true;
    try { await stopDownload(); await processor.stop(); await work(); }
    finally { removing = false; onChange(); }
  }
  async function removeLanguage(lang) {
    const l = language(lang);
    if (!l) throw new Error('Unknown VoxCPM2 language.');
    await removeFiles(async () => {
      await fs.rm(path.join(dir, 'languages', l.lang), { recursive: true, force: true });
      await fs.rm(path.join(dir, '.downloads', fingerprint(languagePack(l))), { recursive: true, force: true });
    });
  }
  async function removeModel() {
    await removeFiles(async () => {
      for (const rel of ['models', 'engine', '.downloads']) await fs.rm(path.join(dir, rel), { recursive: true, force: true });
    });
  }

  async function generate(payload, ctx) {
    if (!asset) throw missing();
    if (speaking || active || removing) throw new Error('The VoxCPM2 engine is busy.');
    const l = language(payload.lang), v = l?.voices.find((voice) => voice.id === payload.voice);
    if (!l || !v) throw missing();
    const mood = catalog.moods.find((m) => m.id === (payload.mood || 'neutral'));
    if (!mood) throw new Error('Unknown voice mood.');
    const state = {};
    speaking = state;
    const ctrl = new AbortController();
    let temp;
    const checkCancel = () => { if (ctx.isCanceled()) ctrl.abort(canceled()); ctrl.signal.throwIfAborted(); };
    state.cancel = () => { ctrl.abort(canceled()); processor.stop(canceled()); };
    ctx.setCancel(state.cancel);
    try {
      checkCancel();
      const { chunksForSpeech, spokenText } = await import('../shared/tts.js');
      const chunks = chunksForSpeech(spokenText(String(payload.text || '').slice(0, 5000)));
      if (!chunks.length) throw new Error('There is no text to read.');
      const engine = await engineInfo(true);
      if (!engine || !(await installed(catalog.model, modelDir)) || !(await installed(languagePack(l), languageDir(l)))) throw missing();
      if (await hashFile(localFile(languageDir(l), v.reference.path)) !== v.reference.sha256) throw missing();
      await fs.mkdir(path.join(dir, '.work'), { recursive: true });
      temp = await fs.mkdtemp(path.join(dir, '.work', 'speech-'));
      const pieces = [];
      let rate, count = 0;
      for (let i = 0; i < chunks.length; i++) {
        checkCancel();
        const output = path.join(temp, 'output.wav');
        const settings = catalog.settings;
        await processor.run({ exe: engine.file, sha256: engine.sha256, models: catalog.model.files.map((f) => localFile(modelDir, f.path)), cwd: dir }, {
          reference: localFile(languageDir(l), v.reference.path), text: `(${mood.prompt} ${settings.suffix})${chunks[i]}`,
          cfg: settings.cfg, steps: settings.steps, timesteps: settings.timesteps, temperature: settings.temperature,
          seed: settings.seed ?? 42, output,
        }, {
          signal: ctrl.signal,
          onLoading: () => ctx.progress(i / chunks.length, 'Preparing voice…', { phase: 'loading' }),
          onReady: () => ctx.progress(i / chunks.length, `Generating sentence ${i + 1} of ${chunks.length}…`, { phase: 'synthesizing', completed: i, total: chunks.length }),
        });
        checkCancel();
        if ((await fs.stat(output)).size > 64 * 1024 * 1024) throw new Error('The generated voice is too long.');
        const audio = readWav(await fs.readFile(output));
        if (rate && rate !== audio.rate) throw new Error('The voice engine changed sample rate.');
        rate = audio.rate;
        pieces.push(audio.samples);
        count += audio.samples.length;
        await fs.rm(output);
        ctx.progress((i + 1) / chunks.length, `Generated sentence ${i + 1} of ${chunks.length}`, { phase: 'synthesizing', completed: i + 1, total: chunks.length });
      }
      checkCancel();
      const samples = new Float32Array(count);
      let offset = 0;
      for (const part of pieces) { samples.set(part, offset); offset += part.length; }
      return { samples, rate };
    } catch (error) {
      await processor.stop(error);
      throw error;
    } finally {
      try { if (temp) await fs.rm(temp, { recursive: true, force: true }); }
      finally { if (speaking === state) speaking = null; }
    }
  }

  return { status, installModel: (progress) => install(null, progress), installLanguage: install, cancel, removeLanguage, removeModel, generate,
    stop: () => { cancel(); speaking?.cancel(); return processor.stop(canceled()); } };
}

module.exports = { createVoxcpm, assetName, readWav };
