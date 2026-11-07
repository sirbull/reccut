// Roto Brush Add-on: click on a subject, and SAM 2.1 (Meta, Apache 2.0) follows it through the clip.
// Nothing of SAM ships with Reccut. When the user asks for it, Reccut downloads uv, Python, PyTorch,
// the SAM 2 source at a fixed commit and the model the user picks, each checked where a hash is known.
// roto.py runs as one process per open clip and answers JSON lines (see the top of roto.py).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const SAM2 = { commit: '2b90b9f5ceec907a1c18123530e92e794ad901a4', sha256: '1f2fbfad3ffa38110368abac76c6ef9df9c282a66d5c2807bc94abf4d2fb30f8' };
const LICENSE_URL = `https://github.com/facebookresearch/sam2/blob/${SAM2.commit}/LICENSE`;
// ponytail: same uv pin as corridorkey.js; move both into one helper when that add-on settles.
const UV_VERSION = '0.13.5';
const UV = {
  'darwin-arm64': ['uv-aarch64-apple-darwin.tar.gz', '743f85035a1996ecb350659e01cd9faea9709829be09b1b4b03c73eaf3c9cd73'],
  'win32-x64': ['uv-x86_64-pc-windows-msvc.zip', 'a38b8d1902b7cfbc76b423ba1bb456f623f42064cdc72628b6075b89afd1019a'],
  'linux-x64': ['uv-x86_64-unknown-linux-gnu.tar.gz', 'f68d291c75783122dad58ab77def0e13f3233f358731db5d6d7e8715603b928f'],
};
const MODEL_URL = 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/';
// Speeds measured on an M1 Pro with 16 GB while other apps were open; a free machine is faster.
const MODELS = [
  { id: 'small', label: 'Small', file: 'sam2.1_hiera_small.pt', bytes: 184416285, sha256: '6d1aa6f30de5c92224f8172114de081d104bbd23dd9dc5c58996f0cad5dc4d38', about: 'Fastest. Good for clear subjects against a calm background.' },
  { id: 'base', label: 'Base+', file: 'sam2.1_hiera_base_plus.pt', bytes: 323606802, sha256: 'a2345aede8715ab1d5d31b4a509fb160c5a4af1970f199d9054ccfb746c004c5', about: 'Balanced. A good choice for most clips.' },
  { id: 'large', label: 'Large', file: 'sam2.1_hiera_large.pt', bytes: 898083611, sha256: '2647878d5dfa5098f2f8649825738a9345572bae2d4350a2468587ece47dd318', about: 'Best for hard clips: crossing objects, fast motion, busy backgrounds. About twice as slow as Small.' },
];
const GB = 1024 ** 3;
// Measured: about 1 GB on a Mac. The CUDA build of PyTorch makes it about 5 GB on Windows and Linux.
const NEEDED = { darwin: 2 * GB, win32: 7 * GB, linux: 7 * GB };
const CACHE_DAYS = 14;

function createRoto({ dir, cacheDir, ffmpegPath, fetchImpl, platform = process.platform, arch = process.arch, spawnImpl = spawn, scriptSource = path.join(__dirname, 'roto.py') }) {
  const target = `${platform}-${arch}`;
  const supported = Boolean(UV[target]);
  const infoFile = path.join(dir, 'addon.json');
  const paths = {
    venv: path.join(dir, 'venv'),
    models: path.join(dir, 'models'),
    script: path.join(dir, 'roto.py'),
    python: path.join(dir, 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    uv: path.join(dir, 'uv', platform === 'win32' ? 'uv.exe' : 'uv'),
    tar: platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar',
  };
  const info = () => {
    try {
      return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    } catch {
      return null;
    }
  };
  const saveInfo = (patch) => fs.writeFileSync(infoFile, JSON.stringify({ ...info(), ...patch }, null, 1));
  const modelOf = (id) => {
    const m = MODELS.find((x) => x.id === id);
    if (!m) throw new Error('Unknown model.');
    return m;
  };
  const hasModel = (m) => {
    try {
      return fs.statSync(path.join(paths.models, m.file)).size === m.bytes;
    } catch {
      return false;
    }
  };

  async function status() {
    let free = null;
    try {
      const s = await fs.promises.statfs(fs.existsSync(dir) ? dir : path.dirname(path.dirname(dir)));
      free = s.bavail * s.bsize;
    } catch {}
    const i = info();
    const models = MODELS.map((m) => ({ id: m.id, label: m.label, bytes: m.bytes, about: m.about, installed: hasModel(m) }));
    const chosen = models.find((m) => m.id === i?.model && m.installed) || models.find((m) => m.installed);
    return {
      supported,
      installed: Boolean(i) && fs.existsSync(paths.python),
      installedAt: i?.installedAt || null,
      model: chosen?.id || null,
      models,
      free,
      needed: NEEDED[platform] || 7 * GB,
      licenseUrl: LICENSE_URL,
    };
  }

  // Streams a download to disk and checks it, so a 900 MB model never sits in memory.
  async function download(url, file, sha256, ctx, [from, to], label) {
    const ac = new AbortController();
    ctx.setCancel(() => ac.abort());
    const res = await fetchImpl(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const hash = crypto.createHash('sha256');
    const tmp = `${file}.download`;
    const out = fs.createWriteStream(tmp);
    let got = 0;
    try {
      for await (const chunk of Readable.fromWeb(res.body)) {
        hash.update(chunk);
        got += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        if (total) ctx.progress(from + ((to - from) * got) / total, label);
      }
    } finally {
      await new Promise((r) => out.end(r));
    }
    if (hash.digest('hex') !== sha256) {
      fs.rmSync(tmp, { force: true });
      throw new Error(`${path.basename(file)} does not match its checksum and was not installed.`);
    }
    fs.renameSync(tmp, file);
  }

  function run(exe, args, ctx, env = {}) {
    return new Promise((resolve, reject) => {
      const child = spawnImpl(exe, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = '';
      const keep = (s) => (log = (log + s).slice(-3000));
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      ctx.setCancel(() => child.kill());
      child.once('error', reject);
      child.once('close', (code) => (code === 0 ? resolve() : reject(new Error(ctx.isCanceled() ? 'Canceled' : `${path.basename(exe)} failed (${code}): ${log}`))));
    });
  }

  async function downloadModel(id, ctx, span = [0, 1]) {
    const m = modelOf(id);
    if (!hasModel(m)) {
      await fs.promises.mkdir(paths.models, { recursive: true });
      await download(MODEL_URL + m.file, path.join(paths.models, m.file), m.sha256, ctx, span, `Downloading the ${m.label} model`);
    }
    saveInfo({ model: id });
    return status();
  }

  // ctx is a job context from jobs.js: progress, setCancel, isCanceled.
  async function install({ model }, ctx) {
    if (!supported) throw new Error('Roto Brush is not available for this computer.');
    const m = modelOf(model);
    const s = await status();
    if (s.free != null && s.free < s.needed + m.bytes) throw new Error(`Roto Brush needs about ${Math.ceil((s.needed + m.bytes) / GB)} GB of free disk space.`);
    const check = () => {
      if (ctx.isCanceled()) throw new Error('Canceled');
    };
    close();
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.mkdir(dir, { recursive: true });
    try {
      const [uvAsset, uvSum] = UV[target];
      const uvArchive = path.join(dir, uvAsset);
      await download(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${uvAsset}`, uvArchive, uvSum, ctx, [0, 0.03], 'Downloading uv');
      await fs.promises.mkdir(path.dirname(paths.uv), { recursive: true });
      await run(paths.tar, ['-xf', uvArchive, '-C', path.dirname(paths.uv), ...(platform === 'win32' ? [] : ['--strip-components=1'])], ctx);
      await fs.promises.rm(uvArchive);
      check();

      const samArchive = path.join(dir, 'sam2.tar.gz');
      await download(`https://codeload.github.com/facebookresearch/sam2/tar.gz/${SAM2.commit}`, samArchive, SAM2.sha256, ctx, [0.03, 0.08], 'Downloading SAM 2');
      check();

      const env = {
        UV_CACHE_DIR: path.join(dir, 'cache'),
        UV_PYTHON_INSTALL_DIR: path.join(dir, 'python'),
        UV_PYTHON_PREFERENCE: 'only-managed',
        UV_NO_CONFIG: '1',
        VIRTUAL_ENV: paths.venv,
        SAM2_BUILD_CUDA: '0', // The optional CUDA extension only fills small holes; SAM runs without it.
      };
      ctx.progress(0.08, 'Installing Python');
      await run(paths.uv, ['venv', '--python', '3.12', paths.venv], ctx, env);
      check();
      // PyTorch first, then SAM 2 built against it, so the build does not fetch a second PyTorch.
      // On Windows and Linux uv picks the CUDA build that matches the graphics driver.
      ctx.progress(0.1, 'Installing PyTorch (this takes a while)');
      await run(paths.uv, ['pip', 'install', ...(platform === 'darwin' ? [] : ['--torch-backend', 'auto']), 'torch==2.15.0', 'torchvision', 'opencv-python-headless==5.0.0.93', 'setuptools', 'wheel'], ctx, env);
      check();
      ctx.progress(0.45, 'Installing SAM 2');
      await run(paths.uv, ['pip', 'install', '--no-build-isolation', samArchive], ctx, env);
      await fs.promises.rm(samArchive);
      await fs.promises.rm(env.UV_CACHE_DIR, { recursive: true, force: true });
      check();

      await fs.promises.copyFile(scriptSource, paths.script);
      await run(paths.python, [paths.script, '--check'], ctx);
      saveInfo({ commit: SAM2.commit, uv: UV_VERSION, installedAt: new Date().toISOString() });
      await downloadModel(model, ctx, [0.5, 1]);
      ctx.progress(1, 'Installed');
      return status();
    } catch (err) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  async function removeModel(id) {
    const m = modelOf(id);
    if (session?.model === id) close();
    await fs.promises.rm(path.join(paths.models, m.file), { force: true });
    return status();
  }

  async function chooseModel(id) {
    if (!hasModel(modelOf(id))) throw new Error('Download this model first.');
    saveInfo({ model: id });
    return status();
  }

  async function remove() {
    close();
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.rm(cacheDir, { recursive: true, force: true });
    return status();
  }

  // One process for the clip that is open in the Roto Brush window.
  let session = null;
  let nextId = 1;

  function start(model) {
    // The script is copied on every start, so an app update brings the new one along.
    fs.copyFileSync(scriptSource, paths.script);
    const child = spawnImpl(paths.python, [paths.script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' } });
    const s = { child, model, pending: new Map(), onProgress: null, log: '' };
    let ready;
    s.ready = new Promise((resolve, reject) => (ready = { resolve, reject }));
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if (msg.ready) ready.resolve();
      else if ('progress' in msg) s.onProgress?.(msg.progress, msg.stage);
      else if (s.pending.has(msg.reply)) {
        const p = s.pending.get(msg.reply);
        s.pending.delete(msg.reply);
        msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg);
      }
    });
    child.stderr.on('data', (d) => (s.log = (s.log + d).slice(-3000)));
    const fail = (err) => {
      ready.reject(err);
      for (const p of s.pending.values()) p.reject(err);
      s.pending.clear();
      if (session === s) session = null;
    };
    child.once('error', fail);
    child.once('close', (code) => fail(new Error(code ? `Roto Brush stopped (${code}): ${s.log.split('\n').filter(Boolean).slice(-3).join(' ')}` : 'Roto Brush was closed.')));
    return s;
  }

  async function call(cmd, args = {}, onProgress) {
    const s = session;
    if (!s) throw new Error('Open a clip in Roto Brush first.');
    await s.ready;
    const id = nextId++;
    s.onProgress = onProgress || null;
    return new Promise((resolve, reject) => {
      s.pending.set(id, { resolve, reject });
      s.child.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n');
    });
  }

  // Frames and masks are kept per source and range, so closing and opening the clip again
  // keeps the work. Old folders are removed after CACHE_DAYS.
  async function open({ input, fps, first, count, model }, onProgress) {
    const st = await status();
    if (!st.installed) throw new Error('Install Roto Brush first.');
    const m = st.models.find((x) => x.id === (model || st.model));
    if (!m?.installed) throw new Error('Download a model first.');
    if (!path.isAbsolute(input) || !fs.statSync(input).isFile()) throw new Error('Source file is missing.');
    if (!(fps > 0) || !(count > 0) || !(first >= 0)) throw new Error('This clip has no frames to work on.');
    if (count > 9000) throw new Error('Roto Brush works on up to 9000 frames (5 minutes at 30 fps). Split the clip and work on the part you need.');
    pruneCache();
    const key = crypto.createHash('sha1').update(JSON.stringify([input, fs.statSync(input).mtimeMs, fps, first, count])).digest('hex').slice(0, 16);
    const work = path.join(cacheDir, key);
    fs.mkdirSync(work, { recursive: true });
    fs.utimesSync(work, new Date(), new Date());
    if (session && session.model !== m.id) close();
    if (!session) session = start(m.id);
    saveInfo({ model: m.id });
    const r = await call('open', { input, fps, first, count, work, ffmpeg: ffmpegPath, models: paths.models, model: m.id }, onProgress);
    return { ...r, model: m.id };
  }

  function pruneCache() {
    let names = [];
    try {
      names = fs.readdirSync(cacheDir);
    } catch {}
    for (const n of names) {
      const p = path.join(cacheDir, n);
      try {
        if (Date.now() - fs.statSync(p).mtimeMs > CACHE_DAYS * 864e5) fs.rmSync(p, { recursive: true, force: true });
      } catch {}
    }
  }

  // Stops a running track or render. Python checks the flag between frames.
  function cancel() {
    session?.child.stdin.write(JSON.stringify({ cmd: 'cancel' }) + '\n');
  }

  function close() {
    if (!session) return;
    session.child.kill();
    session = null;
  }

  return { status, install, downloadModel, removeModel, chooseModel, remove, open, call, cancel, close };
}

// IPC for the renderer. Long steps (install, model downloads, render) run as background tasks;
// tracking reports its progress straight to the Roto Brush window.
// handle(channel, fn) is main.js's extensionHandler: only the main window may call these.
function registerRoto({ handle, roto, jobs, media, notifyAnalyzed, outputDir, send }) {
  handle('roto:status', () => roto.status());
  handle('roto:install', (opts) => {
    if (opts?.consent !== true) throw new Error('Roto Brush is only installed after you accept what it downloads.');
    return jobs.add({ kind: 'addon', title: 'Installing Roto Brush', queue: 'heavy', run: (ctx) => roto.install({ model: opts.model }, ctx) }).done;
  });
  handle('roto:downloadModel', (id) => jobs.add({ kind: 'download', title: 'Downloading a Roto Brush model', queue: 'light', run: (ctx) => roto.downloadModel(id, ctx) }).done);
  handle('roto:removeModel', (id) => roto.removeModel(id));
  handle('roto:chooseModel', (id) => roto.chooseModel(id));
  handle('roto:remove', () => roto.remove());
  const progress = (p, stage) => send('roto:progress', { progress: p, stage });
  handle('roto:open', (req) => roto.open(req, progress));
  handle('roto:call', (cmd, args) => {
    if (!['frame', 'points', 'track', 'preview'].includes(cmd)) throw new Error('Unknown Roto Brush command.');
    return roto.call(cmd, args, progress);
  });
  handle('roto:cancel', () => roto.cancel());
  handle('roto:close', () => roto.close());
  handle('roto:render', (req) => {
    const task = jobs.add({ kind: 'processor', title: 'Rendering Roto Brush matte', queue: 'heavy', run: async (ctx) => {
      fs.mkdirSync(outputDir(), { recursive: true });
      const output = path.join(outputDir(), `Roto ${new Date().toISOString().slice(0, 19).replace(/:/g, '-')} ${crypto.randomUUID().slice(0, 4)}.mov`);
      ctx.setCancel(() => roto.cancel());
      try {
        await roto.call('render', { output, fps: req.fps, frames: req.frames, sourceWidth: req.sourceWidth, grow: req.grow, feather: req.feather, refine: req.refine }, (p) => ctx.progress(p * 0.9, 'Rendering'));
        if (ctx.isCanceled()) throw new Error('Canceled');
        const imported = await media.importFiles([output], notifyAnalyzed);
        if (!imported.items?.[0]?.streams?.main?.hasVideo) throw new Error('The rendered matte could not be read.');
        return { output, plugin: 'Roto Brush', media: imported.items[0] };
      } catch (err) {
        await fs.promises.rm(output, { force: true });
        throw err;
      }
    } });
    return task.done;
  });
}

module.exports = { createRoto, registerRoto, MODELS };
