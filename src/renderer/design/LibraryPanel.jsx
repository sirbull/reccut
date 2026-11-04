import { useEffect, useRef, useState } from 'preact/hooks';
import { Plus, Upload } from 'lucide-preact';
import { LibrarySections } from './LibrarySection.jsx';
import { filterLibraryItems } from '../../shared/designLibrary.js';
import { Button, IconButton, Row, Select, Modal, toast } from '../ui.jsx';
import { prefs } from '../prefs.js';
import { currentDesign, selectedLayers } from './store.js';
import { uid } from '../../shared/model.js';
import { newDesign, newLayer } from '../../shared/design.js';
import { BUILTIN_DESIGN_STYLES, BUILTIN_DESIGN_TEMPLATES, applyDesignStyle, applyTemplate } from '../../shared/designTemplates.js';
import { drawDesign } from '../../shared/designRender.js';
import { imageVersion, loadDesignImages, getImage, getImageAtPath } from './assets.js';
import { fontAvailable, fontVersion } from './fonts.js';
import { brandLogo } from './brand.js';
import { openSuggestions } from './suggest.js';
import { savedStyles, storeStyles, styleDialog, templateDialog, userTemplates, saveStyle, openSaveStyle, applyStyle, createFromTemplate, templateContext, saveTemplate, openSaveTemplate, importTemplate, exportTemplate, refreshTemplates, selectedLibraryCard, clearLibraryPreview, previewStyle, previewTemplate, startLibraryDrag, endLibraryDrag } from './library.js';

let demoImage;
function styleImage(){if(!demoImage){demoImage=new OffscreenCanvas(420,240);const c=demoImage.getContext('2d'),g=c.createLinearGradient(0,0,420,240);g.addColorStop(0,'#5e91d6');g.addColorStop(1,'#142b45');c.fillStyle=g;c.fillRect(0,0,420,240);c.fillStyle='#edbe66';c.beginPath();c.arc(285,110,65,0,Math.PI*2);c.fill();}return demoImage;}
export function LibraryPreview({design}){
  const signature=JSON.stringify({...design,id:null,created:0,layers:design.layers.map(l=>({...l,id:null}))});
  const ref=useRef(null),version=`${imageVersion.value}:${fontVersion.value}`;
  useEffect(()=>{loadDesignImages(design);},[signature]);
  useEffect(()=>{const id=requestAnimationFrame(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');ctx.clearRect(0,0,216,122);const k=Math.min(216/design.width,122/design.height);ctx.save();ctx.translate((216-design.width*k)/2,(122-design.height*k)/2);drawDesign(ctx,design,l=>l.asset==='preview-logo'?getImageAtPath(brandLogo.value?.path):l._stylePreview&&!l.asset&&!l.media?styleImage():getImage(l),{scale:k,fontAvailable,cacheLayers:false});ctx.restore();});return()=>cancelAnimationFrame(id);},[signature,version,brandLogo.value]);
  return <canvas width={216} height={122} ref={ref}/>;
}
export function LibraryCard({id,picked,onPick,apply,preview,children,menuItems=[],onContextMenu,...rest}){
  const pending=useRef(false),[busy,setBusy]=useState(false);
  useEffect(()=>()=>clearLibraryPreview(),[]);
  const run=async(hit,point)=>{if(pending.current)return;pending.current=true;setBusy(true);clearLibraryPreview();try{await apply(hit,point);}catch(err){toast(err.message,{kind:'error'});}finally{pending.current=false;setBusy(false);}};
  const context=async e=>{e.preventDefault();if(onContextMenu){onContextMenu(e);return;}const action=await window.api.popupMenu([{id:'apply',label:'Apply'},...menuItems.map(item=>({id:item.id,label:item.label,enabled:item.enabled}))]);if(action==='apply')run();else{const item=menuItems.find(item=>item.id===action);if(item)try{await item.run()}catch(err){toast(err.message,{kind:'error'});}}};
  const active=picked??(selectedLibraryCard.value===id);
  return <button type="button" class={`dz-library-card${active?' active':''}${busy?' busy':''}`} aria-pressed={active} aria-busy={busy} disabled={busy} draggable={!busy} onClick={()=>{if(onPick)onPick();else selectedLibraryCard.value=id;}} onDblClick={()=>run()} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();run();}}} onMouseEnter={preview} onMouseLeave={clearLibraryPreview} onFocus={preview} onBlur={clearLibraryPreview} onDragStart={e=>startLibraryDrag(e,run)} onDragEnd={endLibraryDrag} onContextMenu={context} {...rest}>{children}{busy&&<span class="dz-card-busy">Applying…</span>}</button>;
}
function stylePreview(style){const d=newDesign({width:480,height:270});d.background={type:'solid',color:'#292d3b',alpha:1};const source=style.type==='image'?templateContext().frame:null;const l=newLayer(style.type,{asset:source?.asset,media:source?.media,crop:source?.crop,_stylePreview:style.type==='image',fit:'contain',x:30,y:45,w:420,h:180,text:'A *better* title',shape:'rect',radius:24});d.layers=[applyDesignStyle(l,style,d.height)];return d;}
export function StylesPanel({query=''}){
  prefs.value;const styles=savedStyles();
  const menu = (s,user) => user ? [
    {id:'rename',label:'Rename Style…',run:()=>{styleDialog.value={rename:s,name:s.name}}},
    {id:'delete',label:'Delete Style',run:()=>storeStyles(savedStyles().filter(r=>r.id!==s.id))},
    {id:'update',label:'Update from Selection',enabled:selectedLayers().some(l=>l.type===s.type),run:async()=>{
      const l=selectedLayers().find(l=>l.type===s.type);if(!l)return;
      const {extractDesignStyle}=await import('../../shared/designTemplates.js');
      storeStyles(savedStyles().map(r=>r.id===s.id?{...r,style:extractDesignStyle(l,currentDesign.value.height)}:r));
    }},
  ] : [{id:'save',label:'Save to My Styles',run:()=>{
    if(savedStyles().length>=500){toast('You can save up to 500 styles.');return;}
    storeStyles([...savedStyles(),{...structuredClone(s),id:uid(),name:`${s.name} copy`}]);
  }}];
  const styleCard=(s,user=false)=><LibraryCard key={s.id} id={`style:${s.id}`} apply={hit=>applyStyle(s,hit)} preview={()=>previewStyle(s)} title="Hover to preview. Double-click or press Enter to apply." menuItems={menu(s,user)}><LibraryPreview design={stylePreview(s)}/><b>{s.name}</b>{user&&<small>{s.type}</small>}</LibraryCard>;
  return <LibrarySections query={query} sections={[{id:'text-styles',title:'Text Styles',items:filterLibraryItems(BUILTIN_DESIGN_STYLES,query),render:s=>styleCard(s)},{id:'my-styles',title:`My Styles (${styles.length}/500)`,items:filterLibraryItems(styles,query),render:s=>styleCard(s,true),empty:"Save a layer's appearance to reuse it in any project.",actions:<IconButton icon={Plus} title="New Style" disabled={!selectedLayers().length} onClick={openSaveStyle}/>}]} />;
}
export function TemplatesPanel({query=''}){
  const [size,setSize]=useState('template');const context=templateContext(),users=userTemplates.value;
  const card=(t,user=false)=><LibraryCard key={t.id} id={`template:${t.id}`} apply={()=>createFromTemplate(t,size)} preview={()=>previewTemplate(t,size)} title="Hover to preview. Double-click or press Enter to create a design." menuItems={[{id:'export',label:'Export Template…',run:()=>exportTemplate(t)},...(user?[{id:'delete',label:'Delete Template',run:async()=>{await window.api.removeDesignTemplate(t.id);await refreshTemplates();}}]:[{id:'save',label:'Save to My Templates',run:async()=>{await window.api.saveDesignTemplate(t);await refreshTemplates();}}])]}><LibraryPreview design={applyTemplate(t,context)}/><b>{t.name}</b></LibraryCard>;
  const sections=['16:9','9:16','1:1'].map(ratio=>({id:ratio,title:ratio==='16:9'?'YouTube 16:9':ratio==='9:16'?'Shorts and Reels 9:16':'Square 1:1',items:filterLibraryItems(BUILTIN_DESIGN_TEMPLATES.filter(t=>t.ratio===ratio),query),render:t=>card(t)}));
  sections.push({id:'my-templates',title:'My Templates',items:filterLibraryItems(users,query),render:t=>card(t,true),empty:'Import a template or save the current design.',actions:<><IconButton icon={Upload} title="Import Template" onClick={()=>importTemplate().catch(e=>toast(e.message,{kind:'error'}))}/><IconButton icon={Plus} title="Save as Template" disabled={!currentDesign.value} onClick={openSaveTemplate}/></>});
  return <><Row label="Size"><Select value={size} options={[{value:'template',label:'Template Size'},{value:'current',label:'Current Canvas'}]} onChange={value=>{clearLibraryPreview();setSize(value)}}/></Row><Button class="small" onClick={openSuggestions}>Suggestions for This Video</Button><LibrarySections query={query} sections={sections}/></>;
}
function StyleName({request}){
  const [name,setName]=useState(request.name||'');
  const save=()=>{if(request.rename){if(storeStyles(savedStyles().map(s=>s.id===request.rename.id?{...s,name:name.trim()}:s)))styleDialog.value=null;}else saveStyle(name);};
  return <Modal title={request.rename?'Rename Style':'Save Style'} width={380} onClose={()=>{styleDialog.value=null;}} footer={<><Button onClick={()=>{styleDialog.value=null;}}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={save}>Save</Button></>}><Row label="Name" stacked><input class="text-input" value={name} autoFocus maxLength={160} onInput={e=>setName(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&name.trim())save();}}/></Row></Modal>;
}
function TemplateName({request}){
  const [name,setName]=useState(request.name||''),[roles,setRoles]=useState({}),[busy,setBusy]=useState(false);
  const save=async()=>{if(busy)return;setBusy(true);try{await saveTemplate(name,roles);}catch(e){toast(e.message,{kind:'error'});}finally{setBusy(false);}};
  return <Modal title="Save as Template" width={480} onClose={()=>{if(!busy)templateDialog.value=null;}} footer={<><Button disabled={busy} onClick={()=>{templateDialog.value=null;}}>Cancel</Button><Button variant="primary" disabled={!name.trim()||busy} onClick={save}>{busy?'Saving…':'Save'}</Button></>}><Row label="Name" stacked><input class="text-input" autoFocus value={name} onInput={e=>setName(e.currentTarget.value)}/></Row><p class="hint">Pictures become placeholders. New designs use your current frame, cutout and logo. Source files stay in this project.</p><div class="dz-import-layers">{request.design.layers.filter(l=>l.type==='image'||l.type==='text').map((l,i)=>{const value=roles[l.id]||l.placeholder||(l.type==='image'?(l.cutout?.enabled?'cutout':'frame'):request.design.layers.find(r=>r.type==='text')?.id===l.id?'title':'subtitle');return <Row key={l.id} label={l.name}><Select value={value} options={(l.type==='image'?['frame','cutout','logo']:['title','subtitle']).map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}))} onChange={value=>setRoles({...roles,[l.id]:value})}/></Row>;})}</div></Modal>;
}
export function DesignLibraryDialogs(){const s=styleDialog.value,t=templateDialog.value;return <>{s&&<StyleName key={s.rename?.id||s.layer.id} request={s}/>} {t&&<TemplateName key={t.design.id} request={t}/>}</>;}
