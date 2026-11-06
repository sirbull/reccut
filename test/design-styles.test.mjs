import test from 'node:test';
import assert from 'node:assert/strict';
import { newLayer, normalizeLayer, normalizeFill, normalizeStroke, normalizeShadow, designShapePoints, effectMargin, visualBounds, SHADOW_PRESETS } from '../src/shared/design.js';
import { paintFill, imageFilter, drawDesign, clearDesignRenderCache, designRenderCacheStats } from '../src/shared/designRender.js';

test('shape geometry survives save and load with bounded points and corner radius', () => {
  for (let sides = 3; sides <= 12; sides++) {
    const l = normalizeLayer(newLayer('shape', { shape: 'polygon', sides }));
    const points = designShapePoints(l); assert.equal(points.length, sides);
    assert.ok(points.flat().every((n) => n >= 0 && n <= 1));
  }
  for (let n = 3; n <= 24; n++) {
    const l = newLayer('shape', { shape: 'star', points: n, inner: 0.2 });
    assert.equal(designShapePoints(l).length, n * 2); assert.ok(designShapePoints(l).flat().every((n) => n >= 0 && n <= 1));
  }
  assert.equal(newLayer('shape', { w: 100, h: 20, radius: 500 }).radius, 10);
  for (const shape of ['line','arrow']) { const l = newLayer('shape', { shape }); assert.equal(l.fill, null); assert.ok(l.stroke.width > 0); assert.ok(designShapePoints(l).flat().every((n) => n >= 0 && n <= 1)); }
});
test('visual bounds include centered/outside contours, shadow offsets, and text padding', () => {
  const base = newLayer('shape', { x: 100, y: 100, w: 100, h: 100 });
  for (const [align, margin] of [['inside',0],['center',6],['outside',12]]) {
    const l = { ...base, stroke: normalizeStroke({ width: 12, align }) };
    assert.equal(effectMargin(l), margin); assert.deepEqual(visualBounds(l), { x: 100-margin, y: 100-margin, w: 100+margin*2, h: 100+margin*2 });
  }
  const l = newLayer('text', { box: { padding: 8 }, stroke: { width: 12 }, shadows: [{ blur: 20, x: -50, y: 10, spread: 4 }] });
  assert.equal(effectMargin(l), 114);
  assert.equal(effectMargin(newLayer('image', { shadows: [{ blur: 0, x: 0, y: 0, spread: 500 }] })), 500);
});
test('style normalization rejects nonfinite values and preserves legal extreme settings', () => {
  const l = newLayer('shape', { stroke: { width: 9999 }, shadows: [{ blur: Infinity, x: NaN, alpha: -1 }, { blur: 500, spread: 500 }] });
  assert.equal(l.stroke.width, 500); assert.equal(l.shadows[0].blur, 16); assert.equal(l.shadows[0].x, 8); assert.equal(l.shadows[0].alpha, 0); assert.equal(l.shadows[1].blur, 500);
  assert.equal(normalizeFill({ type: 'gradient', gradient: { stops: [{ color: '#000000', position: 0 }] } }).gradient.stops.length, 1);
  assert.equal(normalizeShadow(SHADOW_PRESETS['Outer Glow']).x, 0);
});
test('gradient coordinates and alpha are local to the layer box', () => {
  const calls=[], stack=[];
  const ctx={globalAlpha:0.5,save(){stack.push(this.globalAlpha)},restore(){this.globalAlpha=stack.pop()},createLinearGradient(...p){calls.push(p);return{addColorStop(){}}},fillRect(){calls.push(this.globalAlpha)}};
  paintFill(ctx, {type:'gradient',alpha:0.4,gradient:{start:{x:0,y:0.5},end:{x:1,y:0.5}}}, {x:10,y:20,w:200,h:100});
  assert.deepEqual(calls, [[10,70,210,70],0.2]); assert.equal(ctx.globalAlpha,0.5);
});
test('image adjustments use neutral multipliers and independent filter components', () => {
  assert.equal(imageFilter({ brightness: -0.3, contrast: 0.4, saturation: -1, hue: 40, blur: 10, grayscale: 1 }), 'brightness(0.7) contrast(1.4) saturate(0) hue-rotate(40deg) blur(10px) grayscale(1)');
});
function canvases() {
  const all=[];
  const createCanvas=(width,height)=>{
    const calls=[],stack=[];
    const ctx = new Proxy({ globalAlpha:1, globalCompositeOperation:'source-over', filter:'none', save(){stack.push({globalAlpha:this.globalAlpha,globalCompositeOperation:this.globalCompositeOperation,filter:this.filter})},restore(){Object.assign(this,stack.pop())},drawImage(image,...args){calls.push({image,args,alpha:this.globalAlpha,blend:this.globalCompositeOperation,filter:this.filter})},fillRect(){calls.push({color:this.fillStyle,blend:this.globalCompositeOperation})},measureText(t){return {width:t.length*10}} }, {get(target,key){return key in target?target[key]:()=>{}}});
    const canvas={width,height,getContext:()=>ctx,calls};all.push(canvas);return canvas;
  };
  return {all,createCanvas};
}
test('layer bitmaps cache unchanged identities and invalidate changed content or images', () => {
  clearDesignRenderCache(); const {all,createCanvas}=canvases(), main=createCanvas(400,400);
  const a=newLayer('shape',{w:50,h:50}),b=newLayer('shape',{w:50,h:50}); const d={width:400,height:400,background:null,layers:[a,b]};
  drawDesign(main.getContext(),d,()=>null,{createCanvas}); const count=all.length;
  drawDesign(main.getContext(),d,()=>null,{createCanvas}); assert.equal(all.length,count);
  drawDesign(main.getContext(),{...d,layers:[a,{...b,x:20}]},()=>null,{createCanvas}); assert.equal(all.length,count+1);
  assert.ok(designRenderCacheStats().pixels < 33554432);
});
test('shadows composite in list order below content and keep filter/opacity isolated', () => {
  clearDesignRenderCache(); const {all,createCanvas}=canvases(), main=createCanvas(400,400);
  const l=newLayer('shape',{w:20,h:20,shadows:[{color:'#ff0000',blur:0,x:10,y:0,alpha:0.2},{color:'#0000ff',blur:5,x:-10,y:0,alpha:0.8}]});
  drawDesign(main.getContext(),{width:400,height:400,background:null,layers:[l]},()=>null,{createCanvas});
  const output=all.find((c)=>c.calls.filter((d)=>d.image).length===3);
  assert.ok(output); assert.deepEqual(output.calls.filter((d)=>d.image).map((d)=>d.alpha),[0.2,0.8,1]);
  assert.equal(main.getContext().filter,'none'); assert.equal(main.getContext().globalAlpha,1);
});

test('thumbnail rendering cannot evict every main-canvas bitmap by changing the scale',()=>{
  clearDesignRenderCache();const {all,createCanvas}=canvases(),main=createCanvas(400,400),d={width:400,height:400,background:null,layers:[newLayer('shape',{w:50,h:50}),newLayer('text',{w:100,h:30,text:'Cache',size:20})]};
  drawDesign(main.getContext(),d,()=>null,{createCanvas});drawDesign(main.getContext(),d,()=>null,{createCanvas,scale:0.1});const count=all.length;
  drawDesign(main.getContext(),d,()=>null,{createCanvas});drawDesign(main.getContext(),d,()=>null,{createCanvas,scale:0.1});assert.equal(all.length,count);
});
test('disabled highlights and line box fills survive normalization',()=>{
  const l=newLayer('text',{highlight:null,box:{fill:null,padding:8}});assert.equal(normalizeLayer(l).highlight,null);assert.equal(normalizeLayer(l).box.fill,null);
});
