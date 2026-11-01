// Kept alongside analog.js, the CPU reference used for numerical verification.
export const ANALOG_GLSL = `
uniform sampler2D originalImage;
uniform uint baseSeed;
uniform vec4 tape, film, damage;
uniform vec2 opticalCenter;
uniform float falloff;
vec2 outputSize(){return vec2(textureSize(originalImage,0));}
vec3 readImage(vec2 p){return texture(image,(p+0.5)/outputSize()).rgb;}
vec3 yiq(vec3 c){return vec3(dot(c,vec3(0.299,0.587,0.114)),dot(c,vec3(0.596,-0.274,-0.322)),dot(c,vec3(0.211,-0.523,0.312)));}
uint fieldHash(ivec2 p,uint salt){return salt+uint(p.x)*374761393u+uint(p.y)*668265263u;}
float gauss(ivec2 p,uint salt){uint n=fieldHash(p,salt);return (random(n)+random(n+7919u)+random(n+15401u)-1.5)*1.6;}
float grainField(vec2 p,uint salt){
  ivec2 cell=ivec2(floor(p));vec2 f=fract(p),t=f*f*(3.0-2.0*f);
  return mix(mix(gauss(cell,salt),gauss(cell+ivec2(1,0),salt),t.x),mix(gauss(cell+ivec2(0,1),salt),gauss(cell+ivec2(1,1),salt),t.x),t.y);
}
float filmTexture(vec2 p,uint salt){
  return grainField(p/film.x,seed+salt)*(1.0-film.y*0.35)+grainField(p/(film.x*0.57)+vec2(73.2,19.7),seed+salt+101u)*film.y*0.65;
}
float tapeDropout(vec2 p,float head,float band){
  float threshold=1.0-amount*(0.0005+head*0.025+band*0.012);
  float row=floor(p.y),value=0.0,total=0.0;
  for(int j=-2;j<=2;j++){
    float vertical=exp(-0.5*pow((p.y-(row+float(j)+0.5))/0.65,2.0));
    total+=vertical;
    for(int k=-1;k<=1;k++){
      float at=(p.x+float(k)*0.8)/14.0,within=fract(at);
      if(random(fieldHash(ivec2(floor(at),row+float(j)),seed+461u))>threshold){
        float profile=smoothstep(0.0,0.15,within)*(1.0-smoothstep(0.55,1.0,within));
        value+=profile*vertical*(k==0?0.6:0.2);
      }
    }
  }
  return value/total;
}
vec3 renderTape(vec2 p){
  vec2 size=outputSize();float v=(p.y+0.5)/size.y;uint row=(uint(p.y)*2u+1u)*240u/uint(size.y);
  uint eventSeed=hash(baseSeed+uint(floor(clock*1.2))*92821u);float phase=fract(clock*1.2);
  float envelope=random(eventSeed)<tape.z*0.85?smoothstep(0.0,0.025,phase)*(1.0-smoothstep(0.12,0.32,phase)):0.0;
  float center=0.12+random(eventSeed+17u)*0.74;
  float band=exp(-pow((v-center)/0.045,2.0))*envelope;
  float head=smoothstep(0.965,0.995,v),lineNoise=random(seed+row*1973u)-0.5;
  float shift=amount*(sin(v*5.7+clock*1.9)*0.00045+lineNoise*0.00045)
    +band*tape.z*(0.008+sin(v*143.0+clock*9.0)*0.014)+head*amount*(0.0015+lineNoise*0.005);
  vec2 samplePos=vec2(p.x+shift*size.x,p.y+(random(seed+row*13u)-0.5)*amount*size.y/480.0*0.15);
  float lumaRadius=(0.4+tape.x*1.7)*size.x/720.0,chromaRadius=(1.5+tape.y*8.0)*size.x/720.0;
  vec3 original=yiq(readImage(samplePos));float luma=0.0;vec2 chroma=vec2(0);
  for(int k=-2;k<=2;k++){
    float weight=k==0?0.38774:abs(k)==1?0.24477:0.06136;
    luma+=yiq(readImage(samplePos+vec2(float(k)*lumaRadius,0))).x*weight;
  }
  luma=mix(original.x,luma,tape.x);
  float vertical=(yiq(readImage(samplePos-vec2(0,size.y/480.0))).x+yiq(readImage(samplePos+vec2(0,size.y/480.0))).x)*0.5;
  luma=mix(luma,vertical,tape.x*0.12);
  for(int k=-3;k<=3;k++){
    float weight=k==0?0.28:abs(k)==1?0.22:abs(k)==2?0.11:0.03;
    chroma+=yiq(readImage(samplePos+vec2(-(1.0+splitAmount*4.0)*size.x/720.0+float(k)*chromaRadius,0))).yz*weight;
  }
  chroma=mix(original.yz,chroma,tape.y);
  uint n=fieldHash(ivec2(int((uint(p.x)*2u+1u)*360u/uint(size.x)),int(row)),seed);
  float grain=(random(n)+random(n+7919u)-1.0)*noiseAmount*0.065;
  float chromaNoise=(random(fieldHash(ivec2(int(uint(p.x)*120u/uint(size.x)),int(row/2u)),seed))-0.5)*noiseAmount*0.035;
  chroma+=vec2(chromaNoise,-chromaNoise*0.6);
  float streak=tapeDropout((p+0.5)*vec2(720,480)/size,head,band);
  luma=luma*(1.0-tape.w*0.1)+tape.w*0.025+grain+streak*0.5;
  luma*=1.0-lineAmount*(0.5+0.5*cos((p.y+0.5)/size.y*480.0*3.14159265359))*0.12;
  chroma*=1.0-tape.w*0.25;
  return vec3(luma)+vec3(dot(chroma,vec2(0.956,0.621)),dot(chroma,vec2(-0.272,-0.647)),dot(chroma,vec2(-1.106,1.703)));
}
vec3 renderFilm(vec2 p){
  vec2 size=outputSize();
  vec2 weaveOffset=vec2(random(seed+31u)-0.5,random(seed+47u)-0.5)*damage.z*size/vec2(640,360);
  vec3 c=readImage(p+weaveOffset);float luminance=dot(c,vec3(0.2126,0.7152,0.0722));
  float tone=mix(1.0,0.1+0.9*sqrt(max(0.0,4.0*luminance*(1.0-luminance))),film.w);
  vec2 coord=(p+0.5)*1080.0/size.y;float grain=filmTexture(coord,0u),amp=amount*0.12*tone;
  vec3 grains=film.z>0.0?vec3(filmTexture(coord,937u),filmTexture(coord,2868u),filmTexture(coord,4799u)):vec3(grain);
  c=c*(1.0+(random(seed+91u)-0.5)*damage.w*0.1)+mix(vec3(grain),grains,film.z*0.65)*amp;
  if(damage.x>0.0||damage.y>0.0)for(int k=0;k<3;k++){
    uint n=seed+uint(k)*2939u;vec2 uv=(p+0.5)/size;float cx=random(n+17u),cy=random(n+37u);
    float dx=(uv.x-cx)/(0.0007+random(n+51u)*0.0025)*size.x/size.y;
    float dy=(uv.y-cy)/(0.001+random(n+67u)*0.003);
    float dirt=random(n+79u)<damage.x?exp(-(dx*dx+dy*dy)*1.6)*0.65:0.0;
    float scratch=random(n+111u)<damage.y*0.25?max(0.0,1.0-abs(uv.x-cx-sin(uv.y*14.0+clock)*0.0002)*size.x/0.7)*0.4:0.0;
    c=c*(1.0-dirt)+scratch;
  }
  return c;
}
vec3 renderChromatic(vec2 p){
  vec2 size=outputSize(),d=(p+0.5)/size-opticalCenter;
  float factor=amount*0.012*pow(length(d)*1.41421356237,falloff);
  return vec3(readImage(p+d*factor*size).r,readImage(p).g,readImage(p-d*factor*size).b);
}
`;
