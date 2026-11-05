import {EXTRA_ELEMENTS} from './designLibraryExtras.js';
// Emoji names/sequences: Unicode Emoji 16.0, licensed under Unicode License V3.
// See assets/licenses/UNICODE-3.0.txt. Rendering uses installed system fonts.
import emojiData from './designEmoji.json' with {type:'json'};
import { newLayer, solidFill, contrastRatio } from './design.js';
import { gradientRGB, gradientHex } from './gradient.js';

const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">${body}</svg>`;
export const DESIGN_EMOJIS=emojiData.map(([text,name,group,subgroup])=>({id:`emoji-${[...text].map(c=>c.codePointAt(0).toString(16)).join('-')}`,name,text,group,section:'emoji',kind:'emoji',tags:['emoji',name,group,subgroup,...(/smil|grin|laugh/.test(name)?['happy','smile','laugh']:[]),...(/heart|kiss/.test(name)?['love']:[])]}));
export const DESIGN_ELEMENTS = [...EXTRA_ELEMENTS,
  ...['rect','rounded','ellipse','polygon','star','line','arrow'].map(shape => ({id:`shape-${shape}`,name:({rect:'Rectangle',rounded:'Rounded Rectangle',ellipse:'Ellipse',polygon:'Polygon',star:'Star',line:'Line',arrow:'Arrow'})[shape],section:'shapes',kind:'shape',shape,tags:['shape',shape]})),
  {id:'curved-arrow',name:'Hand-drawn Arrow',section:'pointers',kind:'drawing',tags:['arrow','point','hand drawn'],svg:svg('<path d="M70 280 Q150 40 510 120 M435 55 L515 120 L430 165" fill="none" stroke="#ffd60a" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>')},
  {id:'scribble-circle',name:'Hand-drawn Circle',section:'pointers',kind:'drawing',tags:['circle','ring','highlight'],svg:svg('<path d="M515 90 C420 5 100 45 80 185 S430 355 535 210 S280 5 140 80" fill="none" stroke="#ff453a" stroke-width="15" stroke-linecap="round"/>')},
  {id:'underline',name:'Hand-drawn Underline',section:'pointers',kind:'drawing',tags:['underline','highlight'],svg:svg('<path d="M65 210 Q300 155 570 185 M120 242 Q365 203 530 225" fill="none" stroke="#ffd60a" stroke-width="18" stroke-linecap="round"/>')},
  ...['NEW','PART 2','FREE','VS','1','duration'].map((text,i)=>({id:`badge-${i}`,name:text==='duration'?'Duration Badge':`${text} Badge`,section:'badges',kind:'badge',text,tags:['badge','label',text]})),
  ...DESIGN_EMOJIS,
  {id:'sticker-bolt',name:'Lightning Sticker',section:'emoji',kind:'sticker',tags:['sticker','lightning','bolt'],svg:svg('<path d="M355 25 L185 205 H290 L255 335 L465 135 H345 Z" fill="#ffd60a" stroke="#ffffff" stroke-width="16" stroke-linejoin="round"/>')},
  {id:'sticker-sparkle',name:'Sparkle Sticker',section:'emoji',kind:'sticker',tags:['sticker','star','sparkle'],svg:svg('<path d="M320 25 Q335 165 470 180 Q335 195 320 335 Q305 195 170 180 Q305 165 320 25 Z" fill="#bf5af2" stroke="#ffffff" stroke-width="14"/>')},
  ...[['black','#111827'],['white','#ffffff'],['yellow','#ffd60a'],['red','#d43d40']].map(([name,color])=>({id:`bg-${name}`,name:`${name[0].toUpperCase()+name.slice(1)} Background`,section:'backgrounds',kind:'background',fill:solidFill(color),tags:['solid','background',name]})),
  ...[['Ocean','#0b2545','#087f9c'],['Sunset','#391b35','#ff9f0a'],['Lavender','#38235c','#e0bbff']].map(([name,a,b])=>({id:`gradient-${name}`,name:`${name} Gradient`,section:'backgrounds',kind:'background',tags:['gradient','background',name],fill:{type:'gradient',alpha:1,gradient:{mode:'linear',stops:[{position:0,color:a},{position:1,color:b}]}}})),
  {id:'texture-dots',name:'Dotted Texture',section:'backgrounds',kind:'texture',tags:['texture','dots','background'],svg:svg('<defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#182133"/><circle cx="12" cy="12" r="2" fill="#52607a"/></pattern></defs><rect width="640" height="360" fill="url(#p)"/>')},
  {id:'texture-grid',name:'Grid Texture',section:'backgrounds',kind:'texture',tags:['texture','grid','background'],svg:svg('<defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#f2ede3"/><path d="M32 0 H0 V32" fill="none" stroke="#c8c1b5"/></pattern></defs><rect width="640" height="360" fill="url(#p)"/>')},
];
export const ELEMENT_SECTIONS=[['shapes','Shapes'],['pointers','Arrows and Circles'],['badges','Badges'],['emoji','Emoji and Stickers'],['backgrounds','Backgrounds']];

export function textPreset(design,kind,title,fonts={}) {
  const subtitle=kind==='subtitle',badge=kind==='badge',w=design.width*(badge ? .32 : .84),h=design.height*(badge ? .16 : subtitle ? .16 : .3);
  return newLayer('text',{name:badge?'Badge':subtitle?'Subtitle':'Title',placeholder:badge?null:kind,colorRole:badge?'highlight':subtitle?'accent':'title',text:title,font:subtitle?fonts.body||'sans':fonts.title||'sans',weight:subtitle?500:800,size:design.height*(badge ? .075 : subtitle ? .06 : .14),x:(design.width-w)/2,y:design.height*(subtitle ? .72 : badge ? .12 : .35),w,h,fill:solidFill(badge?'#111827':'#ffffff'),box:badge?{fill:solidFill('#ffd60a'),padding:12,radius:12}:null});
}
export function elementLayers(element,design,{point,duration='0:00'}={}) {
  if(['background','drawing','sticker','texture'].includes(element.kind))return [];
  let l;
  if(element.kind==='badge'){l=textPreset(design,'badge',element.text==='duration'?duration:element.text);l.name=element.name;}
  else if(element.kind==='emoji')l=newLayer('text',{name:element.name,emoji:{text:element.text,style:'system'},text:element.text,font:'sans',size:design.height*.22,x:0,y:0,w:design.height*.3,h:design.height*.3,fill:solidFill(),highlight:null});
  else l=newLayer('shape',{name:element.name,colorRole:'highlight',shape:element.shape==='rounded'?'rect':element.shape,...element.props,w:design.width*.3,h:design.height*(element.shape==='line'||element.shape==='arrow' ? .12 : .3),radius:element.shape==='rounded'?design.height*.05:0,fill:solidFill('#ffd60a'),...(['line','arrow'].includes(element.shape)?{stroke:{fill:solidFill('#ffd60a'),width:Math.max(3,design.height*.015),align:'center'}}:{})});
  l.x=(point?.x??design.width/2)-l.w/2;l.y=(point?.y??design.height/2)-l.h/2;
  return [l];
}
export function editableDesignLayer(design,layer){return !layer.locked&&!layer.hidden&&(!layer.group||!design.layers.some(l=>l.group===layer.group&&l.locked));}
export function paletteColors(colors){return Array.isArray(colors)&&colors.length>=5&&colors.slice(0,5).every(c=>/^#[0-9a-f]{6}$/i.test(c))?colors.slice(0,5):null;}
export function applyDesignPalette(design,palette,target=null) {
  const colors=paletteColors(palette.colors);if(!colors)return design;
  if(target&&(!editableDesignLayer(design,target)||target.type==='image'))return design;
  const roles=Object.fromEntries(['background','title','highlight','accent','stroke'].map((r,i)=>[r,colors[i]])),first=design.layers.find(l=>l.type==='text'&&l.placeholder!=='subtitle');
  return {...design,background:target?design.background:solidFill(roles.background),layers:design.layers.map(l=>{
    if((target&&l.id!==target.id)||!editableDesignLayer(design,l)||l.type==='image')return l;
    const role=roles[l.colorRole]?l.colorRole:l.type==='text'?(l.id===first?.id?'title':'accent'):'highlight';
    return {...l,fill:{...solidFill(roles[role]),alpha:l.fill?.alpha??1},...(l.type==='text'?{highlight:{...solidFill(roles.highlight),alpha:l.highlight?.alpha??1},...(l.box?{box:{...l.box,fill:{...solidFill(role==='highlight'?roles.title:roles.background),alpha:l.box.fill?.alpha??1}}}:{})}:{}),...(l.stroke?{stroke:{...l.stroke,fill:{...solidFill(roles.stroke),alpha:l.stroke.fill?.alpha??1}}}:{})};
  })};
}
export function availableFontPairs(pairs,available){return pairs.filter(pair=>available(pair.title)&&available(pair.body));}
export function applyDesignFontPair(design,pair,target=null) {
  if(target&&(target.type!=='text'||!editableDesignLayer(design,target)))return design;
  const first=design.layers.find(l=>l.type==='text'&&l.placeholder!=='subtitle');
  return {...design,layers:design.layers.map(l=>l.type==='text'&&editableDesignLayer(design,l)&&(!target||l.id===target.id)?{...l,font:l.placeholder==='subtitle'||l.id!==first?.id?pair.body:pair.title}:l)};
}
// Quantize a small local frame, keep distinct dominant colors, then choose a
// contrasting title color. Transparent pixels never introduce black swatches.
export function paletteFromPixels({data,width,height}) {
  if(!data||data.length!==width*height*4||width<1||height<1)return null;
  const bins=new Map(),step=Math.max(1,Math.floor(width*height/12000));
  for(let p=0;p<width*height;p+=step){const i=p*4;if(data[i+3]<192)continue;const rgb=[data[i],data[i+1],data[i+2]],key=rgb.map(v=>Math.floor(v/32)).join(',');const b=bins.get(key)||{count:0,sum:[0,0,0]};b.count++;rgb.forEach((v,j)=>b.sum[j]+=v);bins.set(key,b);}
  const picked=[];
  for(const b of [...bins.values()].sort((a,b)=>b.count-a.count)){const rgb=b.sum.map(v=>v/b.count);if(picked.every(c=>Math.hypot(...c.map((v,i)=>v-rgb[i]))>60))picked.push(rgb);if(picked.length===5)break;}
  if(!picked.length)return null;
  const bg=gradientHex(picked[0]),title=contrastRatio(gradientRGB(bg),[255,255,255])>=contrastRatio(gradientRGB(bg),[0,0,0])?'#ffffff':'#000000';
  return {id:'from-frame',name:'From This Frame',colors:[bg,title,gradientHex(picked[1]||[255,214,10]),gradientHex(picked[2]||[100,210,255]),title==='#ffffff'?'#000000':'#ffffff']};
}
export function brandPalette(colors){const valid=colors.filter(c=>/^#[0-9a-f]{6}$/i.test(c));if(!valid.length)return null;const title=contrastRatio(gradientRGB(valid[0]),[255,255,255])>=4.5?'#ffffff':'#111111';return{id:'brand',name:'Brand Palette',colors:[valid[0],valid[1]||title,valid[2]||'#ffd60a',valid[3]||valid[1]||title,valid[4]|| (title==='#ffffff'?'#000000':'#ffffff')]};}
