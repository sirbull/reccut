// Tegner ett bilde av prosjektet. Samme kode brukes i forhåndsvisning og eksport,
// så det du ser i redigeringen er det som havner i filen.
import { gpuGradeAvailable, gradeImage, gradeParams } from './grade.js';
import { drawTestCard } from './testcard.js';
import { drawTemplate, findTemplate } from './titletemplates.js';
import { stabilizeAt } from './stabilize.js';
import { maskList, paintMask, shapeAt, shapeCorners, shapePath } from './shapes.js';
import { activeVfx, processVfx } from './vfx.js';
import {
  DEFAULT_CAPTION_STYLE,
  FONTS,
  cameraRectAt,
  clamp,
  clicksAt,
  cursorAt,
  easeInOut,
  easeOutCubic,
  keysAt,
  redactStrength,
  sourceTime,
  valueAt,
  visualOpacity,
  zoomAmountAt,
} from './model.js';

/**
 * getSource(clip, streamKey, sourceTimeInStream) returnerer { img, w, h } eller null.
 */
export function drawFrame(ctx, project, frame, getSource, { scale = 1, matrix = null } = {}) {
  const W = project.width;
  const H = project.height;
  ctx.save();
  if (matrix) {
    // Beskjæring og ny størrelse ved eksport: tøm hele lerretet først.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(matrix[0], 0, 0, matrix[1], matrix[2], matrix[3]);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
  } else ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  for (const layer of frame.layers) {
    if (layer.transition) drawTransition(ctx, project, layer, getSource);
    else drawClip(ctx, project, layer.clip, layer.T, getSource, 1);
  }
  for (const c of frame.captions) drawCaption(ctx, project, c);
  ctx.restore();
}

function drawTransition(ctx, project, layer, getSource) {
  const W = project.width;
  const H = project.height;
  const { type, p } = layer.transition;
  const A = (alpha = 1) => layer.a && drawClip(ctx, project, layer.a.clip, layer.a.T, getSource, alpha);
  const B = (alpha = 1) => layer.b && drawClip(ctx, project, layer.b.clip, layer.b.T, getSource, alpha);
  const e = easeInOut(p);
  switch (type) {
    case 'dip':
    case 'dipWhite': {
      if (p < 0.5) A();
      else B();
      ctx.fillStyle = type === 'dipWhite' ? '#fff' : '#000';
      ctx.globalAlpha = p < 0.5 ? p * 2 : (1 - p) * 2;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      break;
    }
    case 'slideLeft':
    case 'slideRight': {
      const dir = type === 'slideLeft' ? -1 : 1;
      ctx.save();
      ctx.translate(dir * e * W, 0);
      A();
      ctx.restore();
      ctx.save();
      ctx.translate(dir * (e - 1) * W, 0);
      B();
      ctx.restore();
      break;
    }
    case 'slideUp': {
      ctx.save();
      ctx.translate(0, -e * H);
      A();
      ctx.restore();
      ctx.save();
      ctx.translate(0, (1 - e) * H);
      B();
      ctx.restore();
      break;
    }
    case 'circle': {
      A();
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, e * Math.hypot(W, H) * 0.5, 0, Math.PI * 2);
      ctx.clip();
      B();
      ctx.restore();
      break;
    }
    case 'blur': {
      const amount = Math.sin(p * Math.PI) * H * 0.02;
      ctx.save();
      ctx.filter = `blur(${amount.toFixed(1)}px)`;
      A();
      B(e);
      ctx.restore();
      break;
    }
    case 'wipe': {
      A();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, e * W, H);
      ctx.clip();
      B();
      ctx.restore();
      break;
    }
    case 'zoom': {
      ctx.save();
      zoomAround(ctx, W, H, 1 + 0.25 * e);
      A(1 - e);
      ctx.restore();
      ctx.save();
      zoomAround(ctx, W, H, 0.9 + 0.1 * e);
      B(e);
      ctx.restore();
      break;
    }
    default:
      A();
      B(e);
  }
}

function zoomAround(ctx, W, H, s) {
  ctx.translate(W / 2, H / 2);
  ctx.scale(s, s);
  ctx.translate(-W / 2, -H / 2);
}

// Fargekorrigering på skjermkortet når det finnes. Uten WebGL2 brukes enkle 2D-filtre.
/* Effektstabelen. Bildet behandles i den størrelsen det tegnes i, så visningen er rask og
   eksporten får full oppløsning. Bakgrunnsbildet for Remove Background lastes én gang. */
let vfxCanvas = null;
const plates = new Map(); // dataURL -> { img, data: Map(størrelse -> ImageData) }
let onAssetLoaded = null;
export function setAssetListener(fn) {
  onAssetLoaded = fn;
}
// Klipp som ikke skal få effektene sine nå (mens fargen plukkes i visningen).
export const vfxBypass = new Set();

function makeCanvas(w, h) {
  return typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
}

function plateFor(url) {
  let e = plates.get(url);
  if (e) return e.img ? e : null;
  e = { img: null, data: new Map() };
  plates.set(url, e);
  fetch(url)
    .then((r) => r.blob())
    .then((b) => createImageBitmap(b))
    .then((bmp) => {
      e.img = bmp;
      onAssetLoaded?.();
    })
    .catch(() => {});
  return null;
}

// Eksporten venter til alle bakgrunnsbilder er lastet før den begynner.
export async function preloadAssets(project) {
  const urls = new Set();
  for (const c of Object.values(project.clips)) for (const e of c.props?.vfx || []) if (e.type === 'bgRemove' && e.p?.plate) urls.add(e.p.plate);
  for (const u of urls) {
    plateFor(u);
    for (let i = 0; i < 200 && !plates.get(u)?.img; i++) await new Promise((r) => setTimeout(r, 25));
  }
}

function plateData(url, w, h) {
  const e = url && plateFor(url);
  if (!e) return null;
  const key = `${w}x${h}`;
  let d = e.data.get(key);
  if (!d) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(e.img, 0, 0, w, h);
    d = g.getImageData(0, 0, w, h);
    if (e.data.size > 4) e.data.clear();
    e.data.set(key, d);
  }
  return d;
}

function withVfx(ctx, clip, src, W, H) {
  const list = activeVfx(clip);
  if (!list.length || vfxBypass.has(clip.id)) return src;
  const m = ctx.getTransform();
  const k = Math.hypot(m.a, m.b) || 1;
  const full = containRect(src.w, src.h, W, H);
  const pw = Math.max(32, Math.min(src.w, Math.round(full.w * k)));
  const ph = Math.max(32, Math.round((pw * src.h) / src.w));
  if (!vfxCanvas) vfxCanvas = makeCanvas(pw, ph);
  if (vfxCanvas.width !== pw || vfxCanvas.height !== ph) {
    vfxCanvas.width = pw;
    vfxCanvas.height = ph;
  }
  const g = vfxCanvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, pw, ph);
  g.drawImage(src.img, 0, 0, pw, ph);
  const img = g.getImageData(0, 0, pw, ph);
  const plateUrl = list.find((e) => e.type === 'bgRemove')?.p?.plate;
  processVfx(img, list, { scale: ph / 1080, plate: plateUrl ? plateData(plateUrl, pw, ph) : null });
  g.putImageData(img, 0, 0);
  return { img: vfxCanvas, w: src.w, h: src.h };
}

function graded(clip, T, src) {
  const g = gradeParams(clip, T);
  if (!g) return src;
  const cv = gradeImage(src.img, src.w, src.h, g);
  return cv ? { img: cv, w: src.w, h: src.h } : src;
}

function colorFilter(clip, T, H = 1080) {
  const gpu = gpuGradeAvailable();
  const ex = gpu ? 0 : valueAt(clip, 'exposure', T) || 0;
  const co = gpu ? 0 : valueAt(clip, 'contrast', T) || 0;
  const sa = gpu ? 0 : valueAt(clip, 'saturation', T) || 0;
  const parts = [];
  if (ex || co || sa) parts.push(`brightness(${(1 + ex).toFixed(3)}) contrast(${(1 + co).toFixed(3)}) saturate(${Math.max(0, 1 + sa).toFixed(3)})`);
  const blur = valueAt(clip, 'blur', T) || 0;
  if (blur > 0) parts.push(`blur(${((blur * H) / 1080).toFixed(2)}px)`);
  const sepia = valueAt(clip, 'sepia', T) || 0;
  if (sepia > 0) parts.push(`sepia(${sepia.toFixed(3)})`);
  const gray = valueAt(clip, 'grayscale', T) || 0;
  if (gray > 0) parts.push(`grayscale(${gray.toFixed(3)})`);
  const inv = valueAt(clip, 'invert', T) || 0;
  if (inv > 0) parts.push(`invert(${inv.toFixed(3)})`);
  const hue = valueAt(clip, 'hue', T) || 0;
  if (hue) parts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
  return parts.length ? parts.join(' ') : 'none';
}

// Tegner bildet med skygge, avrundede hjørner, vignett og ramme rundt innholdet.
function drawWithEffects(ctx, clip, T, r, H, draw) {
  const radiusPct = valueAt(clip, 'radius', T) || 0;
  const shadow = valueAt(clip, 'shadow', T) || 0;
  const vignette = valueAt(clip, 'vignette', T) || 0;
  const border = valueAt(clip, 'border', T) || 0;
  const rad = (Math.min(r.w, r.h) * radiusPct) / 100;
  if (shadow > 0) {
    ctx.save();
    ctx.filter = 'none';
    ctx.shadowColor = `rgba(0,0,0,${(0.75 * shadow).toFixed(3)})`;
    ctx.shadowBlur = H * 0.045 * shadow;
    ctx.shadowOffsetY = H * 0.012 * shadow;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (rad > 0) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    ctx.clip();
  }
  draw();
  ctx.filter = 'none';
  if (!gpuGradeAvailable()) applyTemperature(ctx, clip, T, r);
  if (vignette > 0) {
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, Math.min(r.w, r.h) * 0.3, r.x + r.w / 2, r.y + r.h / 2, Math.hypot(r.w, r.h) * 0.55);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(1, vignette).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
  if (border > 0) {
    const bw = (border * H) / 1080;
    ctx.save();
    ctx.filter = 'none';
    ctx.lineWidth = bw;
    ctx.strokeStyle = clip.props.borderColor || '#fff';
    ctx.beginPath();
    ctx.roundRect(r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw, Math.max(0, rad - bw / 2));
    ctx.stroke();
    ctx.restore();
  }
}

function applyTemperature(ctx, clip, T, rect) {
  const t = valueAt(clip, 'temperature', T) || 0;
  if (!t) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = Math.min(1, Math.abs(t)) * 0.65;
  ctx.fillStyle = t > 0 ? '#ff9a2e' : '#2e8bff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function containRect(sw, sh, W, H) {
  const s = Math.min(W / sw, H / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

export function drawClip(ctx, project, clip, T, getSource, alphaMul = 1, unmasked = false) {
  const W = project.width;
  const H = project.height;
  const alpha = visualOpacity(clip, T) * alphaMul;
  if (alpha <= 0.001) return;
  if (clip.type === 'redact') return drawRedact(ctx, clip, T, W, H, alpha);
  if (!unmasked && clip.type !== 'caption' && maskList(clip).length) return drawMasked(ctx, project, clip, T, getSource, alphaMul);
  const media = project.media[clip.mediaId];

  ctx.save();
  ctx.globalAlpha = alpha;
  const x = valueAt(clip, 'x', T) || 0;
  const y = valueAt(clip, 'y', T) || 0;
  const sc = valueAt(clip, 'scale', T) ?? 1;
  const rot = valueAt(clip, 'rotation', T) || 0;
  if (x || y || sc !== 1 || rot) {
    ctx.translate(W / 2 + x, H / 2 + y);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -H / 2);
  }

  const s = sourceTime(clip, T);
  // Filen mangler: testkortet med filnavnet vises der klippet skulle vært.
  if (media?.offline && (clip.type === 'video' || clip.type === 'image' || clip.type === 'recording')) {
    drawTestCard(ctx, W, H, { top: media.name, bottom: 'MEDIA OFFLINE', info: `${media.width || W} × ${media.height || H}${media.fps ? `  ${Math.round(media.fps)}p` : ''}` });
    ctx.restore();
    return;
  }
  if (clip.type === 'video' || clip.type === 'image') {
    let src = getSource(clip, 'main', s);
    // Effektstabelen (keying og matte) behandles før fargekorrigeringen.
    if (src) src = withVfx(ctx, clip, src, W, H);
    if (src) src = graded(clip, T, src);
    if (src) {
      const full = containRect(src.w, src.h, W, H);
      // Beskjæring (Crop): kantene trimmes, og bildet blir stående der det er.
      const cl = clamp(valueAt(clip, 'cropL', T) || 0, 0, 0.49);
      const cr = clamp(valueAt(clip, 'cropR', T) || 0, 0, 0.49);
      const ct = clamp(valueAt(clip, 'cropT', T) || 0, 0, 0.49);
      const cb = clamp(valueAt(clip, 'cropB', T) || 0, 0, 0.49);
      const r = { x: full.x + cl * full.w, y: full.y + ct * full.h, w: full.w * (1 - cl - cr), h: full.h * (1 - ct - cb) };
      const img = src.img;
      const nw = img.videoWidth || img.displayWidth || img.naturalWidth || img.width || src.w;
      const nh = img.videoHeight || img.displayHeight || img.naturalHeight || img.height || src.h;
      // Stabilisering: bildet flyttes, roteres og zoomes innenfor sin egen ramme.
      const stab = clip.type === 'video' ? stabilizeAt(clip, media?.streams?.main?.motion, s) : null;
      drawWithEffects(ctx, clip, T, r, H, () => {
        ctx.filter = colorFilter(clip, T, H);
        if (stab) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(r.x, r.y, r.w, r.h);
          ctx.clip();
          const mx = full.x + full.w / 2;
          const my = full.y + full.h / 2;
          ctx.translate(mx, my);
          ctx.scale(stab.zoom, stab.zoom);
          ctx.rotate(stab.a);
          ctx.translate(stab.x * full.w - mx, stab.y * full.w - my);
          ctx.drawImage(img, full.x, full.y, full.w, full.h);
          ctx.restore();
        } else if (cl || cr || ct || cb) ctx.drawImage(img, cl * nw, ct * nh, nw * (1 - cl - cr), nh * (1 - ct - cb), r.x, r.y, r.w, r.h);
        else ctx.drawImage(img, r.x, r.y, r.w, r.h);
      });
    }
  } else if (clip.type === 'recording' && media) {
    drawRecording(ctx, project, clip, media, T, s, getSource);
  } else if (clip.type === 'title') {
    if (clip.props.template) {
      // Malbasert tittel: inn- og ut-animasjonen følger starten og slutten på klippet.
      const tpl = findTemplate(clip.props.template, project.templates || {});
      if (tpl) drawTemplate(ctx, tpl, T - clip.start, clip.dur, W, H, clip.props);
    } else drawTitle(ctx, clip, T, W, H);
  }
  ctx.restore();
}

/* Sladding. Leser det som allerede er tegnet under (alle lag), gjør området ugjenkjennelig
   i et eget lerret og legger det over igjen. Myk kant lages med en uskarp maske. */

// Sladdens form i bildet (sladding ligger alltid i bildets rom).
export function redactShape(clip, T, W, H) {
  return shapeAt(clip, '', clip.props.shape || 'rect', T, W, H);
}

export function redactPath(clip, T, W, H) {
  // Hele bildet: effekten dekker alt, og masker bestemmer hvor den virker.
  if (clip.props.shape === 'full') {
    const path = new Path2D();
    path.rect(0, 0, W, H);
    return { path, shape: 'full', cx: W / 2, cy: H / 2, w: W, h: H, rot: 0, pts: null };
  }
  const g = redactShape(clip, T, W, H);
  return { path: shapePath(g, clip.props.smooth === true), ...g };
}

const scratch = [null, null, null, null];
function scratchCanvas(i, w, h) {
  let c = scratch[i];
  if (!c) {
    c = scratch[i] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  }
  if (c.width < w || c.height < h) {
    c.width = Math.max(c.width, w);
    c.height = Math.max(c.height, h);
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.filter = 'none';
  g.imageSmoothingEnabled = true;
  g.clearRect(0, 0, w, h);
  return { c, g };
}

function drawRedact(ctx, clip, T, W, H, alpha) {
  const pr = clip.props;
  const mode = pr.mode || 'pixelate';
  const m = ctx.getTransform();
  const k = Math.hypot(m.a, m.b) || 1;
  const geom = redactPath(clip, T, W, H);
  const { path } = geom;
  const devPath = new Path2D();
  devPath.addPath(path, m);
  const feather = Math.max(0, valueAt(clip, 'feather', T) || 0) * k;
  // Området som må behandles, i lerretets piksler.
  let pts;
  if (pr.invert || geom.shape === 'full') pts = [[0, 0], [W, 0], [0, H], [W, H]];
  else pts = shapeCorners(geom);
  const dev = pts.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  // Myke kurver i en fri form kan gå litt utenfor punktene.
  const pad = pr.invert ? 0 : feather * 2 + (geom.shape === 'path' ? 40 * k : 0);
  const bx = Math.max(0, Math.floor(Math.min(...dev.map((d) => d[0])) - pad));
  const by = Math.max(0, Math.floor(Math.min(...dev.map((d) => d[1])) - pad));
  const bx2 = Math.min(cw, Math.ceil(Math.max(...dev.map((d) => d[0])) + pad));
  const by2 = Math.min(ch, Math.ceil(Math.max(...dev.map((d) => d[1])) + pad));
  const bw = bx2 - bx;
  const bh = by2 - by;
  if (bw < 1 || bh < 1) return;
  const src = ctx.canvas;
  const { block, blur } = redactStrength(pr.amount, H);
  const { c: P, g } = scratchCanvas(0, bw, bh);
  if (mode === 'solid') {
    g.fillStyle = pr.color || '#000';
    g.fillRect(0, 0, bw, bh);
  } else if (mode === 'blur') {
    const r = blur * k;
    const ex = Math.max(0, Math.floor(bx - r * 3));
    const ey = Math.max(0, Math.floor(by - r * 3));
    const ew = Math.min(cw, Math.ceil(bx2 + r * 3)) - ex;
    const eh = Math.min(ch, Math.ceil(by2 + r * 3)) - ey;
    // Først nedskalert (fjerner fine detaljer helt), så uskarpt.
    const f = Math.max(1, r / 3);
    const sw = Math.max(1, Math.round(ew / f));
    const sh = Math.max(1, Math.round(eh / f));
    const { c: S, g: sg } = scratchCanvas(1, sw, sh);
    sg.drawImage(src, ex, ey, ew, eh, 0, 0, sw, sh);
    g.filter = `blur(${(r * 0.8).toFixed(1)}px)`;
    g.drawImage(S, 0, 0, sw, sh, ex - bx, ey - by, ew, eh);
    g.filter = 'none';
  } else {
    // Pikselering (og frostet glass: mindre blokker som gjøres myke).
    const frosted = mode === 'frosted';
    const blk = Math.max(2, block * k * (frosted ? 0.6 : 1));
    const sw = Math.max(1, Math.ceil(bw / blk));
    const sh = Math.max(1, Math.ceil(bh / blk));
    const { c: S, g: sg } = scratchCanvas(1, sw, sh);
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(src, bx, by, bw, bh, 0, 0, sw, sh);
    g.imageSmoothingEnabled = frosted;
    if (frosted) g.filter = `blur(${(blk * 0.45).toFixed(1)}px)`;
    g.drawImage(S, 0, 0, sw, sh, 0, 0, bw, bh);
    g.filter = 'none';
  }
  // Masken: formen (eller alt utenfor den), med myk kant om ønsket.
  g.setTransform(1, 0, 0, 1, -bx, -by);
  g.globalCompositeOperation = pr.invert ? 'destination-out' : 'destination-in';
  if (feather > 0.5) g.filter = `blur(${(feather / 2).toFixed(1)}px)`;
  g.fillStyle = '#000';
  if (geom.shape !== 'full') g.fill(devPath);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-over';
  // Masker på effekten (tegnet med pennen eller som former): bare der virker den.
  if (maskList(clip).length) {
    const { c: Mk, g: mg } = scratchCanvas(2, cw, ch);
    paintMask(mg, clip, T, W, H, m, cw, ch);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(Mk, bx, by, bw, bh, 0, 0, bw, bh);
    g.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.drawImage(P, 0, 0, bw, bh, bx, by, bw, bh);
  ctx.restore();
}

// Klipp med masker tegnes i et eget lag, og masken bestemmer hva som blir synlig.
function drawMasked(ctx, project, clip, T, getSource, alphaMul) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  const base = ctx.getTransform();
  const { c: L, g: lg } = scratchCanvas(2, cw, ch);
  lg.setTransform(base);
  drawClip(lg, project, clip, T, getSource, alphaMul, true);
  const { c: M, g: mg } = scratchCanvas(3, cw, ch);
  paintMask(mg, clip, T, project.width, project.height, base, cw, ch);
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = 'destination-in';
  lg.drawImage(M, 0, 0, cw, ch, 0, 0, cw, ch);
  lg.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.drawImage(L, 0, 0, cw, ch, 0, 0, cw, ch);
  ctx.restore();
}

function drawRecording(ctx, project, clip, media, T, s, getSource) {
  const W = project.width;
  const H = project.height;
  const filter = colorFilter(clip, T, H);
  let screenRect = { x: 0, y: 0, w: W, h: H };
  const screen = media.streams.screen;
  if (screen) {
    let src = getSource(clip, 'screen', s - (screen.offset || 0));
    if (src) src = graded(clip, T, src);
    if (src) {
      const r = (screenRect = containRect(src.w, src.h, W, H));
      drawWithEffects(ctx, clip, T, r, H, () => {
        ctx.filter = filter;
        ctx.drawImage(src.img, r.x, r.y, r.w, r.h);
      });
    } else if (screen.width) {
      screenRect = containRect(screen.width, screen.height, W, H);
    }
    const rec = media.rec || {};
    if (clip.props.showClicks) drawClicks(ctx, clicksAt(rec.clicks, s), screenRect);
    if (clip.props.cursorZoom) {
      const p = zoomAmountAt(rec.zooms, s);
      const pos = p > 0.01 ? cursorAt(rec.cursor, s) : null;
      if (pos) drawCursor(ctx, screenRect.x + pos[0] * screenRect.w, screenRect.y + pos[1] * screenRect.h, p, screenRect.h);
    }
  }

  const camera = media.streams.camera;
  const showCamera = valueAt(clip, 'showCamera', T) !== false;
  if (camera?.hasVideo && showCamera) {
    const rect = screen ? cameraRectAt(clip, s, W, H) : { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };
    let src = rect.a > 0.01 ? getSource(clip, 'camera', s - (camera.offset || 0)) : null;
    if (src) src = graded(clip, T, src);
    if (src) {
      ctx.save();
      ctx.globalAlpha *= rect.a;
      ctx.filter = filter;
      drawCamera(ctx, src.img, src.w, src.h, rect, clip.props.mirror, rect.w < W * 0.9);
      ctx.restore();
    }
  }
  if (clip.props.showKeys) drawKeys(ctx, keysAt(media.rec?.keys, s), W, H);
}

// Kamerabildet beskjæres slik at det fyller rammen, med skygge når det er bilde i bilde.
export function drawCamera(ctx, img, vw, vh, cam, mirror, shadow) {
  if (shadow) {
    ctx.save();
    ctx.filter = 'none';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = cam.w * 0.05;
    ctx.shadowOffsetY = cam.w * 0.012;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.roundRect(cam.x, cam.y, cam.w, cam.h, cam.r);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cam.x, cam.y, cam.w, cam.h, cam.r);
  ctx.clip();
  const scale = Math.max(cam.w / vw, cam.h / vh);
  const sw = cam.w / scale;
  const sh = cam.h / scale;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  if (mirror) {
    ctx.translate(cam.x + cam.w, cam.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cam.w, cam.h);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, cam.x, cam.y, cam.w, cam.h);
  }
  ctx.restore();
}

// Stor pil som vokser frem over den vanlige musepekeren.
export function drawCursor(ctx, x, y, p, screenH) {
  const base = screenH * 0.02;
  const size = base * (1 + 1.8 * p);
  const k = size / 20;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha *= clamp(p * 3, 0, 1);
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 17);
  ctx.lineTo(4.2, 13.2);
  ctx.lineTo(7.2, 20);
  ctx.lineTo(10.2, 18.7);
  ctx.lineTo(7.3, 12.1);
  ctx.lineTo(12.8, 12.1);
  ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  ctx.restore();
}

export function drawClicks(ctx, clicks, rect) {
  for (const c of clicks) {
    const k = c.age / 0.5;
    const r = rect.h * (0.012 + 0.03 * easeOutCubic(k));
    ctx.save();
    ctx.filter = 'none';
    ctx.globalAlpha *= 1 - k;
    ctx.strokeStyle = '#ffd60a';
    ctx.lineWidth = rect.h * 0.004;
    ctx.fillStyle = 'rgba(255, 214, 10, 0.25)';
    ctx.beginPath();
    ctx.arc(rect.x + c.x * rect.w, rect.y + c.y * rect.h, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// Tastetrykk vises som avrundede merker nederst på midten.
export function drawKeys(ctx, items, W, H) {
  if (!items.length) return;
  const size = H * 0.034;
  ctx.save();
  ctx.filter = 'none';
  ctx.font = `600 ${size}px ${FONTS.sans}`;
  ctx.textBaseline = 'middle';
  const padX = size * 0.7;
  const h = size * 2;
  const gap = size * 0.5;
  const widths = items.map((it) => ctx.measureText(it.label).width + padX * 2);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let x = (W - total) / 2;
  const y = H * 0.86;
  items.forEach((it, i) => {
    const fadeIn = clamp(it.age / 0.12, 0, 1);
    const fadeOut = clamp((1.6 - it.age) / 0.35, 0, 1);
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    const dy = (1 - easeOutCubic(fadeIn)) * size * 0.6;
    ctx.fillStyle = 'rgba(28, 28, 30, 0.86)';
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2 + dy, widths[i], h, size * 0.45);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(it.label, x + padX, y + dy);
    x += widths[i] + gap;
  });
  ctx.restore();
}

export function wrapText(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const test = `${line} ${w}`;
      if (ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

const ANIM_IN = 0.5;
const ANIM_OUT = 0.4;

function drawTitle(ctx, clip, T, W, H) {
  const p = clip.props;
  const local = T - clip.start;
  const k = H / 1080;
  const aIn = p.anim === 'none' ? 1 : clamp(local / ANIM_IN, 0, 1);
  const aOut = p.anim === 'none' ? 1 : clamp((clip.dur - local) / ANIM_OUT, 0, 1);
  const eIn = easeOutCubic(aIn);
  let alpha = Math.min(aIn, aOut);
  let dy = 0;
  let sc = 1;
  let reveal = 1;
  if (p.anim === 'slide') dy = (1 - eIn) * 40 * k + (1 - easeOutCubic(aOut)) * -20 * k;
  if (p.anim === 'pop') sc = 0.85 + 0.15 * easeOutCubic(Math.min(aIn, aOut));
  if (p.anim === 'type') {
    reveal = clamp(local / Math.max(0.6, Math.min(2, String(p.text).length * 0.05)), 0, 1);
    alpha = aOut;
  }

  const size = p.size * k;
  const font = fontFamily(p.font);
  ctx.globalAlpha *= alpha;
  ctx.textBaseline = 'alphabetic';

  if (p.style === 'card') {
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.translate(0, dy);
  if (sc !== 1) zoomAround(ctx, W, H, sc);

  const text = reveal < 1 ? String(p.text).slice(0, Math.ceil(String(p.text).length * reveal)) : String(p.text);
  ctx.font = `${p.weight} ${size}px ${font}`;
  const mainLines = wrapText(ctx, text, W * (p.style === 'lower' ? 0.6 : 0.84));
  const subSize = size * 0.45;
  ctx.font = `400 ${subSize}px ${font}`;
  const subLines = p.subtext ? wrapText(ctx, p.subtext, W * (p.style === 'lower' ? 0.6 : 0.84)) : [];
  const lineH = size * 1.15;
  const subH = subSize * 1.35;
  const blockH = mainLines.length * lineH + (subLines.length ? subSize * 0.4 + subLines.length * subH : 0);

  ctx.font = `${p.weight} ${size}px ${font}`;
  let maxW = Math.max(...mainLines.map((l) => ctx.measureText(l).width), 0);
  ctx.font = `400 ${subSize}px ${font}`;
  maxW = Math.max(maxW, ...subLines.map((l) => ctx.measureText(l).width));

  let x;
  let top;
  let align = 'center';
  if (p.style === 'lower') {
    align = 'left';
    x = W * 0.07;
    top = H * 0.86 - blockH;
  } else if (p.style === 'top') {
    x = W / 2;
    top = H * 0.08;
  } else {
    x = W / 2;
    top = (H - blockH) / 2;
  }

  const pad = size * 0.35;
  if (p.bg || p.style === 'lower') {
    const bx = align === 'left' ? x - pad : x - maxW / 2 - pad;
    ctx.fillStyle = p.bg ? p.bgColor : 'rgba(0,0,0,0.55)';
    ctx.globalAlpha *= p.bg ? 0.85 : 1;
    ctx.beginPath();
    ctx.roundRect(bx, top - pad * 0.6, maxW + pad * 2, blockH + pad * 1.2, size * 0.12);
    ctx.fill();
    ctx.globalAlpha /= p.bg ? 0.85 : 1;
    if (p.style === 'lower') {
      ctx.fillStyle = p.accent || '#0a84ff';
      ctx.fillRect(bx, top - pad * 0.6, size * 0.08, blockH + pad * 1.2);
    }
  }

  ctx.textAlign = align;
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.bg || p.style === 'card' ? 'transparent' : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = size * 0.12;
  ctx.shadowOffsetY = size * 0.03;
  ctx.font = `${p.weight} ${size}px ${font}`;
  let yy = top + size * 0.95;
  for (const l of mainLines) {
    ctx.fillText(l, x, yy);
    yy += lineH;
  }
  if (subLines.length) {
    ctx.font = `400 ${subSize}px ${font}`;
    ctx.globalAlpha *= 0.85;
    yy = top + mainLines.length * lineH + subSize * 1.4;
    for (const l of subLines) {
      ctx.fillText(l, x, yy);
      yy += subH;
    }
  }
}

// Undertekster: én til tre linjer, med skrift, farge, kontur, bakgrunn og fri plassering.
export function captionLayout(project, clip, measure) {
  const W = project.width;
  const H = project.height;
  const st = { ...DEFAULT_CAPTION_STYLE, ...(project.captionStyle || {}) };
  const k = H / 1080;
  const size = st.size * k;
  const align = clip.props.align || st.align;
  const font = `${st.weight} ${size}px ${fontFamily(st.font)}`;
  const lines = measure(font, clip.props.text || '', W * 0.86).slice(0, st.maxLines || 3);
  const lineH = size * 1.28;
  const widths = lines.map((l) => measure(font, l));
  const blockW = Math.max(0, ...widths) + size * 0.7;
  const blockH = lines.length * lineH;
  let ax;
  let cy;
  const pos = clip.props.pos || (st.position === 'custom' ? { x: st.x, y: st.y } : null);
  if (pos) {
    ax = (pos.x / 100) * W;
    cy = (pos.y / 100) * H;
  } else {
    ax = align === 'left' ? W * 0.07 : align === 'right' ? W * 0.93 : W / 2;
    cy = st.position === 'top' ? H * 0.07 + blockH / 2 : st.position === 'middle' ? H / 2 : H * 0.93 - blockH / 2;
  }
  return { st, k, size, align, font, lines, widths, lineH, blockW, blockH, ax, cy };
}

export function drawCaption(ctx, project, clip) {
  const L = captionLayout(project, clip, (font, text, maxW) => {
    ctx.font = font;
    return maxW == null ? ctx.measureText(text).width : wrapText(ctx, text, maxW);
  });
  if (!L.lines.length) return;
  const { st, size, align, lines, widths, lineH, blockH, ax, cy, k } = L;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.font = L.font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const top = cy - blockH / 2;
  const padX = size * 0.35;
  if (st.bg) {
    ctx.fillStyle = hexAlpha(st.bgColor, st.bgOpacity ?? 0.72);
    lines.forEach((l, i) => {
      const w = widths[i] + padX * 2;
      const x = align === 'left' ? ax - padX : align === 'right' ? ax - w + padX : ax - w / 2;
      ctx.beginPath();
      ctx.roundRect(x, top + i * lineH, w, lineH, size * 0.15);
      ctx.fill();
    });
  }
  if (st.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = size * 0.25;
    ctx.shadowOffsetY = size * 0.05;
  }
  if (st.outlineWidth > 0) {
    ctx.lineWidth = st.outlineWidth * k * 2;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = st.outlineColor;
    lines.forEach((l, i) => ctx.strokeText(l, ax, top + i * lineH + lineH / 2));
    ctx.shadowColor = 'transparent';
  }
  ctx.fillStyle = st.color;
  lines.forEach((l, i) => ctx.fillText(l, ax, top + i * lineH + lineH / 2));
  ctx.restore();
}

export function fontFamily(f) {
  if (FONTS[f]) return FONTS[f];
  return `"${String(f).replace(/"/g, '')}", ${FONTS.sans}`;
}

function hexAlpha(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
