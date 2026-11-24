const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateSource,mapResults,https,credits,KINDS,pick}=require('../../shared/stockSources.cjs');
const builtins=require('./builtins'),availablePlugins=require('./availablePlugins'),{network}=require('./network'),{secrets:secretStore}=require('./secrets'),mcp=require('./mcp');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex'),DAY=86400000;
const DEFAULT_TEMPLATE_CATALOG='https://sirbull.github.io/reccut/design-catalog/index.json';
function imageType(bytes){if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'png';if(bytes[0]===255&&bytes[1]===216)return'jpg';if(bytes.toString('ascii',0,3)==='GIF')return'gif';if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return'webp';throw Error('The source did not return a supported PNG, JPEG, GIF or WebP image.');}
function mediaType(b){
 try{return{ext:imageType(b),media:'image'};}catch{}
 if(b.length<12)throw Error('The source returned an empty file.');const a=(s,e)=>b.toString('ascii',s,e);
 if(/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(b.subarray(0,2048).toString('utf8')))return{ext:'svg',media:'image'};
 if(a(4,8)==='ftyp'){const brand=a(8,12);return brand.startsWith('M4A')?{ext:'m4a',media:'audio'}:brand==='qt  '?{ext:'mov',media:'video'}:{ext:'mp4',media:'video'};}
 if(b.readUInt32BE(0)===0x1a45dfa3)return{ext:'webm',media:'video'};
 if(a(0,3)==='ID3'||b[0]===0xff&&(b[1]&0xe0)===0xe0)return{ext:'mp3',media:'audio'};
 if(a(0,4)==='OggS')return{ext:'ogg',media:'audio'};
 if(a(0,4)==='RIFF'&&a(8,12)==='WAVE')return{ext:'wav',media:'audio'};
 if(a(0,4)==='fLaC')return{ext:'flac',media:'audio'};
 if(a(0,2)==='PK')throw Error('This item downloads as a ZIP archive, which Reccut cannot place directly. Open its source page to get the files.');
 throw Error('The source did not return a supported image, video or audio file.');
}
// ponytail: whole files are held in memory; stream to disk if stock videos above a few hundred MB are needed.
const LIMIT={image:25e6,audio:80e6,video:300e6};
// The signed file URL in an MCP download result. Its field name is not documented.
function fileUrl(v,depth=0){if(!v||typeof v!=='object'||depth>3)return;for(const k of ['download_url','signed_url','url'])if(typeof v[k]==='string'&&v[k].startsWith('https://'))return v[k];for(const x of Object.values(v)){const u=fileUrl(x,depth+1);if(u)return u;}}
function createStockHost({dir,cacheDir,fetchImpl,safeStorage,openExternal,env=process.env,lookup}){
 fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(cacheDir,{recursive:true});for(const file of fs.readdirSync(cacheDir)){try{const p=path.join(cacheDir,file),s=fs.statSync(p);if(s.isFile()&&Date.now()-s.mtimeMs>DAY)fs.unlinkSync(p);}catch{}};const vault=secretStore(dir,safeStorage),request=network(fetchImpl,{lookup}),items=new Map(),clients=new Map(),listened=new Map(),pending=new Map(),cooldown=new Map(),inflight=new Map();
 const read=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));}catch{return fallback;}};
 // An explicitly saved empty catalog disables it; never replace a user's URL.
 let config={enabled:true,sources:{},catalog:DEFAULT_TEMPLATE_CATALOG,...read('settings.json',{})},plugins=read('sources.json',[]).flatMap(p=>{try{return[validateSource(availablePlugins.find(a=>a.id===p.id)||p)];}catch{return[];}});
 // Credit consent is remembered until sign-out, so Magnific keeps working after a restart.
 const accepted={has:id=>!!config.costsAccepted?.[id],set(id,on){const costsAccepted={...config.costsAccepted};if(on)costsAccepted[id]=true;else delete costsAccepted[id];config={...config,costsAccepted};fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(config));}};
 const kindsOf=p=>[...new Set([...(p.kinds||['photo']),...Object.keys(p.searches||{})])];
 const plan=(p,kind)=>p.searches?.[kind]||((p.kinds||['photo']).includes(kind)?{search:p.search,results:p.results}:null);
 const sources=()=>[...builtins,...plugins];const source=id=>{const p=sources().find(p=>p.id===id);if(!p)throw Error('Image source not found.');return p;};
 const key=p=>builtins.includes(p)?'':vault.get(p.id+':key')||'';
 const requiresKey=p=>p.format!=='reccut-mcp-source-v1'&&JSON.stringify(p.search).includes('{key}');
 const approvalReady=p=>!p.hosts.includes('api.pexels.com')||env.RECCUT_PEXELS_APPROVED==='1';
 const ready=p=>approvalReady(p)&&(p.format==='reccut-mcp-source-v1'?!!vault.get(p.id+':oauth'):!requiresKey(p)||!!key(p));
 const enabled=p=>config.enabled!==false&&config.sources?.[p.id]!==false;
 function providers(){return sources().map(p=>({id:p.id,name:p.name,homepage:p.homepage,enabled:enabled(p),plugin:!builtins.includes(p),keyLabel:p.keyLabel||'API key',keyHelpUrl:p.keyHelpUrl,requiresKey:requiresKey(p),hasKey:!!key(p),signIn:p.format==='reccut-mcp-source-v1',signedIn:!!vault.get(p.id+':oauth'),costsCredits:!!p.costsCredits,costAccepted:accepted.has(p.id),approvalRequired:!approvalReady(p),ready:ready(p),kinds:kindsOf(p)}));}
 function settings(patch){if(patch){const next={...config,enabled:patch.enabled??config.enabled,sources:{...config.sources,...patch.sources},catalog:patch.catalog??config.catalog??''};if(next.catalog)https(next.catalog);config=next;fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(config));}return{...config,providers:providers(),availablePlugins:availablePlugins.map(p=>({id:p.id,name:p.name,description:p.description,kinds:kindsOf(p),homepage:p.homepage,keyHelpUrl:p.keyHelpUrl,approvalRequired:!approvalReady(p),installed:plugins.some(installed=>installed.id===p.id)}))};}
 function cacheJSON(name,run){const file=path.join(cacheDir,hash(name)+'.json');try{const x=JSON.parse(fs.readFileSync(file,'utf8'));if(Date.now()-x.time<DAY)return Promise.resolve(x.value);}catch{}if(inflight.has(name))return inflight.get(name);const promise=run().then(value=>{fs.writeFileSync(file,JSON.stringify({time:Date.now(),value}));return value;}).finally(()=>inflight.delete(name));inflight.set(name,promise);return promise;}
 function expand(value,vars){return value.replace(/\{(query|page|key|kind|id)\}/g,(_,k)=>encodeURIComponent(vars[k]||''));}
 async function rest(p,spec,vars){vars={...vars,query:String(vars.query||'').slice(0,p.hosts.includes('pixabay.com')?100:200)};const headers=Object.fromEntries(Object.entries(spec.headers||{}).map(([k,v])=>[k,v.replace(/\{key\}/g,vars.key||'')]));return JSON.parse((await request(expand(spec.url,vars),{headers,hosts:p.hosts})).bytes.toString('utf8'));}
 function mc(p){if(!clients.has(p.id))clients.set(p.id,mcp.client(p,{request,secrets:vault}));return clients.get(p.id);}
 // The content-type filter name is not documented; without it the search still runs, unfiltered.
 async function mcpSearch(p,query,page,kind){const type=p.contentTypes?.[kind],args={query,page,per_page:20};if(!type)return mc(p).call(p.tools.search,args);try{return await mc(p).call(p.tools.search,{...args,content_type:type});}catch(error){if(error.rateLimited||/Sign in/.test(error.message))throw error;return mc(p).call(p.tools.search,args);}}
 async function search({query='',page=1,kind='photo',provider}={}){
  if(config.enabled===false)return{items:[],disabled:true};if(!KINDS.includes(kind))kind='photo';query=String(query).trim().slice(0,200);page=Math.max(1,Math.min(100,Math.trunc(Number(page))||1));if(!query)return{items:[]};let succeeded=0,limited=false;
  const results=await Promise.all(sources().filter(p=>enabled(p)&&(!provider||p.id===provider)).map(async p=>{
   const spec=plan(p,kind);if(!spec||!ready(p)||p.costsCredits&&!accepted.has(p.id))return[];
   if((cooldown.get(p.id)||0)>Date.now()){limited=true;return[];}
   try{const rows=await cacheJSON(`${p.id}:${hash(JSON.stringify(p))}:${query}:${page}:${kind}`,async()=>mapResults(p,p.format==='reccut-mcp-source-v1'?await mcpSearch(p,query,page,kind):await rest(p,spec.search,{query,page,key:key(p),kind}),{results:spec.results,kind}));succeeded++;return rows.map(row=>{const token=hash(p.id+':'+row.id+':'+row.full);items.set(token,{...row,token});return{...row,full:undefined,videoPreview:undefined,token};});}catch(error){if(error.rateLimited){limited=true;cooldown.set(p.id,Date.now()+60000);}return[];}
  }));return{items:results.flat(),more:results.some(r=>r.length>=20),offline:!succeeded,rateLimited:limited};
 }
 const item=token=>{const row=items.get(token);if(!row)throw Error('Search again before using this image.');const p=source(row.provider);if(!enabled(p))throw Error('This image source is disabled.');if(!ready(p))throw Error('Connect this image source before using it.');return row;};
 async function preview(token){const row=item(token);if(!row.preview)throw Error('This item has no preview image.');const file=path.join(cacheDir,token+'.preview');if(fs.existsSync(file)&&Date.now()-fs.statSync(file).mtimeMs<DAY)return file;const response=await request(row.preview,{limit:3e6});imageType(response.bytes);fs.writeFileSync(file,response.bytes);return file;}
 // Preview files are separate from originals and never enter project media.
 // Coalesce clicks from multiple cards/windows; only publish a complete, validated video.
 async function videoPreview(token){
  const row=item(token),p=source(row.provider);
  if(row.media!=='video')throw Error('Only videos can be previewed here.');
  if(p.costsCredits&&!accepted.has(p.id))throw Error('Confirm account credit use before previewing.');
  const cacheKey='video-preview:'+token;
  if(inflight.has(cacheKey))return inflight.get(cacheKey);
  const promise=(async()=>{
   const prefix=token+'.video-preview.';
   const cached=fs.readdirSync(cacheDir).find(name=>name.startsWith(prefix)&&/\.(mp4|mov|webm)$/.test(name));
   if(cached){const file=path.join(cacheDir,cached);if(Date.now()-fs.statSync(file).mtimeMs<DAY)return file;}
   let url=row.videoPreview;
   if(!url&&p.format==='reccut-mcp-source-v1'){
    // Inspect details for a preview; never invoke the licensed-original download tool.
    const data=await mc(p).call(p.tools.details,{id:row.id,type:p.contentTypes?.video||'video'});
    const find=(value,depth=0)=>{
     if(!value||typeof value!=='object'||depth>3)return;
     const found=p.results.fields.videoPreview&&pick(value,p.results.fields.videoPreview);
     if(typeof found==='string'&&found)return found;
     for(const child of Object.values(value)){const result=find(child,depth+1);if(result)return result;}
    };
    url=find(data);
   }
   // Legacy REST sources may only offer a single video rendition.
   if(!url&&p.format!=='reccut-mcp-source-v1'&&!p.download)url=row.full;
   if(!url)throw Error('This service did not provide a video preview. Open the source page to preview this video.');
   const {bytes}=await request(url,{limit:80e6,timeout:120000}),type=mediaType(bytes);
   if(type.media!=='video')throw Error('The source did not return a playable video preview.');
   item(token); // The service may have been disabled while downloading.
   const file=path.join(cacheDir,prefix+type.ext);
   fs.writeFileSync(file,bytes);
   return file;
  })().finally(()=>inflight.delete(cacheKey));
  inflight.set(cacheKey,promise);return promise;
 }
 // Audio is fetched once to listen to it; Use then reuses that file.
 async function listen(token){const row=item(token);if(row.media!=='audio')throw Error('Only audio can be played here.');const cached=listened.get(token);if(cached&&fs.existsSync(cached))return cached;const bytes=(await request(row.full,{limit:LIMIT.audio,timeout:120000})).bytes,type=mediaType(bytes);if(type.media!=='audio')throw Error('The source did not return an audio file.');const file=path.join(cacheDir,`${token}.${type.ext}`);fs.writeFileSync(file,bytes);listened.set(token,file);return file;}
 async function download(token,dir){const row=item(token),p=source(row.provider),media=row.media||'image';let url=row.full,bytes;
  if(p.costsCredits&&!accepted.has(p.id))throw Error('Confirm account credit use before downloading.');
  // ponytail: `type` is only sent for video and icons, where the Magnific catalogue is separate. Unverified without an account.
  if(p.format==='reccut-mcp-source-v1'){const type=['video','icon'].includes(row.kind)?p.contentTypes?.[row.kind]:undefined;url=fileUrl(await mc(p).call(p.tools.download,{id:row.id,...(type?{type}:{})}));if(!url)throw Error('The stock download tool did not return a file URL.');}
  else if(p.download){const r=await rest(p,p.download,{id:row.id,key:key(p)});url=r.url||r.download_url;}
  const cached=listened.get(token);if(cached&&fs.existsSync(cached))bytes=fs.readFileSync(cached);else bytes=(await request(url,{limit:LIMIT[media],timeout:media==='image'?60000:600000})).bytes;
  const type=mediaType(bytes),noun=m=>m==='image'?'an image':`a ${m} file`;if(type.media!==media)throw Error(`The source returned ${noun(type.media)} instead of ${noun(media)}.`);
  fs.mkdirSync(dir,{recursive:true});const name=row.title||`${p.name} ${media==='audio'?(row.kind==='music'?'music':'sound'):media}`,base=name.replace(/[^\p{L}\p{N} _-]+/gu,' ').replace(/\s+/g,' ').trim().slice(0,60)||'Stock';const file=path.join(dir,`${base} - ${p.name} ${crypto.randomUUID().slice(0,8)}.${type.ext}`);fs.writeFileSync(file,bytes);const {full,preview,videoPreview:unusedPreview,token:unused,...metadata}=row;return{path:file,source:metadata,name};
 }
 function install(raw){const p=validateSource(raw);if(builtins.some(b=>b.id===p.id))throw Error('A plugin cannot replace a built-in source.');delete p.appKey;if(plugins.length>=50&&!plugins.some(s=>s.id===p.id))throw Error('Remove an unused image source first.');const previous=plugins.find(s=>s.id===p.id),destination=x=>JSON.stringify([x.format,x.hosts,x.search,x.download,x.server]);if(previous&&destination(previous)!==destination(p)){vault.set(p.id+':key',null);vault.set(p.id+':oauth',null);pending.get(p.id)?.abort();clients.delete(p.id);for(const [token,row]of items)if(row.provider===p.id)items.delete(token);}plugins=plugins.filter(s=>s.id!==p.id).concat(p);fs.writeFileSync(path.join(dir,'sources.json'),JSON.stringify(plugins));return settings();}
 async function testConnection(id){const p=source(id);if(!enabled(p))throw Error('Online resources are disabled.');if(!approvalReady(p))throw Error('Pexels app approval is required before connecting this source.');if(!ready(p))throw Error('Save your API key first.');if(p.format==='reccut-mcp-source-v1')throw Error('Use Sign In for this source.');if(p.costsCredits&&!accepted.has(id))throw Error('Confirm account credit use before testing.');try{const data=await rest(p,p.search,{query:'nature',page:1,key:key(p),kind:'photo'});const rows=require('../../shared/stockSources.cjs').at(data,p.results.items);if(!Array.isArray(rows))throw Error('The source did not return the expected image results.');return{ok:true,name:p.name,count:rows.length};}catch(error){if(error.status===401||error.status===403||error.status===400&&p.hosts.includes('pixabay.com'))throw Error('The API key was rejected. Check it and try again.');if(error.rateLimited)cooldown.set(id,Date.now()+60000);throw error;}}
 async function catalog(){if(config.enabled===false||!config.catalog)return[];try{return await cacheJSON('catalog:'+config.catalog,async()=>{const raw=JSON.parse((await request(config.catalog)).bytes.toString());const entries=Array.isArray(raw)?raw:raw.items;if(!Array.isArray(entries))throw Error();return entries.slice(0,200).flatMap(e=>{try{const url=https(new URL(e.url,config.catalog).href).href,preview=https(new URL(e.preview,config.catalog).href).href;return[{id:hash(url),name:String(e.name).slice(0,160),url,preview,ratio:e.ratio,tags:(e.tags||[]).slice(0,20)}];}catch{return[];}});});}catch{return[];}}
 async function catalogFile(id){const entry=(await catalog()).find(e=>e.id===id);if(!entry)throw Error('Refresh the template catalog.');const raw=JSON.parse((await request(entry.url)).bytes.toString());const {validateDesignTemplate}=require(path.join(__dirname,'../../../build/designTemplates.cjs'));return validateDesignTemplate(raw);}
 return{settings,providers,search,preview,videoPreview,listen,download,catalog,catalogFile,credits,testConnection,
  addPlugin(id){const p=availablePlugins.find(p=>p.id===id);if(!p)throw Error('Unknown image source plugin.');return install(p);},
  catalogPreview:async id=>{const entry=(await catalog()).find(e=>e.id===id);if(!entry)throw Error('Template not found.');const file=path.join(cacheDir,id+'.catalog');if(fs.existsSync(file)&&Date.now()-fs.statSync(file).mtimeMs<DAY)return file;const r=await request(entry.preview,{limit:3e6});imageType(r.bytes);fs.writeFileSync(file,r.bytes);return file;},
  install,manifest:id=>structuredClone(source(id)),remove(id){if(builtins.some(p=>p.id===id))throw Error('Built-in sources cannot be removed.');pending.get(id)?.abort();clients.delete(id);accepted.set(id,false);plugins=plugins.filter(p=>p.id!==id);vault.set(id+':key',null);vault.set(id+':oauth',null);fs.writeFileSync(path.join(dir,'sources.json'),JSON.stringify(plugins));return settings();},
  saveKey(id,value){const p=source(id);if(builtins.includes(p))throw Error('This source does not use a personal API key.');if(typeof value!=='string'||value.length>2000||/[\x00-\x1f\x7f]/.test(value))throw Error('Enter a valid API key.');vault.set(id+':key',value.trim()||null);return settings();},
  acceptCosts(id){source(id);accepted.set(id,true);return settings();},
  async signIn(id){const p=source(id);if(!enabled(p))throw Error('Online resources are disabled.');if(p.format!=='reccut-mcp-source-v1')throw Error('This source uses an API key.');pending.get(id)?.abort();const controller=new AbortController();pending.set(id,controller);try{vault.set(id+':oauth',await mcp.signIn(p,{request,openExternal,signal:controller.signal}));clients.delete(id);return settings();}finally{pending.delete(id);}},
  signOut(id){pending.get(id)?.abort();vault.set(id+':oauth',null);clients.delete(id);accepted.set(id,false);return settings();}
 };
}
module.exports={createStockHost,imageType,mediaType};
