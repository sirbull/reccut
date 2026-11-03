// Ser etter nye versjoner på GitHub (Releases). Appen virker helt uten nett: uten forbindelse
// skjer det ingenting. Finnes en nyere versjon, kan installasjonsfilen for denne maskinen lastes
// ned til Nedlastinger og åpnes. Ingenting installeres uten at brukeren selv åpner den.
const { app, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

let latestAsset = null;

function repo() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (m) return { owner: m[1], name: m[2] };
  } catch {}
  return { owner: 'sirbull', name: 'reccut' };
}

// Sammenligner versjoner som 1.2.10 og 1.2.9 (et "v" foran ignoreres).
function newer(a, b) {
  const parse = (v) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z.-]+))?(?:\+[\da-zA-Z.-]+)?$/.exec(String(v));
  const pa = parse(a), pb = parse(b);
  if (!pa || !pb) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) > Number(pb[i]);
  }
  if (!pa[4] || !pb[4]) return Boolean(!pa[4] && pb[4]);
  const aa = pa[4].split('.'), bb = pb[4].split('.');
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if (aa[i] === undefined || bb[i] === undefined) return aa[i] !== undefined;
    if (aa[i] === bb[i]) continue;
    const na = /^\d+$/.test(aa[i]), nb = /^\d+$/.test(bb[i]);
    if (na !== nb) return !na;
    return na ? Number(aa[i]) > Number(bb[i]) : aa[i] > bb[i];
  }
  return false;
}

// Installasjonsfilen som passer denne maskinen.
function pickAsset(assets, platform = process.platform, arch = process.arch) {
  const list = (Array.isArray(assets) ? assets : []).filter((a) => {
    // The Keystroke Add-on is attached to the same release but is never an installer.
    if (typeof a?.name !== 'string' || /keystrokes/i.test(a.name)) return false;
    const arm = /arm64|aarch64/i.test(a.name);
    const x64 = /x64|x86_64|amd64/i.test(a.name);
    const ia32 = /ia32|i[3-6]86/i.test(a.name);
    if (/universal/i.test(a.name) && platform === 'darwin') return true;
    if (arch === 'arm64') return arm;
    if (arch === 'x64') return !arm && !ia32;
    return arch === 'ia32' && ia32 && !x64 && !arm;
  });
  const by = (re) => list.find((a) => re.test(a.name));
  if (platform === 'darwin') return by(/\.dmg$/i);
  if (platform === 'win32') return by(/\.exe$/i) || by(/\.msi$/i);
  if (platform === 'linux') return by(/\.AppImage$/i) || by(/\.deb$/i);
  return undefined;
}

async function fetchJson(url, timeout = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await net.fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Reccut/${app.getVersion()}` } });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Gir { current, latest, newer, url, notes, asset } eller kaster om det ikke går (for eksempel uten nett). */
async function check() {
  const { owner, name } = repo();
  const rel = await fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/latest`);
  const current = app.getVersion();
  const latest = String(rel.tag_name || rel.name || '').replace(/^v/, '');
  const asset = pickAsset(rel.assets);
  latestAsset = newer(latest, current) && asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null;
  return {
    current,
    latest,
    newer: Boolean(latest) && newer(latest, current),
    url: `https://github.com/${owner}/${name}/releases/latest`,
    notes: String(rel.body || '').slice(0, 2000),
    published: rel.published_at,
    asset: latestAsset,
  };
}

// Laster ned installasjonsfilen til Nedlastinger og viser den. onProgress(0..1).
function resolveAsset(asset) {
  if (!latestAsset || asset?.name !== latestAsset.name || asset?.url !== latestAsset.url) throw new Error('Check for updates again before downloading.');
  const { owner, name } = repo();
  const url = new URL(latestAsset.url);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${owner}/${name}/releases/download/`) || url.username || url.password) throw new Error('Invalid update download URL.');
  if (!latestAsset.name || /[\\/\x00-\x1f<>:"|?*]/.test(latestAsset.name) || latestAsset.name === '.' || latestAsset.name === '..') throw new Error('Invalid installer filename.');
  return { ...latestAsset };
}

async function download(requested, onProgress, signal) {
  const asset = resolveAsset(requested);
  const dir = app.getPath('downloads');
  const ctrl = new AbortController();
  const combined = signal ? AbortSignal.any([signal, ctrl.signal]) : ctrl.signal;
  let timer;
  const resetTimeout = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(new Error('The download timed out. Please try again.')), 60000); };
  let tempDir;
  try {
    resetTimeout();
    const res = await net.fetch(asset.url, { signal: combined, headers: { 'User-Agent': `Reccut/${app.getVersion()}` } });
    if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
    const total = Number(res.headers.get('content-length')) || asset.size || 0;
    tempDir = await fs.promises.mkdtemp(path.join(dir, '.reccut-update-'));
    const partial = path.join(tempDir, 'installer.part');
    let got = 0;
    const progress = new Transform({ transform(chunk, _encoding, callback) {
      resetTimeout();
      got += chunk.length;
      if (total) onProgress?.(Math.min(1, got / total));
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(res.body), progress, fs.createWriteStream(partial), { signal: combined });
    if (!got || (total && got !== total) || (asset.size && got !== asset.size)) throw new Error('The download was incomplete. Please try again.');
    combined.throwIfAborted();
    const ext = path.extname(asset.name), base = path.basename(asset.name, ext);
    let file;
    for (let n = 0; ; n++) {
      file = path.join(dir, n ? `${base} (${n})${ext}` : asset.name);
      try {
        await fs.promises.copyFile(partial, file, fs.constants.COPYFILE_EXCL);
        break;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
    }
    shell.showItemInFolder(file);
    return file;
  } finally {
    clearTimeout(timer);
    if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = { check, download, newer, pickAsset, resolveAsset, repo };
