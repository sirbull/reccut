import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);
const psd = require('../src/main/psd.js');

/* Lager en liten PSD for testen: 8-bit RGB, lag med RLE eller ukomprimert, og grupper. */

function packBits(row) {
  // Enkel PackBits: bare bokstavelige biter på inntil 128 byte.
  const out = [];
  for (let i = 0; i < row.length; i += 128) {
    const part = row.subarray(i, i + 128);
    out.push(part.length - 1, ...part);
  }
  return Buffer.from(out);
}

function channelData(plane, w, h, rle) {
  if (!rle) return Buffer.concat([Buffer.from([0, 0]), plane]);
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(packBits(plane.subarray(y * w, (y + 1) * w)));
  const counts = Buffer.alloc(h * 2);
  rows.forEach((r, i) => counts.writeUInt16BE(r.length, i * 2));
  return Buffer.concat([Buffer.from([0, 1]), counts, ...rows]);
}

function u16(v) {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(v);
  return b;
}
function i16(v) {
  const b = Buffer.alloc(2);
  b.writeInt16BE(v);
  return b;
}
function u32(v) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(v);
  return b;
}
function i32(v) {
  const b = Buffer.alloc(4);
  b.writeInt32BE(v);
  return b;
}

function pascal(name) {
  const n = Buffer.from(name, 'latin1');
  const total = 1 + n.length;
  return Buffer.concat([Buffer.from([n.length]), n, Buffer.alloc((4 - (total % 4)) % 4)]);
}

function luni(name) {
  const le = Buffer.from(name, 'utf16le');
  le.swap16();
  const data = Buffer.concat([u32(name.length), le]);
  return Buffer.concat([Buffer.from('8BIMluni', 'latin1'), u32(data.length), data]);
}

function lsct(type) {
  return Buffer.concat([Buffer.from('8BIMlsct', 'latin1'), u32(4), u32(type)]);
}

// layer: { name, rect: [top, left, bottom, right], color: [r,g,b,a], hidden, section, rle }
function makePsd(W, H, layers) {
  const records = [];
  const datas = [];
  for (const l of layers) {
    const [t, lft, b, r] = l.rect || [0, 0, 0, 0];
    const w = r - lft;
    const h = b - t;
    const chans = [];
    if (w > 0 && h > 0) {
      for (const [id, v] of [[-1, l.color[3]], [0, l.color[0]], [1, l.color[1]], [2, l.color[2]]]) {
        const data = channelData(Buffer.alloc(w * h, v), w, h, l.rle);
        chans.push({ id, data });
      }
    } else {
      for (const id of [-1, 0, 1, 2]) chans.push({ id, data: Buffer.from([0, 0]) });
    }
    const extra = Buffer.concat([u32(0), u32(0), pascal(l.name), luni(l.name), ...(l.section ? [lsct(l.section)] : [])]);
    records.push(
      Buffer.concat([
        i32(t), i32(lft), i32(b), i32(r),
        u16(chans.length),
        ...chans.map((c) => Buffer.concat([i16(c.id), u32(c.data.length)])),
        Buffer.from('8BIMnorm', 'latin1'),
        Buffer.from([255, 0, l.hidden ? 2 : 0, 0]),
        u32(extra.length),
        extra,
      ])
    );
    datas.push(...chans.map((c) => c.data));
  }
  const layerInfo = Buffer.concat([i16(-layers.length), ...records, ...datas]);
  const lm = Buffer.concat([u32(layerInfo.length), layerInfo, u32(0)]);
  const header = Buffer.concat([Buffer.from('8BPS', 'latin1'), u16(1), Buffer.alloc(6), u16(4), u32(H), u32(W), u16(8), u16(3)]);
  // Sammenslått bilde: ukomprimert, mellomgrått.
  const composite = Buffer.concat([u16(0), Buffer.alloc(W * H * 4, 128)]);
  return Buffer.concat([header, u32(0), u32(0), u32(lm.length), lm, composite]);
}

test('leser lag, grupper, synlighet og piksler fra en PSD', () => {
  const file = makePsd(40, 20, [
    { name: 'Background', rect: [0, 0, 20, 40], color: [10, 20, 30, 255], rle: true },
    { name: '</Layer group>', section: 3 },
    { name: 'Logo åæø', rect: [5, 10, 15, 30], color: [200, 100, 50, 255], rle: false },
    { name: 'Brand', section: 1, hidden: true },
    { name: 'Title', rect: [2, 2, 6, 12], color: [255, 255, 255, 200], rle: true },
  ]);
  const doc = psd.parsePsd(file);
  assert.equal(doc.width, 40);
  assert.equal(doc.height, 20);
  assert.deepEqual(
    doc.layers.map((l) => [l.name, l.group, l.visible]),
    [
      ['Background', '', true],
      ['Logo åæø', 'Brand', false],
      ['Title', '', true],
    ]
  );
  assert.deepEqual(doc.layers[1].bounds, { x: 10, y: 5, w: 20, h: 10 });
  assert.deepEqual([...doc.layers[1].rgba.subarray(0, 4)], [200, 100, 50, 255]);
  assert.deepEqual([...doc.layers[0].rgba.subarray(0, 4)], [10, 20, 30, 255]);
  // Laget i dokumentets størrelse: utenfor grensene er det gjennomsiktig.
  const canvas = psd.layerCanvas(doc, doc.layers[1]);
  assert.equal(canvas[3], 0);
  assert.equal(canvas[(6 * 40 + 12) * 4], 200);
  assert.deepEqual([...doc.composite.subarray(0, 4)], [128, 128, 128, 128]);
  // PNG kan leses tilbake: riktig signatur og størrelse.
  const png = psd.encodePng(canvas, 40, 20);
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 40);
  const idat = png.indexOf('IDAT');
  const len = png.readUInt32BE(idat - 4);
  const raw = zlib.inflateSync(png.subarray(idat + 4, idat + 4 + len));
  assert.equal(raw.length, (40 * 4 + 1) * 20);
});

test('sammenslåing legger lagene over hverandre', () => {
  const doc = psd.parsePsd(
    makePsd(4, 4, [
      { name: 'A', rect: [0, 0, 4, 4], color: [0, 0, 255, 255] },
      { name: 'B', rect: [0, 0, 2, 4], color: [255, 0, 0, 255] },
    ])
  );
  const flat = psd.flatten(doc, doc.layers);
  assert.deepEqual([...flat.subarray(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...flat.subarray(3 * 16, 3 * 16 + 4)], [0, 0, 255, 255]);
});
