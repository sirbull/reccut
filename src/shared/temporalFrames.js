let serial = 0;

// read(t) returns an owned {img,time,w,h}. The small cache owns its canvases;
// decoder samples may therefore be closed/reused immediately after read().
export class TemporalFrames {
  constructor(read, close = () => {}) {
    this.read=read;this.closeReader=close;this.cache=[];this.id=++serial;this.generation=0;
  }
  async get(plan) {
    const generation=this.generation;
    const frames=[];
    for(const t of plan.times){
      let f=this.cache.find(f=>Math.abs(f.request-t)<1e-7 || (f.duration>0&&t>=f.time-1e-7&&t<f.time+f.duration-1e-7));
      if(!f){
        f=await this.read(t);
        if(this.generation!==generation)return null;
        if(!f)return null;
        f={...f,request:t};this.cache.push(f);
        // Six frames cover two adjacent triplets, bounded even for 4K export.
        while(this.cache.length>6)this.cache.shift();
      }
      frames.push(f);
    }
    const [previous,current,next]=frames;
    return {previous,current,next,exposure:plan.exposure,direction:plan.direction??1,key:`${this.id}:${previous.time}:${current.time}:${next.time}`};
  }
  close(){this.generation++;this.cache=[];this.closeReader();}
}

export function snapshotSample(sample, maxWidth = Infinity, maxHeight = Infinity) {
  const fit=Math.min(1,maxWidth/sample.displayWidth,maxHeight/sample.displayHeight);
  const w=Math.max(1,Math.round(sample.displayWidth*fit)),h=Math.max(1,Math.round(sample.displayHeight*fit));
  const img=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h});
  sample.draw(img.getContext('2d'),0,0,w,h);
  return {img,w,h,time:sample.timestamp,duration:sample.duration};
}
