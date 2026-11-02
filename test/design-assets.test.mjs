import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle = (await build({ stdin: { contents: "export * as assets from './src/renderer/design/assets.js'; export * as design from './src/renderer/design/store.js'; export * as editor from './src/renderer/editor/store.js';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'browser', plugins: [{ name: 'browser-services', setup(b) { b.onResolve({filter: /\/player\.js$/},()=>({path:'qa-player',external:true})); b.onResolve({filter: /\/ui\.jsx$/},()=>({path:'qa-ui',external:true})); } }] })).outputFiles[0].text;
function setup(options = {}) {
  const messages = [], images = [], copied = [], exports = [], listeners = new Set();
  const module = { exports: {} };
  const api = { platform:'darwin', onTasks() { return () => {}; }, onFlush() {}, onAnalyzed() {}, listTasks:async()=>[], baseDir:async()=>'/project', copyIntoProject:async(paths,dir,opts)=> { copied.push({paths,dir,opts}); return paths.map((p)=>dir+'/'+p.split('/').pop()); },
    onExportDone(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async startExport(payload) { exports.push(payload); for(const fn of listeners) fn({id:12,file:'/project/Designs/Frames/frame.png',quiet:true}); return 12; },
    cancelTask() {},
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
  return {...q,images,messages,copied,exports,api,listeners};
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
  const pending = q.assets.placeFiles(['/empty.svg'], { copy: false });
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
