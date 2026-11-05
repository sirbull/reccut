import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { newDesign, newLayer, normalizeLayer } from '../src/shared/design.js';
import { DESIGN_BADGES, DESIGN_ELEMENTS, elementLayers } from '../src/shared/designContent.js';
import { fitDesignBadge, layoutDesignText } from '../src/shared/designText.js';
import { drawDesign } from '../src/shared/designRender.js';

const measure=(text,font)=>[...text].length*Number(font.match(/([\d.]+)px/)[1])*.6;
test('badge choices have distinct appearances that survive saving and reopening',()=>{
  const d=newDesign(),appearances=new Set();
  assert.equal(DESIGN_ELEMENTS.filter(e=>e.kind==='badge').length,12);
  for(const badge of DESIGN_BADGES){
    const layer=elementLayers(badge,d,{duration:'3:45'})[0];
    appearances.add(JSON.stringify(badge.badgeStyle));
    assert.deepEqual(normalizeLayer(JSON.parse(JSON.stringify(layer))),layer);
    assert.equal(layer.box.autoSize,true);assert.equal(layer.box.block,true);
    if(badge.text==='duration')assert.equal(layer.text,'3:45');
  }
  assert.equal(appearances.size,DESIGN_BADGES.length);
});
test('badges grow, shrink and wrap at the width limit without shrinking the font',()=>{
  const original=elementLayers(DESIGN_BADGES[0],newDesign())[0];
  const short=fitDesignBadge(original,measure,500);
  const long=fitDesignBadge({...short,text:'A much longer badge'},measure,500);
  assert.ok(long.w>short.w);assert.ok(long.h>short.h);
  assert.ok(Math.abs(long.x+long.w/2-short.x-short.w/2)<1e-8);
  assert.ok(Math.abs(long.y+long.h/2-short.y-short.h/2)<1e-8);
  assert.equal(layoutDesignText(long,measure).size,original.size);
  assert.equal(layoutDesignText(long,measure).overflow,false);
  const shrunk=fitDesignBadge({...long,text:'X'},measure,500);
  assert.ok(shrunk.w<short.w);assert.equal(shrunk.h,short.h);
});
test('explicit newlines, trailing newlines, empty text and rich text determine badge height',()=>{
  const base=elementLayers(DESIGN_BADGES[0],newDesign())[0];
  for(const text of ['One\nTwo','One\n','\n\n','']){
    const l=fitDesignBadge({...base,text},measure,800),layout=layoutDesignText(l,measure);
    assert.equal(layout.lines.length,text.split('\n').length);
    assert.equal(l.h,layout.height);assert.equal(layout.overflow,false);
    assert.ok(l.w>0&&l.h>0);
  }
  const rich=fitDesignBadge({...base,text:'BIG\nsmall',textStyles:[{start:0,end:3,style:{size:100,font:'serif'}}]},measure,800);
  assert.ok(Math.abs(rich.h-(100+base.size)*base.lineHeight)<1e-8);
  assert.equal(layoutDesignText(rich,measure).overflow,false);
});
test('multiline badges paint one continuous background, including while empty',()=>{
  for(const text of ['One\nTwo\n','']){
    const layer=fitDesignBadge(elementLayers({...DESIGN_BADGES[0],text},newDesign())[0],measure,800);
    const paths=[],texts=[];let fills=0;
    const ctx={globalAlpha:1,save(){},restore(){},scale(){},translate(){},rotate(){},beginPath(){},rect(){},clip(){},
      roundRect(...args){paths.push(args)},fill(){fills++},fillText(...args){texts.push(args)},
      measureText(t){return{width:measure(t,this.font)}}};
    drawDesign(ctx,{...newDesign(),background:null,layers:[layer]},()=>null,{createCanvas:null});
    assert.equal(fills,1);assert.equal(paths.length,1);
    assert.equal(paths[0][3],layer.h+layer.box.padding*2);
    assert.equal(texts.length,text.split('\n').length);
  }
});

const bundle=(await build({stdin:{contents:"export * as state from './src/renderer/design/store.js'; export {newLayer} from './src/shared/design.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'browser'})).outputFiles[0].text;
function setup(){
  const module={exports:{}};
  class OffscreenCanvas{getContext(){return{font:'',measureText(t){return{width:measure(t,this.font)}}}}}
  vm.runInNewContext(bundle,{module,exports:module.exports,window:{addEventListener(){},api:{onTasks(){},onFlush(){},onAnalyzed(){},listTasks:async()=>[]}},localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},structuredClone,OffscreenCanvas});
  const {state:s,newLayer:create}=module.exports;s.addDesign();
  const badge=create('text',{text:'NEW',size:54,box:{fill:{type:'solid',color:'#ffd60a'},padding:18,radius:8,block:true,autoSize:true}});
  s.changeDesign(d=>d.layers.push(badge));return s;
}
test('live badge sizing commits one undo step and cancel restores the original dimensions',()=>{
  const s=setup(),original=s.currentDesign.value.layers[0],id=s.currentDesign.value.id;
  s.beginDesignTransient();
  for(const text of ['New text','New text\nSecond line','New text\nSecond line\n'])s.updateDesignTransient(p=>{p.designs[id].layers[0].text=text});
  const edited=s.currentDesign.value.layers[0];assert.ok(edited.w>original.w);assert.equal(edited.h,original.h*3);
  s.endDesignTransient();s.designUndo();assert.equal(s.currentDesign.value.layers[0],original);
  s.designRedo();assert.equal(s.currentDesign.value.layers[0],edited);
  s.beginDesignTransient();s.updateDesignTransient(p=>{p.designs[id].layers[0].text='X'});s.endDesignTransient(false);
  assert.equal(s.currentDesign.value.layers[0],edited);
});
test('property edits resize badges, while moving and empty commits keep their dimensions and history',()=>{
  const s=setup(),original=s.currentDesign.value.layers[0];
  s.changeDesign(d=>{d.layers[0].text='A longer label';d.layers[0].size=80});
  const edited=s.currentDesign.value.layers[0];assert.ok(edited.w>original.w);assert.equal(edited.h,88);
  s.changeDesign(d=>{d.layers[0].x+=20});const moved=s.currentDesign.value.layers[0];
  assert.equal(moved.w,edited.w);assert.equal(moved.h,edited.h);
  const before=s.currentDesign.value;s.changeDesign(()=>{});assert.equal(s.currentDesign.value,before);
  s.designUndo();assert.equal(s.currentDesign.value.layers[0],edited);
});
