// CorridorKey Add-on: AI green and blue screen keying that runs on the user's own computer.
// Nothing of CorridorKey ships with Reccut. When the user asks for it, Reccut downloads uv, the
// CorridorKey source at a fixed commit, the Python packages from its lock file and the model
// files, each checked against a known hash, and sets them up as a processor plugin.
// CorridorKey is made by Corridor Digital under the CorridorKey Licence (CC BY-NC-SA 4.0 with extra terms).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { Readable } = require('stream');

const COMMIT = '97e55a453060745bead1befd293f6e523c4b845c';
const SOURCE = { url: `https://codeload.github.com/nikopueringer/CorridorKey/tar.gz/${COMMIT}`, sha256: '41514ed57475666a241a490ebf24f92d0f2340efc050f0f7975526d49e37014e' };
const LICENSE_URL = `https://github.com/nikopueringer/CorridorKey/blob/${COMMIT}/LICENSE`;
const UV = {
  'darwin-arm64': ['uv-aarch64-apple-darwin.tar.gz', '743f85035a1996ecb350659e01cd9faea9709829be09b1b4b03c73eaf3c9cd73'],
  'win32-x64': ['uv-x86_64-pc-windows-msvc.zip', 'a38b8d1902b7cfbc76b423ba1bb456f623f42064cdc72628b6075b89afd1019a'],
  'linux-x64': ['uv-x86_64-unknown-linux-gnu.tar.gz', 'f68d291c75783122dad58ab77def0e13f3233f358731db5d6d7e8715603b928f'],
};
const UV_VERSION = '0.13.5';
const WEIGHTS = [
  { file: 'CorridorKey_v1.0.safetensors', repo: 'nikopueringer/CorridorKey_v1.0', rev: 'f6386ddf042d8e92aeb5fd16cb9b101cff508195', sha256: '74d614f7d92fc559a118c30a7deadedc3cacd8ef83dcb85a030d0bed7af8b20b' },
  { file: 'CorridorKeyBlue_1.0.safetensors', repo: 'nikopueringer/CorridorKeyBlue_1.0', rev: '51e6ccaa4b703f54be20a72ac2c37784fb9ba1cd', sha256: '43bc5f6a08a9e5effe5d633d0d84bb0aff91037b35ab85d16cd812b38c5cac23' },
];
const GB = 1024 ** 3;
// Measured: about 1.6 GB on a Mac. The CUDA build of PyTorch makes it about 4.5 GB on Windows and Linux.
const NEEDED = { darwin: 3 * GB, win32: 8 * GB, linux: 8 * GB };

const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="2.5"/><path d="M9 18c0-3 1-5 3-5s3 2 3 5"/><circle cx="12" cy="9.5" r="2"/></svg>';

// Which graphics the model can use. NVIDIA through nvidia-smi, Apple Silicon by the platform.
function hardware({ platform = process.platform, arch = process.arch, spawnSyncImpl = spawnSync } = {}) {
  const ram = os.totalmem();
  if (platform === 'darwin') return { kind: arch === 'arm64' ? 'apple' : 'none', name: arch === 'arm64' ? 'Apple Silicon' : 'Intel Mac', memory: ram, ram };
  const r = spawnSyncImpl('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 4000, windowsHide: true });
  const m = /^(.+?),\s*(\d+)/.exec(String(r.stdout || '').trim());
  return m ? { kind: 'nvidia', name: m[1].trim(), memory: Number(m[2]) * 1024 ** 2, ram } : { kind: 'cpu', name: 'No NVIDIA graphics card found', memory: 0, ram };
}
// 2048 is what the model was trained on. It needs about 10 GB of video memory (more on a Mac,
// where the system shares it); on a 16 GB Mac it swaps for minutes per frame, so smaller machines get 1024.
const recommendedSize = (hw) => ((hw.kind === 'apple' && hw.memory >= 32 * GB) || (hw.kind === 'nvidia' && hw.memory >= 12 * GB) ? '2048' : '1024');

function manifest({ python, script, src, weights, size }) {
  return {
    format: 'reccut-processor-v1',
    id: 'corridorkey',
    name: 'CorridorKey',
    author: 'Corridor Digital',
    description: 'AI green and blue screen keying from Corridor Digital, running on this computer. Gives the clip a transparent background with clean hair, motion blur and fine edges. Slow: seconds per frame.',
    icon: ICON,
    executable: python,
    args: [script, '--root', src, '--weights', weights, '--ffmpeg', '{ffmpeg}', '--input', '{input}', '--output', '{output}',
      '--screen', '{param:screen}', '--size', '{param:size}', '--despill', '{param:despill}', '--hint-erode', '{param:erode}'],
    outputExtension: '.mov',
    params: [
      { id: 'screen', label: 'Screen', type: 'choice', default: 'auto', options: [{ value: 'auto', label: 'Detect' }, { value: 'green', label: 'Green' }, { value: 'blue', label: 'Blue' }] },
      { id: 'size', label: 'Quality', type: 'choice', default: size, hint: 'Full needs about 10 GB of graphics memory.', options: [{ value: '1024', label: 'Fast' }, { value: '2048', label: 'Full' }] },
      { id: 'despill', label: 'Remove spill', type: 'number', min: 0, max: 1, step: 0.05, default: 1, hint: 'Lower it if green objects in front of the screen lose their color.' },
      { id: 'erode', label: 'Rough key shrink', type: 'number', min: 0.2, max: 4, step: 0.1, default: 1, unit: '%', hint: 'Raise it if bits of the screen stay in the result.' },
    ],
  };
}

function createCorridorKey({ dir, fetchImpl, platform = process.platform, arch = process.arch, spawnImpl = spawn, spawnSyncImpl = spawnSync, scriptSource = path.join(__dirname, 'corridorkey.py') }) {
  const target = `${platform}-${arch}`;
  const supported = Boolean(UV[target]);
  const infoFile = path.join(dir, 'addon.json');
  const paths = {
    src: path.join(dir, 'src'),
    venv: path.join(dir, 'venv'),
    weights: path.join(dir, 'weights'),
    script: path.join(dir, 'corridorkey.py'),
    python: path.join(dir, 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    uv: path.join(dir, 'uv', platform === 'win32' ? 'uv.exe' : 'uv'),
    // Windows' own bsdtar, not a GNU tar from Git that may come first in PATH and cannot read zip.
    tar: platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar',
  };
  const info = () => {
    try {
      return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    } catch {
      return null;
    }
  };

  async function status() {
    const hw = hardware({ platform, arch, spawnSyncImpl });
    let free = null;
    try {
      const s = await fs.promises.statfs(fs.existsSync(dir) ? dir : path.dirname(path.dirname(dir)));
      free = s.bavail * s.bsize;
    } catch {}
    const i = info();
    return {
      supported: supported && hw.kind !== 'none',
      installed: Boolean(i) && fs.existsSync(paths.python),
      installedAt: i?.installedAt || null,
      hardware: hw,
      size: recommendedSize(hw),
      free,
      needed: NEEDED[platform] || 8 * GB,
      licenseUrl: LICENSE_URL,
    };
  }

  // Streams a download to disk and checks it, so 400 MB never sits in memory.
  async function download(url, file, sha256, ctx, [from, to], label) {
    const ac = new AbortController();
    ctx.setCancel(() => ac.abort());
    const res = await fetchImpl(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`Download failed (${res.status}): ${url}`);
    const total = Number(res.headers.get('content-length')) || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
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
      fs.rmSync(file, { force: true });
      throw new Error(`${path.basename(file)} does not match its checksum and was not installed.`);
    }
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

  // ctx is a job context from jobs.js: progress, setCancel, isCanceled.
  async function install(ctx) {
    if (!supported) throw new Error('CorridorKey is not available for this computer.');
    const s = await status();
    if (s.free != null && s.free < s.needed) throw new Error(`CorridorKey needs about ${Math.round(s.needed / GB)} GB of free disk space.`);
    const check = () => {
      if (ctx.isCanceled()) throw new Error('Canceled');
    };
    await fs.promises.rm(dir, { recursive: true, force: true });
    await fs.promises.mkdir(paths.weights, { recursive: true });
    try {
      const [uvAsset, uvSum] = UV[target];
      const uvArchive = path.join(dir, uvAsset);
      await download(`https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${uvAsset}`, uvArchive, uvSum, ctx, [0, 0.03], 'Downloading uv');
      await fs.promises.mkdir(path.dirname(paths.uv), { recursive: true });
      // tar reads both .tar.gz and .zip (Windows 10 and later have bsdtar).
      await run(paths.tar, ['-xf', uvArchive, '-C', path.dirname(paths.uv), ...(platform === 'win32' ? [] : ['--strip-components=1'])], ctx);
      await fs.promises.rm(uvArchive);
      check();

      const srcArchive = path.join(dir, 'src.tar.gz');
      await download(SOURCE.url, srcArchive, SOURCE.sha256, ctx, [0.03, 0.05], 'Downloading CorridorKey');
      await fs.promises.mkdir(paths.src);
      await run(paths.tar, ['-xzf', srcArchive, '-C', paths.src, '--strip-components=1'], ctx);
      await fs.promises.rm(srcArchive);
      check();

      // Python and every package come from uv.lock with their hashes. CUDA builds on Windows and Linux.
      ctx.progress(0.06, 'Installing Python and PyTorch (this takes a while)');
      await run(paths.uv, ['sync', '--frozen', '--no-dev', '--project', paths.src, ...(platform === 'darwin' ? [] : ['--extra', 'cuda'])], ctx, {
        UV_CACHE_DIR: path.join(dir, 'cache'),
        UV_PYTHON_INSTALL_DIR: path.join(dir, 'python'),
        UV_PROJECT_ENVIRONMENT: paths.venv,
        UV_PYTHON_PREFERENCE: 'only-managed',
        UV_NO_CONFIG: '1',
      });
      await fs.promises.rm(path.join(dir, 'cache'), { recursive: true, force: true });
      check();

      for (const [n, w] of WEIGHTS.entries()) {
        const from = 0.5 + n * 0.24;
        await download(`https://huggingface.co/${w.repo}/resolve/${w.rev}/${w.file}`, path.join(paths.weights, w.file), w.sha256, ctx, [from, from + 0.24], `Downloading the ${n ? 'blue' : 'green'} screen model`);
        check();
      }
      await fs.promises.copyFile(scriptSource, paths.script);
      await fs.promises.writeFile(infoFile, JSON.stringify({ commit: COMMIT, uv: UV_VERSION, installedAt: new Date().toISOString() }, null, 1));
      ctx.progress(1, 'Installed');
      return manifest({ ...paths, size: s.size });
    } catch (err) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  const remove = () => fs.promises.rm(dir, { recursive: true, force: true });

  return { status, install, remove };
}

module.exports = { createCorridorKey, hardware, recommendedSize, manifest };
