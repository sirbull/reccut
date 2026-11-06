const fs=require('node:fs'),path=require('node:path');
function secrets(dir,safeStorage){let data={};const memory=new Map(),file=path.join(dir,'secrets.json');try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
 const encrypted=()=>safeStorage?.isEncryptionAvailable()&&safeStorage.getSelectedStorageBackend?.()!=='basic_text';
 return{get(id){if(memory.has(id))return memory.get(id);try{return data[id]&&encrypted()?JSON.parse(safeStorage.decryptString(Buffer.from(data[id],'base64'))):null;}catch{return null;}},set(id,value){if(value===null){memory.delete(id);delete data[id];}else{memory.set(id,value);if(encrypted())data[id]=safeStorage.encryptString(JSON.stringify(value)).toString('base64');else delete data[id];}fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(data),{mode:0o600});}};
}
module.exports={secrets};
