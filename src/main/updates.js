// Ser etter nye versjoner på GitHub (Releases). Appen virker helt uten nett: uten forbindelse
// skjer det ingenting. Finnes en nyere versjon, kan installasjonsfilen for denne maskinen lastes
// ned til Nedlastinger og åpnes. Ingenting installeres uten at brukeren selv åpner den.
const { app, net, shell } = require('electron');
const fs = require('fs');
const path = require('path');

function repo() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || '';
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (m) return { owner: m[1], name: m[2] };
  } catch {}
  return { owner: 'sirbull', name: 'OBSlite' };
}

// Sammenligner versjoner som 1.2.10 og 1.2.9 (et "v" foran ignoreres).
function newer(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

// Installasjonsfilen som passer denne maskinen.
function pickAsset(assets) {
  const list = assets || [];
  const by = (re) => list.find((a) => re.test(a.name));
  // Mac: Apple Silicon-filen har arm64 i navnet, Intel-filen har det ikke.
  if (process.platform === 'darwin') return process.arch === 'arm64' ? by(/arm64.*\.dmg$/i) || by(/\.dmg$/i) : list.find((a) => /\.dmg$/i.test(a.name) && !/arm64/i.test(a.name)) || by(/\.dmg$/i);
  if (process.platform === 'win32') return by(/\.exe$/i) || by(/\.msi$/i);
  return by(/\.AppImage$/i) || by(/\.deb$/i);
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
  return {
    current,
    latest,
    newer: Boolean(latest) && newer(latest, current),
    url: rel.html_url,
    notes: String(rel.body || '').slice(0, 2000),
    published: rel.published_at,
    asset: asset ? { name: asset.name, url: asset.browser_download_url, size: asset.size } : null,
  };
}

// Laster ned installasjonsfilen til Nedlastinger og viser den. onProgress(0..1).
async function download(asset, onProgress) {
  const dir = app.getPath('downloads');
  const file = path.join(dir, asset.name);
  const res = await net.fetch(asset.url, { headers: { 'User-Agent': `Reccut/${app.getVersion()}` } });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const total = Number(res.headers.get('content-length')) || asset.size || 0;
  const out = fs.createWriteStream(file + '.part');
  let got = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    if (total) onProgress?.(got / total);
  }
  await new Promise((r, j) => out.end((err) => (err ? j(err) : r())));
  await fs.promises.rename(file + '.part', file);
  shell.showItemInFolder(file);
  return file;
}

module.exports = { check, download, newer, pickAsset };
