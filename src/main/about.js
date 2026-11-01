// Eget About-vindu, siden systemets About-panel bare kan vise ikon og tekst, ikke wordmarket.
const { app, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

let win = null;

function html() {
  const wordmark = fs.readFileSync(path.join(__dirname, '../../assets/reccut-wordmark.svg'), 'utf8');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>About Reccut</title><style>
html,body{margin:0;height:100%;background:#1c1c1e;color:#e8e8ea;font:13px -apple-system,system-ui,"Segoe UI",sans-serif;user-select:none;-webkit-app-region:drag}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
img{height:56px;margin-bottom:14px}
.v{color:#a5a5aa}
a{color:#a5a5aa;text-decoration:none;-webkit-app-region:no-drag}
a:hover{color:#e8e8ea;text-decoration:underline}
</style></head><body>
<img src="data:image/svg+xml,${encodeURIComponent(wordmark)}" alt="Reccut">
<div class="v">Version ${app.getVersion()}</div>
<div class="v">Developed by <a href="https://bullfolio.no">bullfolio.no</a></div>
</body></html>`;
}

function show() {
  if (win) return win.focus();
  win = new BrowserWindow({
    width: 340,
    height: 240,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1c1c1e',
    show: false,
    title: 'About Reccut',
  });
  win.setMenuBarVisibility(false);
  const openLink = (url) => {
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

module.exports = { show };
