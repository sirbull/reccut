import { MOTION_BLUR_MODES, MOTION_BLUR_DEFAULTS, NATURAL_MOTION_BLUR_DEFAULTS } from '../../shared/motionBlur.js';
import { effectParams } from '../../shared/videoEffects.js';
import { vfxProp } from '../../shared/model.js';
import { Param } from './Inspector.jsx';
import { commit } from './store.js';
import { Row, Select, Toggle } from '../ui.jsx';
import { naturalMotionSupported } from '../../shared/motionBlurRender.js';

export function MotionBlurControls({clip,effect}) {
  const natural=effect.type==='naturalMotionBlur',p=effectParams(effect),defaults=natural?NATURAL_MOTION_BLUR_DEFAULTS:MOTION_BLUR_DEFAULTS;
  const param=(key,label,min,max,opts={})=><Param clip={clip} prop={vfxProp(effect.id,key)} label={label} min={min} max={max} def={defaults[key]} {...opts}/>;
  return <>
    {natural&&!naturalMotionSupported()&&<p class="hint">Natural Motion Blur is unavailable: enable hardware acceleration and restart Reccut. This effect needs WebGL2 with floating-point render targets; export will stop until it is available.</p>}
    {!natural&&<Row label="Variant"><Select value={p.mode} options={MOTION_BLUR_MODES} onChange={mode=>commit(q=>{q.clips[clip.id].props.vfx.find(e=>e.id===effect.id).p.mode=mode;})}/></Row>}
    {natural?param('amount','Amount',0,100,{scale:100,unit:'%'}):param('amount','Amount',0,300,{unit:p.mode==='directional'?'px':'%'})}
    {natural&&<>
      <Row label="Rolling shutter"><Toggle checked={p.rollingShutter===true} onChange={rollingShutter=>commit(q=>{q.clips[clip.id].props.vfx.find(e=>e.id===effect.id).p.rollingShutter=rollingShutter;})}/></Row>
      <p class="hint">Off uses a global shutter. On simulates a top-to-bottom sensor scan, adding motion-dependent skew. It does not repair rolling shutter already in the source.</p>
    </>}
    {!natural&&<>
      {p.mode==='directional'?param('angle','Angle',-180,180,{unit:'°',center:0}):<>
        {param('centerX','Center X',0,100,{scale:100,unit:'%'})}
        {param('centerY','Center Y',0,100,{scale:100,unit:'%'})}
      </>}
      {param('bias','Shutter bias',-100,100,{scale:100,unit:'%',center:0})}
    </>}
    <p class="hint">{natural?'Uses motion between neighbouring source frames. 50% simulates a 180° shutter; 100% simulates 360°. Best for sharp footage and rendered animation. Existing camera blur is not removed.':'Directional makes straight streaks; Zoom radiates from a center; Spin follows a circular path. Shutter bias shifts the trail toward either end.'}</p>
    <p class="hint">To keep a foreground subject sharp, draw a mask in Masks, set Applies to to this effect and enable Invert. Feather softens the boundary. The rest of the clip stays visible.</p>
  </>;
}
