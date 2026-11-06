import { toast } from '../ui.jsx';
export async function startExportWithThumbnail(p,settings,thumbnailId=null,{api=window.api,encode}={}){
 let bytes=null;
 if(thumbnailId){const d=p.designs?.[thumbnailId];if(!d)throw Error('Choose an available design for the thumbnail.');const encoder=encode||(await import('./export.js')).encodeDesignImage;const blob=await encoder(d,{format:'jpeg',transparent:false,sourceProject:p});bytes=new Uint8Array(await blob.arrayBuffer());}
 if(!bytes)return api.startExport({project:p,settings});
 let id=null,finished=false;const early=[],cleanup=[];
 const stop=()=>{if(finished)return;finished=true;cleanup.forEach(off=>off());bytes=null;};
 const done=async result=>{
  if(id===null){early.push(result);return;}if(finished||result.id!==id)return;
  const image=bytes;stop();
  try{const file=await api.writeVideoThumbnail(result.file,image);toast(`Thumbnail saved: ${file.split(/[\\/]/).pop()}`,{kind:'success'});}
  catch(err){toast(`Video exported, but its thumbnail could not be saved: ${/EEXIST/.test(err.message)?'A JPEG with the same name already exists.':/ENOSPC/.test(err.message)?'There is not enough free space.':/EACCES|EPERM|EROFS/.test(err.message)?'The output folder is read only.':err.message}`,{kind:'error'});}
 };
 cleanup.push(api.onExportDone(done));
 cleanup.push(api.onTasks(tasks=>{const task=tasks.find(t=>t.id===id);if(task&&['canceled','error'].includes(task.state))stop();}));
 try{id=await api.startExport({project:p,settings});early.forEach(done);return id;}catch(err){stop();throw err;}
}
