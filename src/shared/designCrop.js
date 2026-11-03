import { fitBox, layerPoint } from './design.js';
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const CROP_RATIOS = [{ value: 'free', label: 'Free' }, { value: 'design', label: 'Design' }, { value: '1', label: '1:1' }, { value: String(16/9), label: '16:9' }, { value: String(9/16), label: '9:16' }, { value: '0.8', label: '4:5' }];
export function cropSourceGeometry(layer, sw, sh) {
  const c = layer.crop, b = fitBox(sw*c.w, sh*c.h, layer.w, layer.h, layer.fit);
  const full = { x: b.x-c.x*b.w/c.w, y: b.y-c.y*b.h/c.h, w: b.w/c.w, h: b.h/c.h };
  const visible = { x: Math.max(0,b.x), y: Math.max(0,b.y), w: Math.min(layer.w,b.x+b.w)-Math.max(0,b.x), h: Math.min(layer.h,b.y+b.h)-Math.max(0,b.y) };
  return { full, crop: { x: (visible.x-full.x)/full.w, y: (visible.y-full.y)/full.h, w: visible.w/full.w, h: visible.h/full.h } };
}
export function cropViewport(full, crop) { return { x: full.x + crop.x*full.w, y: full.y + crop.y*full.h, w: crop.w*full.w, h: crop.h*full.h }; }
export function moveCropImage(full, crop, dx, dy) {
  const x = clamp(crop.x-dx/full.w,0,1-crop.w), y = clamp(crop.y-dy/full.h,0,1-crop.h);
  return { crop: { ...crop,x,y }, full: { ...full,x:full.x+(crop.x-x)*full.w,y:full.y+(crop.y-y)*full.h } };
}
export function resizeCrop(full, crop, handle, dx, dy, ratio = null) {
  const hx = handle.includes('w')?-1:handle.includes('e')?1:0, hy=handle.includes('n')?-1:handle.includes('s')?1:0;
  const anchorX = crop.x+(hx<0?crop.w:0), anchorY = crop.y+(hy<0?crop.h:0);
  let w=clamp(crop.w+hx*dx/full.w,1/full.w, hx<0?anchorX:1-anchorX), h=clamp(crop.h+hy*dy/full.h,1/full.h,hy<0?anchorY:1-anchorY);
  if (ratio) {
    const fractionalRatio=ratio*full.h/full.w;
    if (!hy || (hx && Math.abs(w/crop.w-1)>=Math.abs(h/crop.h-1))) h=w/fractionalRatio;
    else w=h*fractionalRatio;
    const limit=Math.min(1,(hx<0?anchorX:1-anchorX)/w,(hy<0?anchorY:1-anchorY)/h);
    w*=limit;h*=limit;
  }
  return { x:clamp(hx<0?anchorX-w:crop.x,0,1-w), y:clamp(hy<0?anchorY-h:crop.y,0,1-h), w,h };
}
export function presetCrop(full, crop, ratio) {
  if (!ratio) return crop;
  let w=crop.w,h=crop.h;const r=ratio*full.h/full.w;
  if(w/h>r)w=h*r;else h=w/r;
  return {x:crop.x+(crop.w-w)/2,y:crop.y+(crop.h-h)/2,w,h};
}
export function applyCropGeometry(layer, full, crop) {
  const b=cropViewport(full,crop), center=layerPoint(layer,b.x+b.w/2,b.y+b.h/2);
  // Move the rotated layer's center to the viewport's center without changing
  // the source's visual scale. Flips are already represented in the local view.
  const flipCenter=layerPoint(layer,layer.flipX?layer.w-b.x-b.w/2:b.x+b.w/2,layer.flipY?layer.h-b.y-b.h/2:b.y+b.h/2);
  return { ...layer, crop, x:(layer.flipX||layer.flipY?flipCenter:center).x-b.w/2, y:(layer.flipX||layer.flipY?flipCenter:center).y-b.h/2, w:b.w,h:b.h,fit:'stretch' };
}
