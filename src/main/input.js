// Globale tastetrykk, musepeker og klikk under opptak.
// Bruker uiohook-napi (libuiohook) for å se tastene selv når andre apper er i fokus.
const { screen, systemPreferences } = require('electron');

const isMac = process.platform === 'darwin';
const CURSOR_INTERVAL = 1000 / 120;
const ZOOM_RELEASE_MS = 200;

let hook = null;
let Key = {};
try {
  const mod = require('uiohook-napi');
  hook = mod.uIOhook;
  Key = mod.UiohookKey;
} catch (err) {
  console.warn('uiohook-napi is not available:', err.message);
}

const codeToName = Object.fromEntries(Object.entries(Key).map(([name, code]) => [code, name]));

// Tastene som kan holdes inne for å forstørre musepekeren.
const ZOOM_KEYS = isMac
  ? [
      { value: 'MetaRight', label: 'Right Command' },
      { value: 'AltRight', label: 'Right Option' },
      { value: 'CtrlRight', label: 'Right Control' },
      { value: 'F8', label: 'F8' },
    ]
  : [
      { value: 'CtrlRight', label: 'Right Ctrl' },
      { value: 'ShiftRight', label: 'Right Shift' },
      { value: 'F8', label: 'F8' },
    ];

const MODIFIER_NAMES = new Set(['Ctrl', 'CtrlRight', 'Alt', 'AltRight', 'Shift', 'ShiftRight', 'Meta', 'MetaRight']);

const SYMBOLS = {
  Enter: isMac ? '↩' : 'Enter',
  Escape: 'Esc',
  Backspace: isMac ? '⌫' : 'Backspace',
  Delete: isMac ? '⌦' : 'Delete',
  Tab: isMac ? '⇥' : 'Tab',
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Semicolon: ';',
  Equal: '=',
  Comma: ',',
  Minus: '-',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Quote: "'",
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

function keyName(code) {
  const name = codeToName[code];
  if (!name) return null;
  if (SYMBOLS[name]) return SYMBOLS[name];
  if (name.startsWith('Numpad')) return name.replace('Numpad', 'Num ');
  return name;
}

function comboLabel(e, name) {
  const parts = [];
  if (isMac) {
    if (e.ctrlKey) parts.push('⌃');
    if (e.altKey) parts.push('⌥');
    if (e.shiftKey) parts.push('⇧');
    if (e.metaKey) parts.push('⌘');
    return parts.join('') + (parts.length ? ' ' : '') + name;
  }
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Win');
  parts.push(name);
  return parts.join(' + ');
}

class InputTracker {
  constructor() {
    this.listener = null;
    this.zoomKey = ZOOM_KEYS[0].value;
    this.appShortcuts = { modifiers: [], keys: [] };
    this.display = null;
    this.area = null;
    this.session = null;
    this.zoomOn = false;
    this.started = false;
    this.pollTimer = null;
    this.lastCursor = null;
    this.lastRecordedCursor = null;
    this.lastRecordedAt = 0;
    this.liveUntil = 0;
    this.onMouseMove = () => {
      if (this.pollTimer) this.sampleCursor();
    };
  }

  available() {
    return Boolean(hook);
  }

  // På Mac krever globale tastetrykk tilgang under Tilgjengelighet.
  permission(prompt = false) {
    if (!hook) return 'unavailable';
    if (!isMac) return 'granted';
    return systemPreferences.isTrustedAccessibilityClient(prompt) ? 'granted' : 'denied';
  }

  start() {
    if (this.started || !hook || this.permission() !== 'granted') return this.started;
    hook.on('keydown', (e) => this.onKey(e, true));
    hook.on('keyup', (e) => this.onKey(e, false));
    hook.on('mousedown', () => this.onClick());
    hook.on('mousemove', this.onMouseMove);
    try {
      hook.start();
      this.started = true;
    } catch (err) {
      hook.removeListener('mousemove', this.onMouseMove);
      console.warn('Could not start the keyboard listener:', err.message);
    }
    return this.started;
  }

  stop() {
    this.stopPolling();
    hook?.removeListener('mousemove', this.onMouseMove);
    if (this.started) hook.stop();
    this.started = false;
  }

  setDisplay(displayId) {
    const displays = screen.getAllDisplays();
    this.display = displays.find((d) => String(d.id) === String(displayId)) || screen.getPrimaryDisplay();
  }

  setAppShortcuts(modifier) {
    // Egne snarveier skal aldri vises som tastetrykk i opptaket.
    const parts = modifier.split('+');
    this.appShortcuts = {
      ctrl: parts.includes('Control'),
      alt: parts.includes('Alt'),
      shift: parts.includes('Shift'),
      meta: parts.includes('Command'),
      keys: new Set(['0', '1', '2', '3', '4', '5', '6', '9']),
    };
  }

  isAppShortcut(e, name) {
    const s = this.appShortcuts;
    if (!s.keys || !s.keys.has(name)) return false;
    return e.ctrlKey === s.ctrl && e.altKey === s.alt && e.shiftKey === s.shift && e.metaKey === s.meta;
  }

  cursorPoint() {
    if (!this.display) this.setDisplay(null);
    const p = screen.getCursorScreenPoint();
    const b = this.display.bounds;
    const x = (p.x - b.x) / b.width;
    const y = (p.y - b.y) / b.height;
    // Tar vi bare opp et område, regnes posisjonen i forhold til området.
    const a = this.area;
    if (a && a.w > 0 && a.h > 0) return [(x - a.x) / a.w, (y - a.y) / a.h];
    return [x, y];
  }

  now() {
    return this.session ? (Date.now() - this.session.t0) / 1000 : 0;
  }

  emit(event) {
    this.listener?.(event);
  }

  setZoom(on) {
    if (on === this.zoomOn) return;
    this.zoomOn = on;
    // Følg også musen mens den store pekeren krymper etter at tasten slippes.
    if (!on) this.liveUntil = Math.max(this.liveUntil, Date.now() + ZOOM_RELEASE_MS);
    const [x, y] = this.cursorPoint();
    if (this.session) {
      const t = this.now();
      if (on) this.session.zooms.push([t, null]);
      else {
        const last = this.session.zooms.at(-1);
        if (last && last[1] === null) last[1] = t;
      }
      this.session.cursor.push([round(t), round(x, 4), round(y, 4)]);
    }
    this.emit({ type: 'zoom', on, x, y });
  }

  toggleZoom() {
    this.setZoom(!this.zoomOn);
  }

  onKey(e, down) {
    const name = codeToName[e.keycode];
    if (name === this.zoomKey) {
      this.setZoom(down);
      return;
    }
    if (!down || !name || MODIFIER_NAMES.has(name)) return;
    if (this.isAppShortcut(e, name)) return;

    const label = keyName(e.keycode);
    if (!label) return;
    const hasCommandModifier = e.ctrlKey || e.altKey || e.metaKey;
    const standalone = name === 'Escape' || /^F\d+$/.test(name);
    // Vanlig skriving vises ikke, bare snarveier. Da lekker heller ikke passord.
    if (!hasCommandModifier && !standalone) return;
    const text = comboLabel(e, label);
    if (this.session) this.session.keys.push([round(this.now()), text]);
    this.emit({ type: 'key', label: text });
  }

  onClick() {
    const [x, y] = this.cursorPoint();
    if (this.session) this.session.clicks.push([round(this.now()), round(x, 4), round(y, 4)]);
    this.liveUntil = Date.now() + 700;
    this.emit({ type: 'click', x, y });
  }

  // Native musehendelser oppdaterer forhåndsvisningen straks. Polling er reserve
  // (bl.a. ved draoperasjoner), og opptaksdata begrenses til 120 punkter/sekund.
  sampleCursor() {
    const [x, y] = this.cursorPoint();
    const now = Date.now();
    const moved = !this.lastCursor || this.lastCursor[0] !== x || this.lastCursor[1] !== y;
    this.lastCursor = [x, y];
    const recorded = this.lastRecordedCursor;
    if (this.session && (!recorded || recorded[0] !== x || recorded[1] !== y) && now - this.lastRecordedAt >= CURSOR_INTERVAL) {
      this.session.cursor.push([round(this.now()), round(x, 6), round(y, 6)]);
      this.lastRecordedCursor = [x, y];
      this.lastRecordedAt = now;
    }
    if (moved && (this.zoomOn || now < this.liveUntil)) this.emit({ type: 'cursor', x, y });
  }

  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.sampleCursor(), Math.ceil(CURSOR_INTERVAL));
  }

  stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  beginSession(t0) {
    const [x, y] = this.cursorPoint();
    this.session = { t0, cursor: [[0, round(x, 4), round(y, 4)]], zooms: [], clicks: [], keys: [] };
    if (this.zoomOn) this.session.zooms.push([0, null]);
    this.lastCursor = [x, y];
    this.lastRecordedCursor = [x, y];
    this.lastRecordedAt = Date.now();
  }

  endSession() {
    const s = this.session;
    this.session = null;
    if (!s) return null;
    const end = (Date.now() - s.t0) / 1000;
    for (const z of s.zooms) if (z[1] === null) z[1] = round(end);
    return { cursor: s.cursor, zooms: s.zooms, clicks: s.clicks, keys: s.keys };
  }
}

function round(v, d = 3) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

module.exports = { InputTracker, ZOOM_KEYS };
