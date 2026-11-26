import { MOTION_GLSL } from './motionBlurRender.js';
import { motionSceneCut } from './motionBlur.js';
import { hlgDisplayLinear } from './hdr.js';
import { HDR_EFFECT_FRAGMENT } from './hdrShaders.js';
import { activeVideoEffects } from './videoEffects.js';

function shader(source){
  return source
    .replace('in vec2 uv;', 'in vec2 vUV;\n#define uv (vec2(vUV.x,1.-vUV.y))\n')
    .replace('vec4 light(vec4 c){return vec4(linearize(c.rgb/max(c.a,0.000001))*c.a,c.a);}', 'vec4 light(vec4 c){return vec4(c.rgb*c.a,c.a);}')
    .replace('vec4 color(vec4 c){return vec4(encode(c.rgb/max(c.a,0.000001)),c.a);}', 'vec4 color(vec4 c){return vec4(c.rgb/max(c.a,0.000001),c.a);}')
    .replace('vec3 delta=a.rgb-b.rgb;', 'vec3 delta=log2(1.+max(a.rgb,0.))-log2(1.+max(b.rgb,0.));')
    .replace('float photo=length(a.rgb-c.rgb)', 'float photo=length(log2(1.+max(a.rgb,0.))-log2(1.+max(c.rgb,0.)))')
    .replace('length(c-ref)', 'length(log2(1.+max(c.rgb,0.))-log2(1.+max(ref.rgb,0.)))')
    .replace('(uv.y-0.5)*rollingScan','(0.5-uv.y)*rollingScan')
    // The shared solver weights samples by the mask. The HDR stack applies
    // final coverage once, after reconstruction, together with other effects.
    .replace('result=color(mix(light(original),sum/float(count),maskAt(uv)));','result=color(sum/float(count));')
    // Coverage controls the final blend. Normalize kernel weights by local
    // coverage so a constant 50% mask does not change the motion solver itself.
    .replace('float maskAt(vec2 p){return masked?texture(maskImage,clamp(p,0.0,1.0)).a:1.0;}',
      'float maskAt(vec2 p){if(!masked)return 1.;vec2 q=clamp(p,0.,1.);float coverage=texture(maskImage,vec2(uv.x,1.-uv.y)).a;return clamp(texture(maskImage,vec2(q.x,1.-q.y)).a/max(.00001,coverage),0.,1.);}');
}
const FLOW=shader(MOTION_GLSL.flow),NATURAL=shader(MOTION_GLSL.natural);

function thumbnail(sample,hlg){
  const out=new Uint8ClampedArray(48*27*4),n=sample.w*sample.h;
  for(let y=0;y<27;y++)for(let x=0;x<48;x++){
    const i=Math.min(sample.h-1,Math.floor((y+.5)*sample.h/27))*sample.w+Math.min(sample.w-1,Math.floor((x+.5)*sample.w/48));
    let rgb=[sample.pixels[2*n+i],sample.pixels[i],sample.pixels[n+i]];
    if(hlg)rgb=hlgDisplayLinear(rgb);
    for(let c=0;c<3;c++){const v=Math.max(0,rgb[c]);out[(y*48+x)*4+c]=255*(v/(1+v))**(1/2.2);}
    out[(y*48+x)*4+3]=255;
  }
  return out;
}

export function hdrNaturalMotion(compositor,input,clip,e,T,mask){
  const context=compositor.effectContext,temporal=context.temporal,p=e.p;
  if(!(p.amount>0)||!temporal||!(temporal.exposure>0))return input;
  const s=compositor,gl=s.gl,raw=context.raw;
  const center=s.pass(HDR_EFFECT_FRAGMENT,input,s.surface('natural:center',input.w,input.h),{kind:['i',0]});
  const prev=s.linearSurface(temporal.previous,'natural:previous-raw',context.hlg),next=s.linearSurface(temporal.next,'natural:next-raw',context.hlg);
  const effects=activeVideoEffects(clip),prefix=effects.slice(0,effects.findIndex(x=>x.id===e.id)).filter(x=>x.type!=='naturalMotionBlur');
  const prefixClip={...clip,props:{...clip.props,vfx:prefix}};
  const analysis=context.analysis;
  context.analysis=temporal.analysisPrevious||analysis;
  const previous=prefix.length?s.pass(HDR_EFFECT_FRAGMENT,s.effects(prev,prefixClip,T,false),s.surface('natural:previous-processed',input.w,input.h),{kind:['i',0]}):prev;
  context.analysis=temporal.analysisNext||analysis;
  const following=prefix.length?s.pass(HDR_EFFECT_FRAGMENT,s.effects(next,prefixClip,T,false),s.surface('natural:next-processed',input.w,input.h),{kind:['i',0]}):next;
  context.analysis=analysis;
  for(const surface of [raw,prev,next]){
    gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,surface.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);
  }
  const finest=Math.max(0,Math.ceil(Math.log2(Math.max(input.w,input.h)/640))),coarsest=Math.max(finest,Math.floor(Math.log2(Math.max(input.w,input.h)/24)));
  const fields=[];
  for(let reverse=0;reverse<2;reverse++){
    let read=s.surface(`natural:field:${reverse}:0`,1,1),writeIndex=1,first=true;
    for(let level=coarsest;level>=finest;level--){
      const w=Math.max(1,Math.floor(input.w/2**level)),h=Math.max(1,Math.floor(input.h/2**level));
      for(const step of [1,.5]){
        const write=s.surface(`natural:field:${reverse}:${writeIndex}`,w,h);
        read=s.pass(FLOW,raw,write,{size:['2',[input.w,input.h]],lod:['f',level],stepSize:['f',step],first:['i',first?1:0],reverseFlow:['i',reverse],masked:['i',0]},prev,{nextImage:next,flowImage:read,backImage:read});
        first=false;writeIndex=1-writeIndex;
      }
    }
    fields.push(read);
  }
  const now=thumbnail(temporal.current,context.hlg),cuts=[motionSceneCut(now,thumbnail(temporal.previous,context.hlg)),motionSceneCut(now,thumbnail(temporal.next,context.hlg))];
  const dt0=temporal.current.timestamp-temporal.previous.timestamp,dt1=temporal.next.timestamp-temporal.current.timestamp;
  const amount=Math.max(0,Math.min(1,p.amount));
  const exposure=[dt0>1e-6&&!cuts[0]?Math.min(.5,amount*temporal.exposure/(2*dt0)):0,dt1>1e-6&&!cuts[1]?Math.min(.5,amount*temporal.exposure/(2*dt1)):0];
  if(mask)s.uploadMask(mask);
  const result=s.pass(NATURAL,center,s.surface('natural:result',input.w,input.h),{size:['2',[input.w,input.h]],exposure:['2',exposure],rollingScan:['f',p.rollingShutter?temporal.direction:0],count:['i',32],masked:['i',mask?1:0]},previous,{nextImage:following,flowImage:fields[0],backImage:fields[1]});
  s.check();return result;
}
