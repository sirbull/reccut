// Bygger braw-decode (native/braw) til vendor/decoders/ når Blackmagic RAW SDK er installert, og kopierer
// Blackmagic sitt API-bibliotek ved siden av. Lisensen (1.1 d) tillater å distribuere API-bibliotekene med appen,
// så brukerne trenger ikke installere noe. Biblioteket signeres med appen, så ingen unntak fra bibliotekssjekken trengs.
// SDK-en er gratis: https://www.blackmagicdesign.com/developer/products/braw/sdk-and-software. Uten den hoppes steget over,
// og denne bygningen av appen kan ikke lese BRAW. BRAW_SDK kan peke på SDK-ens Include-mappe.
// ponytail: Mac og Linux. Windows-versjonen av API-et bruker COM og BSTR og trenger en egen variant.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'vendor', 'decoders');
fs.mkdirSync(outDir, { recursive: true });

const candidates = [
  process.env.BRAW_SDK,
  process.platform === 'darwin' && '/Applications/Blackmagic RAW/Blackmagic RAW SDK/Mac/Include',
  process.platform === 'linux' && '/usr/lib64/blackmagic/BlackmagicRAWSDK/Linux/Include',
].filter(Boolean);
const include = candidates.find((d) => fs.existsSync(path.join(d, 'BlackmagicRawAPI.h')));
if (!include || process.platform === 'win32') {
  console.log('Blackmagic RAW SDK not found: skipping braw-decode. This build cannot read BRAW files.');
  process.exit(0);
}

const out = path.join(outDir, 'braw-decode');
const src = [path.join(root, 'native', 'braw', 'braw-decode.cpp'), path.join(include, 'BlackmagicRawAPIDispatch.cpp')];
const args = ['-std=c++17', '-O2', `-I${include}`, ...src, '-o', out];
if (process.platform === 'darwin') execFileSync('clang++', [...args, '-framework', 'CoreFoundation'], { stdio: 'inherit' });
else execFileSync('g++', [...args, '-ldl', '-lpthread'], { stdio: 'inherit' });
const libs = path.join(include, '..', 'Libraries');
if (process.platform === 'darwin') {
  // ditto beholder symlenkene i rammeverket.
  fs.rmSync(path.join(outDir, 'BlackmagicRawAPI.framework'), { recursive: true, force: true });
  execFileSync('ditto', [path.join(libs, 'BlackmagicRawAPI.framework'), path.join(outDir, 'BlackmagicRawAPI.framework')]);
} else {
  execFileSync('cp', ['-a', `${libs}/.`, outDir]);
}
console.log(`Built ${path.relative(root, out)} with the Blackmagic RAW library`);
