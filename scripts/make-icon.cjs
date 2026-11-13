// Renders the R from the wordmark to assets/icon.png (1024px for Windows/Linux)
// and assets/icon-mac.png (824px body on a 1024 canvas, Apple's icon grid).
// electron-builder turns the PNG into .icns/.ico. Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs'),
  path = require('path');

const root = path.join(__dirname, '..');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const wordmark = fs.readFileSync(path.join(root, 'assets/reccut-wordmark.svg'), 'utf8');
  const html = `<!doctype html><html><head><style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
    svg { display: block; width: 100%; height: 100%; }
  </style></head><body>${wordmark.replace(/<\?xml[^>]*\?>/, '')}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await win.webContents.executeJavaScript(`
    const svg = document.querySelector('svg');
    const paths = [...svg.querySelectorAll('path')];
    // The wordmark ends with the gold play triangle and the white R.
    for (const letter of paths.slice(0, -2)) letter.remove();
    const bounds = svg.getBBox();
    const size = Math.max(bounds.width, bounds.height) * 1.08;
    const x = bounds.x + (bounds.width - size) / 2;
    const y = bounds.y + (bounds.height - size) / 2;
    svg.setAttribute('viewBox', [x, y, size, size].join(' '));
    svg.setAttribute('width', '1024');
    svg.setAttribute('height', '1024');
    svg.style.background = 'transparent';
    new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  `);
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  fs.writeFileSync(path.join(root, 'assets/icon.png'), img.resize({ width: 1024, height: 1024 }).toPNG());
  const body = img.resize({ width: 824, height: 824, quality: 'best' }).toBitmap();
  const canvas = Buffer.alloc(1024 * 1024 * 4);
  for (let y = 0; y < 824; y++) body.copy(canvas, ((y + 100) * 1024 + 100) * 4, y * 824 * 4, (y + 1) * 824 * 4);
  fs.writeFileSync(path.join(root, 'assets/icon-mac.png'), nativeImage.createFromBitmap(canvas, { width: 1024, height: 1024 }).toPNG());
  app.quit();
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
