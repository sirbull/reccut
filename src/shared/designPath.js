// Bezier paths for the pen and direct selection tools. A node is an anchor with
// in/out handles, { x, y, ix, iy, ox, oy }, stored as fractions of the layer box so
// paths scale with the transform handles. A handle on its anchor is a corner.
import { designShapePoints, rotatePoint, layerPoint } from './design.js';

const KAPPA = 0.5523;
const corner = ([x, y]) => ({ x, y, ix: x, iy: y, ox: x, oy: y });

// Fractional nodes for a shape, so direct selection can edit rectangles, ellipses,
// polygons and stars too. Arrows depend on their stroke, so they stay as they are.
// ponytail: a rounded rectangle loses its radius when converted.
export function shapeNodes(l) {
  if (l.shape === 'path') return l.path.nodes;
  if (l.shape === 'arrow') return null;
  if (l.shape === 'rect') return [[0, 0], [1, 0], [1, 1], [0, 1]].map(corner);
  if (l.shape === 'ellipse') return [[0.5, 0, 1, 0], [1, 0.5, 0, 1], [0.5, 1, -1, 0], [0, 0.5, 0, -1]]
    .map(([x, y, dx, dy]) => ({ x, y, ix: x - dx * KAPPA / 2, iy: y - dy * KAPPA / 2, ox: x + dx * KAPPA / 2, oy: y + dy * KAPPA / 2 }));
  return designShapePoints(l).map(corner);
}
export const shapeClosed = (l) => (l.shape === 'path' ? l.path.closed : l.shape !== 'line');
export const openShape = (l) => ['line', 'arrow'].includes(l.shape) || (l.shape === 'path' && !l.path.closed);

export function tracePathNodes(ctx, nodes, closed, w = 1, h = 1) {
  const curve = (a, b) => ctx.bezierCurveTo(a.ox * w, a.oy * h, b.ix * w, b.iy * h, b.x * w, b.y * h);
  nodes.forEach((n, i) => (i ? curve(nodes[i - 1], n) : ctx.moveTo(n.x * w, n.y * h)));
  if (closed && nodes.length > 2) { curve(nodes.at(-1), nodes[0]); ctx.closePath(); }
}

// Layer-local pixels <-> design pixels, with the layer's rotation and flips.
export function toLocal(l, pt) {
  const p = rotatePoint(pt.x - l.x - l.w / 2, pt.y - l.y - l.h / 2, -l.rotation);
  return { x: l.w / 2 + p.x * (l.flipX ? -1 : 1), y: l.h / 2 + p.y * (l.flipY ? -1 : 1) };
}
export const toWorld = (l, x, y) => layerPoint(l, l.flipX ? l.w - x : x, l.flipY ? l.h - y : y);
export const localNodes = (l) => shapeNodes(l)?.map((n) => ({ x: n.x * l.w, y: n.y * l.h, ix: n.ix * l.w, iy: n.iy * l.h, ox: n.ox * l.w, oy: n.oy * l.h }));

// ponytail: curve bounds are sampled 16 steps per segment, a pixel or so loose on tight curves.
function bounds(nodes, closed) {
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const segment = (a, b) => {
    for (let t = 1 / 16; t < 1; t += 1 / 16) {
      const u = 1 - t, k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      xs.push(k[0] * a.x + k[1] * a.ox + k[2] * b.ix + k[3] * b.x); ys.push(k[0] * a.y + k[1] * a.oy + k[2] * b.iy + k[3] * b.y);
    }
  };
  nodes.forEach((n, i) => i && segment(nodes[i - 1], n));
  if (closed && nodes.length > 2) segment(nodes.at(-1), nodes[0]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Turns nodes in the layer's local pixels into a path layer whose box fits the curve,
// without moving anything on screen. Rotation and flips are kept.
export function fitPathLayer(l, nodes, closed) {
  const b = bounds(nodes, closed), w = Math.max(1, b.w), h = Math.max(1, b.h);
  const c = toWorld(l, b.x + b.w / 2, b.y + b.h / 2), ox = b.x + b.w / 2 - w / 2, oy = b.y + b.h / 2 - h / 2;
  const fx = (v) => (v - ox) / w, fy = (v) => (v - oy) / h;
  return { ...l, shape: 'path', x: c.x - w / 2, y: c.y - h / 2, w, h,
    path: { closed, nodes: nodes.map((n) => ({ x: fx(n.x), y: fy(n.y), ix: fx(n.ix), iy: fy(n.iy), ox: fx(n.ox), oy: fy(n.oy) })) } };
}
