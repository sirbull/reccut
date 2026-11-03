import { signal, effect } from '@preact/signals';
import { prefs, setPrefs } from '../prefs.js';
import { project, projectEpoch, room } from '../editor/store.js';
import { currentDesign, selectedLayers, changeLayers, designCommit, openDesign } from './store.js';
import { extractDesignStyle, applyDesignStyle, applyTemplate, templateFromDesign, validateDesignTemplate } from '../../shared/designTemplates.js';
import { ensureImage, designDir } from './assets.js';
import { uid } from '../../shared/model.js';
import { brandLogo } from './brand.js';
import { toast } from '../ui.jsx';

export const userTemplates=signal([]),styleDialog=signal(null),templateDialog=signal(null);
export const savedStyles=()=>Array.isArray(prefs.value.designStyles)?prefs.value.designStyles.filter(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&['text','shape','image'].includes(s.type)&&s.style).slice(0,500):[];
export function storeStyles(styles){try{localStorage.setItem('prefs',JSON.stringify({...prefs.value,designStyles:styles}));}catch{toast('Could not save styles. Free some space or remove unused styles.',{kind:'error'});return false;}setPrefs({designStyles:styles});return true;}
export function openSaveStyle(){const l=selectedLayers()[0];if(!l)return;if(savedStyles().length>=500)return toast('You can save up to 500 styles. Remove a style before adding another.');styleDialog.value={layer:l,designHeight:currentDesign.value.height,name:l.name};}
export function saveStyle(name){const s=styleDialog.value;if(!s||!name.trim())return;const list=savedStyles();if(list.length>=500){toast('You can save up to 500 styles.');return;}if(storeStyles([...list,{id:uid(),name:name.trim().slice(0,160),type:s.layer.type,style:extractDesignStyle(s.layer,s.designHeight)}]))styleDialog.value=null;}
export function applyStyle(style){const d=currentDesign.value;if(!d)return;changeLayers(l=>{if(l.type===style.type)Object.assign(l,applyDesignStyle(l,style,d.height));});}
export async function refreshTemplates(){try{userTemplates.value=await window.api.listDesignTemplates();}catch(err){toast(`Could not load templates: ${err.message}`,{kind:'error'});}}
export function templateContext(){
  const p=project.value,layers=currentDesign.value?.layers||[],frame=layers.find(l=>l.type==='image'&&p.designAssets[l.asset]?.origin==='frame')||layers.find(l=>l.type==='image'&&!l.cutout?.enabled),cutout=layers.find(l=>l.type==='image'&&l.cutout?.enabled);
  const fallback=Object.values(p.designAssets||{}).filter(a=>a.origin==='frame').at(-1);
  return {projectName:p.name,title:p.name,frame:frame||fallback&&{asset:fallback.id},cutout,logo:brandLogo.value?{asset:'preview-logo'}:null};
}
export async function createFromTemplate(template,size='template'){
  const epoch=projectEpoch.value,p=project.value,context=templateContext(),current=currentDesign.value,assets=[];
  const directory=await designDir(),sep=window.api.platform==='win32'?'\\':'/';
  let logo;
  if(brandLogo.value&&template.design.layers.some(l=>l.placeholder==='logo')){
    const brand=brandLogo.value,image=await ensureImage(brand.path);if(!image)throw new Error('Could not read My Logo.');
    const [path]=await window.api.copyIntoProject([brand.path],directory,{unique:true});
    const asset={id:uid(),name:brand.name,path,copied:true,origin:'placed',width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};assets.push(asset);logo={asset:asset.id};
  }
  const d=applyTemplate(template,{...context,logo,width:size==='current'&&current?current.width:template.design.width,height:size==='current'&&current?current.height:template.design.height});
  for(const l of d.layers.filter(l=>l.type==='image'&&l.data)){
    const image=await ensureImage(l.data);if(!image)throw new Error('A template decoration could not be read.');
    const mime=l.data.slice(0,l.data.indexOf(';')),ext=mime==='data:image/jpeg'?'jpg':mime==='data:image/webp'?'webp':'png',binary=atob(l.data.slice(l.data.indexOf(',')+1));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),path=await window.api.writeDesignImage(`${directory}${sep}Decoration ${uid()}.${ext}`,bytes);
    const asset={id:uid(),name:l.name,path,copied:true,origin:'placed',width:image.naturalWidth||image.width,height:image.naturalHeight||image.height};assets.push(asset);l.asset=asset.id;delete l.data;
  }
  if(epoch!==projectEpoch.value||p.id!==project.value.id)return;
  designCommit(p=>{for(const a of assets)p.designAssets[a.id]=a;p.designs[d.id]=d;});openDesign(d.id);
}
export function openSaveTemplate(){const d=currentDesign.value;if(d)templateDialog.value={design:d,name:d.name};}
export async function saveTemplate(name,roles){const s=templateDialog.value;if(!s||!name.trim())return;const template=templateFromDesign(s.design,{name:name.trim(),placeholders:roles});const saved=await window.api.saveDesignTemplate(template);userTemplates.value=[...userTemplates.value,saved];templateDialog.value=null;toast(`Saved template: ${saved.name}`);}
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
