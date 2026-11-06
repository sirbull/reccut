import test from 'node:test';
import assert from 'node:assert/strict';
import { newLayer, layerBounds, layerPoint, selectionBounds, groupDesignLayers, ungroupDesignLayers, groupSelectionIds, rotateDesignLayers, scaleDesignLayers, alignDesignLayers, distributeDesignLayers } from '../src/shared/design.js';
import { cropSourceGeometry, cropViewport, moveCropImage, resizeCrop, presetCrop, applyCropGeometry, resetImageCrop, fitImageToCanvas } from '../src/shared/designCrop.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('groups become contiguous at the topmost selected position and keep relative z-order',()=>{
  const layers=['a','b','c','d','e'].map(id=>newLayer('shape',{id}));
  const grouped=groupDesignLayers(layers,['a','c'],'g','Badge');
  assert.deepEqual(grouped.map(l=>l.id),['b','a','c','d','e']);
  assert.deepEqual(groupSelectionIds(grouped,['c']),['a','c']);
  assert.equal(grouped[1].groupName,'Badge');
  assert.throws(()=>groupDesignLayers([{...layers[0],locked:true},layers[1]],['a','b']),/Unlock/);
});
test('group rotation and nonuniform scaling preserve rotation and ungrouping preserves every visual corner',()=>{
  const layers=[newLayer('shape',{id:'a',x:20,y:30,w:80,h:40,rotation:30}),newLayer('text',{id:'b',x:200,y:90,w:100,h:60,rotation:-15})];
  const grouped=groupDesignLayers(layers,['a','b'],'g');
  const rotated=rotateDesignLayers(grouped,selectionBounds(grouped),90), box=selectionBounds(rotated);
  const scaled=scaleDesignLayers(rotated,box,{...box,w:box.w*2,h:box.h*0.7});
  assert.deepEqual(scaled.map(l=>l.rotation),[120,75]);
  const ungrouped=ungroupDesignLayers(scaled,['b']);
  for(let i=0;i<scaled.length;i++){assert.equal(ungrouped[i].group,null);for(const [x,y] of [[0,0],[scaled[i].w,scaled[i].h]])assert.deepEqual(layerPoint(scaled[i],x,y),layerPoint(ungrouped[i],x,y));}
});
test('alignment uses rotated axis aligned bounds and one selected layer uses the design',()=>{
  const layers=[newLayer('shape',{x:20,y:40,w:100,h:30,rotation:45}),newLayer('shape',{x:280,y:140,w:30,h:100,rotation:-20})];
  for(const mode of ['left','center','right','top','middle','bottom']){
    const result=alignDesignLayers(layers,{width:800,height:600},mode).map(layerBounds);
    const axis=['left','center','right'].includes(mode)?'x':'y',size=axis==='x'?'w':'h',f=['left','top'].includes(mode)?0:['right','bottom'].includes(mode)?1:0.5;
    near(result[0][axis]+result[0][size]*f,result[1][axis]+result[1][size]*f);
  }
  const result=alignDesignLayers([layers[0]],{width:800,height:600},'right');near(layerBounds(result[0]).x+layerBounds(result[0]).w,800);
});
test('distribution makes equal gaps, including rotated bounds, without changing z-order',()=>{
  const layers=[newLayer('shape',{id:'a',x:250,y:50,w:40,h:30}),newLayer('shape',{id:'b',x:20,y:10,w:50,h:30,rotation:25}),newLayer('shape',{id:'c',x:100,y:130,w:70,h:60})];
  for(const axis of ['x','y']){
    const result=distributeDesignLayers(layers,axis);assert.deepEqual(result.map(l=>l.id),['a','b','c']);
    const boxes=result.map(layerBounds).sort((a,b)=>a[axis]-b[axis]),size=axis==='x'?'w':'h';
    near(boxes[1][axis]-boxes[0][axis]-boxes[0][size],boxes[2][axis]-boxes[1][axis]-boxes[1][size]);
  }
});
test('crop starts from the actual visible source for contain and cover, without discarding native pixels',()=>{
  const l=newLayer('image',{w:200,h:100,fit:'contain'}), a=cropSourceGeometry(l,100,100);
  assert.deepEqual(a.full,{x:50,y:0,w:100,h:100});assert.deepEqual(a.crop,{x:0,y:0,w:1,h:1});
  const b=cropSourceGeometry({...l,fit:'cover'},100,100);assert.deepEqual(b.crop,{x:0,y:0.25,w:1,h:0.5});
  const next=applyCropGeometry(l,a.full,a.crop);assert.equal(next.w,100);assert.equal(next.h,100);near(next.x,l.x+50);
});
test('moving image in crop keeps the viewport fixed and clamps to the source',()=>{
  const full={x:-50,y:-50,w:200,h:200},crop={x:0.25,y:0.25,w:0.5,h:0.5};
  const next=moveCropImage(full,crop,500,-500);
  assert.deepEqual(cropViewport(next.full,next.crop),cropViewport(full,crop));
  assert.equal(next.crop.x,0);assert.equal(next.crop.y,0.5);
});
test('crop handles and aspect presets stay within source bounds and preserve the opposite anchor',()=>{
  const full={x:0,y:0,w:400,h:300},crop={x:0.1,y:0.1,w:0.7,h:0.7};
  for(const handle of ['nw','ne','se','sw'])for(const ratio of [null,1,16/9,9/16]){
    const c=resizeCrop(full,crop,handle,45,30,ratio);assert.ok(c.x>=0&&c.y>=0&&c.x+c.w<=1.000001&&c.y+c.h<=1.000001);
    near(c.x+(handle.includes('w')?c.w:0),crop.x+(handle.includes('w')?crop.w:0));
    near(c.y+(handle.includes('n')?c.h:0),crop.y+(handle.includes('n')?crop.h:0));
    if(ratio)near(c.w*full.w/(c.h*full.h),ratio);
  }
  const p=presetCrop(full,crop,1);near(p.w*400/(p.h*300),1);
});
test('canvas crop handles grow past the canvas up to the size limit',()=>{
  const full={x:0,y:0,w:400,h:300},crop={x:0,y:0,w:1,h:1},max={w:2,h:2};
  assert.deepEqual(resizeCrop(full,crop,'e',200,0,null,max),{x:0,y:0,w:1.5,h:1});
  const west=resizeCrop(full,crop,'w',-100,0,null,max);near(west.x,-0.25);near(west.w,1.25);
  assert.equal(resizeCrop(full,crop,'se',9000,9000,null,max).w,2);
  const ratio=resizeCrop(full,crop,'se',9000,9000,1,max);near(ratio.w*400,ratio.h*300);assert.ok(ratio.w<=2&&ratio.h<=2);
});
test('crop handles keep the shape with Shift and scale from the center with Alt, also in free mode',()=>{
  const full={x:0,y:0,w:400,h:300},crop={x:0.2,y:0.2,w:0.6,h:0.4},aspect=c=>c.w*400/(c.h*300),mid=c=>[c.x+c.w/2,c.y+c.h/2];
  const corner=resizeCrop(full,crop,'se',-40,-5,null,null,{keepAspect:true});near(aspect(corner),2);near(corner.x,0.2);near(corner.y,0.2);
  const edge=resizeCrop(full,crop,'e',-40,0,null,null,{keepAspect:true});near(aspect(edge),2);near(edge.x,0.2);near(mid(edge)[1],0.4);
  const center=resizeCrop(full,crop,'e',-40,0,null,null,{fromCenter:true});near(center.w,0.4);near(center.h,0.4);near(mid(center)[0],0.5);
  const both=resizeCrop(full,crop,'nw',40,0,null,null,{keepAspect:true,fromCenter:true});near(aspect(both),2);near(both.w,0.4);near(mid(both)[0],0.5);near(mid(both)[1],0.4);
  const preset=resizeCrop(full,crop,'se',-40,-40,1,null,{fromCenter:true});near(aspect(preset),1);near(mid(preset)[0],0.5);near(mid(preset)[1],0.4);
  // Growing from the center stops at the nearest source edge instead of drifting off center.
  const grow=resizeCrop(full,crop,'e',9000,0,null,null,{fromCenter:true});near(grow.x,0);near(grow.w,1);
  const edgeCrop={x:0,y:0,w:0.5,h:0.5},stuck=resizeCrop(full,edgeCrop,'e',100,0,null,null,{fromCenter:true});near(stuck.x,0);near(stuck.w,0.5);
  // A proportional edge drag on a crop touching the top still grows, pushed back inside the source.
  const top=resizeCrop(full,edgeCrop,'e',100,0,null,null,{keepAspect:true});near(top.y,0);near(aspect(top),4/3);assert.ok(top.w>0.5);
  // Shrinking a wide crop proportionally never collapses a side below one pixel.
  const thin=resizeCrop(full,{x:0,y:0.4,w:1,h:0.01},'e',-9000,0,null,null,{keepAspect:true});assert.ok(thin.h*300>=0.999&&thin.w*400>=0.999);
  const canvas=resizeCrop(full,{x:0,y:0,w:1,h:1},'e',100,0,null,{w:2,h:2},{keepAspect:true,fromCenter:true});near(canvas.w,1.5);near(canvas.h,1.5);near(canvas.x,-0.25);near(canvas.y,-0.25);
});
test('applying a crop on rotated and flipped layers keeps the source at the same world position',()=>{
  for(const rotation of [0,30,90])for(const flipX of [false,true])for(const flipY of [false,true]){
    const l=newLayer('image',{x:100,y:80,w:400,h:300,rotation,flipX,flipY}),full={x:0,y:0,w:400,h:300},crop={x:0.25,y:0.2,w:0.5,h:0.6};
    const n=applyCropGeometry(l,full,crop);
    const sourceCenter=layerPoint(l,flipX?400-(crop.x+crop.w/2)*400:(crop.x+crop.w/2)*400,flipY?300-(crop.y+crop.h/2)*300:(crop.y+crop.h/2)*300);
    near(n.x+n.w/2,sourceCenter.x);near(n.y+n.h/2,sourceCenter.y);assert.equal(n.rotation,rotation);
  }
});

test('group property transforms share a center and preserve member rotation differences', async()=>{
  const {transformDesignLayers}=await import('../src/shared/design.js');
  const layers=[newLayer('shape',{x:20,y:30,w:40,h:20,rotation:20}),newLayer('shape',{x:200,y:120,w:60,h:40,rotation:-10})];
  const moved=transformDesignLayers(layers,'x',100);near(selectionBounds(moved).x,100);near(moved[1].x-moved[0].x,layers[1].x-layers[0].x);
  const rotated=transformDesignLayers(layers,'rotation',110);assert.deepEqual(rotated.map(l=>l.rotation),[110,80]);
  const mirrored=transformDesignLayers(layers,'flipX',true),bounds=selectionBounds(layers),cx=bounds.x+bounds.w/2;
  for(let i=0;i<layers.length;i++){near(mirrored[i].x+mirrored[i].w/2,2*cx-layers[i].x-layers[i].w/2);assert.equal(mirrored[i].rotation,-layers[i].rotation);assert.equal(mirrored[i].flipX,true);}
});

test('reset crop reveals original pixels at the same world position after resizing, rotation and flips',()=>{
  for(const rotation of [0,37,90])for(const flipX of [false,true])for(const flipY of [false,true]) {
    const layer=newLayer('image',{asset:'original',x:100,y:80,w:400,h:300,rotation,flipX,flipY,mask:{shape:'ellipse'},cutout:{asset:'alpha',enabled:true}});
    const cropped=applyCropGeometry(layer,{x:0,y:0,w:400,h:300},{x:.25,y:.2,w:.5,h:.6});
    const resized={...cropped,w:cropped.w*1.4,h:cropped.h*.8};
    const before=cropSourceGeometry(resized,1600,1200).full, reset=resetImageCrop(resized,1600,1200);
    const after=cropSourceGeometry(reset,1600,1200).full;
    for(const [sx,sy]of [[0,0],[.25,.2],[.5,.5],[1,1]]) {
      const position=(l,full)=>{const x=full.x+sx*full.w,y=full.y+sy*full.h;return layerPoint(l,l.flipX?l.w-x:x,l.flipY?l.h-y:y);};
      const a=position(resized,before),b=position(reset,after);near(a.x,b.x);near(a.y,b.y);
    }
    assert.deepEqual(reset.crop,{x:0,y:0,w:1,h:1});assert.equal(reset.asset,'original');assert.equal(reset.mask,resized.mask);assert.equal(reset.cutout,resized.cutout);
  }
});

test('fit and fill use the canvas frame and preserve editable source crop and masks',()=>{
  const layer=newLayer('image',{asset:'original',x:200,y:100,w:200,h:100,rotation:20,crop:{x:.2,y:.1,w:.5,h:.5},mask:{shape:'ellipse'},cutout:{asset:'alpha',enabled:true}});
  const original=JSON.stringify(layer);
  for(const mode of ['contain','cover']) {
    const fitted=fitImageToCanvas(layer,800,600,mode),geometry=cropSourceGeometry(fitted,2000,1000);
    assert.equal(fitted.x,0);assert.equal(fitted.y,0);assert.equal(fitted.w,800);assert.equal(fitted.h,600);assert.equal(fitted.rotation,0);assert.equal(fitted.fit,mode);
    assert.equal(fitted.crop,layer.crop);assert.equal(fitted.mask,layer.mask);assert.equal(fitted.cutout,layer.cutout);assert.equal(fitted.asset,layer.asset);
    if(mode==='contain'){near(geometry.crop.w,layer.crop.w);near(geometry.crop.h,layer.crop.h);}
    else assert.ok(geometry.crop.w<layer.crop.w||geometry.crop.h<layer.crop.h);
  }
  assert.equal(JSON.stringify(layer),original);
});
