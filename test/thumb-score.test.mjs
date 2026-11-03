import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, makeClip } from '../src/shared/model.js';
import { scoreFrame, FRAME_SCORE_WEIGHTS, frameSampleTimes, sampleFrameInfo, pickFrameCandidates, titleCandidates, captionPhrases, uniqueTitles, suggestionTemplates } from '../src/shared/thumbScore.js';
import { analyzeDesignFrames, aiTitleProvider, transcriptForTitles, parseAITitles } from '../src/shared/designSuggest.js';
import { BUILTIN_DESIGN_TEMPLATES } from '../src/shared/designTemplates.js';
const image=(fn,w=64,h=64)=>({width:w,height:h,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:fn(i/4|0,i%4,w))});
const checker=image((i,c,w)=>((Math.floor(i/w/4)+Math.floor(i%w/4))%2)*255);
function source(duration=3,kind='video') {const p=newProject('Min video'),m={id:'m',kind,duration,streams:{main:{hasVideo:true,path:'/video.mp4'}}};p.media.m=m;const c=makeClip(kind,{media:m,dur:duration});p.clips[c.id]=c;p.primary=[c.id];p.duration=duration;return p;}
test('sharp checkerboard beats its box-blurred version and black scores lowest',()=>{
  const blur={...checker,data:checker.data.slice()},w=checker.width,h=checker.height;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let sum=0,n=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=Math.max(0,Math.min(w-1,x+dx)),yy=Math.max(0,Math.min(h-1,y+dy));sum+=checker.data[(yy*w+xx)*4+c];n++;}blur.data[(y*w+x)*4+c]=sum/n;}
  const sharp=scoreFrame(checker),soft=scoreFrame(blur),black=scoreFrame(image(()=>0));
  assert.ok(sharp.sharpness>soft.sharpness);assert.ok(sharp.score>soft.score);assert.equal(black.score,0);assert.ok(scoreFrame(image(()=>127)).score>black.score);
  assert.equal(Object.values(FRAME_SCORE_WEIGHTS).reduce((a,b)=>a+b),1);
  for(const metrics of[sharp,soft,black,scoreFrame(image(()=>255)),scoreFrame(image(()=>128,1,1))])for(const value of Object.values(metrics))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
  assert.throws(()=>scoreFrame({width:10,height:10,data:[]}),/pixels/);
});
test('colorfulness raises the score of colorful frames over equal-luma gray frames',()=>{
  const color=image((i,c)=>[[210,100,20],[40,160,210]][i%2][c]),gray=image(i=>i%2?138:118);
  assert.ok(scoreFrame(color).colorfulness>scoreFrame(gray).colorfulness);assert.ok(scoreFrame(color).score>scoreFrame(gray).score);
});
test('short and three-hour sampling is bounded, covers the sequence and avoids fades/transitions',()=>{
  const short=source(3);assert.ok(frameSampleTimes(short).length>0);assert.ok(frameSampleTimes(short).every(t=>t>=0&&t<3));
  const p=source(10800),base=p.clips[p.primary[0]];p.clips={};p.primary=[];
  for(let i=0;i<10000;i++){const c={...base,id:'c'+i,start:i*1.08,dur:1.08};p.clips[c.id]=c;p.primary.push(c.id);}
  const times=frameSampleTimes(p);assert.ok(times.length<=180);assert.ok(times.at(-1)>10700);assert.ok(times[0]<100);
  const c=short.clips[short.primary[0]];c.props.vFadeIn=.5;c.props.vFadeOut=.5;
  assert.ok(frameSampleTimes(short).every(t=>t>=.5&&t<2.5));c.transition={type:'dissolve',dur:1};assert.equal(sampleFrameInfo(short,.25).eligible,false);
  const empty=source(0);assert.deepEqual(frameSampleTimes(empty),[]);
});
test('camera bonus respects hidden tracks, camera visibility and recording parts',()=>{
  const p=source(10,'recording'),c=p.clips[p.primary[0]],m=p.media.m;m.streams={screen:{hasVideo:true},camera:{hasVideo:true}};c.kf.layout=[[0,6]];
  assert.equal(sampleFrameInfo(p,3).camera,true);c.props.showCamera=false;assert.equal(sampleFrameInfo(p,3).camera,false);c.props.showCamera=true;c.recordingPart='screen';assert.equal(sampleFrameInfo(p,3).camera,false);c.recordingPart='camera';p.lanes[0]={hidden:true};assert.equal(sampleFrameInfo(p,3).eligible,false);
});
test('picking candidates preserves score order and five-percent spacing',()=>{
  const frames=Array.from({length:100},(_,time)=>({time,score:1-time/100})),picked=pickFrameCandidates(frames,100);
  assert.equal(picked.length,6);assert.equal(picked[0].time,0);for(let i=1;i<picked.length;i++)assert.ok(picked[i].time-picked[i-1].time>=5);
  assert.equal(pickFrameCandidates([{time:NaN,score:1}],3).length,0);
});
test('offline titles honor priority, Norwegian captions, uniqueness and the 60-character bound',()=>{
  const p=source(),add=(type,text,start)=>{const c=makeClip(type,{start,props:{text}});p.clips[c.id]=c;};p.name='Lær videoredigering';p.sequence={id:'main',name:'Sequence 1'};p.sequences={other:{name:'Del to'}};add('title','Fem nyttige grep',0);add('caption','Dette er en norsk video',1);add('caption','Lær videoredigering',2);
  assert.deepEqual(titleCandidates(p),['Lær videoredigering','Del to','Fem nyttige grep','Dette er en norsk video']);assert.ok(uniqueTitles(['A'.repeat(100)])[0].length<=60);assert.deepEqual(uniqueTitles([' ÆØÅ ','æøå','Other']),['ÆØÅ','Other']);
  const phrases=captionPhrases(['og dette er smart video redigering','smart video redigering med lyd','smart video redigering og lyd']);assert.equal(phrases[0],'smart video redigering');assert.ok(!phrases.some(p=>p.split(' ').some(w=>['og','med','er'].includes(w))));
  assert.deepEqual(titleCandidates(source()),['Min video']);
});
test('template suggestions prefer the selected ratio and shuffle without duplicates',()=>{
  const a=suggestionTemplates(BUILTIN_DESIGN_TEMPLATES,1280,720),b=suggestionTemplates(BUILTIN_DESIGN_TEMPLATES,1280,720,1);assert.equal(a.length,4);assert.ok(a.every(t=>t.ratio==='16:9'));assert.ok(!b.some(t=>a.includes(t)));
  assert.equal(suggestionTemplates(BUILTIN_DESIGN_TEMPLATES,1080,1920).filter(t=>t.ratio==='9:16').length,4);
});
test('analysis stops at its budget, skips decode failures, cancels and adds camera bonus',async()=>{
  const p=source(10800);let clock=0,calls=0;const sample=async()=>{calls++;clock+=500;return calls%3?{pixels:checker,canvas:{}}:null;};
  const result=await analyzeDesignFrames(p,sample,{now:()=>clock,budgetMs:14000});assert.ok(result.limited);assert.equal(result.elapsedMs,14000);assert.ok(result.failed>0);assert.ok(result.frames.length<=6);
  const controller=new AbortController();controller.abort();await assert.rejects(analyzeDesignFrames(p,sample,{signal:controller.signal}),/canceled/);
  const camera=source(3,'recording');camera.media.m.streams={camera:{hasVideo:true}};
  const result2=await analyzeDesignFrames(camera,async()=>({pixels:checker,canvas:{}}));assert.ok(result2.frames.every(f=>f.camera));assert.equal(result2.frames[0].score,Math.min(1,scoreFrame(checker).score+.15));
});
test('AI availability, transcript scope and title parsing do not send requests',()=>{
  assert.equal(aiTitleProvider({model:'x',endpoint:'https://api.openai.com/v1',hasKey:false}),null);assert.equal(aiTitleProvider({model:'x',endpoint:'http://localhost:11434/v1'}),'your local model server');assert.equal(aiTitleProvider({model:'x',endpoint:'https://api.anthropic.com/v1',hasKey:true}),'Anthropic');assert.equal(aiTitleProvider({model:'',hasKey:true}),null);
  const p=source();const c=makeClip('caption',{props:{text:'Norsk tekst'}});p.clips[c.id]=c;assert.equal(transcriptForTitles(p),'Norsk tekst');c.enabled=false;assert.equal(transcriptForTitles(p),'');
  assert.deepEqual(parseAITitles('1. Første tittel\n2. Andre tittel\n- Første tittel\n"En tredje"'),['Første tittel','Andre tittel','En tredje']);
});

test('audio-only recordings and hidden video tracks do not produce frame samples',()=>{
  const p=source(3,'recording');p.media.m.streams={mic:{hasAudio:true}};assert.deepEqual(frameSampleTimes(p),[]);
  const video=source();video.lanes[0]={hidden:true};assert.deepEqual(frameSampleTimes(video),[]);
});
