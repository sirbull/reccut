// HDR compositor: linear BT.2020, RGBA16F accumulation, float readback.
// Never pass HDR frames through Canvas 2D or the SDR grading shader.
import { HDR_WHITE } from './hdr.js';
import { clipMatrix, maskList, paintMask } from './shapes.js';
import { kfIntegral, kfTime, sourceTime, valueAt, vfxProp, visualOpacity } from './model.js';
import { gradeParams, wheelOffset } from './grade.js';
import { activeVideoEffects, effectParams, rgb } from './videoEffects.js';
import { animatedEffect, applyVideoEffects } from './videoEffectsRender.js';
import { renderGradient } from './gradientRender.js';
import { stylizeSettings } from './stylize.js';
import { hueSaturationSettings } from './hueSaturation.js';
import { sourceEffectMask, visibilityMaskClip } from './effectMasks.js';
import { bakeFilm } from './filmLooks.js';
import { lightsAt } from './lights.js';
import { lightLeakField, leakFieldSize } from './lightLeak.js';
import { hdrFlareEmission, releaseHdrFlarePixels } from './lensFlareRender.js';
import { hdrNaturalMotion } from './hdrMotion.js';
import { shadowStyle } from './shadow.js';
import { HDR_EFFECT_FRAGMENT, HDR_KEY_FRAGMENT, HDR_MASK_FRAGMENT, HDR_TRANSITION_FRAGMENT, HDR_VERTEX, SDR_OUTPUT_FRAGMENT } from './hdrShaders.js';

const color2020=hex=>{const c=rgb(hex).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return [[.627403896,.329283038,.043313066],[.069097289,.919540395,.011362316],[.016391439,.088013308,.895595253]].map(row=>row.reduce((s,x,i)=>s+x*c[i],0));};

const VERTEX = HDR_VERTEX;
const FRAGMENT = `#version 300 es
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray planes; uniform sampler2D raster,processed;
uniform int mode; uniform bool hlg;
uniform float opacity; uniform float exposure;
uniform sampler2D mask;uniform bool masked;uniform vec2 outputSize;
uniform vec4 corners,cropUV;uniform vec3 borderColor;uniform bool premultipliedInput;
in vec2 vUV; out vec4 outColor;
vec3 fetchRGB(ivec2 p){
  p=clamp(p,ivec2(0),textureSize(planes,0).xy-1);
  vec3 c=vec3(texelFetch(planes,ivec3(p,2),0).r,texelFetch(planes,ivec3(p,0),0).r,texelFetch(planes,ivec3(p,1),0).r);
  if(hlg){
    vec3 scene=pow(max(c*${HDR_WHITE.toFixed(1)}/1000.,vec3(0.)),vec3(1./1.2));
    c=scene*pow(dot(scene,vec3(.2627,.678,.0593)),.2)*1000./${HDR_WHITE.toFixed(1)};
  }
  return c;
}
vec3 sampleRGB(vec2 uv){
  vec2 p=uv*vec2(textureSize(planes,0).xy)-.5;
  ivec2 a=ivec2(floor(p)); vec2 f=fract(p);
  return mix(mix(fetchRGB(a),fetchRGB(a+ivec2(1,0)),f.x),mix(fetchRGB(a+ivec2(0,1)),fetchRGB(a+ivec2(1,1)),f.x),f.y);
}
vec3 srgbLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
void main(){
  vec3 c; float a=1.;
  if(mode==0){
    c=sampleRGB(vUV);
  }else if(mode==1){
    vec4 r=texture(raster,vUV); a=r.a;
    vec3 s=srgbLinear(r.rgb);
    c=vec3(dot(s,vec3(.627403896,.329283038,.043313066)),dot(s,vec3(.069097289,.919540395,.011362316)),dot(s,vec3(.016391439,.088013308,.895595253)));
  }else{vec4 r=texture(processed,vec2(vUV.x,1.-vUV.y));c=r.rgb;a=r.a;}
  if(corners.z>0.||corners.w>0.){
    vec2 local=(vUV-cropUV.xy)/(cropUV.zw-cropUV.xy)*corners.xy;
    vec2 q=abs(local-corners.xy*.5)-(corners.xy*.5-corners.z);
    float d=length(max(q,0.))+min(max(q.x,q.y),0.)-corners.z,aa=max(.001,fwidth(d));
    a*=1.-smoothstep(-aa*.5,aa*.5,d);
    if(corners.w>0.)c=mix(c,borderColor,smoothstep(-corners.w-aa*.5,-corners.w+aa*.5,d));
  }
  if(masked){float m=texture(mask,vec2(gl_FragCoord.x/outputSize.x,1.-gl_FragCoord.y/outputSize.y)).a;a*=m;if(premultipliedInput)c*=m;}
  outColor=vec4(min(c*exp2(exposure*2.),vec3(10000./${HDR_WHITE.toFixed(1)})),a*opacity);
}`;

export class HdrCompositor {
  constructor(w, h) {
    try { this.init(w, h); }
    catch (error) { this.close(); throw error; }
  }

  init(w, h) {
    this.w = w; this.h = h;
    this.canvas = new OffscreenCanvas(w, h);
    const gl = this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) throw new Error('HDR export needs WebGL 2 with floating-point color buffers. Try another graphics driver or export SDR.');
    const shader = (type, text) => {
      const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`HDR shader: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERTEX), fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(`HDR compositor: ${gl.getProgramInfoLog(this.program)}`);
    gl.useProgram(this.program);
    this.uniform = Object.fromEntries(['planes', 'raster', 'mode', 'hlg', 'opacity', 'exposure','mask','masked','outputSize','corners','cropUV','borderColor','premultipliedInput'].map(k => [k, gl.getUniformLocation(this.program, k)]));
    gl.uniform1i(this.uniform.planes, 0); gl.uniform1i(this.uniform.raster, 1);
    gl.uniform1i(gl.getUniformLocation(this.program, 'processed'), 3);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, offset] of [['pos', 0], ['uv', 8]]) {
      const at = gl.getAttribLocation(this.program, name); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 16, offset);
    }
    const texture = (unit, target) => {
      gl.activeTexture(gl.TEXTURE0 + unit); const t = gl.createTexture(); gl.bindTexture(target, t);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.planes = texture(0, gl.TEXTURE_2D_ARRAY);
    // Both sampler types must be complete even when their shader branch is unused.
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R32F, 1, 1, 3, 0, gl.RED, gl.FLOAT, new Float32Array(3));
    this.raster = texture(1, gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.mask=texture(8,gl.TEXTURE_2D);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    this.viewer=texture(9,gl.TEXTURE_2D);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
    gl.uniform1i(this.uniform.mask,8);
    this.filmFallback=texture(7,gl.TEXTURE_3D);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB16F,1,1,1,0,gl.RGB,gl.FLOAT,new Float32Array(3));
    this.filmTextures=new Map();
    this.referenceTextures=new Map();
    this.target = texture(2, gl.TEXTURE_2D);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    this.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.target, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not allocate the HDR image. Try a smaller export size.');
    gl.viewport(0, 0, w, h);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.readback = new Float32Array(w * h * 4);
    this.planar = new Float32Array(w * h * 3);
    this.vertices = new Float32Array(24);
    this.main = { tex: this.target, fbo: this.fbo, w, h };
    this.current = this.main;
    this.surfaces = new Map();
    this.programs = new Map();
    // A complete texture is required for the processed sampler even on the direct path.
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.raster);
    this.check();
  }

  check() {
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('The graphics device was lost during HDR export.');
    const err = gl.getError();
    if (err !== gl.NO_ERROR) throw new Error(`HDR graphics operation failed (${err}). Try a smaller export size.`);
  }

  surface(key, w = this.w, h = this.h) {
    const gl = this.gl;
    let s = this.surfaces.get(key);
    if (s && s.w === w && s.h === h) return s;
    if (s) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fbo); }
    const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Could not allocate HDR effect buffers. Try a smaller export size.');
    this.surfaces.set(key, s = { tex, fbo, w, h, key });
    this.bind(this.current);
    return s;
  }

  bind(surface = this.main) {
    this.current = surface;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.fbo); gl.viewport(0, 0, surface.w, surface.h); gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (surface.w === this.w && surface.h === this.h && this.bounds) { gl.enable(gl.SCISSOR_TEST); gl.scissor(...this.bounds); }
  }

  fullQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,0,0, 1,1,1,0, -1,-1,0,1, -1,-1,0,1, 1,1,1,0, 1,-1,1,1]), gl.STREAM_DRAW);
  }

  pass(fragment, input, dest, uniforms = {}, extra = input, additional = {}) {
    const gl = this.gl;
    if(input.tex===dest.tex||extra.tex===dest.tex){
      for(let i=0;i<3;i++){const alternative=this.surface(`pass:alternate:${i}`,dest.w,dest.h);if(alternative.tex!==input.tex&&alternative.tex!==extra.tex){dest=alternative;break;}}
    }
    let program = this.programs.get(fragment);
    if (!program) {
      const compile = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      program = gl.createProgram(); const vs = compile(gl.VERTEX_SHADER, VERTEX), fs = compile(gl.FRAGMENT_SHADER, fragment);
      gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      this.programs.set(fragment, program);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo); gl.viewport(0, 0, dest.w, dest.h); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    gl.useProgram(program); this.fullQuad();
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, input.tex);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, extra.tex);
    const samplers={};Object.entries(additional).forEach(([name,surface],i)=>{const unit=10+i;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,surface.tex);samplers[name]=['i',unit];});
    for (const [name, value] of Object.entries({ image: ['i', 5],currentImage:['i',5],previousImage:['i',6], extra: ['i', 6], originalImage: ['i', 5],filmLut:['i',7],mask:['i',8],maskImage:['i',8],viewer:['i',9],...samplers, ...uniforms })) {
      const loc = gl.getUniformLocation(program, name);
      if (loc === null) continue;
      const [type, data] = value;
      if (type === 'i') gl.uniform1i(loc, data);
      else if (type === 'u') gl.uniform1ui(loc, data);
      else if (type === 'f') gl.uniform1f(loc, data);
      else gl[`uniform${type}fv`](loc, data);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6); this.check();
    this.bind(this.current);
    return dest;
  }

  blur(input, radius, prefix = 'blur', premultiplied = false) {
    if (!(radius > 0)) return input;
    let source=premultiplied?input:this.pass(HDR_EFFECT_FRAGMENT,input,this.surface(`${prefix}:premultiplied`,input.w,input.h),{kind:['i',28]});
    const factor=Math.max(1,Math.ceil(radius/6)),w=Math.max(1,Math.floor(input.w/factor)),h=Math.max(1,Math.floor(input.h/factor)),sigma=Math.max(.01,radius/factor);
    if(factor>1){const gl=this.gl;gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,source.tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.generateMipmap(gl.TEXTURE_2D);source=this.pass(HDR_EFFECT_FRAGMENT,source,this.surface(`${prefix}:downsample`,w,h),{kind:['i',0]});}
    const a = this.surface(`${prefix}:a`, w, h), b = this.surface(`${prefix}:b`, w, h);
    const horizontal=this.pass(HDR_EFFECT_FRAGMENT, source, a, { kind: ['i', 1], premultiplied: ['i', 1], stepUV: ['2', [sigma / 4 / w, 0]] });
    const result=this.pass(HDR_EFFECT_FRAGMENT, horizontal, b, { kind: ['i', 1], premultiplied: ['i', 1], stepUV: ['2', [0, sigma / 4 / h]] });
    if(premultiplied&&factor===1)return result;
    return this.pass(HDR_EFFECT_FRAGMENT,result,this.surface(`${prefix}:result`,input.w,input.h),{kind:['i',premultiplied?0:29]});
  }

  effects(input, clip, T, applyGrade=true) {
    let current = input, slot = 0;
    const time=sourceTime(clip,T);
    const run = (kind, p = [0,0,0,0], q = [0,0,0,0], more = {}, extra = current) => {
      const dest = this.surface(`fx:${slot++ % 2}`, input.w, input.h);
      // A blur output can be reused across passes; named targets never alias input.
      current = this.pass(HDR_EFFECT_FRAGMENT, current, dest, { kind: ['i', kind], p: ['4', p], q: ['4', q], ...more }, extra);
    };
    for (const original of activeVideoEffects(clip)) {
      const e = animatedEffect(clip, original, T), p = effectParams(e);
      const mask=this.effectContext&&sourceEffectMask(clip,e,T,this.effectContext.project,input.w,input.h,this.effectContext.sourceToProject);
      const before=mask?this.pass(HDR_EFFECT_FRAGMENT,current,this.surface('mask:before',input.w,input.h),{kind:['i',0]}):null;
      switch (e.type) {
        case 'blur': current = this.blur(current, p.amount); break;
        case 'saturation': run(2, [p.amount,0,0,0]); break;
        case 'contrast': run(3, [p.amount,0,0,0]); break;
        case 'opacity': run(4, [p.amount,0,0,0]); break;
        case 'solid': run(5, [p.amount,p.preserveAlpha?1:0,0,0], undefined, { color: ['3', color2020(p.color)] }); break;
        case 'gradient': {
          const gl = this.gl, canvas = renderGradient(p, input.w, input.h);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.raster); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
          run(5, [p.amount,p.preserveAlpha?1:0,1,0], undefined, {}, { tex: this.raster }); break;
        }
        case 'noise': run(6, [p.amount,p.size,p.colored?1:0,0], [0,0,0,Math.floor(time*(p.speed||0)*30)+p.seed]); break;
        case 'rgbSplit': { const d=p.amount*Math.min(input.w,input.h)*.04,a=p.angle*Math.PI/180;run(7,[Math.cos(a)*d/input.w,Math.sin(a)*d/input.h,0,0]);break; }
        case 'chromatic': run(8,[p.amount,p.falloff,0,0],[p.centerX,p.centerY,0,0]);break;
        case 'scanlines': run(9,[p.amount,p.spacing,0,0]);break;
        case 'glitch': run(10,[p.amount,p.bands,p.split,0],[0,0,0,Math.floor(time*p.speed*30)+p.seed]);break;
        case 'glow': { const b=this.blur(current,p.radius,'glow');run(11,[p.amount,0,0,0],undefined,{},b);break; }
        case 'motionBlur': {
          current=this.pass(HDR_EFFECT_FRAGMENT,current,this.surface('motion:premultiplied',input.w,input.h),{kind:['i',28]});if(mask)this.uploadMask(mask);
          run(12,[p.amount,['directional','zoom','spin'].indexOf(p.mode),p.angle*Math.PI/180,p.bias],[p.centerX,p.centerY,0,0],{sampleCount:['i',Math.min(128,Math.max(16,Math.ceil(p.amount*1.5)))],useEffectMask:['i',mask?1:0]});break;
        }
        case 'naturalMotionBlur':current=hdrNaturalMotion(this,current,clip,{...e,p},T,mask);break;
        case 'hueSaturation': {const s=hueSaturationSettings(p);if(s.active)run(13,[s.amount,0,0,0],undefined,{ranges:['3',s.bands.flatMap(b=>[b.center,b.left,b.right])],adjustments:['2',s.bands.flatMap(b=>[b.hue,b.saturation])]});break;}
        case 'filmGrain': case 'vhs': {
          const s=stylizeSettings(e.type,p,time,input.w,input.h);
          run(e.type==='vhs'?15:14,undefined,undefined,{amount:['f',s.amount],clock:['f',s.time],seed:['u',s.seed],baseSeed:['u',s.baseSeed],splitAmount:['f',s.split],noiseAmount:['f',s.noise],lineAmount:['f',s.scanlines],tape:['4',[s.softness,s.bleed,s.tracking,s.fade]],film:['4',[s.filmSize,s.roughness,s.color,s.tonal]],damage:['4',[s.dust,s.scratches,s.weave,s.flicker]]});break;
        }
        case 'chroma':case 'luma':case 'difference':{
          let reference=current;
          if(e.type==='difference'){
            const ref=p.reference;
            if(!ref?.pixels||!(ref.width>0&&ref.height>0)||ref.width*ref.height>1048576||ref.pixels.length>6000000)break;
            if(!this.effectContext.analysis)throw new Error('HDR background-reference key needs its viewer analysis frame.');
            const effects=activeVideoEffects(clip),prefix={...clip,props:{...clip.props,vfx:effects.slice(0,effects.indexOf(original))}};
            const analysis=applyVideoEffects({img:this.effectContext.analysis,w:input.w,h:input.h,effectMask:x=>sourceEffectMask(clip,x,T,this.effectContext.project,input.w,input.h,this.effectContext.sourceToProject)},prefix,'main',time,T).img;
            const gl=this.gl;gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,this.viewer);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,analysis);
            reference=this.referenceTexture(ref);
          }
          const keyUniforms={kind:['i',e.type==='luma'?1:e.type==='difference'?2:0],mode:['i',0],keyColor:['3',rgb(p.color)],p:['4',[p.similarity,p.softness,p.despill||0,0]],q:['4',[p.black,p.white,p.gamma,p.invert?1:0]],r:['4',[p.detail||0,p.motionBlur||0,p.shadows||0,p.shadowRange||.25]],s:['4',[p.edgeColor||0,0,0,0]]};
          current=this.pass(HDR_KEY_FRAGMENT,current,this.surface('key:result',input.w,input.h),keyUniforms,reference);
          for(const [radius,mode] of [[Math.abs(p.choke||0),(p.choke||0)>0?1:2],[p.feather||0,3]])if(radius>0){
            const n=Math.min(64,Math.max(1,Math.ceil(radius)));
            current=this.pass(HDR_KEY_FRAGMENT,current,this.surface('key:x',input.w,input.h),{mode:['i',mode],radius:['i',n],stepUV:['2',[radius/n/input.w,0]]});
            current=this.pass(HDR_KEY_FRAGMENT,current,this.surface('key:y',input.w,input.h),{mode:['i',mode],radius:['i',n],stepUV:['2',[0,radius/n/input.h]]});
          }
          if(p.view==='matte')current=this.pass(HDR_KEY_FRAGMENT,current,this.surface('key:matte',input.w,input.h),{mode:['i',4]});
          break;
        }
        case 'lights':{
          const cycles=kfIntegral(clip,vfxProp(e.id,'frequency'),T,p.frequency)+(p.phase||0),s=lightsAt(p,cycles);
          const lamps=[...s.lights];while(lamps.length<2)lamps.push({x:0,y:0,size:1,level:0,color:[0,0,0],edge:[0,0,0]});
          run(23,undefined,undefined,{lamps:['4',lamps.flatMap(l=>[l.x,l.y,l.size,l.level])],lampColors:['3',lamps.flatMap(l=>l.color)],lampEdges:['3',lamps.flatMap(l=>l.edge)],lighting:['4',[p.softness,p.falloff,p.glow,p.intensity,p.opacity,p.exposure,p.shape==='round'?0:p.shape==='wide'?2:1,p.spread,p.rotation*Math.PI/180,p.core?1:0,p.coreSize,p.coreIntensity,p.coreGlow,{add:0,screen:1,softLight:2,overlay:3}[p.blend]??1,0,0]]});break;
        }
        case 'lightLeak':{
          const [w,h]=leakFieldSize(input.w,input.h),field=lightLeakField(p,kfTime(clip,T),kfIntegral(clip,vfxProp(e.id,'speed'),T,p.speed),kfIntegral(clip,vfxProp(e.id,'transition'),T,p.transition),w,h);
          const gl=this.gl;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.raster);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,field);
          run(24,[p.opacity,{add:0,screen:1,softLight:2}[p.blend]??1,0,0],undefined,{}, {tex:this.raster});break;
        }
        case 'lensFlare':{
          const visibility=this.flareVisibility(current,p),pixels=hdrFlareEmission(input.w,input.h,p,visibility),field=this.surface('flare:field',input.w,input.h),gl=this.gl;
          gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,field.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,input.w,input.h,0,gl.RGBA,gl.FLOAT,pixels);
          run(22,[p.blend==='screen'?1:0,0,0,0],undefined,{},field);break;
        }
        default: throw new Error(`${e.type} is not supported by HDR effects yet.`);
      }
      if(mask){this.uploadMask(mask);current=this.pass(HDR_MASK_FRAGMENT,before,this.surface('mask:mix',input.w,input.h),{kind:['i',1],strength:['f',1]},current);}
    }
    if(!applyGrade)return current;
    const g = gradeParams(clip,T) || {}, v = k => valueAt(clip,k,T)||0;
    if (Object.keys(g).length || ['sepia','grayscale','invert','hue','vignette'].some(k=>v(k))) {
      run(20,[g.exposure||0,g.contrast||0,g.shadows||0,g.highlights||0],undefined,{
        wb:['3',[1+.3*(g.temperature||0),1-.25*(g.tint||0),1-.3*(g.temperature||0)]],
        lift:['3',wheelOffset(g.liftX||0,g.liftY||0).map(x=>x*.25+(g.liftL||0)*.25)],
        gammaV:['3',wheelOffset(g.gammaX||0,g.gammaY||0).map(x=>1+x*.5+(g.gammaL||0)*.5)],
        gain:['3',wheelOffset(g.gainX||0,g.gainY||0).map(x=>1+x*.5+(g.gainL||0)*.5)],
        grade:['4',[g.saturation||0,v('vignette'),0,0]],style:['4',[v('sepia'),v('grayscale'),v('invert'),v('hue')*Math.PI/180]],
      });
    }
    if (v('blur')>0) current=this.blur(current,v('blur')*input.h/1080,'legacy-blur');
    const film=g.film&&bakeFilm(g.film);
    if(film&&g.filmMix>0){
      const gl=this.gl;let tex=this.filmTextures.get(film);
      gl.activeTexture(gl.TEXTURE7);
      if(!tex){tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,tex);for(const k of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,k,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB16F,film.size,film.size,film.size,0,gl.RGB,gl.FLOAT,film.data);this.filmTextures.set(film,tex);}else gl.bindTexture(gl.TEXTURE_3D,tex);
      run(21,[g.filmMix,0,0,0]);
    }
    return current;
  }

  uploadMask(canvas){const gl=this.gl;gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,this.mask);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);}

  referenceTexture(ref){
    const gl=this.gl,cached=this.referenceTextures.get(ref.pixels);
    if(cached&&cached.w===ref.width&&cached.h===ref.height)return cached;
    const bytes=Uint8ClampedArray.from(atob(ref.pixels),c=>c.charCodeAt(0));
    if(bytes.length!==ref.width*ref.height*4)throw new Error('Invalid background-reference key image.');
    if(cached){gl.deleteTexture(cached.tex);this.referenceTextures.delete(ref.pixels);}
    while(this.referenceTextures.size>=8){const [key,value]=this.referenceTextures.entries().next().value;gl.deleteTexture(value.tex);this.referenceTextures.delete(key);}
    const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,tex);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,ref.width,ref.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    const result={tex,w:ref.width,h:ref.height};this.referenceTextures.set(ref.pixels,result);return result;
  }

  linearSurface(sample,key,hlg=false){
    const gl=this.gl,{w,h,pixels}=sample,target=this.surface(key,w,h);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,this.planes);gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.R32F,w,h,3,0,gl.RED,gl.FLOAT,pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo);gl.viewport(0,0,w,h);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.useProgram(this.program);this.fullQuad();
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.raster);
    gl.uniform1i(this.uniform.mode,0);gl.uniform1i(this.uniform.hlg,hlg?1:0);gl.uniform1f(this.uniform.opacity,1);gl.uniform1f(this.uniform.exposure,0);gl.uniform1i(this.uniform.masked,0);
    gl.uniform4f(this.uniform.corners,0,0,0,0);gl.uniform1i(this.uniform.premultipliedInput,0);
    gl.drawArrays(gl.TRIANGLES,0,6);this.check();this.bind(this.current);return target;
  }

  flareVisibility(input,p){
    if(!(p.occlusion>0))return 1;
    const probe=this.pass(HDR_EFFECT_FRAGMENT,input,this.surface('flare:probe',24,24),{kind:['i',25],p:['4',[p.x,p.y,p.threshold??.6,0]],q:['4',[.02*input.h/input.w,.02,0,0]]});
    this.probePixels||=new Float32Array(24*24*4);const gl=this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER,probe.fbo);gl.readPixels(0,0,24,24,gl.RGBA,gl.FLOAT,this.probePixels);this.check();this.bind(this.current);
    let lit=0,total=0;for(let i=0;i<this.probePixels.length;i+=4){lit+=this.probePixels[i];total+=this.probePixels[i+1];}
    return 1-Math.max(0,Math.min(1,p.occlusion))*(1-lit/Math.max(1,total));
  }

  visibility(clip,T,project,matrix){
    const visibility=visibilityMaskClip(clip);
    if(!maskList(visibility).length)return null;
    this.maskCanvas||=new OffscreenCanvas(this.w,this.h);
    const [sx,sy,tx,ty]=matrix;
    paintMask(this.maskCanvas.getContext('2d'),visibility,T,project.width,project.height,new DOMMatrix([sx,0,0,sy,tx,ty]),this.w,this.h,project);
    return this.maskCanvas;
  }

  adjustment(clip,T,project,matrix){
    const dest=this.current;
    const input=this.pass(HDR_EFFECT_FRAGMENT,this.main,this.surface('adjustment:input'),{kind:['i',0]});
    const [sx,sy,tx,ty]=matrix;
    this.effectContext={project,sourceToProject:new DOMMatrix([1/sx,0,0,1/sy,-tx/sx,-ty/sy])};
    let result=this.effects(input,clip,T);
    const radius=Math.max(0,Math.min(50,valueAt(clip,'radius',T)||0))*Math.min(project.width,project.height)/100,border=(valueAt(clip,'border',T)||0)*project.height/1080;
    if(radius||border)result=this.pass(HDR_EFFECT_FRAGMENT,result,this.surface('adjustment:geometry'),{kind:['i',27],p:['4',[project.width,project.height,radius,border]],q:['4',[tx/this.w,ty/this.h,project.width*sx/this.w,project.height*sy/this.h]],color:['3',color2020(clip.props.borderColor||'#ffffff')]});
    const mask=this.visibility(clip,T,project,matrix);if(mask)this.uploadMask(mask);
    const mixed=this.pass(HDR_MASK_FRAGMENT,input,this.surface('adjustment:mixed'),{kind:['i',mask?3:2],strength:['f',Math.max(0,Math.min(1,visualOpacity(clip,T)))]},result);
    if(dest===this.main)this.composite(mixed);
    else{
      const gl=this.gl;this.bind(dest);this.fullQuad();gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,mixed.tex);
      gl.uniform1i(this.uniform.mode,2);gl.uniform1i(this.uniform.masked,0);gl.uniform1i(this.uniform.premultipliedInput,0);gl.uniform4f(this.uniform.corners,0,0,0,0);gl.uniform1f(this.uniform.opacity,1);gl.uniform1f(this.uniform.exposure,0);gl.drawArrays(gl.TRIANGLES,0,6);this.check();
    }
  }

  clear(project, matrix) {
    this.bind(this.main); this.bounds = null;
    const gl = this.gl; gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (project && matrix) {
      const [sx, sy, tx, ty] = matrix;
      const x = Math.max(0, Math.ceil(tx)), y = Math.max(0, Math.ceil(ty));
      const right = Math.min(this.w, Math.ceil(tx + project.width * sx)), bottom = Math.min(this.h, Math.ceil(ty + project.height * sy));
      this.bounds = [x, this.h - bottom, Math.max(0, right - x), Math.max(0, bottom - y)];
      gl.enable(gl.SCISSOR_TEST); gl.scissor(...this.bounds);
    }
  }

  beginSide(key) {
    const surface=this.surface(`transition:${key}`);
    this.bind(surface);const gl=this.gl;
    gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);this.bind(surface);
    return surface;
  }

  transition(a,b,transition,project,matrix,overlay=false,fps=project.fps) {
    this.bind(this.main);
    let type=overlay&&transition.type.startsWith('dip')?'dissolve':transition.type;
    if(type==='blur'){
      const radius=Math.sin(transition.p*Math.PI)*project.height*.02*matrix[1];
      a=this.blur(a,radius,'transition-blur-a',true);b=this.blur(b,radius,'transition-blur-b',true);
    }
    const kind={dissolve:0,dip:1,dipWhite:2,slideLeft:3,slideRight:4,slideUp:5,wipe:6,circle:7,zoom:8,blur:0}[type];
    if(kind==null)throw new Error(`Unknown HDR transition: ${type}`);
    const span=transition.motionBlur&&['slideLeft','slideRight','slideUp','wipe','circle','zoom'].includes(type) ? .5/(fps*transition.dur) : 0;
    const count=span?Math.max(2,Math.min(32,Math.ceil(span*2*Math.max(project.width*matrix[0],project.height*matrix[1])/3))):1;
    const mix=this.pass(HDR_TRANSITION_FRAGMENT,a,this.surface('transition:mix'),{
      kind:['i',kind],progress:['f',transition.p],span:['f',span],count:['i',count],
      rect:['4',[matrix[2]/this.w,matrix[3]/this.h,project.width*matrix[0]/this.w,project.height*matrix[1]/this.h]],projectSize:['2',[project.width,project.height]],
    },b);
    this.composite(mix);
  }

  composite(surface,destination=this.main,mask=null) {
    const gl=this.gl;this.bind(destination);this.fullQuad();
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,surface.tex);
    if(mask)this.uploadMask(mask);
    gl.uniform1i(this.uniform.masked,mask?1:0);gl.uniform2f(this.uniform.outputSize,this.w,this.h);gl.uniform1i(this.uniform.premultipliedInput,1);gl.uniform4f(this.uniform.corners,0,0,0,0);
    gl.uniform1i(this.uniform.mode,2);gl.uniform1f(this.uniform.opacity,1);gl.uniform1f(this.uniform.exposure,0);
    gl.blendFuncSeparate(gl.ONE,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES,0,6);this.check();this.bind(destination);
  }

  draw(source, project, clip, T, matrix,withShadow=true,deferVisibility=false) {
    const {pixels,w,h,displayW=w,hlg=false,canvas=null,analysis=null,temporal=null}=source;
    const gl = this.gl;
    const destination=this.current;
    let opacity = clip ? Math.max(0,Math.min(1,visualOpacity(clip,T))) : 1;
    if (opacity <= 0) return;
    if(!canvas&&withShadow&&(valueAt(clip,'shadow',T)||0)>0){
      const style=shadowStyle(clip,T,project.height),foreground=this.surface('shadow:foreground');
      this.bind(foreground);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);this.bind(foreground);
      this.draw(source,project,clip,T,matrix,false,true);
      const blurred=this.blur(foreground,style.blur*matrix[1],'shadow-blur',true);
      const shadow=this.pass(HDR_EFFECT_FRAGMENT,blurred,this.surface('shadow:light'),{kind:['i',26],p:['4',[style.offsetX*matrix[0]/this.w,style.offsetY*matrix[1]/this.h,style.opacity,0]],color:['3',color2020(style.color)]});
      const combined=this.surface('shadow:combined');this.bind(combined);gl.disable(gl.SCISSOR_TEST);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);this.bind(combined);
      this.composite(shadow,combined);this.composite(foreground,combined);
      this.composite(combined,destination,this.visibility(clip,T,project,matrix));return;
    }
    let rect = { x: 0, y: 0, w: project.width, h: project.height }, uv = [0, 0, 1, 1];
    const transform = clip && !canvas ? clipMatrix(clip, T, project.width, project.height, project) : new DOMMatrix();
    if (!canvas) {
      const sc = Math.min(project.width / displayW, project.height / h);
      rect = { x: (project.width - displayW * sc) / 2, y: (project.height - h * sc) / 2, w: displayW * sc, h: h * sc };
      const crop = key => Math.min(.49, Math.max(0, valueAt(clip, key, T) || 0));
      uv = [crop('cropL'), crop('cropT'), 1 - crop('cropR'), 1 - crop('cropB')];
      rect = { x: rect.x + uv[0] * rect.w, y: rect.y + uv[1] * rect.h, w: rect.w * (uv[2] - uv[0]), h: rect.h * (uv[3] - uv[1]) };
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.planes);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R32F, w, h, 3, 0, gl.RED, gl.FLOAT, pixels);
    } else {
      // Canvas layers already contain their own clip geometry and alpha.
      opacity = 1;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.raster);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
    let processed=null;
    const fullScale=!canvas?Math.min(project.width/displayW,project.height/h):1;
    this.effectContext=canvas?null:{project,analysis,temporal,hlg,sourceToProject:new DOMMatrix([displayW*fullScale/w,0,0,fullScale,(project.width-displayW*fullScale)/2,(project.height-h*fullScale)/2])};
    if(!canvas&&(activeVideoEffects(clip).length||gradeParams(clip,T)||['blur','sepia','grayscale','invert','hue','vignette'].some(k=>valueAt(clip,k,T)))){
      const source=this.surface('source',w,h);
      gl.bindFramebuffer(gl.FRAMEBUFFER,source.fbo);gl.viewport(0,0,w,h);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.BLEND);gl.useProgram(this.program);this.fullQuad();
      gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,this.raster);
      gl.uniform1i(this.uniform.mode,0);gl.uniform1i(this.uniform.hlg,hlg?1:0);gl.uniform1f(this.uniform.opacity,1);gl.uniform1f(this.uniform.exposure,0);
      gl.uniform1i(this.uniform.masked,0);
      gl.uniform4f(this.uniform.corners,0,0,0,0);gl.uniform1i(this.uniform.premultipliedInput,0);
      gl.drawArrays(gl.TRIANGLES,0,6);this.check();
      this.effectContext.raw=source;
      processed=this.effects(source,clip,T);
      this.bind(destination);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,processed.tex);
    }
    const [sx, sy, tx, ty] = matrix;
    const corners = [[0, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 1]];
    corners.forEach(([x, y], i) => {
      const p = transform.transformPoint({ x: rect.x + x * rect.w, y: rect.y + y * rect.h });
      this.vertices.set([(p.x * sx + tx) / this.w * 2 - 1, 1 - (p.y * sy + ty) / this.h * 2, uv[x ? 2 : 0], uv[y ? 3 : 1]], i * 4);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.vertices, gl.STREAM_DRAW);
    gl.uniform1i(this.uniform.mode, canvas ? 1 : processed ? 2 : 0); gl.uniform1i(this.uniform.hlg, hlg ? 1 : 0);
    gl.uniform1f(this.uniform.opacity, opacity); gl.uniform1f(this.uniform.exposure, canvas || processed ? 0 : valueAt(clip, 'exposure', T) || 0);
    gl.uniform1i(this.uniform.premultipliedInput,0);
    gl.uniform4f(this.uniform.corners,rect.w,rect.h,canvas?0:Math.min(rect.w,rect.h)*Math.max(0,Math.min(50,valueAt(clip,'radius',T)||0))/100,canvas?0:(valueAt(clip,'border',T)||0)*project.height/1080);
    gl.uniform4fv(this.uniform.cropUV,uv);gl.uniform3fv(this.uniform.borderColor,color2020(clip?.props?.borderColor||'#ffffff'));
    const mask=clip&&!canvas&&!deferVisibility&&this.visibility(clip,T,project,matrix);if(mask)this.uploadMask(mask);
    gl.uniform1i(this.uniform.masked,mask?1:0);gl.uniform2f(this.uniform.outputSize,this.w,this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.check();
  }

  read(sdr = false) {
    const surface = sdr ? this.pass(SDR_OUTPUT_FRAGMENT, this.main, this.surface('output:sdr')) : this.main;
    const gl = this.gl, { w, h, readback: rgba, planar: out } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, surface.fbo);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, rgba); this.check();
    const n = w * h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = ((h - 1 - y) * w + x) * 4;
      out[i] = rgba[j + 1]; out[n + i] = rgba[j + 2]; out[2 * n + i] = rgba[j];
    }
    return out;
  }

  close() {
    const gl = this.gl;
    if (!gl) return;
    for (const t of [this.target, this.planes, this.raster,this.mask,this.viewer,this.filmFallback,...(this.filmTextures?.values()||[])]) if (t) gl.deleteTexture(t);
    for(const s of this.surfaces?.values()||[]){gl.deleteTexture(s.tex);gl.deleteFramebuffer(s.fbo);}
    for(const p of this.programs?.values()||[])gl.deleteProgram(p);
    for(const ref of this.referenceTextures?.values()||[])gl.deleteTexture(ref.tex);
    gl.deleteFramebuffer(this.fbo); gl.deleteBuffer(this.buffer); gl.deleteVertexArray(this.vao); gl.deleteProgram(this.program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.readback = this.planar = null;
    this.effectContext=null;releaseHdrFlarePixels();
    this.gl = null;
  }
}
