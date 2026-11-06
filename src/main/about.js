// Eget About-vindu, siden systemets About-panel bare kan vise ikon og tekst, ikke wordmarket.
const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;
let licensesWin = null;
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const licenseDir = () => app.isPackaged
  ? path.join(process.resourcesPath, 'licenses')
  : path.join(__dirname, '../../build/licenses');

function showLicenses() {
  if (licensesWin) {
    if (licensesWin.isMinimized()) licensesWin.restore();
    licensesWin.show();
    return licensesWin.focus();
  }
  const dir = licenseDir();
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  // Only links recorded by the local build may leave this read-only window.
  const allowed = new Set(manifest.components.map((c) => new URL(c.source).href));
  const openLink = (url) => {
    if (url === 'reccut-licenses://folder') {
      void shell.openPath(dir);
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && allowed.has(parsed.href)) {
        void shell.openExternal(parsed.href);
      }
    } catch {}
  };
  const created = new BrowserWindow({
    width: 880, height: 760, minWidth: 440, minHeight: 360,
    title: 'Reccut — Third-party licenses', backgroundColor: '#1c1c1e',
    autoHideMenuBar: true, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  licensesWin = created;
  created.setMenuBarVisibility(false);
  created.webContents.setWindowOpenHandler(({ url }) => (openLink(url), { action: 'deny' }));
  created.webContents.on('will-navigate', (e, url) => { e.preventDefault(); openLink(url); });
  created.once('ready-to-show', () => created.show());
  created.on('closed', () => { if (licensesWin === created) licensesWin = null; });
  created.loadFile(path.join(dir, 'index.html'));
}

function html() {
  const wordmark = fs.readFileSync(path.join(__dirname, '../../assets/reccut-wordmark.svg'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>About Reccut</title><style>
html,body{margin:0;height:100%;background:#1c1c1e;color:#e8e8ea;font:13px -apple-system,system-ui,"Segoe UI",sans-serif;user-select:none;-webkit-app-region:drag}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
img{height:56px;margin-bottom:14px}
.v{color:#a5a5aa}
.notice{max-width:290px;text-align:center;color:#a5a5aa;font-size:12px;line-height:1.5;margin:9px 16px 3px}
a{color:#a5a5aa;text-decoration:none;-webkit-app-region:no-drag}
a:hover{color:#e8e8ea;text-decoration:underline}
a:focus-visible{outline:2px solid #9fc4ff;outline-offset:4px}
</style></head><body>
<img src="data:image/svg+xml,${encodeURIComponent(wordmark)}" alt="Reccut">
<div class="v">Version ${escape(app.getVersion())}</div>
<div class="v">Developed by <a href="https://bullfolio.no">bullfolio.no</a></div>
<p class="notice">Includes open-source software, models and artwork. Each component retains its own license.</p>
<a href="reccut-licenses://show">Third-party licenses</a>
</body></html>`;
}

function show() {
  if (win) return win.focus();
  win = new BrowserWindow({
    width: 360,
    height: 320,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1c1c1e',
    show: false,
    title: 'About Reccut',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.setMenuBarVisibility(false);
  const openLink = (url) => {
    if (url === 'reccut-licenses://show') return showLicenses();
    if (url === 'https://bullfolio.no/') shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => (openLink(url), { action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    e.preventDefault();
    openLink(url);
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => (win = null));
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html())}`);
}

module.exports = { show, showLicenses };
