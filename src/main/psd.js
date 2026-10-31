// Photoshop-filer (PSD og PSB) med lag. Leser lagene (navn, grupper, synlighet, dekkevne og piksler)
// og skriver hvert lag som PNG i dokumentets størrelse, så lagene ligger riktig over hverandre.
// Støtter RGB, gråtone og CMYK i 8, 16 og 32 bit, ukomprimert og RLE. Blandingsmoduser, masker
// og lageffekter brukes ikke; lagene blir vanlige bilder med gjennomsiktighet.
const fs = require('fs');
const zlib = require('zlib');

class Reader {
  constructor(buf, big) {
    this.b = buf;
    this.p = 0;
    this.big = big;
  }
  u8() {
    return this.b[this.p++];
  }
  u16() {
    const v = this.b.readUInt16BE(this.p);
    this.p += 2;
    return v;
  }
  i16() {
    const v = this.b.readInt16BE(this.p);
    this.p += 2;
    return v;
  }
  u32() {
    const v = this.b.readUInt32BE(this.p);
    this.p += 4;
    return v;
  }
  i32() {
    const v = this.b.readInt32BE(this.p);
    this.p += 4;
    return v;
  }
  u64() {
    const hi = this.b.readUInt32BE(this.p);
    const lo = this.b.readUInt32BE(this.p + 4);
    this.p += 8;
    return hi * 2 ** 32 + lo;
  }
  // Lengder er 8 byte i PSB (store dokumenter) og 4 byte i PSD.
  len() {
    return this.big ? this.u64() : this.u32();
  }
  str(n) {
    const s = this.b.toString('latin1', this.p, this.p + n);
    this.p += n;
    return s;
  }
  skip(n) {
    this.p += n;
  }
}

// PackBits, brukt av Photoshop sin RLE-komprimering.
function unpackBits(src, start, end, out, outStart, outLen) {
  let i = start;
  let o = outStart;
  const stop = outStart + outLen;
  while (i < end && o < stop) {
    const n = (src[i] << 24) >> 24;
    i++;
    if (n >= 0) {
      const count = n + 1;
      src.copy(out, o, i, Math.min(i + count, end));
      i += count;
      o += count;
    } else if (n > -128) {
      const count = 1 - n;
      out.fill(src[i], o, Math.min(o + count, stop));
      i++;
      o += count;
    }
  }
}

// Leser én kanal (plan) med w × h verdier og gjør den om til 8 bit.
function readChannel(r, w, h, depth, end) {
  const bpp = depth / 8;
  const rowBytes = w * bpp;
  const raw = Buffer.alloc(rowBytes * h);
  const comp = r.u16();
  if (comp === 0) {
    r.b.copy(raw, 0, r.p, Math.min(r.p + raw.length, end));
  } else if (comp === 1) {
    const counts = [];
    for (let y = 0; y < h; y++) counts.push(r.big ? r.u32() : r.u16());
    let p = r.p;
    for (let y = 0; y < h; y++) {
      unpackBits(r.b, p, Math.min(p + counts[y], end), raw, y * rowBytes, rowBytes);
      p += counts[y];
    }
  } else {
    // ZIP (2 og 3): sjeldne i lag, men støttes for 8 bit.
    try {
      const data = zlib.inflateSync(r.b.subarray(r.p, end));
      data.copy(raw, 0, 0, Math.min(data.length, raw.length));
      if (comp === 3 && depth === 8) for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) raw[y * w + x] = (raw[y * w + x] + raw[y * w + x - 1]) & 255;
    } catch {}
  }
  r.p = end;
  if (depth === 8) return raw;
  const out = Buffer.alloc(w * h);
  if (depth === 16) for (let i = 0; i < out.length; i++) out[i] = raw[i * 2];
  else for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, raw.readFloatBE(i * 4)), 1 / 2.2) * 255)));
  return out;
}

function toRGBA(mode, ch, n) {
  const out = Buffer.alloc(n * 4);
  const get = (id) => ch[id];
  const a = get(-1);
  for (let i = 0; i < n; i++) {
    let r;
    let g;
    let b;
    if (mode === 1 || mode === 8) r = g = b = get(0)?.[i] ?? 0;
    else if (mode === 4) {
      // CMYK lagres invertert: 255 betyr ingen farge.
      const k = get(3)?.[i] ?? 255;
      r = ((get(0)?.[i] ?? 255) * k) / 255;
      g = ((get(1)?.[i] ?? 255) * k) / 255;
      b = ((get(2)?.[i] ?? 255) * k) / 255;
    } else {
      r = get(0)?.[i] ?? 0;
      g = get(1)?.[i] ?? 0;
      b = get(2)?.[i] ?? 0;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a ? a[i] : 255;
  }
  return out;
}

/**
 * Leser filen. Gir { width, height, layers: [{ index, name, group, visible, opacity, bounds, rgba }], composite }.
 * Lagene er i rekkefølge nederst til øverst. rgba gjelder lagets egne grenser (bounds).
 */
function parsePsd(buf) {
  if (buf.toString('latin1', 0, 4) !== '8BPS') throw new Error('Not a Photoshop file.');
  const version = buf.readUInt16BE(4);
  const r = new Reader(buf, version === 2);
  r.skip(12);
  const channels = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  if (![8, 16, 32].includes(depth)) throw new Error(`${depth}-bit Photoshop files are not supported.`);
  if (![1, 3, 4, 8].includes(mode)) throw new Error('Only RGB, grayscale and CMYK Photoshop files are supported.');
  r.skip(r.u32()); // fargedata
  r.skip(r.u32()); // bilderessurser
  const lmLen = r.len();
  const lmEnd = r.p + lmLen;
  const layers = [];
  if (lmLen > 0) {
    const liLen = r.len();
    const liEnd = r.p + liLen;
    if (liLen > 0) {
      const count = Math.abs(r.i16());
      const recs = [];
      for (let i = 0; i < count; i++) {
        const top = r.i32();
        const left = r.i32();
        const bottom = r.i32();
        const right = r.i32();
        const nch = r.u16();
        const chans = [];
        for (let c = 0; c < nch; c++) chans.push({ id: r.i16(), len: r.len() });
        r.skip(4); // 8BIM
        const blend = r.str(4);
        const opacity = r.u8();
        r.u8(); // klipping
        const flags = r.u8();
        r.u8();
        const extraLen = r.u32();
        const extraEnd = r.p + extraLen;
        r.skip(r.u32()); // maske
        r.skip(r.u32()); // blandingsområder
        const nameLen = r.u8();
        let name = r.str(nameLen);
        r.skip((4 - ((nameLen + 1) % 4)) % 4);
        let section = 0;
        while (r.p + 12 <= extraEnd) {
          const sig = r.str(4);
          if (sig !== '8BIM' && sig !== '8B64') break;
          const key = r.str(4);
          const bigKeys = ['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD'];
          const len = r.big && bigKeys.includes(key) ? r.u64() : r.u32();
          const start = r.p;
          if (key === 'luni') {
            const n = r.u32();
            // UTF-16 i PSD er big endian.
            const be = Buffer.from(buf.subarray(r.p, r.p + n * 2));
            be.swap16();
            name = be.toString('utf16le').replace(/\0/g, '');
          } else if (key === 'lsct' || key === 'lsdk') section = buf.readUInt32BE(start);
          r.p = start + len;
        }
        r.p = extraEnd;
        recs.push({ top, left, bottom, right, chans, blend, opacity, hidden: Boolean(flags & 2), name, section });
      }
      // Pikseldata for hvert lag, i samme rekkefølge.
      for (const rec of recs) {
        const w = Math.max(0, rec.right - rec.left);
        const h = Math.max(0, rec.bottom - rec.top);
        const ch = {};
        for (const c of rec.chans) {
          const end = r.p + c.len;
          if (w && h && c.id >= -1 && c.len >= 2) ch[c.id] = readChannel(r, w, h, depth, end);
          r.p = end;
        }
        rec.rgba = w && h ? toRGBA(mode, ch, w * h) : null;
      }
      // Grupper: fra bunnen kommer først slutten på gruppen (3), så lagene, så selve gruppen (1 eller 2).
      const stack = [];
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        if (rec.section === 3) {
          stack.push({ members: [], hidden: false });
          continue;
        }
        if (rec.section === 1 || rec.section === 2) {
          const g = stack.pop();
          if (g) for (const l of g.members) {
            l.group = l.group ? `${rec.name} / ${l.group}` : rec.name;
            if (rec.hidden) l.visible = false;
          }
          if (g && stack.length) stack[stack.length - 1].members.push(...g.members);
          continue;
        }
        const layer = {
          index: layers.length,
          name: rec.name || `Layer ${layers.length + 1}`,
          group: '',
          visible: !rec.hidden,
          opacity: rec.opacity / 255,
          bounds: { x: rec.left, y: rec.top, w: rec.right - rec.left, h: rec.bottom - rec.top },
          rgba: rec.rgba,
        };
        if (stack.length) stack[stack.length - 1].members.push(layer);
        layers.push(layer);
      }
    }
    r.p = liEnd;
  }
  r.p = lmEnd;
  // Det sammenslåtte bildet til slutt i filen.
  let composite = null;
  try {
    const comp = r.u16();
    const n = width * height;
    const ch = {};
    const order = mode === 4 ? [0, 1, 2, 3, -1] : mode === 1 || mode === 8 ? [0, -1] : [0, 1, 2, -1];
    const nch = Math.min(channels, order.length);
    const to8 = (raw) => (depth === 8 ? raw : depth === 16 ? Buffer.from(Array.from({ length: n }, (_, i) => raw[i * 2])) : Buffer.from(Array.from({ length: n }, (_, i) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, raw.readFloatBE(i * 4)), 1 / 2.2) * 255))))));
    if (comp === 0) {
      const plane = n * (depth / 8);
      for (let c = 0; c < nch; c++) ch[order[c]] = to8(buf.subarray(r.p + c * plane, r.p + (c + 1) * plane));
    } else if (comp === 1) {
      const counts = [];
      for (let i = 0; i < nch * height; i++) counts.push(r.big ? r.u32() : r.u16());
      let p = r.p;
      for (let c = 0; c < nch; c++) {
        const raw = Buffer.alloc(width * height * (depth / 8));
        const rowBytes = width * (depth / 8);
        for (let y = 0; y < height; y++) {
          const cnt = counts[c * height + y];
          unpackBits(buf, p, p + cnt, raw, y * rowBytes, rowBytes);
          p += cnt;
        }
        ch[order[c]] = to8(raw);
      }
    }
    if (Object.keys(ch).length) composite = toRGBA(mode, ch, n);
  } catch {
    composite = null;
  }
  return { width, height, depth, mode, layers, composite };
}

/* PNG */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

// Lag i dokumentets størrelse, med lagets dekkevne.
function layerCanvas(doc, layer) {
  const out = Buffer.alloc(doc.width * doc.height * 4);
  const { x, y, w, h } = layer.bounds;
  if (!layer.rgba) return out;
  for (let j = 0; j < h; j++) {
    const ty = y + j;
    if (ty < 0 || ty >= doc.height) continue;
    for (let i = 0; i < w; i++) {
      const tx = x + i;
      if (tx < 0 || tx >= doc.width) continue;
      const s = (j * w + i) * 4;
      const d = (ty * doc.width + tx) * 4;
      out[d] = layer.rgba[s];
      out[d + 1] = layer.rgba[s + 1];
      out[d + 2] = layer.rgba[s + 2];
      out[d + 3] = Math.round(layer.rgba[s + 3] * layer.opacity);
    }
  }
  return out;
}

// Legger valgte lag over hverandre (vanlig blanding) når filen mangler et sammenslått bilde.
function flatten(doc, layers) {
  const out = Buffer.alloc(doc.width * doc.height * 4);
  for (const l of layers) {
    const src = layerCanvas(doc, l);
    for (let i = 0; i < out.length; i += 4) {
      const a = src[i + 3] / 255;
      if (!a) continue;
      const da = out[i + 3] / 255;
      const oa = a + da * (1 - a);
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((src[i + c] * a + out[i + c] * da * (1 - a)) / (oa || 1));
      out[i + 3] = Math.round(oa * 255);
    }
  }
  return out;
}

// Liten forhåndsvisning av et lag (eller hele bildet) som data-URL til dialogen.
function thumbnail(doc, rgbaFull, size = 96) {
  const s = Math.min(1, size / Math.max(doc.width, doc.height));
  const w = Math.max(1, Math.round(doc.width * s));
  const h = Math.max(1, Math.round(doc.height * s));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(doc.width - 1, Math.floor(x / s));
      const sy = Math.min(doc.height - 1, Math.floor(y / s));
      rgbaFull.copy(out, (y * w + x) * 4, (sy * doc.width + sx) * 4, (sy * doc.width + sx) * 4 + 4);
    }
  }
  return `data:image/png;base64,${encodePng(out, w, h).toString('base64')}`;
}

async function readPsd(file) {
  return parsePsd(await fs.promises.readFile(file));
}

module.exports = { parsePsd, readPsd, encodePng, layerCanvas, flatten, thumbnail, unpackBits };
