import available from '../../shared/designEmojiAssets.json';
import {prefs} from '../prefs.js';
import {ensureImage,designDir} from './assets.js';
import {newLayer} from '../../shared/design.js';
import {uid} from '../../shared/model.js';
import {currentDesign,designCommit} from './store.js';
import {projectEpoch} from '../editor/store.js';
export const EMOJI_STYLES=[{value:'system',label:'System'},{value:'flat',label:'Flat · OpenMoji'},{value:'outline',label:'Outline · OpenMoji'}];
const codes=new Set(available);
export function emojiURL(text,style=prefs.value.designBrand?.emojiStyle||'system'){
 const code=[...text].map(c=>c.codePointAt(0).toString(16).toUpperCase()).filter(c=>c!=='FE0F').join('-');
 return ['flat','outline'].includes(style)&&codes.has(code)?new URL(`emoji/${style}/${code}.svg`,location.href).href:null;
}
export async function emojiImage(text,style){const url=emojiURL(text,style);if(!url)return null;let path=decodeURIComponent(new URL(url).pathname);if(window.api.platform==='win32'&&/^\/[a-z]:/i.test(path))path=path.slice(1);return ensureImage(path);}
export async function prepareEmoji(layer,style){
 const text=layer.emoji?.text||layer.text;if(!text)return;
 let next;
 if(style==='system')next=newLayer('text',{...layer,type:'text',text,font:'sans',size:Math.min(layer.w,layer.h)*.75,asset:null,emoji:{text,style}});
 else{
  const image=await emojiImage(text,style);if(!image)throw Error('This emoji is not available in that style. Choose System.');
  const cv=new OffscreenCanvas(256,256);cv.getContext('2d').drawImage(image,0,0,256,256);
  const dir=await designDir(),path=await window.api.writeDesignImage(`${dir}/Emoji-${uid()}.png`,new Uint8Array(await(await cv.convertToBlob()).arrayBuffer()));
  await ensureImage(path);const id=uid();next=newLayer('image',{...layer,type:'image',asset:id,fit:'contain',emoji:{text,style}});
  return{layer:next,asset:{id,name:layer.name,path,copied:true,width:256,height:256,origin:'placed',source:{provider:'OpenMoji',author:'OpenMoji contributors',pageUrl:'https://openmoji.org/',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'}}};
 }
 return{layer:next};
}
export async function replaceEmoji(layer,style){
 const d=currentDesign.value,epoch=projectEpoch.value,result=await prepareEmoji(layer,style);
 if(result&&epoch===projectEpoch.value&&d===currentDesign.value)designCommit(p=>{if(result.asset)p.designAssets[result.asset.id]=result.asset;p.designs[d.id].layers=p.designs[d.id].layers.map(l=>l.id===layer.id?result.layer:l)});
}
