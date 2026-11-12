// Highlight Area: streken tegnes rundt området, så "tar den tak i" bildet og forstørrer det,
// mens resten av bildet blir mørkere og uskarpt. På slutten av klippet går alt baklengs.
// Samme kode brukes i forhåndsvisning og eksport.
import { HIGHLIGHT_DEFAULTS, valueAt } from './model.js';
import { highlightOutline, shapeAt } from './shapes.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const prop = (clip, key, T) => valueAt(clip, key, T) ?? HIGHLIGHT_DEFAULTS[key];
const flag = (clip, key) => (clip.props[key] ?? HIGHLIGHT_DEFAULTS[key]) !== false;

/**
 * Hvor langt animasjonen er kommet ved tid t (sekunder fra starten av klippet).
 * stroke er hvor mye av streken som er tegnet, zoom hvor langt forstørrelsen og bakgrunnen er kommet (0 til 1).
 * Utgangen er inngangen baklengs: først skaleres området ned, så trekkes streken tilbake.
 */
export function highlightProgress(t, dur, speed = HIGHLIGHT_DEFAULTS.speed, withStroke = true) {
  const A = Math.max(0.01, Math.min(speed, dur / 2));
  const x = clamp01(Math.min(t, dur - t) / A);
  if (!withStroke) return { stroke: 0, zoom: easeInOut(x) };
  return { stroke: easeInOut(clamp01(x / 0.55)), zoom: easeInOut(clamp01((x - 0.45) / 0.55)) };
}

// Geometrien ved tid T: området slik brukeren tegnet det, og hvor mye det er forstørret.
export function highlightGeometry(clip, T, W, H) {
  const g = shapeAt(clip, '', clip.props.shape === 'ellipse' ? 'ellipse' : 'rect', T, W, H);
  const pts = highlightOutline(g, prop(clip, 'corner', T));
  return { g, pts };
}

const canvases = [];
function scratch(i, w, h) {
  let c = canvases[i];
  if (!c) c = canvases[i] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.clearRect(0, 0, w, h);
  return { c, g };
}

function polyPath(pts) {
  const path = new Path2D();
  pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  path.closePath();
  return path;
}

// Streken langs omrisset, fra startpunktet og så langt som part (0 til 1) av omkretsen.
function partialPath(pts, part) {
  const path = new Path2D();
  if (part >= 0.999) return polyPath(pts);
  const ring = [...pts, pts[0]];
  let total = 0;
  for (let i = 1; i < ring.length; i++) total += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  let left = total * part;
  path.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length && left > 0; i++) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (L >= left) {
      const f = left / (L || 1);
      path.lineTo(ax + (bx - ax) * f, ay + (by - ay) * f);
      break;
    }
    path.lineTo(bx, by);
    left -= L;
  }
  return path;
}

export function drawHighlight(ctx, clip, T, W, H, alpha) {
  const withStroke = flag(clip, 'stroke');
  const { stroke, zoom: z } = highlightProgress(T - clip.start, clip.dur, Math.max(0.05, prop(clip, 'speed', T)), withStroke);
  const width = withStroke ? Math.max(0, prop(clip, 'strokeWidth', T)) : 0;
  if (z <= 0.001 && (stroke <= 0.001 || width <= 0)) return;
  const m = ctx.getTransform();
  const k = Math.hypot(m.a, m.b) || 1;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const { g, pts } = highlightGeometry(clip, T, W, H);
  const S = 1 + (Math.max(0.1, prop(clip, 'zoom', T)) - 1) * z;
  const dev = pts.map(([x, y]) => {
    const px = g.cx + (x - g.cx) * S;
    const py = g.cy + (y - g.cy) * S;
    return [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f];
  });
  const cdx = m.a * g.cx + m.c * g.cy + m.e;
  const cdy = m.b * g.cx + m.d * g.cy + m.f;

  const { c: orig, g: og } = scratch(0, cw, ch);
  og.drawImage(ctx.canvas, 0, 0);
  const { c: out, g: o } = scratch(1, cw, ch);
  o.drawImage(orig, 0, 0);
  if (z > 0.001) {
    // Bakgrunnen: uskarp og mørkere, tonet inn sammen med forstørrelsen.
    const blur = clamp01(prop(clip, 'bgBlur', T)) * 0.025 * H * k * z;
    if (blur > 0.3) {
      o.filter = `blur(${blur.toFixed(1)}px)`;
      o.drawImage(orig, 0, 0);
      o.filter = 'none';
    }
    const dim = clamp01(prop(clip, 'dim', T)) * z;
    if (dim > 0) {
      o.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
      o.fillRect(0, 0, cw, ch);
    }
  }
  const area = polyPath(dev);
  if (z > 0.001 && flag(clip, 'dropShadow')) {
    const size = clamp01(prop(clip, 'shadowSize', T));
    const op = clamp01(prop(clip, 'shadowOpacity', T)) * z;
    if (size > 0 && op > 0) {
      o.save();
      o.shadowColor = `rgba(0,0,0,${op.toFixed(3)})`;
      o.shadowBlur = size * 0.06 * H * k;
      o.shadowOffsetY = size * 0.015 * H * k;
      o.fillStyle = '#000';
      o.fill(area);
      o.restore();
    }
  }
  // Området selv, forstørret rundt midten.
  o.save();
  o.clip(area);
  o.translate(cdx, cdy);
  o.scale(S, S);
  o.translate(-cdx, -cdy);
  o.drawImage(orig, 0, 0);
  o.restore();
  if (stroke > 0.001 && width > 0) {
    o.lineWidth = width * k;
    o.lineJoin = 'round';
    o.lineCap = 'round';
    o.strokeStyle = clip.props.strokeColor || HIGHLIGHT_DEFAULTS.strokeColor;
    o.stroke(partialPath(dev, stroke));
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.drawImage(out, 0, 0);
  ctx.restore();
}
