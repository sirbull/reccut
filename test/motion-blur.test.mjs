import test from 'node:test';
import assert from 'node:assert/strict';
import { motionFramePlan, motionSceneCut, needsNaturalMotion } from '../src/shared/motionBlur.js';
import { makeVideoEffect, effectParams, BROWSER_VIDEO_EFFECTS } from '../src/shared/videoEffects.js';
import { makeClip, vfxProp } from '../src/shared/model.js';
import { effectWarning } from '../src/shared/effectSupport.js';
import { TemporalFrames } from '../src/shared/temporalFrames.js';
import { visibilityMaskClip } from '../src/shared/effectMasks.js';

test('motion effects appear in the browser and respect supported source types',()=>{
  for(const type of ['motionBlur','naturalMotionBlur'])assert.ok(BROWSER_VIDEO_EFFECTS.some(e=>e.type===type));
  assert.equal(effectWarning(makeClip('adjustment'),'motionBlur'),null);
  assert.match(effectWarning(makeClip('adjustment'),'naturalMotionBlur'),/source clip/);
  assert.match(effectWarning(makeClip('image'),'naturalMotionBlur'),/neighbouring video/);
  const a=makeVideoEffect('naturalMotionBlur'),b=makeVideoEffect('naturalMotionBlur');
  a.p.amount=0.8;assert.equal(b.p.amount,0.5);
  assert.equal(b.p.rollingShutter,false);
  assert.equal(effectParams({type:'naturalMotionBlur',p:{amount:.5}}).rollingShutter,false);
  a.p.rollingShutter=true;
  assert.equal(effectParams(JSON.parse(JSON.stringify(a))).rollingShutter,true);
});
test('natural decoding is skipped for zero, disabled and other recording targets, including keyframes',()=>{
  const e=makeVideoEffect('naturalMotionBlur'),c=makeClip('video',{dur:4,props:{vfx:[e]}});
  assert.ok(needsNaturalMotion(c));e.p.amount=0;assert.equal(needsNaturalMotion(c),false);
  c.kf={[vfxProp(e.id,'amount')]:[[0,0],[2,1]]};assert.ok(needsNaturalMotion(c,'main',1));
  e.on=false;assert.equal(needsNaturalMotion(c,'main',1),false);e.on=true;e.target='camera';
  assert.equal(needsNaturalMotion(c,'screen',1),false);
});
test('temporal window follows source trim, offsets, reverse and timeline speed',()=>{
  const c=makeClip('video',{start:3,in:2,dur:4,speed:1});
  const st={fps:30,offset:0.1,duration:10};
  let p=motionFramePlan(c,st,3,30);assert.ok(Math.abs(p.times[0]-1.9)<1e-6);assert.equal(p.times[1],p.times[0]);
  p=motionFramePlan(c,st,4,30);assert.ok(Math.abs(p.exposure-1/30)<1e-6);assert.ok(p.times[0]<p.times[1]&&p.times[2]>p.times[1]);
  c.speed=2;p=motionFramePlan(c,st,4,30);assert.ok(Math.abs(p.exposure-2/30)<1e-6);assert.ok(p.times[1]-p.times[0]>=p.exposure-1e-6);
  assert.equal(p.direction,1);
  c.reverse=true;p=motionFramePlan(c,st,4,30);assert.ok(p.times[0]<p.times[1]);assert.equal(p.direction,-1);
  c.speed=0;p=motionFramePlan(c,st,4,30);assert.equal(p.exposure,0);
});
test('hard cuts are rejected; a translated image histogram is retained',()=>{
  const a=new Uint8ClampedArray(400).fill(255),b=new Uint8ClampedArray(400);for(let i=3;i<400;i+=4)b[i]=255;
  assert.ok(motionSceneCut(a,b));assert.equal(motionSceneCut(a,a),false);
  const c=new Uint8ClampedArray([...a.subarray(0,200),...b.subarray(0,200)]),d=new Uint8ClampedArray([...b.subarray(0,200),...a.subarray(0,200)]);
  assert.equal(motionSceneCut(c,d),false);
});
test('effect masks never change clip visibility, and legacy masks retain their meaning',()=>{
  const c={props:{masks:[{id:'clip'},{id:'effect',effect:'blur'}]}};
  assert.deepEqual(visibilityMaskClip(c).props.masks,[{id:'clip'}]);assert.equal(c.props.masks.length,2);
  const legacy={props:{masks:[{id:'a'}]}};assert.equal(visibilityMaskClip(legacy),legacy);
});
test('temporal cache owns source frames, reuses overlapping windows and stays bounded',async()=>{
  let reads=0;const c=new TemporalFrames(async t=>({time:t,duration:1/30,img:{},w:10,h:10,read:++reads}));
  const a=await c.get({times:[0,1/30,2/30],exposure:1/30});
  const b=await c.get({times:[1/30,2/30,3/30],exposure:1/30});
  assert.equal(reads,4);assert.equal(a.current,b.previous);
  for(let i=4;i<20;i++)await c.get({times:[i/30,(i+1)/30,(i+2)/30],exposure:1/30});
  assert.ok(c.cache.length<=6);c.close();assert.equal(c.cache.length,0);
});
