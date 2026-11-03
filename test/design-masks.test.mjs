import test from 'node:test';
import assert from 'node:assert/strict';
import { dilateAlpha, erodeAlpha, layerToSourcePoint, sourceToLayerPoint, designClipGroups, alphaPixels } from '../src/shared/designMasks.js';
import { newLayer, normalizeDesignMask, cameraFrameProject } from '../src/shared/design.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function reference(a,w,h,r,max){return Uint8Array.from(a,(_,i)=>{const values=[];for(let y=Math.floor(i/w)-r;y<=Math.floor(i/w)+r;y++)for(let x=i%w-r;x<=i%w+r;x++)values.push(x<0||y<0||x>=w||y>=h?0:a[y*w+x]);return max?Math.max(...values):Math.min(...values)})}
test('alpha morphology matches a reference for borders, soft edges, narrow images and large radii',()=>{
  for(const [w,h]of[[1,1],[1,8],[8,1],[3,5],[12,10]])for(const r of[0,1,3,10]){
    const a=Uint8Array.from({length:w*h},(_,i)=>(i*71+19)%256),copy=a.slice();
    assert.deepEqual(dilateAlpha(a,w,h,r),reference(a,w,h,r,true));assert.deepEqual(erodeAlpha(a,w,h,r),reference(a,w,h,r,false));assert.deepEqual(a,copy);
  }
  assert.throws(()=>dilateAlpha(new Uint8Array(2),3,3,1),/dimensions/);
});
test('brush coordinates invert rotation, flips, source crop and every fit mode',()=>{
  for(const fit of['contain','cover','stretch'])for(const rotation of[0,30,90,-135])for(const flipX of[false,true])for(const flipY of[false,true]){
    const l=newLayer('image',{x:120,y:90,w:500,h:200,rotation,flipX,flipY,fit,crop:{x:0.2,y:0.1,w:0.6,h:0.8}});
    for(const point of[{x:400,y:350},{x:250,y:200}]){const world=sourceToLayerPoint(l,point,1000,700),source=layerToSourcePoint(l,world,1000,700);near(source.x,point.x);near(source.y,point.y);}
  }
  const l=newLayer('image',{w:200,h:100,fit:'contain'});assert.equal(layerToSourcePoint(l,{x:0,y:50},100,100).inside,false);
});
test('clip groups preserve hidden bases and orphan clips cannot reveal themselves',()=>{
  const layers=[{id:'orphan',clip:true},{id:'base',hidden:true},{id:'a',clip:true},{id:'b',clip:true},{id:'next'},{id:'c',clip:true}];
  assert.deepEqual(designClipGroups(layers).map(g=>({base:g.base?.id,clips:g.clipped.map(l=>l.id)})),[{base:undefined,clips:['orphan']},{base:'base',clips:['a','b']},{base:'next',clips:['c']}]);
});
test('mask normalization bounds points and numeric effects, with safe malformed input',()=>{
  assert.equal(normalizeDesignMask(null),null);assert.equal(normalizeDesignMask({shape:'bad'}),null);
  const m=normalizeDesignMask({shape:'polygon',points:[[NaN,1],[-2,3],[1,0],[0,0]],feather:1000});assert.deepEqual(m.points,[[0,1],[1,0],[0,0]]);assert.equal(m.feather,100);
  const l=newLayer('image',{cutout:{asset:'a',shift:-99,feather:999},outline:{width:999,color:'bad'}});assert.equal(l.cutout.shift,-20);assert.equal(l.cutout.feather,50);assert.equal(l.outline.width,500);
  assert.deepEqual(Array.from(alphaPixels(new Uint8Array([0,128]),'#804020')),[128,64,32,0,128,64,32,128]);
});

 test('camera frame snapshots use the full native camera independently of screen or timeline',()=>{
 const camera={hasVideo:true,width:1080,height:1920,path:'/camera.mp4'},media={id:'m',streams:{screen:{hasVideo:true,path:'/screen.mp4'},camera}},clip={id:'c',type:'recording',mediaId:'m',start:2,dur:5,lane:1,props:{showCamera:false,showKeys:true}},p={width:1920,height:1080,media:{m:media},clips:{c:clip},primary:['c'],duration:7};
 const before=JSON.stringify(p),snapshot=cameraFrameProject(p,3);assert.equal(snapshot.width,1080);assert.equal(snapshot.height,1920);assert.deepEqual(Object.keys(snapshot.media.m.streams),['camera']);assert.equal(snapshot.clips.c.recordingPart,'camera');assert.equal(snapshot.clips.c.props.showKeys,false);assert.equal(snapshot.clips.c.props.showCamera,true);assert.equal(JSON.stringify(p),before);assert.equal(cameraFrameProject(p,7),null);assert.equal(cameraFrameProject({...p,clips:{c:{...clip,enabled:false}}},3),null);assert.equal(cameraFrameProject({...p,clips:{c:{...clip,recordingPart:'screen'}}},3),null);
 const huge=cameraFrameProject({...p,media:{m:{...media,streams:{camera:{...camera,width:16000,height:8000}}}}},3);assert.equal(huge.width,8192);assert.equal(huge.height,4096);
 });
