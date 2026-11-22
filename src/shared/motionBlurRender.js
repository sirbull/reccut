import { motionSceneCut, unit } from './motionBlur.js';

const canvas = (w = 1, h = 1) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
const VS = `#version 300 es
in vec2 pos; out vec2 uv;
void main(){uv=pos*0.5+0.5;gl_Position=vec4(pos,0,1);}`;
const HEADER = `#version 300 es
precision highp float;
in vec2 uv; out vec4 result;
uniform sampler2D currentImage, previousImage, nextImage, flowImage, backImage, maskImage;
uniform vec2 size;
uniform bool masked;
float maskAt(vec2 p){return masked?texture(maskImage,clamp(p,0.0,1.0)).a:1.0;}
vec3 linearize(vec3 c){return mix(c/12.92,pow((c+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),c));}
vec3 encode(vec3 c){return mix(c*12.92,1.055*pow(max(c,0.0),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c));}
vec4 light(vec4 c){return vec4(linearize(c.rgb/max(c.a,0.000001))*c.a,c.a);}
vec4 color(vec4 c){return vec4(encode(c.rgb/max(c.a,0.000001)),c.a);}
bool inside(vec2 p){return all(greaterThanEqual(p,vec2(0)))&&all(lessThanEqual(p,vec2(1)));}
`;
const SPATIAL = `${HEADER}
uniform int kind, count;
uniform float amount, angle, bias;
uniform vec2 center;
void main(){
 vec4 original=texture(currentImage,uv), sum=vec4(0);float total=0.0;
 for(int i=0;i<128;i++){
  if(i>=count)break;
  float t=(float(i)+0.5)/float(count)-0.5+bias*0.5;
  vec2 p=uv;
  if(kind==0)p+=vec2(cos(angle),sin(angle))*amount*t/size;
  else if(kind==1)p=center+(uv-center)*exp(amount*0.002*t);
  else{float a=amount*0.0034906585*t;float c=cos(a),s=sin(a);vec2 d=(uv-center)*size;p=center+vec2(c*d.x-s*d.y,s*d.x+c*d.y)/size;}
  p=clamp(p,0.5/size,1.0-0.5/size);
  float w=maskAt(p);sum+=light(texture(currentImage,p))*w;total+=w;
 }
 vec4 blurred=total>0.00001?sum/total:light(original);
 result=color(mix(light(original),blurred,maskAt(uv)));
}`;

// Coarse-to-fine dense patch search. Forward and reverse fields are computed
// independently; no vectors are inferred from previous playback calls.
const FLOW = `${HEADER}
uniform float lod, stepSize;
uniform bool first, reverseFlow;
vec4 at(vec2 p,int which){return which==0?textureLod(currentImage,p,lod):which==1?textureLod(previousImage,p,lod):textureLod(nextImage,p,lod);}
float cost(vec2 p,vec2 d,int neighbour){
 float e=0.0; vec2 texel=exp2(lod)/size;
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  vec2 q=p+vec2(i,j)*texel;
  vec4 a=at(q,reverseFlow?neighbour:0),b=at(q+d,reverseFlow?0:neighbour);
  // RGB plus coverage, so keyed/transparent footage can be analysed too.
  vec3 delta=a.rgb-b.rgb;
  e+=dot(abs(delta),vec3(0.2126,0.7152,0.0722))+abs(a.a-b.a)*0.3;
 }
 return e/9.0;
}
vec2 solve(int neighbour,vec2 initial){
 vec2 best=initial;float e=cost(uv,best,neighbour)+length(best*size)*0.00002;
 // Always test zero: a coarse moving patch must not drag a static background.
 float zero=cost(uv,vec2(0),neighbour);if(zero<e){e=zero;best=vec2(0);}
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  vec2 d=initial+vec2(i,j)*exp2(lod)*stepSize/size;
  float c=cost(uv,d,neighbour)+length(d*size)*0.00002;
  if(c<e){e=c;best=d;}
 }
 // Spatial propagation recovers motion lost at coarse scales near silhouettes.
 for(int j=0;j<4;j++){
  vec2 off=j==0?vec2(1,0):j==1?vec2(-1,0):j==2?vec2(0,1):vec2(0,-1);
  vec4 f=first?vec4(0):texture(flowImage,uv+off/vec2(textureSize(flowImage,0)));
  vec2 d=neighbour==1?f.xy:f.zw;
  float c=cost(uv,d,neighbour)+length(d*size)*0.00002;
  if(c<e){e=c;best=d;}
 }
 return best;
}
void main(){vec4 f=first?vec4(0):texture(flowImage,uv);result=vec4(solve(1,f.xy),solve(2,f.zw));}`;

const NATURAL = `${HEADER}
uniform vec2 exposure;
uniform float rollingScan;
uniform int count;
vec2 vectorAt(sampler2D field,vec2 p,int side){
 // Joint bilateral upsampling keeps flow on its own side of a colour edge.
 vec2 fs=vec2(textureSize(field,0)),q=p*fs-0.5,b=floor(q),f=fract(q);
 vec4 ref=texture(currentImage,p);vec2 sum=vec2(0);float total=0.0;
 for(int j=0;j<2;j++)for(int i=0;i<2;i++){
  vec2 x=(b+vec2(i,j)+0.5)/fs;vec4 c=texture(currentImage,x);
  float w=(i==0?1.0-f.x:f.x)*(j==0?1.0-f.y:f.y)*exp(-20.0*length(c-ref));
  vec4 v=texture(field,x);sum+=(side==0?v.xy:v.zw)*w;total+=w;
 }
 return total>0.00001?sum/total:vec2(0);
}
vec4 neighbour(vec2 p,int side){return side==0?texture(previousImage,p):texture(nextImage,p);}
vec2 rawFlow(sampler2D field,vec2 p,int side){vec4 v=texture(field,p);return side==0?v.xy:v.zw;}
vec4 interpolated(float t,int side){
 vec2 p=uv-t*vectorAt(flowImage,uv,side),q=uv-(1.0-t)*rawFlow(backImage,uv,side);
 // Invert each endpoint's motion to reconstruct a subframe at this pixel.
 for(int k=0;k<2;k++){
  p=uv-t*rawFlow(flowImage,p,side);
  q=uv-(1.0-t)*rawFlow(backImage,q,side);
 }
 vec2 f=rawFlow(flowImage,p,side),b=rawFlow(backImage,q,side);
 float e0=length((f+rawFlow(backImage,p+f,side))*size);
 float e1=length((b+rawFlow(flowImage,q+b,side))*size);
 float v0=(inside(p)&&inside(p+f)?1.0:0.0)*(1.0-smoothstep(0.75,2.5+length(f*size)*0.08,e0));
 float v1=(inside(q)&&inside(q+b)?1.0:0.0)*(1.0-smoothstep(0.75,2.5+length(b*size)*0.08,e1));
 vec4 a=texture(currentImage,p),c=neighbour(q,side);
 // Photometric confidence prevents uncertain correspondences making long trails.
 float photo=length(a.rgb-c.rgb)+abs(a.a-c.a);
 float confidence=1.0-smoothstep(0.12,0.5,photo);
 float w0=(1.0-t)*v0*maskAt(p),w1=t*v1*maskAt(q+b);
 float w=w0+w1;
 vec4 val=w>0.00001?(light(a)*w0+light(c)*w1)/w:light(texture(currentImage,uv));
 return mix(light(texture(currentImage,uv)),val,confidence*clamp(w*2.0,0.0,1.0));
}
void main(){
 vec4 original=texture(currentImage,uv),sum=vec4(0);
 for(int i=0;i<64;i++){
  if(i>=count)break;
  float s=(float(i)+0.5)/float(count)*2.0-1.0;
  // A top-to-bottom readout spans half the chosen exposure duration.
  // At zero scan the original centered global-shutter samples are unchanged.
  s+=(uv.y-0.5)*rollingScan;
  int side=s<0.0?0:1;
  sum+=interpolated(abs(s)*(side==0?exposure.x:exposure.y),side);
 }
 result=color(mix(light(original),sum/float(count),maskAt(uv)));
}`;

let gpu, failure, thumb;
function setup() {
  if (gpu || failure) return gpu;
  try {
    const output = canvas(), gl = output.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 is unavailable');
    const compile = (type, source) => {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const programs = [SPATIAL, FLOW, NATURAL].map((source,index) => {
      const vertex=index===1?VS:VS.replace('uv=pos*0.5+0.5;','uv=vec2(pos.x*0.5+0.5,0.5-pos.y*0.5);');
      const p = gl.createProgram(), vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, source);
      gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const names = ['currentImage','previousImage','nextImage','flowImage','backImage','maskImage','size','masked','kind','count','amount','angle','bias','center','lod','stepSize','first','reverseFlow','exposure','rollingScan'];
      return { p, u: Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)])) };
    });
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const texture = () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      for (const [key, v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D,key,v);
      return t;
    };
    gpu = { gl, output, programs, texture, images: Array.from({ length: 4 }, texture), fields: Array.from({ length: 4 }, texture), fb: gl.createFramebuffer(), float: Boolean(gl.getExtension('EXT_color_buffer_float')), cached: null };
    output.addEventListener('webglcontextlost',event=>event.preventDefault());
    output.addEventListener('webglcontextrestored',()=>{gpu=null;});
    if(gpu.float)for(const field of gpu.fields){gl.bindTexture(gl.TEXTURE_2D,field);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,1,1,0,gl.RGBA,gl.HALF_FLOAT,null);}
  } catch (e) { failure = e; console.warn('Motion blur uses CPU fallback:', e.message); }
  return gpu;
}
function use(g, index, w, h, mask) {
  const { gl } = g, { p, u } = g.programs[index]; gl.useProgram(p);
  const pos = gl.getAttribLocation(p,'pos');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  gl.uniform2f(u.size,w,h); gl.uniform1i(u.masked,Boolean(mask));
  ['currentImage','previousImage','nextImage','flowImage','backImage','maskImage'].forEach((n,i) => gl.uniform1i(u[n],i));
  return u;
}
function bind(g, i, t) { g.gl.activeTexture(g.gl.TEXTURE0+i);g.gl.bindTexture(g.gl.TEXTURE_2D,t); }
function upload(g, i, img, mip = false) {
  const { gl } = g; bind(g,i,g.images[i]);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mip?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
  if(mip)gl.generateMipmap(gl.TEXTURE_2D);
}
function finish(g,w,h) {
  g.gl.bindFramebuffer(g.gl.FRAMEBUFFER,null);
  if(g.output.width!==w||g.output.height!==h){g.output.width=w;g.output.height=h;}
  g.gl.viewport(0,0,w,h);g.gl.drawArrays(g.gl.TRIANGLE_STRIP,0,4);
  return g.output;
}
function supported(g,w,h) { return g && !g.gl.isContextLost() && Math.max(w,h)<=g.gl.getParameter(g.gl.MAX_TEXTURE_SIZE); }
export function naturalMotionSupported(w=1,h=1){const g=setup();return Boolean(g?.float&&supported(g,w,h));}

export function renderMotionBlur(img,w,h,p,mask=null,scale=1) {
  if (!(p.amount>0)) return img;
  const g=setup();
  if (!supported(g,w,h)) return cpuMotionBlur(img,w,h,p,mask,scale);
  const { gl }=g,u=use(g,0,w,h,mask);
  upload(g,0,img);if(mask){bind(g,5,g.images[3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mask);}
  const kind=p.mode==='zoom'?1:p.mode==='spin'?2:0;
  gl.uniform1i(u.kind,kind);gl.uniform1i(u.count,Math.min(128,Math.max(16,Math.ceil(p.amount*1.5))));
  gl.uniform1f(u.amount,Math.max(0,Math.min(300,p.amount))*(kind===0?scale:1));
  gl.uniform1f(u.angle,(p.angle||0)*Math.PI/180);gl.uniform1f(u.bias,Math.max(-1,Math.min(1,p.bias||0)));
  gl.uniform2f(u.center,unit(p.centerX,0.5),unit(p.centerY,0.5));
  return finish(g,w,h);
}

function thumbnail(img) {
  thumb ||= canvas(48,27);const g=thumb.getContext('2d',{willReadFrequently:true});
  g.clearRect(0,0,48,27);g.drawImage(img,0,0,48,27);return g.getImageData(0,0,48,27).data;
}
export function renderNaturalMotionBlur(img,w,h,p,temporal,mask=null) {
  if (!(p.amount>0) || !temporal || !(temporal.exposure>0)) return img;
  const g=setup();
  if (!supported(g,w,h) || !g.float) return img;
  const { gl }=g;
  // Frames have an immutable identity supplied by the decoder; slider edits and
  // duplicate effect instances reuse the field. GPU surfaces stay bounded.
  const key=temporal.key;
  const same=key!=null&&g.cached?.key===key&&g.cached.w===w&&g.cached.h===h;
  if(!same){
    const a=thumbnail(temporal.current.img),b=thumbnail(temporal.previous.img),c=thumbnail(temporal.next.img);
    const cuts=[motionSceneCut(a,b),motionSceneCut(a,c)];
    upload(g,0,temporal.current.img,true);upload(g,1,temporal.previous.img,true);upload(g,2,temporal.next.img,true);
    const finest=Math.max(0,Math.ceil(Math.log2(Math.max(w,h)/640)));
    const coarsest=Math.max(finest,Math.floor(Math.log2(Math.max(w,h)/24)));
    const u=use(g,1,w,h,false);
    gl.bindFramebuffer(gl.FRAMEBUFFER,g.fb);
    for(let reverse=0;reverse<2;reverse++){
      let read=reverse*2,write=read+1,first=true;
      gl.uniform1i(u.reverseFlow,reverse);
      for(let level=coarsest;level>=finest;level--){
        const fw=Math.max(1,Math.floor(w/2**level)),fh=Math.max(1,Math.floor(h/2**level));
        for(const step of [1,0.5]){
          bind(g,3,g.fields[read]);bind(g,4,g.fields[write]);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,fw,fh,0,gl.RGBA,gl.HALF_FLOAT,null);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,g.fields[write],0);
          if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Motion flow framebuffer unavailable');
          gl.viewport(0,0,fw,fh);gl.uniform1f(u.lod,level);gl.uniform1f(u.stepSize,step);gl.uniform1i(u.first,first);
          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);first=false;[read,write]=[write,read];
        }
      }
      if(reverse===0)g.forward=read;else g.backward=read;
    }
    g.cached={key,w,h,cuts};
  }
  // The effect uses the processed stack input for the centre image, while flow
  // always sees the unmodified source (noise and colour effects cannot move it).
  upload(g,0,img);
  upload(g,1,temporal.processedPrevious||temporal.previous.img);
  upload(g,2,temporal.processedNext||temporal.next.img);
  const u=use(g,2,w,h,mask);bind(g,3,g.fields[g.forward]);bind(g,4,g.fields[g.backward]);
  if(mask){bind(g,5,g.images[3]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mask);}
  const dt0=temporal.current.time-temporal.previous.time,dt1=temporal.next.time-temporal.current.time;
  gl.uniform2f(u.exposure,dt0>1e-6&&!g.cached.cuts[0]?Math.min(0.5,unit(p.amount)*temporal.exposure/(2*dt0)):0,dt1>1e-6&&!g.cached.cuts[1]?Math.min(0.5,unit(p.amount)*temporal.exposure/(2*dt1)):0);
  gl.uniform1f(u.rollingScan,p.rollingShutter?(temporal.direction===-1?-1:1):0);
  gl.uniform1i(u.count,32);
  return finish(g,w,h);
}

// Canvas fallback is deliberately bounded. It performs the same spatial kernel
// in linear premultiplied light; temporal fallback is implemented below.
const srgbToLinear = v => v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
const linearToSrgb = v => v<=0.0031308?v*12.92:1.055*v**(1/2.4)-0.055;
function read(img,w,h) { const c=canvas(w,h),g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0,w,h);return g.getImageData(0,0,w,h).data; }
function sample(data,w,h,x,y,out) {
  x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const X=Math.floor(x),Y=Math.floor(y),fx=x-X,fy=y-Y;
  out.fill(0);
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){
    const n=(Math.min(h-1,Y+j)*w+Math.min(w-1,X+i))*4,weight=(i?fx:1-fx)*(j?fy:1-fy),a=data[n+3]/255;
    for(let k=0;k<3;k++)out[k]+=srgbToLinear(data[n+k]/255)*a*weight;out[3]+=a*weight;
  }
}
function write(out,index,sum,total) {
  const a=sum[3]/total;for(let k=0;k<3;k++)out[index+k]=linearToSrgb(sum[k]/Math.max(1e-8,sum[3]))*255;out[index+3]=a*255;
}
function cpuMotionBlur(img,w,h,p,mask,scale) {
  const data=read(img,w,h),matte=mask?read(mask,w,h):null,out=new Uint8ClampedArray(data.length),v=new Float64Array(4),sum=new Float64Array(4);
  const count=Math.min(64,Math.max(16,Math.ceil(p.amount))),cx=unit(p.centerX,0.5)*w,cy=unit(p.centerY,0.5)*h,angle=(p.angle||0)*Math.PI/180;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const index=(y*w+x)*4,m=matte?matte[index+3]/255:1;sum.fill(0);let total=0;
    for(let i=0;i<count;i++){
      const t=(i+0.5)/count-0.5+(p.bias||0)*0.5;let px=x,py=y;
      if(p.mode==='zoom'){const s=Math.exp(p.amount*0.002*t);px=cx+(x-cx)*s;py=cy+(y-cy)*s;}
      else if(p.mode==='spin'){const a=p.amount*0.0034906585*t;px=cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a);py=cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a);}
      else{px+=Math.cos(angle)*p.amount*scale*t;py+=Math.sin(angle)*p.amount*scale*t;}
      const weight=matte?matte[(Math.max(0,Math.min(h-1,Math.round(py)))*w+Math.max(0,Math.min(w-1,Math.round(px))))*4+3]/255:1;
      sample(data,w,h,px,py,v);for(let k=0;k<4;k++)sum[k]+=v[k]*weight;total+=weight;
    }
    sample(data,w,h,x,y,v);if(total<1e-8){out.set(data.subarray(index,index+4),index);continue;}
    for(let k=0;k<4;k++)sum[k]=sum[k]/total*m+v[k]*(1-m);write(out,index,sum,1);
  }
  const c=canvas(w,h);c.getContext('2d').putImageData(new ImageData(out,w,h),0,0);return c;
}

