import {useEffect,useRef,useState} from 'preact/hooks';
import {signal} from '@preact/signals';
import {AudioLines,Play,Square,ExternalLink,PanelLeftClose,X} from 'lucide-preact';
import {Button,IconButton,Row,Section,Toggle,Modal,toast} from '../ui.jsx';
import {fileUrl} from '../player.js';
import {StockVideoPreview} from './StockVideoPreview.jsx';
import {projectEpoch} from '../editor/store.js';
import {currentDesign,designCommit,openDesign,selection} from './store.js';
import {newDesign,newLayer,fitBox} from '../../shared/design.js';
import {ensureImage,designDir} from './assets.js';
import {uid} from '../../shared/model.js';
import {LibraryCard} from './LibraryPanel.jsx';
import {LibrarySections} from './LibrarySection.jsx';
import {clearLibraryPreview,createFromTemplate} from './library.js';
export const stockConfig=signal(null);
export const STOCK_KINDS={photo:'Photos',illustration:'Illustrations',vector:'Vectors',icon:'Icons',video:'Videos',music:'Music',sfx:'Sound Effects'};
const offers=kinds=>(kinds||[]).map(k=>STOCK_KINDS[k]).join(', ');
export async function refresh(patch){stockConfig.value=await window.api.stockSettings(patch);return stockConfig.value;}
const fail=e=>toast(e.message,{kind:'error'});
export function OnlineSettings({sourcesOnly=false}){
 const [keys,setKeys]=useState({}),[checks,setChecks]=useState({}),[busy,setBusy]=useState(''),[cost,setCost]=useState(null),[catalog,setCatalog]=useState('');const c=stockConfig.value;
 useEffect(()=>{refresh().then(c=>{setCatalog(c.catalog||'');if(sessionStorage.getItem('focus-image-sources')){sessionStorage.removeItem('focus-image-sources');requestAnimationFrame(()=>document.getElementById('image-source-settings')?.scrollIntoView({block:'start'}));}}).catch(fail)},[]);
 const run=async(id,fn)=>{setBusy(id);try{await fn();await refresh()}catch(e){fail(e)}finally{setBusy('')}};
 if(!c)return <p class="hint">Loading image sources…</p>;
 return <><Section id="image-source-settings" title="Stock Services" collapsible={false}><p class="hint">Add an optional stock service, get an API key from its website and save it here. Searches use your account and its limits. Keys stay on this computer and are never included when sharing a plugin or project.</p>{(c.availablePlugins||[]).filter(p=>!p.installed).map(p=><div class="dz-online-source" key={p.id}><b>{p.name}</b><p class="hint">{p.description} Offers {offers(p.kinds)}.</p><Row><Button disabled={busy===p.id} onClick={()=>run(p.id,()=>window.api.stockAddPlugin(p.id))}>Add {p.name}</Button><Button class="small" onClick={()=>window.api.openExternal(p.keyHelpUrl)}>Get API Key…</Button></Row></div>)}</Section><Section title="Online Resources" collapsible={false}><p class="hint">Search words are sent to the enabled stock services listed below. Images download into your project only when used. Turn this off to work entirely offline.</p><Row label="Online Resources"><Toggle checked={c.enabled!==false} onChange={enabled=>refresh({enabled}).catch(fail)}/></Row>{c.providers.map(p=><div class="dz-online-source" key={p.id}><div class="dz-online-source-heading"><b>{p.name}</b><small class="hint">{offers(p.kinds)}</small><span>{c.enabled===false?'Online resources off':!p.enabled?'Disabled':p.approvalRequired?'App approval required':p.signIn&&!p.signedIn?'Sign in to connect':p.requiresKey&&!p.hasKey?'API key needed':p.costsCredits&&!p.costAccepted?'Enable stock tools to connect':'Ready to search'}</span></div><Row label="Use this source"><Toggle checked={c.sources?.[p.id]!==false} onChange={enabled=>refresh({sources:{[p.id]:enabled}}).catch(fail)}/><Button class="small" onClick={()=>window.api.openExternal(p.homepage)}>Website</Button></Row>
 {p.signIn?<Row><Button disabled={busy===p.id} onClick={()=>run(p.id,()=>p.signedIn?window.api.stockSignOut(p.id):window.api.stockSignIn(p.id))}>{busy===p.id?'Waiting for browser…':p.signedIn?'Sign Out':'Sign In'}</Button>{busy===p.id&&<Button onClick={()=>window.api.stockSignOut(p.id)}>Cancel</Button>}</Row>:p.requiresKey?<><Row label={p.keyLabel} stacked><input class="text-input" aria-label={`${p.name} API key`} type="password" autoComplete="off" maxLength={2000} disabled={busy===p.id} value={keys[p.id]||''} placeholder={p.hasKey?'Key saved — enter to replace':'Paste your own API key'} onInput={e=>setKeys({...keys,[p.id]:e.currentTarget.value})}/><Button disabled={!keys[p.id]?.trim()||busy===p.id} onClick={()=>run(p.id,async()=>{await window.api.stockSaveKey(p.id,keys[p.id]);setKeys({...keys,[p.id]:''});setChecks({...checks,[p.id]:null})})}>{p.hasKey?'Replace Key':'Save Key'}</Button>{p.keyHelpUrl&&<Button class="small" onClick={()=>window.api.openExternal(p.keyHelpUrl)}>Get API Key…</Button>}</Row><Row><Button class="small" disabled={!p.ready||!p.enabled||busy===p.id||p.costsCredits&&!p.costAccepted} onClick={()=>run(p.id,async()=>{setChecks({...checks,[p.id]:null});const result=await window.api.stockTestConnection(p.id);setChecks({...checks,[p.id]:`Connection OK · ${result.count} sample results`})})}>{busy===p.id?'Working…':'Test Connection'}</Button>{p.hasKey&&<Button class="small" disabled={busy===p.id} onClick={()=>run(p.id,async()=>{await window.api.stockSaveKey(p.id,'');setChecks({...checks,[p.id]:null})})}>Remove Key</Button>}</Row>{checks[p.id]&&<p class="hint" role="status">{checks[p.id]}</p>}{p.approvalRequired&&<p class="hint">Pexels app approval is required before this source can connect. Your key can be saved now.</p>}{!p.hasKey&&<p class="hint">Not connected. Save your API key to use this source.</p>}</>:null}
 {(p.signIn?p.signedIn:p.hasKey||!p.requiresKey)&&p.costsCredits&&!p.costAccepted&&<Button onClick={()=>setCost(p.id)}>Enable stock tools…</Button>}{p.costsCredits&&<p class="hint">Stock tools use your account credits and plan limits. Your choice is kept until you sign out.</p>}{p.plugin&&<Row><Button class="small" onClick={()=>run(p.id,async()=>{const file=await window.api.saveFileDialog({title:'Export Image Source',defaultPath:p.id+'.json'});if(file)await window.api.writeText(file,JSON.stringify(await window.api.stockManifest(p.id),null,2))})}>Export Source…</Button><Button class="small" onClick={()=>run(p.id,()=>window.api.stockRemove(p.id))}>Remove</Button></Row>}</div>)}<p class="hint">Unsplash needs an approved confidential-key proxy and is not shipped with a desktop access key.</p><Button onClick={()=>run('import',async()=>{const file=await window.api.openFileDialog({title:'Import Image Source',filters:[{name:'JSON',extensions:['json']}]});if(file)await window.api.stockInstall(JSON.parse(await window.api.readText(file)))})}>Import Image Source…</Button><p class="hint">Keys/tokens use encrypted system storage when available; otherwise they stay in memory for this session.</p></Section>
 {!sourcesOnly&&<Section title="Online Template Catalog" collapsible={false}><p class="hint">Reccut's catalog is set up for new profiles. Find it in Design → Templates → More Templates. You can use another catalog address, or clear the address and save to turn it off.</p><input class="text-input" aria-label="Template catalog URL" placeholder="https://…/index.json" value={catalog} onInput={e=>setCatalog(e.currentTarget.value)}/><Button onClick={()=>refresh({catalog:catalog.trim()}).catch(fail)}>Save Catalog</Button></Section>}
 {cost&&<Modal title="Enable credit-using stock tools?" onClose={()=>setCost(null)} footer={<><Button onClick={()=>setCost(null)}>Cancel</Button><Button variant="primary" onClick={()=>run(cost,async()=>{await window.api.stockAcceptCosts(cost);setCost(null)})}>Enable Stock Tools</Button></>}><p>Search and downloads may consume your Magnific account credits. Your plan and the service determine the cost. Continue only if you want Reccut to use these stock tools. You can turn this off again with Sign Out.</p></Modal>}</>;
}
function StockImage({item,catalog=false}){
 const [url,setUrl]=useState('');useEffect(()=>{let alive=true;(catalog?window.api.stockCatalogPreview(item.id):window.api.stockPreview(item.token)).then(p=>{if(alive)setUrl(fileUrl(p))}).catch(()=>{});return()=>{alive=false}},[item.token,item.id]);
 return url?<img src={url} alt="" draggable={false}/>:<span class="dz-stock-loading">{item.providerName||'Template'}</span>;
}
async function placeStock(item,point){const epoch=projectEpoch.value,base=currentDesign.value,dir=await designDir(),result=await window.api.stockDownload(item.token,dir),image=await ensureImage(result.path);if(!image||epoch!==projectEpoch.value||base!==currentDesign.value)return;const d=base||newDesign({name:'Stock Design'}),id=uid(),box=fitBox(image.naturalWidth,image.naturalHeight,d.width*.9,d.height*.9),layer=newLayer('image',{name:result.name,asset:id,...box,x:(point?.x??d.width/2)-box.w/2,y:(point?.y??d.height/2)-box.h/2,fit:'contain'});clearLibraryPreview();designCommit(p=>{p.designAssets[id]={id,name:result.name,path:result.path,copied:true,origin:'placed',width:image.naturalWidth,height:image.naturalHeight,source:result.source};p.designs[d.id]={...d,layers:[...d.layers,layer]}});if(!base)openDesign(d.id);selection.value=[layer.id];}
export const DESIGN_STOCK_KINDS=['photo','illustration','vector','icon'];
// What a service still needs before it can search, or '' when it is ready.
function needs(p){if(!p.enabled)return'';if(p.approvalRequired)return'Waiting for app approval.';if(p.signIn&&!p.signedIn)return'Sign in to use it.';if(p.requiresKey&&!p.hasKey)return'Add your API key.';if(p.costsCredits&&!p.costAccepted)return'Enable its stock tools.';return'';}
export function StockServicesDialog({onClose}){return <Modal title="Stock Services" width={560} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}><OnlineSettings sourcesOnly/></Modal>;}
let audio=null,playingToken=signal('');
async function play(item){
 if(audio){audio.pause();audio=null;}if(playingToken.value===item.token){playingToken.value='';return;}
 playingToken.value=item.token;const file=await window.api.stockListen(item.token);if(playingToken.value!==item.token)return;
 audio=new Audio(fileUrl(file));audio.onended=()=>{playingToken.value='';};await audio.play();
}
export function stopStockAudio(){audio?.pause();audio=null;playingToken.value='';}
const seconds=ms=>{const s=Math.round(Number(ms)/1000);return s>0?` · ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:'';};
export const stockCredit=item=>`${item.author||'Unknown author'} / ${item.providerName} · ${item.license}`;
// A plain card for rooms without the Design library cards (Edit).
export function StockCard({item,actions}){
 const [busy,setBusy]=useState(false),playing=playingToken.value===item.token;
 const run=async fn=>{setBusy(true);try{await fn(item);}catch(e){fail(e);}finally{setBusy(false);}};
 return <div class="stock-card" title={`${item.title||STOCK_KINDS[item.kind]} · ${stockCredit(item)}`} onContextMenu={async e=>{e.preventDefault();const id=await window.api.popupMenu([...actions.map(a=>({id:a.label,label:a.label})),{separator:true},{id:'source',label:'View Source and License'}]);if(id==='source')window.api.openExternal(item.pageUrl||item.licenseUrl);else{const a=actions.find(a=>a.label===id);if(a)run(a.run);}}}>
  <>{item.media==='video'?<StockVideoPreview item={item}>{item.preview&&<StockImage item={item}/>}</StockVideoPreview>:<div class="stock-thumb">{item.preview?<StockImage item={item}/>:<AudioLines size={28}/>}{item.media==='audio'&&<button type="button" class="stock-play" title={playing?'Stop':'Listen'} aria-label={playing?'Stop':'Listen'} onClick={()=>play(item).catch(e=>{playingToken.value='';fail(e);})}>{playing?<Square size={14}/>:<Play size={14}/>}</button>}</div>}</>
  <b>{item.title||STOCK_KINDS[item.kind]}</b><small>{stockCredit(item)}{item.media==='audio'?seconds(item.durationMs):''}</small>
  <div class="stock-card-actions">{actions.map((a,i)=><Button key={a.label} class="small" variant={i?undefined:'primary'} disabled={busy} onClick={()=>run(a.run)}>{busy&&!i?'Downloading…':a.label}</Button>)}</div>
 </div>;
}
// Rooms whose Stock is popped out into its own window ('design', 'edit').
export const stockPopout=signal([]);
export const popOutStock=room=>{if(!stockPopout.value.includes(room))stockPopout.value=[...stockPopout.value,room];};
export const dockStock=room=>{stockPopout.value=stockPopout.value.filter(r=>r!==room);};
// Search, media type and service per room survive docking and popping out.
const memory={};
const searchMemory=(room,kinds)=>memory[room]||(memory[room]=signal({term:'',kind:kinds[0],provider:''}));
// Searches every connected service at once, for one kind of media at a time. `room` keys the memory.
export function StockBrowser({room,kinds,query,renderCard,grid='dz-library-grid'}){
 const mem=searchMemory(room,kinds),saved=mem.value;
 const own=query===undefined,term=own?saved.term:query,kind=kinds.includes(saved.kind)?saved.kind:kinds[0],provider=saved.provider;
 const [result,setResult]=useState({key:'',rows:[],more:false,failed:false,rate:false}),[request,setRequest]=useState({key:'',page:1}),[loading,setLoading]=useState(false),[online,setOnline]=useState(navigator.onLine),[revision,setRevision]=useState(0),[setup,setSetup]=useState(false);
 const remember=patch=>{mem.value={...mem.peek(),...patch};};
 const setTerm=term=>remember({term}),setKind=kind=>remember({kind}),setProvider=provider=>remember({provider});
 const c=stockConfig.value,q=term.trim(),providers=(c?.providers||[]).filter(p=>p.enabled&&p.kinds?.includes(kind)),ready=providers.filter(p=>!needs(p)),waiting=providers.filter(needs),addable=(c?.availablePlugins||[]).filter(p=>!p.installed&&!p.approvalRequired&&p.kinds?.includes(kind));
 // An unavailable selected service must never silently send the query to other services.
 const from=provider,popped=stockPopout.value.includes(room),selected=from?ready.filter(p=>p.id===from):ready;
 const key=JSON.stringify([q,kind,from]),page=request.key===key?request.page:1;
 const {rows,more,failed,rate}=result.key===key?result:{rows:[],more:false,failed:false,rate:false};
 const popout=()=>{
  const target=room==='design-search'?'design':room;
  searchMemory(target,kinds).value={term,kind,provider};
  popOutStock(target);
 };
 useEffect(()=>{refresh().catch(()=>{});const retry=()=>{setOnline(navigator.onLine);setRevision(v=>v+1)};window.addEventListener('online',retry);window.addEventListener('offline',retry);return()=>{window.removeEventListener('online',retry);window.removeEventListener('offline',retry);stopStockAudio();}},[]);
 useEffect(()=>{stopStockAudio();setRequest({key,page:1});},[key]);
 useEffect(()=>{
  let alive=true;
  if(!q||!online||!c||c.enabled===false||!selected.length){setLoading(false);return;}
  setLoading(true);
  const timer=setTimeout(async()=>{
   try{
    const r=await window.api.stockSearch({query:q,page,kind,provider:from||undefined});
    if(alive)setResult(old=>({key,rows:page===1||old.key!==key?r.items:[...old.rows,...r.items.filter(item=>!old.rows.some(row=>row.token===item.token))],more:r.more,failed:r.offline,rate:r.rateLimited}));
   }catch{if(alive)setResult(old=>({...old,key,rows:old.key===key?old.rows:[],more:false,failed:true,rate:false}));}
   finally{if(alive)setLoading(false);}
  },400);
  return()=>{alive=false;clearTimeout(timer);};
 },[key,page,online,c,revision]);
 const label=STOCK_KINDS[kind].toLowerCase();
 return <div class="stock-browser">
  <div class="stock-toolbar">{own&&<input class="text-input" type="search" aria-label="Search stock" placeholder={`Search ${label}`} value={term} onInput={e=>setTerm(e.currentTarget.value)}/>}<span class="spacer"/><Button class="small" onClick={()=>setSetup(true)}>{ready.length?'Services…':'Add Service…'}</Button>{room&&!popped&&<IconButton icon={ExternalLink} title="Open Stock in its own window" onClick={popout}/>}</div>
  <div class="stock-chips" role="tablist" aria-label="Media type">{kinds.map(k=><button type="button" role="tab" key={k} aria-selected={k===kind} class={k===kind?'active':''} onClick={()=>setKind(k)}>{STOCK_KINDS[k]}</button>)}</div>
  {c?.enabled!==false&&(providers.length>0||provider)&&<div class="stock-chips services" role="tablist" aria-label="Service">
   <button type="button" role="tab" aria-selected={!provider} class={!provider?'active':''} onClick={()=>setProvider('')}>All services</button>
   {providers.map(p=>{const need=needs(p);return <button type="button" role="tab" key={p.id} aria-selected={from===p.id} class={`${from===p.id?'active':''}${need?' waiting':''}`} title={need?`${p.name}: ${need} Click to connect.`:`Only ${p.name}`} onClick={()=>{setProvider(p.id);if(need)setSetup(true);}}>{p.name}</button>;})}
  </div>}
  {c?.enabled===false?<><p class="hint">Online resources are off, so stock services are not searched.</p><Button onClick={()=>refresh({enabled:true}).catch(fail)}>Turn On Online Resources</Button></>
  :!c?<p class="hint">Loading services…</p>
  :!selected.length?<div class="stock-empty"><p class="hint">{from?`${c.providers.find(p=>p.id===from)?.name||'The selected service'} is unavailable for ${label}. Select All services or connect this service.`:waiting.length?`${waiting.map(p=>`${p.name}: ${needs(p)}`).join(' ')}`:`No connected service offers ${label}.`}{addable.length?` ${addable.map(p=>p.name).join(' and ')} can.`:''}</p><Button variant="primary" onClick={()=>setSetup(true)}>{waiting.length?'Connect Service…':'Add Service…'}</Button></div>
  :<>
   {!online?<p class="hint">Reccut is offline. Go online to search stock.</p>
   :!q?<p class="hint">Search {label} from {selected.map(p=>p.name).join(', ')}. Credits travel with what you use.</p>
   :<>{loading&&<p class="hint">Searching…</p>}{rate&&<p class="hint">A service reached its request limit. Try again later.</p>}{failed&&!loading&&!rate&&<p class="hint">The services could not be reached. Check your connection and try again.</p>}{!loading&&!failed&&!rows.length&&<p class="hint">No {label} found for “{q}”.</p>}
    <div class={grid}>{rows.map(renderCard)}</div>
    {more&&<Button disabled={loading} onClick={()=>setRequest({key,page:page+1})}>More {STOCK_KINDS[kind]}</Button>}</>}
  </>}
  {setup&&<StockServicesDialog onClose={()=>{setSetup(false);refresh().catch(()=>{});}}/>}
 </div>;
}
// Shown in the panel while Stock is in its own window.
export function StockPoppedOut({room}){return <div class="stock-empty"><p class="hint">Stock is open in its own window.</p><Button onClick={()=>dockStock(room)}>Put Back in Panel</Button></div>;}
// A movable, resizable window centred over the app. It opens large; drag the title bar to move it.
export function StockWindow({room,children}){
 const fit=b=>{const w=Math.min(window.innerWidth,b.w),h=Math.min(window.innerHeight,b.h);return{w,h,x:Math.max(0,Math.min(window.innerWidth-w,b.x)),y:Math.max(0,Math.min(window.innerHeight-h,b.y))};};
 const [box,setBox]=useState(()=>{const w=Math.min(1100,window.innerWidth-40),h=Math.min(820,window.innerHeight-80);return{x:Math.round((window.innerWidth-w)/2),y:Math.round((window.innerHeight-h)/2),w,h};});
 const cleanup=useRef(null),root=useRef(null);
 useEffect(()=>{
  const previous=document.activeElement;root.current?.focus();
  const resize=()=>setBox(b=>fit(b));window.addEventListener('resize',resize);
  return()=>{cleanup.current?.();window.removeEventListener('resize',resize);if(previous?.isConnected)previous.focus();};
 },[]);
 const begin=(e,resizing=false)=>{
  if(e.button!==0||!resizing&&e.target.closest('button'))return;
  e.preventDefault();cleanup.current?.();
  const start={...box,x0:e.clientX,y0:e.clientY},pointer=e.pointerId;
  const move=ev=>{
   if(ev.pointerId!==pointer)return;
   const dx=ev.clientX-start.x0,dy=ev.clientY-start.y0;
   setBox(resizing?fit({...start,w:Math.max(360,start.w+dx),h:Math.max(300,start.h+dy)}):fit({...start,x:start.x+dx,y:start.y+dy}));
  };
  const up=ev=>{if(ev.pointerId===pointer)cleanup.current?.();};
  const cancel=()=>cleanup.current?.();
  try{e.currentTarget.setPointerCapture(pointer);}catch{}
  cleanup.current=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',cancel);cleanup.current=null;};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',cancel);
 };
 return <div ref={root} tabIndex={-1} class="stock-window" role="dialog" aria-label="Stock" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'&&!e.target.closest('.modal'))dockStock(room);}} style={{left:`${box.x}px`,top:`${box.y}px`,width:`${box.w}px`,height:`${box.h}px`}}>
  <header onPointerDown={e=>begin(e)}><b>Stock</b><span class="spacer"/><IconButton icon={PanelLeftClose} title="Put Back in Panel" onClick={()=>dockStock(room)}/><IconButton icon={X} title="Close" onClick={()=>dockStock(room)}/></header>
  <div class="stock-window-body">{children}</div>
  <button type="button" class="stock-window-resize" aria-label="Resize Stock window" title="Drag to resize, or use arrow keys" onPointerDown={e=>begin(e,true)} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?50:10;setBox(b=>fit({...b,w:Math.max(360,b.w+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0)),h:Math.max(300,b.h+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0))}));}}/>
 </div>;
}
const designStockCard=item=><LibraryCard key={item.token} id={`stock:${item.token}`} apply={(_,point)=>placeStock(item,point)} title={`${item.title||STOCK_KINDS[item.kind]} · ${stockCredit(item)}`} menuItems={[{id:'source',label:'View Source and License',run:()=>window.api.openExternal(item.pageUrl||item.licenseUrl)}]}><StockImage item={item}/><b>{item.title||item.providerName}</b><small>{stockCredit(item)}</small></LibraryCard>;
export function StockPanel(){return stockPopout.value.includes('design')?<StockPoppedOut room="design"/>:<StockBrowser room="design" kinds={DESIGN_STOCK_KINDS} renderCard={designStockCard}/>;}
// The panel and floating window share their search, media type and service.
export function DesignStockWindow(){return <StockWindow room="design"><StockBrowser room="design" kinds={DESIGN_STOCK_KINDS} renderCard={designStockCard}/></StockWindow>;}
export function StockSearchSection({query=''}){if(!query.trim()||stockConfig.value?.enabled===false)return null;if(stockPopout.value.includes('design'))return <StockPoppedOut room="design"/>;return <section class="dz-library-section"><header><h3>Stock</h3></header><StockBrowser room="design-search" query={query} kinds={DESIGN_STOCK_KINDS} renderCard={designStockCard}/></section>;}
export function MoreTemplates(){const [items,setItems]=useState([]);stockConfig.value;useEffect(()=>{let alive=true;window.api.stockCatalog().then(r=>{if(alive)setItems(r)}).catch(()=>{});return()=>{alive=false}},[stockConfig.value]);if(!items.length)return null;return <LibrarySections sections={[{id:'online-templates',title:'More Templates',items,render:item=><LibraryCard key={item.id} id={`catalog:${item.id}`} apply={async()=>{const epoch=projectEpoch.value,template=await window.api.stockCatalogFile(item.id);if(epoch===projectEpoch.value)await createFromTemplate(template)}}><StockImage item={item} catalog/><b>{item.name}</b></LibraryCard>}]}/>;}
