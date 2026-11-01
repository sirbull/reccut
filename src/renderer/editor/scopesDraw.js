import { SCOPE_COLORS, VECTOR_LIMIT, VECTOR_TARGETS, chroma709 } from '../../shared/scopes.js';
const COLORS = [
  [255, 102, 111],
  [99, 233, 148],
  [114, 157, 255],
  [225, 230, 237],
];
const makeCanvas = () => document.createElement('canvas');
function heatmap(data, width, height, color, gain, averageColors = null) {
  const cv = makeCanvas();
  cv.width = width;
  cv.height = height;
  const ctx = cv.getContext('2d'),
    pixels = ctx.createImageData(width, height);
  for (let i = 0; i < data.length; i++) {
    if (!data[i]) continue;
    const alpha = Math.min(255, Math.round(255 * (1 - Math.exp((-data[i] * gain) / 5))));
    for (let c = 0; c < 3; c++)
      pixels.data[i * 4 + c] = averageColors ? Math.min(255, averageColors[i * 3 + c] / data[i] + 35) : color[c];
    pixels.data[i * 4 + 3] = alpha;
  }
  ctx.putImageData(pixels, 0, 0);
  return cv;
}
function start(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1),
    rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * dpr)),
    height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = '#0d1015';
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.font = '10px system-ui';
  ctx.lineWidth = 1;
  return { ctx, w: rect.width, h: rect.height };
}
function grid(ctx, r, histogram = false) {
  ctx.strokeStyle = '#ffffff17';
  ctx.fillStyle = '#8893a4';
  ctx.textAlign = 'right';
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    const y = r.y + (1 - value) * r.h;
    ctx.beginPath();
    ctx.moveTo(r.x, y + 0.5);
    ctx.lineTo(r.x + r.w, y + 0.5);
    ctx.stroke();
    if (!histogram) ctx.fillText(String(Math.round(value * 100)), r.x - 5, Math.max(10, Math.min(r.y + r.h, y + 3)));
  }
  for (const value of [0, 0.25, 0.5, 0.75, 1]) {
    const x = r.x + value * r.w;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, r.y);
    ctx.lineTo(x + 0.5, r.y + r.h);
    ctx.stroke();
  }
}
export function drawScope(canvas, type, analysis, { gain = 2, log = true, skin = true } = {}) {
  const { ctx, w, h } = start(canvas);
  if (!(w > 25 && h > 25)) return;
  if (!analysis) {
    ctx.fillStyle = '#8893a4';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for viewer frame', w / 2, h / 2);
    return;
  }
  const r = { x: type === 'histogram' ? 10 : 30, y: 8, w: w - (type === 'histogram' ? 20 : 40), h: h - 28 };
  if (type === 'vectorscope') {
    const size = Math.max(10, Math.min(w - 40, h - 24)),
      x = (w - size) / 2,
      y = (h - size) / 2,
      cx = w / 2,
      cy = h / 2;
    const point = ([u, v]) => [cx + (u * size) / (VECTOR_LIMIT * 2), cy - (v * size) / (VECTOR_LIMIT * 2)];
    ctx.strokeStyle = '#ffffff24';
    for (const fraction of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, (fraction * size) / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x, cy);
    ctx.lineTo(x + size, cy);
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + size);
    ctx.stroke();
    if (skin) {
      const [u, v] = chroma709(1, 0.75, 0.6),
        length = Math.hypot(u, v),
        [px, py] = point([(u / length) * VECTOR_LIMIT, (v / length) * VECTOR_LIMIT]);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = '#d3b59277';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(
      heatmap(analysis.vectors, analysis.vectorSize, analysis.vectorSize, null, gain, analysis.vectorRGB),
      x,
      y,
      size,
      size,
    );
    ctx.restore();
    for (const target of VECTOR_TARGETS) {
      const [px, py] = point(target.uv);
      ctx.strokeStyle = target.color;
      ctx.fillStyle = target.color;
      ctx.strokeRect(px - 3, py - 3, 6, 6);
      ctx.textAlign = 'center';
      ctx.fillText(target.label, px, py - 7);
    }
    return;
  }
  grid(ctx, r, type === 'histogram');
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  if (type === 'histogram') {
    const hist = analysis.histograms,
      transform = (v) => (log ? Math.log1p(v) : v);
    let max = 1;
    for (const series of hist) for (const count of series) max = Math.max(max, transform(count));
    ctx.globalCompositeOperation = 'screen';
    for (const channel of [0, 1, 2, 3]) {
      ctx.strokeStyle = SCOPE_COLORS[channel];
      ctx.globalAlpha = channel === 3 ? 0.9 : 0.65;
      ctx.beginPath();
      for (let i = 0; i < 256; i++) {
        const x = r.x + (i / 255) * r.w,
          y = r.y + r.h - (transform(hist[channel][i]) / max) * r.h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    ctx.globalCompositeOperation = 'screen';
    for (const channel of type === 'parade' || type === 'rgbwaveform' ? [0, 1, 2] : [3]) {
      const segmentWidth = type === 'parade' ? r.w / 3 : r.w;
      const x = r.x + (type === 'parade' ? channel * segmentWidth : 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        heatmap(analysis.waveforms[channel], analysis.columns, 256, COLORS[channel], gain),
        x,
        r.y,
        segmentWidth,
        r.h,
      );
    }
  }
  ctx.restore();
  ctx.fillStyle = '#8893a4';
  ctx.textAlign = 'left';
  ctx.fillText(type === 'histogram' ? '0' : 'Left', r.x, h - 4);
  ctx.textAlign = 'right';
  ctx.fillText(type === 'histogram' ? '255' : 'Right', r.x + r.w, h - 4);
  if (type === 'parade')
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = SCOPE_COLORS[c];
      ctx.textAlign = 'center';
      ctx.fillText(['R', 'G', 'B'][c], r.x + ((c + 0.5) * r.w) / 3, h - 4);
    }
  if (type === 'histogram') {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#a3adbc';
    ctx.fillText(log ? 'Pixel count · logarithmic' : 'Pixel count · linear', w / 2, h - 4);
  }
}
