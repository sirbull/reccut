import { solidFill,contrastRatio } from './design.js';
import {gradientRGB} from './gradient.js';
import { styleWholeTextLayer } from './designRichText.js';
export const BRAND_ROLES={background:'#111827',title:'#ffffff',body:'#e5e7eb',cta:'#ffd60a',secondary:'#64d2ff',fill:'#ffd60a',stroke:'#000000'};
export function designBrand(value={}){return{enabled:value.enabled!==false,emojiStyle:['system','flat','outline'].includes(value.emojiStyle)?value.emojiStyle:'system',roles:Object.fromEntries(Object.entries(BRAND_ROLES).map(([key,fallback])=>[key,/^#[0-9a-f]{6}$/i.test(value.roles?.[key])?value.roles[key]:fallback]))};}
export function brandLayer(layer,brand,fonts={}){
 const b=designBrand(brand);if(!b.enabled||layer.emoji||layer.type==='image')return layer;
 const role=({accent:'body',highlight:'fill'})[layer.colorRole]||layer.colorRole|| (layer.type==='text'?(layer.placeholder==='subtitle'?'body':'title'):'fill'),color=b.roles[role]||b.roles.fill;
 let next=layer.type==='text'?styleWholeTextLayer(layer,{font:(layer.placeholder==='subtitle'||['body','accent'].includes(role))?fonts.body||layer.font:fonts.title||layer.font,fill:solidFill(color)}):{...layer,fill:solidFill(color)};
 if(layer.box){const background=gradientRGB(b.roles.cta),preferred=gradientRGB(b.roles.title),color=contrastRatio(background,preferred)>=4.5?b.roles.title:contrastRatio(background,[255,255,255])>contrastRatio(background,[17,24,39])?'#ffffff':'#111827';next={...next,box:{...layer.box,fill:solidFill(b.roles.cta)},fill:solidFill(color)};}
 if(layer.pattern)next={...next,pattern:{...layer.pattern,color:b.roles.secondary}};
 if(layer.stroke)next={...next,stroke:{...layer.stroke,fill:solidFill(b.roles.stroke)}};
 return next;
}
