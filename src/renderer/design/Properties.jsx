import { FlipHorizontal, FlipVertical, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, AlignLeft, AlignCenter, AlignRight, BookmarkPlus } from 'lucide-preact';
import { DesignFontSelect } from './FontSelect.jsx';
import { textSelection,selectedTextRange,rememberTextSelection,patchTextSelection } from './textSelection.js';
import { textStyleAt,replaceStyledText,TEXT_STYLE_FIELDS } from '../../shared/designRichText.js';
import { normalizeDesignPattern } from '../../shared/designPattern.js';
import { editLegacyPattern } from './content.js';
import { Row, Section, NumberField, Slider, Toggle, Select, Segmented, Button, IconButton } from '../ui.jsx';
import { solidFill, BLEND_MODES, DESIGN_SHAPES, selectionBounds, transformDesignLayers } from '../../shared/design.js';
import { currentDesign, selection, selectedLayers, changeDesign, changeLayers, groupSelection, alignSelection, distributeSelection, currentDesignId, newDesignOpen, beginDesignTransient, updateDesignTransient, endDesignTransient } from './store.js';
import { openSaveStyle, openSaveTemplate } from './library.js';
import { BrandColors } from './BrandColors.jsx';
import { backgroundJobs, removeBackground, cancelBackground } from './cutout.js';
import { refineSession, brushSettings, startRefine, stopRefine, navigateRefineHistory } from './refine.js';
import { maskEditing, fillTextWithImage } from './masks.js';
import { defaultDesignMask } from '../../shared/designMasks.js';
import { canvasCrop,canvasCropRatio,finishCanvasCrop } from './tools.js';
import { cropSession, setCropRatio, finishCrop, startCrop } from './crop.js';
import { CROP_RATIOS } from '../../shared/designCrop.js';
import { FillControls, StrokeControls, ShadowControls, StyleNumber } from './StyleControls.jsx';
import { fontAvailable, fontVersion } from './fonts.js';
import { imageMissing, imageVersion, locateImage } from './assets.js';

export function Properties() {
  const d = currentDesign.value, ids = selection.value;
  imageVersion.value; fontVersion.value;
  if (!d) return null;
  const canvasDraft=canvasCrop.value;
  if(canvasDraft)return <Section title="Crop Canvas" collapsible={false}><Row label="Aspect Ratio"><Select value={canvasDraft.ratio} options={CROP_RATIOS.filter(r=>r.value!=='design')} onChange={canvasCropRatio}/></Row><p class="hint">Drag handles to crop the canvas. Drag inside to move the crop. Original image sources stay intact. Enter applies; Escape cancels.</p><Row><Button onClick={()=>finishCanvasCrop(false)}>Cancel</Button><Button variant="primary" onClick={()=>finishCanvasCrop()}>Apply Canvas Crop</Button></Row></Section>;
  const crop = cropSession.value;
  if (crop) return <Section title="Crop" collapsible={false}>
    <Row label="Aspect Ratio"><Select value={crop.ratio} options={CROP_RATIOS} onChange={setCropRatio} /></Row>
    <p class="hint">Drag the image to reposition it. Drag the handles to crop. Enter applies and Escape cancels.</p>
    <Row><Button onClick={() => finishCrop(false)}>Cancel</Button><Button variant="primary" onClick={() => finishCrop()}>Apply Crop</Button></Row>
  </Section>;
  const refine = refineSession.value;
  if (refine) return <Section title="Refine Mask" collapsible={false}>
    <Row label="Brush"><Segmented value={brushSettings.value.mode} options={[{value:'erase',label:'Erase'},{value:'restore',label:'Restore'}]} onChange={(mode)=>{brushSettings.value={...brushSettings.value,mode};}} /></Row>
    <Row label="Size"><NumberField value={brushSettings.value.size} min={1} max={500} onChange={(size)=>{brushSettings.value={...brushSettings.value,size};}} /></Row>
    <Row label="Hardness"><Slider min={0} max={1} value={brushSettings.value.hardness} onInput={(hardness)=>{brushSettings.value={...brushSettings.value,hardness};}} /></Row>
    <p class="hint">Paint to erase or restore the mask. Each stroke is one undo step.</p>
    <Row><Button disabled={refine.busy} onClick={()=>navigateRefineHistory()}>Undo Stroke</Button><Button disabled={refine.busy} onClick={()=>navigateRefineHistory(true)}>Redo Stroke</Button></Row>
    <Button disabled={refine.busy} onClick={stopRefine}>{refine.busy?'Saving Mask…':'Done'}</Button>
  </Section>;
  const layers=selectedLayers(),original=layers[0],range=original&&selectedTextRange(original),l=range?{...original,...textStyleAt(original,range.start)}:original;
  const patch = (props) => changeLayers((l) => Object.assign(l,patchTextSelection(l,props)));
  const live = (props) => { const id = currentDesignId.value, editable = new Set(layers.map((l) => l.id)); updateDesignTransient((p) => { for (const l of p.designs[id]?.layers || []) if (editable.has(l.id) && !l.locked) Object.assign(l,patchTextSelection(l,props)); }); };
  const end = () => endDesignTransient();
  const grouped = layers.length > 1 && layers.every((a) => a.group && a.group === l.group);
  const bounds = grouped ? selectionBounds(layers) : null;
  const transform = (key, value, transient = true) => {
    const apply = (d) => {
      const replacements = new Map(transformDesignLayers(d.layers.filter((l) => ids.includes(l.id) && !l.locked), key, value).map((l) => [l.id, l]));
      d.layers = d.layers.map((l) => replacements.get(l.id) || l);
    };
    if (transient) updateDesignTransient((p) => { apply(p.designs[d.id]); }); else changeDesign(apply);
  };
  const number = (key, label, min = -65536, max = 65536, step = 1, precision = 0) => <Row label={label}><NumberField value={range&&TEXT_STYLE_FIELDS.includes(key)?l[key]:grouped && ['x','y','w','h'].includes(key) ? bounds[key] : layers.every((a) => a[key] === l[key]) || grouped && key === 'rotation' ? l[key] : null} min={min} max={max} step={step} precision={precision} width={90} onStart={beginDesignTransient} onChange={(v) => grouped && ['x','y','w','h','rotation'].includes(key) ? transform(key, v) : live({ [key]: v })} onCommit={end} /></Row>;
  if (!l) return <Section title="Design" collapsible={false}>
    {ids.length > 0 && <p class="hint">Unlock a selected layer to edit it.</p>}
    <Row label="Name" stacked><input key={d.id} class="text-input" value={d.name} onFocus={beginDesignTransient} onInput={(e) => { const name = e.currentTarget.value; updateDesignTransient((p) => { p.designs[d.id].name = name; }); }} onBlur={end} /></Row>
    <Row label="Canvas"><span>{d.width} × {d.height}</span><Button class="small" onClick={() => (newDesignOpen.value = { designId: d.id })}>Canvas Size…</Button></Row>
    <FillControls label="Background" value={d.background} aspect={d.width / d.height} onChange={(background) => changeDesign((d) => { d.background = background; })} onInput={(background) => updateDesignTransient((p) => { p.designs[d.id].background = background; })} />
    <Button onClick={openSaveTemplate}>Save as Template…</Button>
    <p class="hint">V selects the Move Tool, T the Type Tool, U the Shape Tool and C the Crop Tool. Drag handles to resize or rotate. Space and drag pans the canvas.</p>
  </Section>;
  const text = layers.every((l) => l.type === 'text'), image = layers.every((l) => l.type === 'image'), hasFill = layers.every((l) => l.type !== 'image');
  return <>
    {text&&<Section title="Character" collapsible={false} actions={<IconButton icon={BookmarkPlus} title="Save Style" onClick={openSaveStyle}/>}>
      {range&&<div class="dz-text-selection-note">Formatting selected text: “{l.text.slice(range.start,range.end)}” <button class="link" onClick={()=>textSelection.value=null}>Whole layer</button></div>}
      <Row label="Font Family" stacked><DesignFontSelect value={l.font} onChange={font=>patch({font})}/></Row>
      {!fontAvailable(l.font)&&<p class="warn">Font not installed: {l.font}</p>}
      <Row label="Weight"><Select value={String(l.weight)} options={[100,200,300,400,500,600,700,800,900].map(value=>({value:String(value),label:String(value)}))} onChange={value=>patch({weight:Number(value)})}/></Row>
      {number('size','Size',6,4096)}{number('tracking','Tracking',-100,500)}{number('lineHeight','Leading',.5,5,.05,2)}
      <Row label="All Caps"><Toggle checked={l.uppercase} onChange={uppercase=>patch({uppercase})}/></Row>
      <FillControls label="Text Color" value={l.fill} aspect={l.w/l.h} onChange={fill=>patch({fill})} onInput={fill=>live({fill})}/>
      <Row label="Content" stacked><textarea class="text-input" value={l.text} rows={3} onFocus={beginDesignTransient} onSelect={e=>rememberTextSelection(l,e.currentTarget)} onInput={e=>{const next=replaceStyledText(original,e.currentTarget.value);live({text:next.text,textStyles:next.textStyles});}} onBlur={end}/></Row>
      <p class="hint">Select words in Content or on the canvas to change their font, size, weight, tracking or color. Use Whole layer to format all text.</p>
      <Row label="Fit text in box"><Toggle checked={l.autofit} onChange={autofit=>patch({autofit})}/></Row>
    </Section>}
    {text&&<Section title="Paragraph"><Row label="Align"><Segmented value={l.align} options={[{value:'left',label:'Align Left',icon:AlignLeft},{value:'center',label:'Align Center',icon:AlignCenter},{value:'right',label:'Align Right',icon:AlignRight}]} onChange={align=>patch({align})}/></Row><Row label="Vertical"><Segmented value={l.valign} options={[{value:'top',label:'Align Top',icon:AlignStartHorizontal},{value:'middle',label:'Align Middle',icon:AlignCenterHorizontal},{value:'bottom',label:'Align Bottom',icon:AlignEndHorizontal}]} onChange={valign=>patch({valign})}/></Row></Section>}
    {l.pattern&&layers.length===1&&<Section title="Pattern" collapsible={false}>
      <FillControls label="Background" value={l.fill} aspect={l.w/l.h} onChange={fill=>patch({fill})} onInput={fill=>live({fill})}/><Row label="Pattern Color"><input type="color" aria-label="Pattern color" value={l.pattern.color} onFocus={beginDesignTransient} onInput={e=>live({pattern:normalizeDesignPattern({...l.pattern,color:e.currentTarget.value})})} onChangeCapture={end} onBlur={end}/></Row>
      <StyleNumber label={l.pattern.kind==='dots'?'Dot Radius':'Line Width'} value={l.pattern.size} min={.5} max={Math.min(l.pattern.spacingX,l.pattern.spacingY)/(l.pattern.kind==='dots'?2:1)} step={.5} precision={1} onInput={size=>live({pattern:normalizeDesignPattern({...l.pattern,size})})}/>
      <StyleNumber label="Spacing X" value={l.pattern.spacingX} min={4} max={1024} onInput={spacingX=>live({pattern:normalizeDesignPattern({...l.pattern,spacingX})})}/>
      <StyleNumber label="Spacing Y" value={l.pattern.spacingY} min={4} max={1024} onInput={spacingY=>live({pattern:normalizeDesignPattern({...l.pattern,spacingY})})}/>
    </Section>}
    {l.type==='image'&&['Dotted Texture','Grid Texture'].includes(l.name)&&<Section title="Pattern"><Button onClick={()=>editLegacyPattern(l)}>Make Pattern Editable</Button><p class="hint">Convert this texture to edit its colors, size and spacing. You can undo this.</p></Section>}
    <Section title={layers.length > 1 ? `${layers.length} selected layers` : l.name} collapsible={false} actions={!text&&<IconButton icon={BookmarkPlus} title="Save Style" onClick={openSaveStyle}/>}>
      {number('x', 'X')}{number('y', 'Y')}{number('w', 'Width', 1)}{number('h', 'Height', 1)}{number('rotation', 'Rotation', -36000, 36000, 1, 1)}
      <Row label="Flip"><IconButton icon={FlipHorizontal} title="Flip horizontally" active={l.flipX} onClick={() => grouped ? transform('flipX', true, false) : changeLayers((l) => { l.flipX = !l.flipX; })} /><IconButton icon={FlipVertical} title="Flip vertically" active={l.flipY} onClick={() => grouped ? transform('flipY', true, false) : changeLayers((l) => { l.flipY = !l.flipY; })} /></Row>
      <Row label="Opacity"><Slider min={0} max={1} value={l.opacity} onStart={beginDesignTransient} onInput={(opacity) => live({ opacity })} onCommit={end} /><span>{Math.round(l.opacity * 100)}%</span></Row>
      <Row label="Blend Mode"><Select value={l.blend} options={BLEND_MODES.map((value) => ({ value, label: value === 'source-over' ? 'Normal' : value.split('-').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ') }))} onChange={(blend) => patch({ blend })} /></Row>
    </Section>
    <Section title="Align and Distribute">
      <div class="dz-align">{[['left','Align Left',AlignStartVertical],['center','Align Center',AlignCenterVertical],['right','Align Right',AlignEndVertical],['top','Align Top',AlignStartHorizontal],['middle','Align Middle',AlignCenterHorizontal],['bottom','Align Bottom',AlignEndHorizontal]].map(([mode,label,icon])=><IconButton key={mode} icon={icon} title={label} onClick={()=>alignSelection(mode)}/>)}</div>
      <Row label="Distribute"><IconButton icon={AlignHorizontalDistributeCenter} title="Distribute Horizontally" disabled={layers.length<3} onClick={()=>distributeSelection('x')}/><IconButton icon={AlignVerticalDistributeCenter} title="Distribute Vertically" disabled={layers.length<3} onClick={()=>distributeSelection('y')}/></Row>
      <Row label="Group"><Button class="small" disabled={layers.length < 2} onClick={() => groupSelection()}>Group Layers</Button><Button class="small" disabled={!layers.some((l) => l.group)} onClick={() => groupSelection(true)}>Ungroup Layers</Button></Row>
    </Section>
    <Section title="Layer Mask">
      <Row label="Shape"><Select value={l.mask?.shape || 'none'} options={[{value:'none',label:'None'},{value:'rect',label:'Rectangle'},{value:'ellipse',label:'Ellipse'},{value:'polygon',label:'Polygon'}]} onChange={shape=>{patch({mask:shape==='none'?null:defaultDesignMask(shape)});maskEditing.value=shape==='none'?null:l.id;}} /></Row>
      {l.mask && <>
        <Button onClick={()=>{maskEditing.value=maskEditing.value===l.id?null:l.id;}}>{maskEditing.value===l.id?'Done Editing Mask':'Edit Mask'}</Button>
        <StyleNumber label="Feather" value={l.mask.feather} max={100} onInput={feather=>live({mask:{...l.mask,feather}})} />
        <Row label="Invert"><Toggle checked={l.mask.invert} onChange={invert=>patch({mask:{...l.mask,invert}})} /></Row>
      </>}
      <Row label="Clip to Layer Below"><Toggle checked={l.clip} onChange={clip=>patch({clip})} /></Row>
      {layers.length===2&&layers.some(l=>l.type==='text')&&layers.some(l=>l.type==='image')&&<Button onClick={fillTextWithImage}>Fill Text with Image</Button>}
    </Section>
    {layers.every(l=>['image','text'].includes(l.type)) && <Section title="Sticker Outline">
      <StyleNumber label="Size" value={l.outline?.width||0} onInput={width=>live({outline:{color:l.outline?.color||'#ffffff',width}})} />
      <BrandColors value={l.outline?.color||'#ffffff'} onChange={color=>patch({outline:{color,width:l.outline?.width||0}})} /><Row label="Color"><input type="color" aria-label="Sticker outline color" value={l.outline?.color||'#ffffff'} onFocus={beginDesignTransient} onInput={e=>live({outline:{width:l.outline?.width||0,color:e.currentTarget.value}})} onChangeCapture={end} onBlur={end} /></Row>
    </Section>}
    {hasFill&&!text&&!l.pattern && <Section title="Fill"><FillControls value={l.fill} aspect={l.w / l.h} onChange={(fill) => patch({ fill })} onInput={(fill) => live({ fill })} /></Section>}
    {hasFill && <Section title="Stroke"><StrokeControls layer={l} onChange={(stroke) => patch({ stroke })} onInput={(stroke) => live({ stroke })} /></Section>}
    <Section title="Layer Styles"><ShadowControls layer={l} onChange={(shadows) => patch({ shadows })} onInput={(shadows) => live({ shadows })} /></Section>
    {layers.every((l) => l.type === 'shape') && <Section title="Shape">
      <Row label="Shape"><Select value={l.shape} options={DESIGN_SHAPES} onChange={(shape) => patch({ shape, ...(['line','arrow'].includes(shape) ? { fill: null, stroke: l.stroke || { fill: solidFill(), width: 8, align: 'center', dash: 'solid', join: 'round' } } : {}) })} /></Row>
      {l.shape === 'rect' && number('radius', 'Corner Radius', 0, Math.min(l.w, l.h) / 2)}
      {l.shape === 'polygon' && number('sides', 'Sides', 3, 12)}
      {l.shape === 'star' && <>{number('points', 'Points', 3, 24)}{number('inner', 'Inner Radius', 0.05, 1, 0.01, 2)}</>}
      {l.shape === 'arrow' && number('head', 'Arrowhead', 0.1, 10, 0.1, 1)}
    </Section>}
    {text && <Section title="Text Effects">
      <FillControls label="Highlight" value={l.highlight} aspect={l.w / l.h} onChange={(highlight) => patch({ highlight })} onInput={(highlight) => live({ highlight })} />
      <Row label="Background Box"><Toggle checked={Boolean(l.box)} onChange={(v) => patch({ box: v ? { fill: solidFill('#000000'), padding: 8, radius: 8 } : null })} /></Row>
      {l.box && <>
        <FillControls label="Box Fill" value={l.box.fill} aspect={l.w / l.h} onChange={(fill) => patch({ box: { ...l.box, fill } })} onInput={(fill) => live({ box: { ...l.box, fill } })} />
        <StyleNumber label="Padding" value={l.box.padding} onInput={(padding) => live({ box: { ...l.box, padding } })} />
        <StyleNumber label="Corner Radius" value={l.box.radius} onInput={(radius) => live({ box: { ...l.box, radius } })} />
      </>}
    </Section>}
    {image && <Section title="Background Removal">
      {backgroundJobs.value[l.id] ? <><p class="hint">{backgroundJobs.value[l.id].stage} {Math.round(backgroundJobs.value[l.id].progress*100)}%</p><Button onClick={()=>cancelBackground(l.id)}>Cancel</Button></> : <Button onClick={()=>removeBackground(l.id)}>Remove Background</Button>}
      {l.cutout&&<>
        {imageMissing({asset:l.cutout.asset})&&<p class="warn">Cutout mask missing. Run Remove Background again to replace it.</p>}
        <Row label="Cutout"><Toggle checked={l.cutout.enabled} onChange={enabled=>patch({cutout:{...l.cutout,enabled}})} /></Row>
        <StyleNumber label="Feather" value={l.cutout.feather} max={50} onInput={feather=>live({cutout:{...l.cutout,feather}})} />
        <StyleNumber label="Edge Shift" value={l.cutout.shift} min={-20} max={20} onInput={shift=>live({cutout:{...l.cutout,shift}})} />
        <Button disabled={!l.cutout.enabled} onClick={startRefine}>Refine Mask…</Button>
      </>}
    </Section>}
    {image && <Section title="Image"><Button onClick={startCrop}>Crop…</Button><Row label="Fit"><Select value={l.fit} options={['cover','contain','stretch'].map((value) => ({ value, label: value }))} onChange={(fit) => patch({ fit })} /></Row><Button onClick={() => patch({ crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'contain' })}>Reset Crop</Button>{imageMissing(l) && <p class="warn">Missing image. <button class="link" onClick={() => locateImage(l)}>Relink…</button></p>}</Section>}
    {image && <Section title="Adjustments">
      {[['brightness','Brightness',-1,1,0.01],['contrast','Contrast',-1,1,0.01],['saturation','Saturation',-1,1,0.01],['hue','Hue',-180,180,1],['blur','Blur',0,500,1],['grayscale','Grayscale',0,1,0.01]].map(([key,label,min,max,step]) => <StyleNumber key={key} label={label} value={l.adjust[key]} min={min} max={max} step={step} precision={step < 1 ? 2 : 0} onInput={(value) => live({ adjust: { ...l.adjust, [key]: value } })} />)}
      <Button onClick={() => patch({ adjust: { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, grayscale: 0 } })}>Reset Adjustments</Button>
    </Section>}
  </>;
}
