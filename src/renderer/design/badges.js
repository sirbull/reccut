import { fitDesignBadge } from '../../shared/designText.js';

let context;
const fields=['text','textStyles','font','weight','size','tracking','lineHeight','uppercase'];
export function fitDesignBadges(design,previous) {
  if(!design.layers.some(l=>l.type==='text'&&l.box?.autoSize))return design;
  context ||= typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1,1).getContext('2d'):null;
  if(!context)return design;
  let changed=false;
  const layers=design.layers.map(layer=>{
    if(layer.type!=='text'||!layer.box?.autoSize)return layer;
    const old=previous?.layers.find(l=>l.id===layer.id);
    if(old?.box?.autoSize&&design.width===previous.width&&fields.every(key=>old[key]===layer[key]))return layer;
    changed=true;
    const maxWidth=layer.box.shape==='ellipse'?(design.width*.8-layer.box.padding*2)/Math.SQRT2:design.width*.8;
    return fitDesignBadge(layer,(text,font)=>{context.font=font;context.letterSpacing='0px';return context.measureText(text).width;},maxWidth);
  });
  return changed?{...design,layers}:design;
}
