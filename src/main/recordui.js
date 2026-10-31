// Opptakskontroller utenfor vinduet: et ikon i menylinjen (macOS) eller i systemstatusfeltet
// (Windows), og en liten kontrollinje som flyter over andre programmer under opptak.
// Kontrollinjen er skjult for skjermopptak (macOS og Windows), så den ikke havner i videoen.
const { BrowserWindow, Menu, Tray, nativeImage, screen } = require('electron');
const path = require('path');

const isMac = process.platform === 'darwin';

/* Ikoner tegnes piksel for piksel, så appen ikke trenger bildefiler. */
function drawIcon(size, kind) {
  const buf = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const r = size * 0.36;
  const color = kind === 'idle' ? [0, 0, 0] : kind === 'paused' ? [0x0a, 0x9f, 0xf5] : [0x30, 0x3b, 0xff]; // BGR
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let a = 0;
      if (kind === 'idle') {
        // Ring med en prikk i midten.
        const ring = 1 - Math.min(1, Math.abs(d - r) / (size * 0.07));
        const dot = Math.max(0, Math.min(1, r * 0.45 - d + 0.5));
        a = Math.max(ring, dot);
      } else if (kind === 'paused') {
        const inBar = (x0) => x + 0.5 > x0 && x + 0.5 < x0 + size * 0.16 && y + 0.5 > size * 0.24 && y + 0.5 < size * 0.76;
        a = inBar(size * 0.3) || inBar(size * 0.54) ? 1 : 0;
      } else a = Math.max(0, Math.min(1, r - d + 0.5));
      const i = (y * size + x) * 4;
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return buf;
}

function icon(kind) {
  const img = nativeImage.createFromBitmap(drawIcon(16, kind), { width: 16, height: 16 });
  img.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: drawIcon(32, kind) });
  if (isMac && kind === 'idle') img.setTemplateImage(true);
  return img;
}

const fmt = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};

const CONTROL_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;overflow:hidden;background:transparent;font:600 13px -apple-system,system-ui,"Segoe UI",sans-serif;color:#fff;user-select:none}
#bar{position:fixed;inset:4px;display:flex;align-items:center;gap:8px;padding:0 8px 0 12px;border-radius:12px;background:rgba(28,28,30,.94);box-shadow:0 6px 20px rgba(0,0,0,.45);-webkit-app-region:drag}
#dot{width:11px;height:11px;border-radius:50%;background:#ff453a;box-shadow:0 0 0 3px rgba(255,69,58,.25)}
.paused #dot{background:#f5a50a;box-shadow:0 0 0 3px rgba(245,165,10,.25)}
.count #dot{background:#888;box-shadow:none}
#time{font-variant-numeric:tabular-nums;min-width:52px}
#meter{width:46px;height:5px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
#meter div{height:100%;width:0;background:#30d158;transition:width .1s}
button{-webkit-app-region:no-drag;border:0;border-radius:8px;height:30px;padding:0 10px;background:rgba(255,255,255,.1);color:#fff;font:inherit;cursor:pointer;display:flex;align-items:center;gap:6px}
button:hover{background:rgba(255,255,255,.18)}
#stop{background:#ff453a}
#stop:hover{background:#ff5d53}
.sq{width:10px;height:10px;border-radius:2px;background:#fff}
.bars{display:flex;gap:3px}.bars i{width:3px;height:11px;background:#fff;border-radius:1px}
.tri{width:0;height:0;border-left:10px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent}
</style></head><body><div id="bar">
<div id="dot"></div><div id="time">0:00</div><div id="meter" title="Microphone level"><div></div></div>
<button id="pause" title="Pause"><span class="bars"><i></i><i></i></span></button>
<button id="stop" title="Stop recording"><span class="sq"></span>Stop</button>
</div><script>
const bar=document.getElementById('bar'),time=document.getElementById('time'),meter=document.querySelector('#meter div'),pause=document.getElementById('pause');
document.getElementById('stop').onclick=()=>control.send(bar.classList.contains('count')?'cancel':'stop');
pause.onclick=()=>control.send(bar.classList.contains('paused')?'resume':'pause');
control.onState((s)=>{bar.className=s.state==='paused'?'paused':s.state==='countdown'?'count':'';
time.textContent=s.state==='countdown'?'Starting in '+s.countdown:s.time;meter.style.width=Math.round((s.level||0)*100)+'%';
pause.style.display=s.state==='countdown'?'none':'flex';
pause.innerHTML=s.state==='paused'?'<span class="tri"></span>':'<span class="bars"><i></i><i></i></span>';pause.title=s.state==='paused'?'Resume':'Pause';
document.getElementById('stop').lastChild.textContent=s.state==='countdown'?'Cancel':'Stop';});
</script></body></html>`;

function createRecordUI({ send, getMainWindow, modifierLabel }) {
  let tray = null;
  let control = null;
  let controlReady = null;
  let state = { state: 'idle', elapsed: 0, level: 0, countdown: 0 };
  let showControls = true;
  let lastKind = '';
  const icons = {};
  const getIcon = (k) => (icons[k] ||= icon(k));

  function menu() {
    const s = state.state;
    const mod = modifierLabel();
    return Menu.buildFromTemplate([
      { label: s === 'idle' ? 'Not recording' : s === 'countdown' ? `Starting in ${state.countdown}` : `${s === 'paused' ? 'Paused' : 'Recording'} ${fmt(state.elapsed)}`, enabled: false },
      { type: 'separator' },
      s === 'idle'
        ? { label: 'Start Recording', accelerator: `${mod}+0`, registerAccelerator: false, click: () => send('shortcut', { toggleRecord: true }) }
        : { label: s === 'countdown' ? 'Cancel' : 'Stop Recording', accelerator: `${mod}+0`, registerAccelerator: false, click: () => send('shortcut', { toggleRecord: true }) },
      { label: s === 'paused' ? 'Resume' : 'Pause', enabled: s === 'recording' || s === 'paused', accelerator: `${mod}+8`, registerAccelerator: false, click: () => send('shortcut', { togglePause: true }) },
      { type: 'separator' },
      { label: 'Show Reccut', click: showMain },
    ]);
  }

  function showMain() {
    const w = getMainWindow();
    if (!w) return;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }

  function ensureTray() {
    if (tray) return;
    tray = new Tray(getIcon('idle'));
    tray.setToolTip('Reccut');
    tray.on('click', () => (isMac ? tray.popUpContextMenu(menu()) : showMain()));
    tray.on('right-click', () => tray.popUpContextMenu(menu()));
    tray.setContextMenu(isMac ? null : menu());
  }

  function updateTray() {
    ensureTray();
    const kind = state.state === 'recording' ? 'rec' : state.state === 'paused' ? 'paused' : 'idle';
    if (kind !== lastKind) {
      tray.setImage(getIcon(kind));
      lastKind = kind;
    }
    const label = state.state === 'idle' ? '' : state.state === 'countdown' ? ` ${state.countdown}` : ` ${fmt(state.elapsed)}`;
    // macOS: tiden står ved ikonet i menylinjen. Windows: i verktøytipset.
    if (isMac) tray.setTitle(label, { fontType: 'monospacedDigit' });
    tray.setToolTip(state.state === 'idle' ? 'Reccut' : `Reccut: ${state.state === 'paused' ? 'paused' : 'recording'}${label}`);
    if (!isMac) tray.setContextMenu(menu());
  }

  function ensureControl() {
    if (control && !control.isDestroyed()) return;
    const d = screen.getPrimaryDisplay().workArea;
    const W = 290;
    const H = 52;
    control = new BrowserWindow({
      width: W,
      height: H,
      x: Math.round(d.x + d.width / 2 - W / 2),
      y: Math.round(d.y + d.height - H - 24),
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'preload-control.js'), sandbox: true, contextIsolation: true },
    });
    control.setAlwaysOnTop(true, 'screen-saver');
    control.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    // Skjult for skjermopptak på macOS og Windows.
    control.setContentProtection(true);
    controlReady = control.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(CONTROL_HTML)}`);
  }

  function updateControl() {
    const active = state.state !== 'idle';
    if (!active || !showControls) {
      if (control && !control.isDestroyed()) control.hide();
      return;
    }
    ensureControl();
    const c = control;
    const payload = { state: state.state, time: fmt(state.elapsed), level: state.level, countdown: state.countdown };
    controlReady.then(() => {
      if (c.isDestroyed()) return;
      c.webContents.send('control:state', payload);
      if (!c.isVisible()) c.showInactive();
    });
  }

  return {
    init() {
      ensureTray();
      updateTray();
    },
    setState(s) {
      state = { ...state, ...s };
      updateTray();
      updateControl();
    },
    setShowControls(v) {
      showControls = v;
      updateControl();
    },
    command(cmd) {
      if (cmd === 'stop' || cmd === 'cancel') send('shortcut', { toggleRecord: true });
      else if (cmd === 'pause' || cmd === 'resume') send('shortcut', { togglePause: true });
    },
    refreshMenu() {
      if (tray && !isMac) tray.setContextMenu(menu());
    },
    destroy() {
      if (control && !control.isDestroyed()) control.destroy();
      tray?.destroy();
      tray = null;
    },
  };
}

module.exports = { createRecordUI, fmt };
