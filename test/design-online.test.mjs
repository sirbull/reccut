import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import{createRequire}from'node:module';
import{BRAND_ROLES,designBrand,brandLayer}from'../src/shared/designBrand.js';import{newLayer,solidFill}from'../src/shared/design.js';import{DESIGN_ELEMENTS,DESIGN_EMOJIS}from'../src/shared/designContent.js';import{BUILTIN_DESIGN_STYLES,DESIGN_PALETTES}from'../src/shared/designTemplates.js';
import { EXTRA_PALETTES } from '../src/shared/designLibraryExtras.js';
import { rankLibraryItems } from '../src/shared/designLibrary.js';
const require=createRequire(import.meta.url),{validateSource,mapResults,credits}=require('../src/shared/stockSources.cjs'),{createStockHost,imageType}=require('../src/main/stock'),{network}=require('../src/main/stock/network'),{pkce,signIn,client}=require('../src/main/stock/mcp'),{secrets}=require('../src/main/stock/secrets');
const manifest={format:'reccut-image-source-v1',id:'test-photos',name:'Test Photos',homepage:'https://photos.example.org',hosts:['api.example.org'],search:{url:'https://api.example.org/search?q={query}&page={page}',headers:{Authorization:'{key}'}},results:{items:'items',fields:{id:'id',preview:'preview',full:'full',author:'author',pageUrl:'page',license:'license'}}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNioAAAAASUVORK5CYII=','base64');
const row={id:'one',preview:'https://images.example.org/small.png',full:'https://images.example.org/full.png',author:'Photographer',page:'https://photos.example.org/one',license:'CC BY 4.0'};
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'reccut-stock-'));
const response=value=>({bytes:Buffer.from(JSON.stringify(value)),headers:new Headers()});
test('curated offline library retains searchable categories, distinct artwork and unique IDs', () => {
  assert.ok(BUILTIN_DESIGN_STYLES.length >= 100);
  assert.ok(DESIGN_PALETTES.length >= 40);
  const elements = new Map(DESIGN_ELEMENTS.map(e => [e.id, e]));
  for (const kind of ['shape', 'drawing', 'background', 'texture', 'sticker']) {
    assert.ok(DESIGN_ELEMENTS.some(e => e.kind === kind), `Missing ${kind} elements`);
  }
  for (const shape of ['rect', 'ellipse', 'polygon', 'star', 'line', 'arrow']) {
    assert.ok(DESIGN_ELEMENTS.some(e => e.kind === 'shape' && e.shape === shape), `Missing ${shape}`);
  }
  // Rotated copies were deliberately removed from the library. Check distinct
  // content and search coverage instead of counting those copies as variety.
  for (const [id, query] of [['arrow-block', 'block arrow'], ['price-tag', 'price tag'], ['thought', 'thought bubble'], ['cursor', 'mouse pointer'], ['paper', 'torn paper'], ['orb', 'gradient orb']]) {
    const element = elements.get(`graphic-${id}`);
    assert.ok(element?.svg, `Missing graphic ${id}`);
    assert.ok(rankLibraryItems(DESIGN_ELEMENTS, query).includes(element), `Cannot find ${query}`);
  }
  const drawings = DESIGN_ELEMENTS.filter(e => e.kind === 'drawing');
  assert.equal(new Set(drawings.map(e => e.svg)).size, drawings.length);
  for (const palette of EXTRA_PALETTES) for (const mode of ['solid', 'linear', 'radial']) {
    assert.equal(elements.get(`${mode}-${palette.id}`)?.kind, 'background');
  }
  for (const kind of ['dots', 'grid']) for (const spacing of [16, 32, 64, 96]) {
    assert.ok(rankLibraryItems(DESIGN_ELEMENTS, `${kind} ${spacing}`).includes(elements.get(`pattern-${kind}-${spacing}`)));
  }
  assert.equal(new Set(DESIGN_ELEMENTS.filter(e => e.kind === 'badge').map(e => JSON.stringify(e.badgeStyle))).size, 12);
  for (const list of [BUILTIN_DESIGN_STYLES, DESIGN_PALETTES, DESIGN_ELEMENTS]) {
    assert.equal(new Set(list.map(e => e.id)).size, list.length);
  }
});
test('brand roles affect new elements and text but preserve disabled defaults and emoji',()=>{const b=designBrand({roles:{fill:'#123456',cta:'#cc2200',title:'#abcdef'},emojiStyle:'outline'});assert.equal(b.roles.background,BRAND_ROLES.background);const l=newLayer('shape');assert.equal(brandLayer(l,b).fill.color,'#123456');const text=brandLayer(newLayer('text',{placeholder:'subtitle'}),b,{body:'serif'});assert.equal(text.font,'serif');assert.equal(brandLayer(newLayer('text',{box:{fill:solidFill('#000000')}}),b).box.fill.color,'#cc2200');const badge=brandLayer(newLayer('text',{box:{fill:solidFill('#000000')}}),designBrand());assert.equal(badge.fill.color,'#111827');assert.equal(brandLayer(newLayer('shape',{pattern:{kind:'dots'}}),b).pattern.color,b.roles.secondary);assert.equal(brandLayer(l,{enabled:false}),l);const emoji=newLayer('text',{text:'😀',emoji:{text:'😀',style:'system'}});assert.equal(brandLayer(emoji,b),emoji);});
test('OpenMoji supplies color and outline assets for most searchable emoji with license and no external SVG references',()=>{let count=0;for(const e of DESIGN_EMOJIS){const code=[...e.text].map(c=>c.codePointAt(0).toString(16).toUpperCase()).filter(c=>c!=='FE0F').join('-');if(fs.existsSync(`assets/emoji/flat/${code}.svg`)){count++;assert.ok(fs.existsSync(`assets/emoji/outline/${code}.svg`));}}assert.ok(count>3500);assert.match(fs.readFileSync('assets/licenses/OPENMOJI-LICENSE.txt','utf8'),/Attribution-ShareAlike/);for(const style of['flat','outline'])for(const file of fs.readdirSync(`assets/emoji/${style}`))assert.doesNotMatch(fs.readFileSync(`assets/emoji/${style}/${file}`,'utf8'),/<script|(?:href|src)=["']https?:|url\(https?:/i);});
test('image-source manifests reject invalid URLs, unknown placeholders, host escape and mapping injection',()=>{assert.equal(validateSource(manifest).id,'test-photos');for(const change of[{search:{url:'http://api.example.org'}},{search:{url:'https://evil.example.org'}},{search:{url:'https://api.example.org/{unknown}'}},{hosts:['localhost']},{results:{items:'items',fields:{...manifest.results.fields,provider:'evil'}}}])assert.throws(()=>validateSource({...manifest,...change}));const items=mapResults(manifest,{items:[row,{...row,id:'evil',full:'http://private.local/a.png'}]});assert.equal(items.length,1);assert.equal(items[0].provider,'test-photos');assert.match(credits(items),/Photographer \/ Test Photos/);});
test('stock search caches official responses; downloads are independent local files with credit metadata and settings block calls',async()=>{const dir=temp(),calls=[];try{const host=createStockHost({dir,cacheDir:path.join(dir,'cache'),safeStorage:{isEncryptionAvailable:()=>false},lookup:async()=>[{address:'8.8.8.8'}],env:{},fetchImpl:async(url,opts)=>{calls.push({url,opts});if(url.startsWith('https://api.example.org'))return new Response(JSON.stringify({items:[row]}));return new Response(png,{headers:{'Content-Type':'image/png'}});}});host.install(manifest);host.saveKey(manifest.id,'my-secret');const found=await host.search({provider:manifest.id,query:'nice & calm'});assert.equal(found.items.length,1);assert.equal(found.items[0].full,undefined);assert.match(calls[0].url,/nice%20%26%20calm/);await host.search({provider:manifest.id,query:'nice & calm'});assert.equal(calls.length,1);const file=await host.preview(found.items[0].token);assert.equal(imageType(fs.readFileSync(file)),'png');await host.preview(found.items[0].token);assert.equal(calls.length,2);const asset=await host.download(found.items[0].token,path.join(dir,'Designs','Assets'));assert.equal(asset.source.author,'Photographer');assert.equal(imageType(fs.readFileSync(asset.path)),'png');assert.doesNotMatch(fs.readFileSync(path.join(dir,'secrets.json'),'utf8'),/my-secret/);host.settings({enabled:false});const before=calls.length;assert.equal((await host.search({query:'x'})).disabled,true);assert.equal(calls.length,before);await assert.rejects(host.signIn('magnific'),/disabled/);await assert.rejects(host.download(found.items[0].token,dir),/disabled/);await assert.rejects(host.preview('not-a-token'),/Search again/);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('network bounds payloads, blocks private addresses and gives rate limits a safe user message',async()=>{const publicLookup=async()=>[{address:'8.8.8.8'}];await assert.rejects(network(async()=>new Response('x'),{lookup:async()=>[{address:'127.0.0.1'}]})('https://api.example.org'),/Private/);await assert.rejects(network(async()=>new Response('long'),{lookup:publicLookup})('https://api.example.org',{limit:2}),/large/);await assert.rejects(network(async()=>new Response('',{status:429}),{lookup:publicLookup})('https://api.example.org'),/request limit/);});
test('PKCE authorization uses the browser, verifies state, sends the verifier and closes its loopback listener',async()=>{const proof=pkce();assert.equal(proof.challenge,crypto.createHash('sha256').update(proof.verifier).digest('base64url'));assert.notEqual(pkce().state,proof.state);let auth,redirect,tokenBody;const request=async(url,opts)=>{if(url.includes('oauth-protected-resource'))return response({authorization_servers:['https://auth.example.org'],resource:'https://mcp.example.org'});if((url.includes('openid-configuration')||url.includes('oauth-authorization-server')))return response({authorization_endpoint:'https://auth.example.org/authorize',token_endpoint:'https://auth.example.org/token',registration_endpoint:'https://auth.example.org/register'});if(url.endsWith('/register')){redirect=JSON.parse(opts.body).redirect_uris[0];return response({client_id:'desktop'});}tokenBody=new URLSearchParams(opts.body);return response({access_token:'access',refresh_token:'refresh',expires_in:300});};const result=await signIn({server:'https://mcp.example.org'},{request,openExternal:async url=>{auth=new URL(url);const wrong=new URL(redirect);wrong.searchParams.set('state','wrong');assert.equal((await fetch(wrong)).status,400);const target=new URL(redirect);target.searchParams.set('state',auth.searchParams.get('state'));target.searchParams.set('code','code');assert.equal((await fetch(target)).status,200);}});assert.equal(result.access_token,'access');assert.equal(crypto.createHash('sha256').update(tokenBody.get('code_verifier')).digest('base64url'),auth.searchParams.get('code_challenge'));assert.equal(auth.searchParams.get('code_challenge_method'),'S256');await assert.rejects(fetch(redirect));});
test('MCP calls only declared tools, initializes once and retains tokens outside project data',async()=>{const methods=[],vault={get:()=>({access_token:'secret',expiresAt:Date.now()+1e6})};const source={id:'demo',server:'https://mcp.example.org',hosts:['mcp.example.org'],tools:{search:'stock_search',details:'stock_get',download:'stock_download'}};const c=client(source,{secrets:vault,request:async(url,opts)=>{const p=JSON.parse(opts.body);methods.push(p.method);return response({result:p.method==='tools/call'?{structuredContent:{results:[row]}}:{}})}});assert.equal((await c.call('stock_search',{query:'forest'})).results.length,1);await c.call('stock_get',{id:'one'});assert.equal(methods.filter(x=>x==='initialize').length,1);await assert.rejects(c.call('not-declared',{}),/not declared/);});

test('personal photo plugins are opt-in, configurable without JSON and cannot search before a key is saved',async()=>{
 const dir=temp(),calls=[];try{
  const h=createStockHost({dir,cacheDir:path.join(dir,'cache'),safeStorage:{isEncryptionAvailable:()=>false},lookup:async()=>[{address:'8.8.8.8'}],fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({hits:[{id:1,webformatURL:row.preview,largeImageURL:row.full,user:'Photo Author',pageURL:row.page}]}))}});
  assert.deepEqual(h.providers().map(p=>p.id),['openverse','magnific']);
  assert.deepEqual(h.settings().availablePlugins.map(p=>p.id),['pixabay-personal','pexels-personal']);
  h.addPlugin('pixabay-personal');h.addPlugin('pixabay-personal');assert.equal(h.providers().filter(p=>p.id==='pixabay-personal').length,1);
  assert.equal(h.providers().find(p=>p.id==='pixabay-personal').ready,false);assert.equal((await h.search({query:'nature',provider:'pixabay-personal'})).items.length,0);assert.equal(calls.length,0);
  h.saveKey('pixabay-personal','  own-key  ');assert.equal(h.providers().find(p=>p.id==='pixabay-personal').ready,true);
  const results=await h.search({query:'red roses',provider:'pixabay-personal'});assert.equal(results.items.length,1);assert.equal(new URL(calls[0].url).searchParams.get('key'),'own-key');assert.equal(new URL(calls[0].url).searchParams.get('q'),'red roses');
  await h.testConnection('pixabay-personal');assert.equal(calls.length,2);assert.equal(new URL(calls[1].url).searchParams.get('q'),'nature');
  assert.doesNotMatch(JSON.stringify(h.manifest('pixabay-personal')),/own-key/);assert.doesNotMatch(fs.readFileSync(path.join(dir,'sources.json'),'utf8'),/own-key/);
  h.saveKey('pixabay-personal','');assert.equal(h.providers().find(p=>p.id==='pixabay-personal').hasKey,false);await assert.rejects(h.preview(results.items[0].token),/Connect/);await assert.rejects(h.testConnection('pixabay-personal'),/Save your API key/);
  h.remove('pixabay-personal');h.addPlugin('pixabay-personal');assert.equal(h.providers().find(p=>p.id==='pixabay-personal').hasKey,false);assert.throws(()=>h.addPlugin('unsplash'),/Unknown/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('connection tests bypass cached search and reject a wrong key without exposing it in errors',async()=>{
 const dir=temp();try{
  const h=createStockHost({dir,cacheDir:path.join(dir,'cache'),safeStorage:{isEncryptionAvailable:()=>false},lookup:async()=>[{address:'8.8.8.8'}],fetchImpl:async url=>new URL(url).searchParams.get('key')==='correct'?new Response(JSON.stringify({hits:[]})):new Response('private provider error',{status:401})});
  h.addPlugin('pixabay-personal');h.saveKey('pixabay-personal','correct');assert.equal((await h.testConnection('pixabay-personal')).ok,true);
  h.saveKey('pixabay-personal','wrong-key');await assert.rejects(h.testConnection('pixabay-personal'),error=>/API key was rejected/.test(error.message)&&!error.message.includes('wrong-key'));
  assert.throws(()=>h.saveKey('pixabay-personal','a\nb'),/valid API key/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Pexels personal setup retains its app-approval gate before making any request',async()=>{
 const dir=temp(),env={},calls=[];try{
  const h=createStockHost({dir,cacheDir:path.join(dir,'cache'),env,safeStorage:{isEncryptionAvailable:()=>false},lookup:async()=>[{address:'8.8.8.8'}],fetchImpl:async(url,opts)=>{calls.push({url,opts});return new Response(JSON.stringify({photos:[]}))}});
  h.addPlugin('pexels-personal');h.saveKey('pexels-personal','pexels-own-key');const p=h.providers().find(p=>p.id==='pexels-personal');assert.equal(p.approvalRequired,true);assert.equal(p.ready,false);
  await assert.rejects(h.testConnection(p.id),/app approval/);await h.search({provider:p.id,query:'nature'});assert.equal(calls.length,0);
  env.RECCUT_PEXELS_APPROVED='1';assert.equal(h.providers().find(source=>source.id===p.id).ready,true);await h.testConnection(p.id);assert.equal(calls[0].opts.headers.Authorization,'pexels-own-key');assert.equal(new URL(calls[0].url).searchParams.has('key'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('updating a plugin destination discards credentials and old result tokens',async()=>{
 const dir=temp();try{
  const h=createStockHost({dir,cacheDir:path.join(dir,'cache'),safeStorage:{isEncryptionAvailable:()=>false},lookup:async()=>[{address:'8.8.8.8'}],fetchImpl:async()=>new Response(JSON.stringify({items:[row]}))});
  h.install(manifest);h.saveKey(manifest.id,'keep-private');const found=await h.search({provider:manifest.id,query:'nature'});
  h.install({...manifest,hosts:['other.example.org'],search:{...manifest.search,url:'https://other.example.org/search?q={query}'}});
  assert.equal(h.providers().find(p=>p.id===manifest.id).hasKey,false);await assert.rejects(h.preview(found.items[0].token),/Search again/);assert.throws(()=>h.install({...manifest,keyHelpUrl:'javascript:alert(1)'}),/HTTPS/);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('personal keys survive restart through encrypted storage and disappear on plugin removal',async()=>{
 const dir=temp(),encryptionKey=crypto.randomBytes(32);let canEncrypt=true;const storage={isEncryptionAvailable:()=>canEncrypt,encryptString(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()])},decryptString(bytes){const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString('utf8')}};
 const create=()=>createStockHost({dir,cacheDir:path.join(dir,'cache'),safeStorage:storage,fetchImpl:async()=>new Response('{}')});
 try{let h=create();h.addPlugin('pixabay-personal');h.saveKey('pixabay-personal','encrypted-personal-key');assert.doesNotMatch(fs.readFileSync(path.join(dir,'secrets.json'),'utf8'),/encrypted-personal-key/);h=create();assert.equal(h.providers().find(p=>p.id==='pixabay-personal').hasKey,true);canEncrypt=false;h.saveKey('pixabay-personal','session-only-replacement');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'secrets.json')))['pixabay-personal:key'],undefined);h=create();assert.equal(h.providers().find(p=>p.id==='pixabay-personal').hasKey,false);canEncrypt=true;h.saveKey('pixabay-personal','replacement');h.remove('pixabay-personal');h=create();h.addPlugin('pixabay-personal');assert.equal(h.providers().find(p=>p.id==='pixabay-personal').hasKey,false);}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('a paid REST image plugin waits for explicit session credit consent before search or testing',async()=>{
 const dir=temp(),calls=[];try{const h=createStockHost({dir,cacheDir:path.join(dir,'cache'),safeStorage:{isEncryptionAvailable:()=>false},lookup:async()=>[{address:'8.8.8.8'}],fetchImpl:async(url)=>{calls.push(url);return new Response(JSON.stringify({items:[row]}))}});h.install({...manifest,costsCredits:true});h.saveKey(manifest.id,'personal-key');assert.equal((await h.search({provider:manifest.id,query:'nature'})).items.length,0);await assert.rejects(h.testConnection(manifest.id),/Confirm account credit/);assert.equal(calls.length,0);h.acceptCosts(manifest.id);assert.equal((await h.search({provider:manifest.id,query:'nature'})).items.length,1);assert.equal(calls.length,1);}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
