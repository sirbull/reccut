import { rotatePoint, fitBox } from './design.js';

// A separable sliding window keeps large masks linear in pixel count, even with
// a wide radius. Pixels outside the image are transparent for both operations.
function morphAlpha(alpha, width, height, radius, maximum) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || alpha.length !== width * height) throw new Error('Invalid alpha dimensions.');
  const r = Math.min(Math.max(width, height), Math.max(0, Math.ceil(Number(radius) || 0)));
  if (!r) return Uint8Array.from(alpha);
  const temp = new Uint8Array(alpha.length), out = new Uint8Array(alpha.length);
  const pass = (src, dest, length, lines, stride, lineStride) => {
    const positions = new Int32Array(length + r * 2), values = new Uint8Array(length + r * 2);
    for (let line = 0; line < lines; line++) {
      let head = 0, tail = 0;
      for (let i = -r; i < length + r; i++) {
        const value = i < 0 || i >= length ? 0 : src[line * lineStride + i * stride];
        while (tail > head && (maximum ? values[tail - 1] <= value : values[tail - 1] >= value)) tail--;
        positions[tail] = i; values[tail++] = value;
        while (head < tail && positions[head] < i - r * 2) head++;
        const x = i - r;
        if (x >= 0 && x < length) dest[line * lineStride + x * stride] = values[head];
      }
    }
  };
  pass(alpha, temp, width, height, 1, width);
  pass(temp, out, height, width, width, 1);
  return out;
}
export const dilateAlpha = (alpha, width, height, radius) => morphAlpha(alpha, width, height, radius, true);
export const erodeAlpha = (alpha, width, height, radius) => morphAlpha(alpha, width, height, radius, false);
export function alphaPixels(alpha, color = '#ffffff') {
  const rgb = [1,3,5].map((i) => parseInt(color.slice(i,i+2),16)), pixels = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) { pixels[i*4] = rgb[0]; pixels[i*4+1] = rgb[1]; pixels[i*4+2] = rgb[2]; pixels[i*4+3] = alpha[i]; }
  return pixels;
}
export function readAlpha(pixels) {
  const alpha = new Uint8Array(pixels.length / 4);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i*4+3];
  return alpha;
}
export function layerToSourcePoint(layer, point, sourceWidth, sourceHeight) {
  const p = rotatePoint(point.x-layer.x-layer.w/2,point.y-layer.y-layer.h/2,-layer.rotation);
  const x = layer.w/2+p.x*(layer.flipX?-1:1), y = layer.h/2+p.y*(layer.flipY?-1:1);
  const c = layer.crop || {x:0,y:0,w:1,h:1}, b = fitBox(sourceWidth*c.w,sourceHeight*c.h,layer.w,layer.h,layer.fit);
  return { x: (c.x+(x-b.x)/b.w*c.w)*sourceWidth, y: (c.y+(y-b.y)/b.h*c.h)*sourceHeight,
    inside: x>=Math.max(0,b.x)&&y>=Math.max(0,b.y)&&x<=Math.min(layer.w,b.x+b.w)&&y<=Math.min(layer.h,b.y+b.h) };
}
export function sourceToLayerPoint(layer, point, sourceWidth, sourceHeight) {
  const c = layer.crop || {x:0,y:0,w:1,h:1}, b = fitBox(sourceWidth*c.w,sourceHeight*c.h,layer.w,layer.h,layer.fit);
  const x = b.x+(point.x/sourceWidth-c.x)/c.w*b.w, y = b.y+(point.y/sourceHeight-c.y)/c.h*b.h;
  const p = rotatePoint((x-layer.w/2)*(layer.flipX?-1:1),(y-layer.h/2)*(layer.flipY?-1:1),layer.rotation);
  return {x:layer.x+layer.w/2+p.x,y:layer.y+layer.h/2+p.y};
}
export function designClipGroups(layers) {
  const groups = [];
  for (const layer of layers) {
    if (!layer.clip) groups.push({base:layer,clipped:[]});
    else { if (!groups.length) groups.push({base:null,clipped:[]}); groups.at(-1).clipped.push(layer); }
  }
  return groups;
}
export function defaultDesignMask(shape = 'rect') {
  return {shape,points:shape==='polygon'?[[0.5,0.05],[0.95,0.95],[0.05,0.95]]:[[0.05,0.05],[0.95,0.05],[0.95,0.95],[0.05,0.95]],smooth:false,feather:0,invert:false};
}
