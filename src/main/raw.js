// RAW-bilder fra kamera (CR2, CR3, NEF, ARW, DNG, RAF, ORF, RW2 og flere).
// Nesten alle RAW-filer har en innebygd JPEG i full eller stor oppløsning, laget av kameraet med
// kameraets hvitbalanse. Den hentes ut og brukes som bilde. Selve RAW-dataene fremkalles ikke.
const fs = require('fs');

const RAW_EXT = new Set(['.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.dng', '.raf', '.orf', '.rw2', '.rwl', '.pef', '.srw', '.x3f', '.3fr', '.fff', '.iiq', '.erf', '.mos', '.mrw', '.kdc', '.dcr', '.mef']);

// Går gjennom markørene i en JPEG fra start og finner slutten (EOI). Gir lengden, eller 0 om den ikke er gyldig.
function jpegLength(buf, start) {
  if (buf[start] !== 0xff || buf[start + 1] !== 0xd8) return 0;
  let p = start + 2;
  let width = 0;
  let height = 0;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) return 0;
    const marker = buf[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd9) return { length: p + 2 - start, width, height };
    if (marker >= 0xd0 && marker <= 0xd7) {
      p += 2;
      continue;
    }
    const len = buf.readUInt16BE(p + 2);
    if (len < 2) return 0;
    // SOF-markører har bildestørrelsen.
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      height = buf.readUInt16BE(p + 5);
      width = buf.readUInt16BE(p + 7);
    }
    if (marker === 0xda) {
      // Etter SOS kommer komprimerte data. Let etter FF D9 som ikke er fylt (FF 00) eller en restart.
      let q = p + 2 + len;
      while (q + 1 < buf.length) {
        if (buf[q] === 0xff) {
          const n = buf[q + 1];
          if (n === 0xd9) return { length: q + 2 - start, width, height };
          if (n !== 0x00 && !(n >= 0xd0 && n <= 0xd7) && n !== 0xff) {
            // En ny markør etter skannedataene (for eksempel progressiv JPEG med flere skann).
            p = q;
            break;
          }
        }
        q++;
      }
      if (q + 1 >= buf.length) return 0;
      continue;
    }
    p += 2 + len;
  }
  return 0;
}

// Den største gyldige JPEG-en i filen.
function largestJpeg(buf) {
  let best = null;
  let i = 0;
  while ((i = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i)) >= 0) {
    const r = jpegLength(buf, i);
    if (r && r.length > 2000 && r.width > 0 && (!best || r.width * r.height > best.width * best.height || (r.width * r.height === best.width * best.height && r.length > best.length))) {
      best = { start: i, ...r };
    }
    i += r && r.length ? r.length : 3;
  }
  return best;
}

// Orientering fra TIFF-baserte RAW-filer (tagg 274 i første IFD). 1 er normal, 3, 6 og 8 er rotert.
function tiffOrientation(buf) {
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  const be = buf[0] === 0x4d && buf[1] === 0x4d;
  if (!le && !be) return 1;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  try {
    const ifd = u32(4);
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const p = ifd + 2 + k * 12;
      if (u16(p) === 274) return u16(p + 8) || 1;
    }
  } catch {}
  return 1;
}

/**
 * Henter ut den innebygde forhåndsvisningen. Gir { file, width, height, orientation } eller null.
 * Store filer leses helt, siden forhåndsvisningen kan ligge hvor som helst i filen.
 */
async function extractPreview(file, out) {
  const buf = await fs.promises.readFile(file);
  const jpg = largestJpeg(buf);
  if (!jpg) return null;
  await fs.promises.writeFile(out, buf.subarray(jpg.start, jpg.start + jpg.length));
  return { file: out, width: jpg.width, height: jpg.height, orientation: tiffOrientation(buf) };
}

module.exports = { RAW_EXT, extractPreview, largestJpeg, tiffOrientation, jpegLength };
