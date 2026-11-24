// Keyboard shortcuts macOS takes before Reccut sees them, such as Control Space for switching keyboard language.
// Read from the user's system settings (com.apple.symbolichotkeys), so Reccut can ask the user to choose another
// shortcut instead of a key that silently does nothing. Nothing is changed in macOS.
const { execFile } = require('node:child_process');

// Hotkeys in com.apple.symbolichotkeys that use the Space bar, with the macOS defaults when the entry is missing.
// 60 and 61 work only when more than one keyboard language (input source) is turned on.
const HOTKEYS = {
  60: { what: 'Select the previous input source (keyboard language)', input: true, default: [32, 49, 262144] },
  61: { what: 'Select the next input source (keyboard language)', input: true, default: [32, 49, 786432] },
  64: { what: 'Show Spotlight search', default: [32, 49, 1048576] },
  65: { what: 'Show Finder search window', default: [32, 49, 1572864] },
};
const KEYCODES = { 49: 'Space' };
const MODS = [
  [1048576, 'Cmd'],
  [262144, 'Ctrl'],
  [524288, 'Alt'],
  [131072, 'Shift'],
];

function accelOf([, keycode, mods]) {
  const key = KEYCODES[keycode];
  if (!key || !Number.isInteger(mods)) return null;
  return [...MODS.filter(([bit]) => mods & bit).map(([, name]) => name), key].join('+');
}

// The keyboard languages that count for switching: layouts and input modes, not emoji or dictation.
function inputSourceCount(hitoolbox) {
  const list = Array.isArray(hitoolbox?.AppleEnabledInputSources) ? hitoolbox.AppleEnabledInputSources : [];
  const ids = new Set(
    list
      .filter((s) => ['Keyboard Layout', 'Input Mode'].includes(s?.InputSourceKind))
      .map((s) => s['Input Mode'] || s['KeyboardLayout Name'] || s['Bundle ID'] || JSON.stringify(s)),
  );
  return ids.size;
}

// hotkeys and hitoolbox are the two preference files as JSON. Returns [{ accel, what }] that macOS uses now.
function reservedFromPrefs(hotkeys, hitoolbox) {
  const table = hotkeys?.AppleSymbolicHotKeys || {};
  const many = inputSourceCount(hitoolbox) > 1;
  const out = [];
  for (const [id, info] of Object.entries(HOTKEYS)) {
    const entry = table[id];
    if (entry && !entry.enabled) continue;
    if (info.input && !many) continue;
    const params = entry?.value?.parameters || info.default;
    const accel = accelOf(params);
    if (accel) out.push({ accel, what: info.what });
  }
  return out;
}

const run = (cmd, args, input) =>
  new Promise((resolve) => {
    const child = execFile(cmd, args, { timeout: 5000, maxBuffer: 4e6 }, (err, stdout) => resolve(err ? null : stdout));
    if (input != null) child.stdin.end(input);
  });
async function readDomain(domain) {
  const xml = await run('/usr/bin/defaults', ['export', domain, '-']);
  if (!xml) return null;
  const json = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], xml);
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null; // Dates and data in the file cannot always become JSON; then nothing is reported.
  }
}

let cached = null;
async function systemReserved() {
  if (process.platform !== 'darwin') return [];
  if (!cached || Date.now() - cached.at > 60000) {
    const [hotkeys, hitoolbox] = await Promise.all([readDomain('com.apple.symbolichotkeys'), readDomain('com.apple.HIToolbox')]);
    cached = { at: Date.now(), list: reservedFromPrefs(hotkeys, hitoolbox) };
  }
  return cached.list;
}

module.exports = { systemReserved, reservedFromPrefs, inputSourceCount, accelOf };
