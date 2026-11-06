const dns=require('node:dns/promises');const {https}=require('../../shared/stockSources.cjs');
function privateIP(ip){return /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::|fc|fd|fe80)/i.test(ip);}
function network(fetchImpl,{lookup=dns.lookup}={}){return async function request(url,{headers={},method='GET',body,limit=2e6,hosts,timeout=15000}={}){
 let u=https(url,hosts);for(let i=0;i<5;i++){
  const addresses=await lookup(u.hostname,{all:true});if(addresses.some(a=>privateIP(a.address)))throw Error('Private network addresses are not allowed for image sources.');
  const response=await fetchImpl(u.href,{method,headers,body,redirect:'manual',signal:AbortSignal.timeout(timeout)});
  if([301,302,303,307,308].includes(response.status)){const next=https(new URL(response.headers.get('location'),u).href,hosts);if(next.origin!==u.origin)headers={};u=next;continue;}
  if(response.status===429){const error=Error('This image source reached its request limit. Try again later.');error.rateLimited=true;throw error;}
  if(!response.ok){const error=Error(`Image source returned HTTP ${response.status}.`);error.status=response.status;throw error;}
  if(Number(response.headers.get('content-length'))>limit)throw Error('Image source response is too large.');
  const chunks=[];let size=0;for await(const chunk of response.body||[]){size+=chunk.length;if(size>limit)throw Error('Image source response is too large.');chunks.push(Buffer.from(chunk));}
  return{bytes:Buffer.concat(chunks),headers:response.headers};
 }throw Error('Too many image source redirects.');};}
module.exports={network,privateIP};
