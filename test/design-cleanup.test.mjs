import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),cleanup=require('../src/main/designCleanup.js');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'reccut-cutout-clean-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dir=path.join(root,'Designs','Cutouts');await fs.mkdir(dir,{recursive:true});const mask=path.join(dir,'reccut-cutout-original.png');await fs.writeFile(mask,'mask');const file=path.join(root,'Project.reccut'),p={id:root,designs:{d:{layers:[]}},designAssets:{mask:{id:'mask',origin:'cutout',path:mask}}};return{root,dir,mask,file,p};}
const noHistory={list:async()=>[],read:async()=>null};
test('obsolete generated masks are removed only after a successful project write',async t=>{const f=await fixture(t),plan=await cleanup.plan(f.p,f.file,noHistory);assert.equal(f.p.designAssets.mask,undefined);await fs.access(f.mask);await plan.commit();await assert.rejects(fs.access(f.mask));});
test('layers, undo references, saved snapshots and neighbouring projects all retain their masks',async t=>{
  for(const mode of['layer','undo','snapshot','neighbour']){const f=await fixture(t);let history=noHistory;
    if(mode==='layer')f.p.designs.d.layers=[{cutout:{asset:'mask'}}];
    if(mode==='undo')cleanup.retain(f.p.id,[f.mask]);
    if(mode==='snapshot')history={list:async()=>[{file:'snapshot'}],read:async()=>({...f.p,designs:{d:{layers:[{asset:'mask'}]}}})};
    if(mode==='neighbour')await fs.writeFile(path.join(f.root,'Other.reccut'),JSON.stringify({...f.p,designs:{d:{layers:[{cutout:{asset:'mask'}}]}}}));
    const plan=await cleanup.plan(f.p,f.file,history);await plan.commit();await fs.access(f.mask);assert.ok(f.p.designAssets.mask);
  }
});
test('cleanup defers if references are unreadable and never deletes arbitrary or externally placed files',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'Broken.reccut'),'bad json');await(await cleanup.plan(f.p,f.file,noHistory)).commit();await fs.access(f.mask);
  assert.equal(await cleanup.discard(f.mask),false);const original=path.join(f.dir,'original.png');await fs.writeFile(original,'original');cleanup.register(original);assert.equal(await cleanup.discard(original),false);await fs.access(original);
  const generated=path.join(f.dir,'reccut-cutout-new.png');await fs.writeFile(generated,'generated');cleanup.register(generated);assert.equal(await cleanup.discard(generated),true);await assert.rejects(fs.access(generated));
});
