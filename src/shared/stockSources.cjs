const key=/^[a-z][a-z0-9-]{1,70}$/;
function https(value,hosts){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.endsWith('.local')||u.hostname.startsWith('['))throw Error('Only public HTTPS URLs are supported.');if(hosts&&!hosts.includes(u.hostname))throw Error('Source URL is outside its declared hosts.');return u;}
function validateSource(raw){
 if(!raw||!['reccut-image-source-v1','reccut-mcp-source-v1'].includes(raw.format)||!key.test(raw.id)||typeof raw.name!=='string')throw Error('Invalid image source manifest.');
 if(JSON.stringify(raw).length>100000)throw Error('Image source manifest is too large.');
 const p=structuredClone(raw);p.name=p.name.slice(0,100);if(p.keyHelpUrl)https(p.keyHelpUrl);p.keyLabel=typeof p.keyLabel==='string'?p.keyLabel.slice(0,100):'API key';https(p.homepage);p.hosts=[...new Set(p.hosts||[https(p.server||p.search?.url).hostname])];
 if(p.hosts.length>20||p.hosts.some(h=>https('https://'+h).hostname!==h))throw Error('Invalid source hosts.');
 if(p.format==='reccut-mcp-source-v1'){
  https(p.server,p.hosts);for(const name of ['search','details','download'])if(!/^[\w.-]{1,120}$/.test(p.tools?.[name]||''))throw Error('Missing MCP tool name.');
 }else{
  const request=r=>{if(!r||typeof r.url!=='string')throw Error('Missing search URL.');https(r.url.replace(/\{[^}]+\}/g,'value'),p.hosts);for(const text of [r.url,...Object.values(r.headers||{})])for(const x of String(text).matchAll(/\{([^{}]+)\}/g))if(!['query','page','key','kind','id'].includes(x[1]))throw Error('Unknown source placeholder.');for(const [k,v]of Object.entries(r.headers||{}))if(!/^[\w-]+$/.test(k)||typeof v!=='string'||/[\r\n]/.test(v))throw Error('Invalid source header.');for(const [k,v]of Object.entries(r.headers||{}))if(/authorization|api.?key|token/i.test(k)&&!v.includes('{key}'))throw Error('Credentials must use the {key} placeholder.');};request(p.search);if(p.download)request(p.download);
 }
 if(Object.keys(p.results?.fields||{}).some(k=>!['id','title','preview','full','width','height','author','authorUrl','pageUrl','license','licenseVersion','licenseUrl','kind'].includes(k)))throw Error('Unknown result field.');
 if(!p.results||typeof p.results.items!=='string'||!p.results.fields?.id||!p.results.fields?.preview||!p.results.fields?.full)throw Error('Missing result mapping.');
 return p;
}
function at(value,path){if(!path)return value;return path.split('.').reduce((v,k)=>['__proto__','prototype','constructor'].includes(k)?undefined:v?.[k],value);}
function mapResults(p,data){const list=at(data,p.results.items);if(!Array.isArray(list))return[];return list.slice(0,60).flatMap(row=>{const item={provider:p.id,providerName:p.name,kind:'photo'};for(const [key,path]of Object.entries(p.results.fields))item[key]=String(at(row,path)??'').slice(0,3000);if(!item.id||!item.preview||!item.full)return[];try{https(item.preview);https(item.full);if(item.pageUrl)https(item.pageUrl);if(item.authorUrl)https(item.authorUrl);}catch{return[];}item.license=item.license||p.license||'';item.licenseUrl=item.licenseUrl||p.licenseUrl||'';if(p.id==='openverse'&&!['cc0','pdm','by','by-sa'].includes(item.license.toLowerCase()))return[];return[item];});}
function credits(items){return[...new Set(items.filter(Boolean).map(s=>`${s.title||'Image'}: ${s.author||'Unknown author'} / ${s.providerName||s.provider}${s.license?' · '+s.license+(s.licenseVersion?' '+s.licenseVersion:''):''}${s.pageUrl?'\n'+s.pageUrl:''}${s.licenseUrl?'\nLicense: '+s.licenseUrl:''}`))].join('\n\n');}
module.exports={https,validateSource,mapResults,at,credits};
