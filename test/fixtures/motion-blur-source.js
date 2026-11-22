import { createPlayer } from '../../src/renderer/player.js';
import { makeClip, newProject } from '../../src/shared/model.js';
import { makeVideoEffect } from '../../src/shared/videoEffects.js';

export async function run(file,output){
  window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),16);window.cancelAnimationFrame=clearTimeout;
  const p=newProject('Natural motion integration');Object.assign(p,{width:320,height:180,duration:2,fps:30});
  const st={path:file,width:320,height:180,fps:30,duration:2,hasVideo:true,hasAudio:false};
  const m={id:'source',kind:'video',path:file,duration:2,streams:{main:st}};p.media[m.id]=m;
  const e=makeVideoEffect('naturalMotionBlur'),c=makeClip('video',{media:m,start:0,in:0,dur:2,props:{vfx:[e]}});
  p.clips[c.id]=c;p.primary=[c.id];
  let time=.5;const playing={value:false};
  const player=createPlayer({getProject:()=>p,playing,getTime:()=>time,setTime:v=>{time=v;},resolutionScale:()=>1});
  const canvas=document.createElement('canvas');document.body.append(canvas);player.attachCanvas(canvas);player.resizeCanvas(320,180);player.start();
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  async function frame(t){
    player.seek(t);
    for(let i=0;i<200;i++){
      await wait(15);if(player.snapshot({fresh:true}))return canvas.getContext('2d').getImageData(0,0,320,180).data;
    }
    throw new Error(`Natural motion preview timed out at ${t}: ${JSON.stringify({time,snapshot:Boolean(player.snapshot()),elements:[...document.querySelectorAll('video')].map(el=>({src:el.src,time:el.currentTime,ready:el.readyState,seeking:el.seeking,error:el.error?.message}))})}`);
  }
  try{
    const comparisons=[];
    for(const rollingShutter of [false,true]){
    e.p.rollingShutter=rollingShutter;player.invalidate();
    const pixels=await frame(.5);
    const file=output.replace('.png',rollingShutter?'-rolling.png':'-global.png');
    await window.exportMotion({project:JSON.parse(JSON.stringify(p)),settings:{output:file,frame:{time:.5,width:320,height:180,format:'png'}}});
    const image=new Image();image.crossOrigin='anonymous';image.src=`media://file/${encodeURIComponent(file)}`;await image.decode();
    const exportCanvas=new OffscreenCanvas(320,180),g=exportCanvas.getContext('2d');g.drawImage(image,0,0);
    const actual=g.getImageData(0,0,320,180).data;let mean=0,max=0;
    for(let i=0;i<actual.length;i++){mean+=Math.abs(actual[i]-pixels[i]);max=Math.max(max,Math.abs(actual[i]-pixels[i]));}
    mean/=actual.length;if(mean>2)throw new Error(`Preview and export differ: ${mean}, max ${max}`);
    comparisons.push({rollingShutter,mean,max});
    }
    await frame(1.5);await frame(.25);await frame(.5);
    player.play();await wait(500);player.pause();
    if(time<.8)throw new Error('Natural motion playback did not advance');
    const start=performance.now();
    await window.exportMotion({project:JSON.parse(JSON.stringify(p)),settings:{output:output.replace('.png','.mp4'),preview:true,format:'mp4-h264',quality:'high',fps:30,res:180,captions:'burn'}});
    return {comparisons,playbackTime:time,export60FramesMs:performance.now()-start};
  }finally{player.dispose();}
}
