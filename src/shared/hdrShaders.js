import { ANALOG_GLSL } from './analogShader.js';
import { SDR_KNEE } from './hdr.js';
// All color images in these passes are display-linear BT.2020, in 203-nit units.
// FBO images are premultiplied only at the composition/transition boundary.
export const HDR_VERTEX = `#version 300 es
layout(location=0) in vec2 pos; layout(location=1) in vec2 uv; out vec2 vUV;
void main(){gl_Position=vec4(pos,0.,1.);vUV=uv;}`;

export const HDR_COLOR_GLSL = `
const vec3 LUMA=vec3(.2627,.678,.0593);
vec3 srgbLinear(vec3 c){return mix(c/12.92,pow(max((c+.055)/1.055,0.),vec3(2.4)),step(vec3(.04045),c));}
vec3 srgb2020(vec3 s){s=srgbLinear(s);return vec3(dot(s,vec3(.627403896,.329283038,.043313066)),dot(s,vec3(.069097289,.919540395,.011362316)),dot(s,vec3(.016391439,.088013308,.895595253)));}
vec3 toPerceptual(vec3 c){return log2(1.+max(c,0.))/log2(2.);}
vec3 fromPerceptual(vec3 c){return exp2(c)-1.;}
vec4 at(sampler2D img,vec2 uv){return texture(img,vec2(uv.x,1.-uv.y));}
vec3 rotateHue(vec3 c,float angle){
 float y=dot(c,LUMA);vec2 chroma=vec2((c.b-y)/(2.*(1.-LUMA.b)),(c.r-y)/(2.*(1.-LUMA.r)));
 chroma=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*chroma;
 float red=y+chroma.y*2.*(1.-LUMA.r),blue=y+chroma.x*2.*(1.-LUMA.b);
 return vec3(red,(y-LUMA.r*red-LUMA.b*blue)/LUMA.g,blue);
}
`;

// Final SDR display transform, after effects and linear-light compositing.
// Fit the gamut toward equal-luminance neutral rather than clipping channels.
export const SDR_OUTPUT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;out vec4 outColor;uniform sampler2D image;
${HDR_COLOR_GLSL}
void main(){
 vec3 c=at(image,vUV).rgb;
 float y=max(dot(c,LUMA),0.),k=${SDR_KNEE},h=1.-k;
 float mapped=y<=k?y:k+h*(y-k)/(y-k+h);
 vec3 rgb=vec3(dot(c,vec3(1.660491,-.587641,-.072850)),dot(c,vec3(-.124550,1.132900,-.008349)),dot(c,vec3(-.018151,-.100579,1.118730)));
 rgb*=y>1e-7?mapped/y:0.;
 vec3 d=rgb-vec3(mapped);float chroma=1.;
 for(int i=0;i<3;i++){if(d[i]<-1e-7)chroma=min(chroma,mapped/-d[i]);else if(d[i]>1e-7)chroma=min(chroma,(1.-mapped)/d[i]);}
 outColor=vec4(clamp(vec3(mapped)+max(chroma,0.)*d,0.,1.),1.);
}`;

export const HDR_EFFECT_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;out vec4 outColor;
uniform sampler2D image,extra;
uniform int kind,sampleCount;uniform vec4 p,q;
uniform vec3 color,wb,lift,gammaV,gain;
uniform vec4 grade;uniform vec4 style;
uniform vec2 stepUV;uniform bool premultiplied;
uniform sampler2D mask;uniform bool useEffectMask;
uniform vec3 ranges[8];uniform vec2 adjustments[8];
uniform sampler2D originalImage;uniform uint seed,baseSeed;
uniform float amount,clock,splitAmount,noiseAmount,lineAmount;
uniform vec4 tape,film,damage;uniform vec2 opticalCenter;uniform float falloff;
uniform highp sampler3D filmLut;
uniform vec4 lamps[2],lighting[4];uniform vec3 lampColors[2],lampEdges[2];
${HDR_COLOR_GLSL}
vec4 blurAt(vec2 uv){
 vec4 sum=vec4(0);float weights=0.;
 for(int i=-12;i<=12;i++){
  float x=float(i)/4.,weight=exp(-.5*x*x);
  vec4 c=at(image,clamp(uv+float(i)*stepUV,vec2(0),vec2(1)));
  if(!premultiplied)c.rgb*=c.a;
  sum+=c*weight;weights+=weight;
 }
 sum/=weights;
 if(!premultiplied)sum.rgb=sum.a>1e-7?sum.rgb/sum.a:vec3(0);
 return sum;
}
uint hash(uint n){n=(n^(n>>16u))*0x7feb352du;n=(n^(n>>15u))*0x846ca68bu;return n^(n>>16u);}
float random(uint n){return float(hash(n)&65535u)/65535.;}
float random(vec2 v){return fract(sin(dot(v,vec2(12.9898,78.233))+q.w*37.719)*43758.5453);}
vec3 rec709to2020(vec3 s){return vec3(dot(s,vec3(.627403896,.329283038,.043313066)),dot(s,vec3(.069097289,.919540395,.011362316)),dot(s,vec3(.016391439,.088013308,.895595253)));}
vec3 lightBlend(vec3 c,vec3 e,int blend){
 if(blend==0)return c+e;
 if(blend==1)return c+min(e,1.)*max(1.-c,0.);
 float peak=max(1.,max(c.r,max(c.g,c.b)));vec3 b=clamp(c/peak,0.,1.),s=.5+.5*clamp(e,0.,1.);
 vec3 outc=blend==2?(1.-2.*s)*b*b+2.*s*b:mix(2.*b*s,1.-2.*(1.-b)*(1.-s),step(vec3(.5),b));
 return outc*peak;
}
${ANALOG_GLSL.replace('uniform sampler2D originalImage;', '').replace('uniform uint baseSeed;', '').replace('uniform vec4 tape, film, damage;', '').replace('uniform vec2 opticalCenter;', '').replace('uniform float falloff;', '').replace('texture(image,(p+0.5)/outputSize()).rgb', 'at(image,(p+0.5)/outputSize()).rgb')}
void main(){
 vec4 c=at(image,vUV);
 if(kind==1)c=blurAt(vUV);
 else if(kind==2){float y=dot(c.rgb,LUMA);c.rgb=mix(vec3(y),c.rgb,max(0.,p.x));}
 else if(kind==3)c.rgb=(c.rgb-.18)*p.x+.18;
 else if(kind==4)c.a*=clamp(p.x,0.,1.);
 else if(kind==5){
  vec3 fill=p.z>0.?srgb2020(texture(extra,vUV).rgb):color;float amount=clamp(p.x,0.,1.);
  if(p.y>.5)c.rgb=mix(c.rgb,fill,amount);
  else{float a=mix(c.a,1.,amount);c.rgb=a>1e-7?(c.rgb*c.a*(1.-amount)+fill*amount)/a:vec3(0);c.a=a;}
 }
 else if(kind==6){vec2 cell=floor(vUV*vec2(textureSize(image,0))/max(1.,p.y));float n=random(cell)-.5;vec3 noise=p.z>.5?vec3(n,random(cell+17.)-.5,random(cell+37.)-.5):vec3(n);c.rgb+=noise*p.x*.62745;}
 else if(kind==7||kind==8){vec2 d=p.xy;if(kind==8){vec2 r=vUV-q.xy;d=r*p.x*.012*pow(length(r)*1.41421356,p.y);}c.r=at(image,clamp(vUV+d,0.,1.)).r;c.b=at(image,clamp(vUV-d,0.,1.)).b;}
 else if(kind==9){float row=floor(vUV.y*float(textureSize(image,0).y));c.rgb*=1.-p.x*(mod(row,p.y)<ceil(p.y*.5)?1.:0.);}
 else if(kind==10){float band=floor(vUV.y*p.y);if(random(vec2(band,0))<p.x){float shift=(random(vec2(band,19))-.5)*p.x*.18,split=p.z*p.x*.02;c=at(image,clamp(vUV+vec2(shift,0),0.,1.));c.r=at(image,clamp(vUV+vec2(shift+split,0),0.,1.)).r;c.b=at(image,clamp(vUV+vec2(shift-split,0),0.,1.)).b;}}
 else if(kind==11)c.rgb+=at(extra,vUV).rgb*p.x;
 else if(kind==12){
  vec4 sum=vec4(0);float total=0.;vec2 size=vec2(textureSize(image,0));
  for(int i=0;i<128;i++){
   if(i>=sampleCount)break;
   float t=(float(i)+.5)/float(sampleCount)-.5+p.w*.5;vec2 uv=vUV;
   if(p.y<.5)uv+=vec2(cos(p.z),sin(p.z))*p.x*t/size;
   else if(p.y<1.5)uv=q.xy+(vUV-q.xy)*exp(p.x*.002*t);
   else{float a=p.x*.0034906585*t;vec2 d=(vUV-q.xy)*size;uv=q.xy+mat2(cos(a),sin(a),-sin(a),cos(a))*d/size;}
   uv=clamp(uv,.5/size,1.-.5/size);vec4 s=at(image,uv);float weight=useEffectMask?texture(mask,uv).a:1.;sum+=s*weight;total+=weight;
  }
  if(total>1e-7)sum/=total;else sum=c;
  c=vec4(sum.a>1e-7?sum.rgb/sum.a:vec3(0),sum.a);
 }
 else if(kind==13){
  float peak=max(1.,max(c.r,max(c.g,c.b)));vec3 s=c.rgb/peak;
  float hi=max(s.r,max(s.g,s.b)),lo=min(s.r,min(s.g,s.b)),chroma=hi-lo;
  if(chroma>1e-6){
   float l=(hi+lo)*.5,sat=chroma/max(1e-6,1.-abs(2.*l-1.));
   float h=fract((hi==s.r?(s.g-s.b)/chroma:hi==s.g?(s.b-s.r)/chroma+2.:(s.r-s.g)/chroma+4.)/6.);
   vec2 change=vec2(0);
   for(int i=0;i<8;i++){float d=fract(h-ranges[i].x+.5)-.5;float t=clamp(abs(d)/max(1e-6,d<0.?ranges[i].y:ranges[i].z),0.,1.);change+=adjustments[i]*(1.-t*t*(3.-2.*t));}
   h=fract(h+change.x);sat=clamp(sat*(1.+change.y),0.,1.);
   vec3 components=clamp(abs(fract(h+vec3(0,2./3.,1./3.))*6.-3.)-1.,0.,1.);
   c.rgb=mix(c.rgb,(vec3(l)+(1.-abs(2.*l-1.))*sat*(components-.5))*peak,p.x);
  }
 }
 else if(kind==14)c.rgb=renderFilm(floor(vUV*outputSize()));
 else if(kind==15)c.rgb=renderTape(floor(vUV*outputSize()));
 else if(kind==20){
  c.rgb*=exp2(p.x*2.)*wb;
  float y=max(0.,dot(c.rgb,LUMA));
  c.rgb*=1.+p.z*.6*(1.-smoothstep(0.,.55,y))+p.w*.45*smoothstep(.45,1.,y);
  c.rgb+=lift*(1.-clamp(c.rgb,0.,1.));
  c.rgb=pow(max(c.rgb,0.),1./max(gammaV,vec3(.05)))*gain;
  c.rgb=(c.rgb-.18)*(1.+p.y)+.18;
  y=dot(c.rgb,LUMA);c.rgb=mix(vec3(y),c.rgb,max(0.,1.+grade.x));
  c.rgb=mix(c.rgb,vec3(dot(c.rgb,vec3(.393,.769,.189)),dot(c.rgb,vec3(.349,.686,.168)),dot(c.rgb,vec3(.272,.534,.131))),style.x);
  y=dot(c.rgb,LUMA);c.rgb=mix(c.rgb,vec3(y),style.y);
  // Invert around reference white; HDR excursions remain signed until the final encoder.
  c.rgb=mix(c.rgb,vec3(1.)-c.rgb,style.z);
  c.rgb=rotateHue(c.rgb,style.w);
  float vignette=grade.y*smoothstep(.2,.72,length(vUV-.5));c.rgb*=1.-vignette;
 }
 else if(kind==21){
  vec3 rgb709=vec3(dot(c.rgb,vec3(1.660491,-.587641,-.072850)),dot(c.rgb,vec3(-.124550,1.132900,-.008349)),dot(c.rgb,vec3(-.018151,-.100579,1.118730)));
  float peak=max(1.,max(rgb709.r,max(rgb709.g,rgb709.b)));vec3 s=max(rgb709/peak,0.);
  s=mix(s*12.92,1.055*pow(s,vec3(1./2.4))-.055,step(vec3(.0031308),s));
  float n=float(textureSize(filmLut,0).x);vec3 looked=srgb2020(texture(filmLut,s*((n-1.)/n)+.5/n).rgb)*peak;
  c.rgb=mix(c.rgb,looked,p.x);
 }
 else if(kind==22){vec3 e=rec709to2020(at(extra,vUV).rgb);c.rgb=lightBlend(c.rgb,e,int(p.x));}
 else if(kind==23){
  vec3 emission=vec3(0);vec2 size=vec2(textureSize(image,0));
  for(int i=0;i<2;i++){
   if(lamps[i].w<=0.)continue;
   float angle=lighting[2].x;vec2 d=(vUV-lamps[i].xy)*size/size.y;
   d=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*d;
   if(lighting[1].z>.5)d.x/=max(.1,lighting[1].w);
   float distance=length(d)/max(1e-6,lamps[i].z*(lighting[1].z>1.5?2.:1.));
   float soft=lighting[1].z>1.5?1.:max(.02,lighting[0].x),body=pow(smoothstep(0.,1.,(1.-distance)/soft),max(.1,lighting[0].y*(lighting[1].z>1.5?.6:1.)));
   float extent=1.+1.5*lighting[0].z,glow=lighting[0].z*.35*pow(clamp(1.-distance/extent,0.,1.),2.);
   float core=lighting[2].y>.5?lighting[2].w*(1.-smoothstep(0.,1.,distance/max(.005,lighting[2].z)))+lighting[3].x*.5*exp(-distance/(max(.005,lighting[2].z)*2.5)):0.;
   vec3 tint=mix(lampColors[i],lampEdges[i],smoothstep(0.,1.,distance));
   vec3 e=tint*lighting[0].w*lamps[i].w*(body+glow);e+=vec3(max(0.,max(e.r,max(e.g,e.b))-1.)*.35)+mix(lampColors[i],vec3(1),.7)*core*lamps[i].w;
   emission+=rec709to2020(srgbLinear(max(e,0.)));
  }
  c.rgb*=1.+emission*lighting[1].y*lighting[1].x;
  c.rgb=lightBlend(c.rgb,emission*lighting[1].x,int(lighting[3].y));
 }
 else if(kind==24){vec4 field=texture(extra,vUV);c.rgb=lightBlend(c.rgb,srgb2020(field.rgb)*field.a*p.x,int(p.y));}
 else if(kind==25){
  vec2 d=(vUV-.5)*2.,uv=p.xy+d*q.xy;float valid=length(d)<=1.?1.:0.,lit=1.;
  if(all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1)))){
   vec4 x=at(image,uv);float y=max(0.,dot(x.rgb,LUMA));float encoded=y<=.0031308?y*12.92:1.055*pow(y,1./2.4)-.055;
   lit=smoothstep(p.z-.1,p.z+.1,encoded*x.a);
  }
  outColor=vec4(lit*valid,valid,0,1);return;
 }
 else if(kind==26){vec2 uv=vUV-p.xy;float a=all(greaterThanEqual(uv,vec2(0)))&&all(lessThanEqual(uv,vec2(1)))?at(image,uv).a*p.z:0.;outColor=vec4(color*a,a);return;}
 else if(kind==27){
  vec2 local=(vUV-q.xy)/q.zw*p.xy,d=abs(local-p.xy*.5)-(p.xy*.5-p.z);
  float sd=length(max(d,0.))+min(max(d.x,d.y),0.)-p.z,aa=max(.001,fwidth(sd));c.a*=1.-smoothstep(-aa*.5,aa*.5,sd);
  if(p.w>0.)c.rgb=mix(c.rgb,color,smoothstep(-p.w-aa*.5,-p.w+aa*.5,sd));
 }
 else if(kind==28)c.rgb*=c.a;
 else if(kind==29)c.rgb=c.a>1e-7?c.rgb/c.a:vec3(0);
 outColor=vec4(clamp(c.rgb,vec3(-100.),vec3(10000./203.)),clamp(c.a,0.,1.));
}`;

export const HDR_MASK_FRAGMENT=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;
uniform sampler2D image,extra,mask;uniform int kind;uniform float strength;
${HDR_COLOR_GLSL}
void main(){vec4 a=at(image,vUV),b=at(extra,vUV);float m=kind==1||kind==3?texture(mask,vUV).a*strength:strength;
 if(kind==2||kind==3){outColor=vec4(mix(a.rgb,b.rgb,m*b.a),a.a);return;}
 float alpha=mix(a.a,b.a,m);outColor=vec4(alpha>1e-7?mix(a.rgb*a.a,b.rgb*b.a,m)/alpha:vec3(0),alpha);
}`;

export const HDR_KEY_FRAGMENT=`#version 300 es
precision highp float;in vec2 vUV;out vec4 outColor;
uniform sampler2D image,extra,viewer;uniform int kind,mode,radius;
uniform vec3 keyColor;uniform vec4 p,q,r,s;
uniform vec2 stepUV;
${HDR_COLOR_GLSL}
vec3 encoded(vec3 c){vec3 x=vec3(dot(c,vec3(1.660491,-.587641,-.072850)),dot(c,vec3(-.124550,1.132900,-.008349)),dot(c,vec3(-.018151,-.100579,1.118730)));return mix(x*12.92,1.055*pow(max(x,0.),vec3(1./2.4))-.055,step(vec3(.0031308),x));}
vec2 chroma(vec3 c){return vec2(dot(c,vec3(-.168736,-.331264,.5)),dot(c,vec3(.5,-.418688,-.081312)));}
void main(){vec4 c=at(image,vUV);
 if(mode==0){
  vec3 display=encoded(c.rgb);float distance=kind==2?length(texture(viewer,vUV).rgb-texture(extra,vUV).rgb)/sqrt(3.):kind==1?dot(display,vec3(.2126,.7152,.0722)):length(chroma(display)-chroma(keyColor));
  float a=smoothstep(p.x,p.x+max(.0001,p.y),distance);
  if(kind==0){
   int ch=keyColor.r>=keyColor.g&&keyColor.r>=keyColor.b?0:keyColor.g>=keyColor.b?1:2;
   float other=ch==0?max(display.g,display.b):ch==1?max(display.r,display.b):max(display.r,display.g);
   float keyOther=ch==0?max(keyColor.g,keyColor.b):ch==1?max(keyColor.r,keyColor.b):max(keyColor.r,keyColor.g);
   float excess=display[ch]-other,keyExcess=keyColor[ch]-keyOther;
   if(keyExcess>.001){a=max(a,clamp(1.-max(0.,excess)/keyExcess,0.,1.)*r.x);a=mix(a,min(a,1.-clamp(excess/keyExcess,0.,1.)),r.y);}
   float brightness=max(display.r,max(display.g,display.b)),keyBrightness=max(keyColor.r,max(keyColor.g,keyColor.b));
   float affinity=1.-smoothstep(r.w,r.w+.1,length(display/max(.001,brightness)-keyColor/max(.001,keyBrightness))/sqrt(3.));
   a=mix(a,clamp(1.-brightness/max(.001,keyBrightness),0.,1.),affinity*r.z);
   if(s.x>0.||r.y>0.){vec3 kc=srgb2020(keyColor);c.rgb=mix(c.rgb,(c.rgb-(1.-a)*kc)/max(.01,a),max(s.x,r.y));}
   int green=ch;float lo=green==0?max(c.g,c.b):green==1?max(c.r,c.b):max(c.r,c.g);c[green]-=max(0.,c[green]-lo)*p.z;
  }
  a=pow(clamp((a-q.x)/max(.001,q.y-q.x),0.,1.),1./max(.1,q.z));if(q.w>.5)a=1.-a;c.a*=a;
 }else if(mode==4)c=vec4(vec3(c.a),1.);
 else{
  float alpha=mode==1?1.:0.;
  for(int i=-64;i<=64;i++){if(abs(i)>radius)continue;float a=at(image,clamp(vUV+float(i)*stepUV,0.,1.)).a;if(mode==1)alpha=min(alpha,a);else if(mode==2)alpha=max(alpha,a);else alpha+=a/float(radius*2+1);}
  c.a=alpha;
 }
 outColor=c;
}`;

export const HDR_TRANSITION_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUV;out vec4 outColor;
uniform sampler2D image,extra;
uniform int kind,count;uniform float progress,span;
uniform vec4 rect;uniform vec2 projectSize;
${HDR_COLOR_GLSL}
vec4 side(sampler2D img,vec2 uv){if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))return vec4(0);return at(img,rect.xy+uv*rect.zw);}
vec4 transition(float p){
 float e=p*p*(3.-2.*p);vec2 uv=(vUV-rect.xy)/rect.zw;
 vec4 a=side(image,uv),b=side(extra,uv);
 if(kind==1||kind==2){vec4 dip=vec4(vec3(kind==2?1.:0.),1.);return p<.5?mix(a,dip,p*2.):mix(dip,b,(p-.5)*2.);}
 if(kind==3||kind==4){float dir=kind==3?-1.:1.;return side(image,uv-vec2(dir*e,0))+side(extra,uv-vec2(dir*(e-1.),0));}
 if(kind==5)return side(image,uv+vec2(0,e))+side(extra,uv-vec2(0,1.-e));
 if(kind==6)return mix(a,b,step(uv.x,e));
 if(kind==7)return mix(a,b,step(length((uv-.5)*projectSize),e*length(projectSize)*.5));
 if(kind==8)return mix(side(image,.5+(uv-.5)/(1.+.25*e)),side(extra,.5+(uv-.5)/(.9+.1*e)),e);
 return mix(a,b,e);
}
void main(){
 if(progress<=0.){outColor=at(image,vUV);return;}
 if(progress>=1.){outColor=at(extra,vUV);return;}
 vec4 c=vec4(0);
 for(int i=0;i<32;i++){if(i>=count)break;float p=clamp(progress+span*((float(i)+.5)/float(count)-.5),0.,1.);c+=transition(p)/float(count);}
 outColor=c;
}`;
