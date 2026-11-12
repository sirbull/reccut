import { paintPattern, patternFromClip } from './designPattern.js';
// Tegner ett bilde av prosjektet. Samme kode brukes i forhåndsvisning og eksport,
// så det du ser i redigeringen er det som havner i filen.
import { containRect, followed } from './follow.js';
import { gpuGradeAvailable, gradeImage, gradeParams } from './grade.js';
import { shadowStyle } from './shadow.js';
import { applyVideoEffects } from './videoEffectsRender.js';
import { drawTestCard } from './testcard.js';
import { drawTemplate, findTemplate } from './titletemplates.js';
import { stabilizeAt } from './stabilize.js';
import { imageRectAt } from './imageMotion.js';
import { drawHighlight } from './highlight.js';
import { clipMatrix, clipPivot, maskList, paintMask, shapeAt, shapeCorners, shapePath } from './shapes.js';
import {
  DEFAULT_CAPTION_STYLE,
  FONTS,
  canMotionBlur,
  clamp,
  clicksAt,
  cursorAt,
  easeInOut,
  easeOutCubic,
  FULL_KEYBOARD_ROWS,
  heldAt,
  INPUT_POSITION,
  KEYBOARD_ROWS,
  layoutClipFor,
  pillsAt,
  recordingRectsAt,
  redactStrength,
  sideBackgroundMedia,
  sideProps,
  sourceTime,
  stickAt,
  valueAt,
  visualOpacity,
  zoomAmountAt,
} from './model.js';

/**
 * getSource(clip, streamKey, sourceTimeInStream) returnerer { img, w, h } eller null.
 */
export function drawFrame(ctx, project, frame, getSource, { scale = 1, matrix = null, transparent = false } = {}) {
  const W = project.width;
  const H = project.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (transparent) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (matrix) {
    // Beskjæring og ny størrelse ved eksport: tøm hele lerretet først.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!transparent) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.setTransform(matrix[0], 0, 0, matrix[1], matrix[2], matrix[3]);
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
  } else ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (!transparent) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
  }
  for (const layer of frame.layers) {
    if (layer.transition) drawTransition(ctx, project, layer, getSource, transparent);
    else drawVisualSide(ctx, project, layer, getSource, 1);
  }
  for (const c of frame.captions) drawCaption(ctx, project, c);
  ctx.restore();
}

function drawVisualSide(ctx, project, side, getSource, alpha = 1) {
  if (!side.companions?.length && !side.slideshowFrame) return drawClip(ctx, project, side.clip, side.T, getSource, alpha);
  if (alpha === 1) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, project.width, project.height); ctx.clip();
    if (side.slideshowFrame) { ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, project.width, project.height); ctx.restore(); }
    drawClip(ctx, project, side.clip, side.T, getSource);
    for (const clip of side.companions || []) drawClip(ctx, project, clip, side.T, getSource);
    ctx.restore();
    return;
  }
  // Fade the image + background as one picture, so portrait/landscape changes
  // never expose an opaque copy of the previous foreground during a dissolve.
  const { c, g } = scratchCanvas(10, ctx.canvas.width, ctx.canvas.height);
  g.setTransform(ctx.getTransform());
  g.save(); g.beginPath(); g.rect(0, 0, project.width, project.height); g.clip();
  if (side.slideshowFrame) { g.fillStyle = '#000'; g.fillRect(0, 0, project.width, project.height); }
  drawClip(g, project, side.clip, side.T, getSource);
  for (const clip of side.companions || []) drawClip(g, project, clip, side.T, getSource);
  g.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha;
  ctx.drawImage(c, 0, 0); ctx.restore();
}

function drawTransition(ctx, project, layer, getSource, transparent = false) {
  const W = project.width;
  const H = project.height;
  const { p, motionBlur, dur } = layer.transition;
  // ponytail: over andre spor blir dip en vanlig toning, ellers ville svart/hvitt dekke sporene under.
  const type = layer.overlay && layer.transition.type.startsWith('dip') ? 'dissolve' : layer.transition.type;
  const drawSide = (g, side, alpha = 1) => {
    if (side) return drawVisualSide(g, project, side, getSource, alpha);
    if (layer.overlay || transparent) return;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    g.restore();
  };
  if (motionBlur && [layer.a, layer.b].every((side) => !side || canMotionBlur(type, side.clip))) {
    return drawMotionBlur(ctx, W, H, type, p, SHUTTER / (project.fps * dur), (g, key) => drawSide(g, layer[key]));
  }
  paintTransition(ctx, W, H, type, p, (alpha) => drawSide(ctx, layer.a, alpha), (alpha) => drawSide(ctx, layer.b, alpha));
}

// Andel av et bilde lukkeren står åpen: 180 grader, som på et filmkamera.
const SHUTTER = 0.5;

// Punktene i overgangen som snittes for ett bilde, midt rundt p. span er lukkertiden
// som andel av overgangen, og size lengste kant i piksler. Antallet følger hvor langt bildet
// flytter seg, så trege overganger og liten forhåndsvisning koster lite.
export function shutterSamples(p, span, size) {
  const n = clamp(Math.ceil((span * 2 * size) / 3), 2, 32);
  return Array.from({ length: n }, (_, i) => clamp(p + span * ((i + 0.5) / n - 0.5), 0, 1));
}

// Kildene står stille innenfor ett bilde, så hver side tegnes bare én gang.
function drawMotionBlur(ctx, W, H, type, p, span, drawSide) {
  const m = ctx.getTransform();
  const w = Math.max(1, Math.round(W * m.a));
  const h = Math.max(1, Math.round(H * m.d));
  const side = (i, key) => {
    const { c, g } = scratchCanvas(i, w, h);
    g.setTransform(w / W, 0, 0, h / H, 0, 0);
    drawSide(g, key);
    return c;
  };
  const a = side(11, 'a');
  const b = side(12, 'b');
  const { c: sample, g: sg } = scratchCanvas(13, w, h);
  const { c: mean, g: mg } = scratchCanvas(14, w, h);
  const image = (c) => (alpha = 1) => {
    sg.globalAlpha = alpha;
    sg.drawImage(c, 0, 0, W, H);
    sg.globalAlpha = 1;
  };
  shutterSamples(p, span, Math.max(w, h)).forEach((t, i) => {
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, w, h);
    sg.setTransform(w / W, 0, 0, h / H, 0, 0);
    paintTransition(sg, W, H, type, t, image(a), image(b));
    // Løpende snitt av premultipliserte piksler, så gjennomsiktige områder stemmer. Å legge
    // sammen bilder med 1/n styrke ville gitt synlige bånd i myke gradienter.
    mg.globalAlpha = 1 / (i + 1);
    mg.globalCompositeOperation = 'destination-out';
    mg.fillRect(0, 0, w, h);
    mg.globalCompositeOperation = 'lighter';
    mg.drawImage(sample, 0, 0);
  });
  ctx.drawImage(mean, 0, 0, W, H);
}

function paintTransition(ctx, W, H, type, p, A, B) {
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
function graded(clip, T, src, target = 'main', media = null) {
  src = applyVideoEffects(src, clip, target, sourceTime(clip, T));
  const g = gradeParams(clip, T, target);
  const cam = media?.cameraLut || null;
  if (!g && !cam) return src;
  const cv = gradeImage(src.img, src.w, src.h, g, cam);
  if (cv) return { img: cv, w: src.w, h: src.h };
  // Kameraets hvitbalanse må også virke uten WebGL, før beskjæring og maskering.
  return target === 'camera' && g?.temperature ? temperatureSource(src, g.temperature) : src;
}

let temperatureCanvas = null;
function temperatureSource(src, temperature) {
  temperatureCanvas ||= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(src.w, src.h) : document.createElement('canvas');
  if (temperatureCanvas.width !== src.w) temperatureCanvas.width = src.w;
  if (temperatureCanvas.height !== src.h) temperatureCanvas.height = src.h;
  const ctx = temperatureCanvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, src.w, src.h);
  ctx.drawImage(src.img, 0, 0, src.w, src.h);
  const pixels = ctx.getImageData(0, 0, src.w, src.h);
  const red = Math.pow(Math.max(0, 1 + 0.3 * temperature), 1 / 2.2);
  const blue = Math.pow(Math.max(0, 1 - 0.3 * temperature), 1 / 2.2);
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] *= red;
    pixels.data[i + 2] *= blue;
  }
  ctx.putImageData(pixels, 0, 0);
  return { img: temperatureCanvas, w: src.w, h: src.h };
}

function colorFilter(clip, T, H = 1080, target = 'main') {
  const gpu = gpuGradeAvailable();
  const grade = gpu ? null : gradeParams(clip, T, target);
  const ex = grade?.exposure || 0;
  const co = grade?.contrast || 0;
  const sa = grade?.saturation || 0;
  const parts = [];
  const brightness = target === 'camera' ? 2 ** (ex * 2 / 2.2) : 1 + ex;
  if (ex || co || sa) parts.push(`brightness(${brightness.toFixed(3)}) contrast(${(1 + co).toFixed(3)}) saturate(${Math.max(0, 1 + sa).toFixed(3)})`);
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

// Composite once so shadows follow the final alpha, and opacity applies to the whole result.
function compositeLayer(ctx, canvas, w, h, shadow, H, style = null) {
  const m = ctx.getTransform(), scale = Math.hypot(m.a, m.b) || 1;
  if (shadow > 0) {
    // Canvas applies globalAlpha separately to the shadow and image. Merge them at full
    // opacity first, then fade the completed layer to avoid dark halos during fades.
    const { c, g } = scratchCanvas(6, w, h);
    g.save();
    const color = style?.color || '#000000';
    const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
    g.shadowColor = `rgba(${rgb.join(',')},${Math.min(1, style?.opacity ?? 0.75 * shadow).toFixed(3)})`;
    g.shadowBlur = (style?.blur ?? H * 0.045 * shadow) * scale;
    const x = style?.offsetX ?? 0, y = style?.offsetY ?? style?.offset ?? H * 0.012 * shadow;
    g.shadowOffsetX = m.a * x + m.c * y;
    g.shadowOffsetY = m.b * x + m.d * y;
    g.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
    g.restore();
    canvas = c;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.drawImage(canvas, 0, 0, w, h, 0, 0, w, h);
  ctx.restore();
}

// Source effects and grading have already run. Keep overlays on the visible pixels.
function drawWithEffects(output, clip, T, r, H, draw) {
  const radiusPct = valueAt(clip, 'radius', T) || 0;
  const shadow = valueAt(clip, 'shadow', T) || 0;
  const vignette = valueAt(clip, 'vignette', T) || 0;
  const border = valueAt(clip, 'border', T) || 0;
  const temperature = !gpuGradeAvailable() && (valueAt(clip, 'temperature', T) || 0);
  const rad = (Math.min(r.w, r.h) * radiusPct) / 100;
  const isolated = shadow > 0 || vignette > 0 || temperature;
  const w = output.canvas.width, h = output.canvas.height;
  const layer = isolated ? scratchCanvas(4, w, h) : null;
  const ctx = layer ? layer.g : output;
  if (layer) ctx.setTransform(output.getTransform());
  ctx.save();
  if (rad > 0) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, rad);
    ctx.clip();
  }
  draw(ctx);
  ctx.filter = 'none';
  if (temperature) applyTemperature(ctx, clip, T, r);
  if (vignette > 0) {
    ctx.globalCompositeOperation = 'source-atop';
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
  if (layer) compositeLayer(output, layer.c, w, h, shadow, H, shadowStyle(clip, T, H));
}

function applyTemperature(ctx, clip, T, rect) {
  const t = valueAt(clip, 'temperature', T) || 0;
  if (!t) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = Math.min(1, Math.abs(t)) * 0.65;
  ctx.fillStyle = t > 0 ? '#ff9a2e' : '#2e8bff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

export function drawClip(ctx, project, clip, T, getSource, alphaMul = 1, unmasked = false) {
  // Levende kobling til et spor: klippet tegnes der objektet er nå.
  clip = followed(project, clip, T);
  const W = project.width;
  const H = project.height;
  const alpha = visualOpacity(clip, T) * alphaMul;
  if (alpha <= 0.001) return;
  if (clip.type === 'adjustment') return drawAdjustment(ctx, project, clip, T, alpha);
  if (clip.type === 'redact' && clip.props.mode === 'highlight') return drawHighlight(ctx, clip, T, W, H, alpha);
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
    const P = clipPivot(clip, T, W, H, project);
    ctx.translate(P.x + x, P.y + y);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc, sc);
    ctx.translate(-P.x, -P.y);
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
    if (src) src = graded(clip, T, src, 'main', media);
    if (src) {
      const full = clip.type === 'image' ? imageRectAt(clip, T, src.w, src.h, W, H) : containRect(src.w, src.h, W, H);
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
      drawWithEffects(ctx, clip, T, r, H, (ctx) => {
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
    if (clip.props.patternKind) {
      ctx.fillStyle = valueAt(clip, 'patternBackground', T) || '#182133'; ctx.fillRect(0, 0, W, H);
      paintPattern(ctx, patternFromClip(clip, T, valueAt), W, H);
    } else if (clip.props.template) {
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
  if (i >= 4 ? c.width !== w || c.height !== h : c.width < w || c.height < h) {
    c.width = i >= 4 ? w : Math.max(c.width, w);
    c.height = i >= 4 ? h : Math.max(c.height, h);
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

// An adjustment processes a snapshot of the composite below its lane. Work in
// project coordinates so cropped/scaled exports keep the same effect geometry.
function drawAdjustment(ctx, project, clip, T, alpha) {
  if (!(clip.props.vfx || []).some((e) => e.on !== false) && !gradeParams(clip, T) &&
    !['blur', 'sepia', 'grayscale', 'invert', 'hue', 'radius', 'shadow', 'vignette', 'border'].some((key) => valueAt(clip, key, T))) return;
  const W = project.width, H = project.height, m = ctx.getTransform();
  const k = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
  if (!(k > 0) || !Number.isFinite(k)) return;
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const sx = w / W, sy = h / H;
  const { c: original, g: og } = scratchCanvas(8, w, h); // drawWithEffects owns 4
  const inverse = m.inverse();
  og.setTransform(sx * inverse.a, sy * inverse.b, sx * inverse.c, sy * inverse.d, sx * inverse.e, sy * inverse.f);
  og.drawImage(ctx.canvas, 0, 0);
  const src = graded(clip, T, { img: original, w, h, pixelScale: k });
  const { c: processed, g: pg } = scratchCanvas(5, w, h);
  pg.setTransform(sx, 0, 0, sy, 0, 0);
  drawWithEffects(pg, clip, T, { x: 0, y: 0, w: W, h: H }, H, (g) => {
    g.filter = colorFilter(clip, T, H * k);
    g.drawImage(src.img, 0, 0, src.w, src.h, 0, 0, W, H);
  });
  const { c: mask, g: mg } = scratchCanvas(6, w, h);
  if (maskList(clip).length) paintMask(mg, clip, T, W, H, new DOMMatrix([sx, 0, 0, sy, 0, 0]), w, h, project);
  else { mg.fillStyle = '#fff'; mg.fillRect(0, 0, w, h); }
  pg.setTransform(1, 0, 0, 1, 0, 0);
  pg.globalCompositeOperation = 'destination-in';
  pg.drawImage(mask, 0, 0, w, h, 0, 0, w, h);
  // Interpolate premultiplied RGBA, including keyed/transparent output. Simply
  // drawing over the original would retain the original pixels under holes.
  const { c: mixed, g: bg } = scratchCanvas(7, w, h);
  bg.drawImage(original, 0, 0, w, h, 0, 0, w, h);
  bg.globalAlpha = Math.max(0, Math.min(1, alpha));
  bg.globalCompositeOperation = 'destination-out';
  bg.drawImage(mask, 0, 0, w, h, 0, 0, w, h);
  bg.globalCompositeOperation = 'lighter';
  bg.drawImage(processed, 0, 0, w, h, 0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(mixed, 0, 0, w, h, 0, 0, W, H);
  ctx.restore();
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
  let sw = 0;
  let sh = 0;
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
    sw = Math.max(1, Math.ceil(bw / blk));
    sh = Math.max(1, Math.ceil(bh / blk));
    const { c: S, g: sg } = scratchCanvas(1, sw, sh);
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(src, bx, by, bw, bh, 0, 0, sw, sh);
    g.imageSmoothingEnabled = frosted;
    if (frosted) g.filter = `blur(${(blk * 0.45).toFixed(1)}px)`;
    g.drawImage(S, 0, 0, sw, sh, 0, 0, bw, bh);
    g.filter = 'none';
  }
  // Masken: formen (eller alt utenfor den), med myk kant om ønsket, og maskene på effekten
  // (tegnet med pennen eller som former): bare der virker den.
  const cut = (t, soft) => {
    t.setTransform(1, 0, 0, 1, -bx, -by);
    t.globalCompositeOperation = pr.invert ? 'destination-out' : 'destination-in';
    if (soft > 0.5) t.filter = `blur(${(soft / 2).toFixed(1)}px)`;
    t.fillStyle = '#000';
    if (geom.shape !== 'full') t.fill(devPath);
    t.setTransform(1, 0, 0, 1, 0, 0);
    t.filter = 'none';
    t.globalCompositeOperation = 'source-over';
    if (maskList(clip).length) {
      const { c: Mk, g: mg } = scratchCanvas(2, cw, ch);
      paintMask(mg, clip, T, W, H, m, cw, ch);
      t.globalCompositeOperation = 'destination-in';
      t.drawImage(Mk, bx, by, bw, bh, 0, 0, bw, bh);
      t.globalCompositeOperation = 'source-over';
    }
  };
  if (mode === 'pixelate' && pr.wholeBlocks && sw) {
    // Hele blokker: masken regnes per blokk, så blokkene langs kanten ikke kuttes. En blokk er med
    // når litt av den er innenfor, så kanten kan gå litt utenfor formen, men ikke innenfor.
    const { c: M, g: mg } = scratchCanvas(3, bw, bh);
    mg.fillStyle = '#000';
    mg.fillRect(0, 0, bw, bh);
    cut(mg, 0);
    const { c: Q, g: qg } = scratchCanvas(1, sw, sh);
    qg.imageSmoothingQuality = 'high';
    qg.drawImage(M, 0, 0, bw, bh, 0, 0, sw, sh);
    const d = qg.getImageData(0, 0, sw, sh);
    // ponytail: terskelen 10/255 tar med blokker med noen få prosent av formen, men ikke naboene
    // som bare får litt fra nedskaleringen.
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 10 ? 255 : 0;
    qg.putImageData(d, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.imageSmoothingEnabled = false;
    if (feather > 0.5) g.filter = `blur(${(feather / 2).toFixed(1)}px)`;
    g.drawImage(Q, 0, 0, sw, sh, 0, 0, bw, bh);
    g.filter = 'none';
    g.imageSmoothingEnabled = true;
    g.globalCompositeOperation = 'source-over';
  } else cut(g, feather);
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
  // Apply the shadow after the user mask, including its soft edges.
  const shadow = valueAt(clip, 'shadow', T) || 0;
  const content = shadow > 0 ? { ...clip, props: { ...clip.props, shadow: 0 }, kf: { ...clip.kf, shadow: [] } } : clip;
  drawClip(lg, project, content, T, getSource, 1 / visualOpacity(clip, T), true);
  const { c: M, g: mg } = scratchCanvas(3, cw, ch);
  paintMask(mg, clip, T, project.width, project.height, base, cw, ch, project);
  lg.setTransform(1, 0, 0, 1, 0, 0);
  lg.globalCompositeOperation = 'destination-in';
  lg.drawImage(M, 0, 0, cw, ch, 0, 0, cw, ch);
  lg.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = visualOpacity(clip, T) * alphaMul;
  ctx.filter = 'none';
  // Restore the project transform for consistent shadow size in preview and export.
  ctx.setTransform(base.multiply(clipMatrix(clip, T, project.width, project.height, project)));
  compositeLayer(ctx, L, cw, ch, shadow, project.height, shadowStyle(clip, T, project.height));
  ctx.restore();
}

function drawRecordingInputs(ctx, clip, media, T, s, W, H) {
  if (clip.props.showKeys) drawKeys(ctx, pillsAt(media.rec, s), W, H);
  if (clip.props.showInputs) {
    drawInputOverlay(ctx, {
      ...media.rec?.overlays?.inputs,
      held: heldAt(media.rec?.inputs, s),
      stick: stickAt(media.rec?.sticks, s),
      x: valueAt(clip, 'inputX', T) ?? INPUT_POSITION.x,
      y: valueAt(clip, 'inputY', T) ?? INPUT_POSITION.y,
    }, W, H);
  }
}

function drawRecording(ctx, project, clip, media, T, s, getSource) {
  const W = project.width;
  const H = project.height;
  if (clip.recordingPart === 'keys') return drawRecordingInputs(ctx, clip, media, T, s, W, H);
  const filter = colorFilter(clip, T, H);
  let screenRect = { x: 0, y: 0, w: W, h: H };
  const screen = media.streams.screen;
  const camera = media.streams.camera;
  const showCamera = valueAt(clip, 'showCamera', T) !== false;
  // Oppsettet (hjørne, side om side) kan komme fra PiP-klippet på sporet over.
  let layoutClip = screen && camera?.hasVideo ? layoutClipFor(project, clip, T) : null;
  if (layoutClip === clip && !showCamera) layoutClip = null;
  const aspect = screen?.width && screen?.height ? screen.width / screen.height : 16 / 9;
  const layout = layoutClip ? recordingRectsAt(layoutClip, layoutClip === clip ? s : sourceTime(layoutClip, T), W, H, aspect) : null;
  const side = layout?.side || 0;
  const sp = layoutClip && sideProps(layoutClip);
  if (screen && clip.recordingPart !== 'camera') {
    if (side > 0.001) drawSideBackground(ctx, project, layoutClip, sp, side, W, H, getSource);
    let src = getSource(clip, 'screen', s - (screen.offset || 0));
    if (src) src = graded(clip, T, src, 'screen', media);
    if (src) {
      const r = (screenRect = side > 0 ? layout.screen : containRect(src.w, src.h, W, H));
      if (side > 0.001 && !(valueAt(clip, 'shadow', T) > 0)) drawSideShadow(ctx, r, side);
      drawWithEffects(ctx, clip, T, r, H, (ctx) => {
        if (r.r > 0.5) {
          ctx.beginPath();
          ctx.roundRect(r.x, r.y, r.w, r.h, r.r);
          ctx.clip();
        }
        ctx.filter = filter;
        ctx.drawImage(src.img, r.x, r.y, r.w, r.h);
      });
      if (side > 0.001) drawSideFrame(ctx, sp, r, side, H);
    } else if (side > 0) {
      screenRect = layout.screen;
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

  if (camera?.hasVideo && showCamera && clip.recordingPart !== 'screen') {
    const rect = screen && layout ? layout.cam : { x: 0, y: 0, w: W, h: H, r: 0, a: 1 };
    let src = rect.a > 0.01 ? getSource(clip, 'camera', s - (camera.offset || 0)) : null;
    if (src) src = graded(clip, T, src, 'camera', media);
    if (src) {
      ctx.save();
      ctx.globalAlpha *= rect.a;
      drawWithEffects(ctx, clip, T, rect, H, (ctx) => {
        ctx.filter = colorFilter(clip, T, H, 'camera');
        drawCamera(ctx, src.img, src.w, src.h, rect, clip.props.mirror, rect.h < H * 0.9 && !(valueAt(clip, 'shadow', T) > 0), clamp(valueAt(clip, 'cameraOffsetX', T) || 0, -1, 1), clamp(valueAt(clip, 'cameraOffsetY', T) || 0, -1, 1));
      });
      if (side > 0.001) drawSideFrame(ctx, sp, rect, side, H);
      ctx.restore();
    }
  }
  if (clip.recordingPart !== 'camera') drawRecordingInputs(ctx, clip, media, T, s, W, H);
}

// Bakgrunnen bak side om side: et bilde fra biblioteket (fyller bildet), en gradient eller en farge.
function drawSideBackground(ctx, project, clip, p, alpha, W, H, getSource) {
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha *= alpha;
  const src = sideBackgroundMedia(project, clip) ? getSource(clip, 'background', 0) : null;
  if (src) {
    const sc = Math.max(W / src.w, H / src.h);
    ctx.drawImage(src.img, (W - src.w * sc) / 2, (H - src.h * sc) / 2, src.w * sc, src.h * sc);
  } else if (p.sideBg === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p.sideBgColor);
    g.addColorStop(1, p.sideBgColor2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = p.sideBgColor;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Myk skygge under skjermen, laget på samme måte som kameraets, så den blir lik i visning og eksport.
function drawSideShadow(ctx, r, alpha) {
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const layer = scratchCanvas(5, w, h);
  layer.g.setTransform(ctx.getTransform());
  layer.g.fillStyle = '#000';
  layer.g.beginPath();
  layer.g.roundRect(r.x, r.y, r.w, r.h, r.r);
  layer.g.fill();
  ctx.save();
  ctx.globalAlpha *= alpha;
  compositeLayer(ctx, layer.c, w, h, 1, r.h, { opacity: 0.45, blur: r.w * 0.03, offset: r.h * 0.015 });
  ctx.restore();
}

// Ramme rundt skjerm og kamera, utenfor bildet så ingenting dekkes.
function drawSideFrame(ctx, p, r, alpha, H) {
  if (p.sideFrame !== 'line' && p.sideFrame !== 'gradient') return;
  const lw = Math.max(1, H * 0.004);
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha *= alpha;
  ctx.lineWidth = lw;
  if (p.sideFrame === 'gradient') {
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, p.sideFrameColor);
    g.addColorStop(1, p.sideFrameColor2);
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = p.sideFrameColor;
  ctx.beginPath();
  ctx.roundRect(r.x - lw / 2, r.y - lw / 2, r.w + lw, r.h + lw, r.r + lw / 2);
  ctx.stroke();
  ctx.restore();
}

// Kamerabildet beskjæres slik at det fyller rammen, med skygge når det er bilde i bilde.
// ox og oy flytter bildet inni rammen: 1 er helt til høyre og ned, -1 helt til venstre og opp.
export function drawCamera(ctx, img, vw, vh, cam, mirror, shadow, ox = 0, oy = 0) {
  const output = ctx;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const layer = shadow ? scratchCanvas(5, w, h) : null;
  if (layer) {
    ctx = layer.g;
    ctx.setTransform(output.getTransform());
    ctx.filter = output.filter;
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cam.x, cam.y, cam.w, cam.h, cam.r);
  ctx.clip();
  const scale = Math.max(cam.w / vw, cam.h / vh);
  const sw = cam.w / scale;
  const sh = cam.h / scale;
  const sx = ((vw - sw) / 2) * (1 + (mirror ? ox : -ox));
  const sy = ((vh - sh) / 2) * (1 - oy);
  if (mirror) {
    ctx.translate(cam.x + cam.w, cam.y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cam.w, cam.h);
  } else {
    ctx.drawImage(img, sx, sy, sw, sh, cam.x, cam.y, cam.w, cam.h);
  }
  ctx.restore();
  if (layer) compositeLayer(output, layer.c, w, h, 1, cam.h, { opacity: 0.4, blur: cam.w * 0.05, offset: cam.w * 0.012 });
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
// Overlegget med tastatur, mus og kontroller. x og y er 0..1 av plassen som er igjen rundt
// overlegget, så det alltid ligger helt inne i bildet.
export function drawInputOverlay(ctx, { keyboard, mouse, pad, held, stick, x = 0, y = 1 }, W, H) {
  const full = keyboard === 'full';
  const parts = [keyboard && keyboard !== 'off' && [drawKeyboardPart, full ? 15 : 7.25], mouse && [drawMousePart, 2.6], pad && [drawPadPart, 7.5]].filter(Boolean);
  if (!parts.length) return;
  const u = H * 0.026;
  const inset = u * 0.4;
  const gap = u * 0.6;
  const w = parts.reduce((sum, [, width]) => sum + width * u, 0) + gap * (parts.length - 1) + inset * 2;
  const h = u * (full ? 6 : 5) + inset * 2;
  const left = clamp(x, 0, 1) * (W - w);
  const top = clamp(y, 0, 1) * (H - h);
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(28, 28, 30, 0.78)';
  ctx.beginPath();
  ctx.roundRect(left, top, w, h, u * 0.5);
  ctx.fill();
  let px = left + inset;
  for (const [draw, width] of parts) {
    draw(ctx, px, top + inset, u, held, draw === drawKeyboardPart ? (full ? FULL_KEYBOARD_ROWS : KEYBOARD_ROWS) : stick);
    px += width * u + gap;
  }
  ctx.restore();
}

const inputFill = (on) => (on ? '#0a84ff' : 'rgba(255, 255, 255, 0.12)');

function inputKey(ctx, x, y, w, h, u, label, on, radius = u * 0.16) {
  ctx.fillStyle = inputFill(on);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  if (!label) return;
  ctx.font = `600 ${u * (label.length > 2 ? 0.32 : 0.4)}px ${FONTS.sans}`;
  ctx.fillStyle = on ? '#fff' : 'rgba(255, 255, 255, 0.75)';
  ctx.fillText(label, x + w / 2, y + h / 2);
}

function drawKeyboardPart(ctx, x, y, u, held, rows) {
  const gap = u * 0.12;
  const mac = globalThis.window?.api?.platform === 'darwin';
  rows.forEach((row, i) => {
    let kx = x + (row.indent || 0) * u;
    for (const [name, label, width = 1] of row.keys) {
      inputKey(ctx, kx, y + i * u, width * u - gap, u - gap, u, name === 'Meta' && !mac ? 'Win' : label, held?.has(name));
      kx += width * u;
    }
  });
}

function drawMousePart(ctx, x, y, u, held) {
  const w = u * 2.6;
  const h = u * 5;
  const gap = u * 0.12;
  const top = h * 0.42;
  const button = (name, bx, corners) => {
    ctx.fillStyle = inputFill(held?.has(name));
    ctx.beginPath();
    ctx.roundRect(bx, y, w / 2 - gap / 2, top - gap, corners);
    ctx.fill();
  };
  button('MouseLeft', x, [w / 2, 0, 0, 0]);
  button('MouseRight', x + w / 2 + gap / 2, [0, w / 2, 0, 0]);
  ctx.fillStyle = inputFill(false);
  ctx.beginPath();
  ctx.roundRect(x, y + top, w, h - top, [0, 0, w / 2, w / 2]);
  ctx.fill();
  // Hjulet ligger over skillet mellom knappene.
  ctx.fillStyle = held?.has('MouseMiddle') ? '#0a84ff' : '#48484a';
  ctx.beginPath();
  ctx.roundRect(x + w / 2 - u * 0.2, y + top * 0.3, u * 0.4, top * 0.5, u * 0.2);
  ctx.fill();
}

function drawPadPart(ctx, x, y, u, held, stick = [0, 0, 0, 0]) {
  const small = u * 0.8;
  const button = (name, label, cx, cy, w = small, h = small, r = small / 2) => inputKey(ctx, x + cx * u - w / 2, y + cy * u - h / 2, w, h, u, label, held?.has(name), r);
  const thumb = (name, cx, cy, sx, sy) => {
    ctx.fillStyle = inputFill(false);
    ctx.beginPath();
    ctx.arc(x + cx * u, y + cy * u, u * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = held?.has(name) ? '#0a84ff' : 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(x + (cx + sx * 0.42) * u, y + (cy + sy * 0.42) * u, u * 0.38, 0, Math.PI * 2);
    ctx.fill();
  };
  const r = u * 0.16;
  button('PadLT', 'LT', 0.8, 0.3, u * 1.5, u * 0.6, r);
  button('PadLB', 'LB', 2.4, 0.3, u * 1.5, u * 0.6, r);
  button('PadRB', 'RB', 5.1, 0.3, u * 1.5, u * 0.6, r);
  button('PadRT', 'RT', 6.7, 0.3, u * 1.5, u * 0.6, r);
  thumb('PadLS', 1.1, 1.9, stick[0], stick[1]);
  thumb('PadRS', 4.8, 3.9, stick[2], stick[3]);
  button('PadBack', '', 3.1, 1.6, u * 0.7, u * 0.4, r);
  button('PadStart', '', 4.4, 1.6, u * 0.7, u * 0.4, r);
  for (const [name, dx, dy] of [['PadUp', 0, -0.62], ['PadDown', 0, 0.62], ['PadLeft', -0.62, 0], ['PadRight', 0.62, 0]]) button(name, '', 2.7 + dx, 3.9 + dy, u * 0.56, u * 0.56, r);
  button('PadY', 'Y', 6.3, 1.1);
  button('PadX', 'X', 5.5, 1.9);
  button('PadB', 'B', 7.1, 1.9);
  button('PadA', 'A', 6.3, 2.7);
}

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
