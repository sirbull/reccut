import { useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { currentDesign,selection } from './store.js';
import { contrastRatio,readabilityWarnings } from '../../shared/design.js';
import { drawDesign } from '../../shared/designRender.js';
import { layoutDesignText } from '../../shared/designText.js';
import { loadDesignImages,getImage,imageVersion } from './assets.js';
import { fontAvailable,fontVersion } from './fonts.js';
import { Button,Section } from '../ui.jsx';
export async function measureReadability(d,signal){
 await loadDesignImages(d);await document.fonts.ready;const k=Math.min(168/d.width,512/d.height),w=Math.max(1,Math.ceil(d.width*k)),h=Math.max(1,Math.ceil(d.height*k)),bg=new OffscreenCanvas(w,h),fg=new OffscreenCanvas(w,h),a=bg.getContext('2d',{willReadFrequently:true}),b=fg.getContext('2d',{willReadFrequently:true}),textSizes={},contrasts={};
 for(let index=0;index<d.layers.length;index++){
  if(signal?.aborted)return[];const l=d.layers[index];if(l.type!=='text'||l.hidden||!l.opacity||!l.text.trim())continue;
  const layout=layoutDesignText(l,(text,font)=>{b.font=font;return b.measureText(text).width});textSizes[l.id]=Math.min(layout.size,...(l.textStyles||[]).map(r=>(r.style.size??l.size)*layout.size/l.size));
  a.clearRect(0,0,w,h);a.fillStyle='#ffffff';a.fillRect(0,0,w,h);
  const box={...l,fill:null,highlight:null,stroke:null,outline:null,shadows:[]};drawDesign(a,{...d,layers:[...d.layers.slice(0,index),box]},getImage,{scale:k,fontAvailable,cacheLayers:false});
  b.clearRect(0,0,w,h);drawDesign(b,{...d,background:null,layers:[{...l,clip:false,opacity:1,box:null,stroke:null,outline:null,shadows:[]}]},getImage,{scale:k,fontAvailable,cacheLayers:false});
  const behind=a.getImageData(0,0,w,h).data,front=b.getImageData(0,0,w,h).data,ratios=[];
  for(let i=0;i<front.length;i+=4)if(front[i+3]>192){const alpha=l.opacity*front[i+3]/255,base=[behind[i],behind[i+1],behind[i+2]],color=base.map((v,c)=>v*(1-alpha)+front[i+c]*alpha);ratios.push(contrastRatio(color,base));}
  if(ratios.length){ratios.sort((a,b)=>a-b);contrasts[l.id]=ratios[Math.floor(ratios.length*.25)];}
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 return readabilityWarnings(d,{textSizes,contrasts});
}
export const readabilityStatus=signal(null);
let controller=null;
export function cancelReadability(){controller?.abort();controller=null;readabilityStatus.value=null;}
export async function refreshReadability(d=currentDesign.value){
 controller?.abort();const c=new AbortController();controller=c;if(!d){readabilityStatus.value=null;return;}
 readabilityStatus.value={design:d,busy:true,warnings:[]};
 try{const warnings=await measureReadability(d,c.signal);if(!c.signal.aborted&&currentDesign.value===d)readabilityStatus.value={design:d,busy:false,warnings};}
 catch(e){if(!c.signal.aborted)readabilityStatus.value={design:d,busy:false,warnings:[],error:e.message};}
}
export function useReadability(d,active){const images=imageVersion.value,fonts=fontVersion.value;
 useEffect(()=>{cancelReadability();if(!active||!d)return;const timer=setTimeout(()=>refreshReadability(d),450);return()=>{clearTimeout(timer);cancelReadability();};},[active,d,images,fonts]);
}
export function ReadabilityPanel(){const d=currentDesign.value,status=readabilityStatus.value,result=status?.design===d?status:null;
 if(!d)return null;return <Section title="Readability"><Button disabled={result?.busy} onClick={()=>refreshReadability()}>{result?.busy?'Checking…':'Check Readability'}</Button><p class="hint">Checks text in a 168 px wide feed tile. Contrast samples the text fill over the layers below. Transparency is checked on white; outlines and shadows may improve legibility.</p>{result?.error&&<p class="warn">{result.error}</p>}{result&&!result.busy&&!result.error&&(result.warnings.length?result.warnings.map((warning,i)=><div key={i} class="dz-readability-warning"><p>{warning.message}</p><Button class="small" onClick={()=>selection.value=[warning.layerId]}>Select</Button></div>):<p class="hint">No readability warnings found.</p>)}</Section>
}
