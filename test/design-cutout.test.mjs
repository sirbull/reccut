import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle=(await build({stdin:{contents:"export * as cutout from './src/renderer/design/cutout.js';export * as design from './src/renderer/design/store.js';export * as editor from './src/renderer/editor/store.js';export * as assets from './src/renderer/design/assets.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'browser',plugins:[{name:'services',setup(b){b.onResolve({filter:/\/player\.js$|\/ui\.jsx$/},({path})=>({path,external:true}));}}]})).outputFiles[0].text;
function setup({early=false}={}){
  const module={exports:{}},listeners=new Set(),jobs=[],canceled=[],written=[],discarded=[],messages=[];let next=1;
  const api={platform:'darwin',onTasks:()=>()=>{},onFlush(){},onAnalyzed(){},listTasks:async()=>[],baseDir:async()=>'/project',onDesignSegmentDone(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    startDesignSegment:async()=>{const id=next++;jobs.push(id);if(early)for(const fn of listeners)fn({id,result:{width:2,height:2,mask:new Uint8Array([0,255,128,0])}});return id;},
    cancelTask:id=>{canceled.push(id);},writeDesignImage:async(path,data)=>{written.push({path,data});return path;},discardDesignCutout:path=>discarded.push(path)};
  class Image{naturalWidth=400;naturalHeight=400;set src(v){this.path=v;Promise.resolve().then(()=>this.onload())}}
  class Canvas{constructor(w,h){this.width=w;this.height=h;}getContext(){return{createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){}}}async convertToBlob(){return new Blob(['png'])}}
  vm.runInNewContext(bundle,{module,exports:module.exports,require:()=>({fileUrl:p=>p,toast:m=>messages.push(m)}),window:{api,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},structuredClone,Image,OffscreenCanvas:Canvas,Uint8Array,Uint8ClampedArray});
  const q=module.exports;q.design.addDesign();q.editor.room.value='design';
  const done=(id,result={width:2,height:2,mask:new Uint8Array([0,255,128,0])})=>{for(const fn of listeners)fn({id,result})};
  return {...q,api,jobs,canceled,written,discarded,messages,done,listeners};
}
test('background removal handles completion before start response and saves one independent undoable mask',async()=>{
  const q=setup({early:true});await q.assets.placeFiles(['/source.png'],{copy:false});const source=q.design.currentDesign.value.layers[0];await q.cutout.removeBackground(source.id);
  const l=q.design.currentDesign.value.layers[0],asset=q.editor.project.value.designAssets[l.cutout.asset];assert.equal(l.asset,source.asset);assert.equal(asset.origin,'cutout');assert.equal(asset.width,400);assert.equal(q.written.length,1);assert.equal(q.canceled.length,0);assert.equal(q.listeners.size,0);assert.equal(Object.keys(q.cutout.backgroundJobs.value).length,0);
  q.design.designUndo();assert.equal(q.design.currentDesign.value.layers[0].cutout,null);q.design.designRedo();assert.equal(q.design.currentDesign.value.layers[0].cutout.asset,asset.id);
});
for(const action of['delete','undo','project','cancel'])test(`a ${action} during removal discards late results and clears the UI`,async()=>{
  const q=setup();await q.assets.placeFiles(['/source.png'],{copy:false});const l=q.design.currentDesign.value.layers[0],pending=q.cutout.removeBackground(l.id);await Promise.resolve();await Promise.resolve();
  if(action==='delete')q.design.deleteSelection();if(action==='undo')q.design.designUndo();if(action==='project')q.editor.setProject({...structuredClone(q.editor.project.value),id:'next',designs:{},designAssets:{}});if(action==='cancel')q.cutout.cancelBackground(l.id);
  q.done(q.jobs[0]);await pending;assert.ok(q.canceled.includes(q.jobs[0]));assert.equal(q.written.length,0);assert.equal(q.listeners.size,0);assert.equal(Object.keys(q.cutout.backgroundJobs.value).length,0);assert.equal(q.messages.length,0);
});
test('starting removal twice cannot let the first completion replace the new mask',async()=>{
  const q=setup();await q.assets.placeFiles(['/source.png'],{copy:false});const id=q.design.currentDesign.value.layers[0].id,a=q.cutout.removeBackground(id);await Promise.resolve();await Promise.resolve();const b=q.cutout.removeBackground(id);await Promise.resolve();await Promise.resolve();q.done(q.jobs[0]);q.done(q.jobs[1]);await Promise.all([a,b]);assert.equal(q.written.length,1);assert.ok(q.design.currentDesign.value.layers[0].cutout);assert.equal(q.messages.length,0);
});
