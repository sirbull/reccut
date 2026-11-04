import { newDesign, newLayer, normalizeLayer, normalizeDesign, solidFill, validDesignSize, layerBounds } from './design.js';
import { uid } from './model.js';
import { longestDesignWord, parseDesignText } from './designText.js';
import { styleTextRange, styleWholeTextLayer } from './designRichText.js';

export const DESIGN_TEMPLATE_FORMAT='reccut-design-template';
export const PLACEHOLDERS=['frame','cutout','title','subtitle','logo'];
export const DESIGN_COLOR_ROLES=['background','title','highlight','accent','stroke'];
export const DESIGN_TEMPLATE_TAGS=['Bold','Minimal','Face + Title','Tutorial','Before/After','List / Number','Podcast','Gaming','News'];
export const DESIGN_PALETTES=[
  {id:'midnight',name:'Midnight Gold',colors:['#111827','#ffffff','#ffd60a','#64d2ff','#000000']},
  {id:'paper',name:'Paper and Ink',colors:['#f2ede3','#161820','#d43d40','#38675a','#ffffff']},
  {id:'neon',name:'Neon Nights',colors:['#17112c','#f4eeff','#d65aff','#64f4ff','#080512']},
  {id:'ocean',name:'Ocean Blue',colors:['#0b2545','#ffffff','#51e5ff','#58a6ff','#06162b']},
  {id:'sunset',name:'Sunset',colors:['#391b35','#fff5db','#ffb347','#ff6179','#190d1b']},
  {id:'forest',name:'Forest',colors:['#102a23','#f1f8e9','#b9ed76','#73d7af','#071a14']},
  {id:'signal',name:'Red Signal',colors:['#171717','#ffffff','#ff453a','#ffd60a','#000000']},
  {id:'lavender',name:'Soft Lavender',colors:['#ece8f7','#29203b','#8055bd','#cc71a2','#ffffff']},
];
export const DESIGN_FONT_PAIRS=[
  {id:'system',name:'System Sans',title:'sans',body:'sans'},
  {id:'editorial',name:'Editorial',title:'serif',body:'sans'},
  {id:'technical',name:'Technical',title:'mono',body:'sans'},
  {id:'rounded',name:'Friendly',title:'rounded',body:'sans'},
  {id:'helvetica',name:'Helvetica and Georgia',title:'Helvetica Neue',body:'Georgia'},
  {id:'impact',name:'Impact and Arial',title:'Impact',body:'Arial'},
  {id:'avenir',name:'Avenir and Georgia',title:'Avenir Next',body:'Georgia'},
];
const copy=(value)=>structuredClone(value);
const styleFields={text:['font','weight','size','tracking','lineHeight','uppercase','fill','highlight','stroke','shadows','box','outline'],shape:['fill','stroke','shadows','radius','outline'],image:['adjust','shadows','outline']};
export function extractDesignStyle(layer,height){const style={};for(const key of styleFields[layer.type]||[])if(layer[key]!==undefined)style[key]=copy(layer[key]);if(layer.type==='text')style.size=layer.size/height;return style;}
export function applyDesignStyle(layer,entry,height){
  if(entry.type!==layer.type)return layer;
  const style=copy(entry.style);
  if(layer.type!=='text')return normalizeLayer({...layer,...style,style:entry.id});
  style.size=Math.max(6,(style.size||0.13)*height);
  // Applying a style replaces previous character overrides for its appearance fields.
  // Text, geometry and explicit *word* highlights remain the user's own.
  let next=styleWholeTextLayer(layer,{...style,style:entry.id});
  if(style.highlight&&JSON.stringify(style.highlight)!==JSON.stringify(next.fill)&&!parseDesignText(layer.text).some(run=>run.highlight)){
    const word=longestDesignWord(layer.text);
    if(word)next=styleTextRange(next,word.start,word.end,{fill:style.highlight});
  }
  return normalizeLayer(next);
}
const textStyle=(id,name,style)=>({id:`builtin:${id}`,name,type:'text',style:{font:'sans',weight:800,size:0.14,tracking:0,lineHeight:1.05,uppercase:false,fill:solidFill(),highlight:solidFill('#ff453a'),stroke:null,shadows:[],box:null,outline:null,...style}});
export const BUILTIN_DESIGN_STYLES=[
  textStyle('yellow','Bold Yellow Outline',{fill:solidFill('#ffe600'),stroke:{fill:solidFill('#000000'),width:12,align:'outside',dash:'solid',join:'round'},uppercase:true}),
  textStyle('white','Clean White',{weight:700,shadows:[{color:'#000000',alpha:0.5,blur:14,x:0,y:5,spread:0}]}),
  textStyle('box','Black Box',{box:{fill:solidFill('#101014'),padding:14,radius:8}}),
  textStyle('neon','Neon Glow',{fill:solidFill('#b5ffff'),shadows:[{color:'#26d9ff',alpha:0.9,blur:24,x:0,y:0,spread:3}]}),
  textStyle('red','Red Highlight',{fill:solidFill('#ffffff'),highlight:solidFill('#ff453a'),weight:900}),
  textStyle('gradient','Gradient Pop',{fill:{type:'gradient',alpha:1,gradient:{stops:[{position:0,color:'#ffe570'},{position:1,color:'#ff453a'}]}}}),
  textStyle('retro','Retro Shadow',{fill:solidFill('#fff0bd'),shadows:[{color:'#f34b56',alpha:1,blur:0,x:8,y:8,spread:0}]}),
  textStyle('serif','Minimal Serif',{font:'serif',weight:500,size:0.12,lineHeight:1.2}),
  textStyle('code','Code Mono',{font:'mono',weight:700,size:0.1,fill:solidFill('#a8f0c5'),box:{fill:solidFill('#14231c'),padding:12,radius:6}}),
  textStyle('sticker','Sticker White',{fill:solidFill('#20202a'),outline:{color:'#ffffff',width:10}}),
  textStyle('number','Big Number',{size:0.26,weight:900,fill:solidFill('#ffd60a')}),
  textStyle('subtitle','Subtitle Small',{size:0.055,weight:500,lineHeight:1.25}),
  textStyle('news','News Bar',{size:0.1,uppercase:true,box:{fill:solidFill('#da2538'),padding:16,radius:0}}),
  textStyle('pastel','Soft Pastel',{fill:solidFill('#f2d7ff'),weight:700,shadows:[{color:'#5e467b',alpha:0.4,blur:20,x:0,y:6,spread:0}]}),
  textStyle('outline','Outline Only',{fill:null,highlight:null,stroke:{fill:solidFill('#ffffff'),width:3,align:'outside',dash:'solid',join:'round'}}),
];
function inspectImageFields(value,key='',depth=0){
  if(depth>24)throw new Error('The template image data is too deeply nested.');
  if(value===null||value===undefined||value===false)return;
  if(typeof value==='string'){
    if(key==='data'){
      if(!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]*={0,2}$/.test(value))throw new Error('Template decorations must be PNG, JPEG or WebP data URLs.');
      if(Math.floor(value.slice(value.indexOf(',')+1).length*3/4)>1_048_576)throw new Error('Each template decoration must be under 1 MB.');
    }else if((['path','src','url','file','filename','asset','media'].includes(key)&&value)||(!['name','id','type','placeholder'].includes(key)&&/^(?:file:|https?:|[\\/]|[a-z]:[\\/]|\.\.[\\/])/i.test(value)))throw new Error('Templates cannot reference image paths or project assets. Use a placeholder.');
    return;
  }
  if(typeof value==='object')for(const [k,v]of Object.entries(value))inspectImageFields(v,k,depth+1);
}
export function validateDesignTemplate(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.format!==DESIGN_TEMPLATE_FORMAT)throw new Error('This is not a Reccut design template.');
  if((data.version??1)!==1)throw new Error('This template needs a newer version of Reccut. Supported template version: 1.');
  const d=data.design;
  if(!d||!validDesignSize(d.width,d.height))throw new Error('Template sizes must be whole numbers from 1 to 8192 pixels.');
  if(!Array.isArray(d.layers)||d.layers.length>200)throw new Error('Templates can contain at most 200 layers.');
  const warnings=[],layers=[];
  for(const raw of d.layers){
    if(!raw||!['image','text','shape'].includes(raw.type)){warnings.push('An unsupported layer was skipped.');continue;}
    if(raw.type==='image'){
      inspectImageFields(raw);
      if(raw.cutout)throw new Error('Use a cutout placeholder instead of a saved mask asset.');
      if(!raw.data&&!['frame','cutout','logo'].includes(raw.placeholder))throw new Error('Image layers need a placeholder or a small embedded decoration.');
    }
    const l=normalizeLayer(raw);
    if(DESIGN_COLOR_ROLES.includes(raw.colorRole))l.colorRole=raw.colorRole;else delete l.colorRole;
    l.placeholder=PLACEHOLDERS.includes(raw.placeholder)?raw.placeholder:null;
    const a=raw.anchor||{};l.anchor={x:['left','center','right','stretch'].includes(a.x)?a.x:'center',y:['top','middle','bottom','stretch'].includes(a.y)?a.y:'middle'};
    layers.push(l);
  }
  const tags=Array.isArray(data.tags)?[...new Set(data.tags.filter(t=>typeof t==='string').map(t=>t.trim().slice(0,60)).filter(Boolean))].slice(0,20):[];
  return {format:DESIGN_TEMPLATE_FORMAT,version:1,id:typeof data.id==='string'?data.id:uid(),name:String(data.name||'Custom Template').trim().slice(0,160)||'Custom Template',tags,ratio:['16:9','9:16','1:1'].includes(data.ratio)?data.ratio:d.width>d.height?'16:9':d.width<d.height?'9:16':'1:1',design:{...normalizeDesign({...d,layers}),layers},warnings};
}
function anchorLayer(layer,source,width,height){
  const k=Math.min(width/source.width,height/source.height),a=layer.anchor||{x:'center',y:'middle'};
  const axis=(pos,len,total,target,anchor,start,end)=>{
    if(anchor==='stretch')return{pos:pos*k,len:Math.max(1,target-(total-len)*k)};
    const size=len*k;
    return {pos:anchor===start?pos*k:anchor===end?target-(total-pos-len)*k-size:target/2+(pos+len/2-total/2)*k-size/2,len:size};
  };
  const x=axis(layer.x,layer.w,source.width,width,a.x,'left','right'),y=axis(layer.y,layer.h,source.height,height,a.y,'top','bottom');
  let next={...copy(layer),id:uid(),x:x.pos,y:y.pos,w:x.len,h:y.len};
  if(next.type==='text')next.size=Math.max(6,next.size*k);
  if(next.radius)next.radius*=k;
  let b=layerBounds(next),fit=Math.min(1,width/b.w,height/b.h);
  if(fit<1){next.w*=fit;next.h*=fit;b=layerBounds(next);}
  next.x+=Math.max(0,-b.x)-Math.max(0,b.x+b.w-width);next.y+=Math.max(0,-b.y)-Math.max(0,b.y+b.h-height);
  return next;
}
export function applyTemplate(input,{width=input.design.width,height=input.design.height,frame,cutout,title,subtitle='',logo,projectName='Untitled Project'}={}){
  const template=validateDesignTemplate(input),d=newDesign({name:template.name,width,height,size:'custom'}),groups=new Map();
  d.background=copy(template.design.background);
  for(const layer of template.design.layers){
    const l=anchorLayer(layer,template.design,width,height),value={frame,cutout,logo}[l.placeholder];
    if(l.type==='image'&&l.placeholder){if(!value)continue;const image=typeof value==='string'?{asset:value}:value;Object.assign(l,{asset:image.asset||null,media:image.asset?null:image.media||null,crop:copy(image.crop||{x:0,y:0,w:1,h:1}),cutout:l.placeholder==='cutout'?copy(image.cutout||null):null});delete l.data;}
    if(l.type==='text'&&l.placeholder==='title')l.text=title??projectName;
    if(l.type==='text'&&l.placeholder==='subtitle')l.text=subtitle;
    if(l.group){if(!groups.has(l.group))groups.set(l.group,uid());l.group=groups.get(l.group);}
    d.layers.push(normalizeLayer(l));
  }
  return d;
}
export function templateFromDesign(design,{name=design.name,placeholders={},colorRoles={},tags=[]}={}){
  let titleUsed=false;
  const layers=design.layers.map(l=>{
    const next=copy(l);delete next.style;
    next.colorRole=Object.hasOwn(colorRoles,l.id)?colorRoles[l.id]||null:l.colorRole||null;
    next.anchor=l.anchor||{x:l.w>design.width*0.8?'stretch':l.x+l.w/2>design.width*0.6?'right':l.x+l.w/2<design.width*0.4?'left':'center',y:l.h>design.height*0.8?'stretch':l.y+l.h/2>design.height*0.6?'bottom':l.y+l.h/2<design.height*0.4?'top':'middle'};
    next.placeholder=placeholders[l.id]||l.placeholder||(l.type==='image'?(l.cutout?.enabled?'cutout':'frame'):l.type==='text'?(!titleUsed?'title':'subtitle'):null);
    if(l.type==='text'){titleUsed=true;next.text=next.placeholder==='title'?'Title':next.placeholder==='subtitle'?'Subtitle':l.text;}
    if(l.type==='image'){next.asset=null;next.media=null;next.cutout=null;delete next.path;delete next.src;delete next.url;}
    return next;
  });
  return validateDesignTemplate({format:DESIGN_TEMPLATE_FORMAT,version:1,name,tags,design:{...design,layers}});
}
function makeTemplate(id,name,ratio,variant){
  const [width,height]=ratio==='16:9'?[1280,720]:ratio==='9:16'?[1080,1920]:[1080,1080],d=newDesign({name,width,height}),colors=['#ffd60a','#ff453a','#64d2ff','#bf5af2','#30d158','#ff9f0a'];
  const accent=colors[variant%colors.length],mode=variant%6,pad=width*0.055;
  d.background=solidFill(mode===4?'#f2ede3':'#141820');
  const shape=(props)=>newLayer('shape',props),text=(props)=>newLayer('text',props);
  const frame=newLayer('image',{name:'Frame',placeholder:'frame',x:0,y:0,w:width,h:height,fit:'contain',adjust:{brightness:-0.3},anchor:{x:'stretch',y:'stretch'}});
  const person=newLayer('image',{name:'Presenter',placeholder:'cutout',x:width*0.55,y:height*0.12,w:width*0.4,h:height*0.8,fit:'contain',outline:{color:'#ffffff',width:8},anchor:{x:'right',y:'bottom'}});
  const title=text({name:'Title',placeholder:'title',text:'Your *next* story',x:pad,y:mode===2?height*0.12:height*0.6,w:width-pad*2,h:height*0.28,size:height*(ratio==='9:16'?0.075:0.14),fill:solidFill(mode===4?'#161820':accent),highlight:solidFill(mode===4?'#d43d40':'#ffffff'),align:mode===1||mode===4?'center':'left',font:mode===4?'serif':mode===5?'mono':'sans',weight:900,stroke:mode===0?{fill:solidFill('#000000'),width:10,align:'outside'}:null,box:mode===1?{fill:solidFill('#111111'),padding:12,radius:8}:null,shadows:mode===3?[{color:accent,alpha:0.7,blur:20,x:0,y:0,spread:1}]:[],anchor:{x:'stretch',y:mode===2?'top':'bottom'}});
  const subtitle=text({name:'Subtitle',placeholder:'subtitle',text:'A new perspective',x:pad,y:height*0.91,w:width-pad*2,h:height*0.045,size:height*0.035,fill:solidFill(mode===4?'#333333':'#ffffff'),weight:500,align:title.align,anchor:{x:'stretch',y:'bottom'}});
  const bar=shape({name:'Accent',x:pad,y:height*0.06,w:mode===2?width-pad*2:width*0.14,h:height*0.015,fill:solidFill(accent),anchor:{x:mode===2?'stretch':'left',y:'top'}});
  const logo=newLayer('image',{name:'Logo',placeholder:'logo',x:width*0.84,y:height*0.045,w:width*0.105,h:height*0.09,fit:'contain',anchor:{x:'right',y:'top'}});
  d.layers=[frame,...(mode===4?[shape({name:'Paper',x:0,y:0,w:width,h:height,fill:{...solidFill('#f2ede3'),alpha:0.88},anchor:{x:'stretch',y:'stretch'}})]:[]),...(mode===0||mode===3?[person]:[]),bar,title,subtitle,logo];
  d.layers.forEach((l,i)=>{l.id=`${id}-${i}`;if(l.type!=='image')l.colorRole=l.placeholder==='title'?'title':l.placeholder==='subtitle'?'accent':l.name==='Paper'?'background':'highlight';});
  const tags=[['Bold','Face + Title','Podcast'],['Minimal','Tutorial'],['News','List / Number'],['Bold','Gaming','Face + Title'],['Minimal','Before/After'],['Tutorial']][mode];
  return validateDesignTemplate({format:DESIGN_TEMPLATE_FORMAT,version:1,id,name,ratio,tags,design:d});
}
const wideNames=['Presenter Focus','Clean Tutorial','Top Story','Neon Lesson','Editorial','Code Walkthrough','Quick Guide','Bold Interview','Product Reveal','Creative Tools','Paper Notes','Developer Update'];
const tallNames=['Story Focus','Daily Lesson','Top Tip','Neon Short','Personal Story','Code Short'];
const squareNames=['Square Focus','Clean Post','Product Card','Neon Post'];
export const BUILTIN_DESIGN_TEMPLATES=[...wideNames.map((name,i)=>makeTemplate(`wide-${i}`,name,'16:9',i)),...tallNames.map((name,i)=>makeTemplate(`tall-${i}`,name,'9:16',i)),...squareNames.map((name,i)=>makeTemplate(`square-${i}`,name,'1:1',i))];
