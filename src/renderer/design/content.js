import { prefs, setPrefs } from '../prefs.js';
import { project, projectEpoch } from '../editor/store.js';
import { currentDesign, designCommit, openDesign, selection, tool } from './store.js';
import { newDesign, newLayer, fitBox, normalizeFill } from '../../shared/design.js';
import { textPreset, elementLayers, applyDesignPalette, applyDesignFontPair, paletteColors, editableDesignLayer } from '../../shared/designContent.js';
import { uid, formatDuration } from '../../shared/model.js';
import { showLibraryPreview, clearLibraryPreview, beginLibraryPreview } from './library.js';
import { ensureImage, designDir } from './assets.js';
import { fontAvailable } from './fonts.js';
import { toast } from '../ui.jsx';
import { brandLayer, designBrand } from '../../shared/designBrand.js';
import { prepareEmoji, emojiURL,emojiImage } from './emoji.js';
import { fitDesignBadges } from './badges.js';

export function brandFonts(){const f=prefs.value.designBrandFonts||{};return{title:fontAvailable(f.title)?f.title||'sans':'sans',body:fontAvailable(f.body)?f.body||'sans':'sans'};}
function baseDesign(){return currentDesign.value||newDesign({name:`${project.value.name} Thumbnail`});}
function commitContent(d){const creating=!currentDesign.value;clearLibraryPreview();designCommit(p=>{p.designs[d.id]=d});if(creating)openDesign(d.id);}
export function addTextPreset(kind){const d=baseDesign(),l=brandLayer(textPreset(d,kind,project.value.name,brandFonts()),prefs.value.designBrand,brandFonts());commitContent({...d,layers:[...d.layers,l]});selection.value=[l.id];tool.value='select';}
export function backgroundElementLayer(element,d){const b=designBrand(prefs.value.designBrand);return newLayer('shape',{name:element.name,x:0,y:0,w:d.width,h:d.height,shape:'rect',backgroundLayer:true,colorRole:'background',fill:normalizeFill(element.fill||{type:'solid',color:element.kind==='texture'&&b.enabled?b.roles.background:element.id==='texture-grid'?'#f2ede3':'#182133'}),pattern:element.kind==='texture'?(element.pattern?{...element.pattern,color:b.enabled?b.roles.secondary:element.pattern.color}:null)||{kind:element.id==='texture-grid'?'grid':'dots',color:b.enabled?b.roles.secondary:element.id==='texture-grid'?'#c8c1b5':'#52607a',size:element.id==='texture-grid'?2:4,spacingX:48,spacingY:48}:null});}
function contentDesign(element,point){const d=baseDesign();if(['background','texture'].includes(element.kind)){const l=backgroundElementLayer(element,d);const last=d.layers.findLastIndex(l=>l.backgroundLayer||l.pattern||['Dotted Texture','Grid Texture'].includes(l.name));const layers=[...d.layers];layers.splice(last+1,0,l);return{...d,layers};}return fitDesignBadges({...d,layers:[...d.layers,...elementLayers(element,d,{point,duration:formatDuration(project.value.duration)}).map(l=>element.badgeStyle?l:brandLayer(l,prefs.value.designBrand,brandFonts()))]},d);}
export function editLegacyPattern(layer){if(layer.type!=='image'||!['Dotted Texture','Grid Texture'].includes(layer.name))return;const d=currentDesign.value,element={id:layer.name==='Grid Texture'?'texture-grid':'texture-dots',name:layer.name,kind:'texture'},next=backgroundElementLayer(element,d);Object.assign(next,{id:layer.id,x:layer.x,y:layer.y,w:layer.w,h:layer.h,rotation:layer.rotation,flipX:layer.flipX,flipY:layer.flipY,blend:layer.blend,mask:layer.mask,clip:layer.clip,shadows:layer.shadows,outline:layer.outline,opacity:layer.opacity,hidden:layer.hidden,locked:layer.locked,group:layer.group});designCommit(p=>{p.designs[d.id].layers=p.designs[d.id].layers.map(l=>l.id===layer.id?next:l)});}
export function brandedElement(element){const branding=designBrand(prefs.value.designBrand);return element.svg&&branding.enabled?{...element,svg:element.svg.replace(/#ffd60a/gi,branding.roles.fill).replace(/#ff453a/gi,branding.roles.cta).replace(/#bf5af2/gi,branding.roles.secondary)}:element;}
export async function applyElement(element,point){
  const branding=designBrand(prefs.value.designBrand);
  if(element.kind==='emoji'&&branding.emojiStyle!=='system'&&emojiURL(element.text,branding.emojiStyle)){
    const epoch=projectEpoch.value,base=currentDesign.value,d=baseDesign(),initial=elementLayers(element,d,{point})[0],result=await prepareEmoji(initial,branding.emojiStyle);
    if(epoch!==projectEpoch.value||base!==currentDesign.value)return;
    clearLibraryPreview();designCommit(p=>{p.designAssets[result.asset.id]=result.asset;p.designs[d.id]={...d,layers:[...d.layers,result.layer]}});if(!base)openDesign(d.id);selection.value=[result.layer.id];return;
  }
  element=brandedElement(element);
  if(!element.svg||element.kind==='texture'){const d=contentDesign(element,point),ids=d.layers.filter(l=>!currentDesign.value?.layers.some(old=>old.id===l.id)).map(l=>l.id);commitContent(d);selection.value=ids;tool.value='select';return;}
  const epoch=projectEpoch.value,base=currentDesign.value,d=base||baseDesign(),image=await ensureImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.svg)}`);
  if(!image)throw new Error('Could not read this element.');
  const canvas=new OffscreenCanvas(640,360);canvas.getContext('2d').drawImage(image,0,0,640,360);
  const data=new Uint8Array(await(await canvas.convertToBlob({type:'image/png'})).arrayBuffer()),dir=await designDir(),sep=window.api.platform==='win32'?'\\':'/';
  const path=await window.api.writeDesignImage(`${dir}${sep}${element.id}-${uid()}.png`,data);
  if(epoch!==projectEpoch.value||base!==currentDesign.value)return;
  await ensureImage(path);if(epoch!==projectEpoch.value||base!==currentDesign.value)return;
  const asset={id:uid(),name:element.name,path,copied:true,origin:'placed',width:640,height:360},texture=element.kind==='texture',box=fitBox(640,360,d.width*.55,d.height*.55),l=newLayer('image',{asset:asset.id,name:element.name,...box,x:(point?.x??d.width/2)-box.w/2,y:(point?.y??d.height/2)-box.h/2,fit:'contain'});
  if(texture)Object.assign(l,{x:0,y:0,w:d.width,h:d.height,fit:'stretch'});
  clearLibraryPreview();designCommit(p=>{p.designAssets[asset.id]=asset;p.designs[d.id]={...d,layers:texture?[l,...d.layers]:[...d.layers,l]}});if(!base)openDesign(d.id);selection.value=[l.id];tool.value='select';
}
export async function previewElement(element){element=brandedElement(element);if(element.kind==='emoji'&&emojiURL(element.text)){const valid=beginLibraryPreview(),d=baseDesign(),image=await emojiImage(element.text,prefs.value.designBrand?.emojiStyle);if(!image||!valid())return;const l=elementLayers(element,d)[0];showLibraryPreview({...d,layers:[...d.layers,newLayer('image',{...l,type:'image',asset:'preview-emoji',fit:'contain'})]},{'preview-emoji':image});return;}if(!element.svg||element.kind==='texture'){showLibraryPreview(contentDesign(element));return;}const valid=beginLibraryPreview(),d=baseDesign(),image=await ensureImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(element.svg)}`);if(!image||!valid())return;const l=newLayer('image',{asset:'preview-element',name:element.name,...fitBox(640,360,d.width*.55,d.height*.55),fit:'contain'});l.x=(d.width-l.w)/2;l.y=(d.height-l.h)/2;if(element.kind==='texture')Object.assign(l,{x:0,y:0,w:d.width,h:d.height,fit:'stretch'});showLibraryPreview({...d,layers:element.kind==='texture'?[l,...d.layers]:[...d.layers,l]},{'preview-element':image});}
function styleDesign(palette,pair,target){let d=baseDesign();if(pair&&!target&&!d.layers.some(l=>l.type==='text'))d={...d,layers:[...d.layers,textPreset(d,'title',project.value.name,brandFonts()),textPreset(d,'subtitle',project.value.name,brandFonts())]};if(target&&(!editableDesignLayer(d,target)||target.type==='image'||(pair&&!palette&&target.type!=='text')))return null;if(palette)d=applyDesignPalette(d,palette,target);if(pair)d=applyDesignFontPair(d,pair,target);return d;}
export function applyAppearance({palette,pair},target){if(palette&&!paletteColors(palette.colors))return;if(pair&&(!fontAvailable(pair.title)||!fontAvailable(pair.body)))return toast('These fonts are not installed.');const d=styleDesign(palette,pair,target);if(!d)return toast('Drop on an unlocked text or shape layer.');commitContent(d);}
export function previewAppearance({palette,pair}){const d=styleDesign(palette,pair);if(d)showLibraryPreview(d);}
export function savedContent(kind){const raw=prefs.value[`design${kind}`];return(Array.isArray(raw)?raw:[]).filter(item=>item&&typeof item.id==='string'&&typeof item.name==='string'&&(kind!=='Palettes'||paletteColors(item.colors))&&(kind!=='FontPairs'||typeof item.title==='string'&&typeof item.body==='string')&&(kind!=='Elements'||['shape','badge','emoji','background','drawing','sticker','texture'].includes(item.kind))).slice(0,500);}
export function saveContent(kind,item){const list=savedContent(kind);if(list.length>=500)return toast('Remove a saved item before adding another.');setPrefs({[`design${kind}`]:[...list,{...structuredClone(item),id:uid(),name:`${item.name} copy`}]});}
export function removeContent(kind,id){setPrefs({[`design${kind}`]:savedContent(kind).filter(item=>item.id!==id)});}
