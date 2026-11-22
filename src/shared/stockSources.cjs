const key=/^[a-z][a-z0-9-]{1,70}$/;
// Media kinds a source can offer. Images go to Design and Edit, video and audio only to Edit.
const KINDS=['photo','illustration','vector','icon','video','music','sfx'];
const FIELDS=['id','title','preview','full','width','height','author','authorUrl','pageUrl','license','licenseVersion','licenseUrl','kind','durationMs'];
const mediaOf=kind=>kind==='video'?'video':kind==='music'||kind==='sfx'?'audio':'image';
function https(value,hosts){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.endsWith('.local')||u.hostname.startsWith('['))throw Error('Only public HTTPS URLs are supported.');if(hosts&&!hosts.includes(u.hostname))throw Error('Source URL is outside its declared hosts.');return u;}
// A mapping path is a dotted path or a list of them; the first non-empty value wins.
// Sources whose response shape is not documented (Magnific MCP) list the likely names.
const paths=v=>typeof v==='string'||Array.isArray(v)&&v.length&&v.length<=10&&v.every(x=>typeof x==='string');
function checkResults(r,needPreview){
 if(!r||!paths(r.items)||!r.fields||!r.fields.id||!r.fields.full||needPreview&&!r.fields.preview)throw Error('Missing result mapping.');
 for(const [k,v]of Object.entries(r.fields)){if(!FIELDS.includes(k))throw Error('Unknown result field.');if(!paths(v))throw Error('Invalid result mapping.');}
}
function validateSource(raw){
 if(!raw||!['reccut-image-source-v1','reccut-mcp-source-v1'].includes(raw.format)||!key.test(raw.id)||typeof raw.name!=='string')throw Error('Invalid image source manifest.');
 if(JSON.stringify(raw).length>100000)throw Error('Image source manifest is too large.');
 const p=structuredClone(raw);p.name=p.name.slice(0,100);if(p.keyHelpUrl)https(p.keyHelpUrl);p.keyLabel=typeof p.keyLabel==='string'?p.keyLabel.slice(0,100):'API key';https(p.homepage);p.hosts=[...new Set(p.hosts||[https(p.server||p.search?.url).hostname])];
 if(p.hosts.length>20||p.hosts.some(h=>https('https://'+h).hostname!==h))throw Error('Invalid source hosts.');
 if(p.kinds!==undefined&&(!Array.isArray(p.kinds)||!p.kinds.length||p.kinds.some(k=>!KINDS.includes(k))))throw Error('Unknown media kind.');
 if(p.format==='reccut-mcp-source-v1'){
  https(p.server,p.hosts);for(const name of ['search','details','download'])if(!/^[\w.-]{1,120}$/.test(p.tools?.[name]||''))throw Error('Missing MCP tool name.');
  if(p.searches)throw Error('MCP sources use kinds and contentTypes.');
  for(const [k,v]of Object.entries(p.contentTypes||{}))if(!KINDS.includes(k)||!/^[\w-]{1,40}$/.test(v))throw Error('Invalid content type.');
 }else{
  const request=r=>{if(!r||typeof r.url!=='string')throw Error('Missing search URL.');https(r.url.replace(/\{[^}]+\}/g,'value'),p.hosts);for(const text of [r.url,...Object.values(r.headers||{})])for(const x of String(text).matchAll(/\{([^{}]+)\}/g))if(!['query','page','key','kind','id'].includes(x[1]))throw Error('Unknown source placeholder.');for(const [k,v]of Object.entries(r.headers||{}))if(!/^[\w-]+$/.test(k)||typeof v!=='string'||/[\r\n]/.test(v))throw Error('Invalid source header.');for(const [k,v]of Object.entries(r.headers||{}))if(/authorization|api.?key|token/i.test(k)&&!v.includes('{key}'))throw Error('Credentials must use the {key} placeholder.');};request(p.search);if(p.download)request(p.download);
  for(const [k,s]of Object.entries(p.searches||{})){if(!KINDS.includes(k))throw Error('Unknown media kind.');request(s?.search);checkResults(s.results,mediaOf(k)!=='audio');}
 }
 checkResults(p.results,true);
 return p;
}
function at(value,path){if(!path)return value;return path.split('.').reduce((v,k)=>['__proto__','prototype','constructor'].includes(k)?undefined:v?.[k],value);}
function pick(value,list){for(const path of [].concat(list)){const v=at(value,path);if(v!==undefined&&v!==null&&v!==''&&typeof v!=='object')return v;if(Array.isArray(v))return v;}}
function mapResults(p,data,{results=p.results,kind='photo'}={}){
 const media=mediaOf(kind),list=Array.isArray(data)?data:pick(data,results.items);if(!Array.isArray(list))return[];
 return list.slice(0,60).flatMap(row=>{const item={provider:p.id,providerName:p.name,kind,media};for(const [key,path]of Object.entries(results.fields)){const v=pick(row,path);item[key]=Array.isArray(v)?'':String(v??'').slice(0,3000);}
  item.kind=kind;if(!item.id||!item.full||!item.preview&&media!=='audio')return[];try{if(item.preview)https(item.preview);https(item.full);if(item.pageUrl)https(item.pageUrl);if(item.authorUrl)https(item.authorUrl);}catch{return[];}
  item.license=item.license||p.license||'';item.licenseUrl=item.licenseUrl||p.licenseUrl||'';if(p.id==='openverse'&&!['cc0','pdm','by','by-sa'].includes(item.license.toLowerCase()))return[];return[item];});
}
function credits(items){return[...new Set(items.filter(Boolean).map(s=>`${s.title||'Image'}: ${s.author||'Unknown author'} / ${s.providerName||s.provider}${s.license?' · '+s.license+(s.licenseVersion?' '+s.licenseVersion:''):''}${s.pageUrl?'\n'+s.pageUrl:''}${s.licenseUrl?'\nLicense: '+s.licenseUrl:''}`))].join('\n\n');}
module.exports={https,validateSource,mapResults,at,credits,KINDS,mediaOf};
