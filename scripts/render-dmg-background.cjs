// Renders assets/dmg-background(@2x).png. Run: env -u ELECTRON_RUN_AS_NODE npx electron scripts/render-dmg-background.cjs "$PWD"
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const repo = process.argv[process.argv.length - 1];
const wordmark = fs.readFileSync(path.join(repo, 'assets/reccut-wordmark.svg'), 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;width:660px;height:400px;overflow:hidden}
html{zoom:2}
body{position:relative;color:#e8e8ea;font:13px -apple-system,system-ui,sans-serif;
background:
radial-gradient(ellipse at 0% 0%,#0078dc47,transparent 65%),
radial-gradient(ellipse at 100% 0%,#e2aa161f,transparent 55%),
radial-gradient(ellipse at 100% 100%,#006bdd3d,transparent 60%),
linear-gradient(135deg,#0b192d,#080e1b 60%,#0a1830)}
img{position:absolute;top:34px;left:50%;transform:translateX(-50%);width:150px}
/* Finder always draws icon labels in black on picture backgrounds, so each label sits on a light pill. */
.pill{position:absolute;top:254px;width:100px;height:22px;margin-left:-50px;border-radius:11px;background:#e9eef5;box-shadow:0 4px 14px #0000004d}
svg.arrow{position:absolute;left:280px;top:177px;width:100px;height:46px}
</style></head><body>
<img src="data:image/svg+xml,${encodeURIComponent(wordmark)}">
<div class="pill" style="left:180px"></div><div class="pill" style="left:480px"></div>
<svg class="arrow" viewBox="0 0 100 46"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#febb0a" stop-opacity="0"/><stop offset=".55" stop-color="#febb0a"/><stop offset="1" stop-color="#fdd628"/></linearGradient></defs>
<path d="M6 23H88M74 9l14 14-14 14" fill="none" stroke="url(#g)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
</body></html>`;
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1320, height: 800, show: false, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1320, height: 800 });
  const out = img.resize({ width: 1320, height: 800 });
  fs.writeFileSync(path.join(repo, 'assets/dmg-background@2x.png'), out.toPNG());
  fs.writeFileSync(path.join(repo, 'assets/dmg-background.png'), img.resize({ width: 660, height: 400, quality: 'best' }).toPNG());
  app.quit();
});
