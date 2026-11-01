// Henter FFmpeg 9 til vendor/ffmpeg/<os>-<arch>/, der appen og electron-builder finner den.
// Bruk: node scripts/fetch-ffmpeg.mjs [mac-arm64|mac-x64|win-x64|linux-x64|linux-arm64]
// Uten argument hentes den for maskinen du står på. Filene er festet med sjekksum.
// Byggene er GPL uten --enable-nonfree, så de kan distribueres sammen med appen.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const VERSION = '9.0.2';
const RIEDL = 'https://ffmpeg.martin-riedl.de/download/macos';
// ponytail: BtbN rydder bort gamle autobuilds etter en stund. Forsvinner lenken, bytt til en nyere autobuild-tag og sjekksum.
const BTBN = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-31-12-59/ffmpeg-n9.0.2-39-g7adfbe40dc';
const BUILDS = {
  'mac-arm64': { url: `${RIEDL}/arm64/1789931890_9.0.2/ffmpeg.zip`, sha256: 'c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924', source: 'https://ffmpeg.martin-riedl.de' },
  'mac-x64': { url: `${RIEDL}/amd64/1789931006_9.0.2/ffmpeg.zip`, sha256: '7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4', source: 'https://ffmpeg.martin-riedl.de' },
  'win-x64': { url: `${BTBN}-win64-gpl-9.0.zip`, sha256: '693f3e224bc184b40524a62ca47526cfebaf2504414021b92fe75f677ad868b9', source: 'https://github.com/BtbN/FFmpeg-Builds' },
  'linux-x64': { url: `${BTBN}-linux64-gpl-9.0.tar.xz`, sha256: '73e29a56974ae5a651133a04584c7483b21afe941e17dc91d79814a758b608d3', source: 'https://github.com/BtbN/FFmpeg-Builds' },
  'linux-arm64': { url: `${BTBN}-linuxarm64-gpl-9.0.tar.xz`, sha256: '6cad88ae5bcec356cfc5d7979a036cc4007128201928a0cf243df3db483276cc', source: 'https://github.com/BtbN/FFmpeg-Builds' },
};

const target = process.argv[2] || `${{ darwin: 'mac', win32: 'win' }[process.platform] || 'linux'}-${process.arch}`;
const build = BUILDS[target];
if (!build) throw new Error(`No FFmpeg build for ${target}. Choose one of ${Object.keys(BUILDS).join(', ')}.`);

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'vendor', 'ffmpeg', target);
const exe = target.startsWith('win') ? 'ffmpeg.exe' : 'ffmpeg';
const versionFile = path.join(outDir, 'VERSION');
if (fs.existsSync(path.join(outDir, exe)) && fs.readFileSync(versionFile, 'utf8').trim() === `${VERSION} ${build.sha256}`) {
  console.log(`FFmpeg ${VERSION} for ${target} is already in place.`);
  process.exit(0);
}

console.log(`Downloading FFmpeg ${VERSION} for ${target}…`);
const res = await fetch(build.url);
if (!res.ok) throw new Error(`Download failed (${res.status}): ${build.url}`);
const data = Buffer.from(await res.arrayBuffer());
const sum = crypto.createHash('sha256').update(data).digest('hex');
if (sum !== build.sha256) throw new Error(`Checksum mismatch for ${build.url}: ${sum}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reccut-ffmpeg-'));
const archive = path.join(tmp, path.basename(new URL(build.url).pathname));
fs.writeFileSync(archive, data);
// tar (bsdtar på Mac og Windows) pakker ut både zip og tar.xz.
execFileSync('tar', ['-xf', archive, '-C', tmp]);
const find = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const hit = find(p);
      if (hit) return hit;
    } else if (e.name === exe) return p;
  }
  return null;
};
const bin = find(tmp);
if (!bin) throw new Error(`No ${exe} in ${archive}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(bin, path.join(outDir, exe));
fs.chmodSync(path.join(outDir, exe), 0o755);
fs.writeFileSync(
  path.join(outDir, 'LICENSE-FFmpeg.txt'),
  `This application includes FFmpeg ${VERSION} (https://ffmpeg.org), licensed under the GNU General Public License version 3.\nThe binary is an unmodified build from ${build.source}.\nSource code: https://ffmpeg.org/releases/ffmpeg-${VERSION}.tar.xz and the build scripts at ${build.source}.\n`
);
fs.writeFileSync(versionFile, `${VERSION} ${build.sha256}\n`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`FFmpeg ${VERSION} is in ${path.relative(root, outDir)}.`);
