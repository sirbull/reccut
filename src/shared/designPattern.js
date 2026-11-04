const number=(v,f,min,max)=>Number.isFinite(v)?Math.min(max,Math.max(min,v)):f;
export function normalizeDesignPattern(value){
  if(!value||!['dots','grid'].includes(value.kind))return null;
  const spacingX=Math.round(number(value.spacingX,48,4,1024)),spacingY=Math.round(number(value.spacingY,48,4,1024)),limit=Math.min(spacingX,spacingY)/(value.kind==='dots'?2:1);
  return{kind:value.kind,color:/^#[0-9a-f]{6}$/i.test(value.color)?value.color:'#52607a',size:number(value.size,Math.min(value.kind==='dots'?4:2,limit),.5,Math.min(256,limit)),spacingX,spacingY};
}
export function patternTile(pattern,create){const p=normalizeDesignPattern(pattern),cv=create(p.spacingX,p.spacingY),ctx=cv.getContext('2d');ctx.fillStyle=p.color;
  if(p.kind==='dots'){ctx.beginPath();ctx.arc(p.spacingX/2,p.spacingY/2,Math.min(p.size,p.spacingX/2,p.spacingY/2),0,Math.PI*2);ctx.fill();}
  else{ctx.fillRect(0,0,Math.min(p.size,p.spacingX),p.spacingY);ctx.fillRect(0,0,p.spacingX,Math.min(p.size,p.spacingY));}
  return cv;
}
