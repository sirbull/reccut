// BT.2100 reference patches. Kept outside src: this is an experiment, not export code.
const WHITE = 203;
function pq(nits) {
  const y = Math.max(0, nits) / 10000;
  const p = y ** (2610 / 16384);
  return ((3424 / 4096 + 2413 / 128 * p) / (1 + 2392 / 128 * p)) ** (2523 / 32);
}
function hlgOetf(x) {
  const a = 0.17883277, b = 1 - 4 * a, c = 0.5 - a * Math.log(4 * a);
  return x <= 1 / 12 ? Math.sqrt(3 * Math.max(0, x)) : a * Math.log(12 * x - b) + c;
}
function hlg(rgb) {
  // Display-referred HLG: 1000 nit display, system gamma 1.2, black 0.
  const normalized = rgb.map(n => n / 1000);
  const yd = normalized[0] * 0.2627 + normalized[1] * 0.678 + normalized[2] * 0.0593;
  const factor = yd > 0 ? yd ** (1 / 1.2 - 1) : 1;
  return normalized.map(n => hlgOetf(n * factor));
}
function patches(transfer) {
  const grays = transfer === 'pq' ? [0, 100, 203, 400, 1000, 4000, 10000] : [0, 20, 100, 203, 400, 700, 1000];
  return [...grays.map(n => ({ name: `${n} nits`, nits: [n, n, n] })),
    { name: 'BT.2020 red', nits: [203, 0, 0] }, { name: 'BT.2020 green', nits: [0, 203, 0] }, { name: 'BT.2020 blue', nits: [0, 0, 203] }];
}
function pattern(w, h, transfer, encoded = true) {
  const fields = patches(transfer), pixels = w * h, data = new Float32Array(pixels * 3);
  const colors = fields.map(p => encoded ? transfer === 'pq' ? p.nits.map(pq) : hlg(p.nits) : p.nits.map(n => n / WHITE));
  const ramp = Array.from({ length: w }, (_, x) => {
    const n = 1000 * x / (w - 1);
    return encoded ? transfer === 'pq' ? pq(n) : hlg([n, n, n])[0] : n / WHITE;
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const rgb = y < h * 0.6 ? colors[Math.min(fields.length - 1, Math.floor(x * fields.length / w))] : [ramp[x], ramp[x], ramp[x]];
    const i = y * w + x;
    data[i] = rgb[1]; data[pixels + i] = rgb[2]; data[2 * pixels + i] = rgb[0]; // gbrpf32le
  }
  return Buffer.from(data.buffer);
}
function samplePlanar(bytes, w, h, transfer) {
  const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), count = w * h;
  return patches(transfer).map((p, k, fields) => {
    const x = Math.floor((k + 0.5) * w / fields.length), y = Math.floor(h * 0.3), rgb = [0, 0, 0];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = (y + dy) * w + x + dx;
      rgb[0] += data[count * 2 + i] / 25; rgb[1] += data[i] / 25; rgb[2] += data[count + i] / 25;
    }
    const expected = p.nits.map(n => n / WHITE);
    const error = Math.max(...rgb.map((v, c) => Math.abs(v - expected[c]) / Math.max(expected[c], 1)));
    return { name: p.name, expected, measured: rgb, relativeOrWhiteError: error };
  });
}
// zimg's HLG display transform acts per channel. BT.2100's display OOTF
// depends on scene luminance. These explicit corrections let the study test
// the difference rather than hiding it in an encode/decode round trip.
function correctHlgRgb(rgb) {
  const scene = rgb.map(v => Math.max(0, v * WHITE / 1000) ** (1 / 1.2));
  const y = scene[0] * 0.2627 + scene[1] * 0.678 + scene[2] * 0.0593;
  return scene.map(v => v * y ** 0.2 * 1000 / WHITE);
}
function prepareHlgPlanar(bytes) {
  const data = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), n = data.length / 3;
  for (let i = 0; i < n; i++) {
    const r = data[2 * n + i] * WHITE / 1000, g = data[i] * WHITE / 1000, b = data[n + i] * WHITE / 1000;
    const yd = r * 0.2627 + g * 0.678 + b * 0.0593, factor = yd > 0 ? yd ** (1 / 1.2 - 1) : 1;
    data[2 * n + i] = (r * factor) ** 1.2 * 1000 / WHITE;
    data[i] = (g * factor) ** 1.2 * 1000 / WHITE;
    data[n + i] = (b * factor) ** 1.2 * 1000 / WHITE;
  }
  return bytes;
}
module.exports = { WHITE, pq, hlg, patches, pattern, samplePlanar, correctHlgRgb, prepareHlgPlanar };
