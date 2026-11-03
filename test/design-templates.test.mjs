import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BUILTIN_DESIGN_STYLES, BUILTIN_DESIGN_TEMPLATES, validateDesignTemplate, applyTemplate, extractDesignStyle, applyDesignStyle, templateFromDesign } from '../src/shared/designTemplates.js';
import { newLayer, layerBounds } from '../src/shared/design.js';
const require=createRequire(import.meta.url),{createDesignLibrary}=require('../src/main/designLibrary.js');
const fixture=()=>structuredClone(BUILTIN_DESIGN_TEMPLATES[0]);

test('all 22 built-in templates validate and anchors fit wide, tall, square and large canvases',()=>{
  assert.equal(BUILTIN_DESIGN_TEMPLATES.length,22);
  for(const [ratio,count]of[['16:9',12],['9:16',6],['1:1',4]])assert.equal(BUILTIN_DESIGN_TEMPLATES.filter(t=>t.ratio===ratio).length,count);
  for(const template of BUILTIN_DESIGN_TEMPLATES){validateDesignTemplate(template);for(const [width,height]of[[1280,720],[1080,1920],[1080,1080],[3000,3000]]){
    const d=applyTemplate(template,{width,height,frame:{asset:'frame'},cutout:{asset:'person',cutout:{asset:'mask',enabled:true}},logo:{asset:'logo'},title:'A *new* title',subtitle:'Details'});
    for(const l of d.layers){const b=layerBounds(l);assert.ok(b.x>=-1e-7&&b.y>=-1e-7&&b.x+b.w<=width+1e-7&&b.y+b.h<=height+1e-7,`${template.name}: ${l.name} at ${width}x${height}`);}
  }}
});
test('templates replace placeholders, default the project title and keep asset/cutout references independent',()=>{
  const t=fixture(),d=applyTemplate(t,{projectName:'Project Name',frame:{asset:'frame'},cutout:{asset:'person',cutout:{asset:'mask',enabled:true,feather:5,shift:-2}},subtitle:'Subtitle',logo:{asset:'logo'}});
  assert.equal(d.layers.find(l=>l.placeholder==='title').text,'Project Name');assert.equal(d.layers.find(l=>l.placeholder==='subtitle').text,'Subtitle');assert.equal(d.layers.find(l=>l.placeholder==='frame').asset,'frame');assert.equal(d.layers.find(l=>l.placeholder==='cutout').cutout.asset,'mask');assert.equal(d.layers.find(l=>l.placeholder==='logo').asset,'logo');
  assert.notEqual(d.layers[0].id,t.design.layers[0].id);d.layers[0].crop.x=0.2;assert.equal(t.design.layers[0].crop.x,0);
  assert.ok(applyTemplate(t).layers.every(l=>l.type!=='image'));
});
test('template validation refuses paths and oversized/unsafe images before any file access',()=>{
  for(const key of['asset','media','path','src','url','file'])for(const value of['../../etc/passwd','/etc/passwd','C:\\private\\image.png','file:///etc/passwd','images/photo.png']){
    const t=fixture();t.design.layers[0][key]=value;assert.throws(()=>validateDesignTemplate(t),/paths|assets/);
  }
  const t=fixture();t.design.layers[0].data='data:image/png;base64,'+'A'.repeat(1_500_000);assert.throws(()=>validateDesignTemplate(t),/1 MB/);
  t.design.layers[0].data='data:image/svg+xml;base64,AAAA';assert.throws(()=>validateDesignTemplate(t),/PNG/);
  t.design.layers[0].data='file:///private/file.png';assert.throws(()=>validateDesignTemplate(t),/data URLs/);
});
test('template validation rejects newer versions, invalid sizes and huge layer lists, and warns for unknown types',()=>{
  for(const raw of[null,{},'not json'])assert.throws(()=>validateDesignTemplate(raw),/not a Reccut/);
  const t=fixture();t.version=2;assert.throws(()=>validateDesignTemplate(t),/newer version/);t.version=1;
  t.design.width=8193;assert.throws(()=>validateDesignTemplate(t),/sizes/);t.design.width=1280;
  t.design.layers=Array.from({length:10000},()=>({type:'text'}));assert.throws(()=>validateDesignTemplate(t),/200/);
  t.design.layers=[{type:'alien'},newLayer('text',{font:'Missing Font Still Applies'})];const v=validateDesignTemplate(t);assert.equal(v.warnings.length,1);assert.equal(applyTemplate(v).layers[0].font,'Missing Font Still Applies');
});
test('saved styles copy only appearance, scale text size and never keep a live link',()=>{
  assert.equal(BUILTIN_DESIGN_STYLES.length,15);
  const layer=newLayer('text',{x:100,y:80,w:300,h:100,size:72,text:'Keep my words'}),style={id:'saved',type:'text',style:extractDesignStyle(layer,720)};
  assert.equal(style.style.size,0.1);assert.ok(!('x'in style.style));
  const next=applyDesignStyle(layer,style,1080);assert.equal(next.size,108);assert.equal(next.text,layer.text);assert.equal(next.x,100);assert.equal(next.style,'saved');
  next.fill.color='#ff0000';assert.notEqual(style.style.fill.color,next.fill.color);
  for(const s of BUILTIN_DESIGN_STYLES)assert.equal(applyDesignStyle(layer,s,720).type,'text');
  const image=newLayer('image',{asset:'a'});assert.equal(applyDesignStyle(image,style,720),image);
});
test('saving a design as template strips image references and assigns reusable placeholders',()=>{
  const d=applyTemplate(fixture(),{frame:{asset:'frame'},cutout:{asset:'person',cutout:{asset:'mask',enabled:true}},title:'Project title',logo:{asset:'brand'}});
  const t=templateFromDesign(d,{name:'Reusable'});assert.equal(t.name,'Reusable');
  for(const l of t.design.layers.filter(l=>l.type==='image')){assert.equal(l.asset,null);assert.equal(l.media,null);assert.equal(l.cutout,null);assert.ok(l.placeholder);}
  const changed=applyTemplate(t,{title:'Next project',frame:{asset:'other'}});assert.equal(changed.layers.find(l=>l.placeholder==='title').text,'Next project');
});
test('template library handles concurrent duplicate names, traversal, updates and deletion safely',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'reccut-design-library-'));
  try{const library=createDesignLibrary(root,validateDesignTemplate),[a,b]=await Promise.all([library.save(fixture()),library.save(fixture())]);assert.equal(b.name,a.name+' 2');assert.notEqual(a.id,b.id);assert.equal((await library.list()).length,2);
    await assert.rejects(library.remove('../../elsewhere'),/Invalid/);
    const updated=await library.save({...a,name:'Updated'},a.id);assert.equal(updated.id,a.id);assert.equal(updated.name,'Updated');
    await library.remove(a.id);assert.equal((await library.list()).length,1);await assert.rejects(library.save(fixture(),a.id),/no longer exists/);
    await fs.writeFile(path.join(root,'design-templates','broken.json'),'not json');assert.equal((await library.list()).length,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
