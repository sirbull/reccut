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
  vm.runInNewContext(bundle, {module,exports:module.exports,require:()=>services,window:{api:{platform,onTasks(){},onFlush(){},onAnalyzed(){},listTasks:async()=>[],hideFromCapture(){}},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>0,clearTimeout(){},performance:{now:()=>0},structuredClone});
  return {...module.exports,calls};
}
test('Design refuses Edit commands and menu accelerators without switching rooms', () => {
  const {registry:r,editor:e,calls}=setup();e.room.value='design';
  for(const id of ['tool:blade','copyEffects','export','exportFrame','import','sequenceSettings','newSequence']) {
    assert.equal(r.runCommand(id),false,id);assert.equal(e.room.value,'design');
  }
  assert.equal(calls.length,0);
  const menu=r.menuTemplate().flatMap(m=>m.submenu||[]);
  for(const id of ['export','sequenceSettings','blade'])assert.equal(menu.find(i=>i.id===id),undefined,id);
  assert.ok(menu.some(i=>i.id==='save'));
});
test('menus follow the room: Window has grid, rulers and smart guides only in Design', async () => {
  const {registry:r,editor:e}=setup();
  const windowIds=()=>[...r.menuTemplate().find(m=>m.label==='Window').submenu.map(i=>i.id).filter(Boolean)];
  e.room.value='design';
  assert.deepEqual(windowIds(),['design:rulers','design:grid','design:smartGuides']);
  assert.ok(r.menuTemplate().some(m=>m.label==='Design'));
  assert.ok(!r.menuTemplate().some(m=>m.label==='Clip'));
  r.runCommand('design:grid');await Promise.resolve();
  assert.equal(r.menuTemplate().find(m=>m.label==='Window').submenu.find(i=>i.id==='design:grid').checked,true);
  e.room.value='edit';
  assert.deepEqual(windowIds(),[]);
  assert.ok(!r.menuTemplate().some(m=>m.label==='Design'));
  assert.ok(r.menuTemplate().some(m=>m.label==='Clip'));
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

test('every room has its own keys and menus: a key in one room never reaches another', () => {
  const {registry:r,editor:e}=setup();
  const key=(code,mod={})=>({code,key:'',metaKey:false,ctrlKey:false,altKey:false,shiftKey:false,...mod});
  const D=key('KeyD'),cmdE=key('KeyE',{metaKey:true}),space=key('Space');
  const reg=(ev,room)=>r.commandForEvent(ev,room,{includeRegistered:true})?.id;
  assert.equal(reg(D,'edit'),'overwrite');
  for(const room of ['record','export','design'])assert.equal(reg(D,room),undefined,room);
  assert.equal(reg(cmdE,'edit'),'export');
  assert.equal(reg(cmdE,'export'),'export:start');
  assert.equal(reg(cmdE,'record'),undefined);
  assert.equal(reg(space,'export'),'play');
  assert.equal(reg(space,'record'),undefined);
  const menus=()=>r.menuTemplate().map(m=>m.label);
  const expected={record:['Record'],edit:['Mark','Clip','Tools','Playback'],export:['Export','Playback'],design:['Design']};
  const roomMenus=['Record','Export','Mark','Clip','Tools','Playback','Design'];
  for(const [room,own] of Object.entries(expected)){
    e.room.value=room;
    assert.deepEqual([...menus().filter(m=>roomMenus.includes(m))],own,room);
  }
  // Another room's command is never run from the menu bar, and text fields keep their native keys.
  for(const room of ['record','export']){
    e.room.value=room;
    const edit=r.menuTemplate().find(m=>m.label==='Edit').submenu;
    assert.deepEqual([...edit.filter(i=>!i.separator).map(i=>i.role)],['undo','redo','cut','copy','paste','selectAll'],room);
    assert.ok(!r.menuTemplate().flatMap(m=>m.submenu||[]).some(i=>['import','export','newSequence','sequenceSettings'].includes(i.id)),room);
  }
  assert.equal(r.inRoom(r.byId.get('undo'),'record'),false);
});

test('Record menu shows the keys from the Record modifier and follows the layout', () => {
  const {registry:r,editor:e}=setup();e.room.value='record';
  const items=r.menuTemplate().find(m=>m.label==='Record').submenu.filter(i=>!i.separator);
  assert.equal(items.find(i=>i.id==='record:toggle').accelerator,'Control+Alt+0');
  assert.equal(items.find(i=>i.id==='record:pause').accelerator,'Control+Alt+9');
  assert.equal(items.find(i=>i.id==='record:layout:7').accelerator,'Control+Alt+7');
  assert.equal(items.find(i=>i.id==='record:layout:8').accelerator,'Control+Alt+8');
  assert.equal(items.find(i=>i.id==='record:layout:6').checked,true);
  assert.equal(items.every(i=>i.register===false),true,'the main process owns these keys');
  for(const cmd of r.COMMANDS.filter(c=>c.id.startsWith('record:')))assert.equal(cmd.menuOnly,true,cmd.id);
});
