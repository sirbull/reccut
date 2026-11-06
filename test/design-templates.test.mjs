import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BUILTIN_DESIGN_STYLES, BUILTIN_DESIGN_TEMPLATES, validateDesignTemplate, applyTemplate, extractDesignStyle, applyDesignStyle, templateFromDesign } from '../src/shared/designTemplates.js';
import { newLayer, layerBounds, normalizeFill } from '../src/shared/design.js';
import { longestDesignWord, layoutDesignText } from '../src/shared/designText.js';
import { styleTextRange } from '../src/shared/designRichText.js';
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
  assert.ok(BUILTIN_DESIGN_STYLES.length>=100);
  const layer=newLayer('text',{x:100,y:80,w:300,h:100,size:72,text:'Keep my words'}),style={id:'saved',type:'text',style:extractDesignStyle(layer,720)};
  assert.equal(style.style.size,0.1);assert.ok(!('x'in style.style));
  const next=applyDesignStyle(layer,style,1080);assert.equal(next.size,108);assert.equal(next.text,layer.text);assert.equal(next.x,100);assert.equal(next.style,'saved');
  next.fill.color='#ff0000';assert.notEqual(style.style.fill.color,next.fill.color);
  for(const s of BUILTIN_DESIGN_STYLES)assert.equal(applyDesignStyle(layer,s,720).type,'text');
  const image=newLayer('image',{asset:'a'});assert.equal(applyDesignStyle(image,style,720),image);
});
test('multicolor text styles emphasize the longest word with the exact preset palette',()=>{
  for(const entry of BUILTIN_DESIGN_STYLES){
    const source=newLayer('text',{text:'Min fargerike tittel!',x:37,y:42,w:900,h:300,fill:{type:'solid',color:'#123456',alpha:1}});
    const next=applyDesignStyle(source,entry,720);
    assert.equal(next.text,source.text);assert.equal(next.x,37);assert.equal(next.y,42);
    assert.deepEqual(next.fill,normalizeFill(entry.style.fill));assert.deepEqual(next.highlight,normalizeFill(entry.style.highlight));
    if(entry.style.highlight){assert.equal(next.textStyles.length,1);const range=next.textStyles[0];assert.equal(next.text.slice(range.start,range.end),'fargerike');assert.deepEqual(range.style.fill,entry.style.highlight);}
    else assert.equal(next.textStyles.length,0);
    assert.equal(source.textStyles.length,0);
    assert.deepEqual(applyDesignStyle(next,entry,720),next);
  }
});
test('applying a text style replaces old word colors and fonts so they cannot override the example',()=>{
  const entry=BUILTIN_DESIGN_STYLES[0];
  const source=styleTextRange(newLayer('text',{text:'A better title'}),0,14,{fill:{type:'solid',color:'#00ff00',alpha:1},font:'mono',size:200});
  const next=applyDesignStyle(source,entry,720);
  assert.equal(next.textStyles.length,1);assert.equal(next.text.slice(next.textStyles[0].start,next.textStyles[0].end),'better');
  assert.deepEqual(next.textStyles[0].style,{fill:entry.style.highlight});
  assert.equal(source.textStyles[0].style.fill.color,'#00ff00');
  const runs=layoutDesignText(next,s=>s.length*10).lineRuns.flat();
  assert.deepEqual(runs.map(r=>[r.text,(r.style?.fill||next.fill).color]),[['A ', '#ffe600'],['BETTER','#ff453a'],[' TITLE','#ffe600']]);
});
test('existing explicit highlights take priority over automatic word selection',()=>{
  const entry=BUILTIN_DESIGN_STYLES[1],source=newLayer('text',{text:'*Min* allerlengste tittel',w:2000,h:300});
  const next=applyDesignStyle(source,entry,720);
  assert.equal(next.text,source.text);assert.equal(next.textStyles.length,0);
  const runs=layoutDesignText(next,s=>s.length*10).lineRuns.flat();
  assert.deepEqual(runs.filter(r=>r.highlight).map(r=>r.text),['Min']);
  assert.equal(next.fill.color,'#ffffff');assert.equal(next.highlight.color,'#ff453a');
});
test('automatic emphasis counts Unicode graphemes, ignores punctuation and breaks ties consistently',()=>{
  for(const [text,expected]of[['🙂 blåbær éééé','blåbær'],['Hei,\nverden!','verden'],['first other','first'],['Solo','Solo'],['  !!! 👩‍💻 ',null],['',null]]){
    const word=longestDesignWord(text);assert.equal(word?text.slice(word.start,word.end):null,expected);
  }
  const source=newLayer('text',{text:'\\*kort\\* allerlengste',w:2000,h:300}),next=applyDesignStyle(source,BUILTIN_DESIGN_STYLES[1],720);
  const range=next.textStyles[0];assert.equal(next.text.slice(range.start,range.end),'allerlengste');
  assert.equal(applyDesignStyle(newLayer('text',{text:'!!!'}),BUILTIN_DESIGN_STYLES[1],720).textStyles.length,0);
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
