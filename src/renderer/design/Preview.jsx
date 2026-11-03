import { useEffect,useRef,useState } from 'preact/hooks';
import { project } from '../editor/store.js';
import { currentDesign,openDesign } from './store.js';
import { imageVersion,getImage,loadDesignImages } from './assets.js';
import { fontAvailable,fontVersion } from './fonts.js';
import { drawDesign } from '../../shared/designRender.js';
import { designVariants } from '../../shared/design.js';
import { formatDuration } from '../../shared/model.js';
import { Button,Modal,Row,Toggle,Segmented } from '../ui.jsx';
import { compareOpen,keepVariant } from './tools.js';
export function DesignPreview({design,width=246,badge=false,progress=false}){
 const ref=useRef(null),version=`${imageVersion.value}:${fontVersion.value}`;
 useEffect(()=>{loadDesignImages(design)},[design]);
 useEffect(()=>{const cv=ref.current;if(!cv)return;const height=width*9/16,k=Math.min(width/design.width,height/design.height),ratio=window.devicePixelRatio||1;cv.width=Math.round(width*ratio);cv.height=Math.max(1,Math.round(height*ratio));const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.save();ctx.translate((cv.width-design.width*k*ratio)/2,(cv.height-design.height*k*ratio)/2);drawDesign(ctx,design,getImage,{scale:k*ratio,fontAvailable,cacheLayers:false});ctx.restore();},[design,width,version]);
 return <div class="dz-feed-image" style={{width}}><canvas ref={ref} style={{width,height:width*9/16}}/>{badge&&<span class="dz-duration">{formatDuration(project.value.duration)}</span>}{progress&&<span class="dz-feed-progress"/>}</div>;
}
export function FeedPreview(){const d=currentDesign.value,[theme,setTheme]=useState('dark'),[progress,setProgress]=useState(false);if(!d)return null;return <div class={`dz-feed-preview ${theme}`}><div class="dz-feed-controls"><Segmented value={theme} options={[{value:'dark',label:'Dark'},{value:'light',label:'Light'}]} onChange={setTheme}/><Row label="Progress bar"><Toggle checked={progress} onChange={setProgress}/></Row></div><div class="dz-feed-examples">{[360,246,168].map(width=><section key={width}><h3>{width} px</h3><DesignPreview design={d} width={width} badge progress={progress}/><b>{d.name}</b><p>Video preview · Your channel</p></section>)}<section class="dz-phone"><h3>Phone layout</h3><DesignPreview design={d} width={328} badge progress={progress}/><b>{d.name}</b><p>Your channel · Video preview</p><div class="dz-feed-placeholder"/><p>Another video</p></section></div><p class="hint">Generic feed sizes. Check the destination before publishing.</p></div>}
export function CompareDialog(){const d=currentDesign.value;if(!compareOpen.value||!d)return null;const list=designVariants(project.value.designs,d);return <Modal title="Compare Variants" width={1080} onClose={()=>compareOpen.value=false}><div class="dz-compare-grid">{list.map(v=><section key={v.id}><DesignPreview design={v}/><b>{v.name}</b>{v.favorite&&<p class="dz-favorite">Favorite</p>}<Row><Button onClick={()=>keepVariant(v.id)}>Keep this one</Button><Button onClick={()=>{openDesign(v.id);compareOpen.value=false}}>Edit</Button></Row></section>)}</div><p class="hint">Keep this one only marks a favorite. All variants remain editable.</p></Modal>}
