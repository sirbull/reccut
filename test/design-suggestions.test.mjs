import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { newProject, makeClip } from '../src/shared/model.js';
const bundle=(await build({stdin:{contents:"export * as suggest from './src/renderer/design/suggest.js';export * as editor from './src/renderer/editor/store.js';export * as design from './src/renderer/design/store.js';export * as templates from './src/shared/designTemplates.js';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'browser',plugins:[{name:'services',setup(b){b.onResolve({filter:/\/player\.js$|\/ui\.jsx$|\/frameSampler\.js$/},({path})=>({path,external:true}));}}]})).outputFiles[0].text;
function setup(){
 const module={exports:{}},messages=[],exports=[],listeners=new Set(),aiCalls=[];let config={provider:'compatible',endpoint:'http://localhost:11434/v1',model:'test'};
 const api={platform:'darwin',onTasks:()=>()=>{},onFlush(){},onAnalyzed(){},listTasks:async()=>[],baseDir:async()=>'/project',exists:async()=>true,cancelTask(){},onExportDone(fn){listeners.add(fn);return()=>listeners.delete(fn);},startExport:async payload=>{exports.push(payload);for(const fn of listeners)fn({id:1,file:'/project/Designs/Frames/test.png'});return 1;},aiConfig:async()=>config,aiComplete:async payload=>{aiCalls.push(payload);return{text:'1. Første tittel\n2. Andre tittel'};}};
 class Image{naturalWidth=1080;naturalHeight=1080;set src(path){queueMicrotask(()=>this.onload())}}
 vm.runInNewContext(bundle,{module,exports:module.exports,require:path=>path.includes('frameSampler')?{createFrameSampler:()=>{throw Error('Inject a sampler')}}:{fileUrl:p=>p,toast:m=>messages.push(m)},window:{api,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},performance,setTimeout:()=>0,clearTimeout(){},structuredClone,AbortController,URL,Image,queueMicrotask});
 const q=module.exports,p=newProject('Norsk prosjekt'),media={id:'m',kind:'video',duration:3,path:'/video.mp4',streams:{main:{hasVideo:true,path:'/video.mp4'}}},clip=makeClip('video',{media,dur:3}),caption=makeClip('caption',{props:{text:'Lær enkel videoredigering'}});p.media.m=media;p.clips[clip.id]=clip;p.primary=[clip.id];p.clips[caption.id]=caption;p.duration=3;q.editor.setProject(p);q.editor.room.value='design';
 return{...q,api,exports,aiCalls,messages,setConfig:value=>{config=value}};
}
const pixels={width:2,height:2,data:new Uint8ClampedArray(16).fill(255)};
const sampler=()=>({sample:async()=>({pixels,canvas:{}}),dispose(){}});
test('offline analysis never calls AI and closes cleanly on a project or room change',async()=>{
 const q=setup();q.suggest.openSuggestions();await q.suggest.loadSuggestionAIConfig();await q.suggest.analyzeSuggestions(sampler);assert.equal(q.suggest.suggestions.value.phase,'ready');assert.ok(q.suggest.suggestions.value.frames.length);assert.equal(q.aiCalls.length,0);q.editor.room.value='edit';assert.equal(q.suggest.suggestions.value,null);
 q.editor.room.value='design';q.suggest.openSuggestions();q.editor.setProject(newProject('Next'));assert.equal(q.suggest.suggestions.value,null);
});
test('late frame analysis cannot populate a replacement dialog and disposes its player',async()=>{
 const q=setup();let release,disposed=false;q.suggest.openSuggestions();const pending=q.suggest.analyzeSuggestions(()=>({sample:()=>new Promise(r=>{release=r}),dispose(){disposed=true}}));q.suggest.closeSuggestions();q.suggest.openSuggestions();const id=q.suggest.suggestions.value.id;release({pixels,canvas:{}});await pending;assert.equal(q.suggest.suggestions.value.id,id);assert.equal(q.suggest.suggestions.value.phase,'idle');assert.equal(q.suggest.suggestions.value.frames.length,0);assert.ok(disposed);
});
test('choosing a frame from an empty Design room creates one complete design and one undo restores emptiness',async()=>{
 const q=setup(),before=q.editor.project.value;q.suggest.openSuggestions();await q.suggest.analyzeSuggestions(sampler);const frame=q.suggest.suggestions.value.frames[0];await q.suggest.createSuggestedDesign(frame,q.templates.BUILTIN_DESIGN_TEMPLATES[0],'Min nye tittel',{width:1280,height:720});
 const d=q.design.currentDesign.value,l=d.layers.find(l=>l.placeholder==='frame');assert.ok(l);assert.equal(l.fit,'contain');assert.equal(l.crop.w,1);assert.ok(d.layers.some(l=>l.text==='Min nye tittel'));assert.equal(q.editor.project.value.clips,before.clips);assert.equal(q.exports.length,1);assert.equal(q.exports[0].settings.frame.width,before.width);assert.equal(q.suggest.suggestions.value,null);assert.equal(Object.keys(q.editor.project.value.designAssets).length,1);
 q.design.designUndo();assert.equal(Object.keys(q.editor.project.value.designs).length,0);assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);
});
test('AI is explicit, provider changes prevent sending, and errors retain offline ideas',async()=>{
 const q=setup();q.suggest.openSuggestions();await q.suggest.loadSuggestionAIConfig();assert.equal(q.aiCalls.length,0);const offline=[...q.suggest.suggestions.value.titles];q.setConfig({provider:'compatible',endpoint:'https://other.example/v1',model:'next',hasKey:true});await q.suggest.suggestAITitles();assert.equal(q.aiCalls.length,0);assert.ok(q.messages.some(m=>m.includes('settings changed')));
 q.api.aiComplete=async()=>{throw Error('Offline')};await q.suggest.suggestAITitles();assert.deepEqual([...q.suggest.suggestions.value.titles],offline);assert.equal(q.suggest.suggestions.value.aiBusy,false);assert.ok(q.messages.some(m=>m.includes('Offline')));
 q.api.aiComplete=async payload=>{q.aiCalls.push(payload);return{text:'1. Første tittel\n2. Andre tittel'}};await q.suggest.suggestAITitles();assert.equal(q.aiCalls.length,1);assert.deepEqual([...q.suggest.suggestions.value.titles],['Første tittel','Andre tittel']);assert.ok(q.aiCalls[0].messages[0].content.includes('Lær enkel videoredigering'));assert.ok(!JSON.stringify(q.aiCalls[0]).includes('/video.mp4'));
});
test('timeline edits close stale suggestions instead of capturing a different composition',async()=>{
 const q=setup();q.suggest.openSuggestions();q.editor.commit(p=>{p.clips[p.primary[0]].props.exposure=1});assert.equal(q.suggest.suggestions.value,null);
});

test('failed frame capture retains suggestions and does not leave a partial design',async()=>{
 const q=setup();q.suggest.openSuggestions();await q.suggest.analyzeSuggestions(sampler);q.api.startExport=async()=>{throw Error('Permission denied')};const s=q.suggest.suggestions.value;await q.suggest.createSuggestedDesign(s.frames[0],q.templates.BUILTIN_DESIGN_TEMPLATES[0],'Title',{width:1280,height:720});assert.equal(Object.keys(q.editor.project.value.designs).length,0);assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);assert.equal(q.suggest.suggestions.value.creating,false);assert.ok(q.messages.some(m=>m.includes('Permission denied')));
});
