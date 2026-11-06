const fs=require('fs');
const path=require('path');
const retained=new Map(),created=new Set();
let collected=()=>{};
const owned=(file)=>typeof file==='string'&&path.isAbsolute(file)&&path.basename(path.dirname(file))==='Cutouts'&&/^reccut-cutout-[a-z0-9_-]+(?: \d+)?\.png$/i.test(path.basename(file));
function retain(id,paths){if(typeof id!=='string'||!Array.isArray(paths))return;retained.set(id,new Set(paths.filter(owned).map(p=>path.resolve(p))));}
function register(file){if(owned(file))created.add(path.resolve(file));return file;}
async function discard(file){const target=path.resolve(String(file));if(!created.has(target)||[...retained.values()].some(set=>set.has(target)))return false;await fs.promises.unlink(target).catch(err=>{if(err.code!=='ENOENT')throw err;});created.delete(target);return true;}
function referenced(project,projectFile){const ids=new Set(),out=new Set();for(const d of Object.values(project.designs||{}))for(const l of d.layers||[])for(const id of[l.asset,l.cutout?.asset,l.mask?.asset])if(id)ids.add(id);for(const id of ids){const a=project.designAssets?.[id];if(a){const file=a.rel?path.resolve(path.dirname(projectFile),a.rel):a.path;if(owned(file))out.add(path.resolve(file));}}return out;}
async function plan(project,file,history){
  const root=path.join(path.dirname(file),'Designs','Cutouts'),keep=new Set([...referenced(project,file),...[...retained.values()].flatMap(set=>[...set])]);
  // Persistent snapshots and neighbouring documents can share an asset. If any
  // reference cannot be inspected, defer cleanup rather than risking a file.
  const documents=[file];
  try{
    for(const entry of await fs.promises.readdir(path.dirname(file)))if(/\.(reccut|obslite)$/i.test(entry)&&path.join(path.dirname(file),entry)!==file){const docFile=path.join(path.dirname(file),entry),p=JSON.parse(await fs.promises.readFile(docFile,'utf8'));for(const pth of referenced(p,docFile))keep.add(pth);documents.push(docFile);}
    for(const docFile of documents)for(const item of await history.list(docFile)){const p=await history.read(item.file);for(const pth of referenced(p,docFile))keep.add(pth);}
  }catch{return {commit:async()=>{}};}
  const candidates=[];
  for(const [id,a]of Object.entries(project.designAssets||{}))if(a.origin==='cutout'&&owned(a.path)&&path.dirname(path.resolve(a.path))===root&&!keep.has(path.resolve(a.path))){candidates.push({id,path:a.path});delete project.designAssets[id];}
  return {commit:async()=>{for(const a of candidates){await fs.promises.unlink(a.path).catch(()=>{});created.delete(path.resolve(a.path));}if(candidates.length)collected({projectId:project.id,assetIds:candidates.map(a=>a.id)});}};
}
module.exports={retain,register,discard,plan,referenced,onCollected:(fn)=>{collected=fn;}};
