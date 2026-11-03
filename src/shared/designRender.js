import { fitBox, designShapePoints, effectMargin } from './design.js';
import { layoutDesignText } from './designText.js';
import { dilateAlpha, erodeAlpha, readAlpha, alphaPixels, designClipGroups } from './designMasks.js';
import { shapePath } from './shapes.js';
import { gradientParams } from './gradient.js';
import { renderGradient, gradientCanvasStyle } from './gradientRender.js';

const canvasFactory = (w, h) => new OffscreenCanvas(w, h);
const cache = new Map();
let layerCache = new WeakMap();
let cachedPixels = 0;
const fields = new Map();
export function clearDesignRenderCache() { cache.clear(); layerCache = new WeakMap(); fields.clear(); cachedPixels = 0; }
export function designRenderCacheStats() { return { layers: cache.size, pixels: cachedPixels }; }

// Paint in local box coordinates, after the layer transform. Native linear and
// radial fields extend their end colors outside the box (important for strokes).
// Freeform uses the same cached GPU/CPU field as the existing Gradient Editor.
export function paintFill(ctx, fill, box, paint = () => ctx.fillRect(box.x, box.y, box.w, box.h)) {
  if (!fill || !fill.alpha && fill.alpha !== undefined) return;
  ctx.save(); ctx.globalAlpha *= fill.alpha ?? 1;
  if (fill.type === 'gradient') {
    const p = gradientParams(fill.gradient), { x, y, w, h } = box;
    if (p.mode === 'freeform') {
      const k = Math.min(1, 4096 / Math.max(w, h)), fw = Math.max(1, Math.ceil(w * k)), fh = Math.max(1, Math.ceil(h * k));
      const padding = Math.ceil(501 * k), key = JSON.stringify([fw, fh, padding, p]);
      let field = fields.get(key);
      if (!field) {
        const source = renderGradient(p, fw, fh);
        field = canvasFactory(fw + padding * 2, fh + padding * 2);
        const f = field.getContext('2d');
        f.drawImage(source, padding, padding);
        // Extend edge pixels rather than repeat the gradient outside the box.
        for (const [sx, sw, dx, dw] of [[0, 1, 0, padding], [0, fw, padding, fw], [fw - 1, 1, padding + fw, padding]]) {
          for (const [sy, sh, dy, dh] of [[0, 1, 0, padding], [0, fh, padding, fh], [fh - 1, 1, padding + fh, padding]]) {
            if (sw === fw && sh === fh) continue;
            f.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
          }
        }
        fields.set(key, field);
        if (fields.size > 2) fields.delete(fields.keys().next().value);
      }
      const pattern = ctx.createPattern(field, 'no-repeat');
      ctx.fillStyle = pattern || '#ffffff';
      if (pattern?.setTransform && typeof DOMMatrix !== 'undefined') pattern.setTransform(new DOMMatrix().translate(x - padding * w / fw, y - padding * h / fh).scale(w / fw, h / fh));
    } else {
      ctx.fillStyle = gradientCanvasStyle(ctx, p, w, h, x, y);
    }
  } else ctx.fillStyle = fill.color || '#ffffff';
  paint(); ctx.restore();
}
function traceShape(ctx, l) {
  ctx.beginPath();
  if (l.shape === 'ellipse') ctx.ellipse(l.w / 2, l.h / 2, l.w / 2, l.h / 2, 0, 0, Math.PI * 2);
  else if (!l.shape || l.shape === 'rect') ctx.roundRect(0, 0, l.w, l.h, Math.min(l.radius || 0, l.w / 2, l.h / 2));
  else {
    designShapePoints(l).forEach(([x, y], i) => i ? ctx.lineTo(x * l.w, y * l.h) : ctx.moveTo(x * l.w, y * l.h));
    if (!['line', 'arrow'].includes(l.shape)) ctx.closePath();
  }
}
export function imageFilter(a = {}, pixelRatio = 1) {
  return `brightness(${1 + (a.brightness || 0)}) contrast(${1 + (a.contrast || 0)}) saturate(${1 + (a.saturation || 0)}) hue-rotate(${a.hue || 0}deg) blur(${(a.blur || 0) * pixelRatio}px) grayscale(${a.grayscale || 0})`;
}
function textGeometry(ctx, l) {
  ctx.letterSpacing = '0px';
  const layout = layoutDesignText(l, (t, font) => { ctx.font = font; return ctx.measureText(t).width; });
  ctx.font = layout.font; ctx.textAlign = l.align; ctx.textBaseline = 'middle'; ctx.letterSpacing = `${l.tracking || 0}px`;
  const x = l.align === 'left' ? 0 : l.align === 'right' ? l.w : l.w / 2;
  const top = l.valign === 'top' ? 0 : l.valign === 'bottom' ? l.h - layout.height : (l.h - layout.height) / 2;
  return { ...layout, x, top };
}
function drawText(ctx, l, kind = 'fill', spread = 0) {
  const g = textGeometry(ctx, l), box = { x: 0, y: 0, w: l.w, h: l.h };
  // Clip overflow to the text box, allowing contours and line-box padding out.
  ctx.save(); const pad = Math.max(spread, l.stroke?.width || 0, l.box?.padding || 0);
  ctx.beginPath(); ctx.rect(-pad, -pad, l.w + 2 * pad, l.h + 2 * pad); ctx.clip();
  g.lines.forEach((line, i) => {
    const y = g.top + (i + 0.5) * g.lineHeight, width = g.widths[i];
    ctx.direction = /[\u0590-\u08ff]/u.test(line) ? 'rtl' : 'ltr';
    const left = g.x - (l.align === 'center' ? width / 2 : l.align === 'right' ? width : 0);
    if ((kind === 'fill' || kind === 'box') && l.box?.fill && line) {
      const p = l.box.padding;
      paintFill(ctx, l.box.fill, box, () => { ctx.beginPath(); ctx.roundRect(left - p, y - g.lineHeight / 2 - p, width + 2 * p, g.lineHeight + 2 * p, Math.min(l.box.radius, (g.lineHeight + 2 * p) / 2)); ctx.fill(); });
    }
    if (kind === 'box') return;
    if (kind === 'stroke') { ctx.strokeText(line, g.x, y); return; }
    if (kind === 'silhouette') {
      ctx.fillStyle = '#000000'; ctx.fillText(line, g.x, y);
      if (spread > 0) { ctx.strokeStyle = '#000000'; ctx.lineWidth = spread * 2; ctx.lineJoin = 'round'; ctx.strokeText(line, g.x, y); }
      return;
    }
    paintFill(ctx, l.fill, box, () => ctx.fillText(line, g.x, y));
    let prefix = '';
    for (const run of g.lineRuns[i]) {
      if (run.highlight && l.highlight) {
        const before = ctx.measureText(prefix).width, end = ctx.measureText(prefix + run.text).width;
        ctx.save(); ctx.beginPath();
        ctx.rect(ctx.direction === 'rtl' ? left + width - end : left + before, y - g.lineHeight / 2 - pad, end - before + 0.5, g.lineHeight + pad * 2); ctx.clip();
        // Draw the whole line through a run clip to retain kerning and shaping.
        paintFill(ctx, l.highlight, box, () => ctx.fillText(line, g.x, y)); ctx.restore();
      }
      prefix += run.text;
    }
  }); ctx.restore();
}
function drawContent(ctx, l, image, pixelRatio = 1) {
  if (l.type === 'shape') { traceShape(ctx, l); paintFill(ctx, l.fill, { x: 0, y: 0, w: l.w, h: l.h }, () => ctx.fill()); }
  else if (l.type === 'text') drawText(ctx, l);
  else {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, l.w, l.h); ctx.clip();
    if (image) {
      const sw = image.naturalWidth || image.width, sh = image.naturalHeight || image.height;
      const c = l.crop, box = fitBox(sw * c.w, sh * c.h, l.w, l.h, l.fit);
      ctx.filter = imageFilter(l.adjust, pixelRatio);
      ctx.drawImage(image, sw * c.x, sh * c.y, sw * c.w, sh * c.h, box.x, box.y, box.w, box.h);
    } else {
      ctx.fillStyle = '#3f3f46'; ctx.fillRect(0, 0, l.w, l.h);
      const cell = Math.max(8, Math.max(l.w, l.h) / 32); ctx.fillStyle = '#52525b';
      for (let y = 0, row = 0; y < l.h; y += cell, row++) for (let x = 0, col = 0; x < l.w; x += cell, col++) if ((row + col) % 2 === 0) ctx.fillRect(x, y, Math.min(cell, l.w - x), Math.min(cell, l.h - y));
      ctx.fillStyle = '#d4d4d8'; ctx.font = `${Math.min(24, l.w / 10)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Missing file', l.w / 2, l.h / 2);
    }
    ctx.restore();
  }
}
function alphaCanvas(makeCanvas, width, height, alpha, color = '#ffffff') {
  const canvas = makeCanvas(width,height), ctx = canvas.getContext('2d'), pixels = ctx.createImageData(width,height);
  pixels.data.set(alphaPixels(alpha,color));ctx.putImageData(pixels,0,0);return canvas;
}
function applyMasks(canvas, l, image, cutout, ratio, margin, w, h, create) {
  const ctx = canvas.getContext('2d');
  if (l.type === 'image' && l.cutout?.enabled && cutout && image) {
    let mask = create(), m = mask.getContext('2d');
    const sw = cutout.naturalWidth || cutout.width, sh = cutout.naturalHeight || cutout.height, c = l.crop;
    const b = fitBox(sw*c.w,sh*c.h,l.w,l.h,l.fit);
    m.scale(ratio,ratio);m.translate(margin,margin);
    m.drawImage(cutout,sw*c.x,sh*c.y,sw*c.w,sh*c.h,b.x,b.y,b.w,b.h);
    if (l.cutout.shift) {
      const alpha = readAlpha(m.getImageData(0,0,mask.width,mask.height).data);
      mask = alphaCanvas((w,h)=>create(w,h),mask.width,mask.height,(l.cutout.shift>0?dilateAlpha:erodeAlpha)(alpha,mask.width,mask.height,Math.abs(l.cutout.shift)*ratio));
    }
    ctx.save();ctx.globalCompositeOperation='destination-in';ctx.filter=l.cutout.feather?`blur(${l.cutout.feather*ratio}px)`:'none';ctx.drawImage(mask,-margin,-margin,w,h);ctx.restore();
  }
  if (l.mask) {
    const mask = create(), m = mask.getContext('2d'), p = l.mask.points.map(([x,y])=>[x*l.w,y*l.h]);
    const xs=p.map(p=>p[0]),ys=p.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),mw=Math.max(...xs)-x,mh=Math.max(...ys)-y;
    m.scale(ratio,ratio);m.translate(margin,margin);m.fillStyle='#ffffff';
    if (mw>0&&mh>0) m.fill(shapePath(l.mask.shape==='polygon'?{shape:'path',pts:p}:{shape:l.mask.shape,cx:x+mw/2,cy:y+mh/2,w:mw,h:mh,rot:0},l.mask.smooth));
    ctx.save();ctx.globalCompositeOperation=l.mask.invert?'destination-out':'destination-in';ctx.filter=l.mask.feather?`blur(${l.mask.feather*ratio}px)`:'none';ctx.drawImage(mask,-margin,-margin,w,h);ctx.restore();
  }
  if (l.outline?.width>0) {
    const alpha=readAlpha(ctx.getImageData(0,0,canvas.width,canvas.height).data), expanded=dilateAlpha(alpha,canvas.width,canvas.height,l.outline.width*ratio);
    const outlined=alphaCanvas((w,h)=>create(w,h),canvas.width,canvas.height,expanded,l.outline.color);
    outlined.getContext('2d').drawImage(canvas,0,0);return outlined;
  }
  return canvas;
}
function bitmap(l, image, cutout, ratio, makeCanvas) {
  const margin = effectMargin(l), w = l.w + margin * 2, h = l.h + margin * 2;
  // Bound allocations even for deliberately enormous off-canvas layers.
  ratio = Math.max(0.0001, Math.min(ratio, 8192 / w, 8192 / h, Math.sqrt(16_777_216 / (w * h))));
  const create = () => makeCanvas(Math.max(1, Math.ceil(w * ratio)), Math.max(1, Math.ceil(h * ratio)));
  let cv = create(); const ctx = cv.getContext('2d');
  const setup = (c) => { c.scale(ratio, ratio); c.translate(margin, margin); };
  setup(ctx);
  const box = { x: 0, y: 0, w: l.w, h: l.h };
  if (l.type === 'text' && l.box) drawText(ctx, l, 'box');
  if (l.stroke?.width > 0 && l.stroke.fill && (l.stroke.fill.alpha ?? 1) > 0 && l.type !== 'image') {
    const sc = create(), s = sc.getContext('2d'); setup(s);
    s.lineWidth = l.stroke.width * (l.stroke.align === 'center' || ['line', 'arrow'].includes(l.shape) ? 1 : 2);
    s.lineJoin = l.stroke.join; s.lineCap = l.stroke.dash === 'dotted' ? 'round' : 'butt';
    s.setLineDash(l.stroke.dash === 'dotted' ? [0, l.stroke.width * 2] : l.stroke.dash === 'dashed' ? [l.stroke.width * 3, l.stroke.width * 2] : []);
    s.strokeStyle = '#000000';
    const trace = (stroke) => {
      if (l.type === 'text') { if (stroke) drawText(s, l, 'stroke'); else drawText(s, { ...l, box: null }, 'silhouette'); }
      else { traceShape(s, l); if (stroke) s.stroke(); else s.fill(); }
    };
    trace(true);
    if (l.stroke.align !== 'center' && !['line', 'arrow'].includes(l.shape)) {
      s.globalCompositeOperation = l.stroke.align === 'inside' ? 'destination-in' : 'destination-out'; s.setLineDash([]); trace(false);
    }
    s.globalCompositeOperation = 'source-in';
    paintFill(s, l.stroke.fill, box, () => s.fillRect(-margin, -margin, w, h));
    ctx.drawImage(sc, -margin, -margin, w, h);
  }
  drawContent(ctx, l.type === 'text' && l.box ? { ...l, box: null } : l, image, ratio);
  cv = applyMasks(cv,l,image,cutout,ratio,margin,w,h,create);
  if (!(l.shadows || []).length) return { canvas: cv, margin, w, h };
  const result = create(), r = result.getContext('2d'); setup(r);
  for (const shadow of l.shadows) {
    if (!shadow.alpha) continue;
    let mask;
    if (shadow.spread>0) {
      const alpha=readAlpha(cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data);
      mask=alphaCanvas(makeCanvas,cv.width,cv.height,dilateAlpha(alpha,cv.width,cv.height,shadow.spread*ratio),shadow.color);
    } else {
      mask=create();const m=mask.getContext('2d');m.drawImage(cv,0,0);m.globalCompositeOperation='source-in';m.fillStyle=shadow.color;m.fillRect(0,0,mask.width,mask.height);
    }
    // Canvas filters use backing pixels, independent of the current transform.
    r.save(); r.globalAlpha = shadow.alpha; r.filter = shadow.blur ? `blur(${shadow.blur * ratio}px)` : 'none';
    r.drawImage(mask, -margin + shadow.x, -margin + shadow.y, w, h); r.restore();
  }
  r.drawImage(cv, -margin, -margin, w, h);
  return { canvas: result, margin, w, h };
}
export function drawDesign(ctx, design, getImage, { scale = 1, transparent = false, hideLayers = null, createCanvas = typeof OffscreenCanvas !== 'undefined' ? canvasFactory : null, cacheLayers = true, fontAvailable = null } = {}) {
  const parent = ctx.getTransform?.(), ratio = Math.max(0.02, scale * (parent ? Math.hypot(parent.a, parent.b) : 1));
  ctx.save(); ctx.scale(scale, scale); ctx.beginPath(); ctx.rect(0, 0, design.width, design.height); ctx.clip();
  if (!transparent) paintFill(ctx, design.background, { x: 0, y: 0, w: design.width, h: design.height });
  const renderLayers = [];
  for (const group of designClipGroups(design.layers)) {
    if (!group.base || group.base.hidden || hideLayers?.has(group.base.id)) continue;
    if (!group.clipped.length || !createCanvas) { renderLayers.push(group.base); continue; }
    const k=Math.min(ratio,8192/design.width,8192/design.height,Math.sqrt(16_777_216/(design.width*design.height)));
    const canvas=createCanvas(Math.max(1,Math.ceil(design.width*k)),Math.max(1,Math.ceil(design.height*k)));
    const layers=[{...group.base,clip:false,opacity:1,blend:'source-over'},...group.clipped.map(l=>({...l,clip:false,blend:'source-atop'}))];
    drawDesign(canvas.getContext('2d'),{...design,background:null,layers},getImage,{scale:k,transparent:true,hideLayers,createCanvas,cacheLayers:false,fontAvailable});
    renderLayers.push({id:`clip:${group.base.id}`,type:'image',x:0,y:0,w:design.width,h:design.height,rotation:0,opacity:group.base.opacity,blend:group.base.blend,crop:{x:0,y:0,w:1,h:1},fit:'stretch',adjust:{},shadows:[],_clipCanvas:canvas});
  }
  for (const original of renderLayers) {
    if (original.hidden || hideLayers?.has(original.id)) continue;
    const missing = original.type === 'text' && fontAvailable && !fontAvailable(original.font);
    const l = missing ? { ...original, font: 'sans' } : original, image = l.type === 'image' ? l._clipCanvas || getImage(l) : null;
    const cutout=l.type==='image'&&l.cutout?.enabled?getImage({asset:l.cutout.asset}):null, useCache=cacheLayers&&!l._clipCanvas;
    ctx.save(); ctx.translate(l.x + l.w / 2, l.y + l.h / 2); ctx.rotate(l.rotation * Math.PI / 180);
    ctx.scale(l.flipX ? -1 : 1, l.flipY ? -1 : 1); ctx.translate(-l.w / 2, -l.h / 2);
    ctx.globalAlpha *= l.opacity; ctx.globalCompositeOperation = l.blend;
    if (createCanvas) {
      let sizes = useCache && layerCache.get(original);
      if (useCache && !sizes) { sizes = new Map(); layerCache.set(original, sizes); }
      const key = `${ratio}:${Boolean(missing)}`;
      let entry = sizes && sizes.get(key);
      if (!entry || entry.image !== image || entry.cutout !== cutout || entry.cutoutRevision !== (cutout?._designRevision || 0)) {
        if (entry) { cachedPixels -= entry.canvas.width * entry.canvas.height; cache.delete(entry); sizes.delete(key); }
        entry = { ...bitmap(l, image, cutout, ratio, createCanvas), image, cutout, cutoutRevision: cutout?._designRevision || 0, sizes, key };
        if (useCache) {
          sizes.set(key, entry); cache.set(entry, entry); cachedPixels += entry.canvas.width * entry.canvas.height;
          while (cache.size > 1 && (cachedPixels > 33_554_432 || cache.size > 1200)) {
            const old = cache.keys().next().value;
            cachedPixels -= old.canvas.width * old.canvas.height; cache.delete(old); old.sizes.delete(old.key);
          }
        }
      } else { cache.delete(entry); cache.set(entry, entry); }
      ctx.drawImage(entry.canvas, -entry.margin, -entry.margin, entry.w, entry.h);
    } else drawContent(ctx, l, image);
    ctx.restore();
  }
  ctx.restore();
}
