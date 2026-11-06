const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
function createDesignLibrary(root,validate) {
  const directory=path.join(root,'design-templates');
  const fileFor=(id)=>{if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new Error('Invalid template id.');return path.join(directory,`${id}.json`);};
  let queue=Promise.resolve();
  const list=async()=>{
    let files;try{files=await fs.promises.readdir(directory);}catch(err){if(err.code==='ENOENT')return [];throw err;}
    const templates=[];
    for(const file of files.filter(f=>/^[a-zA-Z0-9_-]{1,100}\.json$/.test(f)).sort())try{const value=validate(JSON.parse(await fs.promises.readFile(path.join(directory,file),'utf8')));templates.push({...value,id:file.slice(0,-5)});}catch{}
    return templates;
  };
  const save=(data,updateId=null)=>{
    const run=async()=>{
      const template=validate(data),existing=await list();
      if(updateId&&!existing.some(t=>t.id===updateId))throw new Error('The template no longer exists.');
      const names=new Set(existing.filter(t=>t.id!==updateId).map(t=>t.name.toLocaleLowerCase()));
      const base=template.name;let n=2;while(names.has(template.name.toLocaleLowerCase()))template.name=`${base} ${n++}`;
      template.id=updateId||crypto.randomUUID();const target=fileFor(template.id),temporary=target+'.tmp';
      await fs.promises.mkdir(directory,{recursive:true});await fs.promises.writeFile(temporary,JSON.stringify(template));await fs.promises.rename(temporary,target);return template;
    };
    const result=queue.then(run,run);queue=result.catch(()=>{});return result;
  };
  const remove=async(id)=>{const target=fileFor(id);const trash=path.join(directory,'.trash');await fs.promises.mkdir(trash,{recursive:true});await fs.promises.rename(target,path.join(trash,`${id}-${Date.now()}.json`));};
  const brand=path.join(root,'brand'),brandFile=path.join(brand,'logo.json');
  const logo=async()=>{try{const value=JSON.parse(await fs.promises.readFile(brandFile,'utf8'));if(typeof value.file!=='string'||!/^logo-[a-zA-Z0-9-]+\.(png|jpe?g|webp|svg|gif|bmp)$/i.test(value.file))return null;const target=path.join(brand,value.file);await fs.promises.access(target);return {path:target,name:value.name||'My Logo'};}catch{return null;}};
  const setLogo=async(source)=>{
    if(typeof source!=='string'||!path.isAbsolute(source)||!/^\.(png|jpe?g|webp|svg|gif|bmp)$/i.test(path.extname(source)))throw new Error('Choose a PNG, JPEG, WebP, SVG, GIF or BMP logo.');
    await fs.promises.mkdir(brand,{recursive:true});const old=await logo(),file=`logo-${crypto.randomUUID()}${path.extname(source).toLowerCase()}`;
    await fs.promises.copyFile(source,path.join(brand,file),fs.constants.COPYFILE_EXCL);
    await fs.promises.writeFile(brandFile+'.tmp',JSON.stringify({file,name:path.basename(source)}));await fs.promises.rename(brandFile+'.tmp',brandFile);
    if(old)await fs.promises.unlink(old.path).catch(()=>{});return logo();
  };
  return {list,save,remove,logo,setLogo};
}
module.exports={createDesignLibrary};
