// Musepeker og pekerzoom under opptak.
// Reccut lytter ikke på tastatur eller mus globalt. Posisjonen hentes ved polling
// med screen.getCursorScreenPoint(), og zoom slås av og på med en vanlig snarvei.
const { screen } = require('electron');

const CURSOR_INTERVAL = 1000 / 120;
const ZOOM_RELEASE_MS = 200;

class InputTracker {
  constructor() {
    this.listener = null;
    this.display = null;
    this.area = null;
    this.session = null;
    this.zoomOn = false;
    this.pollTimer = null;
    this.lastCursor = null;
    this.lastRecordedCursor = null;
    this.lastRecordedAt = 0;
    this.liveUntil = 0;
  }

  stop() {
    this.stopPolling();
  }

  setDisplay(displayId) {
    const displays = screen.getAllDisplays();
    this.display = displays.find((d) => String(d.id) === String(displayId)) || screen.getPrimaryDisplay();
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
    // Følg også musen mens den store pekeren krymper etter at zoom slås av.
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

  // Opptaksdata begrenses til 120 punkter/sekund.
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
    this.session = { t0, cursor: [[0, round(x, 4), round(y, 4)]], zooms: [] };
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
    return { cursor: s.cursor, zooms: s.zooms };
  }
}

function round(v, d = 3) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

module.exports = { InputTracker };
