import { ALL_FORMATS, Input, UrlSource, VideoSampleSink } from 'mediabunny';
import { TemporalFrames, snapshotSample } from '../shared/temporalFrames.js';

// One decoder per active source. Coalesce scrubbing requests so obsolete work
// never builds a queue. The main video element continues to drive audio.
export function createNaturalMotionSource(path, width, height, changed) {
  const input=new Input({formats:ALL_FORMATS,source:new UrlSource(`media://file/${encodeURIComponent(path)}`,{maxCacheSize:8*1024*1024,getRetryDelay:()=>null})});
  const ready=input.getPrimaryVideoTrack().then(async track=>{
    if(!track)throw new Error('No video track for Natural Motion Blur.');
    return {sink:new VideoSampleSink(track),first:await track.getFirstTimestamp()};
  });
  let pending=null,running=false,closed=false,result=null,error=null,requested=null;
  const cache=new TemporalFrames(async t=>{
    const {sink,first}=await ready,sample=await sink.getSample(Math.max(first,t));
    if(!sample)return null;
    try{return snapshotSample(sample,width,height);}finally{sample.close();}
  },()=>input.dispose());
  async function work(){
    running=true;
    try{
      while(pending&&!closed){
        const plan=pending;pending=null;
        const frames=await cache.get(plan);
        if(!closed&&frames){result={...frames,request:plan.times[1]};changed();}
      }
    }catch(e){if(!closed){error=e;changed();}}
    finally{running=false;}
  }
  return {
    width,height,path,
    get(plan,tolerance=1e-7){
      if(error)throw new Error(`Natural Motion Blur could not read this video: ${error.message}`);
      const key=JSON.stringify(plan.times);
      if(key!==requested){requested=key;pending=plan;if(!running)void work();}
      return result&&Math.abs(result.request-plan.times[1])<=tolerance
        ? {...result,exposure:plan.exposure,direction:plan.direction??1}:null;
    },
    close(){closed=true;pending=null;result=null;cache.close();},
  };
}
