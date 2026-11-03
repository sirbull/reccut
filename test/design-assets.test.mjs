import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle = (await build({ stdin: { contents: "export * as assets from './src/renderer/design/assets.js'; export * as layered from './src/renderer/design/layered.js'; export * as crop from './src/renderer/design/crop.js'; export * as design from './src/renderer/design/store.js'; export * as editor from './src/renderer/editor/store.js';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'browser', plugins: [{ name: 'browser-services', setup(b) { b.onResolve({filter: /\/player\.js$/},()=>({path:'qa-player',external:true})); b.onResolve({filter: /\/ui\.jsx$/},()=>({path:'qa-ui',external:true})); } }] })).outputFiles[0].text;
function setup(options = {}) {
  const messages = [], images = [], copied = [], exports = [], listeners = new Set();
  const module = { exports: {} };
  let clipboard = { image: null, text: '' };
  const written = [];
  const api = { platform:'darwin', onTasks() { return () => {}; }, onFlush() {}, onAnalyzed() {}, listTasks:async()=>[], baseDir:async()=>'/project', copyIntoProject:async(paths,dir,opts)=> { copied.push({paths,dir,opts}); return paths.map((p)=>dir+'/'+p.split('/').pop()); },
    onExportDone(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async startExport(payload) { exports.push(payload); for(const fn of listeners) fn({id:12,file:'/project/Designs/Frames/frame.png',quiet:true}); return 12; },
    cancelTask() {}, exists: async () => true,
    readDesignClipboard: async () => clipboard,
    writeDesignClipboard: async (text) => { clipboard = { text, image: null }; },
    writeDesignImage: async (path, data) => { written.push({ path, data }); return path; },
    setClipboard: (value) => { clipboard = value; },
  };
  class FakeImage {
    naturalWidth=options.width || 1920; naturalHeight=options.height || 1080;
    set src(path) {
      this.path=path; images.push(this);
      if (options.deferred) return;
      Promise.resolve().then(()=> { if (this.crossOrigin !== 'anonymous' || path.includes('corrupt')) this.onerror(); else this.onload(); });
    }
  }
  vm.runInNewContext(bundle, { module,exports:module.exports,require:(name)=>name==='qa-player'?{fileUrl:p=>'media://file/'+encodeURIComponent(p)}:{toast:message=>messages.push(message)}, window:{api,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>0},setTimeout:()=>0,clearTimeout(){},structuredClone,Image:FakeImage });
  const q=module.exports; q.design.addDesign();
  return {...q,images,messages,copied,exports,api,listeners,written};
}
test('placed images request CORS-safe pixels, copy uniquely and remain separate from Edit media',async()=>{
  const q=setup(); await q.assets.placeFiles(['/outside/photo.png'],{copy:true});
  assert.equal(q.images[0].crossOrigin,'anonymous'); assert.equal(q.copied[0].opts.unique,true);
  const p=q.editor.project.value, a=Object.values(p.designAssets)[0]; assert.equal(a.path,'/project/Designs/Assets/photo.png'); assert.equal(a.copied,true);
  assert.equal(Object.keys(p.media).length,0); assert.equal(q.design.currentDesign.value.layers[0].asset,a.id);
});
test('unreadable and unsupported images add no assets or layers',async()=>{
  const q=setup(); await q.assets.placeFiles(['/outside/corrupt.png','/outside/readme.txt'],{copy:false});
  assert.equal(Object.keys(q.editor.project.value.designAssets).length,0); assert.equal(q.design.currentDesign.value.layers.length,0); assert.equal(q.messages.length,2);
});
test('an image finishing after the project changes cannot be added to the next project',async()=>{
  const q=setup({deferred:true}), loading=q.assets.placeFiles(['/photo.png'],{copy:false});
  q.editor.setProject({...q.editor.project.value,id:'next',designs:{},designAssets:{}}); q.images[0].onload(); await loading;
  assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);
});
test('frame capture accepts completion before the IPC response and stores an independent PNG',async()=>{
  const q=setup(); q.design.addText();
  await q.assets.captureFrame({...q.editor.project.value,width:1920,height:1080,duration:1,fps:30},0.25);
  const d=q.design.currentDesign.value, asset=Object.values(q.editor.project.value.designAssets)[0];
  assert.equal(asset.origin,'frame'); assert.equal(d.layers[0].asset,asset.id); assert.equal(d.layers[1].type,'text'); assert.equal(asset.width,1920);
  assert.equal(q.listeners.size,0);
});

test('zero-size decoded images are rejected before drawing', async () => {
  const q = setup({ deferred: true });
  const pending = q.assets.placeFiles(['/empty.png'], { copy: false });
  q.images[0].naturalWidth = 0; q.images[0].onload(); await pending;
  assert.equal(q.design.currentDesign.value.layers.length, 0);
  assert.equal(q.messages.length, 1);
});


for (const [width, height, expected] of [
  [1080, 1080, { x: 280, y: 0, w: 720, h: 720 }],
  [1080, 1920, { x: 437.5, y: 0, w: 405, h: 720 }],
  [1920, 1080, { x: 0, y: 0, w: 1280, h: 720 }],
  [1920, 960, { x: 0, y: 40, w: 1280, h: 640 }],
]) test(`captured ${width}x${height} frames retain the whole image in a 16:9 thumbnail`, async () => {
  const q = setup({ width, height });
  const source = { ...q.editor.project.value, width, height, duration: 1, fps: 30 };
  await q.assets.captureFrame(source, 0.25);
  const d = q.design.currentDesign.value, layer = d.layers[0];
  assert.deepEqual(JSON.parse(JSON.stringify({ x: layer.x, y: layer.y, w: layer.w, h: layer.h })), expected);
  assert.equal(layer.fit, 'contain');
  assert.deepEqual(JSON.parse(JSON.stringify(layer.crop)), { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(q.exports[0].settings.frame.width, width);
  assert.equal(q.exports[0].settings.frame.height, height);
  assert.equal(layer.w / layer.h, width / height);
  // Moving the placed frame must not change its source crop or box aspect.
  q.design.moveSelection(-100, 50);
  const moved = q.design.currentDesign.value.layers[0];
  assert.equal(moved.x, expected.x - 100); assert.equal(moved.y, expected.y + 50);
  assert.equal(moved.w / moved.h, width / height);
  assert.deepEqual(JSON.parse(JSON.stringify(moved.crop)), { x: 0, y: 0, w: 1, h: 1 });
  q.design.designUndo();
  assert.equal(q.design.currentDesign.value.layers[0].x, expected.x);
});


test('native clipboard PNG placement is project-owned and undoes in one step', async () => {
  const q = setup(); q.api.setClipboard({ image: new Uint8Array([1, 2, 3]), text: '' });
  await q.assets.pasteImage();
  const layer = q.design.currentDesign.value.layers[0], asset = q.editor.project.value.designAssets[layer.asset];
  assert.equal(asset.copied, true); assert.match(asset.path, /Designs\/Assets\/Pasted/);
  assert.equal(q.written.length, 1); assert.equal(Object.keys(q.editor.project.value.media).length, 0);
  q.design.designUndo(); assert.equal(q.design.currentDesign.value.layers.length, 0); assert.equal(Object.keys(q.editor.project.value.designAssets).length, 0);
});
test('copy and cut route Design layers to the clipboard and paste reuses assets in this project', async () => {
  const q = setup(); await q.assets.placeFiles(['/linked.png'], { copy: false });
  const original = q.design.currentDesign.value.layers[0];
  await q.assets.copyLayers(); await q.assets.pasteImage();
  let layers = q.design.currentDesign.value.layers;
  assert.equal(layers.length, 2); assert.notEqual(layers[0].id, layers[1].id); assert.equal(layers[1].asset, original.asset);
  await q.assets.copyLayers(true); assert.equal(q.design.currentDesign.value.layers.length, 1);
  q.design.designUndo(); assert.equal(q.design.currentDesign.value.layers.length, 2);
});
test('linked placement and alternate drop mode respect the current copy preference without a dialog', async () => {
  const q = setup();
  await q.assets.requestPlace(['/linked.png'], { x: 100, y: 100 }, true);
  const a = Object.values(q.editor.project.value.designAssets)[0];
  assert.equal(a.copied, false); assert.equal(a.path, '/linked.png'); assert.equal(q.copied.length, 0);
});
test('missing video sources still capture the offline card and report a warning', async () => {
  const q = setup(); q.api.exists = async () => false;
  const source = { ...q.editor.project.value, duration: 1, fps: 30, media: { v: { path: '/missing.mp4' } }, clips: { c: { mediaId: 'v', start: 0, dur: 1 } } };
  await q.assets.captureFrame(source, 0);
  assert.equal(q.design.currentDesign.value.layers.length, 1);
  assert.ok(q.messages.some((m) => m.includes('Media Offline')));
});

test('switching projects clears old folders before an immediate image placement', async () => {
  const q = setup();
  q.editor.projectFolders.value = { designs: '/old/Designs' };
  q.api.projectFolders = async () => ({ designs: '/new/Designs' });
  const p = structuredClone(q.editor.project.value);
  q.editor.setProject(p, '/new/New.reccut');
  assert.equal(q.editor.projectFolders.value, null);
  q.design.openDesign(Object.keys(p.designs)[0]);
  await q.assets.placeFiles(['/outside/image.png'], { copy: true });
  assert.equal(q.copied[0].dir, '/new/Designs/Assets');
});


test('cross-project copy registers independent assets, preserves groups and pastes relative centers', async () => {
  const q=setup(); await q.assets.placeFiles(['/outside/photo.png'],{copy:true}); q.design.addText(); q.design.selectAll(); q.design.groupSelection();
  const source=q.design.currentDesign.value, group=source.layers[0].group;
  await q.assets.copyLayers();
  q.editor.setProject({...structuredClone(q.editor.project.value),id:'project-b',designs:{},designAssets:{},media:{}});
  q.design.addDesign({width:640,height:360}); await q.assets.pasteImage();
  const p=q.editor.project.value,d=q.design.currentDesign.value;
  assert.equal(d.layers.length,2); assert.equal(Object.keys(p.designAssets).length,1); assert.notEqual(d.layers[0].group,group); assert.equal(d.layers[0].group,d.layers[1].group);
  assert.equal(d.layers[0].media,null);assert.ok(p.designAssets[d.layers[0].asset]);assert.equal(q.copied.length,2);
  assert.equal((d.layers[0].x+d.layers[0].w/2)/d.width,(source.layers[0].x+source.layers[0].w/2)/source.width);
  q.design.designUndo(); assert.equal(q.design.currentDesign.value.layers.length,0); assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);
});
test('plain clipboard text becomes one text layer, while paste in place retains coordinates',async()=>{
  const q=setup(); q.api.setClipboard({text:'A *highlighted* title',image:null});await q.assets.pasteImage();
  assert.equal(q.design.currentDesign.value.layers[0].text,'A *highlighted* title');
  const source=q.design.currentDesign.value.layers[0];await q.assets.copyLayers();q.design.addDesign({width:300,height:300});await q.assets.pasteImage(true);
  assert.equal(q.design.currentDesign.value.layers[0].x,source.x);assert.equal(q.design.currentDesign.value.layers[0].y,source.y);
});
test('layered PSD import asks before extraction and registers positioned layers in one undo step',async()=>{
  const q=setup();const extracted=[];
  q.api.psdLayers=async()=>({width:1920,height:1080,layers:[{index:0,name:'Background',visible:true},{index:1,name:'Title',visible:true}]});
  q.api.psdExtract=async(file,indices,mode,dir)=>{extracted.push({indices,mode,dir});return indices.map(i=>({path:dir+'/'+i+'.png',name:'Layer '+i}))};
  const placing=q.assets.placeFiles(['/outside/art.psd'],{copy:true});
  for(let i=0;i<20&&!q.layered.designLayerImport.value;i++)await Promise.resolve();
  assert.ok(q.layered.designLayerImport.value);assert.equal(extracted.length,0);
  q.layered.finishLayerImport({indices:[0,1],mode:'layers'});await placing;
  const layers=q.design.currentDesign.value.layers;assert.equal(layers.length,2);assert.equal(layers[0].x,layers[1].x);assert.equal(layers[0].group,layers[1].group);assert.ok(layers[0].group);
  assert.equal(Object.keys(q.editor.project.value.designAssets).length,2);assert.match(extracted[0].dir,/Designs\/Assets\/art\//);
  q.design.designUndo();assert.equal(q.design.currentDesign.value.layers.length,0);assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);
});

test('crop drafts cancel safely when another action edits the layer or switches projects',async()=>{
  const q=setup();q.editor.room.value='design';await q.assets.placeFiles(['/photo.png'],{copy:false});
  const original=q.design.currentDesign.value.layers[0];q.crop.startCrop();q.crop.setCropRatio('1');assert.ok(q.crop.cropSession.value);
  q.design.changeLayers(l=>{l.name='Changed elsewhere'});assert.equal(q.crop.cropSession.value,null);assert.equal(q.design.currentDesign.value.layers[0].name,'Changed elsewhere');
  q.design.designUndo();assert.equal(q.design.currentDesign.value.layers[0].name,original.name);
  q.crop.startCrop();q.crop.setCropRatio('0.8');q.crop.finishCrop();assert.ok(Math.abs(q.design.currentDesign.value.layers[0].w/q.design.currentDesign.value.layers[0].h-0.8)<1e-8);
  q.design.designUndo();assert.deepEqual(JSON.parse(JSON.stringify(q.design.currentDesign.value.layers[0])),JSON.parse(JSON.stringify(original)));
  q.crop.startCrop();q.editor.setProject({...structuredClone(q.editor.project.value),id:'new-project'});assert.equal(q.crop.cropSession.value,null);
});

test('a captured frame asset can be prepared without creating or changing a design', async () => {
  const q=setup(); q.design.designCommit(p=>{p.designs={};});
  const before=q.editor.project.value,asset=await q.assets.captureFrameAsset({...before,width:1080,height:1920,duration:3,fps:30},1);
  assert.equal(asset.origin,'frame');assert.equal(q.editor.project.value,before);
  assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);
});
test('an already canceled frame request does not start export or add assets',async()=>{
  const q=setup(),controller=new AbortController();controller.abort();
  await q.assets.captureFrameAsset({...q.editor.project.value,duration:3,fps:30},1,{signal:controller.signal});
  assert.equal(q.exports.length,0);assert.equal(Object.keys(q.editor.project.value.designAssets).length,0);
});
