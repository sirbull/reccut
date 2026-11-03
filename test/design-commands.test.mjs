import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle = (await build({ stdin: { contents: "export * as registry from './src/renderer/registry.js'; export * as editor from './src/renderer/editor/store.js'; export * as design from './src/renderer/design/store.js';", resolveDir: process.cwd() }, bundle: true, write: false, format: 'cjs', platform: 'browser', plugins: [{ name: 'services', setup(b) {
  b.onResolve({filter:/\/editor\/commands\.js$|\/editor\/playback\.js$|\/editor\/fullscreen\.js$|\/design\/export\.js$|\/player\.js$|\/ui\.jsx$/}, ({path}) => ({path,external:true}));
} }] })).outputFiles[0].text;
function setup(platform = 'darwin') {
  const module = {exports:{}};
  const calls=[];
  const services = new Proxy({ toast() {}, fileUrl:p=>p, quickExportPNG() {} },{ get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,args]) });
  vm.runInNewContext(bundle, {module,exports:module.exports,require:()=>services,window:{api:{platform,onTasks(){},onFlush(){},onAnalyzed(){},listTasks:async()=>[]},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>0,clearTimeout(){},performance:{now:()=>0},structuredClone});
  return {...module.exports,calls};
}
test('Design refuses Edit commands and menu accelerators without switching rooms', () => {
  const {registry:r,editor:e,calls}=setup();e.room.value='design';
  for(const id of ['tool:blade','copyEffects','export','exportFrame','import','sequenceSettings','newSequence']) {
    assert.equal(r.runCommand(id),false,id);assert.equal(e.room.value,'design');
  }
  assert.equal(calls.length,0);
  const menu=r.menuTemplate().flatMap(m=>m.submenu||[]);
  assert.equal(menu.find(i=>i.id==='export').enabled,false);
  assert.equal(menu.find(i=>i.id==='sequenceSettings').enabled,false);
});
test('shared Undo and Redo act on Design and keep timeline state intact', async () => {
  const {registry:r,editor:e,design:d}=setup();e.room.value='design';
  d.addDesign();d.addText();const id=d.currentDesignId.value;
  assert.equal(r.runCommand('undo'),true);await Promise.resolve();assert.equal(e.project.value.designs[id].layers.length,0);
  r.runCommand('redo');await Promise.resolve();assert.equal(e.project.value.designs[id].layers.length,1);
  assert.equal(Object.keys(e.project.value.clips).length,0);
});
test('Design shortcuts match Photoshop terms with no per-room conflicts on Mac or Windows', () => {
  for(const platform of ['darwin','win32']) {
    const {registry:r}=setup(platform);
    assert.equal(r.byId.get('design:duplicate').keys,'CmdOrCtrl+J');
    assert.equal(r.byId.get('design:clear').keys,'CmdOrCtrl+D');
    assert.equal(r.byId.get('design:transform').keys,'CmdOrCtrl+T');
    assert.equal(r.keysFor(r.byId.get('design:zoom100')).length,0,'Cmd/Ctrl 1 stays with Record');
    for(const cmd of r.COMMANDS.filter(c=>c.id.startsWith('design:'))) for(const k of r.keysFor(cmd)) assert.equal(r.conflictsFor(k,cmd.id).length,0,`${cmd.id}: ${k}`);
  }
});

test('Design keyboard conflicts are room aware, including group, crop and paste in place',()=>{
  const {registry:r,editor:e}=setup();e.room.value='design';
  assert.equal(r.conflictsFor('T','design:crop').some(c=>c.id==='tool:trim'),false);
  assert.ok(r.conflictsFor('CmdOrCtrl+S','design:crop').some(c=>c.id==='save'));
  for(const id of ['design:group','design:ungroup','design:pasteInPlace'])assert.ok(!r.byId.get(id).register,id);
  for(const id of ['design:crop','design:cycleShape','design:align:left','design:distribute:x'])assert.equal(r.byId.get(id).help,'design');
});
