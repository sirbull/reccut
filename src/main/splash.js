const fs = require('fs');
const path = require('path');

// A small, independent page can paint before the editor bundle starts loading.
function createSplashWindow({ BrowserWindow, version }) {
  const wordmark = fs.readFileSync(path.join(__dirname, '../../assets/reccut-wordmark.svg'), 'utf8');
  const safeVersion = String(version).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const win = new BrowserWindow({
    width: 560,
    height: 360,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#080f1d',
    title: 'Starting Reccut',
    webPreferences: {
      preload: path.join(__dirname, 'preload-splash.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  let status = 'Starting Reccut…';
  let loaded = false;
  let shownAt = null;
  let dismissal = null;
  let dismissalTimer = null;
  let resolveDismissal = null;
  const dismiss = () => {
    clearTimeout(dismissalTimer);
    resolveDismissal?.();
    resolveDismissal = null;
  };
  // Clicking another window can skip the remaining time once the workspace is ready.
  win.on('blur', () => { if (dismissal) dismiss(); });
  win.on('closed', dismiss);
  win.webContents.once('did-finish-load', () => {
    loaded = true;
    win.webContents.send('startup:status', status);
  });
  const ready = new Promise((resolve, reject) => {
    win.once('ready-to-show', () => {
      shownAt = Date.now();
      if (!win.isDestroyed()) win.show();
      resolve();
    });
    win.webContents.once('did-fail-load', (_event, code, description) => reject(new Error(`Splash: ${description} (${code})`)));
    win.webContents.once('render-process-gone', () => reject(new Error('Splash renderer stopped.')));
  });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>Starting Reccut</title><style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:#080f1d;color:#e8e8ea;font:13px -apple-system,system-ui,"Segoe UI",sans-serif;user-select:none}
body{position:relative;border:1px solid #8acbff1a;-webkit-app-region:drag;
background:
radial-gradient(ellipse at 0% 0%,#0078dc47,transparent 65%),
radial-gradient(ellipse at 100% 0%,#e2aa161f,transparent 55%),
radial-gradient(ellipse at 100% 100%,#006bdd3d,transparent 60%),
linear-gradient(135deg,#0b192d,#080e1b 60%,#0a1830)}
.brand{position:absolute;inset:0 0 42px;display:flex;flex-direction:column;align-items:center;justify-content:center}
img{width:256px;height:auto;margin-bottom:24px}
.version{color:#aaaab0;font-size:12px;letter-spacing:.04em}
.credit{margin-top:9px;color:#85858c;font-size:12px}
.credit span{color:#b8b8be}
footer{position:absolute;bottom:0;left:0;right:0;padding:0 30px 25px}
.status{color:#96969e;font-size:11px;letter-spacing:.02em;margin-bottom:13px}
.track{height:2px;background:#ffffff0d;overflow:hidden;border-radius:2px}
.track::after{content:"";display:block;width:35%;height:100%;background:linear-gradient(90deg,transparent,#febb0a,#fdd628,transparent);animation:loading 1.8s ease-in-out infinite}
@keyframes loading{from{transform:translateX(-110%)}to{transform:translateX(390%)}}
@media(prefers-reduced-motion:reduce){.track::after{animation:none;transform:translateX(90%)}}
</style></head><body>
<div class="brand"><img src="data:image/svg+xml,${encodeURIComponent(wordmark)}" alt="Reccut">
<div class="version">Version ${safeVersion}</div>
<div class="credit">Developed by <span>bullfolio.no</span></div></div>
<footer><div id="status" class="status" role="status" aria-live="polite">Starting Reccut…</div><div class="track" aria-hidden="true"></div></footer>
</body></html>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});

  return {
    ready,
    waitForDismissal() {
      if (!dismissal) {
        dismissal = new Promise((resolve) => {
          resolveDismissal = resolve;
          const remaining = Math.max(0, 3000 - (Date.now() - shownAt));
          if (win.isDestroyed() || remaining === 0) dismiss();
          else dismissalTimer = setTimeout(dismiss, remaining);
        });
      }
      return dismissal;
    },
    setStatus(text) {
      status = text;
      if (loaded && !win.isDestroyed()) win.webContents.send('startup:status', status);
    },
    destroy() {
      dismiss();
      if (!win.isDestroyed()) win.destroy();
    },
  };
}

module.exports = { createSplashWindow };
