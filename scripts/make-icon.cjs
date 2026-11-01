// Renders DESIGN/reccut_icon.svg to assets/icon.png (1024px, full bleed for Windows/Linux) and assets/icon-mac.png
// (824px body on a 1024 canvas, Apple's icon grid) with Chromium, so filters and blend modes come out right.
// electron-builder turns the PNG into .icns/.ico. Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs'),
  path = require('path');

const root = path.join(__dirname, '..');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadFile(path.join(root, 'DESIGN/reccut_icon.svg'));
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
