import { renderMotionBlur, renderNaturalMotionBlur } from '../../src/shared/motionBlurRender.js';
import { drawFrame } from '../../src/shared/render.js';
import { makeClip } from '../../src/shared/model.js';
import { makeVideoEffect } from '../../src/shared/videoEffects.js';
import { addMask } from '../../src/shared/shapes.js';

const canvas=(w,h)=>new OffscreenCanvas(w,h);
const pixels=c=>c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,c.width,c.height).data;
const copy=c=>{const out=canvas(c.width,c.height);out.getContext('2d').drawImage(c,0,0);return out;};
const frame=(w,h,dx=0)=>{
  const c=canvas(w,h),g=c.getContext('2d');g.fillStyle='#182d42';g.fillRect(0,0,w,h);
  // Fine static texture, a moving warm rectangle and its interior features.
  g.fillStyle='#2e5268';for(let y=0;y<h;y+=12)for(let x=0;x<w;x+=16)g.fillRect(x,y,3,3);
  g.fillStyle='#f0b040';g.fillRect(w*.35+dx,h*.3,w*.2,h*.4);
  g.fillStyle='#482a18';g.fillRect(w*.4+dx,h*.35,w*.03,h*.3);
  return c;
};
export async function run(){
  const report={},checks=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  const at=(d,w,x,y)=>[...d.slice((y*w+x)*4,(y*w+x)*4+4)];
  const w=320,h=180,source=frame(w,h),p={amount:30,mode:'directional',angle:0,bias:0,centerX:.5,centerY:.5};
  const zero=renderMotionBlur(source,w,h,{...p,amount:0});check(zero===source,'zero bypass');
  const spatial=copy(renderMotionBlur(source,w,h,p)),sd=pixels(spatial),original=pixels(source);
  check(at(sd,w,10,40).every((v,i)=>Math.abs(v-at(original,w,10,40)[i])<3),'spatial orientation and static flat area');
  check(at(sd,w,105,70)[0]>at(original,w,105,70)[0]+15,'directional blur extends silhouette');
  const matte=canvas(w,h),mg=matte.getContext('2d');mg.fillStyle='white';mg.fillRect(0,0,w,h);mg.clearRect(110,45,75,90);
  const masked=pixels(copy(renderMotionBlur(source,w,h,p,matte)));
  check(at(masked,w,115,70).every((v,i)=>Math.abs(v-at(original,w,115,70)[i])<3),'protected foreground remains sharp');
  check(at(masked,w,105,70)[0]<at(sd,w,105,70)[0]-15,'protected foreground does not bleed into background');
  for(const mode of ['zoom','spin']){
    const d=pixels(copy(renderMotionBlur(source,w,h,{...p,mode,amount:80})));
    check(d.some((v,i)=>Math.abs(v-original[i])>20),`${mode} changes the image`);
  }
  const alpha=canvas(w,h),ag=alpha.getContext('2d');ag.fillStyle='white';ag.fillRect(110,50,60,80);
  const alphaBlur=pixels(copy(renderMotionBlur(alpha,w,h,p)));
  const edge=at(alphaBlur,w,105,70);
  check(edge[3]>0&&edge[3]<255&&edge[0]>250,'transparent motion streaks keep their color without black fringes');
  const temporal={previous:{img:frame(w,h,-16),time:0},current:{img:source,time:1/30},next:{img:frame(w,h,16),time:2/30},exposure:1/30,key:'moving'};
  const start=performance.now(),natural=copy(renderNaturalMotionBlur(source,w,h,{amount:0.5},temporal));
  report.firstMs=performance.now()-start;
  const d=pixels(natural);report.originalEdge=at(original,w,111,70);report.naturalEdge=at(d,w,111,70);
  const rolling=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:.5,rollingShutter:true},temporal)));
  const reversedRolling=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:.5,rollingShutter:true},{...temporal,direction:-1})));
  const center=(data,y)=>{
    let total=0,sum=0;
    for(let x=85;x<200;x++){const weight=Math.max(0,data[(y*w+x)*4]-80);total+=weight;sum+=weight*x;}
    return sum/total;
  };
  const skew=data=>(center(data,110)-center(d,110))-(center(data,70)-center(d,70));
  report.rollingShutter={forwardSkew:skew(rolling),reverseSkew:skew(reversedRolling)};
  check(report.rollingShutter.forwardSkew>.4,'rolling shutter shifts lower scanlines later than upper scanlines');
  check(report.rollingShutter.reverseSkew<-.4,'rolling shutter scan follows reversed source playback');
  const globalAgain=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:.5,rollingShutter:false},temporal)));
  check(globalAgain.every((v,i)=>v===d[i]),'turning rolling shutter off restores the original global shutter exactly');
  check(at(d,w,111,70)[0]>at(original,w,111,70)[0]+10,'natural blur reconstructs motion at silhouette');
  let staticError=0,n=0;for(let y=10;y<40;y++)for(let x=10;x<300;x++){const i=(y*w+x)*4;staticError+=Math.abs(d[i]-original[i]);n++;}
  report.staticError=staticError/n;check(report.staticError<3,'static background stays sharp');
  const accum=new Float64Array(original.length),samples=64;
  const lin=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  const enc=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
  for(let i=0;i<samples;i++){
    const ideal=pixels(frame(w,h,((i+.5)/samples-.5)*8));
    for(let j=0;j<ideal.length;j+=4)for(let k=0;k<3;k++)accum[j+k]+=lin(ideal[j+k]/255)/samples;
  }
  let naturalError=0,sharpError=0;
  for(let i=0;i<original.length;i+=4)for(let k=0;k<3;k++){
    const ideal=enc(accum[i+k])*255;naturalError+=Math.abs(d[i+k]-ideal);sharpError+=Math.abs(original[i+k]-ideal);
  }
  report.shutterReference={naturalMAE:naturalError/(w*h*3),sharpMAE:sharpError/(w*h*3)};
  check(naturalError<sharpError*.8,'natural blur is closer to a sampled 180-degree exposure than the sharp source');
  const naturalMasked=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:.5},temporal,matte)));
  check(at(naturalMasked,w,115,70).every((v,i)=>Math.abs(v-at(original,w,115,70)[i])<3),'natural effect mask protects the foreground');
  const rollingMasked=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:.5,rollingShutter:true},temporal,matte)));
  check(at(rollingMasked,w,115,70).every((v,i)=>Math.abs(v-at(original,w,115,70)[i])<3),'rolling shutter respects the protected foreground mask');
  check(at(naturalMasked,w,111,70)[0]<at(d,w,111,70)[0],'natural mask protects the boundary around the foreground');
  // Repeating with a different amount must reuse motion but change exposure.
  const cachedStart=performance.now(),strong=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:1},temporal)));
  report.cachedMs=performance.now()-cachedStart;check(strong.some((v,i)=>Math.abs(v-d[i])>8),'amount changes shutter length');
  const still={...temporal,previous:{img:source,time:0},next:{img:source,time:2/30},key:'still'};
  const stillPixels=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:1},still)));
  let maxStill=0;for(let i=0;i<original.length;i++)maxStill=Math.max(maxStill,Math.abs(stillPixels[i]-original[i]));
  report.maxStill=maxStill;check(maxStill<=2,'stationary shot is unchanged');
  const rollingStill=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:1,rollingShutter:true},still)));
  check(rollingStill.every((v,i)=>Math.abs(v-original[i])<=2),'rolling shutter leaves stationary footage unchanged');
  const cut=canvas(w,h);cut.getContext('2d').fillStyle='white';cut.getContext('2d').fillRect(0,0,w,h);
  const cutTemporal={...temporal,previous:{img:cut,time:0},next:{img:cut,time:2/30},key:'cut'};
  const cutPixels=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:1},cutTemporal)));
  let cutError=0;for(let i=0;i<original.length;i++)cutError=Math.max(cutError,Math.abs(cutPixels[i]-original[i]));
  report.cutError=cutError;check(cutError<=2,'hard cuts do not create trails');
  const rollingCut=pixels(copy(renderNaturalMotionBlur(source,w,h,{amount:1,rollingShutter:true},cutTemporal)));
  check(rollingCut.every((v,i)=>Math.abs(v-original[i])<=2),'rolling shutter does not cross scene cuts');
  // Real full-frame renderer: effect-scoped masks, clip transforms and a scaled
  // export go through the same path as the timeline preview.
  const effect=makeVideoEffect('motionBlur');effect.p={...p};
  const clip=makeClip('video',{dur:2,props:{vfx:[effect]}}),mask=addMask(clip,'rect',w,h);
  clip.props.masks[0].effect=effect.id;clip.props.masks[0].invert=true;
  clip.props[`mask.${mask}.w`]=75;clip.props[`mask.${mask}.h`]=90;clip.props[`mask.${mask}.x`]=-12;
  const project={width:w,height:h,fps:30,media:{},clips:{[clip.id]:clip}};
  const g=canvas(w,h).getContext('2d'),f={T:1,layers:[{clip,T:1}],captions:[]};
  drawFrame(g,project,f,()=>({img:source,w,h}));
  check(at(pixels(g.canvas),w,115,70).every((v,i)=>Math.abs(v-at(original,w,115,70)[i])<3),'full renderer effect mask preserves foreground');
  check(at(pixels(g.canvas),w,10,60)[3]===255,'effect mask keeps rest of clip visible');
  const big=canvas(w*2,h*2).getContext('2d');drawFrame(big,project,f,()=>({img:source,w,h}),{scale:2});
  const small=canvas(w,h);small.getContext('2d').drawImage(big.canvas,0,0,w,h);
  const expected=pixels(g.canvas),actual=pixels(small);let mean=0;for(let i=0;i<actual.length;i++)mean+=Math.abs(actual[i]-expected[i]);
  report.scaledError=mean/actual.length;check(report.scaledError<2,'scaled export agrees with preview');
  report.checks=checks;
  // Realistic fast-shutter texture motion: compare to a densely sampled ideal
  // exposure, evaluated in linear light by the same spatial integration kernel.
  const nw=1920,nh=1080,hd=frame(nw,nh),hdTemporal={previous:{img:frame(nw,nh,-32),time:0},current:{img:hd,time:1/30},next:{img:frame(nw,nh,32),time:2/30},exposure:1/30,key:'hd'};
  const t=performance.now();const hdOut=copy(renderNaturalMotionBlur(hd,nw,nh,{amount:.5},hdTemporal));pixels(hdOut);report.hdMs=performance.now()-t;
  return {report,preview:await natural.convertToBlob({type:'image/png'}).then(async b=>Array.from(new Uint8Array(await b.arrayBuffer())))};
}
