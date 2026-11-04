import { signal, effect } from '@preact/signals';
import { prefs, setPrefs } from '../prefs.js';
import { project, projectEpoch, room } from '../editor/store.js';
import { currentDesign, selectedLayers, changeDesign, designCommit, openDesign, selection } from './store.js';
import { newDesign, newLayer, fitBox, solidFill } from '../../shared/design.js';
import { extractDesignStyle, applyDesignStyle, applyTemplate, templateFromDesign, validateDesignTemplate } from '../../shared/designTemplates.js';
import { ensureImage, designDir, getImage, getImageAtPath, placeFiles, placeProjectImage, openImageFiles } from './assets.js';
import { uid } from '../../shared/model.js';
import { brandLogo } from './brand.js';
import { toast } from '../ui.jsx';

export const userTemplates=signal([]),styleDialog=signal(null),templateDialog=signal(null);
export const savedStyles=()=>Array.isArray(prefs.value.designStyles)?prefs.value.designStyles.filter(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&['text','shape','image'].includes(s.type)&&s.style).slice(0,500):[];
export function storeStyles(styles){try{localStorage.setItem('prefs',JSON.stringify({...prefs.value,designStyles:styles}));}catch{toast('Could not save styles. Free some space or remove unused styles.',{kind:'error'});return false;}setPrefs({designStyles:styles});return true;}
export function openSaveStyle(){const l=selectedLayers()[0];if(!l)return;if(savedStyles().length>=500)return toast('You can save up to 500 styles. Remove a style before adding another.');styleDialog.value={layer:l,designHeight:currentDesign.value.height,name:l.name};}
export function saveStyle(name){const s=styleDialog.value;if(!s||!name.trim())return;const list=savedStyles();if(list.length>=500){toast('You can save up to 500 styles.');return;}if(storeStyles([...list,{id:uid(),name:name.trim().slice(0,160),type:s.layer.type,style:extractDesignStyle(s.layer,s.designHeight)}]))styleDialog.value=null;}
// Explicit drop targets never fall back to unrelated selected layers.
function styleTargets(style,d,target){if(target)return new Set(target.type===style.type&&!target.locked?[target.id]:[]);const picked=selectedLayers().filter(l=>l.type===style.type);return new Set((selection.value.length?picked:d.layers.filter(l=>l.type===style.type&&!l.locked)).map(l=>l.id));}
export function applyStyle(style,target=null){clearLibraryPreview();let d=currentDesign.value;if(!d){if(style.type==='image'){toast('Import an image before applying an image style.');return;}d=newDesign({name:`${project.value.name} Thumbnail`});const l=newLayer(style.type,{x:d.width*.1,y:d.height*.3,w:d.width*.8,h:d.height*.4,text:project.value.name,size:d.height*.14});d.layers=[applyDesignStyle(l,style,d.height)];designCommit(p=>{p.designs[d.id]=d});openDesign(d.id);selection.value=[l.id];return;}const ids=styleTargets(style,d,target);if(target&&!ids.size){toast('Drop this style on an unlocked layer of the same type.');return;}changeDesign(d=>{for(const l of d.layers)if(ids.has(l.id))Object.assign(l,applyDesignStyle(l,style,d.height));});}
export const libraryPreview=signal(null),libraryPreviewImages=signal({}),selectedLibraryCard=signal(null);
let previewBase=null,previewSelection=null,previewVersion=0,dragged=null;
export function clearLibraryPreview(){previewVersion++;previewBase=null;previewSelection=null;libraryPreview.value=null;libraryPreviewImages.value={};}
export function showLibraryPreview(design,images={}){previewVersion++;previewBase=currentDesign.value;previewSelection=selection.value;libraryPreviewImages.value=images;libraryPreview.value=design;}
export function beginLibraryPreview(){const version=++previewVersion,base=currentDesign.value,epoch=projectEpoch.value;return()=>version===previewVersion&&base===currentDesign.value&&epoch===projectEpoch.value;}
export function previewStyle(style){let d=currentDesign.value;if(!d){if(style.type==='image')return;d=newDesign({name:`${project.value.name} Thumbnail`});d.layers=[newLayer(style.type,{x:d.width*.1,y:d.height*.3,w:d.width*.8,h:d.height*.4,text:project.value.name,size:d.height*.14})];}const ids=styleTargets(style,d);showLibraryPreview({...d,layers:d.layers.map(l=>ids.has(l.id)?applyDesignStyle(l,style,d.height):l)});}
export function previewTemplate(template,size){const current=currentDesign.value;showLibraryPreview(applyTemplate(template,{...templateContext(),width:size==='current'&&current?current.width:template.design.width,height:size==='current'&&current?current.height:template.design.height}));}
export function libraryImage(l){return libraryPreviewImages.value[l.asset]|| (l.asset==='preview-logo'?getImageAtPath(brandLogo.value?.path):l._libraryPath?getImageAtPath(l._libraryPath):getImage(l));}
export const isLibraryDrag=e=>Array.from(e.dataTransfer?.types||[]).includes('application/x-reccut-library');
export function startLibraryDrag(e,apply){dragged={apply,epoch:projectEpoch.value,designId:currentDesign.value?.id};e.dataTransfer.setData('application/x-reccut-library','');e.dataTransfer.effectAllowed='copy';}
export function endLibraryDrag(){dragged=null;clearLibraryPreview();}
export async function dropLibraryItem(hit,point){const drag=dragged;endLibraryDrag();if(!drag||drag.epoch!==projectEpoch.value||drag.designId!==currentDesign.value?.id)return;try{await drag.apply(hit,point);}catch(err){toast(err.message,{kind:'error'});}}
function imageLayer(d,props,width,height,point){const box=fitBox(width,height,d.width*.9,d.height*.9);return newLayer('image',{...props,...box,x:point?point.x-box.w/2:(d.width-box.w)/2,y:point?point.y-box.h/2:(d.height-box.h)/2,fit:'contain'});}
export async function placeLibraryImage({asset,media,path,name},point){clearLibraryPreview();const epoch=projectEpoch.value,designId=currentDesign.value?.id;
 if(path){if(!currentDesign.value){await openImageFiles([path],{copy:true,label:name});return;}await placeFiles([path],{copy:true,point,label:name});return;}
 if(media&&currentDesign.value){placeProjectImage(media,point);return;}
 const file=asset?.path||media?.streams?.main?.proxy||media?.streams?.main?.path||media?.path,image=await ensureImage(file);if(epoch!==projectEpoch.value||designId!==currentDesign.value?.id)return;if(!image){toast('Relink this image before placing it.',{kind:'error'});return;}
 let d=currentDesign.value;const creating=!d;if(creating)d=newDesign({name:(name||asset?.name||media?.name||'Image').replace(/\.[^.]+$/,''),width:Math.min(8192,image.naturalWidth),height:Math.min(8192,image.naturalHeight),size:'custom'});
 const l=imageLayer(d,{asset:asset?.id,media:media?.id,name:name||asset?.name||media?.name},image.naturalWidth,image.naturalHeight,point);
 if(creating){d.background=null;l.x=l.y=0;l.w=d.width;l.h=d.height;d.layers=[l];designCommit(p=>{p.designs[d.id]=d});openDesign(d.id);}else designCommit(p=>{p.designs[d.id].layers.push(l)});selection.value=[l.id];
}
export async function previewLibraryImage({asset,media,path,name}){const version=++previewVersion,base=currentDesign.value,epoch=projectEpoch.value,file=path||asset?.path||media?.streams?.main?.proxy||media?.streams?.main?.path||media?.path;
 const image=await ensureImage(file);if(!image||version!==previewVersion||epoch!==projectEpoch.value||base!==currentDesign.value)return;
 const d=base||newDesign({name:`${project.value.name} Thumbnail`}),l=imageLayer(d,{asset:asset?.id,media:media?.id,name:name||asset?.name||media?.name,_libraryPath:path},image.naturalWidth,image.naturalHeight);
 showLibraryPreview({...d,layers:[...d.layers,l]});
}
export function previewLibraryColor(color){const d=currentDesign.value;if(!d)return;const ids=new Set(selectedLayers().filter(l=>l.type!=='image').map(l=>l.id));showLibraryPreview(ids.size?{...d,layers:d.layers.map(l=>ids.has(l.id)?{...l,fill:solidFill(color)}:l)}:selection.value.length?d:{...d,background:solidFill(color)});}
export function applyLibraryColor(color,target=null){clearLibraryPreview();if(!currentDesign.value)return;const ids=new Set(target?target.type!=='image'&&!target.locked?[target.id]:[]:selectedLayers().filter(l=>l.type!=='image').map(l=>l.id));if((target||selection.value.length)&&!ids.size){toast('Choose unlocked text or shape layers to apply this color.');return;}changeDesign(d=>{if(!ids.size)d.background=solidFill(color);else for(const l of d.layers)if(ids.has(l.id))l.fill=solidFill(color);});}
effect(()=>{const preview=libraryPreview.value,d=currentDesign.value;projectEpoch.value;const selected=selection.value;if(preview&&(d!==previewBase||selected!==previewSelection||room.value!=='design'))clearLibraryPreview();});
effect(()=>{projectEpoch.value;selectedLibraryCard.value=null;endLibraryDrag();});
export async function refreshTemplates(){try{userTemplates.value=await window.api.listDesignTemplates();}catch(err){toast(`Could not load templates: ${err.message}`,{kind:'error'});}}
export function templateContext(){
  const p=project.value,layers=currentDesign.value?.layers||[],frame=layers.find(l=>l.type==='image'&&p.designAssets[l.asset]?.origin==='frame')||layers.find(l=>l.type==='image'&&!l.cutout?.enabled),cutout=layers.find(l=>l.type==='image'&&l.cutout?.enabled);
  const fallback=Object.values(p.designAssets||{}).filter(a=>a.origin==='frame').at(-1);
  return {projectName:p.name,title:p.name,frame:frame||fallback&&{asset:fallback.id},cutout,logo:brandLogo.value?{asset:'preview-logo'}:null};
}
export async function createFromTemplate(template,size='template',{context:overrides,assets:registrations=[],epoch:expectedEpoch=projectEpoch.value,signal,width,height}={}){
  const epoch=projectEpoch.value,p=project.value,context={...templateContext(),...overrides},current=currentDesign.value,assets=[...registrations];
  if(epoch!==expectedEpoch||signal?.aborted)return;
  const directory=await designDir(),sep=window.api.platform==='win32'?'\\':'/';
  let logo;
  if(brandLogo.value&&template.design.layers.some(l=>l.placeholder==='logo')){
    const brand=brandLogo.value,image=await ensureImage(brand.path);if(!image)throw new Error('Could not read My Logo.');
    const [path]=await window.api.copyIntoProject([brand.path],directory,{unique:true});
    const asset={id:uid(),name:brand.name,path,copied:true,origin:'placed',width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};assets.push(asset);logo={asset:asset.id};
  }
  const d=applyTemplate(template,{...context,logo,width:width??(size==='current'&&current?current.width:template.design.width),height:height??(size==='current'&&current?current.height:template.design.height)});
  for(const l of d.layers.filter(l=>l.type==='image'&&l.data)){
    const image=await ensureImage(l.data);if(!image)throw new Error('A template decoration could not be read.');
    const mime=l.data.slice(0,l.data.indexOf(';')),ext=mime==='data:image/jpeg'?'jpg':mime==='data:image/webp'?'webp':'png',binary=atob(l.data.slice(l.data.indexOf(',')+1));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),path=await window.api.writeDesignImage(`${directory}${sep}Decoration ${uid()}.${ext}`,bytes);
    const asset={id:uid(),name:l.name,path,copied:true,origin:'placed',width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};assets.push(asset);l.asset=asset.id;delete l.data;
  }
  if(epoch!==projectEpoch.value||p.id!==project.value.id||signal?.aborted)return;
  clearLibraryPreview();designCommit(p=>{for(const a of assets)p.designAssets[a.id]=a;p.designs[d.id]=d;});openDesign(d.id);
  return d;
}
export function openSaveTemplate(){const d=currentDesign.value;if(d)templateDialog.value={design:d,name:d.name};}
export async function saveTemplate(name,roles,colorRoles={},tags=[]){const s=templateDialog.value;if(!s||!name.trim())return;const template=templateFromDesign(s.design,{name:name.trim(),placeholders:roles,colorRoles,tags});const saved=await window.api.saveDesignTemplate(template);userTemplates.value=[...userTemplates.value,saved];templateDialog.value=null;toast(`Saved template: ${saved.name}`);}
export async function importTemplate(){
  const path=await window.api.openFileDialog({title:'Import Design Template',filters:[{name:'Reccut Design Template',extensions:['reccut-design-template']}]});if(!path)return;
  let raw;try{raw=JSON.parse(await window.api.readText(path));}catch{throw new Error('The template file is not valid JSON.');}
  const template=validateDesignTemplate(raw),saved=await window.api.saveDesignTemplate(template);userTemplates.value=[...userTemplates.value,saved];
  toast(template.warnings.length?`Imported ${saved.name}. ${template.warnings.length} unsupported layers were skipped.`:`Imported ${saved.name}.`);
}
export async function exportTemplate(template){
  const path=await window.api.saveFileDialog({title:'Export Design Template',defaultPath:`${template.name.replace(/[\\/:*?"<>|]/g,'_')}.reccut-design-template`,filters:[{name:'Reccut Design Template',extensions:['reccut-design-template']}]});if(path)await window.api.writeText(path,JSON.stringify(validateDesignTemplate(template),null,2));
}
effect(()=>{projectEpoch.value;if(room.value!=='design'||!currentDesign.value){styleDialog.value=null;templateDialog.value=null;}});
