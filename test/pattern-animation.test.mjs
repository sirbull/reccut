import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDesignPattern, PATTERN_SHAPES, patternScaleAt, paintPattern, patternClipProps, patternFromClip } from '../src/shared/designPattern.js';
import { expressionValue, EXPRESSION_PRESETS } from '../src/shared/expressions.js';
import { baseValueAt, makeClip, newProject, setKeyframe, valueAt } from '../src/shared/model.js';
import { drawClip } from '../src/shared/render.js';
import { splitClip } from '../src/shared/ops.js';
import { groupsWithContent, pasteAttributes, removeAttributes } from '../src/shared/attributes.js';
import { newLayer, normalizeLayer } from '../src/shared/design.js';

function context() {
  const calls = [];
  const ctx = {globalAlpha:1, save(){},restore(){},beginPath(){},closePath(){},rect(){},clip(){},
    fill(){calls.push(['fill',this.fillStyle]);},fillRect(...v){calls.push(['rect',...v]);},
    arc(...v){calls.push(['arc',...v]);},moveTo(...v){calls.push(['move',...v]);},lineTo(...v){calls.push(['line',...v]);},
    translate(){},rotate(){},scale(){},createPattern(){return 'tile';}};
  return {ctx,calls};
}
test('all pattern forms retain editable metadata through Design save/load',()=>{
  for(const {value:shape} of PATTERN_SHAPES){
    const layer=newLayer('shape',{pattern:{kind:'dots',shape,random:.7,distribution:'center',strength:.4,seed:47,rotation:30}});
    assert.deepEqual(normalizeLayer(JSON.parse(JSON.stringify(layer))).pattern,layer.pattern);
    const {ctx,calls}=context();paintPattern(ctx,layer.pattern,80,80);
    assert.ok(calls.some(c=>c[0]===(shape==='circle'?'arc':'move')));
  }
});
test('distribution supports the center, edges and all four directions with an adjustable strength',()=>{
  const p=normalizeDesignPattern({kind:'dots'}),at=(distribution,x,y,strength=1)=>patternScaleAt({...p,distribution,strength},x,y,100,100);
  assert.ok(at('center',50,50)>at('center',0,50));assert.ok(at('edges',50,50)<at('edges',0,50));
  for(const [direction,a,b] of [['left',[0,50],[100,50]],['right',[100,50],[0,50]],['top',[50,0],[50,100]],['bottom',[50,100],[50,0]]]){
    assert.ok(at(direction,...a)>at(direction,...b));assert.equal(at(direction,...a,0),at(direction,...b,0));
  }
});
test('random sizes are stable, seed-dependent and disabled with variation zero',()=>{
  const p=normalizeDesignPattern({kind:'dots',random:1});
  const a=Array.from({length:20},(_,i)=>patternScaleAt(p,i*10,40,200,100,i,0));
  assert.deepEqual(a,Array.from({length:20},(_,i)=>patternScaleAt(p,i*10,40,200,100,i,0)));
  assert.notDeepEqual(a,Array.from({length:20},(_,i)=>patternScaleAt({...p,seed:2},i*10,40,200,100,i,0)));
  assert.equal(new Set(Array.from({length:20},(_,i)=>patternScaleAt({...p,random:0},i*10,40,200,100,i,0))).size,1);
});
test('grid strokes taper along lines instead of only changing widths between lines',()=>{
  const {ctx,calls}=context();paintPattern(ctx,{kind:'grid',spacingX:50,spacingY:50,size:8,distribution:'right'},100,100);
  // Verify a rendered trapezoid has a wider right end along the same line.
  assert.ok(calls.some((c,i)=>{
    const [b,d,e]=calls.slice(i+1,i+4);
    return c[0]==='move'&&b?.[0]==='line'&&d?.[0]==='line'&&e?.[0]==='line'&&
      c[1]>=0&&c[1]<100&&b[1]>c[1]&&e[1]===c[1]&&
      Math.abs(d[2]-b[2])>Math.abs(e[2]-c[2]);
  }));
  const p=normalizeDesignPattern({kind:'grid',distribution:'right'});
  assert.ok(patternScaleAt(p,100,50,100,100)>patternScaleAt(p,0,50,100,100));
});
test('pattern keyframes and expressions are evaluated by the editing/export drawing path',()=>{
  const c=makeClip('title',{props:patternClipProps('dots')});c.props['pattern.random']=.5;
  setKeyframe(c,'pattern.size',0,2,'linear');setKeyframe(c,'pattern.size',4,10,'linear');
  setKeyframe(c,'pattern.strength',0,0,'linear');setKeyframe(c,'pattern.strength',4,1,'linear');
  c.expressions={'pattern.offsetX':{preset:'drift',amount:10,frequency:1}};
  assert.equal(patternFromClip(c,2,valueAt).size,6);assert.equal(patternFromClip(c,2,valueAt).strength,.5);
  assert.equal(patternFromClip(c,2,valueAt).offsetX,20);
  const p=newProject(),a=context(),b=context();drawClip(a.ctx,p,c,2,()=>null);drawClip(b.ctx,p,c,2,()=>null);
  assert.deepEqual(a.calls,b.calls);assert.ok(a.calls.some(x=>x[0]==='arc'));
  const before=context();drawClip(before.ctx,p,c,0,()=>null);assert.notDeepEqual(before.calls,a.calls);
});
test('expressions add to keyframes without changing stored values and can be disabled',()=>{
  const c=makeClip('title');setKeyframe(c,'x',0,10,'linear');setKeyframe(c,'x',4,50,'linear');
  c.expressions={x:{preset:'sine',amount:5,frequency:1}};
  assert.equal(baseValueAt(c,'x',.25),12.5);assert.equal(valueAt(c,'x',.25),17.5);
  assert.deepEqual(c.kf.x,[[0,10,'linear'],[4,50,'linear']]);
  c.expressions.x.enabled=false;assert.equal(valueAt(c,'x',.25),12.5);
});
test('all expression presets reproduce frames out of order, bound values and ignore unknown presets',()=>{
  for(const {value:preset} of EXPRESSION_PRESETS){const e={preset,amount:5,frequency:2,seed:12,min:0,max:1};
    const v=expressionValue(.5,e,2.3);assert.ok(v>=0&&v<=1);expressionValue(.5,e,7);assert.equal(expressionValue(.5,e,2.3),v);
  }
  assert.equal(expressionValue('hello',{preset:'wiggle'},3),'hello');
  assert.equal(expressionValue(9,{preset:'unknown'},3),9);
  assert.equal(expressionValue(9,{preset:'drift',amount:100,frequency:0},3),9);
});
test('continuous rotation can pass a full revolution and survives project save and ordinary splits',()=>{
  const p=newProject(),c=makeClip('title',{dur:8});p.clips[c.id]=c;p.primary=[c.id];
  c.expressions={rotation:{preset:'rotate',amount:90,frequency:1}};
  const expected=valueAt(c,'rotation',5);assert.equal(expected,450);
  const copy=JSON.parse(JSON.stringify(c));assert.equal(valueAt(copy,'rotation',5),expected);
  const right=splitClip(p,c.id,3);assert.equal(valueAt(p.clips[right],'rotation',5),expected);
});
test('copying and removing attributes includes expressions even without keyframes',()=>{
  const a=makeClip('title'),b=makeClip('title');a.expressions={rotation:{preset:'rotate',amount:45,frequency:1}};
  assert.ok(groupsWithContent(a).includes('transform'));pasteAttributes(a,b,['transform']);
  assert.deepEqual(b.expressions,a.expressions);assert.notEqual(b.expressions.rotation,a.expressions.rotation);
  removeAttributes(b,['transform']);assert.equal(b.expressions.rotation,undefined);
});

test('pattern choice and color keyframes switch at the next keyframe',()=>{
  const c=makeClip('title',{props:patternClipProps()});
  for(const [prop,a,b] of [['patternShape','star','square'],['patternKind','dots','grid'],['patternDistribution','left','right'],['patternColor','#ff0000','#00ff00']]){
    setKeyframe(c,prop,0,a);setKeyframe(c,prop,2,b);
    assert.equal(valueAt(c,prop,1.99),a);assert.equal(valueAt(c,prop,2),b);
  }
  assert.equal(patternFromClip(c,1,valueAt).kind,'dots');assert.equal(patternFromClip(c,2,valueAt).kind,'grid');
});
test('expressions remain continuous when splitting a reversed clip',()=>{
  const p=newProject(),c=makeClip('title',{dur:8});c.reverse=true;c.expressions={rotation:{preset:'rotate',amount:90,frequency:1}};
  p.clips[c.id]=c;p.primary=[c.id];const before=valueAt(c,'rotation',5),left=valueAt(c,'rotation',1);
  const right=splitClip(p,c.id,3);assert.equal(valueAt(p.clips[right],'rotation',5),before);assert.equal(valueAt(c,'rotation',1),left);
});
