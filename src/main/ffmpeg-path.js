// Hvor FFmpeg ligger. Pakket app: resources/ffmpeg. Utvikling: vendor/ffmpeg (scripts/fetch-ffmpeg.mjs).
const fs = require('fs');
const path = require('path');

const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const target = `${{ darwin: 'mac', win32: 'win' }[process.platform] || 'linux'}-${process.arch}`;
const candidates = [
  process.resourcesPath && path.join(process.resourcesPath, 'ffmpeg', exe),
  path.join(__dirname, '..', '..', 'vendor', 'ffmpeg', target, exe),
].filter(Boolean);

let found = candidates.find((p) => fs.existsSync(p));
if (!found) {
  // ponytail: reserve i utvikling til FFmpeg 9 er hentet. ffmpeg-static er bare en devDependency og følger ikke med appen.
  console.warn('FFmpeg 9 is missing. Run: node scripts/fetch-ffmpeg.mjs');
  found = require('ffmpeg-static');
}
module.exports = found;
