import { useEffect, useRef, useState } from 'preact/hooks';
import { Button, Row, Select, Modal, toast } from '../ui.jsx';
import { prefs } from '../prefs.js';
import { currentDesign, selectedLayers } from './store.js';
import { newDesign, newLayer } from '../../shared/design.js';
import { BUILTIN_DESIGN_STYLES, BUILTIN_DESIGN_TEMPLATES, applyDesignStyle, applyTemplate } from '../../shared/designTemplates.js';
import { drawDesign } from '../../shared/designRender.js';
import { imageVersion, loadDesignImages, getImage, getImageAtPath } from './assets.js';
import { fontAvailable, fontVersion } from './fonts.js';
import { brandLogo, chooseBrandLogo } from './brand.js';
import { savedStyles, storeStyles, styleDialog, templateDialog, userTemplates, saveStyle, openSaveStyle, applyStyle, createFromTemplate, templateContext, saveTemplate, openSaveTemplate, importTemplate, exportTemplate, refreshTemplates } from './library.js';

let demoImage;
function styleImage(){if(!demoImage){demoImage=new OffscreenCanvas(420,240);const c=demoImage.getContext('2d'),g=c.createLinearGradient(0,0,420,240);g.addColorStop(0,'#5e91d6');g.addColorStop(1,'#142b45');c.fillStyle=g;c.fillRect(0,0,420,240);c.fillStyle='#edbe66';c.beginPath();c.arc(285,110,65,0,Math.PI*2);c.fill();}return demoImage;}
function Preview({design}){
  const signature=JSON.stringify({...design,id:null,created:0,layers:design.layers.map(l=>({...l,id:null}))});
  const ref=useRef(null),version=`${imageVersion.value}:${fontVersion.value}`;
  useEffect(()=>{loadDesignImages(design);},[signature]);
  useEffect(()=>{const id=requestAnimationFrame(()=>{const cv=ref.current;if(!cv)return;const ctx=cv.getContext('2d');ctx.clearRect(0,0,216,122);const k=Math.min(216/design.width,122/design.height);ctx.save();ctx.translate((216-design.width*k)/2,(122-design.height*k)/2);drawDesign(ctx,design,l=>l.asset==='preview-logo'?getImageAtPath(brandLogo.value?.path):l._stylePreview&&!l.asset&&!l.media?styleImage():getImage(l),{scale:k,fontAvailable,cacheLayers:false});ctx.restore();});return()=>cancelAnimationFrame(id);},[signature,version,brandLogo.value]);
  return <canvas width={216} height={122} ref={ref}/>;
}
function PageButtons({page,setPage,count}){return count>24?<Row><Button class="small" disabled={!page} onClick={()=>setPage(page-1)}>Previous</Button><span>{page+1} / {Math.ceil(count/24)}</span><Button class="small" disabled={(page+1)*24>=count} onClick={()=>setPage(page+1)}>Next</Button></Row>:null;}
function stylePreview(style){const d=newDesign({width:480,height:270});d.background={type:'solid',color:'#292d3b',alpha:1};const source=style.type==='image'?templateContext().frame:null;const l=newLayer(style.type,{asset:source?.asset,media:source?.media,crop:source?.crop,_stylePreview:style.type==='image',fit:'contain',x:30,y:45,w:420,h:180,text:'A *better* title',shape:'rect',radius:24});d.layers=[applyDesignStyle(l,style,d.height)];return d;}
export function StylesPanel(){
  prefs.value;const [page,setPage]=useState(0),styles=savedStyles(),safePage=Math.min(page,Math.max(0,Math.ceil(styles.length/24)-1));
  const edit=async(e,s)=>{e.preventDefault();const action=await window.api.popupMenu([{id:'rename',label:'Rename Style…'},{id:'delete',label:'Delete Style'},{id:'update',label:'Update from Selection',enabled:selectedLayers().some(l=>l.type===s.type)}]);if(action==='delete')storeStyles(styles.filter(r=>r.id!==s.id));if(action==='rename')styleDialog.value={rename:s,name:s.name};if(action==='update'){const l=selectedLayers().find(l=>l.type===s.type);if(l){const {extractDesignStyle}=await import('../../shared/designTemplates.js');storeStyles(styles.map(r=>r.id===s.id?{...r,style:extractDesignStyle(l,currentDesign.value.height)}:r));}}};
  return <><Button disabled={!selectedLayers().length} onClick={openSaveStyle}>Save Style…</Button><h3 class="dz-library-heading">Text Styles</h3>{BUILTIN_DESIGN_STYLES.map(s=><button class="dz-library-card" key={s.id} title="Apply to selected text layers" onClick={()=>applyStyle(s)}><Preview design={stylePreview(s)}/><b>{s.name}</b></button>)}<h3 class="dz-library-heading">My Styles ({styles.length}/500)</h3>{!styles.length&&<p class="hint">Save a layer's appearance to reuse it in any project.</p>}{styles.slice(safePage*24,safePage*24+24).map(s=><button class="dz-library-card" key={s.id} onClick={()=>applyStyle(s)} onContextMenu={e=>edit(e,s)}><Preview design={stylePreview(s)}/><b>{s.name}</b><small>{s.type}</small></button>)}<PageButtons page={safePage} setPage={setPage} count={styles.length}/></>;
}
export function TemplatesPanel(){
  const [size,setSize]=useState('template'),[page,setPage]=useState(0);const context=templateContext(),users=userTemplates.value,safePage=Math.min(page,Math.max(0,Math.ceil(users.length/24)-1));
  const place=t=>createFromTemplate(t,size).catch(e=>toast(e.message,{kind:'error'}));
  const menu=async(e,t,user)=>{e.preventDefault();const action=await window.api.popupMenu([{id:'export',label:'Export Template…'},...(user?[{id:'delete',label:'Delete Template'}]:[])]);try{if(action==='export')await exportTemplate(t);if(action==='delete'){await window.api.removeDesignTemplate(t.id);await refreshTemplates();}}catch(e){toast(e.message,{kind:'error'});}};
  const card=(t,user=false)=><button class="dz-library-card" key={t.id} onClick={()=>place(t)} onContextMenu={e=>menu(e,t,user)}><Preview design={applyTemplate(t,context)}/><b>{t.name}</b></button>;
  return <><Row label="Size"><Select value={size} options={[{value:'template',label:'Template Size'},{value:'current',label:'Current Canvas'}]} onChange={setSize}/></Row><div class="dz-library-actions"><Button class="small" onClick={()=>importTemplate().catch(e=>toast(e.message,{kind:'error'}))}>Import Template…</Button><Button class="small" disabled={!currentDesign.value} onClick={openSaveTemplate}>Save as Template…</Button></div><div class="dz-brand-kit"><b>My Logo</b><Button class="small" onClick={()=>chooseBrandLogo().catch(e=>toast(e.message,{kind:'error'}))}>{brandLogo.value?'Replace Logo…':'Choose Logo…'}</Button>{brandLogo.value&&<small>{brandLogo.value.name}</small>}</div>{['16:9','9:16','1:1'].map(ratio=><section key={ratio}><h3 class="dz-library-heading">{ratio}</h3>{BUILTIN_DESIGN_TEMPLATES.filter(t=>t.ratio===ratio).map(t=>card(t))}</section>)}<h3 class="dz-library-heading">My Templates</h3>{users.slice(safePage*24,safePage*24+24).map(t=>card(t,true))}<PageButtons page={safePage} setPage={setPage} count={users.length}/></>;
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
