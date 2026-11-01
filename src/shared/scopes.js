// SDR display-signal analysis, not raw-camera/HDR measurement. Rec.709 Y'CbCr coefficients:
// https://www.itu.int/rec/R-REC-BT.709-6-201506-I
export const SCOPE_TYPES = [
  { value: 'all', label: 'Four scopes' },
  { value: 'waveform', label: 'Luma waveform' },
  { value: 'rgbwaveform', label: 'RGB waveform' },
  { value: 'parade', label: 'RGB parade' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'vectorscope', label: 'Vectorscope' },
];
export const SCOPE_COLORS = ['#ff666f', '#63e994', '#729dff', '#e3e6ed'];
export const luma709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function chroma709(r, g, b) {
  return [(0.2126 * (b - r) + 0.7152 * (b - g)) / 1.8556, (0.7152 * (r - g) + 0.0722 * (r - b)) / 1.5748];
}
const bound = (x, max) => Math.max(0, Math.min(max, x));
export const VECTOR_LIMIT = 0.6;
export function vectorBin(u, v, size) {
  const x = bound(Math.round((0.5 + u / (2 * VECTOR_LIMIT)) * (size - 1)), size - 1);
  const y = bound(Math.round((0.5 - v / (2 * VECTOR_LIMIT)) * (size - 1)), size - 1);
  return y * size + x;
}
export const VECTOR_TARGETS = [
  ['R', 1, 0, 0],
  ['Y', 1, 1, 0],
  ['G', 0, 1, 0],
  ['C', 0, 1, 1],
  ['B', 0, 0, 1],
  ['M', 1, 0, 1],
].map(([label, r, g, b]) => ({
  label,
  color: `rgb(${r * 255} ${g * 255} ${b * 255})`,
  uv: chroma709(r * 0.75, g * 0.75, b * 0.75),
}));

/** Each input pixel contributes once; transparent pixels contribute their composite over black.
 * Waveform keeps horizontal position; histogram counts pixels, never waveform bins.
 */
export function analyzeScopes({ data, width, height }, { columns = 256, vectorSize = 128 } = {}) {
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    !Number.isInteger(height) ||
    height < 1 ||
    !data ||
    data.length !== width * height * 4
  )
    throw new Error('Scopes need a valid RGBA frame.');
  columns = bound(Math.round(columns) || 256, 512) || 1;
  vectorSize = Math.max(16, bound(Math.round(vectorSize) || 128, 256));
  const histograms = Array.from({ length: 4 }, () => new Uint32Array(256));
  const waveforms = Array.from({ length: 4 }, () => new Uint32Array(columns * 256));
  const vectors = new Uint32Array(vectorSize * vectorSize);
  const vectorRGB = new Float64Array(vectorSize * vectorSize * 3);
  let min = 255,
    max = 0,
    sum = 0,
    low = 0,
    high = 0;
  const xBin = Array.from({ length: width }, (_, x) => Math.min(columns - 1, Math.floor((x * columns) / width)));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        a = data[i + 3] / 255;
      const r = Math.round(data[i] * a),
        g = Math.round(data[i + 1] * a),
        b = Math.round(data[i + 2] * a);
      const luma = bound(luma709(r, g, b), 255),
        l = bound(Math.round(luma), 255);
      histograms[0][r]++;
      histograms[1][g]++;
      histograms[2][b]++;
      histograms[3][l]++;
      const column = xBin[x];
      waveforms[0][(255 - r) * columns + column]++;
      waveforms[1][(255 - g) * columns + column]++;
      waveforms[2][(255 - b) * columns + column]++;
      waveforms[3][(255 - l) * columns + column]++;
      const u = (0.2126 * (b - r) + 0.7152 * (b - g)) / (255 * 1.8556);
      const v = (0.7152 * (r - g) + 0.0722 * (r - b)) / (255 * 1.5748);
      const bin = vectorBin(u, v, vectorSize);
      vectors[bin]++;
      vectorRGB[bin * 3] += r;
      vectorRGB[bin * 3 + 1] += g;
      vectorRGB[bin * 3 + 2] += b;
      min = Math.min(min, luma);
      max = Math.max(max, luma);
      sum += luma;
      if (r === 0 || g === 0 || b === 0) low++;
      if (r === 255 || g === 255 || b === 255) high++;
    }
  const samples = width * height;
  return {
    histograms,
    waveforms,
    columns,
    vectors,
    vectorRGB,
    vectorSize,
    samples,
    width,
    height,
    stats: { min: min / 255, max: max / 255, mean: sum / (samples * 255), low: low / samples, high: high / samples },
  };
}
