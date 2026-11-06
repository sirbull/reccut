// Keystroke Add-on: a separate helper program that reads keyboard shortcuts while recording.
// It is not part of the installer. It is downloaded from the GitHub release for this version
// only when the user asks for it, checked with SHA-256, and started only during a recording
// with "Show keystrokes" on. See native/keystrokes/README.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const MAX_SIZE = 8 * 1024 * 1024;
const MODS = { ctrl: 1, alt: 2, shift: 4, meta: 8 };

// One file per platform. Windows on ARM runs the x64 helper; the macOS helper is universal.
function assetName(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && (arch === 'x64' || arch === 'arm64')) return 'reccut-keystrokes-win-x64.exe';
  if (platform === 'darwin') return 'reccut-keystrokes-mac';
  if (platform === 'linux' && arch === 'x64') return 'reccut-keystrokes-linux-x64';
  return null;
}

const SYMBOLS_MAC = { Enter: '↩', Backspace: '⌫', Delete: '⌦', Tab: '⇥' };
const SYMBOLS = {
  Escape: 'Esc', Space: 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Semicolon: ';', Equal: '=', Comma: ',', Minus: '-', Period: '.', Slash: '/', Backquote: '`',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Quote: "'", PageUp: 'PgUp', PageDown: 'PgDn',
};

function keyLabel(name, isMac) {
  if (isMac && SYMBOLS_MAC[name]) return SYMBOLS_MAC[name];
  if (SYMBOLS[name]) return SYMBOLS[name];
  if (name.startsWith('Numpad')) return name.replace('Numpad', 'Num ');
  return name;
}

function comboLabel(name, mods, isMac = process.platform === 'darwin') {
  const label = keyLabel(name, isMac);
  if (isMac) {
    const parts = [mods & MODS.ctrl && '⌃', mods & MODS.alt && '⌥', mods & MODS.shift && '⇧', mods & MODS.meta && '⌘'].filter(Boolean);
    return parts.join('') + (parts.length ? ' ' : '') + label;
  }
  return [mods & MODS.ctrl && 'Ctrl', mods & MODS.alt && 'Alt', mods & MODS.shift && 'Shift', mods & MODS.meta && 'Win', label].filter(Boolean).join(' + ');
}

// Parses one line from the helper. Anything unexpected is ignored.
function parseLine(line) {
  const m = /^K ([A-Za-z0-9]{1,20}) (\d{1,2})$/.exec(line.trim());
  if (m) return { type: 'key', name: m[1], mods: Number(m[2]) & 15 };
  const p = /^([DU]) ([A-Za-z0-9]{1,20})$/.exec(line.trim());
  if (p) return { type: 'press', name: p[2], down: p[1] === 'D' };
  if (line.trim() === 'READY') return { type: 'ready' };
  const e = /^E (\w+)$/.exec(line.trim());
  if (e) return { type: 'error', reason: e[1] };
  return null;
}

// Reccut's own recording shortcuts are never shown in the video.
function appShortcut(modifier, name, mods) {
  if (!modifier || !/^[0-9M]$/.test(name)) return false;
  const parts = modifier.split('+');
  const want = (parts.includes('Control') ? MODS.ctrl : 0) | (parts.includes('Alt') ? MODS.alt : 0) |
    (parts.includes('Shift') ? MODS.shift : 0) | (parts.includes('Command') ? MODS.meta : 0);
  return mods === want;
}

// X11 reports a held key as release and press at the same moment. Nobody presses that fast.
function pushPress(list, t, name, down) {
  const last = list.at(-1);
  if (down && last && last[1] === name && !last[2] && t - last[0] < 0.005) list.pop();
  else list.push([t, name, down ? 1 : 0]);
}

// Presses in a pause are dropped like other events. A key held into the pause is released at
// the pause, so it does not stay lit, and the keys pressed during the pause leave no trace.
function pausedPresses(list, shift) {
  const held = new Set();
  const out = [];
  for (const [t, name, down] of list || []) {
    const s = shift(t);
    if (s.inside) {
      if (!down && held.delete(name)) out.push([s.t, name, 0]);
    } else if (down) {
      held.add(name);
      out.push([s.t, name, 1]);
    } else if (held.delete(name)) out.push([s.t, name, 0]);
  }
  return out;
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function createKeystrokes({ dir, version, repo, fetchImpl, platform = process.platform, arch = process.arch, spawnImpl = spawn, spawnSyncImpl = spawnSync }) {
  const asset = assetName(platform, arch);
  const exe = asset ? path.join(dir, asset) : null;
  const infoFile = path.join(dir, 'addon.json');
  let child = null;

  const info = () => {
    try {
      return JSON.parse(fs.readFileSync(infoFile, 'utf8'));
    } catch {
      return null;
    }
  };

  // The file must still be exactly what was downloaded and checked.
  function intact() {
    const i = info();
    if (!i || !exe || !fs.existsSync(exe)) return false;
    try {
      return sha256(fs.readFileSync(exe)) === i.sha256;
    } catch {
      return false;
    }
  }

  function permission() {
    if (!intact()) return 'unavailable';
    const r = spawnSyncImpl(exe, ['--check'], { encoding: 'utf8', timeout: 4000, windowsHide: true });
    const out = String(r.stdout || '').trim();
    return ['granted', 'denied', 'unavailable'].includes(out) ? out : 'unavailable';
  }

  function status() {
    const i = info();
    const installed = Boolean(i);
    const ok = installed && intact();
    return {
      supported: Boolean(asset),
      installed,
      damaged: installed && !ok,
      version: i?.version || null,
      installedAt: i?.installedAt || null,
      outdated: Boolean(ok && i.version !== version),
      permission: ok ? permission() : null,
      running: Boolean(child),
      game: Boolean(i?.gameConsentAt || i?.fullConsentAt),
      full: Boolean(i?.fullConsentAt),
    };
  }

  async function download(url) {
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(res.status === 404 ? `The Keystroke Add-on is not published for Reccut ${version} yet.` : `GitHub answered ${res.status}.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_SIZE) throw new Error('The download is larger than expected.');
    return buf;
  }

  async function install({ consent } = {}) {
    if (consent !== true) throw new Error('The add-on is only installed after you accept what it does.');
    if (!asset) throw new Error('The Keystroke Add-on is not available for this computer.');
    const base = `https://github.com/${repo.owner}/${repo.name}/releases/download/v${version}/`;
    const sum = String(await download(base + asset + '.sha256')).trim().match(/^[0-9a-f]{64}/i)?.[0]?.toLowerCase();
    if (!sum) throw new Error('The checksum file is missing or invalid.');
    const buf = await download(base + asset);
    if (sha256(buf) !== sum) throw new Error('The download does not match its checksum and was not installed.');
    stop();
    await fs.promises.mkdir(dir, { recursive: true });
    const tmp = `${exe}.download`;
    await fs.promises.writeFile(tmp, buf, { mode: 0o755 });
    await fs.promises.rename(tmp, exe);
    if (platform !== 'win32') await fs.promises.chmod(exe, 0o755);
    const { gameConsentAt, fullConsentAt } = info() || {};
    await fs.promises.writeFile(infoFile, JSON.stringify({ version, sha256: sum, asset, installedAt: new Date().toISOString(), consentAt: new Date().toISOString(), gameConsentAt, fullConsentAt }, null, 1));
    return status();
  }

  // These modes let letters out of the helper, so each has its own consent. Accepting the
  // half does not cover the whole keyboard. It lives here and not in the renderer, and goes
  // away with the add-on.
  async function allowKeyboard({ consent, mode } = {}) {
    if (consent !== true) throw new Error('This keyboard mode is only turned on after you accept what it does.');
    if (mode !== 'half' && mode !== 'full') throw new Error('Unknown keyboard mode.');
    const i = info();
    if (!i) throw new Error('The Keystroke Add-on is not installed.');
    await fs.promises.writeFile(infoFile, JSON.stringify({ ...i, [mode === 'full' ? 'fullConsentAt' : 'gameConsentAt']: new Date().toISOString() }, null, 1));
    return status();
  }

  async function remove() {
    stop();
    await fs.promises.rm(dir, { recursive: true, force: true });
    return status();
  }

  function request() {
    if (!intact()) return 'unavailable';
    const r = spawnSyncImpl(exe, ['--request'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    return String(r.stdout || '').trim() || 'unavailable';
  }

  // Starts the helper for one recording. onEvent gets { type: 'key', name, mods },
  // { type: 'press', name, down } and errors.
  function start(onEvent, { shortcuts = true, keyboard = 'off', mouse = false } = {}) {
    if (child) return true;
    if (!intact()) return false;
    const i = info();
    // A helper from an older release ignores these flags and would send shortcuts anyway.
    const letters = keyboard === 'full' ? i.fullConsentAt && '--full-keyboard' : keyboard === 'half' && (i.gameConsentAt || i.fullConsentAt) && '--game';
    const sources = i.version === version ? [letters, mouse && '--mouse'].filter(Boolean) : [];
    if (!shortcuts && !sources.length) return false;
    const proc = spawnImpl(exe, [...(shortcuts ? [] : ['--no-shortcuts']), ...sources], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    child = proc;
    let rest = '';
    proc.stdout.setEncoding?.('utf8');
    proc.stdout.on('data', (chunk) => {
      const lines = (rest + chunk).split('\n');
      rest = lines.pop().slice(-200);
      for (const line of lines) {
        const e = parseLine(line);
        if (e) onEvent(e);
      }
    });
    const done = () => {
      if (child === proc) child = null;
    };
    proc.on('exit', done);
    proc.on('error', (err) => {
      done();
      onEvent({ type: 'error', reason: 'failed', message: err.message });
    });
    return true;
  }

  // Closing stdin makes the helper quit by itself; kill is the fallback.
  function stop() {
    const proc = child;
    child = null;
    if (!proc) return;
    try {
      proc.stdin?.end();
    } catch {}
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, 1000);
    timer.unref?.();
  }

  return { status, install, allowKeyboard, remove, request, start, stop, running: () => Boolean(child) };
}

module.exports = { createKeystrokes, assetName, comboLabel, parseLine, appShortcut, pushPress, pausedPresses };
